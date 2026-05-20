import { extractVehicleInfoFromText, parseTurkishCurrency, parseTurkishDate } from './turkish-utils'

import { ExtractedCoverage, ExtractedPolicyData } from './extraction-schema'

import type { AnalyzedPolicy, Coverage, CoverageImportance, PolicyType } from '@/types/policy'

import { POLICY_TYPES } from '@/types/policy'

import { generateAnalysisBundle } from '@/lib/analysis/engine'

import { RiskAssessmentService } from '@/lib/ml'

import { GapDetectionService } from '@/lib/gap-detection'

import { lookupCoverageNameTr } from '@/lib/i18n/coverage-names'

import { ensureExclusionsEn } from '@/lib/i18n/exclusion-translations'

// ============================================================================
// TWO-PASS COMPREHENSIVE EXTRACTION
// Implements the enhanced extraction with structured output
// ============================================================================

// Modular imports:
import {
  derivePartsClauseInsight,
  translateInsightsToTr,
  translateInsightToEn,
  translateInsightToTr,
} from './insight-translator'

import { generateAIInsightsAsync, generateMarketComparisonAsync } from './policy-extractor'

/**
 * Headers that precede an Ek Sözleşme Maddeleri bulleted list in Turkish
 * kasko policies. Different insurers phrase the preamble differently, but
 * they all produce a bulleted block of add-on coverages afterwards.
 */
const EK_SOZLESME_HEADERS: RegExp[] = [
  /ek\s*s[öo]zle[şs]me\s*maddeler[iİ]?/i,
  /ek\s*teminat(?:lar)?\s*(?:listesi)?/i,
  /ek\s*s[öo]zle[şs]meyle\s*teminat\s*kapsam[ıi]na\s*d[aâ]hil/i,
  /genel\s*[şs]artlar['’]?a?\s*g[öo]re\s*ek\s*s[öo]zle[şs]me/i,
]

/**
 * Extract bulleted Ek Sözleşme / additional-coverage entries from the raw
 * policy text. Returns canonical short names (first 80 chars before a
 * comma/paren, trimmed).
 *
 * Bullet markers vary across pdf-parse output: `•`, `●`, `·`, `-`, and
 * (common for Anadolu) a lowercase `l` that the PDF renderer emits in place
 * of a filled-circle glyph.
 */
export function extractEkSozlesmeBullets(rawText: string): string[] {
  if (!rawText) return []

  // Find the first matching section header
  let sectionStart = -1
  for (const header of EK_SOZLESME_HEADERS) {
    const m = rawText.match(header)
    if (m && m.index !== undefined && (sectionStart === -1 || m.index < sectionStart)) {
      sectionStart = m.index
    }
  }
  if (sectionStart === -1) return []

  // Scan from a little before the header through the next ~4000 chars so we
  // catch the continuation page that Anadolu prints the bullets on.
  const windowText = rawText.slice(sectionStart, sectionStart + 4000)
  const lines = windowText.split(/\r?\n/)

  const bullets: string[] = []
  const seen = new Set<string>()
  // Accept bullet-prefixed or indented lines; stop when we encounter a line
  // that looks like a new section heading (ALL CAPS without a bullet).
  const BULLET_RE = /^[\s\t]*[l•●·▪►·-]\s+(.{3,})$/
  let hitFirstBullet = false
  let consecutiveNonBullets = 0

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) continue
    const m = line.match(BULLET_RE)
    if (m) {
      hitFirstBullet = true
      consecutiveNonBullets = 0
      // Strip trailing punctuation, chapter references like `(A.4.2.)`, and
      // any stray trailing punctuation left behind. Apply in this order so
      // that `hasarlar (A.4.11.),` → `hasarlar`.
      const cleaned = m[1]
        .replace(/\s*[,;.]+\s*$/, '')
        .replace(/\s*\([^)]*\)\s*$/, '')
        .replace(/\s*[,;.]+\s*$/, '')
        .trim()
      // Accept 3-char names like "Sel" / "TÜV" that are real Turkish kasko
      // add-on labels; cap at 120 to avoid capturing whole sentences.
      if (cleaned.length < 3 || cleaned.length > 120) continue
      const key = cleaned.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      bullets.push(cleaned)
      continue
    }
    if (hitFirstBullet) {
      // Stop immediately on an ALL-CAPS line (Turkish section heading) —
      // "SONRAKİ BÖLÜM", "TEMİNAT HAKKINDA GENEL BİLGİLER", etc.
      if (/^[A-ZÇĞİÖŞÜ\s\d.]{4,}$/.test(line)) break
      // Tolerate one wrapped-line continuation (no bullet marker on the
      // next line), but stop after two consecutive non-bullet lines.
      consecutiveNonBullets++
      if (consecutiveNonBullets >= 2) break
    }
  }

  return bullets
}

/**
 * Convert extracted data to AnalyzedPolicy format
 * @param data - Extracted policy data from AI
 * @param file - Original PDF file
 * @param rawText - Raw extracted text from PDF/OCR (for reference)
 * @param processedText - AI-processed text with OCR corrections (for display and chat)
 */
