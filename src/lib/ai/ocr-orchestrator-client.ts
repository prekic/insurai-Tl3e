/**
 * OCR Orchestrator Client
 *
 * Client for the OCR orchestrator microservice that provides
 * ensemble OCR across multiple engines (ABBYY, GCP, Azure, Tesseract).
 *
 * Falls back to direct Document AI when orchestrator is unavailable.
 */

import { getProxyUrl } from './config'
import type { OCRResult, FormField, Table } from './ocr'

// ============================================================================
// TYPES
// ============================================================================

export interface OrchestratorConfig {
  /** Base URL of the OCR orchestrator service */
  baseUrl: string
  /** Timeout for OCR requests in ms */
  timeout: number
  /** Minimum number of engines required for valid result */
  minEngines: number
  /** Preferred engines in order of priority */
  preferredEngines: OCREngine[]
}

export type OCREngine = 'abbyy' | 'gcp' | 'azure' | 'tesseract'

export interface OrchestratorHealthResponse {
  status: 'healthy' | 'degraded' | 'unhealthy'
  availableEngines: OCREngine[]
  engineHealth: Record<OCREngine, EngineHealth>
}

export interface EngineHealth {
  engine: OCREngine
  isHealthy: boolean
  lastSuccess: string | null
  lastFailure: string | null
  successRate: number
  avgLatencyMs: number
  failureCount: number
  successCount: number
}

export interface OrchestratorOCRRequest {
  docId: string
  documentBase64: string
  mimeType: string
  engines?: OCREngine[]
  variant?: string
  languageHints?: string[]
}

export interface OrchestratorOCRResponse {
  docId: string
  text: string
  confidence: number
  pageCount: number
  formFields?: FormField[]
  tables?: Table[]
  engineResults: Record<OCREngine, {
    success: boolean
    text?: string
    confidence?: number
    latencyMs: number
    error?: string
  }>
  bestEngine: OCREngine
  processingTimeMs: number
}

export interface ClassifyRequest {
  docId: string
  documentBase64: string
  mimeType: string
  hints?: {
    expectedLocale?: string
    expectedPolicyType?: string
  }
}

export interface ClassifyResponse {
  locale: string
  policyType: string | null
  confidence: number
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Get orchestrator configuration from environment
 */
function getOrchestratorConfig(): OrchestratorConfig {
  return {
    baseUrl: import.meta.env.VITE_OCR_ORCHESTRATOR_URL || 'http://localhost:4006',
    timeout: 120000, // 2 minutes for OCR
    minEngines: 1,
    preferredEngines: ['abbyy', 'gcp', 'azure', 'tesseract'],
  }
}

/**
 * Check if orchestrator is configured
 */
export function isOrchestratorConfigured(): boolean {
  return !!import.meta.env.VITE_OCR_ORCHESTRATOR_URL
}

// ============================================================================
// ORCHESTRATOR CLIENT
// ============================================================================

/**
 * OCR Orchestrator Client
 *
 * Provides multi-engine OCR through the orchestrator service.
 * Falls back to direct API when orchestrator is unavailable.
 */
export class OCROrchestratorClient {
  private config: OrchestratorConfig
  private healthCache: {
    data: OrchestratorHealthResponse | null
    timestamp: number
  } = { data: null, timestamp: 0 }
  private readonly HEALTH_CACHE_TTL = 30000 // 30 seconds

  constructor(config?: Partial<OrchestratorConfig>) {
    this.config = { ...getOrchestratorConfig(), ...config }
  }

  /**
   * Check if orchestrator service is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const health = await this.getHealth()
      return health.status !== 'unhealthy' && health.availableEngines.length > 0
    } catch {
      return false
    }
  }

  /**
   * Get orchestrator health status
   */
  async getHealth(): Promise<OrchestratorHealthResponse> {
    // Check cache
    if (
      this.healthCache.data &&
      Date.now() - this.healthCache.timestamp < this.HEALTH_CACHE_TTL
    ) {
      return this.healthCache.data
    }

    const response = await fetch(`${this.config.baseUrl}/health`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      throw new Error(`Orchestrator health check failed: ${response.status}`)
    }

    const health = await response.json() as OrchestratorHealthResponse

    // Update cache
    this.healthCache = { data: health, timestamp: Date.now() }

    return health
  }

  /**
   * Get available OCR engines
   */
  async getAvailableEngines(): Promise<OCREngine[]> {
    try {
      const health = await this.getHealth()
      return health.availableEngines
    } catch {
      return []
    }
  }

