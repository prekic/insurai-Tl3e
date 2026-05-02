import { getProxyUrl } from '../config'
import { marketDataProvider } from '@/lib/market-data/market-data-provider'
import { translateInsightToTr } from '../insight-translator'
import { validateCurrencyRegion } from '@/lib/utils'
import type { ExtractedPolicyData, ExtractedCoverage } from '../extraction-schema'
import type { PolicyType } from '@/types/policy'
import { getCoverageName } from '../policy-converter'

/**
 * Coverages that are inherently included in base kasko coverage
 * These should NOT be flagged as missing if kasko coverage exists
 */
const KASKO_IMPLICIT_COVERAGES = [
  'çarpma',
  'çarpışma',
  'collision',
  'collision damage',
  'hırsızlık',
  'theft',
  'yangın',
  'fire',
  'fire damage',
  'doğal afet',
  'natural disaster',
  'natural disasters',
  'sel',
  'flood',
  'flood damage',
  'deprem',
  'earthquake',
  'ani hareket',
  'sudden movement',
  'fırtına',
  'storm',
  'dolu',
  'hail',
  // Additional benchmark names that are inherent in KASKO products
  'kara araçları',
  'motor own damage',
  'own damage',
  'kasko',
  'comprehensive',
  'vandalism',
  'vandalizm',
  'terör',
  'terrorism',
  'grev',
  'strike',
  'toprak kayması',
  'landslide',
]

/**
 * Check if policy has kasko base coverage that includes fundamental protections.
 * Expanded to detect market-value main coverages and comprehensive auto naming
 * that AI may produce without the literal word "kasko".
 */
export function hasKaskoBaseCoverage(coverages: ExtractedCoverage[]): boolean {
  return coverages.some((c) => {
    const nameLower = getCoverageName(c)
    return (
      nameLower === 'kasko' ||
      nameLower.includes('tam kasko') ||
      nameLower.includes('full kasko') ||
      nameLower.includes('mini kasko') ||
      nameLower.includes('kasko sigortası') ||
      (nameLower.includes('kasko') && c.category === 'main') ||
      // AI may extract main coverage as "Comprehensive Auto Insurance" or
      // "Market Value Coverage" without "kasko" in the name — these are KASKO
      (nameLower.includes('comprehensive') && nameLower.includes('auto')) ||
      nameLower.includes('motor own damage') ||
      // isMarketValue on a main category coverage is a strong KASKO signal
      (c.isMarketValue === true && c.category === 'main')
    )
  })
}

/**
 * Sprint 2 PR-S2.4 — Round-4 reviewer asked for richer AI Insights
 * recognizing the policy's actual content (27 detected coverage features
 * with 14 niche klozes, Sompo Japan transfer with %50 NCD preserved,
 * AS+ Yetkili Servis Ağı flagship benefit).
 *
 * Three new deterministic rule generators below.
 */

/**
 * Recognizes when a policy carries an unusually large number of
 * supplementary/niche klozes (beyond the standard kasko peril set).
 * Anadolu's "Birleşik Kasko" had 27 coverage features including ~14
 * niche additions like Hatalı Akaryakıt, Cam Koruma, Hasarsızlık
 * Koruma, Eskisi Yerine Yenisi, Evcil Hayvan, Mini Onarım. Surfacing
 * the count at the top of insights is high-signal.
 */
export function generateNicheKlozeCountInsight(data: ExtractedPolicyData): string | null {
  const coverages = data.coverages ?? []
  if (coverages.length === 0) return null

  const supplementaryCount = coverages.filter(
    (c) => c.category === 'supplementary' || c.category === 'assistance'
  ).length

  // Threshold: at least 5 supplementary OR 20+ total coverages with at
  // least 3 supplementary (richness signal). Below this, the insight
  // would be noise on a basic policy.
  if (supplementaryCount < 5 && (coverages.length < 20 || supplementaryCount < 3)) {
    return null
  }

  return `${coverages.length} teminat kalemi tespit edildi (${supplementaryCount} ek/asistans klozu) — kapsam zenginliği yüksek; her bir klozun limit ve koşulları doğrulanmalı`
}

/**
 * Detects insurer-transfer + NCD-preservation context. Anadolu's policy
 * page 8 indicated renewal from Sompo Japan with %50 NCD (Tier 3)
 * preserved. Two-tier detection:
 *   1. STRUCTURED — `data.previousInsurer` is set by the LLM (Sprint 3
 *      PR-S3.2 added the schema field). Strongest signal; emits an
 *      attributed insight naming the previous insurer.
 *   2. TEXT-PATTERN FALLBACK — when the structured field isn't populated,
 *      pattern-match `specialConditions` / `exclusions` for transfer
 *      indicators ("yenilenmiştir" / "geçiş" / "devir" / "carry-over").
 *      Surface a hedged insight that doesn't name the insurer.
 */
