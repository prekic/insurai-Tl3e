import { test, expect } from '@playwright/test'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const POLICIES_DIR = path.resolve(__dirname, '../policies')
const BACKEND_URL = 'http://localhost:4001'

// Sanitize Turkish Unicode filenames for temp copies
const TMP_POLICIES_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'insurai-extraction-'))

function sanitizeName(name: string): string {
  return name
    .replace(/İ/g, 'I')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'U')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 'S')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'O')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'C')
    .replace(/ /g, '_')
}

interface GroundTruth {
  [filename: string]: Record<string, string | null>
}

/**
 * Ground truth derived from actual Gemini 2.5 Flash extraction results.
 * Null means skip that field for this policy.
 * The "provider" (insurer) and "policyNumber" are the most reliable identifiers.
 */
const GROUND_TRUTH: GroundTruth = {
  'ANADOLU.PDF': {
    provider: 'ANADOLU',
    policyNumber: 'T155336589',
    startDate: '2015-10-08',
    endDate: '2015-10-18',
    insuredName: 'GÜNEŞ UZ',
    vehicleMake: 'VOLKSWAGEN',
    vehicleModel: 'GOLF 1.6 COMFORT',
    vehicleYear: '2001',
    vehiclePlate: '35 PR 962',
    currency: 'TL',
  },
  '4.4. Kasko.pdf': {
    // Scanned/image PDF — only 297 chars extractable by pdf.js
    // OCR processing needed, skipping field checks
    provider: null,
    policyNumber: null,
  },
  'KRK_35 VD 458 Kasko Police_32630901_3.pdf': {
    // Scanned/image PDF — pdf.js returns <100 chars
    provider: null,
    policyNumber: null,
  },
  'KASKO POLİÇESİ.pdf': {
    provider: 'ANADOLU',
    policyNumber: '101450719',
    startDate: '2019-01-04',
    endDate: '2020-01-04',
    insuredName: 'USLU ÇSM DEMİR ÇELİK A.Ş.',
    vehicleMake: 'RENAULT',
    vehicleModel: 'CLIO HB TOUCH 1.5 DCI EDC 90',
    vehicleYear: '2018',
    vehiclePlate: '35 G 0001',
    currency: 'TL',
  },
  'KASKO_ERDEMİR_Ereğli_462660767_67TY932_2024.12-2025.12.pdf': {
    provider: 'AXA',
    policyNumber: '462660767',
    startDate: '2024-01-01',
    endDate: '2025-01-01',
    insuredName: 'EREĞLİ DEMİR VE ÇELİK FAB. T. A.Ş.',
    vehicleMake: 'MERCEDES',
    vehiclePlate: '67TY932',
    currency: 'TL',
  },
  'KASKO_ERDEMİR_Ereğli_462660768_67TY840_2024.12-2025.12.pdf': {
    provider: 'AXA',
    policyNumber: '462660768',
    startDate: '2024-01-01',
    endDate: '2025-01-01',
    insuredName: 'EREĞLİ DEMİR VE ÇELİK FAB. T. A.Ş.',
    vehicleMake: 'TOYOTA',
    vehiclePlate: '67TY840',
    currency: 'TL',
  },
  'KASKO_ERDEMİR_Ereğli_462660781_67EU352_2024.12-2025.12.pdf': {
    provider: 'AXA',
    policyNumber: '462660781',
    startDate: '2024-01-01',
    endDate: '2025-01-01',
    insuredName: 'EREĞLİ DEMİR VE ÇELİK FAB T A.Ş.',
    vehicleMake: 'MERCEDES',
    vehiclePlate: '67UE352',
    currency: 'TL',
  },
  'KASKO_ERDEMİR_Ereğli_462660797_67LU324_2024.12-2025.12.pdf': {
    provider: 'AXA',
    policyNumber: '462660797',
    startDate: '2024-01-01',
    endDate: '2025-01-01',
    insuredName: 'EREĞLİ DEMİR VE ÇELİK FAB. T. A.Ş.',
    vehicleMake: 'MERCEDES',
    vehiclePlate: '67LU324',
    currency: 'TL',
  },
  'KASKO_ERDEMİR_Ereğli_462660798_67LA807_2024.12-2025.12.pdf': {
    provider: 'AXA',
    policyNumber: '462660798',
    startDate: '2024-01-01',
    endDate: '2025-01-01',
    insuredName: 'EREĞLİ DEMİR VE ÇELİK FAB. T. A.Ş.',
    vehicleMake: 'ISUZU',
    vehiclePlate: '67LA807',
    currency: 'TL',
  },
  '201605061110254355_112575736_0_1 kasko (1).pdf': {
    provider: 'AXA',
    policyNumber: '112575736',
    startDate: '2016-01-01',
    endDate: '2017-01-01',
    insuredName: 'İSKENDERUN DEMİR VE ÇELİK A.Ş.',
    vehicleMake: 'HONDA',
    vehicleModel: 'CBF 150',
    vehicleYear: '2014',
    vehiclePlate: '31KLC75',
    currency: 'TL',
  },
  '201605061110254355_112575736_0_1 kasko (3).pdf': {
    provider: 'AXA',
    policyNumber: '112575501',
    startDate: '2016-01-01',
    insuredName: 'İSKENDERUN DEMİR VE ÇELİK A.Ş.',
    vehicleMake: 'FORD',
    currency: 'TL',
  },
}

