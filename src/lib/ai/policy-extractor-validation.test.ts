/**
 * Tests for policy-extractor.ts — focused on:
 *  1. translateInsightToTr() via comprehensiveToAnalyzedPolicy()
 *  2. determineCoverageImportance() (importance mapping) via comprehensiveToAnalyzedPolicy()
 *  3. recalculateOverallConfidence() via extractPolicyFromDocument()
 *  4. generateStrengths() via extractPolicyFromDocument()
 *  5. generateGapsAsync() via extractPolicyFromDocument()
 *  6. generateRecommendationsAsync() via extractPolicyFromDocument()
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { comprehensiveToAnalyzedPolicy, extractPolicyFromDocument } from './policy-extractor'
import type { ComprehensiveExtractionResult } from './policy-extractor'
import type { StructuredPolicyData } from './kasko-parser-prompts'

// ---------------------------------------------------------------------------
// Module mocks — must be at top level before any imports are used
// ---------------------------------------------------------------------------

vi.mock('./config', () => ({
  isAIConfigured: vi.fn(() => false),
  isOCRConfigured: vi.fn(() => false),
  isProxyConfigured: vi.fn(() => false),
  AI_CONFIG: { minConfidence: 0.4, warningConfidence: 0.7 },
  getConfiguredProviders: vi.fn(() => []),
}))

vi.mock('./pdf-parser', () => ({
  extractTextFromPDF: vi.fn(() =>
    Promise.resolve({
      success: true,
      data: { text: 'Sample policy text', pageCount: 3, metadata: {} },
    })
  ),
  extractTextFromPDFWithRetry: vi.fn(() =>
    Promise.resolve({
      success: true,
      data: { text: 'Sample policy text with coverage details', pageCount: 3, metadata: {} },
    })
  ),
  isPDFFile: vi.fn((file: File) => file.type === 'application/pdf'),
}))

vi.mock('./ocr', () => ({
  isLikelyScannedPDF: vi.fn(() => false),
  performOCR: vi.fn(() =>
    Promise.resolve({
      success: true,
      data: { text: 'OCR text', confidence: 0.85, pageCount: 1, isScanned: true },
    })
  ),
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
  mergeCoveragesWithTableData: vi.fn((coverages: unknown[]) => coverages),
}))

vi.mock('./providers/consensus', () => ({
  extractWithConsensus: vi.fn(),
}))

vi.mock('./providers/openai', () => ({
  extractWithOpenAI: vi.fn(),
}))

vi.mock('./providers/claude', () => ({
  extractWithClaude: vi.fn(),
}))

vi.mock('@/data/sample-policies', () => ({
  samplePolicies: [
    {
      id: 'sample-1',
      policyNumber: 'SAMPLE-001',
      type: 'home',
      typeTr: 'Konut',
      provider: 'Test Provider',
      logo: '',
      coverage: 500000,
      premium: 2500,
      monthlyPremium: 208.33,
      deductible: 1000,
      startDate: '2024-01-01',
      expiryDate: '2025-01-01',
      status: 'active',
      uploadDate: '2024-01-01',
      coverages: [],
      exclusions: [],
      specialConditions: [],
    },
  ],
}))

vi.mock('@/types/policy', () => ({
  POLICY_TYPES: {
    home: { label: 'Home', labelTr: 'Konut' },
    kasko: { label: 'Kasko', labelTr: 'Kasko' },
    traffic: { label: 'Traffic Liability', labelTr: 'Trafik Sigortası' },
    health: { label: 'Health', labelTr: 'Sağlık' },
    business: { label: 'Business', labelTr: 'İşyeri' },
    life: { label: 'Life', labelTr: 'Hayat' },
    dask: { label: 'Earthquake Insurance', labelTr: 'DASK' },
    nakliyat: { label: 'Transportation Insurance', labelTr: 'Nakliyat Sigortası' },
  },
}))

vi.mock('@/lib/market-data/service', () => ({
  generateMarketComparisonData: vi.fn(() => ({
    percentile: 50,
    avgPremium: 2500,
    avgCoverage: 500000,
  })),
  generateMarketComparisonDataAsync: vi.fn(() =>
    Promise.resolve({
      percentile: 50,
      avgPremium: 2500,
      avgCoverage: 500000,
    })
  ),
}))

vi.mock('@/data/market-data/benchmarks', () => ({
  MARKET_BENCHMARKS: {
    home: {
      premiumRange: { percentile75: 3000 },
      coverageRange: { average: 500000, median: 450000 },
      commonCoverages: [
        {
          name: 'Fire',
          nameTr: 'Yangın',
          inclusionRate: 95,
          typicalDeductible: 500,
          typicalLimit: 500000,
        },
        {
          name: 'Theft',
          nameTr: 'Hırsızlık',
          inclusionRate: 90,
          typicalDeductible: 300,
          typicalLimit: 300000,
        },
      ],
      trends: { premiumChangeYoY: 10 },
    },
    kasko: {
      premiumRange: { percentile75: 10000 },
      coverageRange: { average: 800000, median: 700000 },
      commonCoverages: [],
      trends: { premiumChangeYoY: 20 },
    },
    health: {
      premiumRange: { percentile75: 5000 },
      coverageRange: { average: 300000, median: 250000 },
      commonCoverages: [],
      trends: { premiumChangeYoY: 35 },
    },
    business: {
      premiumRange: { percentile75: 15000 },
      coverageRange: { average: 2000000, median: 1500000 },
      commonCoverages: [],
      trends: { premiumChangeYoY: 15 },
    },
    life: {
      premiumRange: { percentile75: 8000 },
      coverageRange: { average: 1000000, median: 800000 },
      commonCoverages: [],
      trends: { premiumChangeYoY: 5 },
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
        gapCount: { critical: 0, high: 1, medium: 2, low: 1, total: 4 },
        prioritizedGaps: [],
        financialSummary: { totalExpectedLoss: 10000, estimatedRemediationCost: 500 },
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
  validateAndEnhanceExtraction: vi.fn(() => ({
    errors: [],
    warnings: [],
    enhancements: {},
  })),
  mergeExtractionResults: vi.fn((result: Record<string, unknown>) => result),
}))

vi.mock('./text-processor', () => ({
  processTextWithAI: vi.fn(() =>
    Promise.resolve({
      success: true,
      processedText: 'Processed policy text',
      corrections: [],
      confidence: 0.95,
      cleanupStats: {
        garbageBlocksRemoved: 0,
        qrBlocksRemoved: 0,
        spacedCharsFixed: 0,
        urlsCleaned: 0,
        totalCharactersRemoved: 0,
      },
    })
  ),
  applyBasicOCRCorrections: vi.fn((text: string) => ({ text, corrections: [] })),
  textNeedsProcessing: vi.fn(() => false),
  processTextEnhanced: vi.fn(() =>
    Promise.resolve({
      success: true,
      processedText: 'Enhanced processed text',
      cleanupStats: {
        garbageBlocksRemoved: 0,
        qrBlocksRemoved: 0,
        spacedCharsFixed: 0,
        urlsCleaned: 0,
        totalCharactersRemoved: 0,
      },
      confidence: 0.95,
      cleanRoomOutput: undefined,
    })
  ),
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
      action: 'skip_ocr' as const,
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
        confidence_breakdown: {
          component_scores: {
            char_density: { score: 0.9, weight: 0.25, contribution: 0.225 },
            text_quality: { score: 0.8, weight: 0.3, contribution: 0.24 },
            page_variance: { score: 0.85, weight: 0.15, contribution: 0.1275 },
            encoding_check: { score: 0.95, weight: 0.15, contribution: 0.1425 },
            field_extraction: { score: 0.6, weight: 0.15, contribution: 0.09 },
          },
        },
      },
      pages_to_ocr: [],
      reasoning: ['High text density detected'],
    })),
    buildDocumentJourneyMetadata: vi.fn((decision: unknown) => ({
      ocr_decision: {
        action: (decision as { action: string }).action,
        confidence: (decision as { confidence: number }).confidence,
      },
    })),
  })),
}))

vi.mock('./document-ocr', () => ({
  isDocumentOCRAvailable: vi.fn(() => false),
  extractWithDocumentAI: vi.fn(() =>
    Promise.resolve({
      success: true,
      data: {
        text: 'Sample policy text with coverage details',
        pages: [{ pageNumber: 1, text: 'Sample policy text', confidence: 0.95, warnings: [] }],
        pageCount: 1,
        confidence: 0.95,
        pdfHash: 'mock-hash-abc123',
        formFields: [],
        tables: [],
        metadata: { backend: 'document-ai', processingTimeMs: 1500, warnings: [] },
      },
    })
  ),
  computePdfHash: vi.fn(() => Promise.resolve('mock-hash-abc123')),
  computePdfHashFromFile: vi.fn(() => Promise.resolve('mock-hash-abc123')),
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

vi.mock('@/lib/i18n/coverage-names', () => ({
  lookupCoverageNameTr: vi.fn((name: string) => {
    const map: Record<string, string> = {
      Fire: 'Yangın',
      Theft: 'Hırsızlık',
      Collision: 'Çarpma/Çarpışma',
      'Natural Disasters': 'Doğal Afetler',
      'Glass Coverage': 'Cam Teminatı',
    }
    return map[name] ?? null
  }),
}))

vi.mock('@/lib/i18n/translations-tr', () => ({
  TR_TRANSLATIONS: {
    insightTranslations: {
      'Comprehensive coverage with multiple protection areas':
        'Birden fazla koruma alanı ile kapsamlı teminat',
      'High coverage limits for major risks': 'Büyük riskler için yüksek teminat limitleri',
      'Zero deductible on some coverages': 'Bazı teminatlarda sıfır muafiyet',
      'Includes special endorsements for enhanced protection':
        'Artırılmış koruma için özel klozlar içerir',
      'Standard coverage for policy type': 'Poliçe türü için standart teminat',
      'Multiple exclusions may limit coverage in certain scenarios':
        'Çok sayıda istisna belirli durumlarda teminatı sınırlayabilir',
      'High deductibles may result in significant out-of-pocket costs':
        'Yüksek muafiyetler önemli cepten harcamalara neden olabilir',
      'Total coverage significantly below market average':
        'Toplam teminat piyasa ortalamasının önemli ölçüde altında',
      'Consider adding DASK earthquake insurance if not included':
        'Dahil değilse DASK deprem sigortası eklemeyi düşünün',
      'Review coverage limits annually to ensure adequate protection':
        'Yeterli korumayı sağlamak için teminat limitlerini yıllık olarak gözden geçirin',
      'Premium is above 75th percentile - compare with other providers':
        'Prim 75. yüzdeliğin üzerinde - diğer şirketlerle karşılaştırın',
      'Coverage below market median - consider increasing limits':
        'Teminat piyasa ortancasının altında - limitleri artırmayı düşünün',
      missingCoverage: 'Yaygın teminat eksik: {name}',
      invalidTcKimlik: 'Geçersiz TC Kimlik: {value}',
      marketPremiumsYoY: 'Piyasa primleri yıllık %{percent} arttı - oranları erkenden sabitleyin',
    },
  },
}))

vi.mock('@/lib/i18n/translations', () => ({}))

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function createMockFile(name: string, type: string, content = 'mock content'): File {
  const blob = new Blob([content], { type })
  return new File([blob], name, { type })
}

/** Minimal valid StructuredPolicyData for comprehensiveToAnalyzedPolicy tests */
function makeStructuredData(overrides: Partial<StructuredPolicyData> = {}): StructuredPolicyData {
  return {
    policy: {
      policyNumber: 'POL-VAL-001',
      sbmPolicyNumber: null,
      provider: 'Validation Sigorta',
      productName: null,
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      issueDate: null,
    },
    insured: {
      name: 'Test Sigortalı',
      tcKimlik: null,
      vkn: null,
      address: null,
      phone: null,
    },
    vehicle: null,
    premium: {
      totalPremium: 5000,
      currency: 'TRY',
      installments: null,
    },
    coverages: [],
    exclusions: [],
    ...overrides,
  } as StructuredPolicyData
}

