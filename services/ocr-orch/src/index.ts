/**
 * OCR Orchestrator Service
 *
 * Coordinates ensemble OCR across multiple engines:
 * - ABBYY FineReader Engine
 * - Google Cloud Document AI
 * - Azure Document Intelligence
 * - Tesseract (fallback)
 *
 * Features:
 * - Parallel OCR execution across engines
 * - Engine health monitoring
 * - Quick classification on first page
 * - Region-based OCR for targeted re-processing
 * - Retry with exponential backoff
 * - Cost optimization (use Tesseract for clear text)
 */

import type {
  OCREngine,
  OCRResult,
  OCRToken,
  BoundingBox,
  DocumentHints,
  PreprocessVariant,
} from '@insurai/types'

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  abbyy: {
    apiUrl: process.env.ABBYY_API_URL || 'https://cloud-westeurope.ocrsdk.com',
    applicationId: process.env.ABBYY_APP_ID || '',
    password: process.env.ABBYY_PASSWORD || '',
    enabled: !!process.env.ABBYY_APP_ID,
  },
  gcpDocAI: {
    projectId: process.env.GCP_PROJECT_ID || '',
    location: process.env.GCP_LOCATION || 'eu',
    processorId: process.env.GCP_DOCAI_PROCESSOR_ID || '',
    enabled: !!process.env.GCP_PROJECT_ID,
  },
  azureDI: {
    endpoint: process.env.AZURE_DI_ENDPOINT || '',
    apiKey: process.env.AZURE_DI_API_KEY || '',
    enabled: !!process.env.AZURE_DI_ENDPOINT,
  },
  tesseract: {
    enabled: true, // Always available as fallback
    languages: ['tur', 'eng', 'deu'],
  },
  storage: {
    endpoint: process.env.STORAGE_ENDPOINT || 'http://localhost:9000',
    bucket: process.env.OCR_BUCKET || 'ocr-images',
  },
}

// ============================================================================
// TYPES
// ============================================================================

export interface OCROrchestrationOptions {
  docId: string
  pageNo: number
  regionId: string
  imageKey: string
  variantId: PreprocessVariant
  engines?: OCREngine[]
  timeout?: number
  minEngines?: number
  locale?: string
  documentType?: string
}

export interface OCROrchestrationResult {
  docId: string
  pageNo: number
  regionId: string
  results: Map<OCREngine, OCRResult>
  failedEngines: Map<OCREngine, Error>
  successfulEngines: OCREngine[]
  aggregatedTokens: OCRToken[]
  processingTimeMs: number
  engineHealthSnapshot: Map<OCREngine, EngineHealth>
}

export interface EngineHealth {
  engine: OCREngine
  isHealthy: boolean
  lastSuccess: Date | null
  lastFailure: Date | null
  successRate: number
  avgLatencyMs: number
  failureCount: number
  successCount: number
}

export interface EngineConfig {
  engine: OCREngine
  weight: number
  priority: number
  timeoutMs: number
  retries: number
  requiredForDocTypes?: string[]
  excludeForDocTypes?: string[]
  minConfidenceThreshold: number
}

export interface OCRRequest {
  docId: string
  regions?: Array<{
    id: string
    pageNo: number
    type: string
    bbox?: BoundingBox
  }>
  engines: OCREngine[]
  variant: string // Preprocessing variant (e.g., 'original', 'binarized', 'deskewed')
}

export interface ClassifyRequest {
  docId: string
  hints?: DocumentHints
}

export interface ClassifyResponse {
  locale: string
  policyType: string | null
  confidence: number
}

// ============================================================================
// OCR ADAPTER INTERFACE
// ============================================================================

export interface OCRAdapter {
  name: OCREngine
  isAvailable(): boolean
  processImage(
    imageUrl: string,
    options: OCRAdapterOptions
  ): Promise<OCRAdapterResult>
}

export interface OCRAdapterOptions {
  languages?: string[]
  regionHint?: BoundingBox
  pageNo: number
  regionId: string
  variant: string
}

export interface OCRAdapterResult {
  tokens: OCRToken[]
  confidence: number
  processingTimeMs: number
  rawResponse?: unknown
}

// ============================================================================
// DEFAULT ENGINE CONFIGURATIONS
// ============================================================================