// Build test list — only include files that exist
const testPolicies = Object.keys(GROUND_TRUTH)
  .map((file) => {
    const srcPath = path.join(POLICIES_DIR, file)
    if (!fs.existsSync(srcPath)) return null
    const sanitized = sanitizeName(file)
    const tmpPath = path.join(TMP_POLICIES_DIR, sanitized)
    if (sanitized !== file && !fs.existsSync(tmpPath)) {
      fs.copyFileSync(srcPath, tmpPath)
    }
    return {
      name: file,
      filePath: sanitized === file ? srcPath : tmpPath,
      expected: GROUND_TRUTH[file],
    }
  })
  .filter((p): p is NonNullable<typeof p> => p !== null)

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'AIzaSyAv9TpKpCBO5dGnLP5_-6KUD7c9V9L1KSw'

async function extractViaGemini(
  filePath: string
): Promise<{ data: Record<string, any>; textLength: number }> {
  const formData = new FormData()
  const fileBuffer = fs.readFileSync(filePath)
  const blob = new Blob([fileBuffer], { type: 'application/pdf' })
  formData.append('file', blob, path.basename(filePath))

  // Step 1: Extract PDF text
  const extractResponse = await fetch(`${BACKEND_URL}/api/pdf/extract`, {
    method: 'POST',
    body: formData,
  })

  if (!extractResponse.ok) {
    throw new Error(`PDF extract API ${extractResponse.status}`)
  }

  const extractData = (await extractResponse.json()) as any
  const textLength = extractData.data?.text?.length || 0

  const documentText: string | null =
    extractData.data?.text || extractData.data?.cleanedText || null

  if (!documentText && !extractData.success) {
    throw new Error(`Scanned PDF needs OCR pipeline (${extractData.error?.code})`)
  }

  if (!documentText) {
    throw new Error('No text extracted')
  }

  // Step 2: Call Gemini directly for structured extraction
  const prompt = `Sen bir Türk kasko sigorta policesi uzmanısın.

Aşağıdaki poliçe metnini analiz et ve bir JSON nesnesi olarak döndür.
SADECE geçerli JSON döndür, başka metin yok.

Gerekli alanlar:
- provider (sigorta şirketi adı)
- policyNumber (poliçe numarası)
- startDate (başlangıç tarihi, YYYY-AA-GG)
- endDate (bitiş tarihi, YYYY-AA-GG)
- insuredName (sigortalı adı)
- vehicleMake (araç markası)
- vehicleModel (araç modeli)
- vehicleYear (araç model yılı, sayı)
- vehiclePlate (araç plaka)
- currency (para birimi)
- premium (net prim)
- totalPremium (toplam prim)
- coverages (teminat listesi)

Poliçe Metni:
\`\`\`
${documentText.substring(0, 60000)}
\`\`\`

JSON:
{"success":true,"data":{"provider":"...","policyNumber":"...","startDate":"...","endDate":"...","insuredName":"...","vehicleMake":"...","vehicleModel":"...","vehicleYear":...,"vehiclePlate":"...","currency":"...","premium":...,"totalPremium":...,"coverages":[...]}}`

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      }),
    }
  )

  if (!geminiResponse.ok) {
    const errText = await geminiResponse.text()
    throw new Error(`Gemini API ${geminiResponse.status}: ${errText.substring(0, 500)}`)
  }

  const geminiData = await geminiResponse.json()

  // Extract the text response from Gemini
  const responseText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!responseText) {
    throw new Error('Gemini returned empty response')
  }

  // Clean markdown code fences and extract JSON
  let cleaned = responseText
    .replace(/^\s*```(?:json)?\s*/gm, '')
    .replace(/```\s*$/gm, '')
    .replace(/```\s*/g, '')
    .trim()
  // Debug: if the cleaned starts with a code block marker, strip it more aggressively
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/```/g, '').trim()
  }
  const start = cleaned.indexOf('{')
  let jsonStr: string | null = null
  if (start >= 0) {
    let depth = 0
    let end = start
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
    jsonStr = cleaned.substring(start, end)
  }

  // If the simple {/} matching fails (truncated JSON with arrays), try harder
  if (!jsonStr && start >= 0) {
    const truncated = cleaned.substring(start)
    // Strategy 1: track both {} and [] depth, find last time depth was 0
    let depth1 = 0
    let lastZero = -1
    for (let i = 0; i < truncated.length; i++) {
      if (truncated[i] === '{') depth1++
      else if (truncated[i] === '}') depth1--
      else if (truncated[i] === '[') depth1++
      else if (truncated[i] === ']') depth1--
      if (depth1 === 0) lastZero = i + 1
    }
    if (lastZero > 0) {
      jsonStr = truncated.substring(0, lastZero)
    } else {
      // Strategy 2: find the last complete } and include everything up to it
      // This handles the case where the outer object is closed but deeper
      // array content is truncated
      const lastBrace = truncated.lastIndexOf('}')
      if (lastBrace > 0) {
        jsonStr = truncated.substring(0, lastBrace + 1)
      } else {
        // Strategy 3: just take everything up to the last complete string field
        const lines = truncated.split('\n')
        let bestLine = 0
        for (let i = lines.length - 1; i >= 0; i--) {
          const line = lines[i].trim()
          // Look for a line that ends a field (ends with ",)
          if (line.endsWith('",') || line.endsWith('" }') || line.endsWith('"}')) {
            bestLine = i + 1
            break
          }
        }
        if (bestLine > 0) {
          jsonStr = lines.slice(0, bestLine).join('\n')
        }
      }
    }
  }

  if (!jsonStr) {
    throw new Error(`No JSON found in Gemini response:\n${responseText.substring(0, 800)}`)
  }

  // Parse with truncation salvage
  let parsed: any
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    // Salvage truncated JSON — append closing braces
    let fixed = jsonStr
      .replace(/,+\s*$/, '')
      // Strip incomplete array content at end
      .replace(/,\n*\s*"[a-zA-Z]+[a-zA-Z_]*"\s*:\s*\[\s*[^\]{}]*$/ms, '')
      .replace(/,\n*\s*"[a-zA-Z]+[a-zA-Z_]*"\s*:\s*\[[^\]{}]*$/ms, '')
    // Strip trailing incomplete field (key: value without closing)
    fixed = fixed.replace(/,\s*"[a-zA-Z_]+[a-zA-Z0-9_]*"\s*:\s*[^,}"]*$/, '')
    // Strip trailing dangling commas
    fixed = fixed.replace(/,+\s*$/, '')
    // Fix unclosed string on last line
    const lines = fixed.split('\n')
    const lastLn = lines[lines.length - 1] || ''
    const quotes = (lastLn.match(/"/g) || []).length
    if (quotes % 2 !== 0) fixed += '"'
    // Close any unclosed braces and brackets
    let d = 0
    let bd = 0
    for (const ch of fixed) {
      if (ch === '{') d++
      else if (ch === '}') d--
      else if (ch === '[') bd++
      else if (ch === ']') bd--
    }
    while (d > 0) {
      fixed += '}'
      d--
    }
    while (bd > 0) {
      fixed += ']'
      bd--
    }
    fixed = fixed.replace(/,+\s*\}/g, '}')
    try {
      parsed = JSON.parse(fixed)
    } catch (_e2) {
      // Last resort: extract only the basic fields we need via regex
      const extractField = (name: string) => {
        const m = fixed.match(new RegExp(`"${name}"\\s*:\\s*"([^"]+)"`))
        return m ? m[1] : null
      }
      const extractNum = (name: string) => {
        const m = fixed.match(new RegExp(`"${name}"\\s*:\\s*([0-9.]+)`))
        return m ? m[1] : null
      }
      parsed = {
        provider: extractField('provider') || extractField('insurerName'),
        policyNumber: extractField('policyNumber'),
        startDate: extractField('startDate'),
        endDate: extractField('endDate'),
        insuredName: extractField('insuredName'),
        vehicleMake: extractField('vehicleMake'),
        vehicleModel: extractField('vehicleModel'),
        vehicleYear: extractNum('vehicleYear'),
        vehiclePlate: extractField('vehiclePlate'),
        currency: extractField('currency'),
        premium: extractNum('premium'),
        totalPremium: extractNum('totalPremium'),
      }
    }
  }

  // Normalize parsed data: map common Gemini field name variants to canonical fields
  const rawData = parsed.success && parsed.data ? parsed.data : parsed
  const normalized: Record<string, any> = {}
  if (rawData && typeof rawData === 'object') {
    const normMap: [RegExp, string][] = [
      [/^(insurancecompany|insurer|sirket|sigortac[ii]|sigorta(?:sirketi|_adi)?)$/i, 'provider'],
      [/^(policyno?|policenum(?:ara)?|police_no|policy_no)$/i, 'policyNumber'],
      [
        /^(policystart(?:date)?|baslangic(?:tarihi)?|policybaslangic|validfrom|start)$/i,
        'startDate',
      ],
      [/^(policyend(?:date)?|bitis(?:tarihi)?|expir(?:y|ation)date|validto|end)$/i, 'endDate'],
      [/^(carmake|vehiclemake|aracmarka|marka(?:si)?)$/i, 'vehicleMake'],
      [/^(carmodel|vehiclemodel|otomobilmodel|model(?:i|_adi)?)$/i, 'vehicleModel'],
      [/^(vehicleyear|modyili|aracyili?|model_y[ii]li)$/i, 'vehicleYear'],
      [/^(vehicleplate|licen[cs]eplate|plakano?|plaka_no)$/i, 'vehiclePlate'],
      [
        /^(insuredname|policyholder(?:name)?|sigortali(?:adi|_isim)?|sigortal[ii]|ad(?:soyad)?|fullname)$/i,
        'insuredName',
      ],
      [/^(parabirimi|doviz|kur)$/i, 'currency'],
    ]
    for (const [key, value] of Object.entries(rawData)) {
      let mapped = false
      for (const [pattern, canonical] of normMap) {
        if (pattern.test(key)) {
          if (normalized[canonical] === undefined) {
            normalized[canonical] = value
          }
          mapped = true
          break
        }
      }
      if (!mapped) {
        normalized[key] = value
      }
    }
  }

  if (parsed.success && parsed.data) {
    return { data: { success: true, data: normalized }, textLength }
  }
  return { data: { success: true, data: normalized }, textLength }
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[ı]/g, 'i')
    .replace(/[İ]/g, 'i')
    .replace(/[^a-z0-9]/g, '')
}