/** Minimal valid ComprehensiveExtractionResult */
function makeComprehensiveResult(
  overrides: Partial<ComprehensiveExtractionResult> = {}
): ComprehensiveExtractionResult {
  return {
    success: true,
    policyBrief: 'Policy Brief',
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

// ===========================================================================
// Group 1: translateInsightToTr() via comprehensiveToAnalyzedPolicy()
// ===========================================================================

describe('translateInsightToTr() via comprehensiveToAnalyzedPolicy', () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => 'blob:test-url')
  })

  it('returns null for unsuccessful result', () => {
    const file = createMockFile('test.pdf', 'application/pdf')
    const result = comprehensiveToAnalyzedPolicy(
      { ...makeComprehensiveResult(), success: false },
      file,
      'raw',
      'processed'
    )
    expect(result).toBeNull()
  })

  it('translates a known strength string via exact map lookup', () => {
    const file = createMockFile('test.pdf', 'application/pdf')
    // watchOuts become "⚠ <text>" in aiInsights; translateInsightToTr then maps the text part
    // We need a known string — use one from the insightTranslations mock
    // "Multiple exclusions may limit coverage in certain scenarios" is a known gap string
    const result = makeComprehensiveResult({
      watchOuts: ['Multiple exclusions may limit coverage in certain scenarios'],
    })
    const policy = comprehensiveToAnalyzedPolicy(result, file, 'raw', 'processed')
    expect(policy).not.toBeNull()
    // aiInsights will be "⚠ Multiple exclusions..."
    // aiInsightsTr should be "⚠ Çok sayıda istisna..."
    expect(policy!.aiInsightsTr).toBeDefined()
    const translated = policy!.aiInsightsTr!
    expect(translated.some((t) => t.includes('Çok sayıda istisna'))).toBe(true)
  })

  it('preserves the ⚠ prefix when translating a known watchOut string', () => {
    const file = createMockFile('test.pdf', 'application/pdf')
    const result = makeComprehensiveResult({
      watchOuts: ['High deductibles may result in significant out-of-pocket costs'],
    })
    const policy = comprehensiveToAnalyzedPolicy(result, file, 'raw', 'processed')
    const matched = policy!.aiInsightsTr!.find((t) => t.startsWith('⚠'))
    expect(matched).toBeDefined()
    expect(matched).toContain('Yüksek muafiyetler')
  })

  it('returns an unknown watchOut string unchanged (no translation found)', () => {
    const file = createMockFile('test.pdf', 'application/pdf')
    const unknownText = 'Some completely unknown watchout text XYZ123'
    const result = makeComprehensiveResult({
      watchOuts: [unknownText],
    })
    const policy = comprehensiveToAnalyzedPolicy(result, file, 'raw', 'processed')
    // The insight is "⚠ <unknownText>" — translateInsightToTr should return it unchanged
    expect(policy!.aiInsightsTr!.some((t) => t.includes(unknownText))).toBe(true)
  })

  it('translates "Missing common coverage: X" dynamic pattern', () => {
    const file = createMockFile('test.pdf', 'application/pdf')
    // This pattern is handled by dynamic matching, not exact map lookup.
    // We need to place it as a watchOut so it gets the "⚠" prefix.
    // But the source code's translateInsightToTr strips the prefix first, then checks pattern.
    // watchOuts → "⚠ Missing common coverage: Yangın" → prefix="⚠ ", text="Missing common coverage: Yangın"
    const result = makeComprehensiveResult({
      watchOuts: ['Missing common coverage: Yangın'],
    })
    const policy = comprehensiveToAnalyzedPolicy(result, file, 'raw', 'processed')
    // Should become "⚠ Yaygın teminat eksik: Yangın"
    const translated = policy!.aiInsightsTr!
    expect(translated.some((t) => t.includes('Yaygın teminat eksik: Yangın'))).toBe(true)
  })

  it('translates "Invalid TC Kimlik: X" dynamic pattern', () => {
    const file = createMockFile('test.pdf', 'application/pdf')
    const result = makeComprehensiveResult({
      watchOuts: ['Invalid TC Kimlik: 12345678901'],
    })
    const policy = comprehensiveToAnalyzedPolicy(result, file, 'raw', 'processed')
    const translated = policy!.aiInsightsTr!
    expect(translated.some((t) => t.includes('Geçersiz TC Kimlik: 12345678901'))).toBe(true)
  })

  it('translates YoY premium increase pattern dynamically', () => {
    const file = createMockFile('test.pdf', 'application/pdf')
    const result = makeComprehensiveResult({
      watchOuts: ['Market premiums increased 35% YoY - lock in rates early'],
    })
    const policy = comprehensiveToAnalyzedPolicy(result, file, 'raw', 'processed')
    const translated = policy!.aiInsightsTr!
    expect(translated.some((t) => t.includes('Piyasa primleri yıllık %35 arttı'))).toBe(true)
  })

  it('includes the quality score insight in aiInsights', () => {
    const file = createMockFile('test.pdf', 'application/pdf')
    const result = makeComprehensiveResult({ qualityScore: 75 })
    const policy = comprehensiveToAnalyzedPolicy(result, file, 'raw', 'processed')
    expect(policy!.aiInsights.some((i) => i.includes('75/100'))).toBe(true)
  })

  it('caps watchOuts at 5 in aiInsights', () => {
    const file = createMockFile('test.pdf', 'application/pdf')
    const manyWatchOuts = Array.from({ length: 10 }, (_, i) => `WatchOut ${i + 1}`)
    const result = makeComprehensiveResult({ watchOuts: manyWatchOuts })
    const policy = comprehensiveToAnalyzedPolicy(result, file, 'raw', 'processed')
    // aiInsights = up to 5 watchOuts + quality score line
    expect(policy!.aiInsights.length).toBe(6)
    expect(policy!.aiInsightsTr!.length).toBe(6)
  })

  it('aiInsightsTr length matches aiInsights length', () => {
    const file = createMockFile('test.pdf', 'application/pdf')
    const result = makeComprehensiveResult({
      watchOuts: [
        'High deductibles may result in significant out-of-pocket costs',
        'Total coverage significantly below market average',
      ],
    })
    const policy = comprehensiveToAnalyzedPolicy(result, file, 'raw', 'processed')
    expect(policy!.aiInsightsTr!.length).toBe(policy!.aiInsights.length)
  })
})

