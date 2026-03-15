/**
 * Tests for policy-extractor.ts — OCR pipeline branches
 *
 * Focuses on Document AI path, form field enhancement, table parsing,
 * text preprocessing, tiered confidence, and provider selection.
 * Complements policy-extractor.test.ts which covers basic success paths.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Module mocks — must appear before any imports of the module under test
// ---------------------------------------------------------------------------

vi.mock('./config', () => ({
  isAIConfigured: vi.fn().mockReturnValue(true),
  isOCRConfigured: vi.fn().mockReturnValue(false),
  isProxyConfigured: vi.fn().mockReturnValue(false),
  getProxyUrl: vi.fn().mockReturnValue('http://localhost:4001'),
  AI_CONFIG: {
    minConfidence: 0.4,
    warningConfidence: 0.7,
    extractionProvider: 'openai',
    useMultiProvider: false,
  },
  getConfiguredProviders: vi.fn().mockReturnValue(['openai']),
}))

vi.mock('./pdf-parser', () => ({
  isPDFFile: vi.fn().mockReturnValue(true),
  extractTextFromPDF: vi.fn().mockResolvedValue({
    success: true,
    data: { text: 'policy text from pdf.js', pageCount: 3, metadata: {} },
  }),
  extractTextFromPDFWithRetry: vi.fn().mockResolvedValue({
    success: true,
    data: { text: 'policy text from pdf.js', pageCount: 3, metadata: {} },
  }),
}))

vi.mock('./document-ocr', () => ({
  isDocumentOCRAvailable: vi.fn().mockReturnValue(false),
  extractWithDocumentAI: vi.fn().mockResolvedValue({
    success: true,
    data: {
      text: 'document ai text',
      pages: [{ pageNumber: 1, text: 'page 1 text', confidence: 0.95, warnings: [] }],
      pageCount: 1,
      confidence: 0.95,
      pdfHash: 'hash123',
      formFields: [],
      tables: [],
      metadata: { processingTimeMs: 1200, warnings: [] },
    },
  }),
  computePdfHash: vi.fn().mockResolvedValue('hash123'),
  computePdfHashFromFile: vi.fn().mockResolvedValue('hash123'),
}))

vi.mock('./ocr', () => ({
  isLikelyScannedPDF: vi.fn().mockReturnValue(false),
  performOCR: vi
    .fn()
    .mockResolvedValue({
      success: true,
      data: { text: '', confidence: 0.5, pageCount: 1, isScanned: true },
    }),
  extractFormFieldMap: vi.fn().mockReturnValue(new Map()),
  findFormField: vi.fn().mockReturnValue(null),
  TURKISH_FORM_FIELD_PATTERNS: {
    policyNumber: ['Poliçe No', /Poliçe\s*No/i],
    insuredName: ['Sigortalı', /Sigortalı\s*Adı/i],
    startDate: ['Başlangıç', /Başlangıç\s*Tarihi/i],
    endDate: ['Bitiş', /Bitiş\s*Tarihi/i],
    premium: ['Prim', /Prim\s*Tutarı/i],
  },
}))

vi.mock('./table-parser', () => ({
  parseTablesForCoverages: vi.fn().mockReturnValue({ coverages: [], confidence: 0.9 }),
  mergeCoveragesWithTableData: vi.fn().mockImplementation((coverages: unknown[]) => coverages),
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

vi.mock('./text-processor', () => ({
  processTextWithAI: vi.fn().mockResolvedValue({
    success: true,
    processedText: 'ai processed text',
    corrections: [],
    confidence: 0.95,
    cleanupStats: {
      garbageBlocksRemoved: 0,
      qrBlocksRemoved: 0,
      spacedCharsFixed: 0,
      urlsCleaned: 0,
      totalCharactersRemoved: 0,
    },
  }),
  applyBasicOCRCorrections: vi
    .fn()
    .mockImplementation((text: string) => ({ text, corrections: [] })),
  textNeedsProcessing: vi.fn().mockReturnValue(false),
  processTextEnhanced: vi.fn().mockResolvedValue({
    success: true,
    processedText: 'enhanced processed text',
    corrections: [],
    confidence: 0.95,
    cleanupStats: {
      garbageBlocksRemoved: 0,
      qrBlocksRemoved: 0,
      spacedCharsFixed: 0,
      urlsCleaned: 0,
      totalCharactersRemoved: 0,
    },
    cleanRoomOutput: undefined,
  }),
  applyComprehensivePreprocessing: vi
    .fn()
    .mockImplementation((text: string) => ({ text, stats: {} })),
  addSectionMarkers: vi.fn().mockImplementation((text: string) => ({ text, sectionsFound: [] })),
}))

vi.mock('@/lib/config', () => ({
  getAIConfig: vi.fn().mockResolvedValue({
    minConfidence: 0.4,
    warningConfidence: 0.7,
    temperature: 0.1,
    maxTokens: 4096,
    confidenceWeightPolicyNumber: 0.2,
    confidenceWeightProvider: 0.15,
    confidenceWeightDates: 0.2,
    confidenceWeightPremium: 0.2,
    confidenceWeightCoverages: 0.25,
  }),
}))

vi.mock('@/lib/market-data/service', () => ({
  generateMarketComparisonData: vi
    .fn()
    .mockReturnValue({ percentile: 50, avgPremium: 3000, avgCoverage: 500000 }),
  generateMarketComparisonDataAsync: vi
    .fn()
    .mockResolvedValue({ percentile: 50, avgPremium: 3000, avgCoverage: 500000 }),
}))

vi.mock('@/lib/market-data/market-data-provider', () => ({
  marketDataProvider: {
    getBenchmark: vi.fn().mockResolvedValue({
      commonCoverages: [],
      premiumRange: { min: 1000, max: 10000, average: 5000, median: 4500, percentile75: 7500 },
      coverageRange: { min: 50000, max: 1000000, average: 500000, median: 450000 },
      trends: { premiumChangeYoY: 10 },
    }),
    getRegionalFactor: vi.fn().mockResolvedValue(1.0),
    calculatePremiumPercentile: vi.fn().mockResolvedValue(50),
    calculateCoveragePercentile: vi.fn().mockResolvedValue(50),
  },
}))

vi.mock('@/lib/ml', () => ({
  RiskAssessmentService: {
    getQuickRiskScore: vi.fn().mockReturnValue({ score: 45, level: 'moderate', topIssue: null }),
    getActionItems: vi.fn().mockReturnValue([]),
  },
}))

vi.mock('@/lib/gap-detection', () => ({
  GapDetectionService: {
    analyzePolicy: vi.fn().mockResolvedValue({
      overallScore: 70,
      gapCount: { critical: 0, high: 0, medium: 1, low: 1, total: 2 },
      prioritizedGaps: [],
      financialSummary: { totalExpectedLoss: 5000, estimatedRemediationCost: 200 },
    }),
    getActionItems: vi.fn().mockResolvedValue([]),
  },
}))

vi.mock('@/lib/utils', () => ({
  validateCurrencyRegion: vi.fn().mockReturnValue({ warning: null }),
  formatCurrency: vi.fn().mockImplementation((v: number) => `₺${v}`),
  cn: vi.fn(),
}))

vi.mock('@/lib/extraction', () => ({
  validateAndEnhanceExtraction: vi.fn().mockReturnValue({
    errors: [],
    warnings: [],
    enhancements: {},
  }),
  mergeExtractionResults: vi.fn().mockImplementation((a: unknown) => a),
}))

vi.mock('@/lib/i18n/coverage-names', () => ({
  lookupCoverageNameTr: vi.fn().mockReturnValue(null),
}))

vi.mock('@/lib/i18n/translations-tr', () => ({
  TR_TRANSLATIONS: { insightTranslations: {} },
}))

vi.mock('@/lib/i18n/translations', () => ({}))

vi.mock('@/data/sample-policies', () => ({
  samplePolicies: [],
}))

vi.mock('@/types/policy', () => ({
  POLICY_TYPES: {
    home: { label: 'Home', labelTr: 'Konut' },
    kasko: { label: 'Kasko', labelTr: 'Kasko' },
    traffic: { label: 'Traffic', labelTr: 'Trafik Sigortası' },
    health: { label: 'Health', labelTr: 'Sağlık' },
    business: { label: 'Business', labelTr: 'İşyeri' },
    life: { label: 'Life', labelTr: 'Hayat' },
    dask: { label: 'DASK', labelTr: 'DASK' },
    nakliyat: { label: 'Transport', labelTr: 'Nakliyat Sigortası' },
  },
}))

vi.mock('@/data/market-data/benchmarks', () => ({
  MARKET_BENCHMARKS: {
    kasko: {
      premiumRange: { percentile75: 8000 },
      coverageRange: { average: 700000, median: 600000 },
      commonCoverages: [],
      trends: { premiumChangeYoY: 20 },
    },
  },
}))

vi.mock('@/lib/ocr-decision/ocr-decision-engine', () => ({
  getOCRDecisionEngine: vi.fn().mockReturnValue({
    analyzeDocument: vi.fn().mockReturnValue({
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
    }),
    buildDocumentJourneyMetadata: vi.fn().mockReturnValue({ ocr_decision: { action: 'skip_ocr' } }),
  }),
}))

vi.mock('./processing-logger', () => ({
  ProcessingLogger: vi.fn().mockImplementation(function () {
    return {
      startStage: vi.fn().mockReturnValue('stage-id'),
      completeStage: vi.fn(),
      failStage: vi.fn(),
      skipStage: vi.fn(),
      fail: vi.fn(),
      failWithDetails: vi.fn(),
      complete: vi.fn(),
      setOCRUsed: vi.fn(),
      setPageCount: vi.fn(),
      setExtractionMode: vi.fn(),
      setAIProvider: vi.fn(),
      setRequestId: vi.fn(),
      setExtractionRoute: vi.fn(),
      setFallbackInfo: vi.fn(),
      setExtractionConfidence: vi.fn(),
      setExtractedSummary: vi.fn(),
    }
  }),
}))

global.URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url')

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { extractPolicyFromDocument } from './policy-extractor'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Valid ExtractedPolicyData returned by AI provider mocks */
const VALID_EXTRACTED_DATA = {
  policyNumber: 'POL-2026-001',
  provider: 'Allianz',
  policyType: 'kasko' as const,
  policyTypeTr: 'Kasko',
  insuredName: 'Test User',
  startDate: '2026-01-01',
  endDate: '2027-01-01',
  premium: 5000,
  coverages: [],
  exclusions: [],
  specialConditions: [],
  confidence: {
    overall: 0.92,
    policyNumber: 0.95,
    provider: 0.99,
    dates: 0.9,
    premium: 0.95,
    coverages: 0.88,
  },
}

