/**
 * Semantic Self-Healing Extraction
 *
 * Stratified extraction pipeline with field-level validation and corrective retries.
 *
 * How it works:
 *  1. Primary extraction → get all fields from Gemini
 *  2. Field-level validation → check dates, plates, years, currencies
 *  3. If failures found → healing round with corrective context
 *  4. Track which fields heal / which don't → generate quality report
 *
 * Run: node scripts/semantic-self-heal.cjs [policy_path...]
 * Or with no args: runs on the 10 standard test PDFs
 */

import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const BACKEND = 'http://localhost:4001'
const GEMINI_KEY = process.env.GEMINI_API_KEY || 'AIzaSyAv9TpKpCBO5dGnLP5_-6KUD7c9V9L1KSw'
const POLICIES_DIR = path.resolve(__dirname, '..', 'policies')

// ──────────────────────────────────────────────
//  Field-level validators
// ──────────────────────────────────────────────

const VALIDATORS: Record<string, (v: any) => { valid: boolean; hint?: string }> = {
  policyNumber(v: any) {
    if (!v || typeof v !== 'string') return { valid: false, hint: 'Policy number must be a string' }
    if (v.length < 4 || v.length > 30)
      return { valid: false, hint: `Policy number length ${v.length} is suspicious` }
    return { valid: true }
  },

  startDate(v: any) {
    if (!v) return { valid: false, hint: 'Missing start date' }
    const d = new Date(v)
    if (isNaN(d.getTime())) return { valid: false, hint: `"${v}" is not a valid date` }
    if (d.getFullYear() < 2000 || d.getFullYear() > 2030)
      return { valid: false, hint: `Year ${d.getFullYear()} out of range` }
    return { valid: true }
  },

  endDate(v: any) {
    if (!v) return { valid: false, hint: 'Missing end date' }
    const d = new Date(v)
    if (isNaN(d.getTime())) return { valid: false, hint: `"${v}" is not a valid date` }
    if (d.getFullYear() < 2000 || d.getFullYear() > 2040)
      return { valid: false, hint: `Year ${d.getFullYear()} out of range` }
    return { valid: true }
  },

  vehicleYear(v: any) {
    if (v === undefined || v === null) return { valid: true } // optional
    const n = typeof v === 'string' ? parseInt(v, 10) : v
    if (isNaN(n)) return { valid: false, hint: `"${v}" is not a number` }
    if (n < 1980 || n > 2026)
      return { valid: false, hint: `Year ${n} out of realistic range [1980-2026]` }
    return { valid: true }
  },

  vehiclePlate(v: any) {
    if (!v || typeof v !== 'string') return { valid: false, hint: 'Plate must be a string' }
    // Turkish plates: 2 digits + space + 1-3 letters + space + 2-4 digits
    // e.g., "35 PR 962", "67 TY 932", "06 ADF 115"
    // Also allow without spaces: "35PR962"
    const cleaned = v.replace(/\s+/g, ' ').trim()
    const basic = /^\d{2}\s?[A-Za-z]{1,3}\s?\d{2,4}$/.test(cleaned)
    if (!basic)
      return { valid: false, hint: `"${v}" doesn't match Turkish plate format (e.g., "35 PR 962")` }
    return { valid: true }
  },

  currency(v: any) {
    if (!v || typeof v !== 'string') return { valid: false, hint: 'Currency must be a string' }
    const up = v.toUpperCase().trim()
    if (!['TL', 'TRY', 'USD', 'EUR', 'GBP'].includes(up))
      return { valid: false, hint: `"${up}" is not TL/TRY/USD/EUR` }
    return { valid: true }
  },

  provider(v: any) {
    if (!v || typeof v !== 'string') return { valid: false, hint: 'Provider name must be a string' }
    if (v.length < 3) return { valid: false, hint: `"${v}" is too short for a provider name` }
    return { valid: true }
  },
}

// ──────────────────────────────────────────────
//  Extraction + Healing
// ──────────────────────────────────────────────