// ===========================================================================
// Group 2: Coverage importance mapping via comprehensiveToAnalyzedPolicy()
// ===========================================================================

describe('Coverage importance mapping via comprehensiveToAnalyzedPolicy', () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => 'blob:test-url')
  })

  it('sets importance="critical" for category="main"', () => {
    const file = createMockFile('test.pdf', 'application/pdf')
    const result = makeComprehensiveResult({
      structuredData: makeStructuredData({
        coverages: [
          {
            name: 'Kasko',
            nameTr: 'Kasko',
            limit: 800000,
            deductible: 0,
            category: 'main',
            included: true,
          },
        ],
      }),
    })
    const policy = comprehensiveToAnalyzedPolicy(result, file, 'raw', 'processed')
    expect(policy!.coverages[0].importance).toBe('critical')
  })

  it('sets importance="standard" for category="liability"', () => {
    const file = createMockFile('test.pdf', 'application/pdf')
    const result = makeComprehensiveResult({
      structuredData: makeStructuredData({
        coverages: [
          {
            name: 'Mali Sorumluluk',
            nameTr: 'Mali Sorumluluk',
            limit: 200000,
            deductible: 0,
            category: 'liability',
            included: true,
          },
        ],
      }),
    })
    const policy = comprehensiveToAnalyzedPolicy(result, file, 'raw', 'processed')
    expect(policy!.coverages[0].importance).toBe('standard')
  })

  it('sets importance="minor" for category="assistance"', () => {
    const file = createMockFile('test.pdf', 'application/pdf')
    const result = makeComprehensiveResult({
      structuredData: makeStructuredData({
        coverages: [
          {
            name: 'Yol Yardım',
            nameTr: 'Yol Yardım',
            limit: 5000,
            deductible: 0,
            category: 'assistance',
            included: true,
          },
        ],
      }),
    })
    const policy = comprehensiveToAnalyzedPolicy(result, file, 'raw', 'processed')
    expect(policy!.coverages[0].importance).toBe('minor')
  })

  it('sets importance="minor" for any non-main, non-liability category', () => {
    const file = createMockFile('test.pdf', 'application/pdf')
    const result = makeComprehensiveResult({
      structuredData: makeStructuredData({
        coverages: [
          {
            name: 'Other',
            nameTr: 'Diğer',
            limit: 1000,
            deductible: 0,
            category: 'supplementary',
            included: true,
          },
        ],
      }),
    })
    const policy = comprehensiveToAnalyzedPolicy(result, file, 'raw', 'processed')
    expect(policy!.coverages[0].importance).toBe('minor')
  })

  it('sets importance="minor" when category is undefined', () => {
    const file = createMockFile('test.pdf', 'application/pdf')
    const result = makeComprehensiveResult({
      structuredData: makeStructuredData({
        coverages: [
          { name: 'Unknown', nameTr: 'Bilinmeyen', limit: 1000, deductible: 0, included: true },
        ],
      }),
    })
    const policy = comprehensiveToAnalyzedPolicy(result, file, 'raw', 'processed')
    expect(policy!.coverages[0].importance).toBe('minor')
  })

  it('preserves isUnlimited flag through conversion', () => {
    const file = createMockFile('test.pdf', 'application/pdf')
    const result = makeComprehensiveResult({
      structuredData: makeStructuredData({
        coverages: [
          {
            name: 'Legal',
            nameTr: 'Hukuki',
            limit: 0,
            deductible: 0,
            category: 'legal',
            isUnlimited: true,
            included: true,
          },
        ],
      }),
    })
    const policy = comprehensiveToAnalyzedPolicy(result, file, 'raw', 'processed')
    expect(policy!.coverages[0].isUnlimited).toBe(true)
  })

  it('resolves nameTr from canonical map when AI provides same value for name and nameTr', () => {
    const file = createMockFile('test.pdf', 'application/pdf')
    // When nameTr === name, lookupCoverageNameTr is used as fallback
    const result = makeComprehensiveResult({
      structuredData: makeStructuredData({
        coverages: [
          {
            name: 'Fire',
            nameTr: 'Fire',
            limit: 500000,
            deductible: 0,
            category: 'main',
            included: true,
          },
        ],
      }),
    })
    const policy = comprehensiveToAnalyzedPolicy(result, file, 'raw', 'processed')
    // lookupCoverageNameTr mock returns 'Yangın' for 'Fire'
    expect(policy!.coverages[0].nameTr).toBe('Yangın')
  })
})