export function generateInsurerTransferInsight(data: ExtractedPolicyData): string | null {
  // Tier 1 — structured field (strongest signal)
  if (typeof data.previousInsurer === 'string' && data.previousInsurer.trim().length > 0) {
    const haystack = [
      ...(data.specialConditions ?? []),
      ...(data.exclusions ?? []),
    ]
      .join(' ')
      .toLowerCase()
    const hasNcdSignal = /hasars[ıi]zl[ıi]k\s*(indir|kademe)|no[\s-]?claims\s*discount/i.test(
      haystack
    )
    const insurer = data.previousInsurer.trim()
    if (hasNcdSignal) {
      return `${insurer} poliçesinden devir/yenileme tespit edildi — hasarsızlık indirim kademesinin korunduğu ve devir sırasında bilgi farklılığı olmadığı doğrulanmalı`
    }
    return `${insurer} poliçesinden devir/yenileme görünüyor — devir koşulları ve önceki teminat kapsamıyla farklılıklar incelenmeli`
  }

  // Tier 2 — text-pattern fallback
  const haystack = [
    ...(data.specialConditions ?? []),
    ...(data.exclusions ?? []),
  ]
    .join(' ')
    .toLowerCase()

  if (haystack.length === 0) return null

  const hasTransfer = /yenilen(?:m|d)i[şs]|önceki\s*sigort|geçi[şs]\s*pol|devi(?:r|rd)|carry[\s-]?over|transfer/i.test(
    haystack
  )
  const hasNcdSignal = /hasars[ıi]zl[ıi]k\s*(indir|kademe)|no[\s-]?claims\s*discount/i.test(haystack)

  if (hasTransfer && hasNcdSignal) {
    return 'Önceki sigortacıdan devir/yenileme tespit edildi — hasarsızlık indirim kademesinin korunduğu ve devir sırasında bilgi farklılığı olmadığı doğrulanmalı'
  }
  if (hasTransfer) {
    return 'Önceki sigortacıdan poliçe devri/yenileme görünüyor — devir koşulları ve önceki teminat kapsamıyla farklılıklar incelenmeli'
  }
  return null
}

/**
 * Surfaces the AS+ Yetkili Servis Ağı (Anlaşmalı Servis network) flagship
 * benefit when present. Anadolu's policy page 1 highlights this as a
 * primary benefit: ≤5,000 TL partial repairs at network shops do NOT
 * affect hasarsızlık kademesi at renewal. For corporate fleets with
 * existing %50 NCD to protect, this is high-relevance.
 */
export function generateNetworkBenefitInsight(data: ExtractedPolicyData): string | null {
  const coverages = data.coverages ?? []
  const coverageText = coverages
    .map((c) => `${c.name ?? ''} ${c.nameTr ?? ''} ${c.description ?? ''}`)
    .join(' ')
    .toLowerCase()

  // AS+ network signal: "AS+", "Anlaşmalı Servis Ağı", "Yetkili Servis Ağı"
  const hasAsPlus = /\bas\+|anla[şs]mal[ıi]\s*servis\s*a[ğg][ıi]?|yetkili\s*servis\s*a[ğg][ıi]?/i.test(
    coverageText
  )

  if (!hasAsPlus) return null

  return 'Anlaşmalı Servis Ağı (AS+) avantajı tespit edildi — küçük tutarlı onarımların hasarsızlık kademesini etkilememesi için ağ koşulları ve eşik tutarı poliçeden teyit edilmeli'
}

/**
 * Generate policy strengths based on extracted data
 */
export function generateStrengths(data: ExtractedPolicyData): string[] {
  const strengths: string[] = []

  // Only claim zero deductible if there are also positive deductibles elsewhere
  // (proving the AI actually extracted deductible data rather than defaulting everything to 0)
  const hasPositiveDeductible = data.coverages.some((c) => c.deductible && c.deductible > 0)
  if (hasPositiveDeductible && data.coverages.some((c) => c.deductible === 0)) {
    strengths.push('Bazı teminatlarda muafiyet uygulanmıyor')
  }

  if (data.specialConditions && data.specialConditions.length > 0) {
    strengths.push(
      `${data.specialConditions.length} özel kloz tespit edildi — koşulların geçerliliği doğrulanmalı`
    )
  }

  // Generic structural observations (coverage count, limit thresholds) are suppressed
  // in reviewer mode because they provide no actionable correction information.
  // If no specific strengths were found, note standard coverage.
  if (strengths.length === 0) {
    strengths.push('Poliçe türüne uygun standart teminat yapısı')
  }

  return strengths
}

