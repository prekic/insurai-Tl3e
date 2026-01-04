/**
 * Tests for Policy Extractor
 * Tests extractPolicyFromDocument and related functions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { extractPolicyFromDocument } from './policy-extractor'
import type { ExtractionOptions } from './policy-extractor'

// Mock dependencies
vi.mock('./config', () => ({
  isAIConfigured: vi.fn(() => false),
  isOCRConfigured: vi.fn(() => false),
  AI_CONFIG: { minConfidence: 0.7 },
  getConfiguredProviders: vi.fn(() => []),
}))

vi.mock('./pdf-parser', () => ({
  extractTextFromPDF: vi.fn(() =>
    Promise.resolve({
      success: true,
      data: { text: 'Sample policy text with coverage details', pageCount: 5, metadata: {} },
    })
  ),
  isPDFFile: vi.fn((file: File) => file.type === 'application/pdf'),
}))

vi.mock('./ocr', () => ({
  isLikelyScannedPDF: vi.fn(() => false),
  performOCR: vi.fn(() =>
    Promise.resolve({
      success: true,
      data: { text: 'OCR extracted text', confidence: 0.85, pageCount: 1, isScanned: true },
    })
  ),
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
    health: { label: 'Health', labelTr: 'Sağlık' },
    business: { label: 'Business', labelTr: 'İşyeri' },
    life: { label: 'Life', labelTr: 'Hayat' },
  },
}))

vi.mock('@/lib/market-data/service', () => ({
  generateMarketComparisonData: vi.fn(() => ({
    percentile: 50,
    avgPremium: 2500,
    avgCoverage: 500000,
  })),
}))

vi.mock('@/data/market-data/benchmarks', () => ({
  MARKET_BENCHMARKS: {
    home: {
      premiumRange: { percentile75: 3000 },
      coverageRange: { average: 500000, median: 450000 },
      commonCoverages: [
        { name: 'Fire', nameTr: 'Yangın', inclusionRate: 95, typicalDeductible: 500 },
        { name: 'Theft', nameTr: 'Hırsızlık', inclusionRate: 90, typicalDeductible: 300 },
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
    analyzePolicy: vi.fn(() => ({
      overallScore: 30,
      gapCount: { critical: 0, high: 1, medium: 2, low: 1, total: 4 },
      prioritizedGaps: [],
      financialSummary: { totalExpectedLoss: 10000, estimatedRemediationCost: 500 },
    })),
    getActionItems: vi.fn(() => []),
  },
}))

// Helper to create mock File
function createMockFile(name: string, type: string, content = 'mock content'): File {
  const blob = new Blob([content], { type })
  return new File([blob], name, { type })
}

// =============================================================================
// Basic Extraction Tests
// =============================================================================

describe('extractPolicyFromDocument', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Mock URL.createObjectURL
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('File Validation', () => {
    it('should reject non-PDF files', async () => {
      const file = createMockFile('document.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')

      const result = await extractPolicyFromDocument(file)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_FILE')
        expect(result.error.message).toContain('Only PDF files are supported')
      }
    })

    it('should accept PDF files', async () => {
      const file = createMockFile('policy.pdf', 'application/pdf')

      const result = await extractPolicyFromDocument(file)

      // Should use fallback since AI is not configured
      expect(result.success).toBe(true)
    })

    it('should include file type in error details for invalid files', async () => {
      const file = createMockFile('image.jpg', 'image/jpeg')

      const result = await extractPolicyFromDocument(file)

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.details).toContain('image/jpeg')
      }
    })

    it('should indicate fallback availability for invalid files', async () => {
      const file = createMockFile('document.txt', 'text/plain')

      const result = await extractPolicyFromDocument(file, { useFallback: true })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.fallbackAvailable).toBe(true)
      }
    })
  })

  describe('AI Configuration', () => {
    it('should use fallback when AI is not configured', async () => {
      const file = createMockFile('policy.pdf', 'application/pdf')

      const result = await extractPolicyFromDocument(file)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.source).toBe('fallback')
      }
    })

    it('should return error when AI not configured and fallback disabled', async () => {
      const file = createMockFile('policy.pdf', 'application/pdf')

      const result = await extractPolicyFromDocument(file, { useFallback: false })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('NO_AI_CONFIG')
        expect(result.error.message).toContain('not configured')
      }
    })

    it('should include setup instructions in AI config error', async () => {
      const file = createMockFile('policy.pdf', 'application/pdf')

      const result = await extractPolicyFromDocument(file, { useFallback: false })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.details).toContain('VITE_OPENAI_API_KEY')
      }
    })
  })

  describe('Fallback Behavior', () => {
    it('should use sample policy data in fallback', async () => {
      const file = createMockFile('policy.pdf', 'application/pdf')

      const result = await extractPolicyFromDocument(file)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.source).toBe('fallback')
        expect(result.policy).toBeDefined()
        expect(result.policy.policyNumber).toBe('SAMPLE-001')
      }
    })

    it('should generate unique ID for fallback policy', async () => {
      const file = createMockFile('policy.pdf', 'application/pdf')

      const result1 = await extractPolicyFromDocument(file)
      const result2 = await extractPolicyFromDocument(file)

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)
      if (result1.success && result2.success) {
        expect(result1.policy.id).not.toBe(result2.policy.id)
      }
    })

    it('should set document URL from file', async () => {
      const file = createMockFile('policy.pdf', 'application/pdf')

      const result = await extractPolicyFromDocument(file)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.policy.documentUrl).toBe('blob:mock-url')
      }
    })

    it('should set upload date to current date', async () => {
      const file = createMockFile('policy.pdf', 'application/pdf')
      const today = new Date().toISOString().split('T')[0]

      const result = await extractPolicyFromDocument(file)

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.policy.uploadDate).toBe(today)
      }
    })
  })

  describe('Options', () => {
    it('should respect useFallback option', async () => {
      const file = createMockFile('policy.pdf', 'application/pdf')

      const result = await extractPolicyFromDocument(file, { useFallback: false })

      expect(result.success).toBe(false)
    })

    it('should have default useFallback as true', async () => {
      const file = createMockFile('policy.pdf', 'application/pdf')

      const result = await extractPolicyFromDocument(file)

      expect(result.success).toBe(true)
    })

    it('should accept useOCR option', async () => {
      const file = createMockFile('policy.pdf', 'application/pdf')
      const options: ExtractionOptions = { useOCR: true }

      const result = await extractPolicyFromDocument(file, options)

      expect(result.success).toBe(true)
    })

    it('should accept useConsensus option', async () => {
      const file = createMockFile('policy.pdf', 'application/pdf')
      const options: ExtractionOptions = { useConsensus: true }

      const result = await extractPolicyFromDocument(file, options)

      expect(result.success).toBe(true)
    })

    it('should accept primaryProvider option', async () => {
      const file = createMockFile('policy.pdf', 'application/pdf')
      const options: ExtractionOptions = { primaryProvider: 'openai' }

      const result = await extractPolicyFromDocument(file, options)

      expect(result.success).toBe(true)
    })

    it('should accept providers array option', async () => {
      const file = createMockFile('policy.pdf', 'application/pdf')
      const options: ExtractionOptions = { providers: ['openai', 'anthropic'] }

      const result = await extractPolicyFromDocument(file, options)

      expect(result.success).toBe(true)
    })
  })
})

// =============================================================================
// AI Extraction Tests (with mocked AI configured)
// =============================================================================

describe('AI Extraction', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')

    // Configure AI as enabled
    const config = await import('./config')
    vi.mocked(config.isAIConfigured).mockReturnValue(true)
    vi.mocked(config.getConfiguredProviders).mockReturnValue(['openai'])
  })

  it('should extract policy with AI when configured', async () => {
    const openai = await import('./providers/openai')
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'POL-123',
      provider: 'Test Sigorta',
      policyType: 'home',
      insuredName: 'Test User',
      insuredAddress: 'Istanbul',
      startDate: '2024-01-01',
      endDate: '2025-01-01',
      premium: 3000,
      currency: 'TRY',
      paymentFrequency: 'annual',
      coverages: [
        { name: 'Fire', limit: 500000, deductible: 1000, description: 'Fire coverage' },
      ],
      specialConditions: ['Special condition 1'],
      exclusions: ['Exclusion 1'],
      confidence: {
        overall: 0.85,
        policyNumber: 0.9,
        provider: 0.9,
        dates: 0.85,
        premium: 0.8,
        coverages: 0.8,
      },
    })

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.source).toBe('ai')
      expect(result.policy.policyNumber).toBe('POL-123')
      expect(result.policy.provider).toBe('Test Sigorta')
    }
  })

  it('should fall back when confidence is too low', async () => {
    const config = await import('./config')
    vi.mocked(config.AI_CONFIG).minConfidence = 0.7

    const openai = await import('./providers/openai')
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: null,
      provider: null,
      policyType: null,
      insuredName: null,
      insuredAddress: null,
      startDate: null,
      endDate: null,
      premium: null,
      currency: null,
      paymentFrequency: null,
      coverages: [],
      specialConditions: [],
      exclusions: [],
      confidence: {
        overall: 0.3, // Below threshold
        policyNumber: 0.2,
        provider: 0.3,
        dates: 0.2,
        premium: 0.3,
        coverages: 0.4,
      },
    })

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.source).toBe('fallback')
    }
  })

  it('should use consensus when multiple providers available', async () => {
    const config = await import('./config')
    vi.mocked(config.getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])

    const consensus = await import('./providers/consensus')
    vi.mocked(consensus.extractWithConsensus).mockResolvedValue({
      data: {
        policyNumber: 'CONS-001',
        provider: 'Consensus Provider',
        policyType: 'home',
        insuredName: 'Test User',
        insuredAddress: 'Ankara',
        startDate: '2024-01-01',
        endDate: '2025-01-01',
        premium: 4000,
        currency: 'TRY',
        paymentFrequency: 'annual',
        coverages: [],
        specialConditions: [],
        exclusions: [],
        confidence: {
          overall: 0.9,
          policyNumber: 0.95,
          provider: 0.9,
          dates: 0.9,
          premium: 0.85,
          coverages: 0.85,
        },
      },
      consensus: {
        agreement: 0.9,
        score: 0.92,
        agreedFields: ['policyNumber', 'provider', 'premium', 'startDate', 'endDate'],
        disagreedFields: [],
      },
      primaryProvider: 'openai',
      providerResults: [
        { provider: 'openai', data: { policyNumber: 'CONS-001', provider: 'Consensus Provider', policyType: 'home', insuredName: 'Test User', insuredAddress: 'Ankara', startDate: '2024-01-01', endDate: '2025-01-01', premium: 4000, currency: 'TRY', paymentFrequency: 'annual', coverages: [], specialConditions: [], exclusions: [], confidence: { overall: 0.9, policyNumber: 0.95, provider: 0.9, dates: 0.9, premium: 0.85, coverages: 0.85 } } },
        { provider: 'anthropic', data: { policyNumber: 'CONS-001', provider: 'Consensus Provider', policyType: 'home', insuredName: 'Test User', insuredAddress: 'Ankara', startDate: '2024-01-01', endDate: '2025-01-01', premium: 4000, currency: 'TRY', paymentFrequency: 'annual', coverages: [], specialConditions: [], exclusions: [], confidence: { overall: 0.9, policyNumber: 0.95, provider: 0.9, dates: 0.9, premium: 0.85, coverages: 0.85 } } },
      ],
    })

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file, { useConsensus: true })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.consensus).toBeDefined()
      expect(result.consensus?.agreement).toBe(0.9)
    }
  })

  it('should handle AI extraction errors gracefully', async () => {
    const openai = await import('./providers/openai')
    vi.mocked(openai.extractWithOpenAI).mockRejectedValue(new Error('API rate limit exceeded'))

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file)

    expect(result.success).toBe(true) // Falls back
    if (result.success) {
      expect(result.source).toBe('fallback')
    }
  })

  it('should return error when AI fails and fallback disabled', async () => {
    const openai = await import('./providers/openai')
    vi.mocked(openai.extractWithOpenAI).mockRejectedValue(new Error('API error'))

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file, { useFallback: false })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('AI_ERROR')
      expect(result.error.details).toContain('API error')
    }
  })
})

// =============================================================================
// PDF Parsing Tests
// =============================================================================

describe('PDF Parsing', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')

    const config = await import('./config')
    vi.mocked(config.isAIConfigured).mockReturnValue(true)
    vi.mocked(config.getConfiguredProviders).mockReturnValue(['openai'])
  })

  it('should handle PDF parse errors with fallback', async () => {
    const pdfParser = await import('./pdf-parser')
    vi.mocked(pdfParser.extractTextFromPDF).mockResolvedValue({
      success: false,
      error: { code: 'PARSE_ERROR', message: 'Failed to parse PDF' },
    })

    const file = createMockFile('corrupted.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file)

    expect(result.success).toBe(true) // Uses fallback
    if (result.success) {
      expect(result.source).toBe('fallback')
    }
  })

  it('should return error when PDF parsing fails and fallback disabled', async () => {
    const pdfParser = await import('./pdf-parser')
    vi.mocked(pdfParser.extractTextFromPDF).mockResolvedValue({
      success: false,
      error: { code: 'PARSE_ERROR', message: 'PDF is encrypted' },
    })

    const file = createMockFile('encrypted.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file, { useFallback: false })

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('PDF_PARSE_ERROR')
    }
  })
})

// =============================================================================
// OCR Tests
// =============================================================================

describe('OCR Processing', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')

    const config = await import('./config')
    vi.mocked(config.isAIConfigured).mockReturnValue(true)
    vi.mocked(config.isOCRConfigured).mockReturnValue(true)
    vi.mocked(config.getConfiguredProviders).mockReturnValue(['openai'])
  })

  it('should use OCR for scanned PDFs', async () => {
    const pdfParser = await import('./pdf-parser')
    vi.mocked(pdfParser.extractTextFromPDF).mockResolvedValue({
      success: true,
      data: { text: '', pageCount: 5, metadata: {} }, // Empty text suggests scanned
    })

    const ocr = await import('./ocr')
    vi.mocked(ocr.isLikelyScannedPDF).mockReturnValue(true)
    vi.mocked(ocr.performOCR).mockResolvedValue({
      success: true,
      data: { text: 'OCR extracted policy content with details', confidence: 0.85, pageCount: 5, isScanned: true },
    })

    const openai = await import('./providers/openai')
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'OCR-001',
      provider: 'OCR Provider',
      policyType: 'home',
      insuredName: null,
      insuredAddress: null,
      startDate: null,
      endDate: null,
      premium: null,
      currency: null,
      paymentFrequency: null,
      coverages: [],
      specialConditions: [],
      exclusions: [],
      confidence: { overall: 0.8, policyNumber: 0.8, provider: 0.8, dates: 0.7, premium: 0.7, coverages: 0.7 },
    })

    const file = createMockFile('scanned.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file, { useOCR: true })

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.source).toBe('ocr')
    }
  })

  it('should use regular text if OCR produces less content', async () => {
    const pdfParser = await import('./pdf-parser')
    vi.mocked(pdfParser.extractTextFromPDF).mockResolvedValue({
      success: true,
      data: { text: 'Long text content from PDF parsing with many words', pageCount: 5, metadata: {} },
    })

    const ocr = await import('./ocr')
    vi.mocked(ocr.isLikelyScannedPDF).mockReturnValue(true)
    vi.mocked(ocr.performOCR).mockResolvedValue({
      success: true,
      data: { text: 'Short', confidence: 0.8, pageCount: 5, isScanned: true }, // Less content
    })

    const openai = await import('./providers/openai')
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'TEXT-001',
      provider: null,
      policyType: 'home',
      insuredName: null,
      insuredAddress: null,
      startDate: null,
      endDate: null,
      premium: null,
      currency: null,
      paymentFrequency: null,
      coverages: [],
      specialConditions: [],
      exclusions: [],
      confidence: { overall: 0.8, policyNumber: 0.8, provider: 0.5, dates: 0.7, premium: 0.7, coverages: 0.7 },
    })

    const file = createMockFile('mixed.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.source).toBe('ai') // Not OCR since regular text was better
    }
  })
})

// =============================================================================
// Policy Conversion Tests
// =============================================================================

describe('Policy Conversion', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')

    const config = await import('./config')
    vi.mocked(config.isAIConfigured).mockReturnValue(true)
    vi.mocked(config.getConfiguredProviders).mockReturnValue(['openai'])
  })

  it('should convert extracted data to AnalyzedPolicy format', async () => {
    const openai = await import('./providers/openai')
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'POL-456',
      provider: 'Allianz Sigorta',
      policyType: 'home',
      insuredName: 'Ahmet Yılmaz',
      insuredAddress: 'Istanbul, Turkey',
      startDate: '2024-01-15',
      endDate: '2025-01-15',
      premium: 3500,
      currency: 'TRY',
      paymentFrequency: 'annual',
      coverages: [
        { name: 'Yangın', limit: 750000, deductible: 2000, description: 'Fire coverage' },
        { name: 'Hırsızlık', limit: 100000, deductible: 500, description: null },
      ],
      specialConditions: ['24 saat destek'],
      exclusions: ['Savaş hasarları', 'Deprem (DASK kapsamında)'],
      confidence: {
        overall: 0.88,
        policyNumber: 0.95,
        provider: 0.9,
        dates: 0.9,
        premium: 0.85,
        coverages: 0.8,
      },
    })

    const file = createMockFile('policy.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file)

    expect(result.success).toBe(true)
    if (result.success) {
      const policy = result.policy

      expect(policy.policyNumber).toBe('POL-456')
      expect(policy.provider).toBe('Allianz Sigorta')
      expect(policy.type).toBe('home')
      expect(policy.typeTr).toBe('Konut')
      expect(policy.insuredPerson).toBe('Ahmet Yılmaz')
      expect(policy.location).toBe('Istanbul, Turkey')
      expect(policy.startDate).toBe('2024-01-15')
      expect(policy.expiryDate).toBe('2025-01-15')
      expect(policy.premium).toBe(3500)
      expect(policy.coverages).toHaveLength(2)
      expect(policy.exclusions).toHaveLength(2)
      expect(policy.specialConditions).toHaveLength(1)
      expect(policy.aiConfidence).toBe(0.88)
    }
  })

  it('should calculate status based on expiry date', async () => {
    const openai = await import('./providers/openai')

    // Expired policy
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'EXP-001',
      provider: 'Test',
      policyType: 'home',
      insuredName: null,
      insuredAddress: null,
      startDate: '2023-01-01',
      endDate: '2023-12-31', // Past date
      premium: 2000,
      currency: 'TRY',
      paymentFrequency: null,
      coverages: [],
      specialConditions: [],
      exclusions: [],
      confidence: { overall: 0.8, policyNumber: 0.8, provider: 0.8, dates: 0.8, premium: 0.8, coverages: 0.8 },
    })

    const file = createMockFile('expired.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.policy.status).toBe('expired')
    }
  })

  it('should mark policy as expiring when within 30 days', async () => {
    const openai = await import('./providers/openai')
    const nearFuture = new Date()
    nearFuture.setDate(nearFuture.getDate() + 15)

    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'EXP-002',
      provider: 'Test',
      policyType: 'home',
      insuredName: null,
      insuredAddress: null,
      startDate: '2024-01-01',
      endDate: nearFuture.toISOString().split('T')[0],
      premium: 2000,
      currency: 'TRY',
      paymentFrequency: null,
      coverages: [],
      specialConditions: [],
      exclusions: [],
      confidence: { overall: 0.8, policyNumber: 0.8, provider: 0.8, dates: 0.8, premium: 0.8, coverages: 0.8 },
    })

    const file = createMockFile('expiring.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.policy.status).toBe('expiring')
    }
  })

  it('should calculate total coverage from individual coverages', async () => {
    const openai = await import('./providers/openai')
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'COV-001',
      provider: 'Test',
      policyType: 'home',
      insuredName: null,
      insuredAddress: null,
      startDate: '2024-01-01',
      endDate: '2025-01-01',
      premium: 2000,
      currency: 'TRY',
      paymentFrequency: null,
      coverages: [
        { name: 'Fire', limit: 500000, deductible: 1000, description: null },
        { name: 'Theft', limit: 200000, deductible: 500, description: null },
        { name: 'Water', limit: 100000, deductible: 500, description: null },
      ],
      specialConditions: [],
      exclusions: [],
      confidence: { overall: 0.85, policyNumber: 0.9, provider: 0.8, dates: 0.85, premium: 0.8, coverages: 0.85 },
    })

    const file = createMockFile('coverage.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.policy.coverage).toBe(800000) // 500k + 200k + 100k
    }
  })

  it('should include AI insights in policy', async () => {
    const openai = await import('./providers/openai')
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'INS-001',
      provider: 'Test',
      policyType: 'home',
      insuredName: null,
      insuredAddress: null,
      startDate: '2024-01-01',
      endDate: '2025-01-01',
      premium: 2000,
      currency: 'TRY',
      paymentFrequency: null,
      coverages: [
        { name: 'Fire', limit: 600000, deductible: 0, description: null },
        { name: 'Theft', limit: 300000, deductible: 0, description: null },
        { name: 'Water', limit: 200000, deductible: 0, description: null },
        { name: 'Glass', limit: 50000, deductible: 0, description: null },
      ],
      specialConditions: ['24 hour support'],
      exclusions: [],
      confidence: { overall: 0.85, policyNumber: 0.9, provider: 0.8, dates: 0.85, premium: 0.8, coverages: 0.85 },
    })

    const file = createMockFile('insights.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.policy.aiInsights).toBeDefined()
      expect(Array.isArray(result.policy.aiInsights)).toBe(true)
    }
  })
})

// =============================================================================
// Market Comparison Tests
// =============================================================================

describe('Market Comparison', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')

    const config = await import('./config')
    vi.mocked(config.isAIConfigured).mockReturnValue(true)
    vi.mocked(config.getConfiguredProviders).mockReturnValue(['openai'])
  })

  it('should include market comparison data', async () => {
    const openai = await import('./providers/openai')
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'MKT-001',
      provider: 'Test',
      policyType: 'home',
      insuredName: null,
      insuredAddress: null,
      startDate: '2024-01-01',
      endDate: '2025-01-01',
      premium: 3000,
      currency: 'TRY',
      paymentFrequency: null,
      coverages: [{ name: 'Fire', limit: 500000, deductible: 1000, description: null }],
      specialConditions: [],
      exclusions: [],
      confidence: { overall: 0.85, policyNumber: 0.9, provider: 0.8, dates: 0.85, premium: 0.8, coverages: 0.85 },
    })

    const file = createMockFile('market.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.policy.marketComparison).toBeDefined()
    }
  })
})

// =============================================================================
// Risk Assessment Integration Tests
// =============================================================================

describe('Risk Assessment Integration', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url')

    const config = await import('./config')
    vi.mocked(config.isAIConfigured).mockReturnValue(true)
    vi.mocked(config.getConfiguredProviders).mockReturnValue(['openai'])
  })

  it('should include risk score in policy', async () => {
    const openai = await import('./providers/openai')
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'RISK-001',
      provider: 'Test',
      policyType: 'home',
      insuredName: null,
      insuredAddress: null,
      startDate: '2024-01-01',
      endDate: '2025-01-01',
      premium: 2000,
      currency: 'TRY',
      paymentFrequency: null,
      coverages: [],
      specialConditions: [],
      exclusions: [],
      confidence: { overall: 0.85, policyNumber: 0.9, provider: 0.8, dates: 0.85, premium: 0.8, coverages: 0.85 },
    })

    const file = createMockFile('risk.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.policy.riskScore).toBeDefined()
      expect(result.policy.riskScore?.overall).toBe(45)
      expect(result.policy.riskScore?.level).toBe('moderate')
    }
  })

  it('should include gap analysis in policy', async () => {
    const openai = await import('./providers/openai')
    vi.mocked(openai.extractWithOpenAI).mockResolvedValue({
      policyNumber: 'GAP-001',
      provider: 'Test',
      policyType: 'home',
      insuredName: null,
      insuredAddress: null,
      startDate: '2024-01-01',
      endDate: '2025-01-01',
      premium: 2000,
      currency: 'TRY',
      paymentFrequency: null,
      coverages: [],
      specialConditions: [],
      exclusions: [],
      confidence: { overall: 0.85, policyNumber: 0.9, provider: 0.8, dates: 0.85, premium: 0.8, coverages: 0.85 },
    })

    const file = createMockFile('gap.pdf', 'application/pdf')
    const result = await extractPolicyFromDocument(file)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.policy.gapAnalysis).toBeDefined()
      expect(result.policy.gapAnalysis?.overallScore).toBe(30)
      expect(result.policy.gapAnalysis?.totalCount).toBe(4)
    }
  })
})