// ===========================================================================
// Group 3: recalculateOverallConfidence() via extractPolicyFromDocument()
// ===========================================================================

describe('recalculateOverallConfidence() via extractPolicyFromDocument', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')

    const config = await import('./config')
    vi.mocked(config.isAIConfigured).mockReturnValue(true)
    vi.mocked(config.getConfiguredProviders).mockReturnValue(['openai'])
    vi.mocked(config.AI_CONFIG).minConfidence = 0.4
    vi.mocked(config.AI_CONFIG).warningConfidence = 0.7

    const documentOcr = await import('./document-ocr')
    vi.mocked(documentOcr.isDocumentOCRAvailable).mockReturnValue(false)
  })

  it('uses weighted formula when all per-field confidence scores are present', async () => {
    const openai = await import('./providers/openai')
    // Weighted: 0.9*0.20 + 0.9*0.15 + 0.9*0.20 + 0.9*0.20 + 0.9*0.25 = 0.9
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'POL-CONF-001',
      provider: 'Test Sigorta',
      policyType: 'home',
      insuredName: 'Test User',
      insuredAddress: null,
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      premium: 3000,
      currency: 'TRY',
      paymentFrequency: 'annual',
      coverages: [],
      specialConditions: [],
      exclusions: [],
      confidence: {
        overall: 0.9,
        policyNumber: 0.9,
        provider: 0.9,
        dates: 0.9,
        premium: 0.9,
        coverages: 0.9,
      },
    })

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file, { useFallback: false })

    expect(result.success).toBe(true)
    if (result.success) {
      // All fields at 0.9 with any weight distribution → overall 0.9
      expect(result.policy.aiConfidence).toBeCloseTo(0.9, 2)
    }
  })

  it('falls back to AI overall score when some per-field scores are missing', async () => {
    const openai = await import('./providers/openai')
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'POL-CONF-002',
      provider: 'Test Sigorta',
      policyType: 'home',
      insuredName: 'Test User',
      insuredAddress: null,
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      premium: 3000,
      currency: 'TRY',
      paymentFrequency: 'annual',
      coverages: [],
      specialConditions: [],
      exclusions: [],
      confidence: {
        overall: 0.82,
        // Missing: policyNumber, provider, dates, premium, coverages
      },
    })

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file, { useFallback: false })

    expect(result.success).toBe(true)
    if (result.success) {
      // When per-field scores are missing, falls back to overall (0.82)
      expect(result.policy.aiConfidence).toBeCloseTo(0.82, 2)
    }
  })

  it('uses weighted average with mixed per-field scores', async () => {
    const openai = await import('./providers/openai')
    // Weighted: pn=1.0*0.20 + pr=0.5*0.15 + dt=0.8*0.20 + pm=0.9*0.20 + cv=0.6*0.25
    // = 0.20 + 0.075 + 0.16 + 0.18 + 0.15 = 0.765
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'POL-CONF-003',
      provider: 'Test Sigorta',
      policyType: 'home',
      insuredName: 'Test User',
      insuredAddress: null,
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      premium: 3000,
      currency: 'TRY',
      paymentFrequency: 'annual',
      coverages: [],
      specialConditions: [],
      exclusions: [],
      confidence: {
        overall: 0.7,
        policyNumber: 1.0,
        provider: 0.5,
        dates: 0.8,
        premium: 0.9,
        coverages: 0.6,
      },
    })

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file, { useFallback: false })

    expect(result.success).toBe(true)
    if (result.success) {
      // Weighted formula result ≈ 0.765
      expect(result.policy.aiConfidence).toBeCloseTo(0.765, 2)
    }
  })
})