async function extractPDF(filePath: string): Promise<string> {
  const buf = fs.readFileSync(filePath)
  const form = new FormData()
  form.append('file', new Blob([buf]), path.basename(filePath))
  const resp = await fetch(`${BACKEND}/api/pdf/extract`, { method: 'POST', body: form })
  const data: any = await resp.json()
  if (data.success && data.data?.text) return data.data.text
  return ''
}

function buildPrompt(text: string, corrections?: string[]): string {
  const correctionBlock = corrections?.length
    ? `\n\nÖNCEKİ ÇIKARIMDA DÜZELTİLMESİ GEREKENLER:\n${corrections.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n`
    : ''

  return `Sen bir Türk kasko sigorta policesi uzmanısın. Poliçe metnini analiz et ve aşağıdaki JSON yapısında döndür. SADECE GEÇERLİ JSON DÖNDÜR, başka metin yok.

Gerekli alanlar (hepsini doldurmaya çalış):
- provider: sigorta şirketi adı (örn: ANADOLU, AXA, GÜNEŞ, SOMPO JAPAN, RAY SİGORTA, vs.)
- policyNumber: poliçe numarası
- startDate: başlangıç tarihi (YYYY-AA-GG)
- endDate: bitiş tarihi (YYYY-AA-GG)
- insuredName: sigortalı adı (gerçek kişi veya tüzel kişi adı)
- vehicleMake: araç markası (örn: VOLKSWAGEN, TOYOTA, MERCEDES, HONDA, RENAULT, FORD, vs.)
- vehicleModel: araç modeli (varsa)
- vehicleYear: araç model yılı (sadece sayı, 4 hane)
- vehiclePlate: araç plaka numarası (örn: 35 PR 962 formatında)
- currency: para birimi (TL, TRY, USD)
- premium: net prim (sayı)
- totalPremium: toplam prim (sayı)${correctionBlock}
Poliçe Metni:
\`\`\`
${text.substring(0, 60000)}
\`\`\`

JSON formatı:
{"provider":"...","policyNumber":"...","startDate":"...","endDate":"...","insuredName":"...","vehicleMake":"...","vehicleModel":"...","vehicleYear":...,"vehiclePlate":"...","currency":"...","premium":...,"totalPremium":...}`
}

async function callGemini(prompt: string): Promise<any> {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      }),
    }
  )

  if (!resp.ok) {
    const err = await resp.text()
    throw new Error(`Gemini API ${resp.status}: ${err.substring(0, 300)}`)
  }

  const gd: any = await resp.json()
  const text = gd?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Empty Gemini response')

  // Extract JSON
  const cleaned = text
    .replace(/^\s*```(?:json)?\s*/gm, '')
    .replace(/```\s*$/gm, '')
    .trim()
  const start = cleaned.indexOf('{')
  if (start < 0) throw new Error('No JSON found in response')

  let depth = 0,
    end = start
  for (let i = start; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++
    else if (cleaned[i] === '}') {
      depth--
      if (depth === 0) {
        end = i + 1
        break
      }
    }
  }

  const jsonStr = cleaned.substring(start, end)

  // Parse with truncation salvage
  try {
    return JSON.parse(jsonStr)
  } catch {
    let fixed = jsonStr.replace(/,\s*$/, '').replace(/",\s*[a-zA-Z]+$/, '"')
    const lines = fixed.split('\n')
    const lastLine = lines[lines.length - 1] || ''
    const quoteCount = (lastLine.match(/"/g) || []).length
    if (quoteCount % 2 !== 0) fixed += '"'
    let d = 0
    for (const ch of fixed) {
      if (ch === '{') d++
      else if (ch === '}') d--
    }
    while (d > 0) {
      fixed += '}'
      d--
    }
    fixed = fixed.replace(/,\s*}/g, '}')
    return JSON.parse(fixed)
  }
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function validateFields(obj: any): { field: string; value: any; valid: boolean; hint?: string }[] {
  const results: { field: string; value: any; valid: boolean; hint?: string }[] = []

  for (const [field, validator] of Object.entries(VALIDATORS)) {
    const value = obj[field]
    const result = validator(value)
    results.push({ field, value, ...result })
  }

  return results
}

function flattenObject(obj: any, prefix = ''): Record<string, any> {
  const result: Record<string, any> = {}
  if (!obj || typeof obj !== 'object') return result
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(result, flattenObject(v as Record<string, any>, key))
    } else {
      result[key] = v
    }
  }
  return result
}

