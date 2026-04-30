#!/usr/bin/env node
/**
 * End-to-end Sprint 2 audit. For each PDF in policies/:
 *   1. Chunked OCR + SSE extract (same as audit-all-policies.ts)
 *   2. From the raw AI response, extract every field a real user would see:
 *        - bundle detection (#4)
 *        - vehicle make/model
 *        - conditional deductibles count + severity bucketing (#7)
 *        - supplementary coverages count (#8)
 *        - exclusion count after dedup (#9)
 *        - per-template addressedByPolicy hits (#11B)
 *        - per-coverage carve-outs surfaced
 *   3. Print a wide markdown table summarising what landed in production.
 *
 * Replicates the matching logic from analyzeExclusionsComprehensive() and
 * evaluator.bucketConditionalDeductibleSeverity() inline so the script
 * stays self-contained and avoids Vite-import crashes (gotcha #45).
 */
import fs from 'node:fs'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'

const BASE_URL = (process.env.SMOKE_BASE_URL || process.env.PRODUCTION_SERVER_URL || '').replace(
  /\/+$/,
  ''
)
if (!BASE_URL) {
  console.error('Set SMOKE_BASE_URL')
  process.exit(2)
}
const REQUEST_TIMEOUT_MS = 240_000
const DOCUMENT_AI_PAGE_LIMIT = 10
const POLICIES_DIR = path.resolve('policies')

const FILES = [
  '201605061110254355_112575736_0_1 kasko (1).pdf',
  '201605061110254355_112575736_0_1 kasko (3).pdf',
  '4.4. Kasko.pdf',
  'ANADOLU.PDF',
  'KASKO POLİÇESİ.pdf',
  'KRK_35 VD 458 Kasko Police_32630901_3.pdf',
  'allianz-police-0001021024147152-TR.pdf',
  'eriş ambalaj 34 rz 9511 kasko pol .pdf',
  'i.43 NY 438.pdf',
  'ii.43 SE 538.pdf',
  'iii.43 SE 540.pdf',
  'KASKO_ERDEMİR_Ereğli_462660767_67TY932_2024.12-2025.12.pdf',
  'KASKO_ERDEMİR_Ereğli_462660818_06ADF115_2024.12-2025.12.pdf',
]

function inferInsurer(filename: string): string {
  const n = filename.toLowerCase()
  if (n.includes('erdemir')) return 'AXA'
  if (n.includes('allianz')) return 'Allianz'
  if (n.includes('anadolu') || n.includes('eriş') || n.includes('eris')) return 'Anadolu'
  if (n === 'kasko poli̇çesi̇.pdf' || n === 'kasko poliçesi.pdf') return 'Anadolu'
  if (n.includes('krk_')) return 'Ray'
  return 'Unknown'
}

// Mirrors COMMON_EXCLUSIONS_TO_CHECK keywords from
// src/lib/knowledge/kasko-knowledge.ts. Kept inline so the script doesn't
// import the full module.
const TEMPLATE_KEYWORDS: Record<string, string[]> = {
  'Valet Theft/Damage': ['vale', 'anahtarın ele geçir', 'anahtar üzerinde', 'valet'],
  'Alcohol Limit': ['alkol', 'promil', 'içkili', 'sarhoş', 'alcohol', 'intoxicated'],
  'Additional Drivers': [
    'yedek sürücü',
    'belirtilen sürücü',
    'ehliyet süresi',
    'sürücü yaşı',
    'named driver',
    'additional driver',
  ],
  'International Use': [
    'yurt dışı',
    'yurtdışı',
    'sınır dışı',
    'abroad',
    'international use',
    'ülke dışı',
  ],
  'Commercial Use': [
    'ticari',
    'rent-a-car',
    'rent a car',
    'kurye',
    'taksi',
    'uygulama taşımacı',
    'kullanım şekli',
    'rideshare',
    'uber',
    'commercial use',
  ],
  'Vehicle Modifications': [
    'modifikasyon',
    'jant',
    'cam filmi',
    'ses sistemi',
    'ilave donanım',
    'aksesuar',
    'lpg',
    'cng',
    'modification',
  ],
}

function bucketSeverity(scenario: string): 'critical' | 'high' | 'medium' {
  const m = scenario.match(/%\s*(\d{1,3})(?!\d)/)
  if (!m) return 'medium'
  const p = parseInt(m[1], 10)
  if (p >= 80) return 'critical'
  if (p >= 30) return 'high'
  return 'medium'
}

