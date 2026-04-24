/**
 * Canonical reviewer-mode policy summary builder.
 *
 * Single source of truth for how an AnalyzedPolicy is rendered into
 * text/field values. Every output path (UI text export, CSV, Excel,
 * HTML/PDF) should consume the structured summary returned by
 * `buildPolicyReviewerSummary()` instead of re-implementing formatting.
 *
 * Governance rules applied here:
 *  - applySafeWording strips promotional language from AI insights
 *  - Coverage limits use the full detection cascade (flags → knowledge → heuristics)
 *  - Coverage names use locale-aware resolution with fallback map
 *  - Missing/uncertain fields show reviewer-safe fallback text
 *  - Conditional deductibles separated from exclusions
 */

import type { AnalyzedPolicy, Coverage } from '@/types/policy'
import { formatCurrency, formatDate } from '@/lib/utils'
import { applySafeWording } from '@/lib/analysis/display-interpreter'
import { COVERAGE_NAMES_EN_TO_TR, lookupCoverageNameTr } from '@/lib/i18n/coverage-names'
import { getShortCompanyName } from '@/lib/insurance-display'
import { detectInsuredEntityType, type InsuredEntityType } from '@/lib/ai/turkish-utils'
import {
  detectCoverageCategory,
  groupCoverageSubLimits,
  shouldShowIncluded,
  shouldShowUnlimited,
  sortByImportance,
  type GroupedCoverage,
  analyzeExclusionsComprehensive,
  type ExclusionAnalysisResult,
} from '@/lib/knowledge/kasko-knowledge'

// ── Structured output types ─────────────────────────────────────────

export interface ReviewerCoverageItem {
  /** Locale-resolved display name */
  name: string
  /** Formatted limit string (safe-worded) */
  limit: string
  /** Formatted deductible string */
  deductible: string
  /** Whether coverage is included */
  included: boolean
}

export interface ReviewerSummary {
  policyNumber: string
  provider: string
  providerShort: string
  type: string
  typeTr: string
  insured: string
  premium: string
  monthlyPremium: string
  deductible: string
  coverageTotal: string
  period: string
  startDate: string
  expiryDate: string
  location: string
  status: string

  coverages: ReviewerCoverageItem[]
  groupedCoverages: Record<string, GroupedCoverage[]>
  exclusions: string[]
  groupedExclusions: ExclusionAnalysisResult
  conditionalDeductibles: string[]
  hasConditionalDeductibles: boolean

  /** Safe-worded, locale-resolved AI insights */
  insights: string[]
  /** Original untranslated insights for evidence mapping */
  rawInsights: string[]

  /** Reviewer flags */
  deductibleUncertain: boolean
  premiumMissing: boolean
  insuredMissing: boolean
  aiConfidence: number | null

  /** Bug #10 — Commercial template branching: entity + vehicle usage context. */
  entityType: InsuredEntityType
  vehicleUsage: 'commercial' | 'private' | 'unknown'
  /** Localized labels derived from entity + usage (e.g. "Ticari Kasko Poliçesi"). */
  typeLabel: string
  entityLabel: string
}

export interface ReviewerSummaryOptions {
  /** Locale: 'tr' or 'en'. Defaults to 'tr'. */
  locale?: string
  /**
   * Optional currency formatter. Defaults to formatCurrency(amount, 'TRY', locale).
   * Pass useDisplayCurrency's formatConverted for FX support.
   */
  formatAmount?: (amount: number) => string
  /**
   * Optional insight translations map for legacy policies without aiInsightsTr.
   * Keys are English insight text, values are Turkish translations.
   */
  insightTranslations?: Record<string, string>
  /**
   * Optional coverage names map override. Defaults to COVERAGE_NAMES_EN_TO_TR.
   */
  coverageNamesMap?: Record<string, string>
}

// ── Field formatting functions (exported for direct use) ────────────

/**
 * Format premium — checks premiumMissing flag AND premium > 0.
 */
export function formatPremiumForReview(
  policy: AnalyzedPolicy,
  locale: string,
  formatAmount?: (amount: number) => string
): string {
  const isTr = locale === 'tr'
  if (policy.premiumMissing || !policy.premium || policy.premium <= 0) {
    return isTr ? 'Belirtilmemiş' : 'Not Specified'
  }
  return formatAmount ? formatAmount(policy.premium) : formatCurrency(policy.premium, 'TRY', locale)
}

/**
 * Format monthly premium.
 */