function searchField(obj: any, fieldName: string): any {
  const flat = flattenObject(obj)
  const aliases: Record<string, string[]> = {
    provider: ['provider', 'insurerName', 'sigorta', 'sirket', 'company', 'insurer'],
    policyNumber: ['policyNumber', 'policeno', 'policy_no', 'police', 'policy'],
    startDate: ['startDate', 'baslangic', 'start', 'validfrom'],
    endDate: ['endDate', 'bitis', 'end', 'validto', 'expiry'],
    vehicleMake: ['vehicleMake', 'marka', 'make', 'vehicle_make'],
    vehicleYear: ['vehicleYear', 'year', 'model_year', 'model_yili'],
    vehicleModel: ['vehicleModel', 'model', 'vehicle_model'],
    vehiclePlate: ['vehiclePlate', 'plaka', 'plate'],
    insuredName: ['insuredName', 'sigortali', 'insured', 'name'],
    currency: ['currency', 'para_birimi', 'doviz', 'birim'],
  }

  const candidates = aliases[fieldName] || [fieldName]
  for (const [key, value] of Object.entries(flat)) {
    const keyLower = key.toLowerCase()
    if (candidates.some((a) => keyLower.includes(a))) {
      return value
    }
  }
  return undefined
}

// ──────────────────────────────────────────────
//  Healing logic
// ──────────────────────────────────────────────

function buildCorrections(
  validationResults: { field: string; value: any; hint?: string }[]
): string[] {
  return validationResults
    .filter((r) => !r.valid && r.hint)
    .map((r) => `${r.field}: "${r.value}" — ${r.hint}. Lütfen düzelt.`)
}

function extractStructured(obj: any): Record<string, any> {
  const fields = [
    'provider',
    'policyNumber',
    'startDate',
    'endDate',
    'insuredName',
    'vehicleMake',
    'vehicleModel',
    'vehicleYear',
    'vehiclePlate',
    'currency',
    'premium',
    'totalPremium',
  ]
  const result: Record<string, any> = {}
  for (const f of fields) {
    result[f] = searchField(obj, f)
  }
  return result
}

// ──────────────────────────────────────────────
//  Main pipeline
// ──────────────────────────────────────────────

interface HealingRecord {
  field: string
  initialValue: any
  initialValid: boolean
  healedValue?: any
  healedValid?: boolean
  healed: boolean
}

interface PolicyResult {
  name: string
  chars: number
  primaryValid: number
  primaryInvalid: number
  healingRoundValid: number
  healingRoundInvalid: number
  totalValid: number
  totalInvalid: number
  healingRate: string
  records: HealingRecord[]
  primaryTime: number
  healingTime?: number
}

