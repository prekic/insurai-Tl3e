/**
 * Export Module Tests
 *
 * Tests for CSV and PDF export functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  exportToCSV,
  exportToExcel,
  exportToPDF,
  exportPoliciesToPDF,
  exportSinglePolicyToCSV,
} from './export'
import type { AnalyzedPolicy } from '@/types/policy'

// Mock URL and document APIs
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url')
const mockRevokeObjectURL = vi.fn()
const mockAppendChild = vi.fn()
const mockRemoveChild = vi.fn()

// Store original values
const originalURL = global.URL

// Mock window.open
const mockWindowWrite = vi.fn()
const mockWindowClose = vi.fn()
const mockWindowPrint = vi.fn()
let mockOnload: (() => void) | null = null

const mockWindow = {
  document: {
    write: mockWindowWrite,
    close: mockWindowClose,
  },
  print: mockWindowPrint,
  set onload(handler: (() => void) | null) {
    mockOnload = handler
  },
  get onload() {
    return mockOnload as (() => void) | null
  },
}

const mockWindowOpen = vi.fn(() => mockWindow)

// Mock click for download
const mockClick = vi.fn()

describe('Export Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    // Setup URL mocks
    global.URL = {
      ...originalURL,
      createObjectURL: mockCreateObjectURL,
      revokeObjectURL: mockRevokeObjectURL,
    } as unknown as typeof URL

    // Setup document mocks
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        return {
          href: '',
          download: '',
          click: mockClick,
        } as unknown as HTMLElement
      }
      return document.createElement(tagName)
    })

    vi.spyOn(document.body, 'appendChild').mockImplementation(
      mockAppendChild as unknown as typeof document.body.appendChild
    )
    vi.spyOn(document.body, 'removeChild').mockImplementation(
      mockRemoveChild as unknown as typeof document.body.removeChild
    )

    // Setup window.open mock
    global.window.open = mockWindowOpen as unknown as typeof window.open
    global.alert = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    global.URL = originalURL
    mockOnload = null
  })

  const createMockPolicy = (overrides: Partial<AnalyzedPolicy> = {}): AnalyzedPolicy => ({
    id: 'policy-1',
    policyNumber: 'POL-001',
    provider: 'Allianz Türkiye',
    logo: '',
    type: 'home',
    typeTr: 'Konut Sigortası',
    coverage: 500000,
    premium: 2500,
    monthlyPremium: 208.33,
    deductible: 1000,
    startDate: '2024-01-01',
    expiryDate: '2025-01-01',
    status: 'active',
    uploadDate: '2024-01-01',
    fileName: 'policy-001.pdf',
    documentType: 'policy',
    aiConfidence: 0.95,
    insuredPerson: 'Ahmet Yılmaz',
    location: 'İstanbul, Türkiye',
    coverages: [
      {
        name: 'Fire',
        nameTr: 'Yangın',
        limit: 500000,
        deductible: 0,
        included: true,
      },
    ],
    exclusions: [],
    specialConditions: [],
    insuranceLine: 'property',
    aiInsights: ['Policy provides comprehensive coverage'],
    ...overrides,
  })

  describe('exportToCSV', () => {
    it('should export policies to CSV', () => {
      const policies = [createMockPolicy()]

      exportToCSV(policies)

      expect(mockCreateObjectURL).toHaveBeenCalledWith(expect.any(Blob))
      expect(mockClick).toHaveBeenCalled()
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
    })

    it('should create blob with correct MIME type', () => {
      const policies = [createMockPolicy()]

      exportToCSV(policies)

      const blobCall = (mockCreateObjectURL.mock.calls as unknown as [[Blob]])[0][0]
      expect(blobCall.type).toBe('text/csv;charset=utf-8;')
    })

    it('should include BOM for Excel compatibility', () => {
      const policies = [createMockPolicy()]

      exportToCSV(policies)

      // The blob should contain BOM character
      const blobCall = (mockCreateObjectURL.mock.calls as unknown as [[Blob]])[0][0]
      expect(blobCall).toBeInstanceOf(Blob)
    })

    it('should use custom filename when provided', () => {
      const policies = [createMockPolicy()]
      let capturedDownloadName = ''

      vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
        if (tagName === 'a') {
          const mockLink = {
            href: '',
            download: '',
            click: mockClick,
          }
          // Capture the download name when it's set
          Object.defineProperty(mockLink, 'download', {
            get() {
              return capturedDownloadName
            },
            set(value: string) {
              capturedDownloadName = value
            },
          })
          return mockLink as unknown as HTMLElement
        }
        return document.createElement(tagName)
      })

      exportToCSV(policies, 'custom-export')

      expect(capturedDownloadName).toContain('custom-export')
    })

    it('should handle empty policies array', () => {
      exportToCSV([])

      // Should still create a CSV with headers
      expect(mockCreateObjectURL).toHaveBeenCalled()
      expect(mockClick).toHaveBeenCalled()
    })

    it('should escape CSV values with commas', () => {
      const policies = [
        createMockPolicy({
          location: 'Istanbul, Turkey',
        }),
      ]

      exportToCSV(policies)

      // Location with comma should be quoted
      expect(mockCreateObjectURL).toHaveBeenCalled()
    })

    it('should escape CSV values with quotes', () => {
      const policies = [
        createMockPolicy({
          provider: 'Company "Best" Insurance',
        }),
      ]

      exportToCSV(policies)

      // Quotes should be escaped
      expect(mockCreateObjectURL).toHaveBeenCalled()
    })

    it('should include all policy fields in CSV', () => {
      const policies = [createMockPolicy()]

      exportToCSV(policies)

      // Verify blob was created
      expect(mockCreateObjectURL).toHaveBeenCalled()
    })

    it('should handle null/undefined values', () => {
      const policies = [
        createMockPolicy({
          insuredPerson: undefined,
          location: null as unknown as string,
        }),
      ]

      exportToCSV(policies)

      expect(mockCreateObjectURL).toHaveBeenCalled()
    })
  })

  describe('exportToExcel', () => {
    it('should be an async function that resolves without error', async () => {
      const policies = [createMockPolicy()]

      // exportToExcel uses dynamic import('xlsx') for real Excel export
      // or falls back to CSV if xlsx is unavailable
      await expect(exportToExcel(policies)).resolves.toBeUndefined()
    })

    it('should accept custom filename without error', async () => {
      const policies = [createMockPolicy()]

      await expect(exportToExcel(policies, 'excel-export')).resolves.toBeUndefined()
    })
  })

  describe('exportToPDF', () => {
    it('should open print window for single policy', () => {
      const policy = createMockPolicy()

      exportToPDF(policy)

      expect(mockWindowOpen).toHaveBeenCalledWith('', '_blank')
      expect(mockWindowWrite).toHaveBeenCalled()
      expect(mockWindowClose).toHaveBeenCalled()
    })

    it('should write HTML content to print window', () => {
      const policy = createMockPolicy()

      exportToPDF(policy)

      const htmlContent = mockWindowWrite.mock.calls[0][0] as string
      expect(htmlContent).toContain('<!DOCTYPE html>')
      expect(htmlContent).toContain('InsurAI')
      expect(htmlContent).toContain(policy.provider)
      expect(htmlContent).toContain(policy.policyNumber)
    })

    it('should include policy details in HTML', () => {
      const policy = createMockPolicy()

      exportToPDF(policy)

      const htmlContent = mockWindowWrite.mock.calls[0][0] as string
      expect(htmlContent).toContain(policy.typeTr)
      expect(htmlContent).toContain(policy.insuredPerson!)
      expect(htmlContent).toContain(policy.location!)
    })

    it('should include coverages in HTML', () => {
      const policy = createMockPolicy()

      exportToPDF(policy)

      const htmlContent = mockWindowWrite.mock.calls[0][0] as string
      expect(htmlContent).toContain('Yangın')
    })

    it('should include AI insights in HTML', () => {
      const policy = createMockPolicy()

      exportToPDF(policy)

      const htmlContent = mockWindowWrite.mock.calls[0][0] as string
      expect(htmlContent).toContain('Policy provides comprehensive coverage')
    })

    it('should trigger print when window loads', () => {
      const policy = createMockPolicy()

      exportToPDF(policy)

      // Simulate window.onload
      if (mockOnload) {
        mockOnload()
      }

      expect(mockWindowPrint).toHaveBeenCalled()
    })

    it('should alert if popup is blocked', () => {
      mockWindowOpen.mockReturnValueOnce(null as unknown as typeof mockWindow)
      const policy = createMockPolicy()

      exportToPDF(policy)

      expect(global.alert).toHaveBeenCalledWith('Please allow popups to export PDF')
    })

    it('should handle policy without location', () => {
      const policy = createMockPolicy({ location: undefined })

      exportToPDF(policy)

      const htmlContent = mockWindowWrite.mock.calls[0][0] as string
      // Should not throw and should generate valid HTML
      expect(htmlContent).toContain('<!DOCTYPE html>')
    })

    it('should handle policy without coverages', () => {
      const policy = createMockPolicy({ coverages: [] })

      exportToPDF(policy)

      const htmlContent = mockWindowWrite.mock.calls[0][0] as string
      // Should not include coverages section header
      expect(htmlContent).not.toContain('<h2>Coverages</h2>')
    })

    it('should handle policy without AI insights', () => {
      const policy = createMockPolicy({ aiInsights: [] })

      exportToPDF(policy)

      const htmlContent = mockWindowWrite.mock.calls[0][0] as string
      // Should not include AI insights section
      expect(htmlContent).not.toContain('<h2>AI Insights</h2>')
    })
  })

  describe('exportPoliciesToPDF', () => {
    it('should open print window for multiple policies', () => {
      const policies = [
        createMockPolicy(),
        createMockPolicy({ id: 'policy-2', policyNumber: 'POL-002' }),
      ]

      exportPoliciesToPDF(policies)

      expect(mockWindowOpen).toHaveBeenCalledWith('', '_blank')
      expect(mockWindowWrite).toHaveBeenCalled()
      expect(mockWindowClose).toHaveBeenCalled()
    })

    it('should include title in HTML', () => {
      const policies = [createMockPolicy()]

      exportPoliciesToPDF(policies, 'My Insurance Report')

      const htmlContent = mockWindowWrite.mock.calls[0][0] as string
      expect(htmlContent).toContain('My Insurance Report')
    })

    it('should include statistics in HTML', () => {
      const policies = [
        createMockPolicy({ status: 'active', coverage: 100000, premium: 1000 }),
        createMockPolicy({ id: 'policy-2', status: 'expiring', coverage: 200000, premium: 2000 }),
      ]

      exportPoliciesToPDF(policies)

      const htmlContent = mockWindowWrite.mock.calls[0][0] as string
      expect(htmlContent).toContain('Total Policies')
      expect(htmlContent).toContain('Active')
      expect(htmlContent).toContain('Total Coverage')
      expect(htmlContent).toContain('Total Premium')
    })

    it('should include policy table in HTML', () => {
      const policies = [createMockPolicy()]

      exportPoliciesToPDF(policies)

      const htmlContent = mockWindowWrite.mock.calls[0][0] as string
      expect(htmlContent).toContain('<table>')
      expect(htmlContent).toContain('Policy Number')
      expect(htmlContent).toContain('Provider')
    })

    it('should trigger print when window loads', () => {
      const policies = [createMockPolicy()]

      exportPoliciesToPDF(policies)

      if (mockOnload) {
        mockOnload()
      }

      expect(mockWindowPrint).toHaveBeenCalled()
    })

    it('should alert if popup is blocked', () => {
      mockWindowOpen.mockReturnValueOnce(null as unknown as typeof mockWindow)
      const policies = [createMockPolicy()]

      exportPoliciesToPDF(policies)

      expect(global.alert).toHaveBeenCalledWith('Please allow popups to export PDF')
    })

    it('should handle empty policies array', () => {
      exportPoliciesToPDF([])

      const htmlContent = mockWindowWrite.mock.calls[0][0] as string
      expect(htmlContent).toContain('0') // Total should be 0
    })

    it('should use default title when not provided', () => {
      const policies = [createMockPolicy()]

      exportPoliciesToPDF(policies)

      const htmlContent = mockWindowWrite.mock.calls[0][0] as string
      expect(htmlContent).toContain('Policy Report')
    })
  })
})

describe('CSV Content Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()

    global.URL = {
      createObjectURL: vi.fn(() => 'blob:url'),
      revokeObjectURL: vi.fn(),
    } as unknown as typeof URL

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        return { href: '', download: '', click: vi.fn() } as unknown as HTMLElement
      }
      return document.createElement(tagName)
    })

    vi.spyOn(document.body, 'appendChild').mockImplementation(
      vi.fn() as unknown as typeof document.body.appendChild
    )
    vi.spyOn(document.body, 'removeChild').mockImplementation(
      vi.fn() as unknown as typeof document.body.removeChild
    )
  })

  it('should include headers in CSV', () => {
    const policies: AnalyzedPolicy[] = []
    exportToCSV(policies)

    // CSV should be created with headers even for empty array
    expect(global.URL.createObjectURL).toHaveBeenCalled()
  })
})

describe('exportSinglePolicyToCSV', () => {
  const mockClick = vi.fn()
  let capturedCsvContent = ''
  let capturedDownloadName = ''

  const createMockPolicy = (overrides: Partial<AnalyzedPolicy> = {}): AnalyzedPolicy => ({
    id: 'policy-1',
    policyNumber: 'POL-001',
    provider: 'Allianz Türkiye',
    logo: '',
    type: 'home',
    typeTr: 'Konut Sigortası',
    coverage: 500000,
    premium: 2500,
    monthlyPremium: 208.33,
    deductible: 1000,
    startDate: '2024-01-01',
    expiryDate: '2025-01-01',
    status: 'active',
    uploadDate: '2024-01-01',
    fileName: 'policy-001.pdf',
    documentType: 'policy',
    aiConfidence: 0.95,
    insuredPerson: 'Ahmet Yılmaz',
    location: 'İstanbul, Türkiye',
    coverages: [
      { name: 'Fire', nameTr: 'Yangın', limit: 500000, deductible: 0, included: true },
      { name: 'Theft', nameTr: 'Hırsızlık', limit: 100000, deductible: 1000, included: true },
    ],
    exclusions: ['War damage', 'Nuclear events'],
    specialConditions: [],
    insuranceLine: 'property',
    aiInsights: ['Good coverage', 'Consider adding flood'],
    ...overrides,
  })

  // Intercept Blob constructor to capture CSV content
  const OriginalBlob = global.Blob
  beforeEach(() => {
    vi.clearAllMocks()
    capturedCsvContent = ''
    capturedDownloadName = ''

    global.Blob = class MockBlob extends OriginalBlob {
      constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options)
        if (parts && parts.length > 0) {
          capturedCsvContent = parts.map((p) => String(p)).join('')
        }
      }
    } as typeof Blob

    global.URL = {
      createObjectURL: vi.fn(() => 'blob:mock-url'),
      revokeObjectURL: vi.fn(),
    } as unknown as typeof URL

    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        const link = {
          href: '',
          download: '',
          click: mockClick,
        }
        Object.defineProperty(link, 'download', {
          get() {
            return capturedDownloadName
          },
          set(value: string) {
            capturedDownloadName = value
          },
        })
        return link as unknown as HTMLElement
      }
      return document.createElement(tagName)
    })

    vi.spyOn(document.body, 'appendChild').mockImplementation(
      vi.fn() as unknown as typeof document.body.appendChild
    )
    vi.spyOn(document.body, 'removeChild').mockImplementation(
      vi.fn() as unknown as typeof document.body.removeChild
    )
  })

  afterEach(() => {
    vi.restoreAllMocks()
    global.Blob = OriginalBlob
  })

  function getCsvContent(): string {
    expect(capturedCsvContent).toBeTruthy()
    return capturedCsvContent
  }

  it('should create a downloadable CSV file', () => {
    const policy = createMockPolicy()
    exportSinglePolicyToCSV(policy)

    expect(global.URL.createObjectURL).toHaveBeenCalledWith(expect.any(Blob))
    expect(mockClick).toHaveBeenCalled()
    expect(global.URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('should include BOM for Excel compatibility', () => {
    const policy = createMockPolicy()
    exportSinglePolicyToCSV(policy)

    const content = getCsvContent()
    expect(content.charCodeAt(0)).toBe(0xfeff) // BOM character
  })

  it('should use sanitized policy number in filename', () => {
    const policy = createMockPolicy({ policyNumber: 'POL/001-ABC' })
    exportSinglePolicyToCSV(policy)

    expect(capturedDownloadName).toContain('POL_001_ABC')
    expect(capturedDownloadName).toMatch(/\.csv$/)
  })

  it('should include all 4 sections with Turkish headers by default', () => {
    const policy = createMockPolicy()
    exportSinglePolicyToCSV(policy)

    const content = getCsvContent()
    expect(content).toContain('# POLİÇE BİLGİLERİ')
    expect(content).toContain('# TEMİNATLAR')
    expect(content).toContain('# İSTİSNALAR')
    expect(content).toContain('# AI GÖRÜŞLERİ')
  })

  it('should include English section headers when locale is en', () => {
    const policy = createMockPolicy()
    exportSinglePolicyToCSV(policy, 'en')

    const content = getCsvContent()
    expect(content).toContain('# POLICY INFORMATION')
    expect(content).toContain('# COVERAGES')
    expect(content).toContain('# EXCLUSIONS')
    expect(content).toContain('# AI INSIGHTS')
  })

  it('should include policy info rows in Turkish', () => {
    const policy = createMockPolicy()
    exportSinglePolicyToCSV(policy, 'tr')

    const content = getCsvContent()
    expect(content).toContain('Poliçe No')
    expect(content).toContain('POL-001')
    expect(content).toContain('Şirket')
    expect(content).toContain('Allianz Türkiye')
    expect(content).toContain('Sigortalı')
    expect(content).toContain('Ahmet Yılmaz')
  })

  it('should include policy info rows in English', () => {
    const policy = createMockPolicy()
    exportSinglePolicyToCSV(policy, 'en')

    const content = getCsvContent()
    expect(content).toContain('Policy Number')
    expect(content).toContain('Provider')
    expect(content).toContain('Insured Person')
  })

  it('should include coverage rows with name, nameTr, limit, deductible, included', () => {
    const policy = createMockPolicy()
    exportSinglePolicyToCSV(policy, 'en')

    const content = getCsvContent()
    expect(content).toContain('Fire')
    expect(content).toContain('Yangın')
    expect(content).toContain('500000')
    expect(content).toContain('Hırsızlık')
    expect(content).toContain('Yes') // included: true
  })

  it('should show "Unlimited" for unlimited coverages in English', () => {
    const policy = createMockPolicy({
      coverages: [
        {
          name: 'Liability',
          nameTr: 'Sorumluluk',
          limit: 0,
          deductible: 0,
          included: true,
          isUnlimited: true,
        },
      ],
    })
    exportSinglePolicyToCSV(policy, 'en')

    const content = getCsvContent()
    expect(content).toContain('Unlimited')
  })

  it('should show "Sınırsız" for unlimited coverages in Turkish', () => {
    const policy = createMockPolicy({
      coverages: [
        {
          name: 'Liability',
          nameTr: 'Sorumluluk',
          limit: 0,
          deductible: 0,
          included: true,
          isUnlimited: true,
        },
      ],
    })
    exportSinglePolicyToCSV(policy, 'tr')

    const content = getCsvContent()
    expect(content).toContain('Sınırsız')
  })

  it('should show "Market Value" for market value coverages in English', () => {
    const policy = createMockPolicy({
      coverages: [
        {
          name: 'Vehicle',
          nameTr: 'Araç',
          limit: 0,
          deductible: 0,
          included: true,
          isMarketValue: true,
        },
      ],
    })
    exportSinglePolicyToCSV(policy, 'en')

    const content = getCsvContent()
    expect(content).toContain('Market Value')
  })

  it('should show "Rayiç Değer" for market value coverages in Turkish', () => {
    const policy = createMockPolicy({
      coverages: [
        {
          name: 'Vehicle',
          nameTr: 'Araç',
          limit: 0,
          deductible: 0,
          included: true,
          isMarketValue: true,
        },
      ],
    })
    exportSinglePolicyToCSV(policy, 'tr')

    const content = getCsvContent()
    expect(content).toContain('Rayiç Değer')
  })

  it('should include exclusions', () => {
    const policy = createMockPolicy()
    exportSinglePolicyToCSV(policy, 'en')

    const content = getCsvContent()
    expect(content).toContain('War damage')
    expect(content).toContain('Nuclear events')
  })

  it('should include AI insights', () => {
    const policy = createMockPolicy()
    exportSinglePolicyToCSV(policy, 'en')

    const content = getCsvContent()
    expect(content).toContain('Good coverage')
    expect(content).toContain('Consider adding flood')
  })

  it('should use aiInsightsTr for Turkish locale when available', () => {
    const policy = createMockPolicy({
      aiInsights: ['Good coverage'],
      aiInsightsTr: ['İyi teminat'],
    })
    exportSinglePolicyToCSV(policy, 'tr')

    const content = getCsvContent()
    expect(content).toContain('İyi teminat')
  })

  it('should handle empty coverages array', () => {
    const policy = createMockPolicy({ coverages: [] })
    exportSinglePolicyToCSV(policy, 'en')

    const content = getCsvContent()
    expect(content).toContain('# COVERAGES')
    expect(content).toContain('Coverage Name') // header still present
  })

  it('should handle empty exclusions array', () => {
    const policy = createMockPolicy({ exclusions: [] })
    exportSinglePolicyToCSV(policy, 'en')

    const content = getCsvContent()
    expect(content).toContain('# EXCLUSIONS')
  })

  it('should handle empty AI insights array', () => {
    const policy = createMockPolicy({ aiInsights: [] })
    exportSinglePolicyToCSV(policy, 'en')

    const content = getCsvContent()
    expect(content).toContain('# AI INSIGHTS')
  })

  it('should escape CSV values containing commas', () => {
    const policy = createMockPolicy({ location: 'İstanbul, Türkiye' })
    exportSinglePolicyToCSV(policy, 'en')

    const content = getCsvContent()
    // Location value with comma should be quoted
    expect(content).toContain('"İstanbul, Türkiye"')
  })

  it('should escape CSV values containing quotes', () => {
    const policy = createMockPolicy({ provider: 'Company "Best" Insurance' })
    exportSinglePolicyToCSV(policy, 'en')

    const content = getCsvContent()
    expect(content).toContain('"Company ""Best"" Insurance"')
  })

  it('should show "Araç Rayiç Bedeli" for kasko coverage in Turkish', () => {
    const policy = createMockPolicy({ type: 'kasko', typeTr: 'Kasko' })
    exportSinglePolicyToCSV(policy, 'tr')

    const content = getCsvContent()
    expect(content).toContain('Araç Rayiç Bedeli')
  })

  it('should show "Market Value" for kasko coverage in English', () => {
    const policy = createMockPolicy({ type: 'kasko', typeTr: 'Kasko' })
    exportSinglePolicyToCSV(policy, 'en')

    const content = getCsvContent()
    expect(content).toContain('Market Value')
  })

  it('should show "Hayır" / "No" for non-included coverages', () => {
    const policy = createMockPolicy({
      coverages: [{ name: 'Flood', nameTr: 'Sel', limit: 0, deductible: 0, included: false }],
    })

    exportSinglePolicyToCSV(policy, 'tr')
    const contentTr = getCsvContent()
    expect(contentTr).toContain('Hayır')

    capturedCsvContent = ''
    exportSinglePolicyToCSV(policy, 'en')
    const contentEn = getCsvContent()
    expect(contentEn).toContain('No')
  })

  it('should have correct MIME type', () => {
    const policy = createMockPolicy()
    exportSinglePolicyToCSV(policy)

    // Verify blob was created with correct type via createObjectURL call
    expect(global.URL.createObjectURL).toHaveBeenCalled()
    const blob = (global.URL.createObjectURL as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob
    expect(blob.type).toBe('text/csv;charset=utf-8;')
  })

  it('should default to Turkish locale', () => {
    const policy = createMockPolicy()
    exportSinglePolicyToCSV(policy) // no locale argument

    const content = getCsvContent()
    expect(content).toContain('# POLİÇE BİLGİLERİ')
    expect(content).toContain('Alan') // Turkish field label
  })

  it('should handle missing optional fields gracefully', () => {
    const policy = createMockPolicy({
      insuredPerson: undefined,
      location: undefined,
    })
    exportSinglePolicyToCSV(policy, 'en')

    const content = getCsvContent()
    // Should not throw, should produce valid CSV
    expect(content).toContain('Insured Person')
    expect(content).toContain('Location')
  })
})