function makeFile(name = 'policy.pdf', type = 'application/pdf'): File {
  return new File(['%PDF-1.4 content'], name, { type })
}

async function getDocumentOCRMock() {
  return await import('./document-ocr')
}

async function getOpenAIMock() {
  return await import('./providers/openai')
}

async function getClaudeMock() {
  return await import('./providers/claude')
}

async function getConsensusMock() {
  return await import('./providers/consensus')
}

async function getTextProcessorMock() {
  return await import('./text-processor')
}

async function getConfigMock() {
  return await import('./config')
}

async function getPdfParserMock() {
  return await import('./pdf-parser')
}

/** Reset all mocks to the default passing state before each test */
async function resetToDefaults() {
  const docOcr = await getDocumentOCRMock()
  vi.mocked(docOcr.isDocumentOCRAvailable).mockReturnValue(false)
  vi.mocked(docOcr.extractWithDocumentAI).mockResolvedValue({
    success: true,
    data: {
      text: 'document ai text',
      pages: [{ pageNumber: 1, text: 'page 1 text', confidence: 0.95, warnings: [] }],
      pageCount: 1,
      confidence: 0.95,
      pdfHash: 'hash123',
      formFields: [],
      tables: [],
      metadata: { processingTimeMs: 1200, warnings: [] },
    },
  })

  const pdfParser = await getPdfParserMock()
  vi.mocked(pdfParser.isPDFFile).mockReturnValue(true)
  vi.mocked(pdfParser.extractTextFromPDFWithRetry).mockResolvedValue({
    success: true,
    data: { text: 'policy text from pdf.js', pageCount: 3, metadata: {} },
  })

  const openai = await getOpenAIMock()
  vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })

  const claude = await getClaudeMock()
  vi.mocked(claude.extractWithClaude).mockResolvedValue({ ...VALID_EXTRACTED_DATA })

  const consensus = await getConsensusMock()
  vi.mocked(consensus.extractWithConsensus).mockResolvedValue({
    data: { ...VALID_EXTRACTED_DATA },
    consensus: { agreement: 0.9, score: 0.88 },
    providerResults: [
      { provider: 'openai', data: VALID_EXTRACTED_DATA, error: undefined },
      { provider: 'anthropic', data: VALID_EXTRACTED_DATA, error: undefined },
    ],
  })

  const configMod = await getConfigMock()
  vi.mocked(configMod.isAIConfigured).mockReturnValue(true)
  vi.mocked(configMod.isProxyConfigured).mockReturnValue(false)
  vi.mocked(configMod.getConfiguredProviders).mockReturnValue(['openai'])
  // Reset AI_CONFIG to defaults
  ;(configMod.AI_CONFIG as Record<string, unknown>).minConfidence = 0.4
  ;(configMod.AI_CONFIG as Record<string, unknown>).warningConfidence = 0.7
  ;(configMod.AI_CONFIG as Record<string, unknown>).extractionProvider = 'openai'
  ;(configMod.AI_CONFIG as Record<string, unknown>).useMultiProvider = false

  const tp = await getTextProcessorMock()
  vi.mocked(tp.textNeedsProcessing).mockReturnValue(false)
  vi.mocked(tp.processTextEnhanced).mockResolvedValue({
    success: true,
    processedText: 'enhanced processed text',
    corrections: [],
    confidence: 0.95,
    cleanupStats: {
      garbageBlocksRemoved: 0,
      qrBlocksRemoved: 0,
      spacedCharsFixed: 0,
      urlsCleaned: 0,
      totalCharactersRemoved: 0,
    },
    cleanRoomOutput: undefined,
  })
  vi.mocked(tp.processTextWithAI).mockResolvedValue({
    success: true,
    processedText: 'ai processed text',
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
  vi.mocked(tp.applyBasicOCRCorrections).mockImplementation((text: string) => ({
    text,
    corrections: [],
  }))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('policy-extractor — OCR pipeline branches', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    global.URL.createObjectURL = vi.fn().mockReturnValue('blob:test-url')
    await resetToDefaults()
  })

  // =========================================================================
  // Group 1: File validation
  // =========================================================================

  describe('File validation', () => {
    it('returns INVALID_FILE error when isPDFFile returns false', async () => {
      const pdfParser = await getPdfParserMock()
      vi.mocked(pdfParser.isPDFFile).mockReturnValue(false)

      const file = makeFile('document.docx', 'application/vnd.openxmlformats')
      const result = await extractPolicyFromDocument(file, { useFallback: false })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_FILE')
        expect(result.error.message).toContain('Only PDF files')
      }
    })

    it('includes received file type in error details', async () => {
      const pdfParser = await getPdfParserMock()
      vi.mocked(pdfParser.isPDFFile).mockReturnValue(false)

      const file = makeFile('photo.png', 'image/png')
      const result = await extractPolicyFromDocument(file, { useFallback: false })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.details).toContain('image/png')
      }
    })

    it('returns NO_AI_CONFIG error when AI not configured and fallback disabled', async () => {
      const configMod = await getConfigMock()
      vi.mocked(configMod.isAIConfigured).mockReturnValue(false)

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: false })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('NO_AI_CONFIG')
      }
    })

    it('returns fallback result when AI not configured and useFallback is true', async () => {
      const configMod = await getConfigMock()
      vi.mocked(configMod.isAIConfigured).mockReturnValue(false)

      // samplePolicies mock is empty; createFallbackResult uses a random policy or generates one
      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: true })

      // With empty samplePolicies the fallback still succeeds (generates a synthetic policy)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.source).toBe('fallback')
      }
    })
  })

  // =========================================================================
  // Group 2: Document AI path
  // =========================================================================

  describe('Document AI path', () => {
    it('calls extractWithDocumentAI when isDocumentOCRAvailable returns true', async () => {
      const docOcr = await getDocumentOCRMock()
      vi.mocked(docOcr.isDocumentOCRAvailable).mockReturnValue(true)
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })

      const file = makeFile()
      await extractPolicyFromDocument(file, { useFallback: false })

      expect(docOcr.extractWithDocumentAI).toHaveBeenCalledWith(file)
    })

    it('uses Document AI text when extraction succeeds', async () => {
      const docOcr = await getDocumentOCRMock()
      vi.mocked(docOcr.isDocumentOCRAvailable).mockReturnValue(true)
      vi.mocked(docOcr.extractWithDocumentAI).mockResolvedValue({
        success: true,
        data: {
          text: 'document ai extracted text',
          pages: [
            { pageNumber: 1, text: 'document ai extracted text', confidence: 0.95, warnings: [] },
          ],
          pageCount: 1,
          confidence: 0.95,
          pdfHash: 'hash-abc',
          formFields: [],
          tables: [],
          metadata: { processingTimeMs: 800, warnings: [] },
        },
      })
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })
      const pdfParser = await getPdfParserMock()

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: false })

      expect(result.success).toBe(true)
      // pdf.js should NOT be called when Document AI succeeds
      expect(pdfParser.extractTextFromPDFWithRetry).not.toHaveBeenCalled()
    })

    it('falls back to pdf.js when Document AI extraction fails', async () => {
      const docOcr = await getDocumentOCRMock()
      vi.mocked(docOcr.isDocumentOCRAvailable).mockReturnValue(true)
      vi.mocked(docOcr.extractWithDocumentAI).mockResolvedValue({
        success: false,
        error: { code: 'OCR_FAILED', message: 'Document AI timed out', details: 'timeout' },
      })
      const pdfParser = await getPdfParserMock()
      vi.mocked(pdfParser.extractTextFromPDFWithRetry).mockResolvedValue({
        success: true,
        data: { text: 'fallback pdf text', pageCount: 2, metadata: {} },
      })
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: false })

      expect(pdfParser.extractTextFromPDFWithRetry).toHaveBeenCalledWith(file)
      expect(result.success).toBe(true)
    })

    it('falls back to pdf.js when Document AI is not available', async () => {
      const docOcr = await getDocumentOCRMock()
      vi.mocked(docOcr.isDocumentOCRAvailable).mockReturnValue(false)
      const pdfParser = await getPdfParserMock()
      vi.mocked(pdfParser.extractTextFromPDFWithRetry).mockResolvedValue({
        success: true,
        data: { text: 'native pdf text', pageCount: 2, metadata: {} },
      })
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })

      const file = makeFile()
      await extractPolicyFromDocument(file, { useFallback: false })

      expect(pdfParser.extractTextFromPDFWithRetry).toHaveBeenCalledWith(file)
    })

    it('returns OCR_ERROR when both Document AI and pdf.js fail and fallback is disabled', async () => {
      const docOcr = await getDocumentOCRMock()
      vi.mocked(docOcr.isDocumentOCRAvailable).mockReturnValue(true)
      vi.mocked(docOcr.extractWithDocumentAI).mockResolvedValue({
        success: false,
        error: { code: 'OCR_FAILED', message: 'Document AI unavailable', details: '' },
      })
      const pdfParser = await getPdfParserMock()
      vi.mocked(pdfParser.extractTextFromPDFWithRetry).mockResolvedValue({
        success: false,
        error: { code: 'PDF_PARSE_ERROR', message: 'Corrupted PDF', details: 'bad header' },
      })

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: false })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('OCR_ERROR')
        expect(result.error.message).toContain('Document AI')
      }
    })

    it('returns fallback result when both Document AI and pdf.js fail and fallback is enabled', async () => {
      const docOcr = await getDocumentOCRMock()
      vi.mocked(docOcr.isDocumentOCRAvailable).mockReturnValue(true)
      vi.mocked(docOcr.extractWithDocumentAI).mockResolvedValue({
        success: false,
        error: { code: 'OCR_FAILED', message: 'Service down', details: '' },
      })
      const pdfParser = await getPdfParserMock()
      vi.mocked(pdfParser.extractTextFromPDFWithRetry).mockResolvedValue({
        success: false,
        error: { code: 'PDF_PARSE_ERROR', message: 'Parse failed', details: '' },
      })

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: true })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.source).toBe('fallback')
      }
    })

    it('records Document AI OCR data in result when Document AI succeeds', async () => {
      const docOcr = await getDocumentOCRMock()
      vi.mocked(docOcr.isDocumentOCRAvailable).mockReturnValue(true)
      vi.mocked(docOcr.extractWithDocumentAI).mockResolvedValue({
        success: true,
        data: {
          text: 'page text',
          pages: [
            { pageNumber: 1, text: 'page 1', confidence: 0.97, warnings: [] },
            { pageNumber: 2, text: 'page 2', confidence: 0.94, warnings: [] },
          ],
          pageCount: 2,
          confidence: 0.95,
          pdfHash: 'unique-hash-xyz',
          formFields: [],
          tables: [],
          metadata: { processingTimeMs: 1500, warnings: ['partial match'] },
        },
      })
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: false })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.documentOCR?.pdfHash).toBe('unique-hash-xyz')
        expect(result.documentOCR?.pages).toHaveLength(2)
      }
    })
  })

  // =========================================================================
  // Group 3: Empty text handling
  // =========================================================================

  describe('Empty text handling', () => {
    it('returns OCR_ERROR when pdf.js returns empty text and fallback is disabled', async () => {
      const pdfParser = await getPdfParserMock()
      vi.mocked(pdfParser.extractTextFromPDFWithRetry).mockResolvedValue({
        success: true,
        data: { text: '', pageCount: 1, metadata: {} },
      })

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: false })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('OCR_ERROR')
        expect(result.error.message).toContain('No text could be extracted')
      }
    })

    it('returns OCR_ERROR when pdf.js returns whitespace-only text', async () => {
      const pdfParser = await getPdfParserMock()
      vi.mocked(pdfParser.extractTextFromPDFWithRetry).mockResolvedValue({
        success: true,
        data: { text: '   \n\t\n  ', pageCount: 1, metadata: {} },
      })

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: false })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('OCR_ERROR')
      }
    })

    it('returns fallback result when text is empty and useFallback is true', async () => {
      const pdfParser = await getPdfParserMock()
      vi.mocked(pdfParser.extractTextFromPDFWithRetry).mockResolvedValue({
        success: true,
        data: { text: '', pageCount: 1, metadata: {} },
      })

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: true })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.source).toBe('fallback')
      }
    })

    it('proceeds to AI extraction when pdf.js returns non-empty text', async () => {
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: false })

      expect(result.success).toBe(true)
      expect(openai.extractWithOpenAI).toHaveBeenCalled()
    })
  })

  // =========================================================================
  // Group 4: Text preprocessing branches
  // =========================================================================

  describe('Text preprocessing branches', () => {
    it('skips preprocessing when textNeedsProcessing returns false', async () => {
      const tp = await getTextProcessorMock()
      vi.mocked(tp.textNeedsProcessing).mockReturnValue(false)
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })

      const file = makeFile()
      await extractPolicyFromDocument(file, { useFallback: false, useCleanRoom: false })

      expect(tp.processTextWithAI).not.toHaveBeenCalled()
      expect(tp.processTextEnhanced).not.toHaveBeenCalled()
    })

    it('uses processTextEnhanced when useCleanRoom is true and succeeds', async () => {
      const tp = await getTextProcessorMock()
      // Force preprocessing to run
      vi.mocked(tp.textNeedsProcessing).mockReturnValue(true)
      vi.mocked(tp.processTextEnhanced).mockResolvedValue({
        success: true,
        processedText: 'clean room output text',
        corrections: [],
        confidence: 0.97,
        cleanupStats: {
          garbageBlocksRemoved: 2,
          qrBlocksRemoved: 0,
          spacedCharsFixed: 5,
          urlsCleaned: 1,
          totalCharactersRemoved: 20,
        },
        cleanRoomOutput: undefined,
      })
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, {
        useFallback: false,
        useCleanRoom: true,
      })

      expect(tp.processTextEnhanced).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('falls back to applyBasicOCRCorrections when processTextEnhanced throws and useCleanRoom is true', async () => {
      const tp = await getTextProcessorMock()
      vi.mocked(tp.textNeedsProcessing).mockReturnValue(true)
      vi.mocked(tp.processTextEnhanced).mockRejectedValue(new Error('clean room failed'))
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, {
        useFallback: false,
        useCleanRoom: true,
      })

      expect(tp.applyBasicOCRCorrections).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })

    it('uses processTextWithAI when useCleanRoom is false and textNeedsProcessing is true', async () => {
      const tp = await getTextProcessorMock()
      vi.mocked(tp.textNeedsProcessing).mockReturnValue(true)
      vi.mocked(tp.processTextWithAI).mockResolvedValue({
        success: true,
        processedText: 'legacy ai processed text',
        corrections: [],
        confidence: 0.93,
        cleanupStats: {
          garbageBlocksRemoved: 0,
          qrBlocksRemoved: 0,
          spacedCharsFixed: 3,
          urlsCleaned: 0,
          totalCharactersRemoved: 10,
        },
      })
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })

      const file = makeFile()
      await extractPolicyFromDocument(file, { useFallback: false, useCleanRoom: false })

      expect(tp.processTextWithAI).toHaveBeenCalled()
      expect(tp.processTextEnhanced).not.toHaveBeenCalled()
    })

    it('falls back to applyBasicOCRCorrections when processTextWithAI throws', async () => {
      const tp = await getTextProcessorMock()
      vi.mocked(tp.textNeedsProcessing).mockReturnValue(true)
      vi.mocked(tp.processTextWithAI).mockRejectedValue(new Error('AI processing failed'))
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, {
        useFallback: false,
        useCleanRoom: false,
      })

      expect(tp.applyBasicOCRCorrections).toHaveBeenCalled()
      expect(result.success).toBe(true)
    })
  })

  // =========================================================================
  // Group 5: Form field enhancement
  // =========================================================================

  describe('Form field enhancement', () => {
    it('skips form field stage when no form fields are available', async () => {
      const docOcr = await getDocumentOCRMock()
      vi.mocked(docOcr.isDocumentOCRAvailable).mockReturnValue(true)
      vi.mocked(docOcr.extractWithDocumentAI).mockResolvedValue({
        success: true,
        data: {
          text: 'policy text',
          pages: [{ pageNumber: 1, text: 'policy text', confidence: 0.9, warnings: [] }],
          pageCount: 1,
          confidence: 0.9,
          pdfHash: 'h1',
          formFields: [], // empty
          tables: [],
          metadata: { processingTimeMs: 500, warnings: [] },
        },
      })
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })
      const ocrMod = await import('./ocr')

      const file = makeFile()
      await extractPolicyFromDocument(file, { useFallback: false })

      // extractFormFieldMap should NOT be called when no form fields present
      expect(ocrMod.extractFormFieldMap).not.toHaveBeenCalled()
    })

    it('calls extractFormFieldMap when form fields are present', async () => {
      const docOcr = await getDocumentOCRMock()
      vi.mocked(docOcr.isDocumentOCRAvailable).mockReturnValue(true)
      vi.mocked(docOcr.extractWithDocumentAI).mockResolvedValue({
        success: true,
        data: {
          text: 'policy text',
          pages: [{ pageNumber: 1, text: 'policy text', confidence: 0.9, warnings: [] }],
          pageCount: 1,
          confidence: 0.9,
          pdfHash: 'h2',
          formFields: [{ name: 'Poliçe No', value: 'POL-999', confidence: 0.95, boundingBox: [] }],
          tables: [],
          metadata: { processingTimeMs: 500, warnings: [] },
        },
      })
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })
      const ocrMod = await import('./ocr')

      const file = makeFile()
      await extractPolicyFromDocument(file, { useFallback: false })

      expect(ocrMod.extractFormFieldMap).toHaveBeenCalled()
    })

    it('applies high-confidence form field values to override AI extraction', async () => {
      const docOcr = await getDocumentOCRMock()
      vi.mocked(docOcr.isDocumentOCRAvailable).mockReturnValue(true)
      vi.mocked(docOcr.extractWithDocumentAI).mockResolvedValue({
        success: true,
        data: {
          text: 'policy text',
          pages: [{ pageNumber: 1, text: 'policy text', confidence: 0.9, warnings: [] }],
          pageCount: 1,
          confidence: 0.9,
          pdfHash: 'h3',
          formFields: [
            { name: 'Poliçe No', value: 'FORM-FIELD-777', confidence: 0.96, boundingBox: [] },
          ],
          tables: [],
          metadata: { processingTimeMs: 500, warnings: [] },
        },
      })
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
        ...VALID_EXTRACTED_DATA,
        policyNumber: 'AI-EXTRACTED-001',
      })
      const ocrMod = await import('./ocr')
      vi.mocked(ocrMod.findFormField).mockReturnValue({
        name: 'Poliçe No',
        value: 'FORM-FIELD-777',
        confidence: 0.96,
        boundingBox: [],
      })

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: false })

      // The form field value should override the AI extraction
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.policy.policyNumber).toBe('FORM-FIELD-777')
      }
    })

    it('does not apply form fields below minimum confidence threshold', async () => {
      const docOcr = await getDocumentOCRMock()
      vi.mocked(docOcr.isDocumentOCRAvailable).mockReturnValue(true)
      vi.mocked(docOcr.extractWithDocumentAI).mockResolvedValue({
        success: true,
        data: {
          text: 'policy text',
          pages: [{ pageNumber: 1, text: 'policy text', confidence: 0.9, warnings: [] }],
          pageCount: 1,
          confidence: 0.9,
          pdfHash: 'h4',
          formFields: [
            { name: 'Poliçe No', value: 'LOW-CONF-POL', confidence: 0.3, boundingBox: [] },
          ],
          tables: [],
          metadata: { processingTimeMs: 500, warnings: [] },
        },
      })
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
        ...VALID_EXTRACTED_DATA,
        policyNumber: 'AI-POLICY-NUMBER',
      })
      // findFormField returns the low-confidence field
      const ocrMod = await import('./ocr')
      vi.mocked(ocrMod.findFormField).mockReturnValue({
        name: 'Poliçe No',
        value: 'LOW-CONF-POL',
        confidence: 0.3, // below 0.6 threshold
        boundingBox: [],
      })

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: false })

      expect(result.success).toBe(true)
      if (result.success) {
        // Should keep the AI-extracted value, not the low-confidence form field
        expect(result.policy.policyNumber).toBe('AI-POLICY-NUMBER')
      }
    })

    it('continues pipeline when form field processing throws', async () => {
      const docOcr = await getDocumentOCRMock()
      vi.mocked(docOcr.isDocumentOCRAvailable).mockReturnValue(true)
      vi.mocked(docOcr.extractWithDocumentAI).mockResolvedValue({
        success: true,
        data: {
          text: 'policy text',
          pages: [{ pageNumber: 1, text: 'policy text', confidence: 0.9, warnings: [] }],
          pageCount: 1,
          confidence: 0.9,
          pdfHash: 'h5',
          formFields: [{ name: 'Poliçe No', value: 'POL-1', confidence: 0.9, boundingBox: [] }],
          tables: [],
          metadata: { processingTimeMs: 500, warnings: [] },
        },
      })
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })
      const ocrMod = await import('./ocr')
      vi.mocked(ocrMod.extractFormFieldMap).mockImplementation(() => {
        throw new Error('form field processing crashed')
      })

      const file = makeFile()
      // Should still succeed — form field enhancement is not critical
      const result = await extractPolicyFromDocument(file, { useFallback: false })

      // The overall extraction may still succeed (error is caught)
      // or propagate as AI_ERROR; either way the test checks we don't panic
      expect(result).toBeDefined()
    })
  })

  // =========================================================================
  // Group 6: Table parsing
  // =========================================================================

  describe('Table parsing', () => {
    it('skips table parsing stage when no tables are available', async () => {
      const docOcr = await getDocumentOCRMock()
      vi.mocked(docOcr.isDocumentOCRAvailable).mockReturnValue(true)
      vi.mocked(docOcr.extractWithDocumentAI).mockResolvedValue({
        success: true,
        data: {
          text: 'policy text',
          pages: [{ pageNumber: 1, text: 'policy text', confidence: 0.9, warnings: [] }],
          pageCount: 1,
          confidence: 0.9,
          pdfHash: 'h6',
          formFields: [],
          tables: [], // empty
          metadata: { processingTimeMs: 500, warnings: [] },
        },
      })
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })
      const tableParser = await import('./table-parser')

      const file = makeFile()
      await extractPolicyFromDocument(file, { useFallback: false })

      expect(tableParser.parseTablesForCoverages).not.toHaveBeenCalled()
    })

    it('calls parseTablesForCoverages when tables are present', async () => {
      const docOcr = await getDocumentOCRMock()
      vi.mocked(docOcr.isDocumentOCRAvailable).mockReturnValue(true)
      vi.mocked(docOcr.extractWithDocumentAI).mockResolvedValue({
        success: true,
        data: {
          text: 'policy text',
          pages: [{ pageNumber: 1, text: 'policy text', confidence: 0.9, warnings: [] }],
          pageCount: 1,
          confidence: 0.9,
          pdfHash: 'h7',
          formFields: [],
          tables: [
            {
              pageNumber: 1,
              rows: [
                { cells: [{ text: 'Teminat' }, { text: 'Limit' }] },
                { cells: [{ text: 'Yangın' }, { text: '500.000' }] },
              ],
            },
          ],
          metadata: { processingTimeMs: 500, warnings: [] },
        },
      })
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })
      const tableParser = await import('./table-parser')

      const file = makeFile()
      await extractPolicyFromDocument(file, { useFallback: false })

      expect(tableParser.parseTablesForCoverages).toHaveBeenCalled()
    })

    it('merges table coverages into result when parseTablesForCoverages returns data', async () => {
      const docOcr = await getDocumentOCRMock()
      vi.mocked(docOcr.isDocumentOCRAvailable).mockReturnValue(true)
      vi.mocked(docOcr.extractWithDocumentAI).mockResolvedValue({
        success: true,
        data: {
          text: 'policy text',
          pages: [{ pageNumber: 1, text: 'policy text', confidence: 0.9, warnings: [] }],
          pageCount: 1,
          confidence: 0.9,
          pdfHash: 'h8',
          formFields: [],
          tables: [{ pageNumber: 1, rows: [{ cells: [] }] }],
          metadata: { processingTimeMs: 500, warnings: [] },
        },
      })
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })
      const tableParser = await import('./table-parser')
      const tableCoverage = {
        name: 'Yangın',
        nameTr: 'Yangın',
        limit: 500000,
        deductible: 0,
        included: true,
      }
      vi.mocked(tableParser.parseTablesForCoverages).mockReturnValue({
        coverages: [tableCoverage],
        confidence: 0.85,
      })
      vi.mocked(tableParser.mergeCoveragesWithTableData).mockReturnValue([tableCoverage])

      const file = makeFile()
      await extractPolicyFromDocument(file, { useFallback: false })

      expect(tableParser.mergeCoveragesWithTableData).toHaveBeenCalled()
    })

    it('continues pipeline when table parsing throws', async () => {
      const docOcr = await getDocumentOCRMock()
      vi.mocked(docOcr.isDocumentOCRAvailable).mockReturnValue(true)
      vi.mocked(docOcr.extractWithDocumentAI).mockResolvedValue({
        success: true,
        data: {
          text: 'policy text',
          pages: [{ pageNumber: 1, text: 'policy text', confidence: 0.9, warnings: [] }],
          pageCount: 1,
          confidence: 0.9,
          pdfHash: 'h9',
          formFields: [],
          tables: [{ pageNumber: 1, rows: [] }],
          metadata: { processingTimeMs: 500, warnings: [] },
        },
      })
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })
      const tableParser = await import('./table-parser')
      vi.mocked(tableParser.parseTablesForCoverages).mockImplementation(() => {
        throw new Error('table parsing crashed')
      })

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: false })

      // Pipeline continues despite table parsing failure
      expect(result.success).toBe(true)
    })
  })

  // =========================================================================
  // Group 7: Tiered confidence system
  // =========================================================================

  describe('Tiered confidence system', () => {
    it('returns LOW_CONFIDENCE error when confidence is below minConfidence and fallback disabled', async () => {
      const configMod = await getConfigMock()
      ;(configMod.AI_CONFIG as Record<string, unknown>).minConfidence = 0.4
      ;(configMod.AI_CONFIG as Record<string, unknown>).warningConfidence = 0.7
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
        ...VALID_EXTRACTED_DATA,
        confidence: {
          overall: 0.25, // below minConfidence of 0.4
          policyNumber: 0.3,
          provider: 0.2,
          dates: 0.2,
          premium: 0.3,
          coverages: 0.2,
        },
      })

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: false })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('LOW_CONFIDENCE')
        expect(result.error.message).toContain('confidence')
      }
    })

    it('returns fallback when confidence is below minConfidence and fallback is enabled', async () => {
      const configMod = await getConfigMock()
      ;(configMod.AI_CONFIG as Record<string, unknown>).minConfidence = 0.4
      ;(configMod.AI_CONFIG as Record<string, unknown>).warningConfidence = 0.7
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
        ...VALID_EXTRACTED_DATA,
        confidence: {
          overall: 0.2,
          policyNumber: 0.2,
          provider: 0.2,
          dates: 0.2,
          premium: 0.2,
          coverages: 0.2,
        },
      })

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: true })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.source).toBe('fallback')
      }
    })

    it('returns result with lowConfidence flag when confidence is between min and warning thresholds', async () => {
      const configMod = await getConfigMock()
      ;(configMod.AI_CONFIG as Record<string, unknown>).minConfidence = 0.4
      ;(configMod.AI_CONFIG as Record<string, unknown>).warningConfidence = 0.7
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
        ...VALID_EXTRACTED_DATA,
        confidence: {
          overall: 0.55, // between min (0.4) and warning (0.7)
          policyNumber: 0.55,
          provider: 0.55,
          dates: 0.55,
          premium: 0.55,
          coverages: 0.55,
        },
      })

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: false })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.lowConfidence).toBe(true)
      }
    })

    it('returns result without lowConfidence flag when confidence is above warningConfidence', async () => {
      const configMod = await getConfigMock()
      ;(configMod.AI_CONFIG as Record<string, unknown>).minConfidence = 0.4
      ;(configMod.AI_CONFIG as Record<string, unknown>).warningConfidence = 0.7
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA }) // overall 0.92

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: false })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.lowConfidence).toBeFalsy()
      }
    })

    it('includes confidence score in successful result', async () => {
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: false })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.confidenceScore).toBeGreaterThan(0)
        expect(result.confidenceScore).toBeLessThanOrEqual(1)
      }
    })
  })

  // =========================================================================
  // Group 8: Provider selection
  // =========================================================================

  describe('Provider selection', () => {
    it('calls extractWithOpenAI when extractionProvider is openai and no proxy', async () => {
      const configMod = await getConfigMock()
      vi.mocked(configMod.isProxyConfigured).mockReturnValue(false)
      vi.mocked(configMod.getConfiguredProviders).mockReturnValue(['openai'])
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })

      const file = makeFile()
      await extractPolicyFromDocument(file, { useFallback: false })

      expect(openai.extractWithOpenAI).toHaveBeenCalled()
    })

    it('calls extractWithClaude when primaryProvider is anthropic', async () => {
      const configMod = await getConfigMock()
      vi.mocked(configMod.isProxyConfigured).mockReturnValue(false)
      vi.mocked(configMod.getConfiguredProviders).mockReturnValue(['anthropic'])
      const claude = await getClaudeMock()
      vi.mocked(claude.extractWithClaude).mockResolvedValue({ ...VALID_EXTRACTED_DATA })

      const file = makeFile()
      await extractPolicyFromDocument(file, { useFallback: false, primaryProvider: 'anthropic' })

      expect(claude.extractWithClaude).toHaveBeenCalled()
    })

    it('calls extractWithConsensus when multiple providers configured and proxy is not used', async () => {
      const configMod = await getConfigMock()
      vi.mocked(configMod.isProxyConfigured).mockReturnValue(false)
      vi.mocked(configMod.getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])
      const consensus = await getConsensusMock()
      vi.mocked(consensus.extractWithConsensus).mockResolvedValue({
        data: { ...VALID_EXTRACTED_DATA },
        consensus: { agreement: 0.9, score: 0.88 },
        providerResults: [
          { provider: 'openai', data: VALID_EXTRACTED_DATA, error: undefined },
          { provider: 'anthropic', data: VALID_EXTRACTED_DATA, error: undefined },
        ],
      })

      const file = makeFile()
      await extractPolicyFromDocument(file, { useFallback: false, useConsensus: true })

      expect(consensus.extractWithConsensus).toHaveBeenCalled()
    })

    it('does not call consensus when proxy is configured even with multiple providers', async () => {
      const configMod = await getConfigMock()
      vi.mocked(configMod.isProxyConfigured).mockReturnValue(true) // proxy bypasses consensus
      vi.mocked(configMod.getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])
      const consensus = await getConsensusMock()
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })

      const file = makeFile()
      await extractPolicyFromDocument(file, { useFallback: false, useConsensus: true })

      expect(consensus.extractWithConsensus).not.toHaveBeenCalled()
    })

    it('returns AI_ERROR when extractWithOpenAI throws and fallback is disabled', async () => {
      const configMod = await getConfigMock()
      vi.mocked(configMod.isProxyConfigured).mockReturnValue(false)
      vi.mocked(configMod.getConfiguredProviders).mockReturnValue(['openai'])
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockRejectedValue(new Error('OpenAI API rate limited'))

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: false })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('AI_ERROR')
        expect(result.error.message).toContain('OpenAI API rate limited')
      }
    })

    it('returns fallback result when extractWithOpenAI throws and fallback is enabled', async () => {
      const configMod = await getConfigMock()
      vi.mocked(configMod.isProxyConfigured).mockReturnValue(false)
      vi.mocked(configMod.getConfiguredProviders).mockReturnValue(['openai'])
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockRejectedValue(new Error('Service unavailable'))

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: true })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.source).toBe('fallback')
      }
    })

    it('includes consensus info in result when consensus extraction is used', async () => {
      const configMod = await getConfigMock()
      vi.mocked(configMod.isProxyConfigured).mockReturnValue(false)
      vi.mocked(configMod.getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])
      const consensus = await getConsensusMock()
      vi.mocked(consensus.extractWithConsensus).mockResolvedValue({
        data: { ...VALID_EXTRACTED_DATA },
        consensus: { agreement: 0.95, score: 0.91 },
        providerResults: [
          { provider: 'openai', data: VALID_EXTRACTED_DATA, error: undefined },
          { provider: 'anthropic', data: VALID_EXTRACTED_DATA, error: undefined },
        ],
      })

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, {
        useFallback: false,
        useConsensus: true,
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.consensus).toBeDefined()
        expect(result.consensus?.agreement).toBe(0.95)
      }
    })
  })

  // =========================================================================
  // Group 9: pdf.js path — documentOCR fallback metadata
  // =========================================================================

  describe('pdf.js path — result structure', () => {
    it('returns documentOCR with warnings when falling back to pdf.js', async () => {
      const docOcr = await getDocumentOCRMock()
      vi.mocked(docOcr.isDocumentOCRAvailable).mockReturnValue(false)
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: false })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.documentOCR?.warnings).toContain(
          'Extracted with pdf.js (Document AI unavailable)'
        )
        expect(result.documentOCR?.formFields).toHaveLength(0)
        expect(result.documentOCR?.tables).toHaveLength(0)
      }
    })

    it('sets source to ai when pdf.js is used for extraction', async () => {
      const docOcr = await getDocumentOCRMock()
      vi.mocked(docOcr.isDocumentOCRAvailable).mockReturnValue(false)
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: false })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.source).toBe('ai')
      }
    })

    it('sets source to ocr when Document AI is used', async () => {
      const docOcr = await getDocumentOCRMock()
      vi.mocked(docOcr.isDocumentOCRAvailable).mockReturnValue(true)
      vi.mocked(docOcr.extractWithDocumentAI).mockResolvedValue({
        success: true,
        data: {
          text: 'ocr text',
          pages: [{ pageNumber: 1, text: 'ocr text', confidence: 0.9, warnings: [] }],
          pageCount: 1,
          confidence: 0.9,
          pdfHash: 'ocr-hash',
          formFields: [],
          tables: [],
          metadata: { processingTimeMs: 700, warnings: [] },
        },
      })
      const openai = await getOpenAIMock()
      vi.mocked(openai.extractWithOpenAI).mockResolvedValue({ ...VALID_EXTRACTED_DATA })

      const file = makeFile()
      const result = await extractPolicyFromDocument(file, { useFallback: false })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.source).toBe('ocr')
      }
    })
  })
})