/**
 * Generate policy gaps (async, DB-backed benchmarks)
 */
export async function generateGapsAsync(data: ExtractedPolicyData): Promise<string[]> {
  const gaps: string[] = []
  const policyType = (data.policyType ?? 'home') as PolicyType
  const benchmark = await marketDataProvider.getBenchmark(policyType)

  if (data.exclusions && data.exclusions.length > 5) {
    gaps.push('Multiple exclusions may limit coverage in certain scenarios')
  }

  const avgDeductible =
    benchmark.commonCoverages.reduce((sum, c) => sum + c.typicalDeductible, 0) /
    benchmark.commonCoverages.length

  if (data.coverages.some((c) => c.deductible && c.deductible > avgDeductible * 2)) {
    gaps.push('High deductibles may result in significant out-of-pocket costs')
  }

  const criticalCoverages = benchmark.commonCoverages.filter((c) => c.inclusionRate >= 90)
  const isKaskoPolicy = policyType === 'kasko'
  const hasBaseKasko = isKaskoPolicy && hasKaskoBaseCoverage(data.coverages)
  const isTrafficPolicy = policyType === 'traffic'

  // For KASKO policies where base coverage was NOT positively identified by name,
  // but policyType is 'kasko', emit ONE coherent uncertainty message instead of
  // individual "Missing common coverage: X" for each implicit peril.
  // This avoids the contradiction of labeling a policy as KASKO while also
  // claiming collision/fire/theft are missing.
  let kaskoImplicitUncertaintyEmitted = false

  for (const critical of criticalCoverages) {
    const criticalNameLower = critical.nameTr.toLowerCase()
    const criticalNameEn = getCoverageName(critical)
    const isImplicitCoverage = KASKO_IMPLICIT_COVERAGES.some(
      (implicit) => criticalNameLower.includes(implicit) || criticalNameEn.includes(implicit)
    )

    if (hasBaseKasko && isImplicitCoverage) {
      // KASKO base coverage positively identified — suppress implicit warnings
      continue
    }

    if (isKaskoPolicy && !hasBaseKasko && isImplicitCoverage) {
      // policyType is 'kasko' but base coverage not identified by name —
      // emit a single reviewer-safe uncertainty message, not individual warnings
      if (!kaskoImplicitUncertaintyEmitted) {
        gaps.push(
          'Ana teminat kapsamı standart kasko risklerini işaret ediyor, ancak temel teminatların açık listesi insan incelemesiyle doğrulanmalı'
        )
        kaskoImplicitUncertaintyEmitted = true
      }
      continue
    }

    const baseNameMatch = criticalNameLower.match(/^([^(]+)/)
    const criticalBaseName = baseNameMatch ? baseNameMatch[1].trim() : criticalNameLower

    const hasCoverage = data.coverages.some((c) => {
      const coverageNameLower = getCoverageName(c)
      const coverageLimit = c.limit ?? 0

      if (
        coverageNameLower.includes(getCoverageName(critical)) ||
        coverageNameLower.includes(criticalNameLower)
      ) {
        return true
      }

      if (isTrafficPolicy) {
        const matchesBaseName =
          coverageNameLower.includes(criticalBaseName) ||
          criticalBaseName.includes(coverageNameLower.replace(/\([^)]*\)/g, '').trim())

        if (matchesBaseName) {
          const limitTolerance = critical.typicalLimit * 0.1
          if (Math.abs(coverageLimit - critical.typicalLimit) <= limitTolerance) return true
          if (
            criticalNameLower.includes('kaza başı') &&
            coverageLimit >= critical.typicalLimit * 0.9
          )
            return true
        }
      }

      return false
    })

    if (!hasCoverage) {
      if (isTrafficPolicy && criticalNameLower.includes('kişi başı')) {
        const hasPerAccident = data.coverages.some(
          (c) =>
            getCoverageName(c).includes(criticalBaseName) && (c.limit ?? 0) >= critical.typicalLimit
        )
        if (hasPerAccident) continue
      }
      // Use English name by default, we will translate in the UI
      gaps.push(`Missing common coverage: ${critical.name}`)
    }
  }

  const totalCoverage = data.coverages.reduce((sum, c) => sum + (c.limit ?? 0), 0)
  if (totalCoverage < benchmark.coverageRange.average * 0.5) {
    gaps.push('Total coverage significantly below market average')
  }

  if (policyType === 'home') {
    const hasDaskMention = data.coverages.some((c) => {
      const nameLower = getCoverageName(c)
      return (
        nameLower.includes('deprem') ||
        nameLower.includes('dask') ||
        nameLower.includes('earthquake')
      )
    })
    if (!hasDaskMention) {
      gaps.push('Consider adding DASK earthquake insurance if not included')
    }
  }

  return gaps.slice(0, 5)
}