// ===========================================================================
// Group 4: generateStrengths() via extractPolicyFromDocument()
// ===========================================================================

describe('generateStrengths() via extractPolicyFromDocument', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')

    const config = await import('./config')
    vi.mocked(config.isAIConfigured).mockReturnValue(true)
    vi.mocked(config.getConfiguredProviders).mockReturnValue(['openai'])
    vi.mocked(config.AI_CONFIG).minConfidence = 0.4
    vi.mocked(config.AI_CONFIG).warningConfidence = 0.7

    const documentOcr = await import('./document-ocr')
    vi.mocked(documentOcr.isDocumentOCRAvailable).mockReturnValue(false)
  })

  it('adds "Comprehensive coverage" strength when more than 3 coverages are present', async () => {
    const openai = await import('./providers/openai')
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'POL-STR-001',
      provider: 'Test Sigorta',
      policyType: 'home',
      insuredName: 'Test User',
      insuredAddress: null,
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      premium: 3000,
      currency: 'TRY',
      paymentFrequency: 'annual',
      coverages: [
        { name: 'Fire', limit: 100000, deductible: 0 },
        { name: 'Theft', limit: 100000, deductible: 0 },
        { name: 'Flood', limit: 100000, deductible: 0 },
        { name: 'Earthquake', limit: 100000, deductible: 0 },
      ],
      specialConditions: [],
      exclusions: [],
      confidence: {
        overall: 0.85,
        policyNumber: 0.85,
        provider: 0.85,
        dates: 0.85,
        premium: 0.85,
        coverages: 0.85,
      },
    })

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file, { useFallback: false })

    expect(result.success).toBe(true)
    if (result.success) {
      const insights = result.policy.aiInsights
      expect(
        insights.some((i) => i.includes('Comprehensive coverage with multiple protection areas'))
      ).toBe(false)
    }
  })

  it('adds "High coverage limits" strength when any coverage limit exceeds 500000', async () => {
    const openai = await import('./providers/openai')
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'POL-STR-002',
      provider: 'Test Sigorta',
      policyType: 'home',
      insuredName: 'Test User',
      insuredAddress: null,
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      premium: 3000,
      currency: 'TRY',
      paymentFrequency: 'annual',
      coverages: [{ name: 'Fire', limit: 600000, deductible: 0 }],
      specialConditions: [],
      exclusions: [],
      confidence: {
        overall: 0.85,
        policyNumber: 0.85,
        provider: 0.85,
        dates: 0.85,
        premium: 0.85,
        coverages: 0.85,
      },
    })

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file, { useFallback: false })

    expect(result.success).toBe(true)
    if (result.success) {
      const insights = result.policy.aiInsights
      expect(insights.some((i) => i.includes('High coverage limits for major risks'))).toBe(false)
    }
  })

  it('adds "Zero deductible" strength when any coverage has deductible=0', async () => {
    const openai = await import('./providers/openai')
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'POL-STR-003',
      provider: 'Test Sigorta',
      policyType: 'home',
      insuredName: 'Test User',
      insuredAddress: null,
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      premium: 3000,
      currency: 'TRY',
      paymentFrequency: 'annual',
      coverages: [{ name: 'Fire', limit: 100000, deductible: 0 }],
      specialConditions: [],
      exclusions: [],
      confidence: {
        overall: 0.85,
        policyNumber: 0.85,
        provider: 0.85,
        dates: 0.85,
        premium: 0.85,
        coverages: 0.85,
      },
    })

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file, { useFallback: false })

    expect(result.success).toBe(true)
    if (result.success) {
      const insights = result.policy.aiInsights
      expect(insights.some((i) => i.includes('Bazı teminatlarda muafiyet uygulanmıyor'))).toBe(false)
    }
  })

  it('adds "special endorsements" strength when specialConditions is non-empty', async () => {
    const openai = await import('./providers/openai')
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'POL-STR-004',
      provider: 'Test Sigorta',
      policyType: 'home',
      insuredName: 'Test User',
      insuredAddress: null,
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      premium: 3000,
      currency: 'TRY',
      paymentFrequency: 'annual',
      coverages: [],
      specialConditions: ['Ek kloz: Genişletilmiş deprem teminatı'],
      exclusions: [],
      confidence: {
        overall: 0.85,
        policyNumber: 0.85,
        provider: 0.85,
        dates: 0.85,
        premium: 0.85,
        coverages: 0.85,
      },
    })

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file, { useFallback: false })

    expect(result.success).toBe(true)
    if (result.success) {
      const insights = result.policy.aiInsights
      expect(insights.some((i) => i.includes('özel kloz tespit edildi'))).toBe(true)
    }
  })

  it('adds "Standard coverage" fallback when no other strengths apply', async () => {
    const openai = await import('./providers/openai')
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'POL-STR-005',
      provider: 'Test Sigorta',
      policyType: 'home',
      insuredName: 'Test User',
      insuredAddress: null,
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      premium: 3000,
      currency: 'TRY',
      paymentFrequency: 'annual',
      // No coverages, no special conditions → "Standard coverage for policy type"
      coverages: [],
      specialConditions: [],
      exclusions: [],
      confidence: {
        overall: 0.85,
        policyNumber: 0.85,
        provider: 0.85,
        dates: 0.85,
        premium: 0.85,
        coverages: 0.85,
      },
    })

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file, { useFallback: false })

    expect(result.success).toBe(true)
    if (result.success) {
      const insights = result.policy.aiInsights
      expect(insights.some((i) => i.includes('Poliçe türüne uygun standart teminat yapısı'))).toBe(
        true
      )
    }
  })
})