export function formatMonthlyPremiumForReview(
  policy: AnalyzedPolicy,
  locale: string,
  formatAmount?: (amount: number) => string
): string {
  const isTr = locale === 'tr'
  if (policy.premiumMissing || !policy.premium || policy.premium <= 0) {
    return isTr ? 'Belirtilmemiş' : 'Not Specified'
  }
  if (!policy.monthlyPremium || Number.isNaN(policy.monthlyPremium)) {
    return isTr ? 'Hesaplanamadı' : 'Cannot Calculate'
  }
  return formatAmount
    ? formatAmount(policy.monthlyPremium)
    : formatCurrency(policy.monthlyPremium, 'TRY', locale)
}

/**
 * Format insured person — never renders "undefined".
 */
export function formatInsuredForReview(policy: AnalyzedPolicy, locale: string): string {
  if (policy.insuredPerson) return policy.insuredPerson
  const isTr = locale === 'tr'
  // If we reach here, the insured person is missing in the data
  return isTr ? 'Doğrulanamadı' : 'Cannot Verify'
}

/**
 * Format missing-safe dates for reviewer presentation
 */
export function formatDateForReview(date: string | undefined | null, locale: string): string {
  const isTr = locale === 'tr'
  if (!date) return isTr ? 'Doğrulanamadı' : 'Cannot Verify'
  return formatDate(date, locale)
}

/**
 * Format deductible — checks uncertain flag and kasko zero case.
 */
export function formatDeductibleForReview(
  policy: AnalyzedPolicy,
  locale: string,
  formatAmount?: (amount: number) => string
): string {
  const isTr = locale === 'tr'
  const hasConditional = policy.conditionalDeductibles && policy.conditionalDeductibles.length > 0
  if (policy.deductibleUncertain || (policy.type === 'kasko' && policy.deductible === 0)) {
    if (hasConditional) {
      return isTr
        ? 'Genel muafiyet yapısı net değil; koşullu muafiyetler tespit edildi'
        : 'General deductible structure unclear; conditional deductibles detected'
    }
    return isTr ? 'Koşullu / inceleme gerekli' : 'Conditional / requires review'
  }
  if (policy.deductible > 0) {
    return formatAmount
      ? formatAmount(policy.deductible)
      : formatCurrency(policy.deductible, 'TRY', locale)
  }
  return isTr ? 'Yok' : 'None'
}

/**
 * Format the top-level coverage total.
 * For market-value kasko, returns descriptive text instead of "TRY 0".
 */
export function formatCoverageTotalForReview(
  policy: AnalyzedPolicy,
  locale: string,
  formatAmount?: (amount: number) => string
): string {
  const isTr = locale === 'tr'
  if (policy.coverages.some((c) => c.isMarketValue)) {
    return isTr ? 'Rayiç Değer (Piyasa Değeri)' : 'Market Value Basis'
  }
  if (policy.type === 'kasko' && policy.coverage === 0) {
    return isTr ? 'Rayiç Değer (Piyasa Değeri)' : 'Market Value Basis'
  }
  return formatAmount
    ? formatAmount(policy.coverage)
    : formatCurrency(policy.coverage, 'TRY', locale)
}

/**
 * Format an individual coverage item's limit.
 *
 * Cascade:
 * 1. Explicit isUnlimited flag
 * 2. Explicit isMarketValue flag
 * 3. Name-based unlimited detection (shouldShowUnlimited)
 * 4. Name-based included-service detection (shouldShowIncluded)
 * 5. Zero-limit with name heuristics (rayiç, asistans, hizmet, etc.)
 * 6. Numeric limit
 *
 * Returns structural labels ("Sınırsız", "Unlimited", "Rayiç Değer", "Dahil",
 * formatted numbers) WITHOUT running them through applySafeWording —
 * structural descriptors are not promotional claims and hedging them
 * destroys information users need. Promotional narrative text is sanitized
 * on a separate path (reviewer insights in policy-converter.ts).
 */
export function formatCoverageItemLimitForReview(
  c: Coverage,
  locale: string,
  formatAmount?: (amount: number) => string
): string {
  const isTr = locale === 'tr'

  // 1. Explicit flags
  if (c.isUnlimited) {
    return isTr ? 'Sınırsız' : 'Unlimited'
  }
  if (c.isMarketValue) {
    return isTr ? 'Rayiç Değer' : 'Market Value'
  }
  if (shouldShowUnlimited(c.name, c.limit)) {
    // 2. Name-based detection from kasko knowledge hub
    return isTr ? 'Sınırsız' : 'Unlimited'
  }
  if (shouldShowIncluded(c.name, c.limit)) {
    return isTr ? 'Dahil' : 'Included'
  }
  if (c.limit === 0) {
    // 3. Zero-limit with name heuristics
    const nameLower = c.name.toLowerCase()
    if (nameLower.includes('sınırsız') || nameLower.includes('unlimited')) {
      return isTr ? 'Sınırsız' : 'Unlimited'
    }
    if (nameLower.includes('rayiç') || nameLower.includes('market value')) {
      return isTr ? 'Rayiç Değer' : 'Market Value'
    }
    // Assistance / service-class coverages with zero sum insured
    return isTr ? 'Dahil' : 'Included'
  }
  // 4. Numeric limit
  return formatAmount ? formatAmount(c.limit) : formatCurrency(c.limit, 'TRY', locale)
}