export async function convertToAnalyzedPolicy(
  data: ExtractedPolicyData,
  file: File,
  rawText?: string,
  processedText?: string,
  safetyResult?: {
    flags: Array<{ level: 'Safe' | 'Warning' | 'Error'; message: string; field?: string }>
    isValid: boolean
    blockReason?: string
  }
): Promise<AnalyzedPolicy> {
  const now = new Date()

  // Debug logging for production troubleshooting
  console.warn('[convertToAnalyzedPolicy] Input data:', {
    hasCoverages: !!data.coverages,
    coveragesIsArray: Array.isArray(data.coverages),
    coveragesLength: Array.isArray(data.coverages) ? data.coverages.length : 'N/A',
    policyType: data.policyType,
    hasExclusions: !!data.exclusions,
    hasSpecialConditions: !!data.specialConditions,
  })

  // Ensure coverages is always an array (defensive check)
  if (!data.coverages || !Array.isArray(data.coverages)) {
    console.warn('[convertToAnalyzedPolicy] coverages missing or not array, defaulting to []')
    data.coverages = []
  }

  // Ensure exclusions and specialConditions are arrays
  if (!data.exclusions || !Array.isArray(data.exclusions)) {
    data.exclusions = []
  }

  // Filter out null/undefined entries first — AI may return [null] or [{}]
  // which would crash the .map() below on obj.description access.
  data.exclusions = data.exclusions
    .filter((e: unknown) => e != null)
    .map((e: unknown): string => {
      if (typeof e === 'string') return e
      const obj = e as Record<string, unknown>
      return (
        (typeof obj.description === 'string' ? obj.description : undefined) ??
        (typeof obj.text === 'string' ? obj.text : undefined) ??
        (typeof obj.name === 'string' ? obj.name : undefined) ??
        String(e)
      )
    })
  if (!data.specialConditions || !Array.isArray(data.specialConditions)) {
    data.specialConditions = []
  }

  // Filter out null/undefined entries first
  data.specialConditions = data.specialConditions
    .filter((c: unknown) => c != null)
    .map((c: unknown): string => {
      if (typeof c === 'string') return c
      const obj = c as Record<string, unknown>
      return (
        (typeof obj.description === 'string' ? obj.description : undefined) ??
        (typeof obj.text === 'string' ? obj.text : undefined) ??
        String(c)
      )
    })

  // Determine status based on dates
  // Handle both camelCase (endDate) and snake_case (end_date) from AI
  const rawEndDate =
    data.endDate ?? ('end_date' in data ? (data.end_date as string | undefined) : undefined)
  let status: 'active' | 'expiring' | 'expired' | 'pending' = 'active'
  let expiryDateStr = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split('T')[0]

  if (rawEndDate) {
    // Use parseTurkishDate first to avoid V8 Date constructor silently swapping
    // day/month on Turkish DD.MM.YYYY strings when day ≤ 12 (see gotcha #52)
    const parsedEnd = parseTurkishDate(rawEndDate)
    let endDate: Date | null = null

    if (parsedEnd) {
      expiryDateStr = parsedEnd
      endDate = new Date(parsedEnd + 'T00:00:00Z')
    } else {
      // Fallback for ISO datetimes (e.g. "2024-12-15T00:00:00Z") that parseTurkishDate doesn't cover
      const d = new Date(rawEndDate)
      if (!isNaN(d.getTime())) {
        expiryDateStr = d.toISOString().split('T')[0]
        endDate = d
      } else {
        expiryDateStr = rawEndDate // totally unparseable — keep raw string
      }
    }

    if (endDate && !isNaN(endDate.getTime())) {
      const daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

      if (daysUntilExpiry < 0) {
        status = 'expired'
      } else if (daysUntilExpiry <= 30) {
        status = 'expiring'
      }
    }
  }

  // Convert coverages with Turkish names and enhanced metadata
  // Handle cases where AI returns description instead of name, or both are missing
  // Resolution order for nameTr:
  //   1. AI-provided nameTr (if different from name)
  //   2. Lookup in canonical coverage names map
  //   3. Fall back to English name
  // Filter out null/undefined coverage entries — AI may return [null] entries
  const coverages: Coverage[] = data.coverages
    .filter((c: unknown) => c != null)
    .map((c) => {
      const coverageName = c.name || c.description || 'Unnamed Coverage'
      const aiNameTr = c.nameTr && c.nameTr !== coverageName ? c.nameTr : null
      const mappedNameTr = lookupCoverageNameTr(coverageName)
      const resolvedNameTr = aiNameTr ?? mappedNameTr ?? coverageName
      // Sprint 3 PR-S3.1 — recover Hatalı Akaryakıt limit (50K) when the LLM
      // extracted the description but missed setting limit.
      const recoveredLimit = recoverWrongFuelLimit(
        coverageName,
        resolvedNameTr,
        c.description,
        c.clause,
        c.quote,
        c.limit ?? 0
      )
      // Sprint 3 PR-S3.4 — gloss for Anadolu Hizmet assistance package when
      // the LLM didn't populate a substantive description.
      const hizmetGloss = generateAnadoluHizmetGloss(coverageName, resolvedNameTr, c.description)
      return {
        name: coverageName,
        nameTr: resolvedNameTr,
        limit: recoveredLimit ?? c.limit ?? 0,
        deductible: c.deductible ?? 0,
        included: c.included ?? true,
        description: hizmetGloss ?? c.description ?? undefined,
        isUnlimited: c.isUnlimited ?? false,
        isMarketValue: c.isMarketValue ?? false,
        category: recategorizeIfGlassRepair(coverageName, resolvedNameTr, c.category ?? 'other'),
        importance: determineCoverageImportance(c),
        // Evidence pointers — propagate from ExtractedCoverage so the reviewer
        // UI can surface "Page N / § clause / quote" provenance.
        page: c.page ?? null,
        clause: c.clause ?? null,
        quote: c.quote ?? null,
        carveOuts: c.carveOuts ?? null,
      }
    })

  // Get policy type - handle both camelCase and snake_case
  const rawPolicyType = data.policyType ?? data.policy_type
  const policyType = (
    rawPolicyType && rawPolicyType in POLICY_TYPES ? rawPolicyType : 'home'
  ) as PolicyType
  const typeInfo = POLICY_TYPES[policyType]

  if (rawPolicyType && !(rawPolicyType in POLICY_TYPES)) {
    console.warn(
      `[convertToAnalyzedPolicy] Unknown policy type: ${rawPolicyType}, falling back to 'home'`
    )
  }

  // ── Ek Sözleşme Maddeleri deterministic fallback ───────────────────
  // Turkish kasko policies typically include a bulleted "Ek Sözleşme
  // Maddeleri" / "Genel Şartlar'a göre ek sözleşmeyle ... dâhil edilmiştir"
  // section listing add-on coverages (Deprem, Sel, Terör, Anahtarın Ele
  // Geçirilmesi, Kilit Mekanizması, etc.). When the LLM omits these as
  // structured coverages, we parse the bullets from the raw text and
  // inject synthetic `category: 'supplementary'` rows so downstream coverage
  // enumeration and Value scoring pick them up.
  if (rawText && (policyType === 'kasko' || policyType === 'traffic')) {
    // Apr 30 2026 — gate dropped (was: supplementaryFromLlm < 3). Reviewer
    // caught the LLM returning 3 generic supplementary coverages while
    // missing the Anadolu-specific add-on bundle (Hatalı Akaryakıt, Cam Hasar
    // Koruma, Hasarsızlık İndirimi Koruma, İkame Araç, Evcil Hayvan, Anahtar
    // Çalınma, Mini Onarım, Eskisi Yerine Yenisi). Three generic hits passed
    // the < 3 threshold and the regex fallback never ran. The startsWith
    // dedup below is bidirectional, so over-firing this pass is safe.
    {
      const bullets = extractEkSozlesmeBullets(rawText)
      const existingNames = new Set(coverages.map((c) => c.name.toLowerCase()))
      for (const bullet of bullets) {
        const key = bullet.toLowerCase()
        // Skip bullets that duplicate an existing coverage name (startsWith
        // match is sufficient — "Deprem, toprak kayması, ..." collides with
        // "Deprem" already extracted as a main-category peril).
        const dup = [...existingNames].some(
          (n) => n.length >= 5 && (key.startsWith(n) || n.startsWith(key.slice(0, 12)))
        )
        if (dup) continue
        const name = bullet
        const nameTr = lookupCoverageNameTr(name) ?? name
        coverages.push({
          name,
          nameTr,
          limit: 0,
          deductible: 0,
          included: true,
          description: undefined,
          isUnlimited: false,
          isMarketValue: false,
          category: 'supplementary',
          importance: 'standard',
          page: null,
          clause: 'Ek Sözleşme Maddeleri',
          quote: bullet,
          carveOuts: null,
        })
        existingNames.add(key)
      }
    }
  }

  // Calculate total coverage based on policy type
  // For kasko: use explicit sigortaBedeli if provided by LLM, otherwise calculate
  let totalCoverage =
    data.sigortaBedeli && data.sigortaBedeli > 0
      ? data.sigortaBedeli
      : calculateMainCoverage(policyType, coverages)

  // Sigorta Bedeli raw text fallback for kasko/nakliyat — the AI may miss the
  // sum insured when it appears in free-text paragraphs rather than structured
  // tables (e.g., "sigorta bedeli ... (16750 -TL) sigortalanır").
  if ((policyType === 'kasko' || policyType === 'nakliyat') && totalCoverage < 1000 && rawText) {
    const bedelPatterns = [
      /s[iİ]gorta\s+bedel[iİ][\s:.]*([\d.,]+)\s*[-–]?\s*(?:TL|TRY|₺)/i,
      /\((\d[\d.,]*)\s*[-–]?\s*TL\)/i, // Parenthesized amount: (16750 -TL)
    ]
    for (const pat of bedelPatterns) {
      const m = rawText.match(pat)
      if (m?.[1]) {
        const parsed = parseTurkishCurrency(m[1])
        if (parsed && parsed > totalCoverage && parsed < 50_000_000) {
          totalCoverage = parsed
          break
        }
      }
    }
  }

  // Handle premium - AI might return a number or an object with 'amount' field
  let premiumValue = 0
  let premiumMissing = true
  if (typeof data.premium === 'number' && data.premium > 0) {
    premiumValue = data.premium
    premiumMissing = false
  } else if (data.premium && typeof data.premium === 'object') {
    const pObj = data.premium as Record<string, unknown>
    // Handle { amount } pattern
    if (typeof pObj.amount === 'number' && pObj.amount > 0) {
      premiumValue = pObj.amount
      premiumMissing = false
      console.warn('[convertToAnalyzedPolicy] Extracted premium from object.amount:', premiumValue)
    }
    // Handle { gross, net } pattern from debate pipeline
    if (
      (premiumMissing || premiumValue === 0) &&
      typeof pObj.gross === 'number' &&
      pObj.gross > 0
    ) {
      premiumValue = pObj.gross
      premiumMissing = false
      console.warn('[convertToAnalyzedPolicy] Extracted premium from object.gross:', premiumValue)
    }
  }

  // Turkish premium magnitude sanity check — fix 100× / 1000× errors caused by
  // AI mis-parsing Turkish thousands/decimal separators (e.g., "1.659,72 TL"
  // becoming 165972 instead of 1659.72). Look for "Brüt Prim" / "Net Prim"
  // strings in the raw text and re-parse with the locale-aware utility.
  if (premiumValue > 0 && rawText) {
    try {
      // Match premium labels in raw text. Turkish İ (U+0130) is NOT case-folded
      // by JS /i flag, so we match both ASCII i and İ explicitly with [iİ].
      // "TOPLAM NET PRİM" has an intervening word — allow optional "NET".
      const premiumPatterns = [
        /(?:br[uü]t\s*pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
        /(?:toplam\s+(?:net\s+)?pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
        /(?:[oö]denecek\s*pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
        /(?:net\s*pr[iİ]m)[\s:.]*([\d.,]+)\s*(?:TL|TRY|₺)?/i,
      ]
      for (const pat of premiumPatterns) {
        const m = rawText.match(pat)
        if (m && m[1]) {
          const reparsed = parseTurkishCurrency(m[1])
          if (reparsed && reparsed > 0) {
            // If our extracted premium differs from re-parsed by ≥50× and
            // the re-parsed value is plausible (< 50,000,000 TL for high inflation), trust it
            const ratio = premiumValue / reparsed
            const isLikelyMisparsed =
              (ratio >= 5 || ratio <= 0.2) && reparsed < 50000000 && reparsed > 50
            if (isLikelyMisparsed) {
              console.warn(
                `[convertToAnalyzedPolicy] Premium magnitude correction: ${premiumValue} → ${reparsed} (raw: "${m[0]}")`
              )
              premiumValue = reparsed
              break
            }
          }
        }
      }
    } catch (err) {
      console.warn('[convertToAnalyzedPolicy] Premium re-parse failed:', err)
    }
  }

  // Handle policyNumber - AI might return camelCase or snake_case
  const policyNumber = data.policyNumber ?? data.policy_number ?? `POL-${Date.now()}`

  // Handle provider - AI might return camelCase or snake_case
  const provider = data.provider ?? data.provider ?? 'Unknown Provider'

  // Handle insured - check multiple AI response patterns
  // DeepSeek returns policyholder as {name, address} object instead of string
  const rawInsured: unknown =
    data.insuredName ??
    data.insured_name ??
    data.insuredPerson ??
    data.insured ??
    data.insured_person ??
    data.policyholder ??
    data.sigortalı ??
    data.sigortali ??
    undefined
  const insuredPerson: string =
    typeof rawInsured === 'string'
      ? rawInsured
      : rawInsured &&
          typeof rawInsured === 'object' &&
          'name' in (rawInsured as Record<string, unknown>)
        ? String((rawInsured as Record<string, string>).name)
        : ''
  const insuredMissing =
    !insuredPerson ||
    insuredPerson.trim() === '' ||
    insuredPerson.toLowerCase() === 'unknown' ||
    insuredPerson.toLowerCase() === 'bilinmiyor'

  // Determine deductible uncertainty for KASKO
  // For KASKO, deductible=0 from first coverage is NOT proof of zero deductible —
  // it may just mean the AI didn't extract a specific deductible
  const rawPolicyTypeForDeductible = data.policyType ?? data.policy_type
  const isKaskoForDeductible = rawPolicyTypeForDeductible?.toLowerCase().includes('kasko') ?? false
  const topDeductible = coverages[0]?.deductible ?? 0
  const hasExplicitDeductible = data.coverages.some(
    (c) => c.deductible !== undefined && c.deductible !== null && c.deductible > 0
  )
  const deductibleUncertain = isKaskoForDeductible && topDeductible === 0 && !hasExplicitDeductible

  // Build extraction warnings for reviewer mode (Turkish for language consistency)
  const extractionWarnings: string[] = []
  if (premiumMissing) {
    extractionWarnings.push('Prim bilgisi belgeden çıkarılamadı')
  }
  if (insuredMissing) {
    extractionWarnings.push('Sigortalı kişi adı belgeden çıkarılamadı')
  }
  if (deductibleUncertain) {
    extractionWarnings.push('Muafiyet durumu doğrulanamadı — koşullu muafiyetler olabilir')
  }

  // Coverage-limit plausibility check: flag potential AI mis-mapping
  // Assistance/service coverages typically have lower limits than legal protection
  if (isKaskoForDeductible) {
    const assistanceCov = coverages.find(
      (c) =>
        c.category === 'assistance' ||
        /\b(asistans|assist|service|servis|yol\s*yard)/i.test(c.name + ' ' + (c.nameTr || ''))
    )
    const legalCov = coverages.find(
      (c) =>
        c.category === 'legal' ||
        /\b(hukuk|legal|protection|koruma)/i.test(c.name + ' ' + (c.nameTr || ''))
    )
    if (assistanceCov && legalCov && assistanceCov.limit > 0 && legalCov.limit > 0) {
      if (assistanceCov.limit > legalCov.limit * 5) {
        // Use a clean generic Turkish warning — avoid raw AI-extracted names
        // which may have broken casing (e.g. "ANAdolu Hizmet")
        extractionWarnings.push('Bazı teminat-limit eşleşmeleri ek kontrol gerektiriyor')
      }
    }
  }

  // Build the base policy first for risk assessment
  const basePolicy: AnalyzedPolicy = {
    id: crypto.randomUUID(),
    policyNumber,
    bagliPolNo: data.bağlıPolNo ?? undefined,
    type: policyType,
    typeTr: typeInfo.labelTr,
    provider,
    logo: '', // Would need to be mapped from provider name
    coverage: totalCoverage,
    sigortaBedeli: data.sigortaBedeli ?? undefined,
    premium: premiumValue,
    premiumNet:
      typeof data.premiumNet === 'number' && data.premiumNet > 0 ? data.premiumNet : undefined,
    premiumTax:
      typeof data.premiumTax === 'number' && data.premiumTax > 0 ? data.premiumTax : undefined,
    monthlyPremium: premiumValue / 12,
    deductible: coverages.length > 0 ? Math.max(0, ...coverages.map((c) => c.deductible ?? 0)) : 0,
    startDate: (() => {
      const rawStartDate = data.startDate ?? data.start_date
      if (!rawStartDate) return now.toISOString().split('T')[0]
      // Use parseTurkishDate first to avoid V8 DD.MM.YYYY day/month swap (gotcha #52)
      const parsed = parseTurkishDate(rawStartDate)
      if (parsed) return parsed
      // Fallback for ISO datetimes
      const sd = new Date(rawStartDate)
      return !isNaN(sd.getTime()) ? sd.toISOString().split('T')[0] : rawStartDate
    })(),
    expiryDate: expiryDateStr,
    status,
    uploadDate: now.toISOString().split('T')[0],
    fileName: file.name,
    documentType: 'PDF',
    documentUrl: URL.createObjectURL(file),
    insuredPerson: insuredMissing
      ? undefined
      : normalizeTurkishLegalEntityName(insuredPerson ?? ''),
    location: data.insuredAddress ?? data.insured_address ?? undefined,
    insuredAddress: data.insuredAddress ?? data.insured_address ?? undefined,
    insuredEntityType: data.insuredEntityType ?? undefined,
    vehicleUsage: data.vehicleUsage ?? undefined,
    isBundle: data.isBundle ?? undefined,
    bundleProducts:
      Array.isArray(data.bundleProducts) && data.bundleProducts.length > 0
        ? data.bundleProducts
        : undefined,
    // Sprint 3 PR-S3.2 — propagate previousInsurer when LLM extracts it
    previousInsurer:
      typeof data.previousInsurer === 'string' && data.previousInsurer.trim().length > 0
        ? data.previousInsurer.trim()
        : undefined,
    discounts: data.discounts ?? undefined,
    // Extract vehicle metadata from raw text for kasko/traffic policies.
    // The standard ExtractedPolicyData schema does not request vehicle fields,
    // so we recover them from the document text via regex patterns.
    // Also inject schema-extracted vehicleUsage
    vehicleInfo: (() => {
      const baseInfo =
        (policyType === 'kasko' || policyType === 'traffic') && rawText
          ? extractVehicleInfoFromText(rawText)
          : undefined

      // Some LLMs (DeepSeek) return vehicle as a nested object {make, model, year, plate}
      // instead of flat fields like data.vehicleMake. Unpack if present.
      const dataAny = data as unknown as Record<string, unknown>
      const vehicleObj: Record<string, unknown> | null =
        dataAny.vehicle && typeof dataAny.vehicle === 'object' && !Array.isArray(dataAny.vehicle)
          ? (dataAny.vehicle as Record<string, unknown>)
          : null

      const hasLlmData = !!(
        data.vehicleMake ||
        data.vehicleModel ||
        data.vehicleYear ||
        data.vehiclePlate ||
        data.vehicleUsage ||
        vehicleObj
      )

      if (!baseInfo && !hasLlmData) {
        if (policyType === 'kasko' || policyType === 'traffic') {
          return {}
        }
        return undefined
      }

      return {
        ...(baseInfo || {}),
        ...(data.vehicleMake ? { make: data.vehicleMake } : {}),
        ...(data.vehicleModel ? { model: data.vehicleModel } : {}),
        ...(data.vehicleYear ? { year: data.vehicleYear } : {}),
        ...(data.vehiclePlate ? { plate: data.vehiclePlate } : {}),
        ...(data.vehicleUsage ? { usage: data.vehicleUsage } : {}),
        // Fallback: unpack from nested vehicle object if flat fields are empty
        ...(!data.vehicleMake && vehicleObj?.make ? { make: String(vehicleObj.make) } : {}),
        ...(!data.vehicleModel && vehicleObj?.model ? { model: String(vehicleObj.model) } : {}),
        ...(!data.vehicleYear && vehicleObj?.year ? { year: Number(vehicleObj.year) } : {}),
        ...(!data.vehiclePlate && vehicleObj?.plate ? { plate: String(vehicleObj.plate) } : {}),
        ...(!data.vehicleUsage && vehicleObj?.usage ? { usage: String(vehicleObj.usage) } : {}),
      }
    })(),
    coverages,
    exclusions: Array.from(new Set(data.exclusions)),
    exclusionsEn: ensureExclusionsEn(Array.from(new Set(data.exclusions)), data.exclusionsEn),
    specialConditions: Array.from(new Set(data.specialConditions)),
    insuranceLine: typeInfo.label,
    // Currency might be in data.currency, data.premium.currency, or snake_case
    currency:
      data.currency ??
      (data.premium && typeof data.premium === 'object'
        ? (data.premium as { currency?: string }).currency
        : undefined) ??
      'TRY',
    // Confidence might be a number (0.95) or an object ({ overall: 0.95, ... })
    aiConfidence: (() => {
      let conf =
        typeof data.confidence === 'number' ? data.confidence : (data.confidence?.overall ?? 0.7)
      // Bug #14: Penalize confidence by 15% if clause graph has candidate/unresolved edges
      if (data.clauseGraph?.edges?.some((e) => e.isCandidate || !e.targetId)) {
        conf = Math.max(0, conf * 0.85)
      }

      // ── Fleet Policy Confidence Penalty ───────────────────────────────
      // If a linked policy (Bağlı Pol No) is present, penalize confidence
      // to mandate human review for complex fleet rules/deductibles.
      if (data.bağlıPolNo) {
        conf = Math.min(conf - 0.15, 0.75)
      }

      return conf
    })(),
    aiInsights: [],
    marketComparison: await generateMarketComparisonAsync(data),
    extractedText: rawText,
    processedText: processedText || rawText, // Use processed text if available, otherwise raw
    evidenceData: (() => {
      const insights: Record<string, string> = {}
      const exclusions: Record<string, string> = {}
      const quoteTranslations = {
        insights: {} as Record<string, string>,
        exclusions: {} as Record<string, string>,
      }

      if (data.evidence?.insights) {
        data.evidence.insights.forEach((i) => {
          if (typeof i.text !== 'string') return
          const key = i.text.trim().toLowerCase()
          insights[key] = i.quote
          if ('quoteTr' in i && typeof i.quoteTr === 'string') {
            quoteTranslations.insights[key] = i.quoteTr
          }
        })
      }
      if (data.evidence?.exclusions) {
        data.evidence.exclusions.forEach((e) => {
          if (typeof e.text !== 'string') return
          const key = e.text.trim().toLowerCase()
          exclusions[key] = e.quote
          if ('quoteTr' in e && typeof e.quoteTr === 'string') {
            quoteTranslations.exclusions[key] = e.quoteTr
          }
        })
      }
      return { insights, exclusions, quoteTranslations }
    })(),
    safetyFlags: safetyResult?.flags,
    safetyBlockReason: safetyResult?.blockReason,
    premiumMissing,
    insuredMissing,
    deductibleUncertain,
    extractionWarnings: extractionWarnings.length > 0 ? extractionWarnings : undefined,
  }

  // Prepend AI generated evidence-based insights
  // Filter out personalization leaks: insights that compare the insured name
  // against user identity (e.g., "This policy owner is not Erdem")
  const aiInsightsEn = [...(basePolicy.aiInsightsEn || [])]
  if (data.evidence?.insights) {
    const filteredInsights = data.evidence.insights.filter((i) => {
      if (!i || typeof i.text !== 'string') return false
      return !isPersonalizationLeak(i.text)
    })
    basePolicy.aiInsights = [
      ...filteredInsights.map((i) => i.text.trim()),
      ...basePolicy.aiInsights,
    ]
    const prependEn = filteredInsights.map((i) =>
      typeof i.textEn === 'string' ? i.textEn.trim() || i.text.trim() : i.text.trim()
    )
    basePolicy.aiInsightsEn = [...prependEn, ...aiInsightsEn]
  }

  // Generate base strings (Strengths, Gaps, Recs)
  const generatedInsights = await generateAIInsightsAsync(data)

  // ── Bug #7 — Parts clause flag for older vehicles ─────────────────────
  // Non-OEM (eşdeğer) or salvage (çıkma parça) parts materially affect repair
  // quality on older cars. If vehicle age ≥7yr AND the policy text mentions
  // these terms in exclusions or special conditions, surface a Turkish warning.
  const partsClauseInsight = derivePartsClauseInsight(basePolicy, data)
  if (partsClauseInsight) {
    generatedInsights.unshift(partsClauseInsight)
  }

  // ── Reviewer-mode prioritization ──────────────────────────────────────
  // Prepend extraction-quality warnings BEFORE generic insights so reviewers
  // see the most critical correction points first.
  if (extractionWarnings.length > 0) {
    const warningInsights = extractionWarnings.map((w) => `⚠ ${w}`)
    basePolicy.aiInsights = [...warningInsights, ...basePolicy.aiInsights, ...generatedInsights]
  } else {
    basePolicy.aiInsights.push(...generatedInsights)
  }

  // Pad the English array with the same generated insights
  // (The UI will translate "Missing common coverage: X" automatically)
  if (basePolicy.aiInsightsEn) {
    if (extractionWarnings.length > 0) {
      const warningInsightsEn = extractionWarnings.map((w) => `⚠ ${w}`)
      basePolicy.aiInsightsEn = [
        ...warningInsightsEn,
        ...basePolicy.aiInsightsEn,
        ...generatedInsights,
      ]
    } else {
      basePolicy.aiInsightsEn.push(...generatedInsights)
    }
  }

  // ── Suppress unprovenanced market commentary ─────────────────────────
  // Percentile and YoY claims lack benchmark provenance metadata.
  // Until provenance is wired, suppress these universally (not just when
  // extraction warnings exist) to avoid presenting unverified market claims.
  // Matches both English originals and Turkish translations.
  {
    const marketCommentaryPatterns = [
      /premium is above \d+th percentile/i,
      /prim \d+\.\s*yüzdeliğin üzerinde/i,
      /market premiums increased \d+%/i,
      /piyasa primleri yıllık %\d+ arttı/i,
      /review coverage limits annually/i,
      /lock in rates early/i,
      /oranları erkenden sabitleyin/i,
    ]
    const isMarketCommentary = (insight: string) =>
      marketCommentaryPatterns.some((p) => p.test(insight))
    basePolicy.aiInsights = basePolicy.aiInsights.filter((i) => !isMarketCommentary(i))
    if (basePolicy.aiInsightsEn) {
      basePolicy.aiInsightsEn = basePolicy.aiInsightsEn.filter((i) => !isMarketCommentary(i))
    }
  }

  // ── Final personalization leak sweep ─────────────────────────────────
  // The initial filter runs on evidence.insights, but AI-generated insights
  // from generateStrengths/generateGapsAsync or the sense-check endpoint
  // can also inject identity comparisons. Sweep the final merged array.
  basePolicy.aiInsights = basePolicy.aiInsights.filter((i) => !isPersonalizationLeak(i))
  if (basePolicy.aiInsightsEn) {
    basePolicy.aiInsightsEn = basePolicy.aiInsightsEn.filter((i) => !isPersonalizationLeak(i))
  }

  // Merge AI generated evidence-based exclusions if they aren't already grouped
  if (data.evidence?.exclusions) {
    const existingExclusions = new Set(basePolicy.exclusions.map((e) => e.toLowerCase().trim()))
    const existingExclusionsEn = new Set(
      (basePolicy.exclusionsEn || []).map((e) => e.toLowerCase().trim())
    )

    basePolicy.exclusionsEn = basePolicy.exclusionsEn || []

    for (const e of data.evidence.exclusions) {
      if (!e || typeof e.text !== 'string') continue
      if (!existingExclusions.has(e.text.toLowerCase().trim())) {
        basePolicy.exclusions.push(e.text)
      }
      if (
        typeof e.textEn === 'string' &&
        !existingExclusionsEn.has(e.textEn.toLowerCase().trim())
      ) {
        // Find if this specific exclusion text was already in the Turkish list, if so, put its translation in the same index
        const trIndex = basePolicy.exclusions.findIndex(
          (trEx) => trEx.toLowerCase().trim() === e.text.toLowerCase().trim()
        )
        if (trIndex !== -1) {
          basePolicy.exclusionsEn[trIndex] = e.textEn
        } else {
          basePolicy.exclusionsEn.push(e.textEn)
        }
      }
    }
  }

  // Final pass: ensure every exclusion has an English translation
  basePolicy.exclusionsEn = ensureExclusionsEn(basePolicy.exclusions, basePolicy.exclusionsEn)

  // ── Semantic exclusion deduplication ──────────────────────────────────
  // Two-stage pass:
  //   (1) Trigram-Jaccard collapses arbitrary paraphrases (added P1 #9 —
  //       reviewer caught 4× "no license" and 2× "keys-in-ignition"
  //       paraphrases that the keyword-cluster pass below missed because
  //       only one cluster keyword hit each paraphrase).
  //   (2) Cluster-keyword dedup catches any same-concept duplicates the
  //       Jaccard pass left behind.
  {
    // Sprint 2 PR-S2.1 — drop ÖTV / disabled-vehicle klozes that don't apply
    // to the current policy's vehicle (no OTVExempt flag in schema, so the
    // safe default is to drop). Runs BEFORE dedup so the dropped strings
    // don't interfere with paraphrase detection.
    basePolicy.exclusions = filterConditionalExclusions(basePolicy.exclusions)
    basePolicy.exclusions = dedupByTrigramJaccard(basePolicy.exclusions)
    const dedupResult = deduplicateExclusions(basePolicy.exclusions)
    if (dedupResult.length < basePolicy.exclusions.length) {
      // Rebuild English array from the kept indices
      const keptIndicesSet = new Set(
        dedupResult.map((kept) => basePolicy.exclusions.findIndex((e) => e === kept))
      )
      basePolicy.exclusions = dedupResult
      if (basePolicy.exclusionsEn && basePolicy.exclusionsEn.length > 0) {
        basePolicy.exclusionsEn = basePolicy.exclusionsEn.filter((_, idx) =>
          keptIndicesSet.has(idx)
        )
      }
    }
  }

  // ── Classify exclusions vs conditional deductibles ──────────────────
  // AI extraction (legacy path) dumps everything into exclusions[]. Items
  // that describe scenario-based deductibles (e.g. "%35 tenzili muafiyet")
  // or repair conditions belong in a separate conditionalDeductibles
  // section. classifyExclusions() splits them post-hoc via regex.
  //
  // Newer schema (Apr 2026+): the LLM may populate a structured
  // `conditionalDeductibles` array directly. When non-empty, prefer the
  // structured data (it carries explicit trigger/rate/evidence triplets
  // that the regex path cannot reconstruct). We still run classifyExclusions
  // to split the exclusions array, but we do not overwrite the structured
  // conditionalDeductibles. Precedent: same conditional-merge pattern used
  // for exclusionsEn above.
  {
    const classified = classifyExclusions(basePolicy.exclusions)
    basePolicy.exclusions = classified.trueExclusions
    const llmProvided = Array.isArray(data.conditionalDeductibles)
      ? data.conditionalDeductibles.filter((d) => d && typeof d === 'object')
      : []
    if (llmProvided.length > 0) {
      // Keep LLM-structured entries as-is (plus any regex-derived strings as
      // additional context). Store as stringified "trigger — rate — evidence"
      // to match AnalyzedPolicy.conditionalDeductibles shape (string[]).
      const fromLlm = llmProvided.map((d) =>
        `${d.trigger || ''} — ${d.rate || ''}${d.evidence ? ` (${d.evidence})` : ''}`.trim()
      )
      basePolicy.conditionalDeductibles = [...fromLlm, ...classified.conditionalDeductibles]
    } else {
      basePolicy.conditionalDeductibles = classified.conditionalDeductibles
    }
    if (classified.maxDeductiblePercent > 0) {
      basePolicy.deductiblePercent = classified.maxDeductiblePercent
    }
    // Rebuild English arrays if they exist
    if (basePolicy.exclusionsEn && basePolicy.exclusionsEn.length > 0) {
      const trueIndices = classified.trueExclusionIndices
      basePolicy.exclusionsEn = basePolicy.exclusionsEn.filter((_, idx) => trueIndices.has(idx))
    }
  }

  // ── Two-layer deductible reporting ─────────────────────────────────
  // Once classifyExclusions has run, we know whether explicit conditional
  // deductibles were detected. If so, deductible status is NOT uncertain —
  // it is "explicit but conditional", which the UI handles with richer text.
  // Clear the uncertainty flag and remove any "doğrulanamadı" extraction
  // warning to avoid contradicting the deductible section users will see.
  if (
    basePolicy.conditionalDeductibles &&
    basePolicy.conditionalDeductibles.length > 0 &&
    basePolicy.deductibleUncertain
  ) {
    basePolicy.deductibleUncertain = false
    if (basePolicy.extractionWarnings && basePolicy.extractionWarnings.length > 0) {
      basePolicy.extractionWarnings = basePolicy.extractionWarnings.filter(
        (w) => !/muafiyet.*do[ğg]rulanamad/i.test(w)
      )
      if (basePolicy.extractionWarnings.length === 0) {
        basePolicy.extractionWarnings = undefined
      }
    }
    // Also strip the warning insight from aiInsights so it doesn't render
    if (basePolicy.aiInsights && basePolicy.aiInsights.length > 0) {
      basePolicy.aiInsights = basePolicy.aiInsights.filter(
        (i) => !/muafiyet.*do[ğg]rulanamad/i.test(i)
      )
    }
    if (basePolicy.aiInsightsEn && basePolicy.aiInsightsEn.length > 0) {
      basePolicy.aiInsightsEn = basePolicy.aiInsightsEn.filter(
        (i) => !/deductible.*not\s*confirmed|deductible.*could\s*not/i.test(i)
      )
    }
  }

  // ── Mini repair confidence downgrade ───────────────────────────────
  // Mini repair/onarım coverages with numeric limits may be AI mis-extractions.
  // If the limit seems implausible for a service-type coverage, downgrade to
  // a reviewer-safe label instead of presenting a possibly incorrect amount.
  for (const c of basePolicy.coverages) {
    const nameLower = (c.name + ' ' + (c.nameTr || '')).toLowerCase()
    if (/mini\s*(onar[ıi]m|repair)/i.test(nameLower)) {
      if (c.limit > 0 && !c.isMarketValue) {
        // Service-type coverages rarely have explicit monetary limits.
        // Downgrade to included-with-review unless the amount is very small
        // (under 5000 TRY) which could be a legitimate mini repair cap.
        if (c.limit > 5000) {
          c.limit = 0
          c.included = true
          // nameTr will be set by the coverage-names map during rendering
        }
      }
    }
  }

  // Calculate ML-based risk score
  try {
    const quickRisk = RiskAssessmentService.getQuickRiskScore(basePolicy)
    const actionItems = RiskAssessmentService.getActionItems(basePolicy)

    basePolicy.riskScore = {
      overall: quickRisk.score,
      level: quickRisk.level,
      topIssue: quickRisk.topIssue,
      confidence: data.confidence?.overall ?? 0.7,
    }

    basePolicy.riskActions = actionItems
  } catch {
    // Risk scoring is optional, continue without it
  }

  // Perform comprehensive gap analysis
  try {
    const gapAnalysis = await GapDetectionService.analyzePolicy(basePolicy)
    const actionItems = await GapDetectionService.getActionItems(basePolicy)

    basePolicy.gapAnalysis = {
      overallScore: gapAnalysis.overallScore,
      criticalCount: gapAnalysis.gapCount.critical,
      highCount: gapAnalysis.gapCount.high,
      totalCount: gapAnalysis.gapCount.total,
      topIssue: gapAnalysis.prioritizedGaps[0]?.gap.title ?? null,
      topIssueTr: gapAnalysis.prioritizedGaps[0]?.gap.titleTr ?? null,
      financialExposure: gapAnalysis.financialSummary.totalExpectedLoss,
      remediationCost: gapAnalysis.financialSummary.estimatedRemediationCost,
    }

    basePolicy.gapActions = actionItems
  } catch {
    // Gap analysis is optional, continue without it
  }

  // Phase 4: Unified Analysis Bundle Engine
  try {
    const defaultValidation = { isValid: true, flags: [] }
    const validationRes = {
      isValid: safetyResult?.isValid ?? defaultValidation.isValid,
      flags: (safetyResult?.flags ?? defaultValidation.flags).map((f) => ({
        ...f,
        ruleId: 'MIGRATION_PLACEHOLDER',
      })),
      blockReason: safetyResult?.blockReason,
    }

    basePolicy.analysisBundle = generateAnalysisBundle(basePolicy.id, data, validationRes)
  } catch (err) {
    console.error('[PolicyExtractor] Failed to generate AnalysisBundle', err)
  }

  // ── Source-level deduplication ──────────────────────────────────────
  // Evidence-based insights (Turkish) and generated insights (English) can
  // express the same idea. Dedup BEFORE translation so parallel arrays
  // (aiInsights, aiInsightsTr, aiInsightsEn) stay index-aligned.
  //
  // Cross-language dedup: an insight expressed in EN and an equivalent in TR
  // would survive plain string dedup. We canonicalize each insight by trying
  // BOTH translation directions (translateInsightToTr and translateInsightToEn)
  // and using the lexicographically smallest variant as the dedup key, so any
  // pair of {EN,TR} variants of the same insight collapse to one entry.
  {
    const seen = new Set<string>()
    const keepIndices: number[] = []
    const stripAndNormalize = (s: string) =>
      s
        // eslint-disable-next-line no-misleading-character-class
        .replace(/^[✓✔☑⚠💡❌🔍\uFE0F]\s*/gu, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')

    for (let idx = 0; idx < basePolicy.aiInsights.length; idx++) {
      const raw = basePolicy.aiInsights[idx]
      const baseNorm = stripAndNormalize(raw)
      // Cross-language canonicalization via translation map (best-effort)
      const trVariant = stripAndNormalize(translateInsightToTr(raw))
      const enVariant = stripAndNormalize(translateInsightToEn(raw))
      // Pick the lexicographically smallest non-empty variant as the canonical key
      const canonical =
        [baseNorm, trVariant, enVariant].filter((s) => s.length > 0).sort()[0] || baseNorm

      if (!seen.has(canonical)) {
        seen.add(canonical)
        keepIndices.push(idx)
      }
    }
    if (keepIndices.length < basePolicy.aiInsights.length) {
      basePolicy.aiInsights = keepIndices.map((idx) => basePolicy.aiInsights[idx])
      const insightsEn = basePolicy.aiInsightsEn
      if (insightsEn) {
        basePolicy.aiInsightsEn = keepIndices.map((idx) => insightsEn[idx])
      }
    }
  }

  // ── Reviewer-mode insight sanitization ────────────────────────────────
  // Runs on the final merged array BEFORE translation. Handles:
  // - Promotional/sales wording removal (Excellent, advantage, etc.)
  // - English→Turkish normalization for mixed-language bullets
  // - Duplicated fragment cleanup (e.g. "unlimited...unlimited" assembly)
  // - Evidence-first ordering
  basePolicy.aiInsights = sanitizeReviewerInsights(basePolicy.aiInsights)
  if (basePolicy.aiInsightsEn) {
    // Keep English array aligned by length (may be shorter after sanitization)
    basePolicy.aiInsightsEn = basePolicy.aiInsightsEn.slice(0, basePolicy.aiInsights.length)
  }

  // Translate final aiInsights to Turkish (after all modifications like validation warnings)
  basePolicy.aiInsightsTr = translateInsightsToTr(basePolicy.aiInsights)

  return basePolicy
}

/**
 * Determine coverage importance based on category and characteristics
 */
export function determineCoverageImportance(coverage: ExtractedCoverage): CoverageImportance {
  const nameLower = getCoverageName(coverage)

  // Critical coverages - main coverage, high limits, or essential protections
  if (coverage.category === 'main') return 'critical'
  if (coverage.isMarketValue) return 'critical'
  if (coverage.isUnlimited) return 'critical'

  // Standard coverages - liability, legal, most supplementary
  if (coverage.category === 'liability') return 'standard'
  if (coverage.category === 'legal') return 'standard'
  if (coverage.limit && coverage.limit >= 100000) return 'standard'

  // Check for important coverage names
  if (nameLower.includes('mali sorumluluk')) return 'standard'
  if (nameLower.includes('hırsızlık')) return 'standard'
  if (nameLower.includes('deprem')) return 'standard'
  if (nameLower.includes('yangın')) return 'standard'

  // Minor coverages - assistance, small limits
  if (coverage.category === 'assistance') return 'minor'
  if (coverage.limit && coverage.limit < 50000) return 'minor'

  return 'standard'
}

/**
 * Calculate the main coverage value based on policy type
 * For kasko: use vehicle value (Rayiç Değer) or main coverage, NOT sum of all limits
 * For other types: use sum of main coverages or highest coverage
 */
export function calculateMainCoverage(policyType: PolicyType, coverages: Coverage[]): number {
  // For kasko and nakliyat: find the main/vehicle coverage
  if (policyType === 'kasko' || policyType === 'nakliyat') {
    // Look for market value coverage first
    const marketValueCoverage = coverages.find((c) => c.isMarketValue)
    if (marketValueCoverage) {
      // Market value - use 0 as placeholder since actual value varies
      // The display should show "Rayiç Değer" instead of a number
      return 0
    }

    // Look for main category coverage
    const mainCoverage = coverages.find((c) => c.category === 'main' && c.limit > 0)
    if (mainCoverage) {
      return mainCoverage.limit
    }

    // Look for coverage that looks like vehicle value
    const vehicleValue = coverages.find((c) => {
      const nameLower = getCoverageName(c)
      return (
        (nameLower.includes('araç bedeli') ||
          nameLower.includes('araç değeri') ||
          nameLower.includes('sigorta bedeli') ||
          (nameLower.includes('kasko') && !nameLower.includes('mali'))) &&
        c.limit > 0
      )
    })
    if (vehicleValue) {
      return vehicleValue.limit
    }

    // Fallback: find the highest non-liability coverage
    const nonLiabilityCoverages = coverages.filter((c) => {
      const nameLower = getCoverageName(c)
      return (
        c.category !== 'liability' &&
        !nameLower.includes('mali sorumluluk') &&
        !nameLower.includes('hukuki') &&
        c.limit > 0
      )
    })
    if (nonLiabilityCoverages.length > 0) {
      return Math.max(...nonLiabilityCoverages.map((c) => c.limit))
    }
  }

  // For traffic insurance: use the highest bodily injury limit
  if (policyType === 'traffic') {
    const bodilyInjury = coverages.find((c) => {
      const nameLower = getCoverageName(c)
      return nameLower.includes('bedeni') || nameLower.includes('ölüm')
    })
    if (bodilyInjury && bodilyInjury.limit > 0) {
      return bodilyInjury.limit
    }
  }

  // For other policy types: sum only main category coverages, or use highest
  const mainCoverages = coverages.filter((c) => c.category === 'main' && c.limit > 0)
  if (mainCoverages.length > 0) {
    return mainCoverages.reduce((sum, c) => sum + c.limit, 0)
  }

  // Fallback: use the highest individual coverage limit
  const validLimits = coverages.filter((c) => c.limit > 0).map((c) => c.limit)
  if (validLimits.length > 0) {
    return Math.max(...validLimits)
  }

  return 0
}

/**
 * Detect personalization leaks in AI-generated insights.
 * The AI sometimes injects identity comparisons like
 * "This policy owner is not Erdem" which must never appear in output.
 */
function isPersonalizationLeak(text: string): boolean {
  const lower = text.toLowerCase()
  // "policy owner is not X" / "insured name: X" identity comparison patterns
  if (/policy\s+owner\s+is\s+not\b/i.test(lower)) return true
  if (/this\s+policy\s+.*\s+is\s+not\s+/i.test(lower)) return true
  // "✗ ... not <Name> (insured name: ...)" pattern
  if (/not\s+\w+\s*\(insured\s+name/i.test(lower)) return true
  // Generic "insured.*is not <proper noun>" comparison
  if (/insured\s+(?:person|name|party)\s+is\s+not\b/i.test(lower)) return true
  // Turkish variants: "poliçe sahibi ... değil" identity comparison
  if (/poli[çc]e\s+sahibi\b.*\bde[ğg]il/i.test(lower)) return true
  // "owner is not" / "sahibi ... değil" with any prefix
  if (/\bowner\s+is\s+not\b/i.test(lower)) return true
  // Catch "is not <ProperName>." at end of sentence (the period-terminated form)
  // Exclude common non-identity phrases: "is not included", "is not covered", "is not available"
  if (/\bis\s+not\s+[A-ZÇĞİÖŞÜ][a-zçğıöşü]+\.?\s*$/.test(text)) {
    const trailingWord = text.match(/\bis\s+not\s+(\w+)\.?\s*$/)?.[1]?.toLowerCase()
    const nonIdentityWords = [
      'included',
      'covered',
      'available',
      'applicable',
      'recommended',
      'required',
      'specified',
      'confirmed',
    ]
    if (trailingWord && !nonIdentityWords.includes(trailingWord)) return true
  }
  return false
}

/**
 * Sanitize reviewer-mode insights: enforce Turkish, strip promotional wording,
 * fix duplicated fragment assembly, reorder to evidence-first.
 *
 * Runs AFTER dedup, BEFORE translation. The primary aiInsights array is the
 * canonical source; aiInsightsTr is derived from it.
 */
function sanitizeReviewerInsights(insights: string[]): string[] {
  const result: string[] = []

  for (const raw of insights) {
    const line = raw

    // ── Strip emoji prefix for analysis, re-add later ──
    // eslint-disable-next-line no-misleading-character-class
    const prefixMatch = line.match(/^([✓✔☑⚠💡❌🔍\uFE0F]\s*)/u)
    const prefix = prefixMatch ? prefixMatch[1] : ''
    let body = prefix ? line.slice(prefix.length).trim() : line.trim()

    // ── BLOCK: Promotional / sales wording ──
    // "Excellent", "advantage", "perfect", "best", "superior"
    if (/\b(excellent|advantage|perfect|best|superior|outstanding)\b/i.test(body)) {
      // Rewrite to neutral Turkish evidence phrasing
      if (/comprehensive.*coverage|kasko.*coverage|market.*value/i.test(body)) {
        body =
          'Kasko ana teminatı araç piyasa değeri üzerinden tanımlanmış görünüyor; standart kapsam ayrıntıları poliçe şartlarıyla doğrulanmalı'
      } else if (/glass|cam/i.test(body)) {
        body = 'Cam teminatı koşulları özel şartlarla doğrulanmalı'
      } else if (/excess.*liab|mali.*mesuliyet|ihtiyari/i.test(body)) {
        body =
          'İhtiyari mali mesuliyet teminatı mevcut görünüyor; kapsam üst sınırı ve istisnalar poliçe şartlarından doğrulanmalı'
      } else {
        // Generic neutralization
        body = body
          .replace(/\b(excellent|advantage|perfect|best|superior|outstanding)\b/gi, '')
          .replace(/\s{2,}/g, ' ')
          .trim()
        if (!body) continue // empty after stripping
      }
    }

    // ── FIX: Duplicated fragment assembly ──
    // Detect patterns like "X - X protection for Y" where X repeats
    // e.g. "Generally unlimited...sublimits...carve-outs excess liability - Generally unlimited...sublimits...carve-outs protection"
    if (/generally unlimited.*generally unlimited/i.test(body)) {
      body =
        'İhtiyari mali mesuliyet teminatı mevcut görünüyor; kapsam üst sınırı genel olarak geniş olmakla birlikte alt limitler ve istisnalar poliçe şartlarından doğrulanmalı'
    }

    // ── FIX: Remaining English-only insights → Turkish ──
    // Evidence insights from AI may be fully English. Translate known patterns.
    if (/^[A-Za-z]/.test(body) && !/[çğıöşüÇĞİÖŞÜ]/.test(body)) {
      // Fully English body — translate via the insight translator
      const translated = translateInsightToTr(body)
      if (translated !== body) {
        body = translated
      } else {
        // No translation found — try applySafeWording to at least neutralize
        body = applySafeWordingForInsight(body)
      }
    }

    // ── FIX: Glass-related promotional patterns ──
    if (/glass.*(?:bonus|advantage|doesn.?t affect)/i.test(body)) {
      body = 'Cam teminatı koşulları özel şartlarla doğrulanmalı'
    }
    if (/first.*glass.*replacement.*(?:no.?claims|bonus)/i.test(body)) {
      body = 'Cam teminatı koşulları özel şartlarla doğrulanmalı'
    }

    // ── Evidence-softening: replace overclaiming with hedged observation ──
    // "X teminatı mevcut" → "X teminatı mevcut görünüyor; ... doğrulanmalı"
    // "X teminat altında" → "X teminat altında olabilir; ... doğrulanmalı"
    body = softenReviewerInsight(body)

    result.push(prefix ? `${prefix}${body}` : body)
  }

  // ── Evidence-first ordering ──
  // a) ⚠ review-required / uncertainty
  // b) ✓ material coverage observations
  // c) other (special conditions etc.)
  // d) 💡 benchmark / recommendations (last)
  const warnings = result.filter((i) => i.startsWith('⚠'))
  const observations = result.filter((i) => i.startsWith('✓'))
  const recommendations = result.filter((i) => i.startsWith('💡'))
  const other = result.filter(
    (i) => !i.startsWith('⚠') && !i.startsWith('✓') && !i.startsWith('💡')
  )

  return [...warnings, ...observations, ...other, ...recommendations]
}

/**
 * Normalize Turkish legal entity name spacing.
 * Handles OCR/AI artifacts like "LİMİTEDŞİRKETİ" → "LİMİTED ŞİRKETİ"
 */
function normalizeTurkishLegalEntityName(name: string): string {
  if (!name) return name
  let result = name
  // Insert space before common Turkish legal suffixes that are merged
  // LİMİTEDŞİRKETİ → LİMİTED ŞİRKETİ
  result = result.replace(/LİMİTED(?=ŞİRKET)/g, 'LİMİTED ')
  // ANONİMŞİRKETİ → ANONİM ŞİRKETİ
  result = result.replace(/ANONİM(?=ŞİRKET)/g, 'ANONİM ')
  // TİCARETLİMİTED → TİCARET LİMİTED
  result = result.replace(/TİCARET(?=LİMİTED)/g, 'TİCARET ')
  // SANAYİVE → SANAYİ VE
  result = result.replace(/SANAYİ(?=VE\s)/g, 'SANAYİ ')
  // Lowercase variants
  result = result.replace(/limited(?=şirket)/gi, 'limited ')
  result = result.replace(/anonim(?=şirket)/gi, 'anonim ')
  result = result.replace(/ticaret(?=limited)/gi, 'ticaret ')
  // Collapse any resulting double spaces
  result = result.replace(/\s{2,}/g, ' ').trim()
  return result
}

/**
 * Deduplicate semantically overlapping exclusions.
 * Groups exclusions by semantic key-phrase clusters. When two exclusions
 * share a cluster, the longer (more informative) one is kept.
 */
/**
 * Named scenario patterns for the common Turkish kasko conditional deductibles.
 * Each entry produces a canonical, reviewer-friendly line of the form
 * `"<Scenario label>: %<N>"` (e.g. `"Anlaşmalı olmayan servis: %35"`) when
 * the exclusion text matches both the scenario keywords AND surfaces a
 * percentage. Order matters — more specific patterns first so `lpg` does
 * not swallow the generic `muafiyet` case.
 *
 * The enumerated output replaces the old behavior that collapsed every
 * match into a single evidence-softened string, which surfaced as
 * "1 conditional" in the UI even when a policy had 5+ distinct triggers.
 */
export const NAMED_DEDUCTIBLE_SCENARIOS: Array<{
  keywords: RegExp[]
  labelTr: string
}> = [
  {
    keywords: [/(anla[şs]mal[ıi]\s*olmayan|anla[şs]mas[ıi]z)/i, /servis|yetkili\s*servis/i],
    labelTr: 'Anlaşmalı olmayan servis',
  },
  {
    keywords: [/pert|hurda/i, /muaf[iİ]yet|tenzil/i],
    labelTr: 'Pert araç muafiyeti',
  },
  {
    keywords: [/lpg|cng|beyan\s*d[ıi][şs][ıi]|beyan\s*edilmemi[şs]/i],
    labelTr: 'Beyan dışı LPG / CNG donanımı',
  },
  {
    // Sprint 1 PR-S1.2 — Round-4 reviewer's Anadolu policy uses the section
    // heading "Kullanım Şekli Klozu" with %80 deductible. Original keyword set
    // didn't match the heading verbatim. Added: Turkish kiralık/ikame phrasings,
    // dolmuş, kargo, taşımacılık (broader Turkish suffix-tolerant), and
    // "kullanım şekli" itself.
    keywords: [
      /rent[\s-]*a[\s-]*car|taksi|dolmu[şs]|kurye|kargo|kiral[ıi]k\s*ara[çc]|ikame\s*ara[çc]|uygulama\s*ta[şs][ıi]mac[ıi]l[ıi][ğg]?[ıi]?|ta[şs][ıi]mac[ıi]l[ıi][ğg]?[ıi]?|ticari\s*kullan[ıi]m|kullan[ıi]m\s*[şs]ekli/i,
    ],
    labelTr: 'Rent-a-car / ticari kullanım',
  },
  {
    keywords: [
      /(ilk|birinci|1\.?)\s*cam|cam\s*hasar[ıi]?\s*(ilk|birinci|1\.?)|anla[şs]mal[ıi]\s*cam/i,
    ],
    labelTr: 'İlk cam hasarı muafiyeti',
  },
  {
    keywords: [/ya[şs]|sür[üu]c[üu]\s*ya[şs]|25\s*ya[şs]|18\s*ya[şs]/i],
    labelTr: 'Sürücü yaşı',
  },
  {
    keywords: [/ehliyet|s[üu]r[üu]c[üu]\s*belgesi|belge\s*s[üu]resi|belge\s*y[ıi]l/i],
    labelTr: 'Ehliyet süresi',
  },
]

/**
 * Format a matched conditional-deductible line as `"<Scenario>: %<N>"` when
 * the text yields a percent, else fall back to the softened original.
 */
function formatNamedDeductible(labelTr: string, rawText: string, percent: number | null): string {
  if (percent !== null) {
    return `${labelTr}: %${percent}`
  }
  return `${labelTr}: ${softenConditionalDeductible(rawText)}`
}

/**
 * Classify exclusions into true exclusions vs conditional deductibles.
 * Items that describe percentage-based deductibles, repair conditions,
 * or application-specific muafiyet rules are separated from true
 * non-coverage exclusions (theft scenarios, licence requirements, etc.).
 *
 * v4: now emits ONE named entry per recognized scenario (non-contracted
 * servis, pert araç, LPG, rent-a-car, first-glass, driver age, licence
 * duration). Previously collapsed everything into a single soft-worded
 * string, causing the UI to report "1 conditional" for policies with
 * five or more distinct triggers.
 */
export function classifyExclusions(exclusions: string[]): {
  trueExclusions: string[]
  conditionalDeductibles: string[]
  trueExclusionIndices: Set<number>
  /** Highest percentage-based deductible found (e.g., 35 for "35% tenzili muafiyet") */
  maxDeductiblePercent: number
} {
  const conditionalPatterns = [
    /muaf[iİ]yet/i, // "muafiyet" = deductible (gotcha #62: [iİ] matches both i and İ)
    /tenzil/i, // "tenzili muafiyet" = applied deductible
    /%\s*\d+/i, // percentage like %35
    /\d+\s*%/i, // percentage like 35%
    /anla[şs]mal[ıi]\s*olmayan.*servis/i, // non-contracted repair
    /anla[şs]mas[ıi]z.*servis/i, // same variant
    /onar[ıi]m.*muaf[iİ]yet/i, // repair deductible
    /pert.*muaf[iİ]yet/i, // total loss deductible
    /pert.*tenzil/i, // total loss applied deductible
    /lpg|cng/i, // fuel-system declaration triggers
    // Sprint 1 PR-S1.2 — broadened use-case triggers to catch Anadolu's
    // "Kullanım Şekli Klozu" + Turkish kiralık/ikame phrasings.
    /rent[\s-]*a[\s-]*car|taksi|dolmu[şs]|kurye|kargo|kiral[ıi]k\s*ara[çc]|ikame\s*ara[çc]|kullan[ıi]m\s*[şs]ekli|ticari\s*kullan[ıi]m/i,
  ]

  const trueExclusions: string[] = []
  const conditionalDeductibles: string[] = []
  const seenScenarios = new Set<string>()
  const trueExclusionIndices = new Set<number>()
  let maxDeductiblePercent = 0

  for (let i = 0; i < exclusions.length; i++) {
    const text = exclusions[i]

    // Ignore explicit "YOK" (none) deductibles to avoid false positive risk flags
    const tUpper = text.trim().toUpperCase()
    if (tUpper === 'YOK' || tUpper === 'YOKTUR' || /MUAFIYET\s*(:\s*|-?\s*)?YOK/i.test(text)) {
      continue
    }

    const isConditional = conditionalPatterns.some((p) => p.test(text))
    if (!isConditional) {
      trueExclusions.push(text)
      trueExclusionIndices.add(i)
      continue
    }

    // Extract percentage value if present (e.g., "35%" or "%35")
    const pctMatch = text.match(/(\d{1,3})\s*%/) || text.match(/%\s*(\d{1,3})/)
    let pct: number | null = null
    if (pctMatch) {
      const parsed = parseInt(pctMatch[1], 10)
      if (parsed > 0 && parsed <= 100) {
        pct = parsed
        if (parsed > maxDeductiblePercent) maxDeductiblePercent = parsed
      }
    }

    // Try to attach a scenario label. Each scenario fires at most once per
    // policy so duplicate phrasings (e.g. two mentions of non-contracted
    // servis) don't inflate the conditional-deductible list.
    let labeled = false
    for (const scenario of NAMED_DEDUCTIBLE_SCENARIOS) {
      const allMatch = scenario.keywords.every((kw) => kw.test(text))
      if (allMatch && !seenScenarios.has(scenario.labelTr)) {
        conditionalDeductibles.push(formatNamedDeductible(scenario.labelTr, text, pct))
        seenScenarios.add(scenario.labelTr)
        labeled = true
        break
      }
    }

    // Fallback: unrecognized scenario — keep the evidence-softened string
    // so we don't silently drop the deductible signal.
    if (!labeled) {
      conditionalDeductibles.push(softenConditionalDeductible(text))
    }
  }

  return { trueExclusions, conditionalDeductibles, trueExclusionIndices, maxDeductiblePercent }
}

// Turkish stop-words that are too common to count toward similarity.
const TURKISH_STOPWORDS = new Set([
  've',
  'veya',
  'ile',
  'için',
  'gibi',
  'kadar',
  'ya',
  'da',
  'de',
  'bir',
  'bu',
  'şu',
  'olan',
  'olarak',
  'tarafından',
])

/**
 * Build a stemmed-word set for fuzzy similarity comparison. Lowercases, strips
 * punctuation, splits on whitespace, drops Turkish stop-words, then truncates
 * each word to its first 5 characters as a crude stem (avoids needing a
 * proper Turkish stemmer for "araç/araçtaki/araçlar" variants etc.).
 */
function stemmedWordSet(s: string): Set<string> {
  const norm = s
    .toLowerCase()
    .replace(/[^a-zçğıöşü0-9\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const words = norm.split(' ').filter((w) => w.length > 0 && !TURKISH_STOPWORDS.has(w))
  // 4-char prefix is the right length for Turkish: stems "araç" and "araçtaki"
  // both to "araç", "çalın" and "çalınma" both to "çalı". 5-char overshoots.
  return new Set(words.map((w) => (w.length > 4 ? w.slice(0, 4) : w)))
}

/** Jaccard similarity between two sets, ∈ [0, 1]. */
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  for (const x of a) if (b.has(x)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

/**
 * Normalize a string for exact-match comparison: NFKC + whitespace-collapse
 * + lowercase. Two visually-identical strings that differ only in invisible
 * whitespace or unicode normalization will hash the same. Sprint 2 PR-S2.1
 * exact-match pre-pass relies on this.
 */
function normalizeForExactMatch(s: string): string {
  return s.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
}

/**
 * Collapse semantically similar exclusion paraphrases via stemmed-word
 * Jaccard similarity. Reviewer's Sprint 2 #9: AI was producing 4 different
 * paraphrases of the same "no driver's license" clause and 2 of
 * "keys-in-ignition" because the cluster-based dedup below required 2+
 * keyword hits per cluster — single-keyword paraphrases slipped through.
 *
 * Uses stemmed-word Jaccard (not trigram) because Turkish has long suffix
 * variations (araç/araçlar/araçtaki) that make character-trigram overlap
 * misleadingly low even for clear paraphrases. Crude 5-char prefix stem +
 * stop-word filter handles the common variants without needing a full
 * Turkish stemmer.
 *
 * Default threshold 0.65 ≈ "65% of meaningful word stems overlap" —
 * collapses paraphrases of the same clause without false-collapsing distinct
 * clauses. Round-4 reviewer found the previous 0.70 missed paraphrases with
 * 60-69% overlap (e.g. "Ceramic / film coatings" appearing twice in slightly
 * different phrasings). Tightened to 0.65 in PR-S2.1.
 *
 * Sprint 2 PR-S2.1: added an exact-match pre-pass before the Jaccard pass.
 * Two strings that normalize identically (NFKC + whitespace-collapse +
 * lowercase) are collapsed without going through Jaccard. Closes the
 * "exact duplicates slipping through Jaccard at threshold ≥ 0.7" path
 * the reviewer flagged for the Round-4 Anadolu policy.
 */
export function dedupByTrigramJaccard(exclusions: string[], threshold = 0.65): string[] {
  if (exclusions.length <= 1) return exclusions

  // Sprint 2 PR-S2.1 — exact-match pre-pass.
  const seenNormalized = new Map<string, number>() // normalized → first index
  const removedExact = new Set<number>()
  for (let i = 0; i < exclusions.length; i++) {
    const norm = normalizeForExactMatch(exclusions[i])
    if (norm.length === 0) continue
    const firstIdx = seenNormalized.get(norm)
    if (firstIdx !== undefined) {
      // Keep the longer of the two original strings (carries legal anchors)
      if (exclusions[i].length > exclusions[firstIdx].length) {
        removedExact.add(firstIdx)
        seenNormalized.set(norm, i)
      } else {
        removedExact.add(i)
      }
    } else {
      seenNormalized.set(norm, i)
    }
  }

  // Jaccard pass — operates on the post-exact-match remainder.
  const sigs = exclusions.map((e, i) => (removedExact.has(i) ? null : stemmedWordSet(e)))
  const removed = new Set<number>(removedExact)
  for (let i = 0; i < exclusions.length; i++) {
    if (removed.has(i)) continue
    const sigI = sigs[i]
    if (!sigI) continue
    for (let j = i + 1; j < exclusions.length; j++) {
      if (removed.has(j)) continue
      const sigJ = sigs[j]
      if (!sigJ) continue
      if (jaccard(sigI, sigJ) >= threshold) {
        // Keep the longer phrasing — usually the more-specific one carries
        // the legal anchor (e.g. clause reference) that the user can cite.
        if (exclusions[i].length >= exclusions[j].length) {
          removed.add(j)
        } else {
          removed.add(i)
          break // i is gone, no point comparing further pairs starting at i
        }
      }
    }
  }
  return exclusions.filter((_, i) => !removed.has(i))
}

/**
 * Sprint 3 PR-S3.4 — gloss text for "Anadolu Hizmet" assistance package.
 *
 * Round-4 reviewer: "Anadolu Service: Included" tells the user nothing.
 * The actual Anadolu Hizmet package includes towing, replacement vehicle
 * (30 days × 2/year), medical transport, companion accommodation,
 * vehicle/corpse repatriation, and vale park service.
 *
 * Returns a bilingual gloss when:
 *   (a) the coverage name matches the Anadolu Hizmet pattern, AND
 *   (b) the existing description is empty / placeholder / shorter than 30 chars
 *
 * Returns null otherwise. Caller writes the returned string to the
 * description field, leaving any LLM-extracted longer description alone.
 */
export function generateAnadoluHizmetGloss(
  name: string,
  nameTr: string,
  existingDescription: string | undefined | null
): string | null {
  const haystack = `${name} ${nameTr}`.toLowerCase()
  const isAnadoluHizmet = /anadolu\s*hizmet|anadolu\s*service/i.test(haystack)
  if (!isAnadoluHizmet) return null

  // If LLM already populated a substantive description, don't overwrite.
  const existing = (existingDescription ?? '').trim()
  if (existing.length >= 30) return null

  // Bilingual gloss — Turkish first (primary user audience), then English
  // separator + English variant. Single string; consumers can split on
  // " / " if they need locale-specific rendering.
  return 'Çekme/kurtarma, ikame araç (yılda 2 × 30 gün), tıbbi nakil, refakatçi konaklama, araç/cenaze nakli, vale park (İstanbul). / Includes towing, replacement vehicle (30 days × 2/year), medical transport, companion accommodation, vehicle/corpse repatriation, vale park (Istanbul).'
}

/**
 * Sprint 3 PR-S3.1 — recover an explicit limit for "Hatalı Akaryakıt"
 * (wrong-fuel) coverages when the LLM extracted the description but
 * missed setting limit. Reviewer's Round-4 #8: coverage rendered as
 * "Wrong Fuel — Included" with no number, despite the policy text
 * specifying a 50,000 TL annual cap (Anadolu page 10).
 *
 * Conservative scan: only fires when (a) the coverage name matches the
 * wrong-fuel pattern, (b) limit is 0/missing, and (c) the description /
 * clause / quote contains a 50.000 / 50,000 / 50000 / "50 bin" phrasing.
 * Returns the recovered limit (50000) or null if no recovery possible.
 */
export function recoverWrongFuelLimit(
  name: string,
  nameTr: string,
  description: string | undefined | null,
  clause: string | undefined | null,
  quote: string | undefined | null,
  currentLimit: number
): number | null {
  if (currentLimit > 0) return null
  const nameHaystack = `${name} ${nameTr}`.toLowerCase()
  const isWrongFuel = /hatal[ıi]\s*akaryak[ıi]t|wrong\s*fuel|misfuel/i.test(nameHaystack)
  if (!isWrongFuel) return null

  const textHaystack = `${description ?? ''} ${clause ?? ''} ${quote ?? ''}`
  // Match 50.000, 50,000, 50000, "50 bin", "50.000 TL", "TL 50.000"
  const fiftyKMatch = /\b50[.,\s]*000\b|\b50\s*bin\b/.test(textHaystack)
  if (!fiftyKMatch) return null

  return 50000
}

/**
 * Sprint 2 PR-S2.5 — recategorize glass-repair coverages from `assistance`
 * to `supplementary`. The Round-4 reviewer flagged Anadolu's "Yerinde
 * Sınırsız Cam Onarımı/Değişimi" rendering under Assistance Services
 * when it's clearly a glass-coverage benefit (a feature of the AS+
 * Yetkili Servis Ağı glass program), not a roadside-assistance service.
 *
 * Pattern matches Turkish + English glass-repair phrasings. Only fires
 * when the LLM assigned `assistance` (the most common miscategorization);
 * if the LLM correctly assigned `supplementary` or `main`, we don't touch.
 */
export function recategorizeIfGlassRepair(
  name: string,
  nameTr: string,
  currentCategory: 'main' | 'liability' | 'supplementary' | 'assistance' | 'legal' | 'other'
): typeof currentCategory {
  if (currentCategory !== 'assistance') return currentCategory
  const haystack = `${name} ${nameTr}`.toLowerCase()
  const isGlassRepair =
    /cam\s*onar[ıi]m|cam\s*de[ğg]i[şs]|glass\s*repair|glass\s*replace|windshield\s*(repair|replace)/i.test(
      haystack
    )
  if (isGlassRepair) return 'supplementary'
  return currentCategory
}

/**
 * Sprint 2 PR-S2.1 — drops disabled-vehicle / ÖTV-exempt klozes from the
 * exclusion list. The "Engellilere Ait Klozu" only applies to ÖTV-exempt
 * disabled-driver vehicles, but the LLM extracts it as a generic exclusion
 * even on non-disabled vehicles. Without an `OTVExempt` flag in the schema
 * (vehicleInfo doesn't carry one), the safe default is to drop the kloz —
 * better to under-surface a niche exclusion than to mislead the user that
 * their non-disabled vehicle is subject to it.
 *
 * Future improvement: add `vehicleInfo.taxClass: 'OTVExempt' | 'Standard' |
 * 'Unknown'` to the extraction schema and only filter when
 * `taxClass !== 'OTVExempt'`. Tracked but out of scope for this PR.
 */
export function filterConditionalExclusions(exclusions: string[]): string[] {
  return exclusions.filter((e) => {
    const lc = e.toLowerCase()
    // Match: "engellilere ait", "engelli araç", "özel donanımlı", "özel tertibatlı",
    // "disabled vehicle", "specially equipped"
    if (/engelli(?!\w)|engellilere|özel\s*donan[ıi]m|özel\s*tertibat/i.test(e)) return false
    if (/disabled\s+vehicle|specially\s*equipped|specially\s*adapted/i.test(lc)) return false
    return true
  })
}

function deduplicateExclusions(exclusions: string[]): string[] {
  if (exclusions.length <= 1) return exclusions

  // Semantic clusters: each array of keywords defines one concept.
  // If two exclusions both match the same cluster, they are duplicates.
  const clusters: string[][] = [
    ['anahtar', 'kontak', 'çalın'], // key-in-ignition theft
    ['çalışır', 'vaziyette', 'çalın'], // vehicle-left-running theft
    ['ehliyet', 'sürücü belgesi', 'kullanım'], // no valid licence
    ['özel tertibatlı', 'ruhsat', 'tescil'], // special vehicle registration
  ]

  // For each exclusion, find which clusters it matches
  const exclusionClusters: Map<number, number[]> = new Map()
  for (let i = 0; i < exclusions.length; i++) {
    const lower = exclusions[i].toLowerCase()
    const matched: number[] = []
    for (let c = 0; c < clusters.length; c++) {
      const hits = clusters[c].filter((kw) => lower.includes(kw))
      if (hits.length >= 2) matched.push(c) // require 2+ keyword hits
    }
    exclusionClusters.set(i, matched)
  }

  // Group exclusions by cluster. For each cluster, keep the longest.
  const keptIndices = new Set<number>()
  const clusterWinner = new Map<number, number>() // cluster → winning exclusion index

  for (let i = 0; i < exclusions.length; i++) {
    const myClust = exclusionClusters.get(i) || []
    if (myClust.length === 0) {
      keptIndices.add(i) // no cluster match → always keep
      continue
    }
    let dominated = false
    for (const c of myClust) {
      const existing = clusterWinner.get(c)
      if (existing !== undefined) {
        // This cluster already has a winner — keep the longer one
        if (exclusions[i].length > exclusions[existing].length) {
          keptIndices.delete(existing)
          keptIndices.add(i)
          clusterWinner.set(c, i)
        }
        dominated = true
      } else {
        clusterWinner.set(c, i)
        keptIndices.add(i)
      }
    }
    if (!dominated) keptIndices.add(i)
  }

  // Preserve original order
  return exclusions.filter((_, idx) => keptIndices.has(idx))
}

/**
 * Safely get lowercase name from coverage, handling undefined/null
 */
export function getCoverageName(
  coverage: { name?: string | null; description?: string | null } | undefined | null
): string {
  if (!coverage) return ''
  // Try name first, fall back to description
  return (coverage.name || coverage.description || '').toLowerCase()
}

/**
 * Lightweight safe-wording for insight strings that remain in English.
 * Mirrors the key patterns from display-interpreter's applySafeWording
 * without importing it (to avoid circular dependency).
 */
function applySafeWordingForInsight(text: string): string {
  return text
    .replace(/\bunlimited\b/gi, 'genel olarak geniş kapsamlı, alt limitler ve istisnalara tabi')
    .replace(/\bfully covered\b/gi, 'poliçe koşullarına tabi kapsam')
    .replace(/\bfull protection\b/gi, 'poliçe koşullarına tabi koruma')
    .replace(/\bno deductible\b/gi, 'muafiyet durumu senaryoya bağlıdır')
    .replace(/\bguaranteed\b/gi, 'poliçe şartlarına tabi')
}

/**
 * Soften overclaiming Turkish insight phrasing to reviewer-safe evidence language.
 * Transforms assertive claims into hedged observations.
 */
function softenReviewerInsight(text: string): string {
  let s = text

  // "X teminatı mevcut" → "X teminatı mevcut görünüyor; uygulama koşulları doğrulanmalı"
  // but only if not already hedged
  if (/teminat[ıi]\s+mevcut\b/i.test(s) && !/görünüyor|doğrulanmalı|olabilir/.test(s)) {
    s = s.replace(
      /teminat([ıi])\s+mevcut\b/gi,
      'teminat$1 mevcut görünüyor; uygulama koşulları doğrulanmalı'
    )
  }

  // "X teminat altında" → "X teminat altında olabilir; kapsam doğrulanmalı"
  if (/teminat\s+altında\b/i.test(s) && !/olabilir|doğrulanmalı|görünüyor/.test(s)) {
    s = s.replace(/teminat\s+altında\b/gi, 'teminat altında olabilir; kapsam ve limit doğrulanmalı')
  }

  // "da teminat altında" at end → soften
  if (/da\s+teminat\s+altında\s*$/i.test(s) && !/olabilir|doğrulanmalı/.test(s)) {
    s = s.replace(
      /da\s+teminat\s+altında\s*$/i,
      'ilişkin ek teminat kaydı bulunuyor olabilir; kapsam ve limit doğrulanmalı'
    )
  }

  // "tespit edildi" without hedge → "tespit edilmiş görünüyor; ... doğrulanmalı"
  // But only for ✓ style observations, not ⚠ warnings
  if (/tespit edildi\b/i.test(s) && !/görünüyor|doğrulanmalı|gözden geçirilmeli/.test(s)) {
    s = s.replace(/tespit edildi\b/gi, 'tespit edilmiş görünüyor; uygulama koşulları doğrulanmalı')
  }

  return s
}

/**
 * Soften a conditional deductible statement to reviewer-safe evidence language.
 * Replaces assertive phrasing with hedged observation language.
 */
function softenConditionalDeductible(text: string): string {
  let softened = text
  // "uygulanır" (is applied) → "uygulanabileceği görülüyor" (appears to be applicable)
  softened = softened.replace(/uygulanır\b/gi, 'uygulanabileceği görülüyor')
  // "uygulanması" (application of) → "uygulanabileceği görülüyor" if at end
  if (/uygulanması\s*$/.test(softened)) {
    softened = softened.replace(/uygulanması\s*$/, 'uygulanabileceği görülüyor')
  }
  // If no transformation happened, add a hedge
  if (softened === text && !/görülüyor|görünüyor|anlaşılıyor|olabilir/.test(softened)) {
    softened = softened + ' şartı bulunduğu anlaşılıyor'
  }
  return softened
}
