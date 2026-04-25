/**
 * scripts/inspect-pdf-labels.ts
 *
 * One-off diagnostic. Parses a PDF in policies/ and prints (a) the first
 * 2500 chars of recovered text and (b) every line containing common
 * Turkish vehicle-info label keywords. Used to identify what label
 * vocabulary an unfamiliar insurer's PDF format uses, so we can extend
 * shared/field-aliases.ts with the right new aliases.
 *
 * Usage:
 *   npx tsx scripts/inspect-pdf-labels.ts <filename-in-policies-dir>
 *
 * Example:
 *   npx tsx scripts/inspect-pdf-labels.ts KASKO_ERDEMİR_Ereğli_462660798_67LA807_2024.12-2025.12.pdf
 *
 * Read-only. No DB access. No AI calls.
 */

import * as fs from 'node:fs/promises'
import * as path from 'node:path'

const POLICIES_DIR = path.resolve(process.cwd(), 'policies')

// Words that, if found anywhere on a line, suggest the line is a labeled
// field worth inspecting. Cast wide on purpose — the goal is to surface
// every candidate, not to be precise.
const LABEL_KEYWORDS = [
  'Marka',
  'MARKA',
  'Model',
  'MODEL',
  'Tip',
  'TİP',
  'TIP',
  'Plaka',
  'PLAKA',
  'Şasi',
  'ŞASİ',
  'Sasi',
  'SASI',
  'Motor',
  'MOTOR',
  'Yıl',
  'YIL',
  'YILI',
  'Araç',
  'ARAÇ',
  'Kullanım',
  'KULLANIM',
  'Üretim',
  'ÜRETİM',
  'İmal',
  'İMAL',
  'VIN',
  'Chassis',
  'Engine',
  'Make',
  'Year',
] as const

async function main(): Promise<void> {
  const filename = process.argv[2]
  if (!filename) {
    console.error('Usage: npx tsx scripts/inspect-pdf-labels.ts <filename-in-policies-dir>')
    process.exit(1)
  }

  const filepath = path.join(POLICIES_DIR, filename)
  let buf: Buffer
  try {
    buf = await fs.readFile(filepath)
  } catch (e) {
    console.error(`Cannot read ${filepath}: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  }

  const mod = await import('pdf-parse')
  const { PDFParse } = mod as unknown as {
    PDFParse: new (data: Uint8Array) => {
      getText(): Promise<{ pages: Array<{ text: string }> }>
    }
  }
  const parser = new PDFParse(new Uint8Array(buf))
  const result = await parser.getText()
  const text = result.pages.map((p) => p.text).join('\n')

  console.log(`File: ${filename}`)
  console.log(
    `Size: ${buf.length} bytes; pages: ${result.pages.length}; text: ${text.length} chars\n`
  )

  console.log('=== First 2500 chars ===\n')
  console.log(text.slice(0, 2500))
  console.log()

  console.log('=== Label-bearing lines (first 60) ===\n')
  const lines = text.split('\n')
  let found = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed.length === 0) continue
    if (LABEL_KEYWORDS.some((kw) => trimmed.includes(kw))) {
      // Show the line, capped at 200 chars (some PDFs put many fields on one line)
      console.log(`  ${trimmed.slice(0, 200)}`)
      found++
      if (found >= 60) {
        console.log('  ... (truncated at 60 lines)')
        break
      }
    }
  }
  if (found === 0) {
    console.log('  (no label-bearing lines found — the format is very unusual)')
  }
  console.log()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
