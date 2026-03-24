/**
 * Cross-path alignment integration tests for reviewer-mode output.
 *
 * Verifies that all export paths (CSV, Excel/xlsx, HTML/PDF) apply
 * the same governance rules:
 *   1. applySafeWording strips promotional language from AI insights
 *   2. conditionalDeductibles are rendered as a separate section
 *   3. AnalyzedPolicy type is used directly (no `as any` casts)
 *   4. Locale-aware insight selection (aiInsightsTr for TR)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { AnalyzedPolicy } from '@/types/policy'

// ── Mocks ──────────────────────────────────────────────────────────────────

// Track Blob contents for CSV assertions
let lastBlobContent = ''
const mockClick = vi.fn()
const mockCreateObjectURL = vi.fn(() => 'blob:mock')
const mockRevokeObjectURL = vi.fn()
const originalCreateObjectURL = global.URL.createObjectURL
const originalRevokeObjectURL = global.URL.revokeObjectURL

// Track window.document.write for HTML/PDF assertions
let lastHTMLContent = ''
const mockWindowWrite = vi.fn((html: string) => {
  lastHTMLContent = html
})
const mockWindowClose = vi.fn()
let mockOnload: (() => void) | null = null
const mockWindow = {
  document: { write: mockWindowWrite, close: mockWindowClose },
  print: vi.fn(),
  set onload(h: (() => void) | null) {
    mockOnload = h
  },
  get onload() {
    return mockOnload
  },
}

// ── Specimen: a KASKO policy with promotional wording + conditional deductibles ─

function createKaskoSpecimen(): AnalyzedPolicy {
  return {
    id: 'kasko-specimen-1',
    policyNumber: 'KSK-2026-001',
    provider: 'Anadolu Sigorta',
    logo: '',
    type: 'kasko',
    typeTr: 'Kasko',
    coverage: 0, // market-value based
    premium: 31140,
    monthlyPremium: 2595,
    deductible: 0,
    startDate: '2026-01-01',
    expiryDate: '2027-01-01',
    status: 'active',
    uploadDate: '2026-03-01',
    fileName: 'kasko-specimen.pdf',
    documentType: 'policy',
    aiConfidence: 0.85,
    insuredPerson: 'Erdem Yılmaz',
    location: 'İstanbul',
    coverages: [
      {
        name: 'Comprehensive Auto Insurance',
        nameTr: 'Kasko Ana Teminatı',
        limit: 0,
        deductible: 0,
        included: true,
        isMarketValue: true,
      },
      {
        name: 'Extended Liability Insurance',
        nameTr: 'İhtiyari Mali Mesuliyet',
        limit: 500000,
        deductible: 0,
        included: true,
        isUnlimited: false,
      },
      {
        name: 'Mini Repair Service',
        nameTr: 'Mini Onarım',
        limit: 0,
        deductible: 0,
        included: true,
      },
    ],
    exclusions: [
      'Anahtarın kontakta veya araç içinde bırakıldığı sırada gerçekleşen araç çalınmaları',
      'Araç çalıştırma kartının araç içinde bırakılması sonucu oluşan çalınmalar',
    ],
    specialConditions: [],
    insuranceLine: 'motor',
    // English insights with promotional wording that applySafeWording should catch
    aiInsights: [
      'Excellent coverage package with full protection',
      'No deductible applied to glass damage',
      'Policy provides guaranteed replacement vehicle',
    ],
    // Turkish insights with promotional wording
    aiInsightsTr: [
      'Mükemmel kapsamlı kasko teminatı — rayiç değer üzerinden tam koruma',
      'Muafiyetsiz cam onarımı uygulanmaktadır',
      'Sınırsız cam onarımı imkanı ile değişim yerine onarım yapıldığında araç değeri korunur',
    ],
    // Flags for reviewer mode
    deductibleUncertain: true,
    premiumMissing: false,
    insuredMissing: false,
    // Conditional deductibles (separated from exclusions)
    conditionalDeductibles: [
      'Pert total araçlara %35 tenzili muafiyet uygulanması',
      'Anlaşmalı olmayan yetkili serviste onarımda %35 muafiyet',
      'Daha önce pert olmuş araçlar için %35 tenzili muafiyet uygulanır',
    ],
  }
}

// ── Test Suite ──────────────────────────────────────────────────────────────

describe('Cross-path alignment: KASKO specimen', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lastBlobContent = ''
    lastHTMLContent = ''
    mockOnload = null

    // Only mock static methods, keep URL constructor intact
    global.URL.createObjectURL = mockCreateObjectURL
    global.URL.revokeObjectURL = mockRevokeObjectURL

    const origCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      if (tag === 'a') {
        return { href: '', download: '', click: mockClick } as unknown as HTMLElement
      }
      return origCreateElement(tag)
    })
    vi.spyOn(document.body, 'appendChild').mockImplementation((() => {}) as never)
    vi.spyOn(document.body, 'removeChild').mockImplementation((() => {}) as never)

    // Capture Blob content
    const OrigBlob = global.Blob
    vi.spyOn(global, 'Blob').mockImplementation(function (
      parts?: BlobPart[],
      options?: BlobPropertyBag
    ) {
      if (parts && parts.length > 0) {
        lastBlobContent = parts.map((p) => (typeof p === 'string' ? p : '')).join('')
      }
      return new OrigBlob(parts, options)
    } as never)

    global.window.open = vi.fn(() => mockWindow) as unknown as typeof window.open
    global.alert = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    global.URL.createObjectURL = originalCreateObjectURL
    global.URL.revokeObjectURL = originalRevokeObjectURL
  })

  // ── CSV Path ───────────────────────────────────────────────────────────

  describe('CSV export (exportSinglePolicyToCSV)', () => {
    it('applies applySafeWording to English insights', async () => {
      const { exportSinglePolicyToCSV } = await import('../export')
      const specimen = createKaskoSpecimen()
      exportSinglePolicyToCSV(specimen, 'en')

      // "Excellent" should be stripped
      expect(lastBlobContent).not.toMatch(/\bexcellent\b/i)
      // "No deductible" should be replaced
      expect(lastBlobContent).not.toMatch(/\bno deductible\b/i)
      expect(lastBlobContent).toContain('Deductible treatment depends on the specific scenario')
      // "guaranteed" should be replaced
      expect(lastBlobContent).not.toMatch(/\bguaranteed\b/i)
    })

    it('applies applySafeWording to Turkish insights (aiInsightsTr)', async () => {
      const { exportSinglePolicyToCSV } = await import('../export')
      const specimen = createKaskoSpecimen()
      exportSinglePolicyToCSV(specimen, 'tr')

      // "Mükemmel" should be replaced by safe phrasing
      expect(lastBlobContent).not.toMatch(/\bmükemmel\b/i)
      // "Muafiyetsiz" should be replaced
      expect(lastBlobContent).not.toMatch(/\bmuafiyetsiz\b/i)
      expect(lastBlobContent).toContain('Muafiyet durumu senaryoya bağlıdır')
    })

    it('renders conditional deductibles as a separate CSV section', async () => {
      const { exportSinglePolicyToCSV } = await import('../export')
      const specimen = createKaskoSpecimen()
      exportSinglePolicyToCSV(specimen, 'tr')

      expect(lastBlobContent).toContain('# KOŞULLU MUAFİYETLER')
      expect(lastBlobContent).toContain('Pert total araçlara %35 tenzili muafiyet')
      expect(lastBlobContent).toContain('Anlaşmalı olmayan yetkili serviste onarımda %35 muafiyet')
    })

    it('renders conditional deductibles in EN locale', async () => {
      const { exportSinglePolicyToCSV } = await import('../export')
      const specimen = createKaskoSpecimen()
      exportSinglePolicyToCSV(specimen, 'en')

      expect(lastBlobContent).toContain('# CONDITIONAL DEDUCTIBLES')
    })

    it('omits conditional deductibles section when empty', async () => {
      const { exportSinglePolicyToCSV } = await import('../export')
      const specimen = createKaskoSpecimen()
      specimen.conditionalDeductibles = []
      exportSinglePolicyToCSV(specimen, 'tr')

      expect(lastBlobContent).not.toContain('KOŞULLU MUAFİYETLER')
    })

    it('uses deductible uncertain text when flag set', async () => {
      const { exportSinglePolicyToCSV } = await import('../export')
      const specimen = createKaskoSpecimen()
      exportSinglePolicyToCSV(specimen, 'tr')

      // deductibleUncertain + conditionalDeductibles present
      expect(lastBlobContent).toContain(
        'Genel muafiyet yapısı net değil; koşullu muafiyetler tespit edildi'
      )
    })
  })

  // ── HTML/PDF Path ──────────────────────────────────────────────────────

  describe('HTML/PDF export (exportToPDF)', () => {
    it('applies applySafeWording to English insights', async () => {
      const { exportToPDF } = await import('../export')
      const specimen = createKaskoSpecimen()
      exportToPDF(specimen, 'en')

      expect(lastHTMLContent).not.toMatch(/\bexcellent\b/i)
      expect(lastHTMLContent).not.toMatch(/\bno deductible\b/i)
      expect(lastHTMLContent).not.toMatch(/\bguaranteed\b/i)
      expect(lastHTMLContent).toContain('Deductible treatment depends on the specific scenario')
    })

    it('applies applySafeWording to Turkish insights', async () => {
      const { exportToPDF } = await import('../export')
      const specimen = createKaskoSpecimen()
      exportToPDF(specimen, 'tr')

      expect(lastHTMLContent).not.toMatch(/\bmükemmel\b/i)
      expect(lastHTMLContent).not.toMatch(/\bmuafiyetsiz\b/i)
    })

    it('renders conditional deductibles section in TR HTML', async () => {
      const { exportToPDF } = await import('../export')
      const specimen = createKaskoSpecimen()
      exportToPDF(specimen, 'tr')

      expect(lastHTMLContent).toContain('Koşullu Muafiyetler')
      expect(lastHTMLContent).toContain('Pert total araçlara %35 tenzili muafiyet')
    })

    it('renders conditional deductibles section in EN HTML', async () => {
      const { exportToPDF } = await import('../export')
      const specimen = createKaskoSpecimen()
      exportToPDF(specimen, 'en')

      expect(lastHTMLContent).toContain('Conditional Deductibles')
    })

    it('omits conditional deductibles section when empty', async () => {
      const { exportToPDF } = await import('../export')
      const specimen = createKaskoSpecimen()
      specimen.conditionalDeductibles = []
      exportToPDF(specimen, 'tr')

      expect(lastHTMLContent).not.toContain('Koşullu Muafiyetler')
    })
  })

  // ── Excel Path ─────────────────────────────────────────────────────────

  describe('Excel export (exportSinglePolicyToExcel)', () => {
    it('applies applySafeWording to insights and creates conditional deductibles sheet', async () => {
      // Mock xlsx module
      const sheets: { name: string; data: unknown[][] }[] = []
      const mockWb = { SheetNames: [], Sheets: {} }
      vi.doMock('xlsx', () => ({
        utils: {
          book_new: () => mockWb,
          aoa_to_sheet: (data: unknown[][]) => {
            const sheet = { '!cols': undefined, _data: data }
            return sheet
          },
          book_append_sheet: (_wb: unknown, sheet: { _data: unknown[][] }, name: string) => {
            sheets.push({ name, data: sheet._data })
          },
        },
        writeFile: vi.fn(),
      }))

      // Must re-import after mocking xlsx
      vi.resetModules()
      const { exportSinglePolicyToExcel } = await import('../export')
      const specimen = createKaskoSpecimen()
      await exportSinglePolicyToExcel(specimen, 'tr')

      // Find the AI Insights sheet
      const insightSheet = sheets.find((s) => s.name === 'AI Görüşleri')
      expect(insightSheet).toBeDefined()
      const insightTexts = insightSheet!.data.slice(1).map((row) => row[0] as string)

      // All promotional wording should be gone
      for (const text of insightTexts) {
        expect(text).not.toMatch(/\bmükemmel\b/i)
        expect(text).not.toMatch(/\bmuafiyetsiz\b/i)
      }

      // Find the Conditional Deductibles sheet
      const cdSheet = sheets.find((s) => s.name === 'Koşullu Muafiyetler')
      expect(cdSheet).toBeDefined()
      expect(cdSheet!.data.length).toBe(4) // header + 3 items
      expect(cdSheet!.data[1][0]).toContain('Pert total')
    })

    it('omits conditional deductibles sheet when empty', async () => {
      const sheets: { name: string; data: unknown[][] }[] = []
      const mockWb = { SheetNames: [], Sheets: {} }
      vi.doMock('xlsx', () => ({
        utils: {
          book_new: () => mockWb,
          aoa_to_sheet: (data: unknown[][]) => ({ '!cols': undefined, _data: data }),
          book_append_sheet: (_wb: unknown, sheet: { _data: unknown[][] }, name: string) => {
            sheets.push({ name, data: sheet._data })
          },
        },
        writeFile: vi.fn(),
      }))

      vi.resetModules()
      const { exportSinglePolicyToExcel } = await import('../export')
      const specimen = createKaskoSpecimen()
      specimen.conditionalDeductibles = []
      await exportSinglePolicyToExcel(specimen, 'tr')

      expect(sheets.find((s) => s.name === 'Koşullu Muafiyetler')).toBeUndefined()
    })

    it('uses English insight text when locale is en', async () => {
      const sheets: { name: string; data: unknown[][] }[] = []
      const mockWb = { SheetNames: [], Sheets: {} }
      vi.doMock('xlsx', () => ({
        utils: {
          book_new: () => mockWb,
          aoa_to_sheet: (data: unknown[][]) => ({ '!cols': undefined, _data: data }),
          book_append_sheet: (_wb: unknown, sheet: { _data: unknown[][] }, name: string) => {
            sheets.push({ name, data: sheet._data })
          },
        },
        writeFile: vi.fn(),
      }))

      vi.resetModules()
      const { exportSinglePolicyToExcel } = await import('../export')
      const specimen = createKaskoSpecimen()
      await exportSinglePolicyToExcel(specimen, 'en')

      const insightSheet = sheets.find((s) => s.name === 'AI Insights')
      expect(insightSheet).toBeDefined()
      const insightTexts = insightSheet!.data.slice(1).map((row) => row[0] as string)

      // English promotional wording stripped
      for (const text of insightTexts) {
        expect(text).not.toMatch(/\bexcellent\b/i)
        expect(text).not.toMatch(/\bguaranteed\b/i)
        expect(text).not.toMatch(/\bno deductible\b/i)
      }
    })
  })

  // ── Regression guards ──────────────────────────────────────────────────

  describe('Regression guards', () => {
    it('export.ts does not contain (policy as any) casts', async () => {
      const { readFileSync } = await import('fs')
      const { resolve } = await import('path')
      const source = readFileSync(resolve(__dirname, '../export.ts'), 'utf-8')
      expect(source).not.toContain('policy as any')
    })

    it('export.ts does not need to import applySafeWording', async () => {
      const { readFileSync } = await import('fs')
      const { resolve } = await import('path')
      const source = readFileSync(resolve(__dirname, '../export.ts'), 'utf-8')
      expect(source).not.toContain(
        "import { applySafeWording } from '@/lib/analysis/display-interpreter'"
      )
    })
  })
})