interface Row {
  file: string
  insurer: string
  pages: number
  bundle: string
  make: string
  model: string
  cd: number
  crit: number
  high: number
  supp: number
  excl: number
  carve: number
  addr: number
  status: string
}

async function splitPdf(buf: Buffer): Promise<Uint8Array[]> {
  const src = await PDFDocument.load(new Uint8Array(buf), { ignoreEncryption: true })
  const total = src.getPageCount()
  if (total <= DOCUMENT_AI_PAGE_LIMIT) return [new Uint8Array(buf)]
  const out: Uint8Array[] = []
  for (let i = 0; i < Math.ceil(total / DOCUMENT_AI_PAGE_LIMIT); i++) {
    const start = i * DOCUMENT_AI_PAGE_LIMIT
    const end = Math.min(start + DOCUMENT_AI_PAGE_LIMIT, total)
    const chunk = await PDFDocument.create()
    const idx = Array.from({ length: end - start }, (_, k) => start + k)
    const copied = await chunk.copyPages(src, idx)
    for (const p of copied) chunk.addPage(p)
    out.push(await chunk.save())
  }
  return out
}

async function postJson(
  url: string,
  body: unknown
): Promise<{ ok: boolean; status: number; raw: string; data: any }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      const raw = await res.text()
      let data: any = null
      try {
        data = JSON.parse(raw)
      } catch {
        /* not json */
      }
      if (res.status >= 500 && res.status < 600 && attempt === 0) {
        await new Promise((r) => setTimeout(r, 2000))
        continue
      }
      return { ok: res.ok, status: res.status, raw, data }
    } finally {
      clearTimeout(t)
    }
  }
  return { ok: false, status: 0, raw: '', data: null }
}

async function postSse(
  url: string,
  body: unknown
): Promise<{ ok: boolean; status: number; data: any; raw: string }> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    })
    const raw = await res.text()
    if (!res.ok) return { ok: false, status: res.status, data: null, raw }
    let last = ''
    for (const line of raw.split(/\r?\n/)) if (line.startsWith('data:')) last = line.slice(5).trim()
    let data: any = null
    try {
      data = JSON.parse(last || raw)
    } catch {
      /* not json */
    }
    return { ok: true, status: res.status, data, raw }
  } finally {
    clearTimeout(t)
  }
}

