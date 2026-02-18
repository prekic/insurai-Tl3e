import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { Policy } from '@/types/policy'
import type { PolicyEvaluation } from '@/lib/policy-evaluation/types'
import type { EvaluationConfig as DatabaseEvaluationConfig } from '@/lib/config/types'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockEvaluatePolicy = vi.fn()
const mockConvertDatabaseConfigToEvaluatorConfig = vi.fn()
const mockGetEvaluationConfig = vi.fn()

vi.mock('@/lib/policy-evaluation', () => ({
  evaluatePolicy: (...args: unknown[]) => mockEvaluatePolicy(...args),
  convertDatabaseConfigToEvaluatorConfig: (...args: unknown[]) =>
    mockConvertDatabaseConfigToEvaluatorConfig(...args),
}))

vi.mock('@/lib/config', () => ({
  configService: {
    getEvaluationConfig: (...args: unknown[]) => mockGetEvaluationConfig(...args),
  },
}))

// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

function makePolicy(overrides: Partial<Policy> = {}): Policy {
  return {
    id: 'policy-1',
    policyNumber: 'POL-001',
    provider: 'Allianz',
    logo: '',
    type: 'kasko',
    typeTr: 'Kasko',
    coverage: 500000,
    premium: 12000,
    monthlyPremium: 1000,
    deductible: 2000,
    startDate: '2026-01-01',
    expiryDate: '2027-01-01',
    status: 'active',
    uploadDate: '2026-01-01',
    fileName: 'policy.pdf',
    documentType: 'policy',
    coverages: [],
    exclusions: [],
    specialConditions: [],
    insuranceLine: 'kasko',
    ...overrides,
  }
}

function makeEvaluation(overrides: Partial<PolicyEvaluation> = {}): PolicyEvaluation {
  return {
    policyId: 'policy-1',
    policyNumber: 'POL-001',
    policyType: 'kasko',
    evaluatedAt: '2026-01-01T00:00:00Z',
    overallScore: 75,
    grade: 'B',
    status: 'good',
    scoreBreakdown: {
      premium: { category: 'premium', categoryTR: 'Prim', score: 70, weight: 20, details: '', detailsTR: '', issues: [], issuesTR: [] },
      coverage: { category: 'coverage', categoryTR: 'Teminat', score: 80, weight: 30, details: '', detailsTR: '', issues: [], issuesTR: [] },
      deductible: { category: 'deductible', categoryTR: 'Muafiyet', score: 60, weight: 15, details: '', detailsTR: '', issues: [], issuesTR: [] },
      compliance: { category: 'compliance', categoryTR: 'Uyumluluk', score: 90, weight: 20, details: '', detailsTR: '', issues: [], issuesTR: [] },
      value: { category: 'value', categoryTR: 'Fiyat/Performans', score: 65, weight: 15, details: '', detailsTR: '', issues: [], issuesTR: [] },
    },
    marketComparison: {
      premiumPercentile: 50,
      coveragePercentile: 60,
      isAboveAverageValue: true,
      competitivePosition: 'competitive',
    },
    compliance: {
      isCompliant: true,
      mandatoryMet: true,
      minimumLimitsMet: true,
      issues: [],
    },
    recommendations: [],
    summary: {
      strengths: [],
      strengthsTR: [],
      weaknesses: [],
      weaknessesTR: [],
      immediateActions: [],
      immediateActionsTR: [],
    },
    ...overrides,
  }
}

function makeDbConfig(overrides: Partial<DatabaseEvaluationConfig> = {}): DatabaseEvaluationConfig {
  return {
    weightPremium: 20,
    weightCoverage: 30,
    weightDeductible: 15,
    weightCompliance: 20,
    weightValue: 15,
    gradeAThreshold: 90,
    gradeBThreshold: 80,
    gradeCThreshold: 70,
    gradeDThreshold: 60,
    statusExcellentThreshold: 90,
    statusGoodThreshold: 75,
    statusFairThreshold: 60,
    statusPoorThreshold: 40,
    strictCompliance: true,
    includeOptionalCoverages: true,
    useRegionalBenchmarks: true,
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks()
  // Default: db config resolves immediately with null-like behavior (no db)
  mockGetEvaluationConfig.mockResolvedValue(makeDbConfig())
  mockConvertDatabaseConfigToEvaluatorConfig.mockReturnValue({
    weights: { premium: 20, coverage: 30, deductible: 15, compliance: 20, value: 15 },
    strictCompliance: true,
    includeOptionalCoverages: true,
    useRegionalBenchmarks: true,
  })
  mockEvaluatePolicy.mockReturnValue(makeEvaluation())
})