export const DEFAULT_ENGINE_CONFIGS: Record<OCREngine, EngineConfig> = {
  abbyy: {
    engine: 'abbyy',
    weight: 2.0,  // Highest quality
    priority: 1,
    timeoutMs: 30000,
    retries: 2,
    minConfidenceThreshold: 0.7,
  },
  gcp_docai: {
    engine: 'gcp_docai',
    weight: 1.5,
    priority: 2,
    timeoutMs: 25000,
    retries: 2,
    minConfidenceThreshold: 0.65,
  },
  azure_di: {
    engine: 'azure_di',
    weight: 1.3,
    priority: 3,
    timeoutMs: 25000,
    retries: 2,
    minConfidenceThreshold: 0.65,
  },
  tesseract: {
    engine: 'tesseract',
    weight: 0.8,  // Lower quality but always available
    priority: 4,
    timeoutMs: 60000,
    retries: 1,
    minConfidenceThreshold: 0.5,
    excludeForDocTypes: ['handwriting'],
  },
}

// ============================================================================
// ABBYY ADAPTER
// ============================================================================

class ABBYYAdapter implements OCRAdapter {
  name: OCREngine = 'abbyy'

  isAvailable(): boolean {
    return config.abbyy.enabled
  }

  async processImage(
    imageUrl: string,
    options: OCRAdapterOptions
  ): Promise<OCRAdapterResult> {
    const startTime = Date.now()

    // Download image from storage
    const imageBuffer = await this.fetchImage(imageUrl)

    // Submit to ABBYY Cloud OCR SDK
    const taskId = await this.submitTask(imageBuffer, options.languages)

    // Poll for completion
    const result = await this.waitForTask(taskId)

    // Parse ABBYY XML response to tokens
    const tokens = this.parseABBYYResponse(result, options)

    return {
      tokens,
      confidence: this.calculateAverageConfidence(tokens),
      processingTimeMs: Date.now() - startTime,
      rawResponse: result,
    }
  }