async function processPolicy(policyFile: string): Promise<PolicyResult> {
  console.log(`\n📄 ${policyFile}`)

  const filePath = path.join(POLICIES_DIR, policyFile)
  if (!fs.existsSync(filePath)) {
    console.log(`  ⏭️  File not found`)
    throw new Error('File not found')
  }

  const text = await extractPDF(filePath)
  if (text.length < 100) {
    console.log(`  ⏭️  Scanned PDF (${text.length} chars)`)
    throw new Error('Scanned')
  }

  console.log(`  📝 ${text.length} chars`)

  // Step 1: Primary extraction
  const t1 = Date.now()
  const prompt = buildPrompt(text)
  const raw = await callGemini(prompt)
  let data = extractStructured(raw)
  const primaryTime = (Date.now() - t1) / 1000

  // Validate
  const validationFields = Object.keys(VALIDATORS)
  const records: HealingRecord[] = validationFields.map((field) => ({
    field,
    initialValue: data[field],
    initialValid: VALIDATORS[field](data[field]).valid,
    healed: false,
  }))

  const invalid = records.filter((r) => !r.initialValid)
  console.log(
    `  🤖 Primary: ${records.filter((r) => r.initialValid).length}/${validationFields.length} valid fields, ${invalid.length} issues`
  )

  for (const r of invalid) {
    console.log(
      `    ⚠️  ${r.field}: "${r.initialValue}" — ${VALIDATORS[r.field](r.initialValue).hint || 'invalid'}`
    )
  }

  // Step 2: Healing round (if needed)
  let healingTime: number | undefined
  let healingData = data

  if (invalid.length > 0) {
    const corrections = buildCorrections(
      invalid.map((r) => ({
        field: r.field,
        value: r.initialValue,
        hint: VALIDATORS[r.field](r.initialValue).hint,
      }))
    )

    console.log(`  🔧 Healing round...`)
    const t2 = Date.now()
    const healPrompt = buildPrompt(text, corrections)
    const healRaw = await callGemini(healPrompt)
    healingData = extractStructured(healRaw)
    healingTime = (Date.now() - t2) / 1000

    // Check what healed
    for (const record of records) {
      if (!record.initialValid) {
        const newValue = healingData[record.field]
        const newValid = VALIDATORS[record.field](newValue).valid
        record.healedValue = newValue
        record.healedValid = newValid
        record.healed = newValid

        if (newValid) {
          console.log(`    ✅ Healed: ${record.field}: "${record.initialValue}" → "${newValue}"`)
        } else {
          console.log(
            `    ❌ Still broken: ${record.field}: "${record.initialValue}" → "${newValue || 'same'}"`
          )
        }
      } else {
        record.healedValue = data[record.field]
        record.healedValid = true
        record.healed = true
      }
    }

    // Use healing data as final
    data = healingData
  }

  const primaryValid = records.filter((r) => r.initialValid).length
  const primaryInvalid = records.filter((r) => !r.initialValid).length
  const totalValid = records.filter((r) => {
    if (!r.initialValid && r.healed) return true
    return r.initialValid
  }).length
  const totalInvalid = validationFields.length - totalValid

  const result: PolicyResult = {
    name: policyFile,
    chars: text.length,
    primaryValid,
    primaryInvalid,
    healingRoundValid: healingData ? records.filter((r) => r.healed).length : 0,
    healingRoundInvalid:
      primaryInvalid - (healingData ? records.filter((r) => r.healed).length : 0), // simplified
    totalValid,
    totalInvalid,
    healingRate:
      primaryInvalid > 0
        ? `${Math.round((records.filter((r) => r.healed && !r.initialValid).length / primaryInvalid) * 100)}%`
        : 'N/A',
    records,
    primaryTime,
    healingTime,
  }

  console.log(
    `  ⏱️  Primary: ${primaryTime.toFixed(1)}s${healingTime ? `, Healing: ${healingTime.toFixed(1)}s` : ''}`
  )
  console.log(
    `  📊 ${totalValid}/${validationFields.length} valid fields (${totalInvalid} remaining issues)`
  )

  return result
}

// ──────────────────────────────────────────────
//  Run
// ──────────────────────────────────────────────

const DEFAULT_POLICIES = [
  'ANADOLU.PDF',
  'KASKO POLİÇESİ.pdf',
  'KASKO_ERDEMİR_Ereğli_462660767_67TY932_2024.12-2025.12.pdf',
  'KASKO_ERDEMİR_Ereğli_462660768_67TY840_2024.12-2025.12.pdf',
  'KASKO_ERDEMİR_Ereğli_462660781_67EU352_2024.12-2025.12.pdf',
  'KASKO_ERDEMİR_Ereğli_462660797_67LU324_2024.12-2025.12.pdf',
  'KASKO_ERDEMİR_Ereğli_462660798_67LA807_2024.12-2025.12.pdf',
  '201605061110254355_112575736_0_1 kasko (1).pdf',
  '201605061110254355_112575736_0_1 kasko (3).pdf',
]

const args = process.argv.slice(2)
const policies = args.length > 0 ? args : DEFAULT_POLICIES

const results: PolicyResult[] = []

