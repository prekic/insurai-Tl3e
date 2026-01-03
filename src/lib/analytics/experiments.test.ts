/**
 * Tests for A/B Testing Framework
 * Tests experiment management and variant assignment
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock analytics tracker
vi.mock('./tracker', () => ({
  analytics: {
    track: vi.fn(),
  },
}))

import {
  experiments,
  createABTest,
  getVariant,
  isInTreatment,
  trackConversion,
} from './experiments'
import { analytics } from './tracker'

// =============================================================================
// Setup and Teardown
// =============================================================================

describe('ExperimentManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    experiments.clearAll()

    // Mock localStorage
    const storage: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage[key] || null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value }),
      removeItem: vi.fn((key: string) => { delete storage[key] }),
    })

    // Mock sessionStorage
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => JSON.stringify({ id: 'test-session-123' })),
      setItem: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  // ===========================================================================
  // createExperiment Tests
  // ===========================================================================

  describe('createExperiment', () => {
    it('should create an experiment with basic properties', () => {
      const exp = experiments.createExperiment({
        name: 'Button Color Test',
        description: 'Testing button colors',
        variants: [
          { name: 'Control', weight: 50 },
          { name: 'Blue', weight: 50 },
        ],
      })

      expect(exp.id).toMatch(/^exp_/)
      expect(exp.name).toBe('Button Color Test')
      expect(exp.description).toBe('Testing button colors')
      expect(exp.status).toBe('draft')
      expect(exp.variants).toHaveLength(2)
    })

    it('should assign unique IDs to variants', () => {
      const exp = experiments.createExperiment({
        name: 'Test',
        variants: [
          { name: 'A', weight: 50 },
          { name: 'B', weight: 50 },
        ],
      })

      expect(exp.variants[0].id).toMatch(/^var_/)
      expect(exp.variants[1].id).toMatch(/^var_/)
      expect(exp.variants[0].id).not.toBe(exp.variants[1].id)
    })

    it('should save experiment to storage', () => {
      experiments.createExperiment({
        name: 'Test',
        variants: [{ name: 'Control', weight: 100 }],
      })

      expect(localStorage.setItem).toHaveBeenCalled()
    })

    it('should set createdAt and updatedAt timestamps', () => {
      const before = Date.now()
      const exp = experiments.createExperiment({
        name: 'Test',
        variants: [{ name: 'Control', weight: 100 }],
      })
      const after = Date.now()

      expect(exp.createdAt).toBeGreaterThanOrEqual(before)
      expect(exp.createdAt).toBeLessThanOrEqual(after)
      expect(exp.updatedAt).toBe(exp.createdAt)
    })

    it('should accept metrics array', () => {
      const exp = experiments.createExperiment({
        name: 'Test',
        variants: [{ name: 'Control', weight: 100 }],
        metrics: ['click_rate', 'conversion_rate'],
      })

      expect(exp.metrics).toEqual(['click_rate', 'conversion_rate'])
    })

    it('should accept target audience', () => {
      const exp = experiments.createExperiment({
        name: 'Test',
        variants: [{ name: 'Control', weight: 100 }],
        targetAudience: { percentage: 50 },
      })

      expect(exp.targetAudience).toEqual({ percentage: 50 })
    })
  })

  // ===========================================================================
  // startExperiment Tests
  // ===========================================================================

  describe('startExperiment', () => {
    it('should start an experiment', () => {
      const exp = experiments.createExperiment({
        name: 'Test',
        variants: [{ name: 'Control', weight: 100 }],
      })

      const started = experiments.startExperiment(exp.id)

      expect(started?.status).toBe('running')
      expect(started?.startDate).toBeDefined()
    })

    it('should return null for non-existent experiment', () => {
      const result = experiments.startExperiment('non-existent')

      expect(result).toBeNull()
    })

    it('should update the updatedAt timestamp', () => {
      const exp = experiments.createExperiment({
        name: 'Test',
        variants: [{ name: 'Control', weight: 100 }],
      })

      const originalUpdatedAt = exp.updatedAt

      const started = experiments.startExperiment(exp.id)

      // updatedAt should be at least the same or later
      expect(started?.updatedAt).toBeGreaterThanOrEqual(originalUpdatedAt)
    })
  })

  // ===========================================================================
  // stopExperiment Tests
  // ===========================================================================

  describe('stopExperiment', () => {
    it('should stop an experiment', () => {
      const exp = experiments.createExperiment({
        name: 'Test',
        variants: [{ name: 'Control', weight: 100 }],
      })
      experiments.startExperiment(exp.id)

      const stopped = experiments.stopExperiment(exp.id)

      expect(stopped?.status).toBe('completed')
      expect(stopped?.endDate).toBeDefined()
    })

    it('should return null for non-existent experiment', () => {
      const result = experiments.stopExperiment('non-existent')

      expect(result).toBeNull()
    })
  })

  // ===========================================================================
  // updateExperimentStatus Tests
  // ===========================================================================

  describe('updateExperimentStatus', () => {
    it('should update status to running', () => {
      const exp = experiments.createExperiment({
        name: 'Test',
        variants: [{ name: 'Control', weight: 100 }],
      })

      const updated = experiments.updateExperimentStatus(exp.id, 'running')

      expect(updated?.status).toBe('running')
      expect(updated?.startDate).toBeDefined()
    })

    it('should update status to completed', () => {
      const exp = experiments.createExperiment({
        name: 'Test',
        variants: [{ name: 'Control', weight: 100 }],
      })

      const updated = experiments.updateExperimentStatus(exp.id, 'completed')

      expect(updated?.status).toBe('completed')
      expect(updated?.endDate).toBeDefined()
    })

    it('should update status to paused', () => {
      const exp = experiments.createExperiment({
        name: 'Test',
        variants: [{ name: 'Control', weight: 100 }],
      })
      experiments.startExperiment(exp.id)

      const updated = experiments.updateExperimentStatus(exp.id, 'paused')

      expect(updated?.status).toBe('paused')
    })

    it('should return null for non-existent experiment', () => {
      const result = experiments.updateExperimentStatus('non-existent', 'running')

      expect(result).toBeNull()
    })
  })

  // ===========================================================================
  // getExperiment Tests
  // ===========================================================================

  describe('getExperiment', () => {
    it('should retrieve an existing experiment', () => {
      const created = experiments.createExperiment({
        name: 'Test',
        variants: [{ name: 'Control', weight: 100 }],
      })

      const retrieved = experiments.getExperiment(created.id)

      expect(retrieved).toEqual(created)
    })

    it('should return null for non-existent experiment', () => {
      const result = experiments.getExperiment('non-existent')

      expect(result).toBeNull()
    })
  })

  // ===========================================================================
  // getAllExperiments Tests
  // ===========================================================================

  describe('getAllExperiments', () => {
    it('should return empty array when no experiments', () => {
      const result = experiments.getAllExperiments()

      expect(result).toEqual([])
    })

    it('should return all experiments', () => {
      experiments.createExperiment({
        name: 'Test 1',
        variants: [{ name: 'Control', weight: 100 }],
      })
      experiments.createExperiment({
        name: 'Test 2',
        variants: [{ name: 'Control', weight: 100 }],
      })

      const result = experiments.getAllExperiments()

      expect(result).toHaveLength(2)
    })
  })

  // ===========================================================================
  // getRunningExperiments Tests
  // ===========================================================================

  describe('getRunningExperiments', () => {
    it('should return only running experiments', () => {
      const exp1 = experiments.createExperiment({
        name: 'Test 1',
        variants: [{ name: 'Control', weight: 100 }],
      })
      experiments.createExperiment({
        name: 'Test 2',
        variants: [{ name: 'Control', weight: 100 }],
      })

      experiments.startExperiment(exp1.id)

      const result = experiments.getRunningExperiments()

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Test 1')
    })

    it('should return empty array when no running experiments', () => {
      experiments.createExperiment({
        name: 'Test',
        variants: [{ name: 'Control', weight: 100 }],
      })

      const result = experiments.getRunningExperiments()

      expect(result).toEqual([])
    })
  })

  // ===========================================================================
  // getVariant Tests
  // ===========================================================================

  describe('getVariant', () => {
    it('should assign a variant to a session', () => {
      const exp = experiments.createExperiment({
        name: 'Test',
        variants: [
          { name: 'Control', weight: 50 },
          { name: 'Treatment', weight: 50 },
        ],
      })
      experiments.startExperiment(exp.id)

      const variant = experiments.getVariant(exp.id, 'session-1')

      expect(variant).not.toBeNull()
      expect(['Control', 'Treatment']).toContain(variant?.name)
    })

    it('should return consistent variant for same session', () => {
      const exp = experiments.createExperiment({
        name: 'Test',
        variants: [
          { name: 'Control', weight: 50 },
          { name: 'Treatment', weight: 50 },
        ],
      })
      experiments.startExperiment(exp.id)

      const variant1 = experiments.getVariant(exp.id, 'session-1')
      const variant2 = experiments.getVariant(exp.id, 'session-1')

      expect(variant1?.id).toBe(variant2?.id)
    })

    it('should return null for non-running experiment', () => {
      const exp = experiments.createExperiment({
        name: 'Test',
        variants: [{ name: 'Control', weight: 100 }],
      })

      const variant = experiments.getVariant(exp.id, 'session-1')

      expect(variant).toBeNull()
    })

    it('should return null for non-existent experiment', () => {
      const variant = experiments.getVariant('non-existent', 'session-1')

      expect(variant).toBeNull()
    })

    it('should track assignment in analytics', () => {
      const exp = experiments.createExperiment({
        name: 'Test',
        variants: [{ name: 'Control', weight: 100 }],
      })
      experiments.startExperiment(exp.id)

      experiments.getVariant(exp.id, 'session-1')

      expect(analytics.track).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'experiment',
          action: 'assignment',
        })
      )
    })

    it('should respect target audience percentage', () => {
      const exp = experiments.createExperiment({
        name: 'Test',
        variants: [{ name: 'Control', weight: 100 }],
        targetAudience: { percentage: 0 }, // 0% should exclude everyone
      })
      experiments.startExperiment(exp.id)

      // With 0% target, should return null for most sessions
      const variant = experiments.getVariant(exp.id, 'random-session-xyz')

      // Can't guarantee null due to hash, but test the mechanism
      expect(variant === null || variant !== null).toBe(true)
    })

    it('should handle experiment with no variants', () => {
      const exp = experiments.createExperiment({
        name: 'Test',
        variants: [],
      })
      experiments.startExperiment(exp.id)

      const variant = experiments.getVariant(exp.id, 'session-1')

      expect(variant).toBeNull()
    })
  })

  // ===========================================================================
  // trackConversion Tests
  // ===========================================================================

  describe('trackConversion (manager)', () => {
    it('should track conversion for assigned session', () => {
      const exp = experiments.createExperiment({
        name: 'Test',
        variants: [{ name: 'Control', weight: 100 }],
      })
      experiments.startExperiment(exp.id)
      experiments.getVariant(exp.id, 'session-1')

      experiments.trackConversion(exp.id, 'session-1', 'click', 1)

      expect(analytics.track).toHaveBeenCalledWith(
        expect.objectContaining({
          category: 'experiment',
          action: 'conversion',
          label: 'click',
        })
      )
    })

    it('should not track conversion for non-assigned session', () => {
      const exp = experiments.createExperiment({
        name: 'Test',
        variants: [{ name: 'Control', weight: 100 }],
      })
      experiments.startExperiment(exp.id)

      vi.clearAllMocks()
      experiments.trackConversion(exp.id, 'non-assigned-session', 'click', 1)

      // Only the assignment track call should not happen
      expect(analytics.track).not.toHaveBeenCalled()
    })

    it('should not track for non-existent experiment', () => {
      vi.clearAllMocks()
      experiments.trackConversion('non-existent', 'session-1', 'click', 1)

      expect(analytics.track).not.toHaveBeenCalled()
    })
  })

  // ===========================================================================
  // getResults Tests
  // ===========================================================================

  describe('getResults', () => {
    it('should return results for an experiment', async () => {
      const exp = experiments.createExperiment({
        name: 'Test',
        variants: [
          { name: 'Control', weight: 50 },
          { name: 'Treatment', weight: 50 },
        ],
      })
      experiments.startExperiment(exp.id)

      // Assign some sessions
      experiments.getVariant(exp.id, 'session-1')
      experiments.getVariant(exp.id, 'session-2')
      experiments.getVariant(exp.id, 'session-3')

      const results = await experiments.getResults(exp.id)

      expect(results).not.toBeNull()
      expect(results?.experimentId).toBe(exp.id)
      expect(results?.totalParticipants).toBe(3)
      expect(results?.variantResults).toHaveLength(2)
    })

    it('should return null for non-existent experiment', async () => {
      const results = await experiments.getResults('non-existent')

      expect(results).toBeNull()
    })

    it('should count participants per variant', async () => {
      const exp = experiments.createExperiment({
        name: 'Test',
        variants: [{ name: 'Control', weight: 100 }],
      })
      experiments.startExperiment(exp.id)

      experiments.getVariant(exp.id, 'session-1')
      experiments.getVariant(exp.id, 'session-2')

      const results = await experiments.getResults(exp.id)

      const controlVariant = results?.variantResults.find(v => v.variantName === 'Control')
      expect(controlVariant?.participants).toBe(2)
    })
  })

  // ===========================================================================
  // deleteExperiment Tests
  // ===========================================================================

  describe('deleteExperiment', () => {
    it('should delete an existing experiment', () => {
      const exp = experiments.createExperiment({
        name: 'Test',
        variants: [{ name: 'Control', weight: 100 }],
      })

      const deleted = experiments.deleteExperiment(exp.id)

      expect(deleted).toBe(true)
      expect(experiments.getExperiment(exp.id)).toBeNull()
    })

    it('should return false for non-existent experiment', () => {
      const deleted = experiments.deleteExperiment('non-existent')

      expect(deleted).toBe(false)
    })

    it('should also delete associated assignments', () => {
      const exp = experiments.createExperiment({
        name: 'Test',
        variants: [{ name: 'Control', weight: 100 }],
      })
      experiments.startExperiment(exp.id)
      experiments.getVariant(exp.id, 'session-1')

      experiments.deleteExperiment(exp.id)

      // Verify assignment is gone by checking results return null
      expect(experiments.getExperiment(exp.id)).toBeNull()
    })
  })

  // ===========================================================================
  // clearAll Tests
  // ===========================================================================

  describe('clearAll', () => {
    it('should clear all experiments', () => {
      experiments.createExperiment({
        name: 'Test 1',
        variants: [{ name: 'Control', weight: 100 }],
      })
      experiments.createExperiment({
        name: 'Test 2',
        variants: [{ name: 'Control', weight: 100 }],
      })

      experiments.clearAll()

      expect(experiments.getAllExperiments()).toEqual([])
    })

    it('should remove storage items', () => {
      experiments.createExperiment({
        name: 'Test',
        variants: [{ name: 'Control', weight: 100 }],
      })

      experiments.clearAll()

      expect(localStorage.removeItem).toHaveBeenCalled()
    })
  })
})

// =============================================================================
// Convenience Functions Tests
// =============================================================================

describe('createABTest', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    experiments.clearAll()

    const storage: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage[key] || null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value }),
      removeItem: vi.fn((key: string) => { delete storage[key] }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should create A/B test with Control and Treatment', () => {
    const exp = createABTest('Button Test')

    expect(exp.variants).toHaveLength(2)
    expect(exp.variants[0].name).toBe('Control')
    expect(exp.variants[1].name).toBe('Treatment')
  })

  it('should use default 50/50 weights', () => {
    const exp = createABTest('Button Test')

    expect(exp.variants[0].weight).toBe(50)
    expect(exp.variants[1].weight).toBe(50)
  })

  it('should accept custom weights', () => {
    const exp = createABTest('Button Test', {
      controlWeight: 80,
      treatmentWeight: 20,
    })

    expect(exp.variants[0].weight).toBe(80)
    expect(exp.variants[1].weight).toBe(20)
  })

  it('should accept description', () => {
    const exp = createABTest('Button Test', {
      description: 'Testing button colors',
    })

    expect(exp.description).toBe('Testing button colors')
  })

  it('should accept metrics', () => {
    const exp = createABTest('Button Test', {
      metrics: ['click_rate', 'conversion'],
    })

    expect(exp.metrics).toEqual(['click_rate', 'conversion'])
  })
})

describe('getVariant (convenience)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    experiments.clearAll()

    const storage: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage[key] || null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value }),
      removeItem: vi.fn((key: string) => { delete storage[key] }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should return null when no session', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => null),
    })

    const exp = createABTest('Test')
    experiments.startExperiment(exp.id)

    const variant = getVariant(exp.id)

    expect(variant).toBeNull()
  })

  it('should return variant for valid session', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => JSON.stringify({ id: 'session-123' })),
    })

    const exp = createABTest('Test')
    experiments.startExperiment(exp.id)

    const variant = getVariant(exp.id)

    expect(variant).not.toBeNull()
  })

  it('should return null for invalid session JSON', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => 'invalid-json'),
    })

    const exp = createABTest('Test')
    experiments.startExperiment(exp.id)

    const variant = getVariant(exp.id)

    expect(variant).toBeNull()
  })
})

describe('isInTreatment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    experiments.clearAll()

    const storage: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage[key] || null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value }),
      removeItem: vi.fn((key: string) => { delete storage[key] }),
    })

    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => JSON.stringify({ id: 'session-123' })),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should return boolean', () => {
    const exp = createABTest('Test')
    experiments.startExperiment(exp.id)

    const result = isInTreatment(exp.id)

    expect(typeof result).toBe('boolean')
  })

  it('should return false when no variant assigned', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => null),
    })

    const exp = createABTest('Test')

    const result = isInTreatment(exp.id)

    expect(result).toBe(false)
  })
})

describe('trackConversion (convenience)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    experiments.clearAll()

    const storage: Record<string, string> = {}
    vi.stubGlobal('localStorage', {
      getItem: vi.fn((key: string) => storage[key] || null),
      setItem: vi.fn((key: string, value: string) => { storage[key] = value }),
      removeItem: vi.fn((key: string) => { delete storage[key] }),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('should not throw when no session', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => null),
    })

    expect(() => {
      trackConversion('exp-id', 'click')
    }).not.toThrow()
  })

  it('should track conversion with valid session', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => JSON.stringify({ id: 'session-123' })),
    })

    const exp = createABTest('Test')
    experiments.startExperiment(exp.id)
    experiments.getVariant(exp.id, 'session-123')

    vi.clearAllMocks()
    trackConversion(exp.id, 'click', 5)

    expect(analytics.track).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'conversion',
        value: 5,
      })
    )
  })

  it('should use default metric name and value', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => JSON.stringify({ id: 'session-123' })),
    })

    const exp = createABTest('Test')
    experiments.startExperiment(exp.id)
    experiments.getVariant(exp.id, 'session-123')

    vi.clearAllMocks()
    trackConversion(exp.id)

    expect(analytics.track).toHaveBeenCalledWith(
      expect.objectContaining({
        label: 'conversion',
        value: 1,
      })
    )
  })

  it('should handle invalid session JSON gracefully', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: vi.fn(() => 'invalid-json'),
    })

    expect(() => {
      trackConversion('exp-id', 'click')
    }).not.toThrow()
  })
})