  private async fetchImage(imageUrl: string): Promise<Buffer> {
    const response = await fetch(imageUrl)
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`)
    }
    return Buffer.from(await response.arrayBuffer())
  }

  private async submitTask(imageBuffer: Buffer, languages?: string[]): Promise<string> {
    const url = new URL('/v2/processImage', config.abbyy.apiUrl)
    url.searchParams.set('language', this.mapLanguages(languages || ['Turkish']))
    url.searchParams.set('exportFormat', 'xml')
    url.searchParams.set('xml:writeRecognitionVariants', 'true')
    url.searchParams.set('xml:writeCharAttributes', 'true')

    const auth = Buffer.from(
      `${config.abbyy.applicationId}:${config.abbyy.password}`
    ).toString('base64')

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/octet-stream',
      },
      body: imageBuffer,
    })

    if (!response.ok) {
      throw new Error(`ABBYY submission failed: ${response.statusText}`)
    }

    const data = await response.json() as { taskId: string }
    return data.taskId
  }

  private async waitForTask(taskId: string, maxWaitMs = 60000): Promise<string> {
    const startTime = Date.now()
    const pollInterval = 2000

    while (Date.now() - startTime < maxWaitMs) {
      const url = new URL(`/v2/getTaskStatus`, config.abbyy.apiUrl)
      url.searchParams.set('taskId', taskId)

      const auth = Buffer.from(
        `${config.abbyy.applicationId}:${config.abbyy.password}`
      ).toString('base64')

      const response = await fetch(url.toString(), {
        headers: { Authorization: `Basic ${auth}` },
      })

      const status = await response.json() as {
        status: string
        resultUrl?: string
        error?: string
      }

      if (status.status === 'Completed' && status.resultUrl) {
        const resultResponse = await fetch(status.resultUrl)
        return resultResponse.text()
      }

      if (status.status === 'ProcessingFailed') {
        throw new Error(`ABBYY processing failed: ${status.error}`)
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    throw new Error('ABBYY task timeout')
  }

  private mapLanguages(languages: string[]): string {
    const langMap: Record<string, string> = {
      Turkish: 'Turkish',
      English: 'English',
      German: 'German',
      tur: 'Turkish',
      eng: 'English',
      deu: 'German',
    }
    return languages.map(l => langMap[l] || l).join(',')
  }

  private parseABBYYResponse(xml: string, options: OCRAdapterOptions): OCRToken[] {
    const tokens: OCRToken[] = []
    // Simple regex-based parsing for demo (production would use proper XML parser)
    const charBlockRegex = /<charParams[^>]*l="(\d+)"[^>]*t="(\d+)"[^>]*r="(\d+)"[^>]*b="(\d+)"[^>]*charConfidence="(\d+)"[^>]*>([^<]*)<\/charParams>/g

    let match
    let currentWord = ''
    let wordBbox = { x: Infinity, y: Infinity, width: 0, height: 0 }
    let wordConfidences: number[] = []
    let tokenIndex = 0

    while ((match = charBlockRegex.exec(xml)) !== null) {
      const [, l, t, r, b, conf, char] = match
      const charBbox = {
        x: parseInt(l),
        y: parseInt(t),
        width: parseInt(r) - parseInt(l),
        height: parseInt(b) - parseInt(t),
      }

      if (char.trim() === '' && currentWord) {
        // Word boundary
        tokens.push({
          id: `abbyy-${options.pageNo}-${tokenIndex++}`,
          text: currentWord,
          bbox: {
            x: wordBbox.x,
            y: wordBbox.y,
            width: wordBbox.width - wordBbox.x,
            height: wordBbox.height - wordBbox.y,
          },
          confidence: wordConfidences.reduce((a, b) => a + b, 0) / wordConfidences.length / 100,
          pageNo: options.pageNo,
          regionId: options.regionId,
          lineIndex: 0,
          wordIndex: tokenIndex,
        })
        currentWord = ''
        wordBbox = { x: Infinity, y: Infinity, width: 0, height: 0 }
        wordConfidences = []
      } else {
        currentWord += char
        wordBbox.x = Math.min(wordBbox.x, charBbox.x)
        wordBbox.y = Math.min(wordBbox.y, charBbox.y)
        wordBbox.width = Math.max(wordBbox.width, charBbox.x + charBbox.width)
        wordBbox.height = Math.max(wordBbox.height, charBbox.y + charBbox.height)
        wordConfidences.push(parseInt(conf))
      }
    }

    // Final word
    if (currentWord) {
      tokens.push({
        id: `abbyy-${options.pageNo}-${tokenIndex}`,
        text: currentWord,
        bbox: {
          x: wordBbox.x,
          y: wordBbox.y,
          width: wordBbox.width - wordBbox.x,
          height: wordBbox.height - wordBbox.y,
        },
        confidence: wordConfidences.reduce((a, b) => a + b, 0) / wordConfidences.length / 100,
        pageNo: options.pageNo,
        regionId: options.regionId,
        lineIndex: 0,
        wordIndex: tokenIndex,
      })
    }

    return tokens
  }

  private calculateAverageConfidence(tokens: OCRToken[]): number {
    if (tokens.length === 0) return 0
    return tokens.reduce((sum, t) => sum + t.confidence, 0) / tokens.length
  }
}

// ============================================================================
// GCP DOCUMENT AI ADAPTER
// ============================================================================

class GCPDocAIAdapter implements OCRAdapter {
  name: OCREngine = 'gcp_docai'

  isAvailable(): boolean {
    return config.gcpDocAI.enabled
  }

  async processImage(
    imageUrl: string,
    options: OCRAdapterOptions
  ): Promise<OCRAdapterResult> {
    const startTime = Date.now()

    // Download image
    const imageBuffer = await this.fetchImage(imageUrl)

    // Call Document AI
    const result = await this.callDocumentAI(imageBuffer)

    // Parse response
    const tokens = this.parseDocumentAIResponse(result, options)

    return {
      tokens,
      confidence: this.calculateAverageConfidence(tokens),
      processingTimeMs: Date.now() - startTime,
      rawResponse: result,
    }
  }

  private async fetchImage(imageUrl: string): Promise<Buffer> {
    const response = await fetch(imageUrl)
    return Buffer.from(await response.arrayBuffer())
  }

  private async callDocumentAI(imageBuffer: Buffer): Promise<DocumentAIResponse> {
    const endpoint = `https://${config.gcpDocAI.location}-documentai.googleapis.com`
    const processorPath = `projects/${config.gcpDocAI.projectId}/locations/${config.gcpDocAI.location}/processors/${config.gcpDocAI.processorId}`

    // In production, use google-auth-library for proper auth
    const response = await fetch(`${endpoint}/v1/${processorPath}:process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Authorization would come from google-auth-library
      },
      body: JSON.stringify({
        rawDocument: {
          content: imageBuffer.toString('base64'),
          mimeType: 'image/png',
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`GCP DocAI failed: ${response.statusText}`)
    }

    return response.json() as Promise<DocumentAIResponse>
  }

  private parseDocumentAIResponse(
    response: DocumentAIResponse,
    options: OCRAdapterOptions
  ): OCRToken[] {
    const tokens: OCRToken[] = []
    const document = response.document

    if (!document?.pages) return tokens

    for (const page of document.pages) {
      if (!page.tokens) continue

      for (let i = 0; i < page.tokens.length; i++) {
        const token = page.tokens[i]
        const bbox = this.extractBbox(token.layout?.boundingPoly)

        tokens.push({
          id: `gcp-${options.pageNo}-${i}`,
          text: this.extractText(document.text, token.layout?.textAnchor),
          bbox,
          confidence: token.layout?.confidence || 0,
          pageNo: options.pageNo,
          regionId: options.regionId,
          lineIndex: 0,
          wordIndex: i,
        })
      }
    }

    return tokens
  }

  private extractBbox(boundingPoly?: {
    normalizedVertices?: Array<{ x?: number; y?: number }>
  }): BoundingBox {
    if (!boundingPoly?.normalizedVertices?.length) {
      return { x: 0, y: 0, width: 0, height: 0 }
    }

    const vertices = boundingPoly.normalizedVertices
    const xs = vertices.map(v => (v.x || 0) * 1000) // Scale to pixel-like coords
    const ys = vertices.map(v => (v.y || 0) * 1000)

    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    }
  }

  private extractText(
    fullText: string | undefined,
    textAnchor?: { textSegments?: Array<{ startIndex?: string; endIndex?: string }> }
  ): string {
    if (!fullText || !textAnchor?.textSegments?.length) return ''

    return textAnchor.textSegments
      .map(seg => {
        const start = parseInt(seg.startIndex || '0')
        const end = parseInt(seg.endIndex || '0')
        return fullText.substring(start, end)
      })
      .join('')
  }

  private calculateAverageConfidence(tokens: OCRToken[]): number {
    if (tokens.length === 0) return 0
    return tokens.reduce((sum, t) => sum + t.confidence, 0) / tokens.length
  }
}

interface DocumentAIResponse {
  document: {
    text?: string
    pages?: Array<{
      tokens?: Array<{
        layout?: {
          textAnchor?: {
            textSegments?: Array<{ startIndex?: string; endIndex?: string }>
          }
          confidence?: number
          boundingPoly?: {
            normalizedVertices?: Array<{ x?: number; y?: number }>
          }
        }
      }>
    }>
  }
}

// ============================================================================
// AZURE DOCUMENT INTELLIGENCE ADAPTER
// ============================================================================

class AzureDIAdapter implements OCRAdapter {
  name: OCREngine = 'azure_di'

  isAvailable(): boolean {
    return config.azureDI.enabled
  }

  async processImage(
    imageUrl: string,
    options: OCRAdapterOptions
  ): Promise<OCRAdapterResult> {
    const startTime = Date.now()

    // Download image
    const imageBuffer = await this.fetchImage(imageUrl)

    // Start analysis
    const operationLocation = await this.startAnalysis(imageBuffer)

    // Poll for result
    const result = await this.pollForResult(operationLocation)

    // Parse response
    const tokens = this.parseAzureResponse(result, options)

    return {
      tokens,
      confidence: this.calculateAverageConfidence(tokens),
      processingTimeMs: Date.now() - startTime,
      rawResponse: result,
    }
  }

  private async fetchImage(imageUrl: string): Promise<Buffer> {
    const response = await fetch(imageUrl)
    return Buffer.from(await response.arrayBuffer())
  }

  private async startAnalysis(imageBuffer: Buffer): Promise<string> {
    const url = `${config.azureDI.endpoint}/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-02-29-preview`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': config.azureDI.apiKey,
        'Content-Type': 'application/octet-stream',
      },
      body: imageBuffer,
    })

    if (!response.ok) {
      throw new Error(`Azure DI analysis failed: ${response.statusText}`)
    }

    const operationLocation = response.headers.get('Operation-Location')
    if (!operationLocation) {
      throw new Error('Azure DI: No operation location returned')
    }

    return operationLocation
  }

  private async pollForResult(operationLocation: string, maxWaitMs = 60000): Promise<AzureAnalyzeResult> {
    const startTime = Date.now()
    const pollInterval = 2000

    while (Date.now() - startTime < maxWaitMs) {
      const response = await fetch(operationLocation, {
        headers: {
          'Ocp-Apim-Subscription-Key': config.azureDI.apiKey,
        },
      })

      const result = await response.json() as {
        status: string
        analyzeResult?: AzureAnalyzeResult
        error?: { message: string }
      }

      if (result.status === 'succeeded' && result.analyzeResult) {
        return result.analyzeResult
      }

      if (result.status === 'failed') {
        throw new Error(`Azure DI failed: ${result.error?.message}`)
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    throw new Error('Azure DI timeout')
  }

  private parseAzureResponse(
    result: AzureAnalyzeResult,
    options: OCRAdapterOptions
  ): OCRToken[] {
    const tokens: OCRToken[] = []

    if (!result.pages) return tokens

    for (const page of result.pages) {
      if (!page.words) continue

      for (let i = 0; i < page.words.length; i++) {
        const word = page.words[i]
        const bbox = this.extractBbox(word.polygon)

        tokens.push({
          id: `azure-${options.pageNo}-${i}`,
          text: word.content,
          bbox,
          confidence: word.confidence || 0,
          pageNo: options.pageNo,
          regionId: options.regionId,
          lineIndex: 0,
          wordIndex: i,
        })
      }
    }

    return tokens
  }

  private extractBbox(polygon?: number[]): BoundingBox {
    if (!polygon || polygon.length < 8) {
      return { x: 0, y: 0, width: 0, height: 0 }
    }

    // Azure returns polygon as [x1,y1,x2,y2,x3,y3,x4,y4]
    const xs = [polygon[0], polygon[2], polygon[4], polygon[6]]
    const ys = [polygon[1], polygon[3], polygon[5], polygon[7]]

    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    }
  }

  private calculateAverageConfidence(tokens: OCRToken[]): number {
    if (tokens.length === 0) return 0
    return tokens.reduce((sum, t) => sum + t.confidence, 0) / tokens.length
  }
}

interface AzureAnalyzeResult {
  pages?: Array<{
    words?: Array<{
      content: string
      polygon?: number[]
      confidence?: number
    }>
  }>
}

// ============================================================================
// TESSERACT ADAPTER (FALLBACK)
// ============================================================================

class TesseractAdapter implements OCRAdapter {
  name: OCREngine = 'tesseract'

  isAvailable(): boolean {
    return config.tesseract.enabled
  }

  async processImage(
    imageUrl: string,
    options: OCRAdapterOptions
  ): Promise<OCRAdapterResult> {
    const startTime = Date.now()

    // In production, use tesseract.js or call tesseract CLI
    // This is a simplified implementation
    const response = await fetch(imageUrl)
    const imageBuffer = Buffer.from(await response.arrayBuffer())

    // Mock tesseract processing (in production, integrate with tesseract.js)
    const tokens = await this.runTesseract(imageBuffer, options)

    return {
      tokens,
      confidence: this.calculateAverageConfidence(tokens),
      processingTimeMs: Date.now() - startTime,
    }
  }

  private async runTesseract(
    _imageBuffer: Buffer,
    options: OCRAdapterOptions
  ): Promise<OCRToken[]> {
    // In production, this would call tesseract.js or tesseract CLI
    // For now, return empty array as fallback indication
    console.log(`[Tesseract] Processing page ${options.pageNo}, region ${options.regionId}`)

    // This would be replaced with actual tesseract.js integration:
    // const worker = await createWorker('tur+eng+deu')
    // const { data } = await worker.recognize(imageBuffer)
    // return data.words.map(...)

    return []
  }

  private calculateAverageConfidence(tokens: OCRToken[]): number {
    if (tokens.length === 0) return 0
    return tokens.reduce((sum, t) => sum + t.confidence, 0) / tokens.length
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Calculate IoU (Intersection over Union) for two bounding boxes
 */
export function calculateIoU(bbox1: BoundingBox, bbox2: BoundingBox): number {
  const x1 = Math.max(bbox1.x, bbox2.x)
  const y1 = Math.max(bbox1.y, bbox2.y)
  const x2 = Math.min(bbox1.x + bbox1.width, bbox2.x + bbox2.width)
  const y2 = Math.min(bbox1.y + bbox1.height, bbox2.y + bbox2.height)

  if (x2 <= x1 || y2 <= y1) {
    return 0
  }

  const intersection = (x2 - x1) * (y2 - y1)
  const area1 = bbox1.width * bbox1.height
  const area2 = bbox2.width * bbox2.height
  const union = area1 + area2 - intersection

  return union > 0 ? intersection / union : 0
}

/**
 * Group tokens by bounding box proximity
 */
export function groupTokensByProximity(
  tokens: OCRToken[],
  iouThreshold: number = 0.5
): OCRToken[][] {
  const groups: OCRToken[][] = []
  const assigned = new Set<number>()

  for (let i = 0; i < tokens.length; i++) {
    if (assigned.has(i)) continue

    const group: OCRToken[] = [tokens[i]]
    assigned.add(i)

    for (let j = i + 1; j < tokens.length; j++) {
      if (assigned.has(j)) continue

      const iou = calculateIoU(tokens[i].bbox, tokens[j].bbox)
      if (iou >= iouThreshold) {
        group.push(tokens[j])
        assigned.add(j)
      }
    }

    groups.push(group)
  }

  return groups
}

// ============================================================================
// OCR ORCHESTRATOR
// ============================================================================

export class OCROrchestrator {
  private adapters: Map<OCREngine, OCRAdapter> = new Map()
  private engineConfigs: Map<OCREngine, EngineConfig> = new Map()
  private engineHealth: Map<OCREngine, EngineHealth> = new Map()
  private defaultEngines: OCREngine[] = ['abbyy', 'gcp_docai', 'azure_di', 'tesseract']
  private minEnginesRequired: number = 1

  constructor() {
    // Initialize engine configs
    for (const [engine, engineConfig] of Object.entries(DEFAULT_ENGINE_CONFIGS)) {
      this.engineConfigs.set(engine as OCREngine, engineConfig)
    }

    // Register all adapters
    const adapters: OCRAdapter[] = [
      new ABBYYAdapter(),
      new GCPDocAIAdapter(),
      new AzureDIAdapter(),
      new TesseractAdapter(),
    ]

    for (const adapter of adapters) {
      if (adapter.isAvailable()) {
        this.adapters.set(adapter.name, adapter)
        console.log(`[OCR] Registered adapter: ${adapter.name}`)
      }
    }

    // Initialize health tracking
    for (const engine of this.defaultEngines) {
      this.engineHealth.set(engine, {
        engine,
        isHealthy: true,
        lastSuccess: null,
        lastFailure: null,
        successRate: 1.0,
        avgLatencyMs: 0,
        failureCount: 0,
        successCount: 0,
      })
    }
  }

  /**
   * Get available OCR engines
   */
  getAvailableEngines(): OCREngine[] {
    return Array.from(this.adapters.keys())
  }

  /**
   * Select engines based on document type and locale
   */
  selectEngines(options: {
    requestedEngines?: OCREngine[]
    documentType?: string
    locale?: string
    minEngines?: number
  }): OCREngine[] {
    const { requestedEngines, documentType, minEngines = this.minEnginesRequired } = options

    let candidates: OCREngine[] = requestedEngines || this.defaultEngines

    // Filter by availability
    candidates = candidates.filter(engine => this.adapters.has(engine))

    // Filter by document type exclusions
    if (documentType) {
      candidates = candidates.filter(engine => {
        const engineConfig = this.engineConfigs.get(engine)
        if (!engineConfig) return false

        // Check exclusions
        if (engineConfig.excludeForDocTypes?.includes(documentType)) {
          return false
        }

        return true
      })
    }

    // Filter by health
    candidates = candidates.filter(engine => {
      const health = this.engineHealth.get(engine)
      return health?.isHealthy !== false
    })

    // Sort by priority
    candidates.sort((a, b) => {
      const configA = this.engineConfigs.get(a)
      const configB = this.engineConfigs.get(b)
      return (configA?.priority ?? 99) - (configB?.priority ?? 99)
    })

    // Ensure minimum engines
    if (candidates.length < minEngines) {
      // Add unhealthy engines back if needed
      const unhealthyEngines = this.defaultEngines.filter(e =>
        !candidates.includes(e) && this.adapters.has(e)
      )
      candidates = [...candidates, ...unhealthyEngines].slice(0, minEngines)
    }

    return candidates
  }

  /**
   * Run OCR across multiple engines in parallel
   */
  async runOCR(request: OCRRequest): Promise<OCRResult[]> {
    const results: OCRResult[] = []
    const { docId, regions, engines, variant } = request

    // Filter to available engines
    const availableEngines = this.selectEngines({ requestedEngines: engines })
    if (availableEngines.length === 0) {
      throw new Error('No available OCR engines configured')
    }

    // Process each region with each engine in parallel
    const tasks: Promise<OCRResult | null>[] = []

    for (const engine of availableEngines) {
      const adapter = this.adapters.get(engine)!

      for (const region of regions || [{ id: 'full', pageNo: 1, type: 'page' }]) {
        const imageUrl = this.getImageUrl(docId, region.pageNo, variant, region.bbox)

        tasks.push(
          this.processWithRetry(adapter, imageUrl, {
            languages: ['tur', 'eng'],
            regionHint: region.bbox,
            pageNo: region.pageNo,
            regionId: region.id,
            variant,
          }).then(result => {
            this.recordSuccess(engine, result.processingTimeMs)
            return result
          }).catch(error => {
            console.error(`[OCR] ${engine} failed for ${region.id}:`, error.message)
            this.recordFailure(engine, error)
            return null
          })
        )
      }
    }

    const taskResults = await Promise.all(tasks)

    // Aggregate results by engine
    const engineResults: Map<OCREngine, OCRToken[]> = new Map()

    for (const result of taskResults) {
      if (!result) continue

      const existing = engineResults.get(result.engine) || []
      existing.push(...result.tokens)
      engineResults.set(result.engine, existing)
    }

    // Convert to OCRResult array
    for (const [engine, tokens] of engineResults) {
      results.push({
        docId,
        engine,
        tokens,
        processingTimeMs: 0, // Aggregate time not tracked
        rawStorageKey: `ocr/${docId}/${engine}/raw.json`,
      })
    }

    return results
  }

  /**
   * Quick classification on first page
   */
  async classify(request: ClassifyRequest): Promise<ClassifyResponse> {
    const { docId, hints } = request

    // Use fastest available engine for classification
    const engine = this.selectFastestEngine()
    const adapter = this.adapters.get(engine)

    if (!adapter) {
      throw new Error('No OCR engine available for classification')
    }

    // OCR first page only
    const imageUrl = this.getImageUrl(docId, 1, 'original')
    const result = await adapter.processImage(imageUrl, {
      languages: ['tur', 'eng', 'deu'],
      pageNo: 1,
      regionId: 'classify',
      variant: 'original',
    })

    // Extract text for classification
    const text = result.tokens.map(t => t.text).join(' ')

    // Detect locale
    const locale = this.detectLocale(text, hints)

    // Detect policy type
    const policyType = this.detectPolicyType(text, hints)

    return {
      locale,
      policyType,
      confidence: result.confidence,
    }
  }

  private selectFastestEngine(): OCREngine {
    // Prefer tesseract for speed, then GCP, then Azure, then ABBYY
    const priority: OCREngine[] = ['tesseract', 'gcp_docai', 'azure_di', 'abbyy']
    for (const engine of priority) {
      if (this.adapters.has(engine)) {
        return engine
      }
    }
    throw new Error('No OCR engine available')
  }

  private async processWithRetry(
    adapter: OCRAdapter,
    imageUrl: string,
    options: OCRAdapterOptions,
    maxRetries = 3
  ): Promise<OCRResult> {
    let lastError: Error | null = null

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await adapter.processImage(imageUrl, options)
        return {
          docId: '', // Will be set by caller
          engine: adapter.name,
          tokens: result.tokens,
          processingTimeMs: result.processingTimeMs,
          rawStorageKey: '',
        }
      } catch (error) {
        lastError = error as Error
        const delay = Math.pow(2, attempt) * 1000 // Exponential backoff
        console.log(`[OCR] Retry ${attempt + 1}/${maxRetries} for ${adapter.name} in ${delay}ms`)
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    }

    throw lastError || new Error('OCR processing failed')
  }

  private getImageUrl(
    docId: string,
    pageNo: number,
    variant: string,
    bbox?: BoundingBox
  ): string {
    let url = `${config.storage.endpoint}/${config.storage.bucket}/${docId}/pages/${pageNo}/${variant}.png`
    if (bbox) {
      url += `?crop=${bbox.x},${bbox.y},${bbox.width},${bbox.height}`
    }
    return url
  }

  private detectLocale(text: string, hints?: DocumentHints): string {
    if (hints?.locale) return hints.locale

    // Turkish indicators
    const turkishPatterns = [
      /sigorta/i,
      /poliçe/i,
      /teminat/i,
      /\bTL\b/,
      /türk/i,
      /istanbul|ankara|izmir/i,
      /[ğüşöçıİĞÜŞÖÇ]/,
    ]

    // German indicators
    const germanPatterns = [
      /versicherung/i,
      /police/i,
      /\bEUR\b/,
      /deutschland|berlin|münchen/i,
      /[äöüßÄÖÜ]/,
    ]

    const turkishScore = turkishPatterns.filter(p => p.test(text)).length
    const germanScore = germanPatterns.filter(p => p.test(text)).length

    if (turkishScore > germanScore && turkishScore >= 2) return 'tr-TR'
    if (germanScore > turkishScore && germanScore >= 2) return 'de-DE'

    return 'en-GB' // Default
  }

  private detectPolicyType(text: string, hints?: DocumentHints): string | null {
    if (hints?.policyType) return hints.policyType

    const textLower = text.toLowerCase()

    // Kasko indicators
    if (/kasko|motor own damage|kaskoskydd/i.test(textLower)) {
      return 'motor_kasko'
    }

    // Traffic/MTPL indicators
    if (/trafik|mtpl|motor liability|haftpflicht/i.test(textLower)) {
      return 'motor_traffic'
    }

    // Property/Fire indicators
    if (/yangın|fire|brand|property|gebäude/i.test(textLower)) {
      return 'property_fire'
    }

    // DASK/Earthquake
    if (/dask|deprem|earthquake|erdbeben/i.test(textLower)) {
      return 'dask_earthquake'
    }

    return null
  }

  /**
   * Record successful OCR run
   */
  private recordSuccess(engine: OCREngine, latencyMs: number): void {
    const health = this.engineHealth.get(engine)
    if (!health) return

    health.successCount++
    health.lastSuccess = new Date()
    health.isHealthy = true

    // Update average latency
    const totalOps = health.successCount + health.failureCount
    health.avgLatencyMs = (health.avgLatencyMs * (totalOps - 1) + latencyMs) / totalOps

    // Update success rate
    health.successRate = health.successCount / totalOps
  }

  /**
   * Record failed OCR run
   */
  private recordFailure(engine: OCREngine, _error: Error): void {
    const health = this.engineHealth.get(engine)
    if (!health) return

    health.failureCount++
    health.lastFailure = new Date()

    // Update success rate
    const totalOps = health.successCount + health.failureCount
    health.successRate = health.successCount / totalOps

    // Mark unhealthy if too many failures
    if (health.successRate < 0.5 && totalOps >= 5) {
      health.isHealthy = false
    }
  }

  /**
   * Get engine health status
   */
  getEngineHealth(engine: OCREngine): EngineHealth | undefined {
    return this.engineHealth.get(engine)
  }

  /**
   * Get all engine health statuses
   */
  getAllEngineHealth(): Map<OCREngine, EngineHealth> {
    return new Map(this.engineHealth)
  }

  /**
   * Get weighted confidence for combined results
   */
  calculateWeightedConfidence(results: Map<OCREngine, OCRResult>): number {
    let totalWeight = 0
    let weightedConfidence = 0

    for (const [engine, result] of results) {
      const engineConfig = this.engineConfigs.get(engine)
      const weight = engineConfig?.weight ?? 1.0

      totalWeight += weight
      const avgConfidence = result.tokens.length > 0
        ? result.tokens.reduce((sum, t) => sum + t.confidence, 0) / result.tokens.length
        : 0
      weightedConfidence += avgConfidence * weight
    }

    return totalWeight > 0 ? weightedConfidence / totalWeight : 0
  }
}

// ============================================================================
// EXPRESS SERVER
// ============================================================================

import express from 'express'

const app = express()
app.use(express.json())

const orchestrator = new OCROrchestrator()

// Health check
app.get('/health', (_, res) => {
  res.json({
    status: 'healthy',
    availableEngines: orchestrator.getAvailableEngines(),
    engineHealth: Object.fromEntries(orchestrator.getAllEngineHealth()),
  })
})

// Run OCR
app.post('/ocr', async (req, res) => {
  try {
    const request = req.body as OCRRequest
    const results = await orchestrator.runOCR(request)
    res.json(results)
  } catch (error) {
    console.error('[OCR] Error:', error)
    res.status(500).json({ error: (error as Error).message })
  }
})

// Classify document
app.post('/classify', async (req, res) => {
  try {
    const request = req.body as ClassifyRequest
    const result = await orchestrator.classify(request)
    res.json(result)
  } catch (error) {
    console.error('[Classify] Error:', error)
    res.status(500).json({ error: (error as Error).message })
  }
})

// Available engines
app.get('/engines', (_, res) => {
  res.json({ engines: orchestrator.getAvailableEngines() })
})

// Engine health
app.get('/health/:engine', (req, res) => {
  const health = orchestrator.getEngineHealth(req.params.engine as OCREngine)
  if (!health) {
    res.status(404).json({ error: 'Engine not found' })
    return
  }
  res.json(health)
})

const PORT = process.env.PORT || 4006

app.listen(PORT, () => {
  console.log(`[OCR Orchestrator] Listening on port ${PORT}`)
  console.log(`[OCR Orchestrator] Available engines: ${orchestrator.getAvailableEngines().join(', ')}`)
})

export {
  OCROrchestrator,
  ABBYYAdapter,
  GCPDocAIAdapter,
  AzureDIAdapter,
  TesseractAdapter,
}