  /**
   * Run OCR through the orchestrator
   */
  async runOCR(
    documentBase64: string,
    mimeType: string,
    options: {
      engines?: OCREngine[]
      languageHints?: string[]
      docId?: string
    } = {}
  ): Promise<OrchestratorOCRResponse> {
    const request: OrchestratorOCRRequest = {
      docId: options.docId || crypto.randomUUID(),
      documentBase64,
      mimeType,
      engines: options.engines || this.config.preferredEngines,
      variant: 'original',
      languageHints: options.languageHints || ['tr', 'en'],
    }

    const response = await fetch(`${this.config.baseUrl}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(this.config.timeout),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new Error(
        (errorData as { error?: string }).error || `Orchestrator OCR failed: ${response.status}`
      )
    }

    return await response.json() as OrchestratorOCRResponse
  }

  /**
   * Classify document type and locale
   */
  async classify(
    documentBase64: string,
    mimeType: string,
    hints?: ClassifyRequest['hints']
  ): Promise<ClassifyResponse> {
    const request: ClassifyRequest = {
      docId: crypto.randomUUID(),
      documentBase64,
      mimeType,
      hints,
    }

    const response = await fetch(`${this.config.baseUrl}/classify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30000),
    })

    if (!response.ok) {
      throw new Error(`Classification failed: ${response.status}`)
    }

    return await response.json() as ClassifyResponse
  }
}

// ============================================================================
// UNIFIED OCR FUNCTION
// ============================================================================

/**
 * Perform OCR using the best available method:
 * 1. OCR Orchestrator (if available) - Multi-engine ensemble
 * 2. Direct Document AI via proxy - Single engine
 * 3. Direct Vision API - Fallback
 */
export async function performUnifiedOCR(
  file: File,
  options: {
    preferOrchestrator?: boolean
    engines?: OCREngine[]
    languageHints?: string[]
  } = {}
): Promise<{
  success: true
  data: OCRResult
  method: 'orchestrator' | 'document-ai' | 'vision-api'
  engineDetails?: OrchestratorOCRResponse['engineResults']
} | {
  success: false
  error: { code: string; message: string }
}> {
  const { preferOrchestrator = true, engines, languageHints = ['tr', 'en'] } = options

  // Convert file to base64
  const arrayBuffer = await file.arrayBuffer()
  const base64Content = btoa(
    new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
  )

  // Determine MIME type
  let mimeType = file.type || 'application/pdf'
  if (!mimeType || mimeType === 'application/octet-stream') {
    if (file.name.endsWith('.pdf')) mimeType = 'application/pdf'
    else if (file.name.endsWith('.png')) mimeType = 'image/png'
    else if (file.name.endsWith('.jpg') || file.name.endsWith('.jpeg')) mimeType = 'image/jpeg'
  }

  // Try orchestrator first if configured and preferred
  if (preferOrchestrator && isOrchestratorConfigured()) {
    try {
      const client = new OCROrchestratorClient()

      if (await client.isAvailable()) {
        const result = await client.runOCR(base64Content, mimeType, {
          engines,
          languageHints,
        })

        return {
          success: true,
          data: {
            text: result.text,
            confidence: result.confidence,
            pageCount: result.pageCount,
            isScanned: true,
            formFields: result.formFields,
            tables: result.tables,
            backend: 'document-ai', // Best engine used
            processingTimeMs: result.processingTimeMs,
          },
          method: 'orchestrator',
          engineDetails: result.engineResults,
        }
      }
    } catch (error) {
      console.warn('[OCR] Orchestrator failed, falling back to direct API:', error)
    }
  }

  // Fall back to direct Document AI via proxy
  const proxyUrl = getProxyUrl()
  if (proxyUrl) {
    try {
      const response = await fetch(`${proxyUrl}/api/ai/ocr/document-ai`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentBase64: base64Content,
          mimeType,
          languageHints,
        }),
      })

      if (response.ok) {
        const result = await response.json()

        if (result.success) {
          return {
            success: true,
            data: {
              text: result.data.text || '',
              confidence: result.data.confidence || 0,
              pageCount: result.data.pageCount || 1,
              isScanned: true,
              formFields: result.data.formFields,
              tables: result.data.tables,
              backend: 'document-ai',
              processingTimeMs: result.data.processingTimeMs,
            },
            method: 'document-ai',
          }
        }
      }
    } catch (error) {
      console.warn('[OCR] Document AI failed, falling back to Vision API:', error)
    }

    // Fall back to Vision API
    try {
      const response = await fetch(`${proxyUrl}/api/ai/ocr`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64Content }),
      })

      if (response.ok) {
        const result = await response.json()

        return {
          success: true,
          data: {
            text: result.data?.text || '',
            confidence: result.data?.confidence || 0,
            pageCount: result.data?.pageCount || 1,
            isScanned: true,
            backend: 'vision-api',
          },
          method: 'vision-api',
        }
      }
    } catch (error) {
      console.warn('[OCR] Vision API failed:', error)
    }
  }

  return {
    success: false,
    error: {
      code: 'OCR_UNAVAILABLE',
      message: 'No OCR service available. Configure orchestrator or proxy URL.',
    },
  }
}

// ============================================================================
// SINGLETON CLIENT
// ============================================================================

let orchestratorClient: OCROrchestratorClient | null = null

/**
 * Get the shared orchestrator client instance
 */
export function getOrchestratorClient(): OCROrchestratorClient {
  if (!orchestratorClient) {
    orchestratorClient = new OCROrchestratorClient()
  }
  return orchestratorClient
}