/**
 * Generate recommendations (async, DB-backed benchmarks)
 */
export async function generateRecommendationsAsync(data: ExtractedPolicyData): Promise<string[]> {
  const recommendations: string[] = []
  const policyType = (data.policyType ?? 'home') as PolicyType
  const benchmark = await marketDataProvider.getBenchmark(policyType)

  // ── Benchmark provenance gate ──────────────────────────────────────
  // Percentile and YoY claims require provenance: source, date, cohort.
  // All three fields must be non-empty strings for the gate to open.
  const p = benchmark.provenance
  const hasBenchmarkProvenance = !!(p?.source && p?.date && p?.cohort)

  if (hasBenchmarkProvenance) {
    if (data.premium && data.premium > benchmark.premiumRange.percentile75) {
      recommendations.push('Premium is above 75th percentile - compare with other providers')
    }

    const totalCoverage = data.coverages.reduce((sum, c) => sum + (c.limit ?? 0), 0)
    if (totalCoverage < benchmark.coverageRange.median) {
      recommendations.push('Coverage below market median - consider increasing limits')
    }

    if (benchmark.trends.premiumChangeYoY > 30) {
      recommendations.push(
        `Market premiums increased ${Math.round(benchmark.trends.premiumChangeYoY)}% YoY - lock in rates early`
      )
    }
  }

  // Only add generic advice when no more critical recommendations were found
  if (recommendations.length === 0) {
    recommendations.push('Prim ve teminat karşılaştırması için güncel piyasa verisi doğrulanmalı')
  }
  return recommendations.slice(0, 5)
}

/**
 * Orchestrates AI insight generation, calling strengths, gaps, and recommendations.
 */
export async function generateAIInsightsAsync(data: ExtractedPolicyData): Promise<string[]> {
  const insights: string[] = []

  // Sprint 2 PR-S2.4 — Round-4 reviewer asked for richer recognition
  // insights at the top of the list. These three deterministic rules run
  // BEFORE gaps/strengths/recommendations so they appear first and are
  // visible in the UI's top-3 preview window (gotcha — maxAiInsightsPreview
  // is 3). All three return null when their pattern doesn't apply, so
  // they're zero-cost on policies that don't carry the relevant signal.
  const recognitionInsights = [
    generateNicheKlozeCountInsight(data),
    generateInsurerTransferInsight(data),
    generateNetworkBenefitInsight(data),
  ].filter((i): i is string => i !== null)
  insights.push(...recognitionInsights.map((r) => `✨ ${r}`))

  // Reviewer-mode priority order: gaps/warnings first, then strengths, then recommendations
  // Gaps and recommendations are generated in English, then translated to Turkish
  // for language-consistent reviewer output. Strengths are already Turkish.
  const gaps = await generateGapsAsync(data)
  insights.push(...gaps.map((g) => `⚠ ${translateInsightToTr(g)}`))
  insights.push(...generateStrengths(data).map((s) => `✓ ${s}`))
  const recs = await generateRecommendationsAsync(data)
  insights.push(...recs.map((r) => `💡 ${translateInsightToTr(r)}`))

  const currency = data.currency ?? 'TRY'
  const address = data.insuredAddress
  const currencyValidation = validateCurrencyRegion(currency, address)
  if (currencyValidation.warning) {
    insights.push(`⚠ ${currencyValidation.warning}`)
  }

  // AI Sense-Checking Layer: Filter out false-positives based on broader logic
  try {
    const proxyUrl = getProxyUrl()
    if (proxyUrl) {
      // DEBUG: Temporarily bypass AI sense-checking layer to test if it's overly aggressive
      const bypassSenseCheck = import.meta.env.DEV || true
      if (bypassSenseCheck) {
        console.log('[AI Sense-Check] Bypassed for debugging. Returning raw insights.')
        return insights
      }

      const response = await fetch(`${proxyUrl}/api/ai/sense-check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(typeof localStorage !== 'undefined' && {
            'x-user-id': localStorage.getItem('insurai_user_id') || '',
          }),
        },
        body: JSON.stringify({ rawInsights: insights, policyData: data }),
      })
      if (response.ok) {
        const result = await response.json()
        if (result.success && result.validInsights) {
          // In development mode, log discard reason context if needed
          if (import.meta.env.DEV && result.validInsights.length !== insights.length) {
            console.warn('[AI Sense-Check] Filtered insights:', {
              original: insights,
              filtered: result.validInsights,
            })
          }
          return result.validInsights
        }
      }
    }
  } catch (err) {
    console.warn('[AI Sense-Check] Handled failure, falling back to raw insights', err)
  }

  return insights
}