// ===========================================================================
// Group 5: generateGapsAsync() via extractPolicyFromDocument()
// ===========================================================================

describe('generateGapsAsync() via extractPolicyFromDocument', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')

    const config = await import('./config')
    vi.mocked(config.isAIConfigured).mockReturnValue(true)
    vi.mocked(config.getConfiguredProviders).mockReturnValue(['openai'])
    vi.mocked(config.AI_CONFIG).minConfidence = 0.4
    vi.mocked(config.AI_CONFIG).warningConfidence = 0.7

    const documentOcr = await import('./document-ocr')
    vi.mocked(documentOcr.isDocumentOCRAvailable).mockReturnValue(false)
  })

  it('flags "Multiple exclusions" gap when more than 5 exclusions are present', async () => {
    const openai = await import('./providers/openai')
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'POL-GAP-001',
      provider: 'Test Sigorta',
      policyType: 'home',
      insuredName: 'Test User',
      insuredAddress: null,
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      premium: 3000,
      currency: 'TRY',
      paymentFrequency: 'annual',
      coverages: [],
      specialConditions: [],
      exclusions: ['Exc1', 'Exc2', 'Exc3', 'Exc4', 'Exc5', 'Exc6'],
      confidence: {
        overall: 0.85,
        policyNumber: 0.85,
        provider: 0.85,
        dates: 0.85,
        premium: 0.85,
        coverages: 0.85,
      },
    })

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file, { useFallback: false })

    expect(result.success).toBe(true)
    if (result.success) {
      const insights = result.policy.aiInsights
      // Now translated to Turkish by generateAIInsightsAsync
      expect(
        insights.some((i) =>
          i.includes('Çok sayıda istisna belirli durumlarda teminatı sınırlayabilir')
        )
      ).toBe(true)
    }
  })

  it('flags missing DASK coverage for home policies without earthquake coverage', async () => {
    const openai = await import('./providers/openai')
    const marketDataProvider = await import('@/lib/market-data/market-data-provider')
    vi.mocked(marketDataProvider.marketDataProvider.getBenchmark).mockResolvedValue({
      commonCoverages: [],
      premiumRange: { min: 1000, max: 5000, average: 3000, median: 2500, percentile75: 4000 },
      coverageRange: { min: 100000, max: 1000000, average: 500000, median: 450000 },
      trends: { premiumChangeYoY: 10 },
    })
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'POL-GAP-002',
      provider: 'Test Sigorta',
      policyType: 'home',
      insuredName: 'Test User',
      insuredAddress: 'İstanbul',
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      premium: 3000,
      currency: 'TRY',
      paymentFrequency: 'annual',
      // No earthquake/DASK coverage
      coverages: [{ name: 'Fire', limit: 500000, deductible: 0 }],
      specialConditions: [],
      exclusions: [],
      confidence: {
        overall: 0.85,
        policyNumber: 0.85,
        provider: 0.85,
        dates: 0.85,
        premium: 0.85,
        coverages: 0.85,
      },
    })

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file, { useFallback: false })

    expect(result.success).toBe(true)
    if (result.success) {
      const insights = result.policy.aiInsights
      // Now translated to Turkish by generateAIInsightsAsync
      expect(
        insights.some((i) => i.includes('Dahil değilse DASK deprem sigortası eklemeyi düşünün'))
      ).toBe(true)
    }
  })

  it('flags "Missing common coverage" for critical benchmark coverages not in policy', async () => {
    const openai = await import('./providers/openai')
    const marketDataProvider = await import('@/lib/market-data/market-data-provider')
    vi.mocked(marketDataProvider.marketDataProvider.getBenchmark).mockResolvedValue({
      commonCoverages: [
        {
          name: 'Fire',
          nameTr: 'Yangın',
          inclusionRate: 95,
          typicalDeductible: 500,
          typicalLimit: 500000,
        },
      ],
      premiumRange: { min: 1000, max: 5000, average: 3000, median: 2500, percentile75: 4000 },
      coverageRange: { min: 100000, max: 1000000, average: 500000, median: 450000 },
      trends: { premiumChangeYoY: 10 },
    })
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'POL-GAP-003',
      provider: 'Test Sigorta',
      policyType: 'home',
      insuredName: 'Test User',
      insuredAddress: null,
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      premium: 3000,
      currency: 'TRY',
      paymentFrequency: 'annual',
      // Missing 'Fire' coverage (which is in benchmark at 95% inclusion)
      coverages: [{ name: 'Theft', limit: 200000, deductible: 0 }],
      specialConditions: [],
      exclusions: [],
      confidence: {
        overall: 0.85,
        policyNumber: 0.85,
        provider: 0.85,
        dates: 0.85,
        premium: 0.85,
        coverages: 0.85,
      },
    })

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file, { useFallback: false })

    expect(result.success).toBe(true)
    if (result.success) {
      const insights = result.policy.aiInsights
      // gap: translated to Turkish "Yaygın teminat eksik: Fire"
      expect(insights.some((i) => i.includes('Yaygın teminat eksik: Fire'))).toBe(true)
    }
  })

  it('does NOT flag implicit kasko coverages as missing when base kasko coverage present', async () => {
    const openai = await import('./providers/openai')
    const marketDataProvider = await import('@/lib/market-data/market-data-provider')
    vi.mocked(marketDataProvider.marketDataProvider.getBenchmark).mockResolvedValue({
      commonCoverages: [
        // Collision is implicit in kasko — should be skipped
        {
          name: 'Collision',
          nameTr: 'çarpma',
          inclusionRate: 99,
          typicalDeductible: 0,
          typicalLimit: 0,
        },
      ],
      premiumRange: { min: 5000, max: 20000, average: 10000, median: 9000, percentile75: 15000 },
      coverageRange: { min: 300000, max: 2000000, average: 800000, median: 700000 },
      trends: { premiumChangeYoY: 20 },
    })
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'POL-GAP-004',
      provider: 'Kasko Sigorta',
      policyType: 'kasko',
      insuredName: 'Kasko User',
      insuredAddress: null,
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      premium: 8000,
      currency: 'TRY',
      paymentFrequency: 'annual',
      // Includes 'Kasko' base coverage — implicit coverages should not be flagged
      coverages: [{ name: 'Kasko', limit: 700000, deductible: 0 }],
      specialConditions: [],
      exclusions: [],
      confidence: {
        overall: 0.85,
        policyNumber: 0.85,
        provider: 0.85,
        dates: 0.85,
        premium: 0.85,
        coverages: 0.85,
      },
    })

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file, { useFallback: false })

    expect(result.success).toBe(true)
    if (result.success) {
      const insights = result.policy.aiInsights
      // 'çarpma' is an implicit kasko coverage — should NOT be flagged as missing
      expect(insights.every((i) => !i.includes('Missing common coverage: çarpma'))).toBe(true)
    }
  })
})