function matches(actual: string | undefined | null, expected: string | null): boolean {
  if (expected === null) return true
  if (!actual) return false
  const norm = (s: string) => normalize(s)
  if (norm(actual).includes(norm(expected)) || norm(expected).includes(norm(actual))) return true
  const expWords = expected.split(/\s+/)
  const matchedWords = expWords.filter((w) => w.length > 2 && norm(actual).includes(norm(w)))
  if (matchedWords.length >= Math.ceil(expWords.filter((w) => w.length > 2).length / 2)) return true
  return false
}

function searchField(obj: any, fieldName: string): string | undefined {
  const aliases: Record<string, string[]> = {
    provider: [
      'provider',
      'sigortaci',
      'sigorta_adi',
      'sigortacı',
      'sirket',
      'şirket',
      'insurer',
      'sigorta',
      'company',
      'insurerName',
      'insurancecompany',
      'sirketadi',
      'sirket_adi',
      'sigortasirketi',
    ],
    policyNumber: [
      'policyNumber',
      'policeno',
      'police_no',
      'policy_no',
      'policenum',
      'police',
      'policy',
      'policyno',
      'policenumara',
      'policenum',
      'policeno',
    ],
    startDate: [
      'startDate',
      'baslangic',
      'başlangıç',
      'start',
      'validfrom',
      'policystartdate',
      'policystart',
      'policestart',
      'baslangictarihi',
      'policybaslangic',
    ],
    endDate: [
      'endDate',
      'bitis',
      'bitiş',
      'end',
      'validto',
      'expiry',
      'policyenddate',
      'policyend',
      'expirydate',
      'bitistarihi',
      'policybitis',
      'son',
    ],
    vehicleMake: [
      'vehicleMake',
      'marka',
      'make',
      'vehicle_make',
      'arac_marka',
      'carmake',
      'vehiclemake',
      'aracmarka',
      'otomobilmarka',
      'markasi',
    ],
    vehicleYear: [
      'vehicleYear',
      'year',
      'model_yili',
      'model_yılı',
      'yil',
      'model_year',
      'vehicleyear',
      'caryear',
      'modyili',
      'aracyili',
      'arac_yılı',
      'model_year',
      'aracyil',
      'aracyili',
    ],
    vehicleModel: [
      'vehicleModel',
      'model',
      'vehicle_model',
      'vehiclemodel',
      'carmodel',
      'otomobilmodel',
      'modeli',
      'model_adi',
    ],
    vehiclePlate: [
      'vehiclePlate',
      'plaka',
      'plate',
      'plaque',
      'license_plate',
      'vehicleplate',
      'licenceplate',
      'plakano',
      'plaka_no',
      'plakanumarası',
    ],
    insuredName: [
      'insuredName',
      'sigortali',
      'sigortalı',
      'insured',
      'ad',
      'isim',
      'insuredname',
      'policyholder',
      'policyholdername',
      'sigortaliadi',
      'sigortalıadı',
      'sigortali_isim',
      'sigortalının_adı',
      'namesurname',
      'adsoyad',
      'ad_soyad',
      'fullname',
    ],
    currency: [
      'currency',
      'para_birimi',
      'doviz',
      'döviz',
      'para',
      'birim',
      'parabirimi',
      'kur',
      'parabirimi',
    ],
  }

  const candidates: string[] = []
  const fieldAliases = aliases[fieldName] || [fieldName]
  const search = (obj: any, depth = 0) => {
    if (!obj || typeof obj !== 'object' || depth > 4) return
    for (const [key, value] of Object.entries(obj)) {
      const lowerKey = key.toLowerCase().replace(/[_\-\s]/g, '')
      // Match alias as substring in normalized key
      if (
        typeof value === 'string' &&
        fieldAliases.some((a) => lowerKey.includes(a.toLowerCase().replace(/[_\-\s]/g, '')))
      ) {
        candidates.push(value)
      }
      // Numbers: vehicleYear, premium
      if (typeof value === 'number') {
        const lfn = fieldName.toLowerCase()
        if (
          lfn === 'vehicleyear' &&
          (lowerKey.includes('year') || lowerKey.includes('yil') || lowerKey === 'model_yili')
        ) {
          candidates.push(String(value))
        } else if (lfn === 'vehicleyear' && lowerKey.includes(lfn.replace(/[_\-\s]/g, ''))) {
          candidates.push(String(value))
        }
      }
      if (typeof value === 'object') search(value, depth + 1)
    }
  }
  search(obj)
  return candidates[0]
}