/**
 * Resolve locale-aware coverage name.
 * Uses nameTr from extraction-time, falls back to coverage names map.
 */
export function getLocalizedCoverageName(
  coverage: { name: string; nameTr?: string },
  locale: string,
  coverageNamesMap?: Record<string, string>
): string {
  if (locale === 'en') return coverage.name

  // nameTr set at extraction time — use if it's a real translation
  if (coverage.nameTr && coverage.nameTr !== coverage.name) return coverage.nameTr

  // Fallback for legacy policies: look up in i18n map
  const map = coverageNamesMap || COVERAGE_NAMES_EN_TO_TR
  const mapped = map[coverage.name]
  if (mapped && mapped !== coverage.name) return mapped

  // Case-insensitive fallback via canonical lookup
  const looked = lookupCoverageNameTr(coverage.name)
  if (looked) return looked

  return coverage.nameTr || coverage.name
}

/**
 * Translate AI insight text using the i18n insight translations map.
 * Legacy fallback for policies extracted before aiInsightsTr was added.
 */
export function translateInsightLegacy(
  insight: string,
  locale: string,
  insightTranslations: Record<string, string>
): string {
  if (locale === 'en') return insight

  // Extract emoji prefix if present (✓ ⚠ 💡 ❌ etc.)
  const prefixMatch = insight.match(/^([✓✔☑⚠💡❌]\s*)/u)
  const prefix = prefixMatch ? prefixMatch[1] : ''
  const text = prefix ? insight.slice(prefix.length).trim() : insight

  // Known exact translations from i18n system
  if (insightTranslations[text] && insightTranslations[text] !== text) {
    return prefix ? `${prefix}${insightTranslations[text]}` : insightTranslations[text]
  }

  // Pattern matches for dynamic content
  if (text.startsWith('Missing common coverage:')) {
    const name = text.replace('Missing common coverage:', '').trim()
    const template = insightTranslations['missingCoverage'] || 'Missing common coverage: {name}'
    const translated = template.replace('{name}', name)
    return prefix ? `${prefix}${translated}` : translated
  }

  if (text.startsWith('Invalid TC Kimlik') || text.startsWith('Invalid VKN')) {
    const value = text.split(':').slice(1).join(':').trim()
    const template = insightTranslations['invalidTcKimlik'] || 'Invalid TC Kimlik / VKN: {value}'
    const translated = template.replace('{value}', value)
    return prefix ? `${prefix}${translated}` : translated
  }

  const yoyMatch = text.match(/^Market premiums increased (\d+)% YoY - lock in rates early$/)
  if (yoyMatch) {
    const template =
      insightTranslations['marketPremiumsYoY'] ||
      'Market premiums increased {percent}% YoY - lock in rates early'
    const translated = template.replace('{percent}', yoyMatch[1])
    return prefix ? `${prefix}${translated}` : translated
  }

  return insight
}

/**
 * Get the localized insight string for the given index.
 * Uses pre-translated aiInsightsTr when available (new extractions),
 * falls back to display-time translation for legacy policies.
 */
export function getLocalizedInsight(
  policy: { aiInsights: string[]; aiInsightsTr?: string[]; aiInsightsEn?: string[] },
  index: number,
  locale: string,
  insightTranslations?: Record<string, string>
): string {
  if (locale === 'en') {
    if (policy.aiInsightsEn && policy.aiInsightsEn[index]) {
      return policy.aiInsightsEn[index]
    }
    return policy.aiInsights[index]
  }
  // Use pre-translated TR insights if available
  if (policy.aiInsightsTr && policy.aiInsightsTr[index]) {
    return policy.aiInsightsTr[index]
  }
  // Legacy fallback for policies without aiInsightsTr
  return translateInsightLegacy(policy.aiInsights[index], locale, insightTranslations || {})
}

// ── Main builder ────────────────────────────────────────────────────

/**
 * Build a canonical reviewer-mode summary from an AnalyzedPolicy.
 *
 * All formatting decisions happen here. Consumers should render the
 * returned structure without re-implementing any display logic.
 */