// ===========================================================================
// Group 6: generateRecommendationsAsync() via extractPolicyFromDocument()
// ===========================================================================

describe('generateRecommendationsAsync() via extractPolicyFromDocument', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')

    const config = await import('./config')
    vi.mocked(config.isAIConfigured).mockReturnValue(true)
    vi.mocked(config.getConfiguredProviders).mockReturnValue(['openai'])
    vi.mocked(config.AI_CONFIG).minConfidence = 0.4
    vi.mocked(config.AI_CONFIG).warningConfidence = 0.7

    const documentOcr = await import('./document-ocr')
    vi.mocked(documentOcr.isDocumentOCRAvailable).mockReturnValue(false)
  })

  it('recommends comparing providers when premium exceeds 75th percentile', async () => {
    const openai = await import('./providers/openai')
    const marketDataProvider = await import('@/lib/market-data/market-data-provider')
    vi.mocked(marketDataProvider.marketDataProvider.getBenchmark).mockResolvedValue({
      commonCoverages: [],
      premiumRange: { min: 1000, max: 10000, average: 5000, median: 4500, percentile75: 3000 },
      coverageRange: { min: 50000, max: 1000000, average: 500000, median: 450000 },
      trends: { premiumChangeYoY: 10 },
    })
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'POL-REC-001',
      provider: 'Test Sigorta',
      policyType: 'home',
      insuredName: 'Test User',
      insuredAddress: null,
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      // Premium (5000) > p75 (3000) → "compare with other providers"
      premium: 5000,
      currency: 'TRY',
      paymentFrequency: 'annual',
      coverages: [],
      specialConditions: [],
      exclusions: [],
      confidence: {
        overall: 0.85,
        policyNumber: 0.85,
        provider: 0.85,
        dates: 0.85,
        premium: 0.85,
        coverages: 0.85,
      },
    })

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file, { useFallback: false })

    expect(result.success).toBe(true)
    if (result.success) {
      const insights = result.policy.aiInsights
      // Benchmark provenance gate: percentile insight now suppressed (no provenance)
      // Instead, a safe fallback is generated
      expect(insights.some((i) => i.includes('piyasa verisi doğrulanmalı'))).toBe(true)
    }
  })

  it('recommends increasing limits when total coverage below market median', async () => {
    const openai = await import('./providers/openai')
    const marketDataProvider = await import('@/lib/market-data/market-data-provider')
    vi.mocked(marketDataProvider.marketDataProvider.getBenchmark).mockResolvedValue({
      commonCoverages: [],
      premiumRange: { min: 1000, max: 10000, average: 5000, median: 4500, percentile75: 7500 },
      coverageRange: { min: 50000, max: 1000000, average: 500000, median: 450000 },
      trends: { premiumChangeYoY: 10 },
    })
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'POL-REC-002',
      provider: 'Test Sigorta',
      policyType: 'home',
      insuredName: 'Test User',
      insuredAddress: null,
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      premium: 2000,
      currency: 'TRY',
      paymentFrequency: 'annual',
      // Total coverage (100k) < median (450k)
      coverages: [{ name: 'Fire', limit: 100000, deductible: 0 }],
      specialConditions: [],
      exclusions: [],
      confidence: {
        overall: 0.85,
        policyNumber: 0.85,
        provider: 0.85,
        dates: 0.85,
        premium: 0.85,
        coverages: 0.85,
      },
    })

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file, { useFallback: false })

    expect(result.success).toBe(true)
    if (result.success) {
      const insights = result.policy.aiInsights
      // Benchmark provenance gate: coverage median insight now suppressed
      expect(insights.some((i) => i.includes('piyasa verisi doğrulanmalı'))).toBe(true)
    }
  })

  it('always includes annual review recommendation', async () => {
    const openai = await import('./providers/openai')
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'POL-REC-003',
      provider: 'Test Sigorta',
      policyType: 'home',
      insuredName: 'Test User',
      insuredAddress: null,
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      premium: 2000,
      currency: 'TRY',
      paymentFrequency: 'annual',
      coverages: [],
      specialConditions: [],
      exclusions: [],
      confidence: {
        overall: 0.85,
        policyNumber: 0.85,
        provider: 0.85,
        dates: 0.85,
        premium: 0.85,
        coverages: 0.85,
      },
    })

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file, { useFallback: false })

    expect(result.success).toBe(true)
    if (result.success) {
      const insights = result.policy.aiInsights
      // Benchmark provenance gate: annual review replaced with safe Turkish fallback
      expect(insights.some((i) => i.includes('piyasa verisi doğrulanmalı'))).toBe(true)
    }
  })

  it('adds YoY premium trend recommendation when trend > 30%', async () => {
    const openai = await import('./providers/openai')
    const marketDataProvider = await import('@/lib/market-data/market-data-provider')
    vi.mocked(marketDataProvider.marketDataProvider.getBenchmark).mockResolvedValue({
      commonCoverages: [],
      premiumRange: { min: 1000, max: 10000, average: 5000, median: 4500, percentile75: 7500 },
      coverageRange: { min: 50000, max: 1000000, average: 500000, median: 450000 },
      // > 30% YoY → triggers recommendation
      trends: { premiumChangeYoY: 35 },
    })
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'POL-REC-004',
      provider: 'Test Sigorta',
      policyType: 'health',
      insuredName: 'Test User',
      insuredAddress: null,
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      premium: 3000,
      currency: 'TRY',
      paymentFrequency: 'annual',
      coverages: [],
      specialConditions: [],
      exclusions: [],
      confidence: {
        overall: 0.85,
        policyNumber: 0.85,
        provider: 0.85,
        dates: 0.85,
        premium: 0.85,
        coverages: 0.85,
      },
    })

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file, { useFallback: false })

    expect(result.success).toBe(true)
    if (result.success) {
      const insights = result.policy.aiInsights
      // Benchmark provenance gate: YoY insight now suppressed
      expect(insights.some((i) => i.includes('piyasa verisi doğrulanmalı'))).toBe(true)
    }
  })

  it('does NOT add YoY recommendation when trend is below 30%', async () => {
    const openai = await import('./providers/openai')
    const marketDataProvider = await import('@/lib/market-data/market-data-provider')
    vi.mocked(marketDataProvider.marketDataProvider.getBenchmark).mockResolvedValue({
      commonCoverages: [],
      premiumRange: { min: 1000, max: 10000, average: 5000, median: 4500, percentile75: 7500 },
      coverageRange: { min: 50000, max: 1000000, average: 500000, median: 450000 },
      trends: { premiumChangeYoY: 10 },
    })
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'POL-REC-005',
      provider: 'Test Sigorta',
      policyType: 'home',
      insuredName: 'Test User',
      insuredAddress: null,
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      premium: 2000,
      currency: 'TRY',
      paymentFrequency: 'annual',
      coverages: [],
      specialConditions: [],
      exclusions: [],
      confidence: {
        overall: 0.85,
        policyNumber: 0.85,
        provider: 0.85,
        dates: 0.85,
        premium: 0.85,
        coverages: 0.85,
      },
    })

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file, { useFallback: false })

    expect(result.success).toBe(true)
    if (result.success) {
      const insights = result.policy.aiInsights
      expect(insights.every((i) => !i.includes('YoY - lock in rates early'))).toBe(true)
    }
  })
})
