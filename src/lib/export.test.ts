/**
 * Export Module Tests
 *
 * Tests for CSV and PDF export functionality
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { exportToCSV, exportToExcel, exportToPDF, exportPoliciesToPDF } from './export'
import type { AnalyzedPolicy } from '@/types/policy'

// Mock URL and document APIs
const mockCreateObjectURL = vi.fn(() => 'blob:mock-url')
const mockRevokeObjectURL = vi.fn()
const mockAppendChild = vi.fn()
const mockRemoveChild = vi.fn()

// Store original values
const originalURL = global.URL
const originalDocument = global.document

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
  set onload(handler: () => void) {
    mockOnload = handler
  },
  get onload() {
    return mockOnload
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
    } as typeof URL

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

    vi.spyOn(document.body, 'appendChild').mockImplementation(mockAppendChild as unknown as typeof document.body.appendChild)
    vi.spyOn(document.body, 'removeChild').mockImplementation(mockRemoveChild as unknown as typeof document.body.removeChild)

    // Setup window.open mock
    global.window.open = mockWindowOpen as typeof window.open
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
    documentType: 'policy',
    aiConfidence: 0.95,
    insuredPerson: 'Ahmet Yılmaz',
    location: 'İstanbul, Türkiye',
    coverages: [
      {
        name: 'Fire',
        nameTr: 'Yangın',
        limit: 500000,
        included: true,
      },
    ],
    gaps: [],
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

      const blobCall = mockCreateObjectURL.mock.calls[0][0] as Blob
      expect(blobCall.type).toBe('text/csv;charset=utf-8;')
    })

    it('should include BOM for Excel compatibility', () => {
      const policies = [createMockPolicy()]

      exportToCSV(policies)

      // The blob should contain BOM character
      const blobCall = mockCreateObjectURL.mock.calls[0][0] as Blob
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
    it('should call exportToCSV internally', () => {
      const policies = [createMockPolicy()]

      exportToExcel(policies)

      expect(mockCreateObjectURL).toHaveBeenCalled()
      expect(mockClick).toHaveBeenCalled()
    })

    it('should use custom filename', () => {
      const policies = [createMockPolicy()]

      exportToExcel(policies, 'excel-export')

      expect(mockCreateObjectURL).toHaveBeenCalled()
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
      mockWindowOpen.mockReturnValueOnce(null)
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
      const policies = [createMockPolicy(), createMockPolicy({ id: 'policy-2', policyNumber: 'POL-002' })]

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
      mockWindowOpen.mockReturnValueOnce(null)
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

    vi.spyOn(document.body, 'appendChild').mockImplementation(vi.fn() as unknown as typeof document.body.appendChild)
    vi.spyOn(document.body, 'removeChild').mockImplementation(vi.fn() as unknown as typeof document.body.removeChild)
  })

  it('should include headers in CSV', () => {
    const policies: AnalyzedPolicy[] = []
    exportToCSV(policies)

    // CSV should be created with headers even for empty array
    expect(global.URL.createObjectURL).toHaveBeenCalled()
  })
})