for (const policy of policies) {
  try {
    const r = await processPolicy(policy)
    results.push(r)
  } catch (e: any) {
    if (e.message === 'File not found') continue
    if (e.message === 'Scanned') continue
    console.error(`  ❌ ${policy}: ${e.message}`)
  }
}

// ──────────────────────────────────────────────
//  Summary Report
// ──────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════════════════════════')
console.log('  📊 SEMANTIC SELF-HEALING REPORT')
console.log('═══════════════════════════════════════════════════════════════')

if (results.length === 0) {
  console.log('  No policies processed')
  process.exit(0)
}

const totalFields = results.reduce((s, r) => s + r.records.length, 0)
const totalPrimaryValid = results.reduce((s, r) => s + r.primaryValid, 0)
const totalHealed = results.reduce(
  (s, r) => s + r.records.filter((rec) => rec.healed && !rec.initialValid).length,
  0
)
const totalFinalValid = results.reduce((s, r) => s + r.totalValid, 0)
const totalTime = results.reduce((s, r) => s + r.primaryTime + (r.healingTime || 0), 0)

console.log(`  Policies processed: ${results.length}`)
console.log(`  Total fields: ${totalFields} (${Object.keys(VALIDATORS).length} per policy)`)
console.log(
  `  Primary valid: ${totalPrimaryValid}/${totalFields} (${Math.round((totalPrimaryValid / totalFields) * 100)}%)`
)
console.log(`  Healing recoveries: ${totalHealed}`)
console.log(
  `  Final valid: ${totalFinalValid}/${totalFields} (${Math.round((totalFinalValid / totalFields) * 100)}%)`
)
console.log(`  Total time: ${totalTime.toFixed(0)}s`)

// Per-field stats
const fieldStats: Record<string, { total: number; valid: number; healed: number }> = {}
for (const r of results) {
  for (const rec of r.records) {
    if (!fieldStats[rec.field]) fieldStats[rec.field] = { total: 0, valid: 0, healed: 0 }
    fieldStats[rec.field].total++
    if (rec.initialValid) fieldStats[rec.field].valid++
    if (rec.healed) fieldStats[rec.field].healed++
  }
}

console.log('\n── Per-field breakdown ──')
for (const [field, stats] of Object.entries(fieldStats)) {
  const accuracy = stats.total > 0 ? Math.round((stats.valid / stats.total) * 100) : 0
  const healRate =
    stats.total - stats.valid > 0
      ? Math.round((stats.healed / (stats.total - stats.valid)) * 100)
      : 0
  console.log(
    `  ${field.padEnd(15)} ${stats.valid}/${stats.total} initial (${accuracy}%) | healed: ${stats.healed} (${healRate}%)`
  )
}

console.log('\n── Healed fields — before → after ──')
for (const r of results) {
  const healed = r.records.filter((rec) => rec.healed && !rec.initialValid)
  if (healed.length > 0) {
    console.log(`  ${r.name}:`)
    for (const rec of healed) {
      console.log(`    ${rec.field}: "${rec.initialValue}" → "${rec.healedValue}" ^`)
    }
  }
}

console.log('\n── Per-policy summary ──')
console.log(
  `  ${'Policy'.padEnd(50)} ${'Pr'.padEnd(3)} ${'Hl'.padEnd(3)} ${'Fin'.padEnd(5)} ${'Time'}`
)
for (const r of results) {
  const primaryPct =
    r.primaryValid > 0
      ? Math.round((r.primaryValid / (r.primaryValid + r.primaryInvalid)) * 100)
      : 0
  const finalPct =
    r.totalValid > 0 ? Math.round((r.totalValid / (r.totalValid + r.totalInvalid)) * 100) : 0
  console.log(
    `  ${r.name.substring(0, 48).padEnd(50)} ${String(primaryPct).padEnd(3)} ${r.healingRate.padEnd(3)} ${String(finalPct).padEnd(3)}% ${(r.primaryTime + (r.healingTime || 0)).toFixed(1)}s`
  )
}

console.log('\n═══════════════════════════════════════════════════════════════')
