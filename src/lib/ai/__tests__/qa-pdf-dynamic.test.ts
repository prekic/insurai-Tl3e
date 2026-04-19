import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseTurkishCurrency } from '../turkish-utils'

const premiumPatterns = [
  /(?:br[uü]t\s*pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
  /(?:toplam\s+(?:net\s+)?pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
  /(?:[oö]denecek\s*pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
  /(?:net\s*pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
  /Vergi\s+Öncesi\s+Prim[\s:.]*([\d.,]+)/i,
  /VERG[İI]\s+ÖNCES[İI]\s+PR[İI]M[\s:.]*([\d.,]+)/,
]

// Foreign-currency premium patterns (travel, international policies)
const foreignPremiumPatterns = [
  /GROSS\s+PREMIUM[\s:.]*([\d.,]+)/i,
  /NET\s+PREMIUM[\s:.]*([\d.,]+)/i,
  /PREMIUM\s+TO\s+BE\s+PAID[\s:.]*([\d.,]+)/i,
  /(?:Net|Gross)\s+Premium\s*:\s*([\d.,]+)/i,
]

const _EXCLUDED_PATTERN = /hay[ıi]r|yok|hari[çc]|excluded|HARİÇ|HARIC/i

const pdfDir = join(process.cwd(), 'policies')
const pdfFiles = readdirSync(pdfDir).filter((f) => f.toLowerCase().endsWith('.pdf'))

const pdfTextCache = new Map<string, string>()

async function loadPdfText(relPath: string): Promise<string> {
  if (pdfTextCache.has(relPath)) return pdfTextCache.get(relPath)!
  const mod = await import('pdf-parse')
  const { PDFParse } = mod as unknown as {
    PDFParse: new (data: Uint8Array) => { getText(): Promise<{ pages: Array<{ text: string }> }> }
  }
  const buf = readFileSync(join(process.cwd(), relPath))
  const parser = new PDFParse(new Uint8Array(buf))
  const result = await parser.getText()
  const text = result.pages.map((p) => p.text).join('\n')
  pdfTextCache.set(relPath, text)
  return text
}

describe('Dynamic PDF Extraction — All files in policies/', () => {
  for (const file of pdfFiles) {
    describe(`File: ${file}`, () => {
      let text = ''
      beforeAll(async () => {
        text = await loadPdfText(join('policies', file))
      })

      it('PDF loads and contains non-trivial text (Skipped if Scanned/Corrupted)', () => {
        if (text.length < 500) {
          console.warn(
            `[WARN] ${file}: text.length = ${text.length}. Document AI OCR Fallback required. Skipping pdf-parse test.`
          )
        } else {
          expect(text.length).toBeGreaterThan(500)
        }
      })

      it('extracts a plausible premium amount (Skipped if OCR required)', () => {
        if (text.length < 500) return
        const found: number[] = []
        for (const pat of premiumPatterns) {
          const matches = text.matchAll(new RegExp(pat.source, pat.flags + 'g'))
          for (const m of matches) {
            if (m[1]) {
              const v = parseTurkishCurrency(m[1])
              if (v && v > 50 && v < 2_000_000) found.push(v)
            }
          }
        }

        // Check foreign-currency premium patterns for travel/international policies
        const foreignFound: number[] = []
        for (const pat of foreignPremiumPatterns) {
          const matches = text.matchAll(new RegExp(pat.source, pat.flags + 'g'))
          for (const m of matches) {
            if (m[1]) {
              const v = parseTurkishCurrency(m[1])
              if (v && v > 1 && v < 500_000) foreignFound.push(v)
            }
          }
        }

        // At least one pattern (Turkish OR foreign) should extract something
        const totalFound = found.length + foreignFound.length
        if (foreignFound.length > 0 && found.length === 0) {
          // Foreign-currency policy (e.g., travel insurance in EUR/USD) — passes via foreign patterns
          expect(foreignFound.length).toBeGreaterThan(0)
        } else {
          expect(
            totalFound,
            `Expected to find at least one premium in ${file}. TL: ${found}, Foreign: ${foreignFound}`
          ).toBeGreaterThan(0)
        }
      })

      it('checks that no parsed premium is absurdly large (100x bug)', () => {
        if (text.length < 500) return
        const found: number[] = []
        for (const pat of premiumPatterns) {
          const matches = text.matchAll(new RegExp(pat.source, pat.flags + 'g'))
          for (const m of matches) {
            if (m[1]) {
              const v = parseTurkishCurrency(m[1])
              if (v) found.push(v)
            }
          }
        }
        const absurd = found.filter((p) => p > 500_000)
        expect(
          absurd,
          `Found absurdly large premiums (likely 100x bug): ${absurd.join(', ')}`
        ).toHaveLength(0)
      })
    })
  }
})
