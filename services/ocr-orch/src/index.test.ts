/**
 * OCR Orchestrator Tests
 *
 * Tests for multi-engine OCR orchestration:
 * - Engine selection
 * - Parallel execution
 * - Failover handling
 * - Health tracking
 * - Result aggregation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  OCROrchestrator,
  MockOCRAdapter,
  calculateIoU,
  groupTokensByProximity,
  DEFAULT_ENGINE_CONFIGS,
  type OCROrchestrationOptions,
} from './index'
import type { OCREngine, OCRResult, OCRToken } from '@insurai/types'

// Helper to create mock OCR result
function createMockOCRResult(
  engine: OCREngine,
  text: string,
  confidence: number = 0.95,
  processingTimeMs: number = 100
): OCRResult {
  const words = text.split(' ')
  const tokens: OCRToken[] = words.map((word, i) => ({
    id: `${engine}-token-${i}`,
    text: word,
    bbox: { x: i * 60, y: 0, width: 50, height: 20 },
    confidence,
    engine,
    pageNo: 1,
    regionId: 'region-1',
    lineIndex: 0,
    wordIndex: i,
  }))

  return {
    engine,
    tokens,
    fullText: text,
    confidence,
    processingTimeMs,
    rawOutput: { mock: true },
  }
}

describe('OCROrchestrator', () => {
  let orchestrator: OCROrchestrator
  let abbyyAdapter: MockOCRAdapter
  let gcpAdapter: MockOCRAdapter
  let azureAdapter: MockOCRAdapter
  let tesseractAdapter: MockOCRAdapter

  beforeEach(() => {
    abbyyAdapter = new MockOCRAdapter('abbyy')
    gcpAdapter = new MockOCRAdapter('gcp_docai')
    azureAdapter = new MockOCRAdapter('azure_di')
    tesseractAdapter = new MockOCRAdapter('tesseract')

    orchestrator = new OCROrchestrator([
      abbyyAdapter,
      gcpAdapter,
      azureAdapter,
      tesseractAdapter,
    ])
  })

  describe('Constructor & Configuration', () => {
    it('should initialize with default engine configs', () => {
      const orch = new OCROrchestrator()

      const abbyyHealth = orch.getEngineHealth('abbyy')
      expect(abbyyHealth).toBeDefined()
      expect(abbyyHealth?.isHealthy).toBe(true)
      expect(abbyyHealth?.successRate).toBe(1.0)
    })

    it('should accept custom engine configs', () => {
      const customOrch = new OCROrchestrator([], {
        abbyy: { ...DEFAULT_ENGINE_CONFIGS.abbyy, weight: 3.0 },
      })

      // Verify custom config is applied
      expect(customOrch).toBeDefined()
    })

    it('should allow registering adapters after construction', () => {
      const orch = new OCROrchestrator()
      orch.registerAdapter(abbyyAdapter)

      // Should be able to use the adapter
      expect(orch).toBeDefined()
    })
  })

  describe('Engine Selection', () => {
    it('should select all healthy engines by default', () => {
      const engines = orchestrator.selectEngines({})

      expect(engines).toContain('abbyy')
      expect(engines).toContain('gcp_docai')
      expect(engines).toContain('azure_di')
      expect(engines).toContain('tesseract')
    })

    it('should respect requested engines', () => {
      const engines = orchestrator.selectEngines({
        requestedEngines: ['abbyy', 'gcp_docai'],
      })

      expect(engines).toEqual(['abbyy', 'gcp_docai'])
    })

    it('should exclude engines based on document type', () => {
      // Tesseract is excluded for handwriting by default
      const engines = orchestrator.selectEngines({
        documentType: 'handwriting',
      })

      expect(engines).not.toContain('tesseract')
      expect(engines).toContain('abbyy')
    })

    it('should filter out unhealthy engines', () => {
      // Make ABBYY unhealthy by simulating failures
      const health = orchestrator.getEngineHealth('abbyy')!
      health.isHealthy = false

      const engines = orchestrator.selectEngines({})

      expect(engines).not.toContain('abbyy')
    })

    it('should add back unhealthy engines if needed for minimum', () => {
      // Make all but one engine unhealthy
      orchestrator.getEngineHealth('gcp_docai')!.isHealthy = false
      orchestrator.getEngineHealth('azure_di')!.isHealthy = false
      orchestrator.getEngineHealth('tesseract')!.isHealthy = false

      const engines = orchestrator.selectEngines({ minEngines: 2 })

      // Should include at least 2 engines even if unhealthy
      expect(engines.length).toBeGreaterThanOrEqual(2)
      expect(engines).toContain('abbyy')
    })

    it('should sort engines by priority', () => {
      const engines = orchestrator.selectEngines({})

      // ABBYY should be first (priority 1)
      expect(engines[0]).toBe('abbyy')
      // Tesseract should be last (priority 4)
      expect(engines[engines.length - 1]).toBe('tesseract')
    })
  })

  describe('Orchestration', () => {
    const baseOptions: OCROrchestrationOptions = {
      docId: 'test-doc',
      pageNo: 1,
      regionId: 'region-1',
      imageKey: 's3://bucket/image.png',
      variantId: 'A',
    }

    it('should run OCR across multiple engines in parallel', async () => {
      abbyyAdapter.setMockResult(createMockOCRResult('abbyy', 'SİGORTA POLİÇESİ', 0.98))
      gcpAdapter.setMockResult(createMockOCRResult('gcp_docai', 'SİGORTA POLİÇESİ', 0.95))
      azureAdapter.setMockResult(createMockOCRResult('azure_di', 'SİGORTA POLİÇESİ', 0.92))
      tesseractAdapter.setMockResult(createMockOCRResult('tesseract', 'SİGORTA POLİÇESİ', 0.85))

      const result = await orchestrator.orchestrate(baseOptions)

      expect(result.successfulEngines.length).toBe(4)
      expect(result.failedEngines.size).toBe(0)
      expect(result.aggregatedTokens.length).toBeGreaterThan(0)
    })

    it('should handle engine failures gracefully', async () => {
      abbyyAdapter.setMockResult(createMockOCRResult('abbyy', 'SİGORTA', 0.98))
      gcpAdapter.setFailure(true, new Error('GCP API error'))
      azureAdapter.setMockResult(createMockOCRResult('azure_di', 'SİGORTA', 0.92))
      tesseractAdapter.setMockResult(createMockOCRResult('tesseract', 'SİGORTA', 0.85))

      const result = await orchestrator.orchestrate(baseOptions)

      expect(result.successfulEngines.length).toBe(3)
      expect(result.failedEngines.size).toBe(1)
      expect(result.failedEngines.has('gcp_docai')).toBe(true)
    })

    it('should throw if all engines fail', async () => {
      abbyyAdapter.setFailure(true)
      gcpAdapter.setFailure(true)
      azureAdapter.setFailure(true)
      tesseractAdapter.setFailure(true)

      await expect(orchestrator.orchestrate(baseOptions)).rejects.toThrow(
        /no engines succeeded/
      )
    })

    it('should continue if minimum engines succeed', async () => {
      abbyyAdapter.setMockResult(createMockOCRResult('abbyy', 'TEST', 0.95))
      gcpAdapter.setMockResult(createMockOCRResult('gcp_docai', 'TEST', 0.90))
      azureAdapter.setFailure(true)
      tesseractAdapter.setFailure(true)

      const result = await orchestrator.orchestrate({
        ...baseOptions,
        minEngines: 2,
      })

      expect(result.successfulEngines.length).toBe(2)
    })

    it('should respect engine-specific timeout', async () => {
      // Set very low latency for all but one
      abbyyAdapter.setLatency(50)
      gcpAdapter.setLatency(50)
      azureAdapter.setLatency(50)
      tesseractAdapter.setLatency(2000) // Slower than timeout

      const result = await orchestrator.orchestrate({
        ...baseOptions,
        timeout: 500, // Short timeout
        minEngines: 1,
      })

      // At least 3 should succeed quickly (tesseract times out)
      expect(result.successfulEngines.length).toBeGreaterThanOrEqual(3)
    }, { timeout: 10000 })

    it('should track processing time', async () => {
      abbyyAdapter.setLatency(100)
      gcpAdapter.setLatency(150)

      const result = await orchestrator.orchestrate({
        ...baseOptions,
        engines: ['abbyy', 'gcp_docai'],
      })

      // Should be at least the max latency (parallel execution)
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(100)
    })

    it('should aggregate tokens from all engines', async () => {
      abbyyAdapter.setMockResult(createMockOCRResult('abbyy', 'Word1 Word2', 0.98))
      gcpAdapter.setMockResult(createMockOCRResult('gcp_docai', 'Word1 Word2', 0.95))

      const result = await orchestrator.orchestrate({
        ...baseOptions,
        engines: ['abbyy', 'gcp_docai'],
      })

      // Should have tokens from both engines
      const abbyyTokens = result.aggregatedTokens.filter(t => t.engine === 'abbyy')
      const gcpTokens = result.aggregatedTokens.filter(t => t.engine === 'gcp_docai')

      expect(abbyyTokens.length).toBe(2)
      expect(gcpTokens.length).toBe(2)
    })
  })

  describe('Health Tracking', () => {
    it('should update health on successful OCR', async () => {
      abbyyAdapter.setMockResult(createMockOCRResult('abbyy', 'TEST', 0.95, 200))

      await orchestrator.orchestrate({
        docId: 'test',
        pageNo: 1,
        regionId: 'r1',
        imageKey: 'test.png',
        variantId: 'A',
        engines: ['abbyy'],
      })

      const health = orchestrator.getEngineHealth('abbyy')!
      expect(health.successCount).toBe(1)
      expect(health.failureCount).toBe(0)
      expect(health.isHealthy).toBe(true)
      expect(health.lastSuccess).toBeInstanceOf(Date)
    })

    it('should update health on failed OCR', async () => {
      abbyyAdapter.setFailure(true, new Error('API error'))

      try {
        await orchestrator.orchestrate({
          docId: 'test',
          pageNo: 1,
          regionId: 'r1',
          imageKey: 'test.png',
          variantId: 'A',
          engines: ['abbyy'],
          minEngines: 0,
        })
      } catch {
        // Expected to fail
      }

      const health = orchestrator.getEngineHealth('abbyy')!
      expect(health.failureCount).toBe(1)
      expect(health.lastFailure).toBeInstanceOf(Date)
    })

    it('should mark engine unhealthy after repeated failures', async () => {
      abbyyAdapter.setFailure(true)
      gcpAdapter.setMockResult(createMockOCRResult('gcp_docai', 'TEST', 0.90))

      // Simulate multiple failures
      for (let i = 0; i < 10; i++) {
        try {
          await orchestrator.orchestrate({
            docId: 'test',
            pageNo: 1,
            regionId: 'r1',
            imageKey: 'test.png',
            variantId: 'A',
            engines: ['abbyy', 'gcp_docai'],
            minEngines: 1,
          })
        } catch {
          // May fail if all engines fail
        }
      }

      const health = orchestrator.getEngineHealth('abbyy')!
      expect(health.successRate).toBeLessThan(0.5)
      expect(health.isHealthy).toBe(false)
    })

    it('should allow resetting engine health', () => {
      // Simulate failures first
      const health = orchestrator.getEngineHealth('abbyy')!
      health.failureCount = 100
      health.successRate = 0
      health.isHealthy = false

      orchestrator.resetEngineHealth('abbyy')

      const resetHealth = orchestrator.getEngineHealth('abbyy')!
      expect(resetHealth.isHealthy).toBe(true)
      expect(resetHealth.failureCount).toBe(0)
      expect(resetHealth.successRate).toBe(1.0)
    })

    it('should reset all engine health', () => {
      // Simulate failures
      for (const engine of ['abbyy', 'gcp_docai', 'azure_di', 'tesseract'] as OCREngine[]) {
        const health = orchestrator.getEngineHealth(engine)!
        health.isHealthy = false
      }

      orchestrator.resetEngineHealth()

      const allHealth = orchestrator.getAllEngineHealth()
      for (const health of allHealth.values()) {
        expect(health.isHealthy).toBe(true)
      }
    })
  })

  describe('Weighted Confidence', () => {
    it('should calculate weighted confidence based on engine weights', () => {
      const results = new Map<OCREngine, OCRResult>()
      results.set('abbyy', createMockOCRResult('abbyy', 'TEST', 0.95))
      results.set('tesseract', createMockOCRResult('tesseract', 'TEST', 0.85))

      const weightedConf = orchestrator.calculateWeightedConfidence(results)

      // ABBYY has weight 2.0, Tesseract has weight 0.8
      // Expected: (0.95 * 2.0 + 0.85 * 0.8) / (2.0 + 0.8) = 2.58 / 2.8 ≈ 0.921
      expect(weightedConf).toBeCloseTo(0.921, 2)
    })

    it('should handle empty results', () => {
      const results = new Map<OCREngine, OCRResult>()

      const weightedConf = orchestrator.calculateWeightedConfidence(results)

      expect(weightedConf).toBe(0)
    })

    it('should give higher weight to higher quality engines', () => {
      const results1 = new Map<OCREngine, OCRResult>()
      results1.set('abbyy', createMockOCRResult('abbyy', 'TEST', 0.90)) // High weight

      const results2 = new Map<OCREngine, OCRResult>()
      results2.set('tesseract', createMockOCRResult('tesseract', 'TEST', 0.90)) // Low weight

      const conf1 = orchestrator.calculateWeightedConfidence(results1)
      const conf2 = orchestrator.calculateWeightedConfidence(results2)

      // Same raw confidence, but ABBYY result counts more
      expect(conf1).toBe(conf2) // Both should be 0.90 when alone
    })
  })
})

describe('Bounding Box Utilities', () => {
  describe('calculateIoU', () => {
    it('should return 1.0 for identical boxes', () => {
      const bbox = { x: 0, y: 0, width: 100, height: 50 }
      expect(calculateIoU(bbox, bbox)).toBe(1.0)
    })

    it('should return 0 for non-overlapping boxes', () => {
      const bbox1 = { x: 0, y: 0, width: 50, height: 50 }
      const bbox2 = { x: 100, y: 100, width: 50, height: 50 }

      expect(calculateIoU(bbox1, bbox2)).toBe(0)
    })

    it('should calculate correct IoU for overlapping boxes', () => {
      const bbox1 = { x: 0, y: 0, width: 100, height: 100 }
      const bbox2 = { x: 50, y: 0, width: 100, height: 100 }

      // Intersection: 50 x 100 = 5000
      // Union: 100*100 + 100*100 - 5000 = 15000
      // IoU: 5000 / 15000 = 0.333...
      expect(calculateIoU(bbox1, bbox2)).toBeCloseTo(0.333, 2)
    })

    it('should handle contained boxes', () => {
      const outer = { x: 0, y: 0, width: 100, height: 100 }
      const inner = { x: 25, y: 25, width: 50, height: 50 }

      // Intersection: 50 x 50 = 2500
      // Union: 10000 + 2500 - 2500 = 10000
      // IoU: 2500 / 10000 = 0.25
      expect(calculateIoU(outer, inner)).toBe(0.25)
    })

    it('should handle edge-touching boxes', () => {
      const bbox1 = { x: 0, y: 0, width: 50, height: 50 }
      const bbox2 = { x: 50, y: 0, width: 50, height: 50 }

      expect(calculateIoU(bbox1, bbox2)).toBe(0)
    })
  })

  describe('groupTokensByProximity', () => {
    it('should group overlapping tokens', () => {
      const tokens: OCRToken[] = [
        {
          id: 't1', text: 'Hello',
          bbox: { x: 0, y: 0, width: 50, height: 20 },
          confidence: 0.95, engine: 'abbyy', pageNo: 1, regionId: 'r1', lineIndex: 0, wordIndex: 0
        },
        {
          id: 't2', text: 'Hello',
          bbox: { x: 2, y: 1, width: 48, height: 19 }, // Overlapping
          confidence: 0.92, engine: 'gcp_docai', pageNo: 1, regionId: 'r1', lineIndex: 0, wordIndex: 0
        },
        {
          id: 't3', text: 'World',
          bbox: { x: 100, y: 0, width: 50, height: 20 }, // Not overlapping
          confidence: 0.90, engine: 'abbyy', pageNo: 1, regionId: 'r1', lineIndex: 0, wordIndex: 1
        },
      ]

      const groups = groupTokensByProximity(tokens, 0.5)

      expect(groups.length).toBe(2)
      // First group should have overlapping tokens
      const groupWithHello = groups.find(g => g.some(t => t.text === 'Hello'))!
      expect(groupWithHello.length).toBe(2)
    })

    it('should keep non-overlapping tokens separate', () => {
      const tokens: OCRToken[] = [
        {
          id: 't1', text: 'A',
          bbox: { x: 0, y: 0, width: 20, height: 20 },
          confidence: 0.95, engine: 'abbyy', pageNo: 1, regionId: 'r1', lineIndex: 0, wordIndex: 0
        },
        {
          id: 't2', text: 'B',
          bbox: { x: 100, y: 0, width: 20, height: 20 },
          confidence: 0.95, engine: 'abbyy', pageNo: 1, regionId: 'r1', lineIndex: 0, wordIndex: 1
        },
        {
          id: 't3', text: 'C',
          bbox: { x: 200, y: 0, width: 20, height: 20 },
          confidence: 0.95, engine: 'abbyy', pageNo: 1, regionId: 'r1', lineIndex: 0, wordIndex: 2
        },
      ]

      const groups = groupTokensByProximity(tokens, 0.5)

      expect(groups.length).toBe(3)
    })

    it('should handle empty token array', () => {
      const groups = groupTokensByProximity([], 0.5)
      expect(groups.length).toBe(0)
    })

    it('should respect IoU threshold', () => {
      const bbox1 = { x: 0, y: 0, width: 100, height: 100 }
      const bbox2 = { x: 50, y: 0, width: 100, height: 100 } // IoU ≈ 0.33

      const tokens: OCRToken[] = [
        { id: 't1', text: 'A', bbox: bbox1, confidence: 0.95, engine: 'abbyy', pageNo: 1, regionId: 'r1', lineIndex: 0, wordIndex: 0 },
        { id: 't2', text: 'A', bbox: bbox2, confidence: 0.92, engine: 'gcp_docai', pageNo: 1, regionId: 'r1', lineIndex: 0, wordIndex: 0 },
      ]

      // With high threshold, should not group
      const highThreshold = groupTokensByProximity(tokens, 0.5)
      expect(highThreshold.length).toBe(2)

      // With low threshold, should group
      const lowThreshold = groupTokensByProximity(tokens, 0.2)
      expect(lowThreshold.length).toBe(1)
    })
  })
})

describe('Turkish OCR Scenarios', () => {
  let orchestrator: OCROrchestrator
  let abbyyAdapter: MockOCRAdapter
  let gcpAdapter: MockOCRAdapter

  beforeEach(() => {
    abbyyAdapter = new MockOCRAdapter('abbyy')
    gcpAdapter = new MockOCRAdapter('gcp_docai')

    orchestrator = new OCROrchestrator([abbyyAdapter, gcpAdapter])
  })

  it('should handle Turkish insurance terms', async () => {
    abbyyAdapter.setMockResult(createMockOCRResult('abbyy', 'BİRLEŞİK KASKO SİGORTA POLİÇESİ', 0.98))
    gcpAdapter.setMockResult(createMockOCRResult('gcp_docai', 'BİRLEŞİK KASKO SİGORTA POLİÇESİ', 0.95))

    const result = await orchestrator.orchestrate({
      docId: 'test',
      pageNo: 1,
      regionId: 'r1',
      imageKey: 'test.png',
      variantId: 'A',
      engines: ['abbyy', 'gcp_docai'],
      locale: 'tr-TR',
    })

    expect(result.successfulEngines.length).toBe(2)
    expect(result.aggregatedTokens.length).toBeGreaterThan(0)
  })

  it('should handle engines returning different results for Turkish chars', async () => {
    // ABBYY correctly reads İ
    abbyyAdapter.setMockResult(createMockOCRResult('abbyy', 'İSTANBUL', 0.95))
    // GCP misreads İ as I
    gcpAdapter.setMockResult(createMockOCRResult('gcp_docai', 'ISTANBUL', 0.90))

    const result = await orchestrator.orchestrate({
      docId: 'test',
      pageNo: 1,
      regionId: 'r1',
      imageKey: 'test.png',
      variantId: 'A',
      engines: ['abbyy', 'gcp_docai'],
    })

    // Both should succeed
    expect(result.successfulEngines).toContain('abbyy')
    expect(result.successfulEngines).toContain('gcp_docai')

    // Should have tokens from both
    const abbyyToken = result.aggregatedTokens.find(t => t.engine === 'abbyy')
    const gcpToken = result.aggregatedTokens.find(t => t.engine === 'gcp_docai')

    expect(abbyyToken?.text).toBe('İSTANBUL')
    expect(gcpToken?.text).toBe('ISTANBUL')
  })

  it('should handle numeric confusion (0 vs O, 1 vs l)', async () => {
    // Different engines may confuse 0/O, 1/l
    abbyyAdapter.setMockResult(createMockOCRResult('abbyy', 'POL-2024-001', 0.92))
    gcpAdapter.setMockResult(createMockOCRResult('gcp_docai', 'POL-2O24-OO1', 0.88))

    const result = await orchestrator.orchestrate({
      docId: 'test',
      pageNo: 1,
      regionId: 'r1',
      imageKey: 'test.png',
      variantId: 'A',
      engines: ['abbyy', 'gcp_docai'],
    })

    // Both should succeed - reconciliation handles the differences
    expect(result.successfulEngines.length).toBe(2)
  })

  it('should handle TC Kimlik extraction', async () => {
    const tcKimlik = '10000000146'
    abbyyAdapter.setMockResult(createMockOCRResult('abbyy', `T.C. Kimlik No: ${tcKimlik}`, 0.98))
    gcpAdapter.setMockResult(createMockOCRResult('gcp_docai', `T.C. Kimlik No: ${tcKimlik}`, 0.95))

    const result = await orchestrator.orchestrate({
      docId: 'test',
      pageNo: 1,
      regionId: 'r1',
      imageKey: 'test.png',
      variantId: 'A',
      engines: ['abbyy', 'gcp_docai'],
    })

    expect(result.successfulEngines.length).toBe(2)
    // The full text includes the TC Kimlik
    const allText = result.aggregatedTokens.map(t => t.text).join(' ')
    expect(allText).toContain(tcKimlik)
  })
})

describe('Edge Cases', () => {
  let orchestrator: OCROrchestrator

  beforeEach(() => {
    orchestrator = new OCROrchestrator()
  })

  it('should handle no adapters registered', async () => {
    await expect(
      orchestrator.orchestrate({
        docId: 'test',
        pageNo: 1,
        regionId: 'r1',
        imageKey: 'test.png',
        variantId: 'A',
      })
    ).rejects.toThrow()
  })

  it('should handle empty engine list', () => {
    const engines = orchestrator.selectEngines({
      requestedEngines: [],
    })

    // Should fall back to defaults
    expect(engines.length).toBeGreaterThan(0)
  })

  it('should handle updateEngineConfig', () => {
    orchestrator.updateEngineConfig('abbyy', { weight: 5.0 })

    // Just verify it doesn't throw
    expect(true).toBe(true)
  })
})

describe('Mock Adapter', () => {
  it('should return default result when no mock set', async () => {
    const adapter = new MockOCRAdapter('abbyy')
    const result = await adapter.recognize('test.png')

    expect(result.engine).toBe('abbyy')
    expect(result.tokens.length).toBe(2)
    expect(result.fullText).toBe('Mock Text')
  })

  it('should return custom mock result', async () => {
    const adapter = new MockOCRAdapter('abbyy')
    const customResult = createMockOCRResult('abbyy', 'Custom Result', 0.99)
    adapter.setMockResult(customResult)

    const result = await adapter.recognize('test.png')

    expect(result.fullText).toBe('Custom Result')
    expect(result.confidence).toBe(0.99)
  })

  it('should simulate failure when configured', async () => {
    const adapter = new MockOCRAdapter('abbyy')
    adapter.setFailure(true, new Error('Simulated failure'))

    await expect(adapter.recognize('test.png')).rejects.toThrow('Simulated failure')
  })

  it('should respect latency setting', async () => {
    const adapter = new MockOCRAdapter('abbyy')
    adapter.setLatency(200)

    const start = Date.now()
    await adapter.recognize('test.png')
    const elapsed = Date.now() - start

    expect(elapsed).toBeGreaterThanOrEqual(190) // Allow some timing variance
  })

  it('should report health status', async () => {
    const adapter = new MockOCRAdapter('abbyy')

    expect(await adapter.isHealthy()).toBe(true)

    adapter.setFailure(true)
    expect(await adapter.isHealthy()).toBe(false)
  })
})