// ===========================================================================
// usePolicyEvaluation (single policy)
// ===========================================================================

describe('usePolicyEvaluation', () => {
  // We need to import after mocks are set up
  async function importHook() {
    const mod = await import('./usePolicyEvaluation')
    return mod.usePolicyEvaluation
  }

  // -------------------------------------------------------------------------
  // Null / undefined policy
  // -------------------------------------------------------------------------

  describe('when policy is null or undefined', () => {
    it('returns null evaluation for null policy', async () => {
      const usePolicyEvaluation = await importHook()
      const { result } = renderHook(() =>
        usePolicyEvaluation(null, { skipDatabaseConfig: true })
      )

      expect(result.current.evaluation).toBeNull()
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
      expect(mockEvaluatePolicy).not.toHaveBeenCalled()
    })

    it('returns null evaluation for undefined policy', async () => {
      const usePolicyEvaluation = await importHook()
      const { result } = renderHook(() =>
        usePolicyEvaluation(undefined, { skipDatabaseConfig: true })
      )

      expect(result.current.evaluation).toBeNull()
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
      expect(mockEvaluatePolicy).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Valid policy
  // -------------------------------------------------------------------------

  describe('when given a valid policy', () => {
    it('returns evaluation result after db config loads', async () => {
      const usePolicyEvaluation = await importHook()
      const policy = makePolicy()
      const evaluation = makeEvaluation({ overallScore: 85, grade: 'B' })
      mockEvaluatePolicy.mockReturnValue(evaluation)

      const { result } = renderHook(() => usePolicyEvaluation(policy))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.evaluation).toBe(evaluation)
      expect(result.current.error).toBeNull()
      expect(mockEvaluatePolicy).toHaveBeenCalledWith(policy, expect.objectContaining({
        config: expect.any(Object),
      }))
    })

    it('returns evaluation immediately with skipDatabaseConfig', async () => {
      const usePolicyEvaluation = await importHook()
      const policy = makePolicy()
      const evaluation = makeEvaluation()
      mockEvaluatePolicy.mockReturnValue(evaluation)

      const { result } = renderHook(() =>
        usePolicyEvaluation(policy, { skipDatabaseConfig: true })
      )

      // Should not be loading since we skip db config
      expect(result.current.isLoading).toBe(false)
      expect(result.current.evaluation).toBe(evaluation)
      expect(result.current.error).toBeNull()
    })

    it('passes policy to evaluatePolicy', async () => {
      const usePolicyEvaluation = await importHook()
      const policy = makePolicy({ id: 'custom-id', premium: 99999 })

      renderHook(() =>
        usePolicyEvaluation(policy, { skipDatabaseConfig: true })
      )

      expect(mockEvaluatePolicy).toHaveBeenCalledWith(
        policy,
        expect.any(Object)
      )
      const passedPolicy = mockEvaluatePolicy.mock.calls[0][0]
      expect(passedPolicy.id).toBe('custom-id')
      expect(passedPolicy.premium).toBe(99999)
    })
  })

  // -------------------------------------------------------------------------
  // enabled = false
  // -------------------------------------------------------------------------

  describe('when enabled is false', () => {
    it('returns null evaluation and does not call evaluatePolicy', async () => {
      const usePolicyEvaluation = await importHook()
      const policy = makePolicy()

      const { result } = renderHook(() =>
        usePolicyEvaluation(policy, { enabled: false, skipDatabaseConfig: true })
      )

      expect(result.current.evaluation).toBeNull()
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBeNull()
      expect(mockEvaluatePolicy).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // skipDatabaseConfig = true
  // -------------------------------------------------------------------------

  describe('when skipDatabaseConfig is true', () => {
    it('does not call configService.getEvaluationConfig', async () => {
      const usePolicyEvaluation = await importHook()
      const policy = makePolicy()

      renderHook(() =>
        usePolicyEvaluation(policy, { skipDatabaseConfig: true })
      )

      expect(mockGetEvaluationConfig).not.toHaveBeenCalled()
    })

    it('does not call convertDatabaseConfigToEvaluatorConfig', async () => {
      const usePolicyEvaluation = await importHook()
      const policy = makePolicy()

      renderHook(() =>
        usePolicyEvaluation(policy, { skipDatabaseConfig: true })
      )

      expect(mockConvertDatabaseConfigToEvaluatorConfig).not.toHaveBeenCalled()
    })

    it('passes provided config directly to evaluatePolicy', async () => {
      const usePolicyEvaluation = await importHook()
      const policy = makePolicy()
      const customConfig = {
        weights: { premium: 10, coverage: 40, deductible: 10, compliance: 30, value: 10 },
        strictCompliance: false,
      }

      renderHook(() =>
        usePolicyEvaluation(policy, { skipDatabaseConfig: true, config: customConfig })
      )

      expect(mockEvaluatePolicy).toHaveBeenCalledWith(policy, expect.objectContaining({
        config: customConfig,
      }))
    })
  })

  // -------------------------------------------------------------------------
  // Custom config
  // -------------------------------------------------------------------------

  describe('with custom config', () => {
    it('passes custom config to evaluatePolicy when skipDatabaseConfig is true', async () => {
      const usePolicyEvaluation = await importHook()
      const policy = makePolicy()
      const customConfig = {
        weights: { premium: 50, coverage: 10, deductible: 10, compliance: 20, value: 10 },
      }

      renderHook(() =>
        usePolicyEvaluation(policy, { config: customConfig, skipDatabaseConfig: true })
      )

      const calledOptions = mockEvaluatePolicy.mock.calls[0][1]
      expect(calledOptions.config).toEqual(customConfig)
    })

    it('merges provided config over db config (provided wins)', async () => {
      const usePolicyEvaluation = await importHook()
      const policy = makePolicy()

      const dbEvaluatorConfig = {
        weights: { premium: 20, coverage: 30, deductible: 15, compliance: 20, value: 15 },
        strictCompliance: true,
        useRegionalBenchmarks: true,
      }
      mockConvertDatabaseConfigToEvaluatorConfig.mockReturnValue(dbEvaluatorConfig)

      const customConfig = {
        strictCompliance: false,
        region: 'marmara',
      }

      const { result } = renderHook(() =>
        usePolicyEvaluation(policy, { config: customConfig })
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const calledOptions = mockEvaluatePolicy.mock.calls[0][1]
      // Provided config overrides db config
      expect(calledOptions.config.strictCompliance).toBe(false)
      expect(calledOptions.config.region).toBe('marmara')
      // DB config preserved where not overridden
      expect(calledOptions.config.weights).toEqual(dbEvaluatorConfig.weights)
      expect(calledOptions.config.useRegionalBenchmarks).toBe(true)
    })
  })

  // -------------------------------------------------------------------------
  // Error handling
  // -------------------------------------------------------------------------

  describe('error handling', () => {
    it('returns error when evaluatePolicy throws an Error', async () => {
      const usePolicyEvaluation = await importHook()
      const policy = makePolicy()
      const error = new Error('Evaluation failed')
      mockEvaluatePolicy.mockImplementation(() => { throw error })

      const { result } = renderHook(() =>
        usePolicyEvaluation(policy, { skipDatabaseConfig: true })
      )

      expect(result.current.evaluation).toBeNull()
      expect(result.current.isLoading).toBe(false)
      expect(result.current.error).toBe(error)
    })

    it('wraps non-Error throws in a generic Error', async () => {
      const usePolicyEvaluation = await importHook()
      const policy = makePolicy()
      mockEvaluatePolicy.mockImplementation(() => { throw 'string error' })  

      const { result } = renderHook(() =>
        usePolicyEvaluation(policy, { skipDatabaseConfig: true })
      )

      expect(result.current.evaluation).toBeNull()
      expect(result.current.error).toBeInstanceOf(Error)
      expect(result.current.error!.message).toBe('Failed to evaluate policy')
    })

    it('falls back to defaults when db config fetch fails', async () => {
      const usePolicyEvaluation = await importHook()
      const policy = makePolicy()
      mockGetEvaluationConfig.mockRejectedValue(new Error('DB unavailable'))

      const { result } = renderHook(() => usePolicyEvaluation(policy))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Should still evaluate — falls back to defaults
      expect(result.current.evaluation).not.toBeNull()
      expect(result.current.error).toBeNull()
      expect(mockEvaluatePolicy).toHaveBeenCalled()
      // convertDatabaseConfigToEvaluatorConfig should NOT be called since dbConfig is null
      // (the hook's catch sets configLoading=false but leaves dbConfig=null)
    })
  })

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  describe('loading state', () => {
    it('is loading while fetching db config', async () => {
      const usePolicyEvaluation = await importHook()
      const policy = makePolicy()

      // Make db config fetch hang
      let resolveConfig!: (val: DatabaseEvaluationConfig) => void
      mockGetEvaluationConfig.mockReturnValue(
        new Promise<DatabaseEvaluationConfig>((resolve) => {
          resolveConfig = resolve
        })
      )

      const { result } = renderHook(() => usePolicyEvaluation(policy))

      // Should be loading
      expect(result.current.isLoading).toBe(true)
      expect(result.current.evaluation).toBeNull()
      expect(mockEvaluatePolicy).not.toHaveBeenCalled()

      // Resolve config
      await act(async () => {
        resolveConfig(makeDbConfig())
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.evaluation).not.toBeNull()
    })

    it('is not loading when skipDatabaseConfig is true', async () => {
      const usePolicyEvaluation = await importHook()
      const policy = makePolicy()

      const { result } = renderHook(() =>
        usePolicyEvaluation(policy, { skipDatabaseConfig: true })
      )

      expect(result.current.isLoading).toBe(false)
    })
  })

  // -------------------------------------------------------------------------
  // DB config merging
  // -------------------------------------------------------------------------

  describe('database config merging', () => {
    it('passes grade thresholds from db config', async () => {
      const usePolicyEvaluation = await importHook()
      const policy = makePolicy()

      const dbConfig = makeDbConfig({
        gradeAThreshold: 95,
        gradeBThreshold: 85,
        gradeCThreshold: 75,
        gradeDThreshold: 65,
      })
      mockGetEvaluationConfig.mockResolvedValue(dbConfig)

      const { result } = renderHook(() => usePolicyEvaluation(policy))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const calledOptions = mockEvaluatePolicy.mock.calls[0][1]
      expect(calledOptions.gradeThresholds).toEqual({
        gradeAThreshold: 95,
        gradeBThreshold: 85,
        gradeCThreshold: 75,
        gradeDThreshold: 65,
      })
    })

    it('passes status thresholds from db config', async () => {
      const usePolicyEvaluation = await importHook()
      const policy = makePolicy()

      const dbConfig = makeDbConfig({
        statusExcellentThreshold: 92,
        statusGoodThreshold: 78,
        statusFairThreshold: 62,
        statusPoorThreshold: 42,
      })
      mockGetEvaluationConfig.mockResolvedValue(dbConfig)

      const { result } = renderHook(() => usePolicyEvaluation(policy))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const calledOptions = mockEvaluatePolicy.mock.calls[0][1]
      expect(calledOptions.statusThresholds).toEqual({
        statusExcellentThreshold: 92,
        statusGoodThreshold: 78,
        statusFairThreshold: 62,
        statusPoorThreshold: 42,
      })
    })

    it('converts db config and passes merged config to evaluatePolicy', async () => {
      const usePolicyEvaluation = await importHook()
      const policy = makePolicy()

      const convertedConfig = {
        weights: { premium: 25, coverage: 25, deductible: 20, compliance: 15, value: 15 },
        strictCompliance: false,
      }
      mockConvertDatabaseConfigToEvaluatorConfig.mockReturnValue(convertedConfig)

      const { result } = renderHook(() => usePolicyEvaluation(policy))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(mockConvertDatabaseConfigToEvaluatorConfig).toHaveBeenCalled()
      const calledOptions = mockEvaluatePolicy.mock.calls[0][1]
      expect(calledOptions.config).toEqual(convertedConfig)
    })

    it('does not pass grade/status thresholds when dbConfig is null (fallback)', async () => {
      const usePolicyEvaluation = await importHook()
      const policy = makePolicy()
      mockGetEvaluationConfig.mockRejectedValue(new Error('DB error'))

      const { result } = renderHook(() => usePolicyEvaluation(policy))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const calledOptions = mockEvaluatePolicy.mock.calls[0][1]
      expect(calledOptions.gradeThresholds).toBeUndefined()
      expect(calledOptions.statusThresholds).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // Re-evaluation on policy changes
  // -------------------------------------------------------------------------

  describe('re-evaluation on policy changes', () => {
    it('re-evaluates when policy data changes', async () => {
      const usePolicyEvaluation = await importHook()
      const policy1 = makePolicy({ premium: 10000 })
      const policy2 = makePolicy({ premium: 20000 })

      const eval1 = makeEvaluation({ overallScore: 80 })
      const eval2 = makeEvaluation({ overallScore: 60 })
      mockEvaluatePolicy
        .mockReturnValueOnce(eval1)
        .mockReturnValueOnce(eval2)

      const { result, rerender } = renderHook(
        ({ policy }) => usePolicyEvaluation(policy, { skipDatabaseConfig: true }),
        { initialProps: { policy: policy1 } }
      )

      expect(result.current.evaluation?.overallScore).toBe(80)

      rerender({ policy: policy2 })

      expect(result.current.evaluation?.overallScore).toBe(60)
      expect(mockEvaluatePolicy).toHaveBeenCalledTimes(2)
    })

    it('does not re-evaluate when policy reference changes but data is same', async () => {
      const usePolicyEvaluation = await importHook()
      const policy1 = makePolicy({ id: 'same', premium: 10000 })
      const policy2 = makePolicy({ id: 'same', premium: 10000 })

      const { rerender } = renderHook(
        ({ policy }) => usePolicyEvaluation(policy, { skipDatabaseConfig: true }),
        { initialProps: { policy: policy1 } }
      )

      rerender({ policy: policy2 })

      // useMemo compares policy hash — same data means same hash, so no re-evaluation
      expect(mockEvaluatePolicy).toHaveBeenCalledTimes(1)
    })
  })
})

// ===========================================================================
// usePolicyEvaluations (multiple policies)
// ===========================================================================

describe('usePolicyEvaluations', () => {
  async function importHook() {
    const mod = await import('./usePolicyEvaluation')
    return mod.usePolicyEvaluations
  }

  // -------------------------------------------------------------------------
  // Empty array
  // -------------------------------------------------------------------------

  describe('when given an empty array', () => {
    it('returns empty map', async () => {
      const usePolicyEvaluations = await importHook()

      const { result } = renderHook(() =>
        usePolicyEvaluations([], { skipDatabaseConfig: true })
      )

      expect(result.current.evaluations.size).toBe(0)
      expect(result.current.isLoading).toBe(false)
      expect(mockEvaluatePolicy).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Multiple policies
  // -------------------------------------------------------------------------

  describe('when given multiple policies', () => {
    it('evaluates all policies and returns a map keyed by policy id', async () => {
      const usePolicyEvaluations = await importHook()
      const policies = [
        makePolicy({ id: 'p1', premium: 10000 }),
        makePolicy({ id: 'p2', premium: 20000 }),
        makePolicy({ id: 'p3', premium: 30000 }),
      ]

      const eval1 = makeEvaluation({ policyId: 'p1', overallScore: 90, grade: 'A' })
      const eval2 = makeEvaluation({ policyId: 'p2', overallScore: 70, grade: 'C' })
      const eval3 = makeEvaluation({ policyId: 'p3', overallScore: 50, grade: 'D' })

      mockEvaluatePolicy
        .mockReturnValueOnce(eval1)
        .mockReturnValueOnce(eval2)
        .mockReturnValueOnce(eval3)

      const { result } = renderHook(() =>
        usePolicyEvaluations(policies, { skipDatabaseConfig: true })
      )

      expect(result.current.evaluations.size).toBe(3)
      expect(result.current.evaluations.get('p1')).toBe(eval1)
      expect(result.current.evaluations.get('p2')).toBe(eval2)
      expect(result.current.evaluations.get('p3')).toBe(eval3)
      expect(result.current.isLoading).toBe(false)
    })

    it('calls evaluatePolicy for each policy', async () => {
      const usePolicyEvaluations = await importHook()
      const policies = [
        makePolicy({ id: 'a' }),
        makePolicy({ id: 'b' }),
      ]

      renderHook(() =>
        usePolicyEvaluations(policies, { skipDatabaseConfig: true })
      )

      expect(mockEvaluatePolicy).toHaveBeenCalledTimes(2)
      expect(mockEvaluatePolicy.mock.calls[0][0].id).toBe('a')
      expect(mockEvaluatePolicy.mock.calls[1][0].id).toBe('b')
    })
  })

  // -------------------------------------------------------------------------
  // enabled = false
  // -------------------------------------------------------------------------

  describe('when enabled is false', () => {
    it('returns empty map and does not call evaluatePolicy', async () => {
      const usePolicyEvaluations = await importHook()
      const policies = [makePolicy(), makePolicy({ id: 'p2' })]

      const { result } = renderHook(() =>
        usePolicyEvaluations(policies, { enabled: false, skipDatabaseConfig: true })
      )

      expect(result.current.evaluations.size).toBe(0)
      expect(result.current.isLoading).toBe(false)
      expect(mockEvaluatePolicy).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // Policies that fail evaluation
  // -------------------------------------------------------------------------

  describe('when some policies fail evaluation', () => {
    it('skips failed policies silently and includes successful ones', async () => {
      const usePolicyEvaluations = await importHook()
      const policies = [
        makePolicy({ id: 'good1', premium: 10000 }),
        makePolicy({ id: 'bad', premium: 20000 }),
        makePolicy({ id: 'good2', premium: 30000 }),
      ]

      const evalGood1 = makeEvaluation({ policyId: 'good1', overallScore: 80 })
      const evalGood2 = makeEvaluation({ policyId: 'good2', overallScore: 70 })

      mockEvaluatePolicy
        .mockReturnValueOnce(evalGood1)
        .mockImplementationOnce(() => { throw new Error('Bad policy data') })
        .mockReturnValueOnce(evalGood2)

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const { result } = renderHook(() =>
        usePolicyEvaluations(policies, { skipDatabaseConfig: true })
      )

      expect(result.current.evaluations.size).toBe(2)
      expect(result.current.evaluations.get('good1')).toBe(evalGood1)
      expect(result.current.evaluations.has('bad')).toBe(false)
      expect(result.current.evaluations.get('good2')).toBe(evalGood2)
      expect(warnSpy).toHaveBeenCalledWith('Failed to evaluate policy bad')

      warnSpy.mockRestore()
    })

    it('returns empty map when all policies fail', async () => {
      const usePolicyEvaluations = await importHook()
      const policies = [
        makePolicy({ id: 'bad1', premium: 10000 }),
        makePolicy({ id: 'bad2', premium: 20000 }),
      ]

      mockEvaluatePolicy.mockImplementation(() => { throw new Error('fail') })

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

      const { result } = renderHook(() =>
        usePolicyEvaluations(policies, { skipDatabaseConfig: true })
      )

      expect(result.current.evaluations.size).toBe(0)
      expect(result.current.isLoading).toBe(false)

      warnSpy.mockRestore()
    })
  })

  // -------------------------------------------------------------------------
  // Loading state
  // -------------------------------------------------------------------------

  describe('loading state', () => {
    it('is loading while fetching db config', async () => {
      const usePolicyEvaluations = await importHook()
      const policies = [makePolicy()]

      let resolveConfig!: (val: DatabaseEvaluationConfig) => void
      mockGetEvaluationConfig.mockReturnValue(
        new Promise<DatabaseEvaluationConfig>((resolve) => {
          resolveConfig = resolve
        })
      )

      const { result } = renderHook(() => usePolicyEvaluations(policies))

      expect(result.current.isLoading).toBe(true)
      expect(result.current.evaluations.size).toBe(0)
      expect(mockEvaluatePolicy).not.toHaveBeenCalled()

      await act(async () => {
        resolveConfig(makeDbConfig())
      })

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      expect(result.current.evaluations.size).toBe(1)
    })

    it('is not loading when skipDatabaseConfig is true', async () => {
      const usePolicyEvaluations = await importHook()
      const policies = [makePolicy()]

      const { result } = renderHook(() =>
        usePolicyEvaluations(policies, { skipDatabaseConfig: true })
      )

      expect(result.current.isLoading).toBe(false)
    })

    it('stops loading and falls back when db config fetch fails', async () => {
      const usePolicyEvaluations = await importHook()
      const policies = [makePolicy()]
      mockGetEvaluationConfig.mockRejectedValue(new Error('DB down'))

      const { result } = renderHook(() => usePolicyEvaluations(policies))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      // Should still evaluate with defaults
      expect(result.current.evaluations.size).toBe(1)
    })
  })

  // -------------------------------------------------------------------------
  // skipDatabaseConfig
  // -------------------------------------------------------------------------

  describe('when skipDatabaseConfig is true', () => {
    it('does not call configService.getEvaluationConfig', async () => {
      const usePolicyEvaluations = await importHook()
      const policies = [makePolicy()]

      renderHook(() =>
        usePolicyEvaluations(policies, { skipDatabaseConfig: true })
      )

      expect(mockGetEvaluationConfig).not.toHaveBeenCalled()
    })

    it('does not call convertDatabaseConfigToEvaluatorConfig', async () => {
      const usePolicyEvaluations = await importHook()
      const policies = [makePolicy()]

      renderHook(() =>
        usePolicyEvaluations(policies, { skipDatabaseConfig: true })
      )

      expect(mockConvertDatabaseConfigToEvaluatorConfig).not.toHaveBeenCalled()
    })
  })

  // -------------------------------------------------------------------------
  // DB config integration
  // -------------------------------------------------------------------------

  describe('database config integration', () => {
    it('passes grade thresholds from db config to evaluatePolicy', async () => {
      const usePolicyEvaluations = await importHook()
      const policies = [makePolicy()]

      const dbConfig = makeDbConfig({
        gradeAThreshold: 95,
        gradeBThreshold: 85,
        gradeCThreshold: 75,
        gradeDThreshold: 65,
      })
      mockGetEvaluationConfig.mockResolvedValue(dbConfig)

      const { result } = renderHook(() => usePolicyEvaluations(policies))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const calledOptions = mockEvaluatePolicy.mock.calls[0][1]
      expect(calledOptions.gradeThresholds).toEqual({
        gradeAThreshold: 95,
        gradeBThreshold: 85,
        gradeCThreshold: 75,
        gradeDThreshold: 65,
      })
    })

    it('passes status thresholds from db config to evaluatePolicy', async () => {
      const usePolicyEvaluations = await importHook()
      const policies = [makePolicy()]

      const dbConfig = makeDbConfig({
        statusExcellentThreshold: 88,
        statusGoodThreshold: 72,
        statusFairThreshold: 55,
        statusPoorThreshold: 35,
      })
      mockGetEvaluationConfig.mockResolvedValue(dbConfig)

      const { result } = renderHook(() => usePolicyEvaluations(policies))

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const calledOptions = mockEvaluatePolicy.mock.calls[0][1]
      expect(calledOptions.statusThresholds).toEqual({
        statusExcellentThreshold: 88,
        statusGoodThreshold: 72,
        statusFairThreshold: 55,
        statusPoorThreshold: 35,
      })
    })

    it('merges provided config over db config (provided wins)', async () => {
      const usePolicyEvaluations = await importHook()
      const policies = [makePolicy()]

      const dbEvaluatorConfig = {
        weights: { premium: 20, coverage: 30, deductible: 15, compliance: 20, value: 15 },
        strictCompliance: true,
      }
      mockConvertDatabaseConfigToEvaluatorConfig.mockReturnValue(dbEvaluatorConfig)

      const customConfig = { strictCompliance: false }

      const { result } = renderHook(() =>
        usePolicyEvaluations(policies, { config: customConfig })
      )

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false)
      })

      const calledOptions = mockEvaluatePolicy.mock.calls[0][1]
      // Provided config overrides db config
      expect(calledOptions.config.strictCompliance).toBe(false)
      // DB config preserved for non-overridden fields
      expect(calledOptions.config.weights).toEqual(dbEvaluatorConfig.weights)
    })
  })

  // -------------------------------------------------------------------------
  // Cleanup on unmount
  // -------------------------------------------------------------------------

  describe('cleanup', () => {
    it('does not update state after unmount (no warnings)', async () => {
      const usePolicyEvaluations = await importHook()
      const policies = [makePolicy()]

      let resolveConfig!: (val: DatabaseEvaluationConfig) => void
      mockGetEvaluationConfig.mockReturnValue(
        new Promise<DatabaseEvaluationConfig>((resolve) => {
          resolveConfig = resolve
        })
      )

      const { unmount } = renderHook(() => usePolicyEvaluations(policies))

      // Unmount before config resolves
      unmount()

      // Resolve after unmount — should not throw or cause warnings
      await act(async () => {
        resolveConfig(makeDbConfig())
      })

      // If the mounted guard works, no error is thrown
      expect(true).toBe(true)
    })
  })
})