async function audit(filename: string): Promise<Row> {
  const filepath = path.join(POLICIES_DIR, filename)
  const insurer = inferInsurer(filename)
  const row: Row = {
    file: filename,
    insurer,
    pages: 0,
    bundle: '—',
    make: '',
    model: '',
    cd: 0,
    crit: 0,
    high: 0,
    supp: 0,
    excl: 0,
    carve: 0,
    addr: 0,
    status: 'pending',
  }
  try {
    const buf = fs.readFileSync(filepath)
    const src = await PDFDocument.load(new Uint8Array(buf), { ignoreEncryption: true })
    row.pages = src.getPageCount()

    const chunks = await splitPdf(buf)
    const texts: string[] = []
    for (const chunk of chunks) {
      const docB64 = Buffer.from(chunk).toString('base64')
      const r = await postJson(`${BASE_URL}/api/ai/ocr/document-ai`, { documentBase64: docB64 })
      if (!r.ok || !r.data?.success) {
        row.status = `ocr-fail HTTP ${r.status}`
        return row
      }
      texts.push(r.data.data?.text || '')
    }
    const text = texts.join('\n\n[PAGE BREAK]\n\n')

    const ext = await postSse(`${BASE_URL}/api/ai/extract`, {
      documentText: text,
      policyType: 'kasko',
    })
    if (!ext.ok || !ext.data?.success || !ext.data.data) {
      row.status = `extract-fail HTTP ${ext.status}`
      return row
    }
    const d = ext.data.data

    // Vehicle (P1 #4 region was migration 048)
    row.make = d.vehicleMake || ''
    row.model = (d.vehicleModel || '').slice(0, 22)

    // Bundle (P1 #4)
    if (d.isBundle === true) {
      const products = Array.isArray(d.bundleProducts) ? d.bundleProducts.length : 0
      row.bundle = `yes(${products})`
    } else if (d.isBundle === false) {
      row.bundle = 'no'
    } else {
      row.bundle = 'null'
    }

    // Conditional deductibles + severity buckets (P1 #7)
    const cds: string[] = (
      Array.isArray(d.conditionalDeductibles) ? d.conditionalDeductibles : []
    ).filter((s: unknown): s is string => typeof s === 'string' && s.trim().length > 0)
    row.cd = cds.length
    for (const cd of cds) {
      const sev = bucketSeverity(cd)
      if (sev === 'critical') row.crit++
      else if (sev === 'high') row.high++
    }

    // Supplementary coverages (P1 #8)
    const coverages = Array.isArray(d.coverages) ? d.coverages : []
    row.supp = coverages.filter((c: any) => c?.category === 'supplementary').length

    // Exclusions (P1 #9 — count after AI extraction; client-side dedup applies later)
    row.excl = Array.isArray(d.exclusions) ? d.exclusions.length : 0

    // Carve-outs (P1 #7 — surfaced in evaluator)
    const carveOuts: string[] = []
    for (const c of coverages) {
      if (Array.isArray(c?.carveOuts)) {
        for (const co of c.carveOuts) if (typeof co === 'string' && co.trim()) carveOuts.push(co)
      }
    }
    row.carve = carveOuts.length

    // addressedByPolicy matches (P1 #11B)
    const sources = [
      ...(Array.isArray(d.exclusions)
        ? d.exclusions.filter((s: unknown) => typeof s === 'string')
        : []),
      ...cds,
      ...carveOuts,
    ]
    let addressed = 0
    for (const kws of Object.values(TEMPLATE_KEYWORDS)) {
      const lows = kws.map((k) => k.toLowerCase())
      const hit = sources.some((s) => lows.some((kw) => String(s).toLowerCase().includes(kw)))
      if (hit) addressed++
    }
    row.addr = addressed

    row.status = row.make && row.model ? 'ok' : 'partial'
  } catch (err) {
    row.status = `err: ${err instanceof Error ? err.message.slice(0, 50) : String(err)}`
  }
  return row
}

async function main() {
  console.log(`► End-to-end audit (Sprint 2): ${FILES.length} PDFs against ${BASE_URL}\n`)
  const results: Row[] = []
  for (let i = 0; i < FILES.length; i++) {
    const f = FILES[i]
    process.stdout.write(`[${i + 1}/${FILES.length}] ${f.slice(0, 50).padEnd(50)} ... `)
    const row = await audit(f)
    results.push(row)
    console.log(
      row.status === 'ok'
        ? `✓ ${row.make} ${row.model} | bundle=${row.bundle} cd=${row.cd}(${row.crit}c+${row.high}h) supp=${row.supp} excl=${row.excl} carve=${row.carve} addr=${row.addr}`
        : row.status
    )
  }

  console.log('\n## End-to-end audit summary\n')
  console.log(
    '| # | file | insurer | pages | bundle | make | model | cd | crit | high | supp | excl | carve | addr | status |'
  )
  console.log(
    '|---|------|---------|-------|--------|------|-------|----|------|------|------|------|-------|------|--------|'
  )
  results.forEach((r, i) => {
    const fileShort = r.file.length > 30 ? r.file.slice(0, 27) + '...' : r.file
    console.log(
      `| ${i + 1} | ${fileShort} | ${r.insurer} | ${r.pages} | ${r.bundle} | ${r.make} | ${r.model} | ${r.cd} | ${r.crit} | ${r.high} | ${r.supp} | ${r.excl} | ${r.carve} | ${r.addr} | ${r.status} |`
    )
  })

  const ok = results.filter((r) => r.status === 'ok').length
  const bundles = results.filter((r) => r.bundle.startsWith('yes')).length
  const withCD = results.filter((r) => r.cd > 0).length
  const withCarve = results.filter((r) => r.carve > 0).length
  const withAddr = results.filter((r) => r.addr > 0).length
  console.log(
    `\n${ok}/${results.length} extracted | ${bundles} bundles | ${withCD} have conditional deductibles | ${withCarve} have carve-outs | ${withAddr} have ≥1 Ask-Insurer template answered`
  )

  // Column legend for the table.
  console.log(
    '\nLegend: cd=conditional deductibles | crit/high=severity buckets | supp=supplementary coverages | excl=exclusions | carve=Coverage.carveOuts entries | addr=Ask-Insurer templates pre-filled'
  )
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