export function buildPolicyReviewerSummary(
  policy: AnalyzedPolicy,
  options: ReviewerSummaryOptions = {}
): ReviewerSummary {
  const locale = options.locale || 'tr'
  const formatAmount = options.formatAmount
  const insightTranslations = options.insightTranslations || {}
  const coverageNamesMap = options.coverageNamesMap || COVERAGE_NAMES_EN_TO_TR

  const hasConditionalDeductibles =
    !!policy.conditionalDeductibles && policy.conditionalDeductibles.length > 0

  // Build coverage items
  const coverages: ReviewerCoverageItem[] = policy.coverages.map((c) => ({
    name: getLocalizedCoverageName(c, locale, coverageNamesMap),
    limit: formatCoverageItemLimitForReview(c, locale, formatAmount),
    deductible:
      c.deductible > 0
        ? formatAmount
          ? formatAmount(c.deductible)
          : formatCurrency(c.deductible, 'TRY', locale)
        : locale === 'tr'
          ? 'Yok'
          : 'None',
    included: c.included,
  }))

  // Build safe-worded insights
  const insights: string[] = policy.aiInsights.map((_, i) =>
    applySafeWording(getLocalizedInsight(policy, i, locale, insightTranslations))
  )

  // Format Coverages for groupedCoverages
  const formattedCoveragesForGrouping = policy.coverages.map((c) => {
    const { nameTr: _origNameTr, ...rest } = c
    return {
      ...rest,
      nameEn: c.name || '',
      nameTr:
        locale === 'tr'
          ? lookupCoverageNameTr(c.name || '') || c.nameTr || ''
          : c.name || c.nameTr || '',
      // Just use formatted limit logic from current export
      limitFormatted:
        c.limit > 0
          ? formatAmount
            ? formatAmount(c.limit)
            : formatCurrency(c.limit, 'TRY', locale)
          : c.isUnlimited || shouldShowUnlimited(c.name || '', c.limit)
            ? locale === 'tr'
              ? 'Limitsiz'
              : 'Unlimited'
            : c.isMarketValue
              ? locale === 'tr'
                ? 'Rayiç Bedel'
                : 'Market Value'
              : shouldShowIncluded(c.name || '', c.limit)
                ? locale === 'tr'
                  ? 'Dahil'
                  : 'Included'
                : locale === 'tr'
                  ? 'Belirtilmemiş'
                  : 'Not specified',
    }
  })

  type FormattedCoverage = (typeof formattedCoveragesForGrouping)[number] & { name: string }
  const groups: Record<string, FormattedCoverage[]> = {
    main: [],
    liability: [],
    personal_accident: [],
    supplementary: [],
    assistance: [],
    legal: [],
    other: [],
  }

  const filteredCoverages = formattedCoveragesForGrouping.filter((coverage) => {
    // Always keep coverages with limits, unlimited flag, or market value flag
    if (coverage.limit > 0) return true
    if (coverage.isUnlimited) return true
    if (coverage.isMarketValue) return true

    // Keep service coverages
    const nameLower = (coverage.name || '').toLowerCase()
    if (shouldShowUnlimited(nameLower, 0) || shouldShowIncluded(nameLower, 0)) {
      return true
    }

    // Filter out zero-limit entries that look like policy category headers
    const categoryPatterns = [
      'zorunlu mali sorumluluk',
      'trafik sigortası',
      'kasko sigortası',
      'konut sigortası',
    ]
    return !categoryPatterns.some((pattern) => nameLower.includes(pattern))
  })

  // Format and group
  for (const coverage of filteredCoverages) {
    const origCov = {
      ...coverage,
      name:
        locale === 'tr'
          ? lookupCoverageNameTr(coverage.name || '') || coverage.nameTr || ''
          : coverage.name || coverage.nameTr || '',
    }
    const category = origCov.category || detectCoverageCategory(coverage.name || '')
    if (groups[category]) {
      groups[category].push(origCov)
    } else {
      groups.other.push(origCov)
    }
  }

  const groupedWithSubLimits: Record<string, GroupedCoverage[]> = {}
  for (const [category, _coverages] of Object.entries(groups)) {
    const grouped = groupCoverageSubLimits(_coverages)
    groupedWithSubLimits[category] = sortByImportance(grouped)
  }

  const isCommercial =
    (policy.type as string) === 'commercial_property' ||
    (policy.type as string) === 'commercial_auto'
  const groupedExclusions = analyzeExclusionsComprehensive(
    policy.exclusions,
    policy.exclusionsEn || [],
    isCommercial
  )

  // Bug #10 — entity + vehicle-usage branching for summary labels
  const entityType = detectInsuredEntityType(policy.insuredPerson)
  const vehicleUsage = deriveVehicleUsage(policy)
  const typeLabel = buildTypeLabel(policy, vehicleUsage, locale)
  const entityLabel = buildEntityLabel(entityType, locale)

  return {
    policyNumber: policy.policyNumber,
    provider: policy.provider,
    providerShort: getShortCompanyName(policy.provider),
    type: policy.type,
    typeTr: policy.typeTr,
    insured: formatInsuredForReview(policy, locale),
    premium: formatPremiumForReview(policy, locale, formatAmount),
    monthlyPremium: formatMonthlyPremiumForReview(policy, locale, formatAmount),
    deductible: formatDeductibleForReview(policy, locale, formatAmount),
    coverageTotal: formatCoverageTotalForReview(policy, locale, formatAmount),
    period:
      !policy.startDate || !policy.expiryDate
        ? locale === 'tr'
          ? 'Doğrulanamadı'
          : 'Cannot Verify'
        : `${formatDateForReview(policy.startDate, locale)} - ${formatDateForReview(policy.expiryDate, locale)}`,
    startDate: formatDateForReview(policy.startDate, locale),
    expiryDate: formatDateForReview(policy.expiryDate, locale),
    location: policy.location || '',
    status: policy.status,

    coverages,
    groupedCoverages: groupedWithSubLimits,
    exclusions: policy.exclusions,
    groupedExclusions,
    conditionalDeductibles: hasConditionalDeductibles ? (policy.conditionalDeductibles ?? []) : [],
    hasConditionalDeductibles,

    insights,
    rawInsights: policy.aiInsights || [],

    deductibleUncertain: policy.deductibleUncertain || false,
    premiumMissing: policy.premiumMissing || !policy.premium || policy.premium <= 0,
    insuredMissing: policy.insuredMissing || !policy.insuredPerson,
    aiConfidence:
      typeof policy.aiConfidence === 'number' && !Number.isNaN(policy.aiConfidence)
        ? policy.aiConfidence
        : null,

    entityType,
    vehicleUsage,
    typeLabel,
    entityLabel,
  }
}

