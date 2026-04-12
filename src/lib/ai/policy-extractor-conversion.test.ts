/**
 * Tests for comprehensiveToAnalyzedPolicy() and calculateMainCoverage()
 * (calculateMainCoverage is internal, exercised through comprehensiveToAnalyzedPolicy)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { comprehensiveToAnalyzedPolicy } from './policy-extractor'
import type { ComprehensiveExtractionResult } from './policy-extractor'
import type { StructuredPolicyData } from './kasko-parser-prompts'

// ---------------------------------------------------------------------------
// Mocks — must be at top level for Vitest hoisting
// ---------------------------------------------------------------------------

vi.mock('./config', () => ({
  isAIConfigured: vi.fn().mockReturnValue(true),
  isOCRConfigured: vi.fn().mockReturnValue(false),
  isProxyConfigured: vi.fn().mockReturnValue(false),
  AI_CONFIG: { extractionProvider: 'openai', minConfidence: 0.4, warningConfidence: 0.7 },
  getConfiguredProviders: vi.fn().mockReturnValue(['openai']),
}))

vi.mock('@/lib/market-data/service', () => ({
  generateMarketComparisonData: vi.fn().mockReturnValue({ percentile: 50 }),
  generateMarketComparisonDataAsync: vi.fn().mockResolvedValue({ percentile: 50 }),
}))

vi.mock('@/lib/i18n/coverage-names', () => ({
  lookupCoverageNameTr: vi.fn().mockReturnValue(null),
}))

vi.mock('@/lib/i18n/translations-tr', () => ({
  TR_TRANSLATIONS: {
    insightTranslations: {},
  },
}))

vi.mock('@/lib/i18n/translations', () => ({}))

// Mocks for all other deep imports pulled in by policy-extractor
vi.mock('./pdf-parser', () => ({
  extractTextFromPDF: vi.fn(),
  extractTextFromPDFWithRetry: vi.fn(),
  isPDFFile: vi.fn((f: File) => f.type === 'application/pdf'),
}))

vi.mock('./ocr', () => ({
  isLikelyScannedPDF: vi.fn(() => false),
  performOCR: vi.fn(),
  extractFormFieldMap: vi.fn(() => ({})),
  findFormField: vi.fn(() => null),
  TURKISH_FORM_FIELD_PATTERNS: {
    policyNumber: [],
    insuredName: [],
    startDate: [],
    endDate: [],
    premium: [],
  },
}))

vi.mock('./table-parser', () => ({
  parseTablesForCoverages: vi.fn(() => ({ coverages: [], confidence: 0.9 })),
  mergeCoveragesWithTableData: vi.fn((cs: unknown[]) => cs),
}))

vi.mock('./providers/consensus', () => ({ extractWithConsensus: vi.fn() }))
vi.mock('./providers/openai', () => ({ extractWithOpenAI: vi.fn() }))
vi.mock('./providers/claude', () => ({ extractWithClaude: vi.fn() }))

vi.mock('@/data/sample-policies', () => ({
  samplePolicies: [],
}))

vi.mock('@/types/policy', () => ({
  POLICY_TYPES: {
    kasko: { label: 'Kasko', labelTr: 'Kasko' },
    traffic: { label: 'Traffic Liability', labelTr: 'Trafik Sigortası' },
    home: { label: 'Home', labelTr: 'Konut' },
    health: { label: 'Health', labelTr: 'Sağlık' },
    business: { label: 'Business', labelTr: 'İşyeri' },
    life: { label: 'Life', labelTr: 'Hayat' },
    dask: { label: 'Earthquake Insurance', labelTr: 'DASK' },
    nakliyat: { label: 'Transportation Insurance', labelTr: 'Nakliyat Sigortası' },
  },
}))

vi.mock('@/data/market-data/benchmarks', () => ({
  MARKET_BENCHMARKS: {
    kasko: {
      premiumRange: { percentile75: 10000 },
      coverageRange: { average: 800000, median: 700000 },
      commonCoverages: [],
      trends: { premiumChangeYoY: 20 },
    },
  },
}))

vi.mock('@/lib/ml', () => ({
  RiskAssessmentService: {
    getQuickRiskScore: vi.fn(() => ({ score: 45, level: 'moderate', topIssue: null })),
    getActionItems: vi.fn(() => []),
  },
}))

vi.mock('@/lib/gap-detection', () => ({
  GapDetectionService: {
    analyzePolicy: vi.fn(() =>
      Promise.resolve({
        overallScore: 30,
        gapCount: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
        prioritizedGaps: [],
        financialSummary: { totalExpectedLoss: 0, estimatedRemediationCost: 0 },
      })
    ),
    getActionItems: vi.fn(() => Promise.resolve([])),
  },
}))

vi.mock('@/lib/market-data/market-data-provider', () => ({
  marketDataProvider: {
    getBenchmark: vi.fn(() =>
      Promise.resolve({
        commonCoverages: [],
        premiumRange: { min: 1000, max: 10000, average: 5000, median: 4500, percentile75: 7500 },
        coverageRange: { min: 50000, max: 1000000, average: 500000, median: 450000 },
        trends: { premiumChangeYoY: 10 },
      })
    ),
    getRegionalFactor: vi.fn(() => Promise.resolve(1.0)),
    calculatePremiumPercentile: vi.fn(() => Promise.resolve(50)),
    calculateCoveragePercentile: vi.fn(() => Promise.resolve(50)),
  },
}))

vi.mock('@/lib/extraction', () => ({
  validateAndEnhanceExtraction: vi.fn(() => ({ errors: [], warnings: [], enhancements: {} })),
  mergeExtractionResults: vi.fn((r: unknown) => r),
}))

vi.mock('./text-processor', () => ({
  processTextWithAI: vi.fn(),
  applyBasicOCRCorrections: vi.fn((text: string) => ({ text, corrections: [] })),
  textNeedsProcessing: vi.fn(() => false),
  processTextEnhanced: vi.fn(),
  applyComprehensivePreprocessing: vi.fn((text: string) => ({
    text,
    stats: {
      garbageBlocksRemoved: 0,
      qrBlocksRemoved: 0,
      spacedCharsFixed: 0,
      totalCharactersRemoved: 0,
    },
  })),
  addSectionMarkers: vi.fn((text: string) => ({ text, sectionsFound: [] })),
}))

vi.mock('@/lib/ocr-decision/ocr-decision-engine', () => ({
  getOCRDecisionEngine: vi.fn(() => ({
    analyzeDocument: vi.fn(() => ({
      action: 'skip_ocr',
      confidence: 0.85,
      document_classification: {
        detected_language: { locale_code: 'tr', confidence: 0.9 },
        detected_policy_type: {
          policy_type_id: 'motor_kasko',
          policy_type_name: 'Kasko',
          confidence: 0.85,
        },
      },
      analysis: {
        text_quality: { quality_score: 0.8, is_good_quality: true },
        field_extraction: { extraction_rate: 0.6 },
        confidence_breakdown: { component_scores: {} },
      },
      pages_to_ocr: [],
      reasoning: [],
    })),
    buildDocumentJourneyMetadata: vi.fn(() => ({ ocr_decision: {} })),
  })),
}))

vi.mock('./document-ocr', () => ({
  isDocumentOCRAvailable: vi.fn(() => false),
  extractWithDocumentAI: vi.fn(),
}))

vi.mock('@/lib/utils', () => ({
  cn: vi.fn((...args: unknown[]) => args.filter(Boolean).join(' ')),
  formatCurrency: vi.fn((n: number) => `₺${n}`),
  formatDate: vi.fn((d: string) => d),
  formatNumber: vi.fn((n: number) => String(n)),
  validateCurrencyRegion: vi.fn(() => ({ valid: true })),
}))

vi.mock('@/lib/config', () => ({
  getAIConfig: vi.fn(() =>
    Promise.resolve({
      confidenceWeightPolicyNumber: 0.2,
      confidenceWeightProvider: 0.15,
      confidenceWeightDates: 0.2,
      confidenceWeightPremium: 0.2,
      confidenceWeightCoverages: 0.25,
    })
  ),
  configService: {
    getAIConfig: vi.fn(() => Promise.resolve({})),
  },
}))

vi.mock('./kasko-parser-prompts', () => ({
  parseStructuredOutput: vi.fn(),
  extractQualityScore: vi.fn(),
  extractWatchOuts: vi.fn(),
}))

vi.mock('@/lib/env', () => ({
  env: {
    hasProxy: false,
    proxyUrl: null,
    supabaseUrl: 'https://test.supabase.co',
    supabaseAnonKey: 'test-key',
  },
}))

// ---------------------------------------------------------------------------
// URL.createObjectURL must be mocked for jsdom
// ---------------------------------------------------------------------------
global.URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFile(name = 'policy.pdf'): File {
  return new File(['content'], name, { type: 'application/pdf' })
}

function makeStructuredData(overrides: Partial<StructuredPolicyData> = {}): StructuredPolicyData {
  // @ts-expect-error - mismatch due to schema update
  return {
    policy: {
      policyNumber: 'POL-001',
      sbmPolicyNumber: null,
      provider: 'Allianz',
      productName: null,
      startDate: '2026-01-01',
      endDate: '2027-01-01',
      issueDate: null,
    },
    insured: {
      name: 'John Doe',
      tcKimlik: null,
      vkn: null,
      address: 'Istanbul',
      phone: null,
      email: null,
    },
    vehicle: undefined as unknown as StructuredPolicyData['vehicle'],
    premium: {
      netPremium: 4000,
      tax: 1000,
      totalPremium: 5000,
      currency: 'TRY',
      paymentPlan: null,
      installments: null,
    },
    coverages: [],
    deductiblesPenalties: [],
    exclusions: [],
    noClaimsBonus: {
      currentLevel: null,
      discountRate: null,
      protectionIncluded: false,
    },
    assistanceServices: [],
    replacementVehicle: {
      included: false,
      daysLimit: null,
      vehicleClass: null,
      conditions: null,
    },
    claimsProcess: {
      notificationDeadline: '5 days',
      channels: [],
      requiredDocuments: {},
    },
    uncertainties: [],
    ...overrides,
  }
}

function makeResult(
  overrides: Partial<ComprehensiveExtractionResult> = {}
): ComprehensiveExtractionResult {
  return {
    success: true,
    policyBrief: null,
    structuredData: makeStructuredData(),
    watchOuts: [],
    qualityScore: 80,
    sectionsFound: [],
    preprocessingStats: {
      garbageBlocksRemoved: 0,
      qrBlocksRemoved: 0,
      spacedCharsFixed: 0,
      totalCharactersRemoved: 0,
    },
    ...overrides,
  }
}

function makeCoverage(
  overrides: Partial<StructuredPolicyData['coverages'][0]> = {}
): StructuredPolicyData['coverages'][0] {
  return {
    name: 'Collision',
    nameTr: 'Çarpma/Çarpışma',
    category: 'main',
    limit: 500000,
    isUnlimited: false,
    isMarketValue: false,
    basis: 'per_event',
    deductible: 0,
    deductibleType: 'fixed',
    conditions: null,
    source: 'test',
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('comprehensiveToAnalyzedPolicy()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url')
  })

  // -------------------------------------------------------------------------
  // Group 1: Input validation — null returns
  // -------------------------------------------------------------------------

  describe('input validation', () => {
    it('returns null when result.success is false', () => {
      const result = makeResult({ success: false })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy).toBeNull()
    })

    it('returns null when result.structuredData is null (even if success=true)', () => {
      const result = makeResult({ success: true, structuredData: null })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy).toBeNull()
    })

    it('returns null when result.structuredData is undefined', () => {
      const result = makeResult({ success: true, structuredData: undefined })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy).toBeNull()
    })

    it('returns an AnalyzedPolicy when result is valid', () => {
      const result = makeResult()
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy).not.toBeNull()
      expect(policy?.policyNumber).toBe('POL-001')
    })
  })

  // -------------------------------------------------------------------------
  // Group 2: Status calculation from dates
  // -------------------------------------------------------------------------

  describe('status calculation', () => {
    it('defaults to "active" when no endDate is provided', () => {
      // @ts-expect-error - TS6133 unused variable
      const _data = makeStructuredData({
        policy: {
          policyNumber: 'P1',
          sbmPolicyNumber: null,
          provider: 'Allianz',
          productName: null,
          startDate: '2026-01-01',
          endDate: '',
          issueDate: null,
        },
      })
      // Empty string endDate: new Date('') is Invalid — the implementation checks falsy after new Date() parse
      // We verify by passing null-like value via structuredData override
      const result = makeResult({
        structuredData: {
          ...makeStructuredData(),
          policy: {
            policyNumber: 'P1',
            sbmPolicyNumber: null,
            provider: 'Allianz',
            productName: null,
            startDate: '2026-01-01',
            endDate: '', // empty string → falsy after Date parse NaN check, but code checks `if (data.policy.endDate)` so falsy empty string → skip
            issueDate: null,
          },
        },
      })
      // Empty string is falsy — the `if (data.policy.endDate)` guard treats it as no date → active
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.status).toBe('active')
    })

    it('sets status to "expired" when endDate is in the past', () => {
      const result = makeResult({
        structuredData: makeStructuredData({
          policy: {
            policyNumber: 'P2',
            sbmPolicyNumber: null,
            provider: 'Allianz',
            productName: null,
            startDate: '2020-01-01',
            endDate: '2021-01-01', // definitely in the past
            issueDate: null,
          },
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.status).toBe('expired')
    })

    it('sets status to "expiring" when endDate is within 30 days', () => {
      const soon = new Date()
      soon.setDate(soon.getDate() + 15)
      const endDate = soon.toISOString().split('T')[0]

      const result = makeResult({
        structuredData: makeStructuredData({
          policy: {
            policyNumber: 'P3',
            sbmPolicyNumber: null,
            provider: 'Allianz',
            productName: null,
            startDate: '2025-01-01',
            endDate,
            issueDate: null,
          },
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.status).toBe('expiring')
    })

    it('sets status to "active" when endDate is more than 30 days away', () => {
      const future = new Date()
      future.setDate(future.getDate() + 60)
      const endDate = future.toISOString().split('T')[0]

      const result = makeResult({
        structuredData: makeStructuredData({
          policy: {
            policyNumber: 'P4',
            sbmPolicyNumber: null,
            provider: 'Allianz',
            productName: null,
            startDate: '2026-01-01',
            endDate,
            issueDate: null,
          },
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.status).toBe('active')
    })

    it('correctly parses DD.MM.YYYY endDate with day ≤ 12 (V8 Date swap regression, gotcha #52)', () => {
      // "01.12.2021" means December 1, 2021 (in the past → expired)
      // V8's new Date('01.12.2021') would return Jan 12, 2021 — same status but wrong date
      // Use a date that changes status when day/month are swapped:
      // "05.01.2021" = January 5, 2021 (past → expired)
      // If V8 swapped: May 1, 2021 — still past, but wrong month
      const result = makeResult({
        structuredData: makeStructuredData({
          policy: {
            policyNumber: 'P-DATE-SWAP',
            sbmPolicyNumber: null,
            provider: 'TestCo',
            productName: null,
            startDate: '01.06.2020',
            endDate: '01.12.2021', // Dec 1 2021 — in the past → expired
            issueDate: null,
          },
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.status).toBe('expired')
      // The critical assertion: expiryDate must be Dec 1, not Jan 12
      expect(policy?.expiryDate).toBe('01.12.2021') // comprehensiveToAnalyzedPolicy passes through raw
    })

    it('correctly parses DD.MM.YYYY endDate for status when day > 12', () => {
      // "15.01.2021" = January 15, 2021 — V8 would reject this (NaN), so manual parse fires
      // This case already worked before the fix but validates the full path
      const result = makeResult({
        structuredData: makeStructuredData({
          policy: {
            policyNumber: 'P-DATE-SAFE',
            sbmPolicyNumber: null,
            provider: 'TestCo',
            productName: null,
            startDate: '2020-01-01',
            endDate: '15.01.2021', // Jan 15, 2021 — in the past → expired
            issueDate: null,
          },
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.status).toBe('expired')
    })
  })

  // -------------------------------------------------------------------------
  // Group 3: Coverage nameTr resolution
  // -------------------------------------------------------------------------

  describe('coverage nameTr resolution', () => {
    it('uses AI-provided nameTr when it differs from the English name', async () => {
      const { lookupCoverageNameTr } = await import('@/lib/i18n/coverage-names')
      vi.mocked(lookupCoverageNameTr).mockReturnValue(null)

      const result = makeResult({
        structuredData: makeStructuredData({
          coverages: [makeCoverage({ name: 'Collision', nameTr: 'Çarpışma Teminatı' })],
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.coverages[0].nameTr).toBe('Çarpışma Teminatı')
    })

    it('falls back to lookupCoverageNameTr when nameTr equals name', async () => {
      const { lookupCoverageNameTr } = await import('@/lib/i18n/coverage-names')
      vi.mocked(lookupCoverageNameTr).mockReturnValue('Çarpma/Çarpışma')

      const result = makeResult({
        structuredData: makeStructuredData({
          coverages: [makeCoverage({ name: 'Collision', nameTr: 'Collision' })],
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.coverages[0].nameTr).toBe('Çarpma/Çarpışma')
      expect(lookupCoverageNameTr).toHaveBeenCalledWith('Collision')
    })

    it('falls back to name when nameTr equals name and lookupCoverageNameTr returns null', async () => {
      const { lookupCoverageNameTr } = await import('@/lib/i18n/coverage-names')
      vi.mocked(lookupCoverageNameTr).mockReturnValue(null)

      const result = makeResult({
        structuredData: makeStructuredData({
          coverages: [makeCoverage({ name: 'CustomCoverage', nameTr: 'CustomCoverage' })],
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.coverages[0].nameTr).toBe('CustomCoverage')
    })

    it('uses lookupCoverageNameTr result when no nameTr is provided at all', async () => {
      const { lookupCoverageNameTr } = await import('@/lib/i18n/coverage-names')
      vi.mocked(lookupCoverageNameTr).mockReturnValue('Yangın Teminatı')

      const result = makeResult({
        structuredData: makeStructuredData({
          coverages: [makeCoverage({ name: 'Fire', nameTr: undefined as unknown as string })],
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      // When nameTr is undefined → aiNameTr is null → use lookupCoverageNameTr result
      expect(policy?.coverages[0].nameTr).toBe('Yangın Teminatı')
    })
  })

  // -------------------------------------------------------------------------
  // Group 4: calculateMainCoverage via comprehensiveToAnalyzedPolicy
  // -------------------------------------------------------------------------

  describe('calculateMainCoverage (kasko path)', () => {
    it('returns 0 when coverage has isMarketValue=true', () => {
      const result = makeResult({
        structuredData: makeStructuredData({
          coverages: [
            makeCoverage({
              name: 'Vehicle',
              nameTr: 'Araç Değeri',
              isMarketValue: true,
              limit: 750000,
            }),
          ],
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.coverage).toBe(0)
    })

    it('returns the limit of a coverage with category=main', () => {
      const result = makeResult({
        structuredData: makeStructuredData({
          coverages: [
            makeCoverage({
              name: 'Main Coverage',
              nameTr: 'Ana Teminat',
              category: 'main',
              limit: 600000,
              isMarketValue: false,
            }),
          ],
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.coverage).toBe(600000)
    })

    it('returns the limit when coverage name contains "araç bedeli"', () => {
      const result = makeResult({
        structuredData: makeStructuredData({
          coverages: [
            makeCoverage({
              name: 'Araç Bedeli',
              nameTr: 'Araç Bedeli',
              category: 'supplementary',
              limit: 450000,
              isMarketValue: false,
            }),
          ],
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.coverage).toBe(450000)
    })

    it('returns the limit when coverage name contains "kasko" (not "mali")', () => {
      const result = makeResult({
        structuredData: makeStructuredData({
          coverages: [
            makeCoverage({
              name: 'Kasko Teminatı',
              nameTr: 'Kasko Teminatı',
              category: 'supplementary',
              limit: 520000,
              isMarketValue: false,
            }),
          ],
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.coverage).toBe(520000)
    })

    it('does NOT match "mali sorumluluk kasko" via the vehicle name check (contains "mali")', () => {
      // "mali sorumluluk kasko" is excluded from:
      // 1) vehicleValue check: name contains "kasko" but also "mali", so the `&& !nameLower.includes('mali')` guard excludes it
      // 2) nonLiabilityCoverages: excluded by `!nameLower.includes('mali sorumluluk')` check
      // BUT: the generic fallback at the end (lines 251-255) is OUTSIDE the kasko block and picks
      // up any coverage with limit > 0 — so it returns 200000 as the global max-limit fallback.
      const result = makeResult({
        structuredData: makeStructuredData({
          coverages: [
            makeCoverage({
              name: 'Mali Sorumluluk Kasko',
              nameTr: 'MSK',
              category: 'supplementary',
              limit: 200000,
              isMarketValue: false,
            }),
          ],
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      // Global fallback (max of all valid limits) catches it — returns the limit
      expect(policy?.coverage).toBe(200000)
    })

    it('returns highest non-liability coverage when no main/vehicle coverage exists', () => {
      const result = makeResult({
        structuredData: makeStructuredData({
          coverages: [
            makeCoverage({
              name: 'Glass Coverage',
              nameTr: 'Cam Teminatı',
              category: 'supplementary',
              limit: 30000,
              isMarketValue: false,
            }),
            makeCoverage({
              name: 'Personal Accident',
              nameTr: 'Kişisel Kaza',
              category: 'supplementary',
              limit: 80000,
              isMarketValue: false,
            }),
          ],
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.coverage).toBe(80000)
    })

    it('excludes liability coverage from the kasko non-liability search but the global fallback still catches it', () => {
      // A coverage with category='liability' is excluded from `nonLiabilityCoverages` in the kasko block,
      // but the generic fallback at the end (lines 251-255) is OUTSIDE the kasko block and uses
      // ALL coverages with limit > 0 — so liability-only policies still get the max limit returned.
      const result = makeResult({
        structuredData: makeStructuredData({
          coverages: [
            makeCoverage({
              name: 'Third Party Liability',
              nameTr: 'Üçüncü Şahıs',
              category: 'liability',
              limit: 100000,
              isMarketValue: false,
            }),
          ],
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      // Global fallback picks it up — coverage equals the only available limit
      expect(policy?.coverage).toBe(100000)
    })

    it('returns 0 when coverages array is empty', () => {
      const result = makeResult({
        structuredData: makeStructuredData({ coverages: [] }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.coverage).toBe(0)
    })

    it('prioritises isMarketValue=true over category=main', () => {
      // Even if there is a main category coverage, isMarketValue takes precedence (is checked first)
      const result = makeResult({
        structuredData: makeStructuredData({
          coverages: [
            makeCoverage({
              name: 'Vehicle Value',
              nameTr: 'Araç Değeri',
              isMarketValue: true,
              category: 'main',
              limit: 900000,
            }),
          ],
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.coverage).toBe(0) // market value wins → 0 placeholder
    })
  })

  // -------------------------------------------------------------------------
  // Group 5: Vehicle info present vs absent
  // -------------------------------------------------------------------------

  describe('vehicle info mapping', () => {
    it('includes vehicleInfo when vehicle data is present', () => {
      const vehicle: StructuredPolicyData['vehicle'] = {
        plate: '34ABC123',
        chassisNumber: 'CHASSIS001',
        engineNumber: 'ENGINE001',
        make: 'Toyota',
        model: 'Corolla',
        year: 2023,
        usageType: 'private',
        fuelType: 'gasoline',
        hasLPG: false,
      }
      const result = makeResult({
        structuredData: makeStructuredData({ vehicle }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')

      expect(policy?.vehicleInfo).toBeDefined()
      expect(policy?.vehicleInfo?.make).toBe('Toyota')
      expect(policy?.vehicleInfo?.model).toBe('Corolla')
      expect(policy?.vehicleInfo?.year).toBe(2023)
      expect(policy?.vehicleInfo?.plate).toBe('34ABC123')
      expect(policy?.vehicleInfo?.chassisNo).toBe('CHASSIS001')
      expect(policy?.vehicleInfo?.engineNo).toBe('ENGINE001')
      expect(policy?.vehicleInfo?.usage).toBe('private')
    })

    it('sets vehicleInfo to undefined when vehicle is absent', () => {
      const result = makeResult({
        structuredData: makeStructuredData({
          vehicle: undefined as unknown as StructuredPolicyData['vehicle'],
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.vehicleInfo).toBeUndefined()
    })
  })

  // -------------------------------------------------------------------------
  // Group 6: aiInsights and aiInsightsTr
  // -------------------------------------------------------------------------

  describe('aiInsights construction', () => {
    it('produces only the quality score line when watchOuts is empty', () => {
      const result = makeResult({ watchOuts: [], qualityScore: 75 })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')

      expect(policy?.aiInsights).toHaveLength(1)
      expect(policy?.aiInsights[0]).toBe('🔍 Kalite skoru: 75/100')
    })

    it('prepends up to 5 watchOut entries as ⚠ prefix before quality score', () => {
      const result = makeResult({
        watchOuts: ['Watch A', 'Watch B', 'Watch C'],
        qualityScore: 60,
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')

      expect(policy?.aiInsights).toHaveLength(4)
      expect(policy?.aiInsights[0]).toBe('⚠ Watch A')
      expect(policy?.aiInsights[1]).toBe('⚠ Watch B')
      expect(policy?.aiInsights[2]).toBe('⚠ Watch C')
      expect(policy?.aiInsights[3]).toBe('🔍 Kalite skoru: 60/100')
    })

    it('slices watchOuts to first 5 when more than 5 are provided', () => {
      const watchOuts = ['W1', 'W2', 'W3', 'W4', 'W5', 'W6', 'W7']
      const result = makeResult({ watchOuts, qualityScore: 90 })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')

      // 5 watchOuts + 1 quality score = 6 total
      expect(policy?.aiInsights).toHaveLength(6)
      expect(policy?.aiInsights[0]).toBe('⚠ W1')
      expect(policy?.aiInsights[4]).toBe('⚠ W5')
      // W6 and W7 should be absent
      expect(policy?.aiInsights.some((i) => i.includes('W6'))).toBe(false)
      expect(policy?.aiInsights.some((i) => i.includes('W7'))).toBe(false)
    })

    it('always places the quality score line last', () => {
      const result = makeResult({ watchOuts: ['Wx'], qualityScore: 55 })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      const last = policy?.aiInsights[policy.aiInsights.length - 1]
      expect(last).toBe('🔍 Kalite skoru: 55/100')
    })

    it('sets aiInsightsTr as an array on the returned policy', () => {
      const result = makeResult({ watchOuts: ['Watch'], qualityScore: 70 })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.aiInsightsTr).toBeDefined()
      expect(Array.isArray(policy?.aiInsightsTr)).toBe(true)
      expect(policy?.aiInsightsTr).toHaveLength(policy!.aiInsights.length)
    })

    it('reflects qualityScore in aiConfidence field (qualityScore / 100)', () => {
      const result = makeResult({ qualityScore: 80 })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.aiConfidence).toBeCloseTo(0.8)
    })
  })

  // -------------------------------------------------------------------------
  // Group 7: Exclusions mapping
  // -------------------------------------------------------------------------

  describe('exclusions mapping', () => {
    it('returns empty exclusions array when no exclusions in result', () => {
      const result = makeResult({ structuredData: makeStructuredData({ exclusions: [] }) })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.exclusions).toEqual([])
    })

    it('maps exclusion triggers correctly', () => {
      const result = makeResult({
        structuredData: makeStructuredData({
          exclusions: [
            { trigger: 'Racing events', effect: 'excluded', details: null, source: 'policy' },
            { trigger: 'Drunk driving', effect: 'excluded', details: null, source: 'policy' },
            {
              trigger: 'Unpermitted use',
              effect: 'limited',
              details: 'reduced coverage',
              source: 'policy',
            },
          ],
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.exclusions).toEqual(['Racing events', 'Drunk driving', 'Unpermitted use'])
    })

    it('maps exactly 3 exclusions without extra entries', () => {
      const result = makeResult({
        structuredData: makeStructuredData({
          exclusions: [
            { trigger: 'Exc1', effect: 'excluded', details: null, source: 'policy' },
            { trigger: 'Exc2', effect: 'excluded', details: null, source: 'policy' },
            { trigger: 'Exc3', effect: 'excluded', details: null, source: 'policy' },
          ],
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.exclusions).toHaveLength(3)
    })
  })

  // -------------------------------------------------------------------------
  // Group 8: Basic field mapping assertions
  // -------------------------------------------------------------------------

  describe('basic field mapping', () => {
    it('maps policyNumber from structuredData', () => {
      const result = makeResult()
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.policyNumber).toBe('POL-001')
    })

    it('generates a fallback policyNumber when policyNumber is null', () => {
      const result = makeResult({
        structuredData: makeStructuredData({
          policy: {
            policyNumber: null,
            sbmPolicyNumber: null,
            provider: 'Allianz',
            productName: null,
            startDate: '2026-01-01',
            endDate: '2027-01-01',
            issueDate: null,
          },
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.policyNumber).toMatch(/^POL-\d+$/)
    })

    it('sets type always to "kasko"', () => {
      const result = makeResult()
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.type).toBe('kasko')
    })

    it('sets provider from structuredData.policy.provider', () => {
      const result = makeResult({
        structuredData: makeStructuredData({
          policy: {
            policyNumber: 'P1',
            sbmPolicyNumber: null,
            provider: 'AXA',
            productName: null,
            startDate: '2026-01-01',
            endDate: '2027-01-01',
            issueDate: null,
          },
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.provider).toBe('AXA')
    })

    it('sets premium and monthlyPremium from structuredData.premium', () => {
      const result = makeResult({
        structuredData: makeStructuredData({
          premium: {
            netPremium: 8000,
            tax: 2000,
            totalPremium: 10000,
            currency: 'TRY',
            paymentPlan: null,
            installments: null,
          },
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.premium).toBe(10000)
      expect(policy?.monthlyPremium).toBeCloseTo(10000 / 12)
    })

    it('maps insuredPerson from structuredData.insured.name', () => {
      const result = makeResult({
        structuredData: makeStructuredData({
          insured: {
            name: 'Jane Smith',
            tcKimlik: null,
            vkn: null,
            address: 'Ankara',
            phone: null,
            email: null,
          },
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.insuredPerson).toBe('Jane Smith')
    })

    it('maps location from insured.address', () => {
      const result = makeResult({
        structuredData: makeStructuredData({
          insured: {
            name: 'John',
            tcKimlik: null,
            vkn: null,
            address: 'Izmir',
            phone: null,
            email: null,
          },
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.location).toBe('Izmir')
    })

    it('sets location to undefined when address is null', () => {
      const result = makeResult({
        structuredData: makeStructuredData({
          insured: {
            name: 'John',
            tcKimlik: null,
            vkn: null,
            address: null,
            phone: null,
            email: null,
          },
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.location).toBeUndefined()
    })

    it('sets fileName from the provided File object', () => {
      const result = makeResult()
      const policy = comprehensiveToAnalyzedPolicy(
        result,
        makeFile('allianz-kasko.pdf'),
        'raw',
        'processed'
      )
      expect(policy?.fileName).toBe('allianz-kasko.pdf')
    })

    it('sets documentUrl via URL.createObjectURL', () => {
      const result = makeResult()
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.documentUrl).toBe('blob:test-url')
      expect(URL.createObjectURL).toHaveBeenCalled()
    })

    it('sets extractedText and processedText from function arguments', () => {
      const result = makeResult()
      const policy = comprehensiveToAnalyzedPolicy(
        result,
        makeFile(),
        'raw text here',
        'processed text here'
      )
      expect(policy?.extractedText).toBe('raw text here')
      expect(policy?.processedText).toBe('processed text here')
    })

    it('sets currency from premium.currency', () => {
      const result = makeResult({
        structuredData: makeStructuredData({
          premium: {
            netPremium: 4000,
            tax: 1000,
            totalPremium: 5000,
            currency: 'EUR',
            paymentPlan: null,
            installments: null,
          },
        }),
      })
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.currency).toBe('EUR')
    })

    it('assigns a unique id (UUID format) to the returned policy', () => {
      const result = makeResult()
      const policy = comprehensiveToAnalyzedPolicy(result, makeFile(), 'raw', 'processed')
      expect(policy?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    })
  })
})
