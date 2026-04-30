#!/usr/bin/env node
/**
 * One-off diagnostic — runs the production extraction pipeline against every
 * PDF in policies/ (capped to a curated list for cost/time) and dumps a
 * markdown table of vehicle extraction quality. Not committed to CI; used to
 * gauge cross-fixture quality before promoting any to permanent smoke fixtures.
 *
 * Usage:
 *   SMOKE_BASE_URL=https://insurai-production.up.railway.app \
 *     npx tsx scripts/audit-all-policies.ts
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
const REQUEST_TIMEOUT_MS = 180_000
const DOCUMENT_AI_PAGE_LIMIT = 10
const POLICIES_DIR = path.resolve('policies')

// Curated list — every unique non-Erdemir + 2 Erdemir samples.
const FILES = [
  '201605061110254355_112575736_0_1 kasko (1).pdf',
  '201605061110254355_112575736_0_1 kasko (3).pdf',
  '4.4. Kasko.pdf',
  'ANADOLU.PDF',
  'KASKO POLİÇESİ.pdf',
  'KRK_35 VD 458 Kasko Police_32630901_3.pdf',
  'Police-433425980.pdf',
  'allianz-police-0001021024147152-TR.pdf',
  'eriş ambalaj 34 rz 9511 kasko pol .pdf',
  'i.43 NY 438.pdf',
  'ii.43 SE 538.pdf',
  'iii.43 SE 540.pdf',
  'KASKO_ERDEMİR_Ereğli_462660767_67TY932_2024.12-2025.12.pdf',
  'KASKO_ERDEMİR_Ereğli_462660818_06ADF115_2024.12-2025.12.pdf',
]

// Insurer heuristic from filename to drive cross-leak checks.
function inferInsurer(filename: string): string {
  const n = filename.toLowerCase()
  if (n.includes('erdemir')) return 'AXA'
  if (n.includes('allianz')) return 'Allianz'
  if (n.includes('anadolu') || n === 'kasko poli̇çesi̇.pdf') return 'Anadolu'
  if (n.includes('eriş') || n.includes('eris')) return 'Anadolu'
  if (n.includes('krk_')) return 'Ray'
  return 'Unknown'
}

const FORBIDDEN_BY_INSURER: Record<string, string[]> = {
  Allianz: ['CASU', 'AS+ Yetkili Servis', 'Anadolu Hizmet'],
  Anadolu: ['CASU', 'AXA Sigorta'],
  AXA: ['Anadolu Hizmet', 'AS+ Yetkili Servis'],
  Ray: ['CASU', 'AXA Sigorta', 'AS+ Yetkili Servis'],
  Unknown: [],
}

interface Row {
  file: string
  insurer: string
  pages: number
  make: string
  model: string
  year: string
  plate: string
  conf: string
  deductCount: string
  leaks: string
  status: string
}

async function splitPdfBuffer(buf: Buffer): Promise<Uint8Array[]> {
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
    make: '',
    model: '',
    year: '',
    plate: '',
    conf: '',
    deductCount: '',
    leaks: '',
    status: 'pending',
  }
  try {
    const buf = fs.readFileSync(filepath)
    const src = await PDFDocument.load(new Uint8Array(buf), { ignoreEncryption: true })
    row.pages = src.getPageCount()

    const chunks = await splitPdfBuffer(buf)
    const texts: string[] = []
    for (const chunk of chunks) {
      const docB64 = Buffer.from(chunk).toString('base64')
      const r = await postJson(`${BASE_URL}/api/ai/ocr/document-ai`, { documentBase64: docB64 })
      if (!r.ok || !r.data?.success) {
        row.status = `ocr-fail HTTP ${r.status}: ${(r.data?.error || r.raw).slice(0, 80)}`
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
      row.status = `extract-fail HTTP ${ext.status}: ${(ext.data?.error || ext.raw).slice(0, 80)}`
      return row
    }
    const d = ext.data.data
    row.make = d.vehicleMake || ''
    row.model = d.vehicleModel || ''
    row.year = d.vehicleYear ? String(d.vehicleYear) : ''
    row.plate = d.vehiclePlate || ''
    row.conf = typeof d.qualityScore?.total === 'number' ? d.qualityScore.total.toFixed(2) : ''
    const cd = Array.isArray(d.conditionalDeductibles) ? d.conditionalDeductibles : []
    row.deductCount = String(cd.length)

    const haystack = JSON.stringify(d).toLowerCase()
    const forbidden = FORBIDDEN_BY_INSURER[insurer] || []
    const hits = forbidden.filter((p) => haystack.includes(p.toLowerCase()))
    row.leaks = hits.length ? hits.join(',') : '—'
    row.status = row.make && row.model ? 'ok' : 'partial'
  } catch (err) {
    row.status = `error: ${err instanceof Error ? err.message.slice(0, 80) : String(err)}`
  }
  return row
}

async function main() {
  console.log(`► Auditing ${FILES.length} PDFs against ${BASE_URL}\n`)
  const results: Row[] = []
  for (let i = 0; i < FILES.length; i++) {
    const f = FILES[i]
    process.stdout.write(`[${i + 1}/${FILES.length}] ${f.slice(0, 60).padEnd(60)} ... `)
    const row = await audit(f)
    results.push(row)
    console.log(row.status === 'ok' ? `✓ ${row.make} ${row.model}` : row.status)
  }

  console.log('\n## Summary table\n')
  console.log(
    '| # | file | insurer | pages | make | model | year | conf | deduct | leaks | status |'
  )
  console.log(
    '|---|------|---------|-------|------|-------|------|------|--------|-------|--------|'
  )
  results.forEach((r, i) => {
    const fileShort = r.file.length > 38 ? r.file.slice(0, 35) + '...' : r.file
    console.log(
      `| ${i + 1} | ${fileShort} | ${r.insurer} | ${r.pages} | ${r.make} | ${r.model.slice(0, 25)} | ${r.year} | ${r.conf} | ${r.deductCount} | ${r.leaks} | ${r.status} |`
    )
  })

  const okCount = results.filter((r) => r.status === 'ok').length
  const leakCount = results.filter((r) => r.leaks !== '—' && r.leaks !== '').length
  console.log(
    `\n${okCount}/${results.length} extracted vehicle make+model. ${leakCount} cross-insurer leaks.`
  )
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