/**
 * Detect whether the vehicle usage is commercial (KAMYON, TIR, Ticari, filo, ...)
 * — mirrors the niche-vehicle detection in evaluator.ts but returns a ternary.
 */
export function deriveVehicleUsage(policy: AnalyzedPolicy): 'commercial' | 'private' | 'unknown' {
  const signals = [policy.vehicleInfo?.vehicleClass, policy.vehicleInfo?.usage]
    .filter((s): s is string => typeof s === 'string' && s.length > 0)
    .map((s) => s.toLowerCase())
  if (signals.length === 0) return 'unknown'

  const COMMERCIAL_PATTERNS: RegExp[] = [
    /\bkamyon(et)?\b/i,
    /\bt[iı]r\b/i,
    /\botob[uü]s\b/i,
    /\bmin[iı]b[uü]s\b/i,
    /\bmid[iı]b[uü]s\b/i,
    /\b[iı]ş\s*mak[iı]nes[iı]\b/i,
    /\bt[iı]car[iı]\b/i,
    /\bf[iı]lo\b/i,
    /\bçek[iı]c[iı]\b/i,
  ]
  const PRIVATE_PATTERNS: RegExp[] = [/\bhusus[iı]\b/i, /\bb[iı]nek\b/i, /\botomob[iı]l\b/i]

  for (const sig of signals) {
    for (const p of COMMERCIAL_PATTERNS) if (p.test(sig)) return 'commercial'
    for (const p of PRIVATE_PATTERNS) if (p.test(sig)) return 'private'
  }
  return 'unknown'
}

function buildTypeLabel(
  policy: AnalyzedPolicy,
  usage: 'commercial' | 'private' | 'unknown',
  locale: string
): string {
  const isTr = locale === 'tr'
  const base = isTr ? policy.typeTr || 'Poliçe' : policy.type || 'Policy'
  if (usage === 'commercial') {
    return isTr ? `Ticari ${base}` : `Commercial ${base}`
  }
  if (usage === 'private') {
    return isTr ? `Hususi ${base}` : `Private ${base}`
  }
  return base
}

function buildEntityLabel(entityType: InsuredEntityType, locale: string): string {
  const isTr = locale === 'tr'
  switch (entityType) {
    case 'business':
      return isTr ? 'İşletme' : 'Business entity'
    case 'personal':
      return isTr ? 'Gerçek kişi' : 'Individual'
    default:
      return isTr ? 'Belirtilmemiş' : 'Unspecified'
  }
}
