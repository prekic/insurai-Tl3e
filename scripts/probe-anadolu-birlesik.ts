/**
 * One-off probe: verify policies/ANADOLU.PDF is the reviewer-flagged
 * Anadolu Birleşik Kasko fixture (with named-percentage scenarios that
 * exercise Migration 049 attribution rules).
 *
 * Read-only, no DB writes. Reports out which keywords were found and
 * dumps a small text excerpt around each hit so we can sanity-check.
 *
 * Run: npx tsx scripts/probe-anadolu-birlesik.ts [path-to-pdf]
 *      defaults to policies/ANADOLU.PDF
 */
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const KEYWORDS = [
  'Birleşik',
  '%35',
  '%80',
  'anlaşmalı olmayan',
  'pert araç',
  'pert araçlar',
  'sürücü yaş',
  'rent-a-car',
] as const

interface KeywordHit {
  keyword: string
  count: number
  excerpts: string[]
}

async function probePdf(pdfPath: string): Promise<void> {
  const abs = resolve(pdfPath)
  console.log(`[probe] Reading ${abs}`)
  const buf = await readFile(abs)
  console.log(`[probe] PDF byte length: ${buf.length}`)

  // pdf-parse v2.x uses PDFParse class + requires Uint8Array (gotcha #69).
  const { PDFParse } = await import('pdf-parse')
  const parser = new PDFParse({ data: new Uint8Array(buf) })
  const result = await parser.getText()
  const fullText = result.pages.map((p) => p.text).join('\n')
  console.log(`[probe] Page count: ${result.pages.length}`)
  console.log(`[probe] Total chars: ${fullText.length}\n`)

  const lower = fullText.toLowerCase().replace(/i̇/g, 'i')
  const hits: KeywordHit[] = []

  for (const kw of KEYWORDS) {
    const needle = kw.toLowerCase().replace(/i̇/g, 'i')
    const matches: number[] = []
    let idx = 0
    while ((idx = lower.indexOf(needle, idx)) !== -1) {
      matches.push(idx)
      idx += needle.length
    }
    const excerpts = matches.slice(0, 3).map((i) => {
      const start = Math.max(0, i - 60)
      const end = Math.min(fullText.length, i + needle.length + 60)
      return `…${fullText.slice(start, end).replace(/\s+/g, ' ').trim()}…`
    })
    hits.push({ keyword: kw, count: matches.length, excerpts })
  }

  console.log('[probe] Keyword scan results:')
  console.log('━'.repeat(60))
  for (const hit of hits) {
    const flag = hit.count > 0 ? '✓' : '✗'
    console.log(`${flag} ${hit.keyword.padEnd(25)} ${hit.count} hit(s)`)
    for (const ex of hit.excerpts) {
      console.log(`     ${ex}`)
    }
  }
  console.log('━'.repeat(60))

  // Detect Anadolu Birleşik specifically — they're a sub-brand of Anadolu
  // Sigorta and have distinct branding text in the policy header.
  const isBirlesik = lower.includes('birleşik') || lower.includes('birlesik')
  console.log(`\n[probe] Is Anadolu Birleşik branded? ${isBirlesik ? 'YES' : 'NO'}`)
  console.log(`[probe] Has any %N percentage? ${/%\s?\d{1,3}/.test(fullText) ? 'YES' : 'NO'}`)

  // Identify the insurer string for golden.json registration.
  const insurerLineMatch =
    fullText.match(/Anadolu\s+(?:Birleşik\s+)?Sigorta/i) ||
    fullText.match(/Anadolu\s+\S+\s+Sigorta/i)
  console.log(`[probe] Detected insurer line: ${insurerLineMatch?.[0] ?? '(not found)'}`)
}

async function main(): Promise<void> {
  const pdfPath = process.argv[2] ?? 'policies/ANADOLU.PDF'
  try {
    await probePdf(pdfPath)
    process.exit(0)
  } catch (err) {
    console.error('[probe] FAILED:', err instanceof Error ? err.message : String(err))
    if (err instanceof Error && err.stack) console.error(err.stack)
    process.exit(2)
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
