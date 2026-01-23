/**
 * OCR Orchestrator Service
 *
 * Coordinates multi-engine OCR processing:
 * - Engine selection based on document type and locale
 * - Parallel execution across engines
 * - Result aggregation
 * - Retry and failover logic
 * - Engine health monitoring
 */

import type {
  OCREngine,
  OCRResult,
  OCRToken,
  BoundingBox,
  PreprocessVariant,
} from '@insurai/types'

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

export interface OCRAdapter {
  engine: OCREngine
  recognize(imageKey: string, options?: Record<string, unknown>): Promise<OCRResult>
  isHealthy(): Promise<boolean>
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
// OCR ORCHESTRATOR CLASS
// ============================================================================

export class OCROrchestrator {
  private adapters: Map<OCREngine, OCRAdapter> = new Map()
  private engineConfigs: Map<OCREngine, EngineConfig> = new Map()
  private engineHealth: Map<OCREngine, EngineHealth> = new Map()
  private defaultEngines: OCREngine[] = ['abbyy', 'gcp_docai', 'azure_di', 'tesseract']
  private minEnginesRequired: number = 2

  constructor(
    adapters?: OCRAdapter[],
    configs?: Partial<Record<OCREngine, EngineConfig>>
  ) {
    // Initialize engine configs
    for (const [engine, config] of Object.entries(DEFAULT_ENGINE_CONFIGS)) {
      const mergedConfig = configs?.[engine as OCREngine]
        ? { ...config, ...configs[engine as OCREngine] }
        : config
      this.engineConfigs.set(engine as OCREngine, mergedConfig)
    }

    // Initialize adapters
    if (adapters) {
      for (const adapter of adapters) {
        this.adapters.set(adapter.engine, adapter)
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
   * Register an OCR adapter
   */
  registerAdapter(adapter: OCRAdapter): void {
    this.adapters.set(adapter.engine, adapter)
  }

  /**
   * Update engine configuration
   */
  updateEngineConfig(engine: OCREngine, config: Partial<EngineConfig>): void {
    const existing = this.engineConfigs.get(engine)
    if (existing) {
      this.engineConfigs.set(engine, { ...existing, ...config })
    }
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

    // Filter by document type exclusions
    if (documentType) {
      candidates = candidates.filter(engine => {
        const config = this.engineConfigs.get(engine)
        if (!config) return false

        // Check exclusions
        if (config.excludeForDocTypes?.includes(documentType)) {
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
      const unhealthyEngines = this.defaultEngines.filter(e => !candidates.includes(e))
      candidates = [...candidates, ...unhealthyEngines].slice(0, minEngines)
    }

    return candidates
  }

  /**
   * Run OCR across multiple engines
   */
  async orchestrate(options: OCROrchestrationOptions): Promise<OCROrchestrationResult> {
    const startTime = Date.now()
    const {
      docId,
      pageNo,
      regionId,
      imageKey,
      engines,
      timeout = 60000,
      minEngines = this.minEnginesRequired,
      locale,
      documentType,
    } = options

    // Select engines
    const selectedEngines = this.selectEngines({
      requestedEngines: engines,
      documentType,
      locale,
      minEngines,
    })

    if (selectedEngines.length === 0) {
      throw new Error('No OCR engines available')
    }

    // Run OCR in parallel with timeout
    const results = new Map<OCREngine, OCRResult>()
    const failedEngines = new Map<OCREngine, Error>()

    const promises = selectedEngines.map(async (engine) => {
      const adapter = this.adapters.get(engine)
      if (!adapter) {
        return { engine, error: new Error(`No adapter registered for ${engine}`) }
      }

      const config = this.engineConfigs.get(engine)
      const engineTimeout = config?.timeoutMs ?? timeout

      try {
        const result = await this.runWithTimeout(
          adapter.recognize(imageKey, { locale }),
          engineTimeout
        )
        return { engine, result }
      } catch (error) {
        return { engine, error: error as Error }
      }
    })

    const outcomes = await Promise.all(promises)

    // Process outcomes
    for (const outcome of outcomes) {
      if ('result' in outcome && outcome.result) {
        results.set(outcome.engine, outcome.result)
        this.recordSuccess(outcome.engine, outcome.result.processingTimeMs)
      } else if ('error' in outcome && outcome.error) {
        failedEngines.set(outcome.engine, outcome.error)
        this.recordFailure(outcome.engine, outcome.error)
      }
    }

    // Check if we have minimum results
    if (results.size < minEngines && results.size === 0) {
      throw new Error(`OCR failed: no engines succeeded (required: ${minEngines})`)
    }

    // Aggregate tokens
    const aggregatedTokens = this.aggregateTokens(results, docId, pageNo, regionId)

    return {
      docId,
      pageNo,
      regionId,
      results,
      failedEngines,
      successfulEngines: Array.from(results.keys()),
      aggregatedTokens,
      processingTimeMs: Date.now() - startTime,
      engineHealthSnapshot: new Map(this.engineHealth),
    }
  }

  /**
   * Aggregate tokens from multiple engines
   */
  private aggregateTokens(
    results: Map<OCREngine, OCRResult>,
    docId: string,
    pageNo: number,
    regionId: string
  ): OCRToken[] {
    const allTokens: OCRToken[] = []

    for (const [engine, result] of results) {
      for (const token of result.tokens) {
        allTokens.push({
          ...token,
          engine,
          pageNo,
          regionId,
        })
      }
    }

    return allTokens
  }

  /**
   * Run a promise with timeout
   */
  private async runWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
      ),
    ])
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
  private recordFailure(engine: OCREngine, error: Error): void {
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
   * Reset engine health (for testing or recovery)
   */
  resetEngineHealth(engine?: OCREngine): void {
    if (engine) {
      const health = this.engineHealth.get(engine)
      if (health) {
        health.isHealthy = true
        health.failureCount = 0
        health.successCount = 0
        health.successRate = 1.0
        health.lastSuccess = null
        health.lastFailure = null
      }
    } else {
      for (const health of this.engineHealth.values()) {
        health.isHealthy = true
        health.failureCount = 0
        health.successCount = 0
        health.successRate = 1.0
        health.lastSuccess = null
        health.lastFailure = null
      }
    }
  }

  /**
   * Get weighted confidence for combined results
   */
  calculateWeightedConfidence(results: Map<OCREngine, OCRResult>): number {
    let totalWeight = 0
    let weightedConfidence = 0

    for (const [engine, result] of results) {
      const config = this.engineConfigs.get(engine)
      const weight = config?.weight ?? 1.0

      totalWeight += weight
      weightedConfidence += result.confidence * weight
    }

    return totalWeight > 0 ? weightedConfidence / totalWeight : 0
  }
}

// ============================================================================
// MOCK ADAPTERS (for testing)
// ============================================================================

export class MockOCRAdapter implements OCRAdapter {
  engine: OCREngine
  private mockResult: OCRResult | null = null
  private shouldFail: boolean = false
  private failureError: Error = new Error('Mock failure')
  private latencyMs: number = 100

  constructor(engine: OCREngine) {
    this.engine = engine
  }

  setMockResult(result: OCRResult): void {
    this.mockResult = result
  }

  setFailure(shouldFail: boolean, error?: Error): void {
    this.shouldFail = shouldFail
    if (error) this.failureError = error
  }

  setLatency(ms: number): void {
    this.latencyMs = ms
  }

  async recognize(imageKey: string, options?: Record<string, unknown>): Promise<OCRResult> {
    await new Promise(resolve => setTimeout(resolve, this.latencyMs))

    if (this.shouldFail) {
      throw this.failureError
    }

    if (this.mockResult) {
      return this.mockResult
    }

    // Return default mock result
    return {
      engine: this.engine,
      tokens: [
        {
          id: `${this.engine}-token-1`,
          text: 'Mock',
          bbox: { x: 0, y: 0, width: 50, height: 20 },
          confidence: 0.95,
          engine: this.engine,
          pageNo: 1,
          regionId: 'region-1',
          lineIndex: 0,
          wordIndex: 0,
        },
        {
          id: `${this.engine}-token-2`,
          text: 'Text',
          bbox: { x: 60, y: 0, width: 50, height: 20 },
          confidence: 0.92,
          engine: this.engine,
          pageNo: 1,
          regionId: 'region-1',
          lineIndex: 0,
          wordIndex: 1,
        },
      ],
      fullText: 'Mock Text',
      confidence: 0.935,
      processingTimeMs: this.latencyMs,
      rawOutput: { mock: true },
    }
  }

  async isHealthy(): Promise<boolean> {
    return !this.shouldFail
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
// EXPORTS
// ============================================================================

export { OCROrchestrator as default }