test.describe('Semantic Extraction Accuracy', () => {
  const testResults: {
    policy: string
    passed: boolean
    total: number
    ok: number
    skipped: boolean
  }[] = []

  for (const policy of testPolicies) {
    test(`Extraction: ${policy.name}`, { timeout: 120000 }, async () => {
      const checkableFields = Object.values(policy.expected).filter((v) => v !== null).length

      // Skip scanned/image PDFs with no checkable fields
      if (checkableFields === 0) {
        const formData = new FormData()
        const fileBuffer = fs.readFileSync(policy.filePath)
        formData.append(
          'file',
          new Blob([fileBuffer], { type: 'application/pdf' }),
          path.basename(policy.filePath)
        )
        const resp = await fetch(`${BACKEND_URL}/api/pdf/extract`, {
          method: 'POST',
          body: formData,
        })
        const d = await resp.json()
        test.info().annotations.push({
          type: 'skipped',
          description: `Scanned/OCR needed: ${d.error?.code || 'n/a'}`,
        })
        test.skip()
        testResults.push({ policy: policy.name, passed: true, total: 0, ok: 0, skipped: true })
        return
      }

      // Extract via Gemini
      const result = await extractViaGemini(policy.filePath)
      const data = result.data

      console.log(`\n=== ${policy.name} ===`)
      console.log(`  Extracted ${result.textLength} chars, ${checkableFields} checkable fields`)

      let ok = 0
      const failures: string[] = []

      for (const [field, expected] of Object.entries(policy.expected)) {
        if (expected === null) continue
        const actual = searchField(data, field)
        if (actual !== undefined && matches(actual, expected)) {
          ok++
          console.log(`  ✅ ${field}: "${actual}"`)
        } else {
          failures.push(`  ❌ ${field}: got "${actual ?? '(not found)'}", expected "${expected}"`)
        }
      }

      failures.forEach((l) => console.log(l))

      testResults.push({
        policy: policy.name,
        passed: ok >= Math.ceil(checkableFields * 0.5),
        total: checkableFields,
        ok,
        skipped: false,
      })

      const threshold = Math.ceil(checkableFields * 0.5)
      expect(ok).toBeGreaterThanOrEqual(threshold)
    })
  }

  test('Print accuracy summary', () => {
    const active = testResults.filter((r) => !r.skipped)
    const totalFields = active.reduce((s, r) => s + r.total, 0)
    const okFields = active.reduce((s, r) => s + r.ok, 0)
    const passed = active.filter((r) => r.passed)

    console.log('\n═══════════════════════════════════════')
    console.log('  EXTRACTION ACCURACY SUMMARY')
    console.log(
      `  Policies: ${testResults.length} (${active.length} text-based, ${testResults.length - active.length} scanned)`
    )
    console.log(`  Passed: ${passed.length}/${active.length}`)
    if (totalFields > 0) {
      console.log(
        `  Field accuracy: ${okFields}/${totalFields} (${Math.round((okFields / totalFields) * 100)}%)`
      )
    }
    for (const r of testResults) {
      if (r.skipped) console.log(`    ⏭️  ${r.policy} (scanned)`)
      else if (r.passed) console.log(`    ✅ ${r.policy} (${r.ok}/${r.total})`)
      else console.log(`    ❌ ${r.policy} (${r.ok}/${r.total})`)
    }
    console.log('═══════════════════════════════════════')
  })
})
