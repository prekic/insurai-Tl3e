import { useState } from 'react'
import {
  Check,
  X,
  ChevronDown,
  ChevronUp,
  Info,
  ShieldCheck,
  AlertTriangle,
  HelpCircle,
  Car,
  Scale,
  Users,
  Briefcase,
  Gavel,
  LifeBuoy,
  Shield,
} from 'lucide-react'
import { Badge } from '../ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card'
import { useI18n, type TranslationDictionary } from '@/lib/i18n'
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency'
import type { Coverage, CoverageCategory } from '@/types/policy'
import {
  KASKO_COVERAGE_CATEGORIES,
  shouldShowUnlimited,
  shouldShowIncluded,
  type GroupedCoverage,
  type AnalyzedExclusion,
  type ExclusionAnalysisResult,
} from '@/lib/knowledge/kasko-knowledge'
import { EvidenceQuote } from './shared'

/**
 * Format coverage limit with display-safe wording governance.
 * Uses kasko knowledge hub for intelligent detection, then passes
 * result through the display interpreter's safe wording filter.
 */
function formatCoverageLimit(
  coverage: Coverage,
  _locale: string,
  t: TranslationDictionary,
  fmt: (amount: number) => string = (a) => String(a)
): string {
  let raw: string

  // Explicit flags take priority
  if (coverage.isUnlimited) {
    raw = t.global.unlimited
  } else if (coverage.isMarketValue) {
    raw = t.global.marketValue
  } else if (shouldShowUnlimited(coverage.name, coverage.limit)) {
    raw = t.global.unlimited
  } else if (shouldShowIncluded(coverage.name, coverage.limit)) {
    raw = t.global.included
  } else if (coverage.limit === 0) {
    const nameLower = coverage.name.toLowerCase()
    if (nameLower.includes('sınırsız') || nameLower.includes('unlimited')) {
      raw = t.global.unlimited
    } else if (nameLower.includes('rayiç') || nameLower.includes('market value')) {
      raw = t.global.marketValue
    } else if (
      nameLower.includes('asistans') ||
      nameLower.includes('hizmet') ||
      nameLower.includes('ikame') ||
      nameLower.includes('onarım') ||
      coverage.included
    ) {
      raw = t.global.included
    } else {
      raw = t.global.included
    }
  } else {
    raw = fmt(coverage.limit)
  }

  // raw is always a structural translation key (t.global.unlimited / included /
  // marketValue) or a formatted currency string at this point — do NOT run it
  // through applySafeWording. Hedging these destroys the "Sınırsız" / "Dahil"
  // signal that tells users whether coverage is unlimited or bundled.
  return raw
}

/**
 * Get icon for coverage category
 */
function getCategoryIcon(category: CoverageCategory) {
  switch (category) {
    case 'main':
      return Car
    case 'liability':
      return Scale
    case 'personal_accident':
      return Users
    case 'supplementary':
      return Briefcase
    case 'assistance':
      return LifeBuoy
    case 'legal':
      return Gavel
    default:
      return Shield
  }
}

/**
 * Get category display info
 */
function getCategoryInfo(category: CoverageCategory) {
  const info = KASKO_COVERAGE_CATEGORIES[category as keyof typeof KASKO_COVERAGE_CATEGORIES]
  if (info) {
    return {
      labelTr: info.labelTr,
      labelEn: info.labelEn,
      color: info.color,
    }
  }
  return { labelTr: 'Diğer', labelEn: 'Other', color: 'gray' }
}

/**
 * Get additional info text for a coverage item
 */
function getCoverageInfoText(
  coverage: Coverage,
  _locale: string,
  t: TranslationDictionary,
  fmt: (amount: number) => string = (a) => String(a)
): string | null {
  const parts: string[] = []

  // Add deductible info if applicable
  if (coverage.deductible && coverage.deductible > 0) {
    parts.push(t.policy.coverageDeductible.replace('{amount}', fmt(coverage.deductible)))
  }

  // Add description if available
  if (coverage.description && coverage.description.trim()) {
    parts.push(coverage.description.trim())
  }

  // Add importance info
  if (coverage.importance === 'critical') {
    parts.push(t.policy.criticalCoverage)
  }

  // Add info about special values. These are structural i18n labels, not
  // narrative text — do NOT run them through applySafeWording, which would
  // hedge "Sınırsız" / "Unlimited" into placeholder phrases and destroy the
  // signal that a coverage actually is unlimited.
  if (coverage.isMarketValue) {
    parts.push(t.policy.paidByMarketValue)
  }

  if (coverage.isUnlimited) {
    parts.push(t.policy.noUpperLimit)
  }

  return parts.length > 0 ? parts.join(' • ') : null
}

/**
 * Get locale-aware coverage name.
 * Since nameTr is now resolved at extraction time (via AI + canonical map),
 * this function simply picks the right field based on locale.
 * The coverageNames map serves as a secondary fallback for policies
 * extracted before the extraction-time fix.
 */
function getLocalizedCoverageName(
  coverage: { name: string; nameTr?: string },
  locale: string,
  coverageNames: Record<string, string>
): string {
  if (locale === 'en') return coverage.name

  // nameTr is set at extraction time — use it if it's a real translation
  if (coverage.nameTr && coverage.nameTr !== coverage.name) return coverage.nameTr
  // Fallback for legacy policies: look up in i18n map
  const mapped = coverageNames[coverage.name]
  if (mapped && mapped !== coverage.name) return mapped
  return coverage.nameTr || coverage.name
}

/**
 * Collapsible coverage category for mobile-friendly display
 */
function CollapsibleCoverageCategory({
  categoryKey,
  categoryLabel,
  CategoryIcon,
  coverages,
  locale,
  t,
  coverageNames,
  defaultExpanded = false,
  formatAmount,
}: {
  categoryKey: string // React key prop + data-coverage-category for E2E render-contract guards
  categoryLabel: string
  coverageNames: Record<string, string>
  CategoryIcon: React.ElementType
  coverages: GroupedCoverage[]
  locale: string
  t: TranslationDictionary
  defaultExpanded?: boolean
  formatAmount: (amount: number) => string
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const [expandedCoverageIndex, setExpandedCoverageIndex] = useState<number | null>(null)
  const PREVIEW_COUNT = 2

  const hasMore = coverages.length > PREVIEW_COUNT
  const displayedCoverages = isExpanded ? coverages : coverages.slice(0, PREVIEW_COUNT)

  const toggleCoverageInfo = (index: number) => {
    setExpandedCoverageIndex(expandedCoverageIndex === index ? null : index)
  }

  return (
    <div
      className="border border-gray-200 rounded-xl overflow-hidden"
      data-coverage-category={categoryKey}
    >
      {/* Category header - clickable */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between w-full px-3 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center gap-2">
          <CategoryIcon className="text-gray-600" size={18} />
          <h4 className="font-semibold text-gray-900 text-sm">{categoryLabel}</h4>
          <Badge variant="outline" className="text-xs">
            {coverages.length}
          </Badge>
        </div>
        <ChevronDown
          size={18}
          className={`text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {/* Coverage items */}
      <div className="p-2 space-y-1.5">
        {displayedCoverages.map((groupedCoverage, i) => {
          // Handle grouped coverages with sub-limits
          if (groupedCoverage.isGrouped && groupedCoverage.subLimits) {
            return (
              <div
                key={i}
                data-testid="coverage-row"
                className="p-2.5 rounded-lg bg-blue-50 border border-blue-100"
              >
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 bg-blue-100 rounded-md flex items-center justify-center flex-shrink-0">
                    <Check className="text-blue-600" size={12} />
                  </div>
                  <p className="font-medium text-gray-900 text-sm truncate">
                    {getLocalizedCoverageName(groupedCoverage, locale, coverageNames)}
                  </p>
                </div>
                <div className="grid grid-cols-1 gap-1 ml-8">
                  {groupedCoverage.subLimits.map((subLimit, j) => (
                    <div key={j} className="flex justify-between items-center text-xs">
                      <span className="text-gray-600 truncate mr-2">{subLimit.label}</span>
                      <span
                        className={`font-medium flex-shrink-0 ${subLimit.isUnlimited ? 'text-blue-600' : 'text-gray-900'}`}
                      >
                        {subLimit.isUnlimited ? t.global.unlimited : formatAmount(subLimit.limit)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          }

          // Regular coverage - with click-to-expand info
          // groupedCoverage is a narrowed shape from the aggregation step; it
          // has Coverage's required fields at runtime but TS can't verify via
          // the grouping predicate. Narrowing here is safe and local to this
          // iterator.
          // eslint-disable-next-line no-restricted-syntax
          const coverage = groupedCoverage as unknown as Coverage
          // Pass t in here eventually but we need to pipe it from CoveragesByCategory
          const limitDisplay = formatCoverageLimit(coverage, locale, t, formatAmount)
          const isSpecialValue =
            coverage.isUnlimited ||
            coverage.isMarketValue ||
            limitDisplay === t.global.included ||
            limitDisplay === t.global.unlimited ||
            limitDisplay === t.global.marketValue
          const infoText = getCoverageInfoText(coverage, locale, t, formatAmount)
          const isCoverageExpanded = expandedCoverageIndex === i
          const hasInfo = !!infoText || !!coverage.page || !!coverage.clause || !!coverage.quote

          return (
            <div
              key={i}
              data-testid="coverage-row"
              className="rounded-lg bg-gray-50 overflow-hidden"
            >
              <button
                onClick={() => hasInfo && toggleCoverageInfo(i)}
                className={`flex items-center justify-between gap-2 p-2.5 w-full text-left transition-colors ${hasInfo ? 'hover:bg-gray-100 cursor-pointer' : ''}`}
                disabled={!hasInfo}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {coverage.included !== false ? (
                    <div className="w-6 h-6 bg-green-100 rounded-md flex items-center justify-center flex-shrink-0">
                      <Check className="text-green-600" size={12} />
                    </div>
                  ) : (
                    <div className="w-6 h-6 bg-gray-200 rounded-md flex items-center justify-center flex-shrink-0">
                      <X className="text-gray-400" size={12} />
                    </div>
                  )}
                  <p className="font-medium text-gray-900 text-sm truncate">
                    {getLocalizedCoverageName(coverage, locale, coverageNames)}
                  </p>
                  {hasInfo && (
                    <Info
                      size={12}
                      className={`text-gray-400 flex-shrink-0 transition-colors ${isCoverageExpanded ? 'text-blue-500' : ''}`}
                    />
                  )}
                </div>
                <p
                  className={`font-semibold text-sm flex-shrink-0 ${isSpecialValue ? 'text-blue-600' : 'text-gray-900'}`}
                >
                  {limitDisplay}
                </p>
              </button>

              {/* Expanded info section */}
              {isCoverageExpanded && hasInfo && (
                <div className="px-2.5 pb-2.5">
                  <div className="p-2 bg-blue-50 rounded-md border border-blue-100 ml-8">
                    {infoText && (
                      <p className="text-xs text-gray-600 leading-relaxed">{infoText}</p>
                    )}

                    {(coverage.page || coverage.clause || coverage.quote) && (
                      <div
                        className={
                          infoText ? 'mt-2 pt-2 border-t border-blue-200/60 font-mono' : 'font-mono'
                        }
                      >
                        {(coverage.page || coverage.clause) && (
                          <div className="flex items-center gap-1.5 mb-1.5">
                            {coverage.page && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-white text-blue-700 border-blue-200 py-0.5 leading-tight rounded"
                              >
                                {locale === 'tr' ? 'Sayfa' : 'Page'} {coverage.page}
                              </Badge>
                            )}
                            {coverage.clause && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-white text-blue-700 border-blue-200 py-0.5 leading-tight rounded"
                              >
                                § {coverage.clause}
                              </Badge>
                            )}
                          </div>
                        )}
                        {coverage.quote && (
                          <div className="mt-1">
                            <EvidenceQuote quote={coverage.quote} />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Show more/less button */}
        {hasMore && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center justify-center gap-1 w-full py-2 text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            {isExpanded ? (
              <>
                <ChevronUp size={14} />
                {t.common.showLess}
              </>
            ) : (
              <>
                <ChevronDown size={14} />+{coverages.length - PREVIEW_COUNT} {t.common.more}
              </>
            )}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * Coverages grouped by category component
 * Groups and displays coverages in organized sections
 */
function CoveragesByCategory({
  groupedCoverages,
  policyType,
  locale,
}: {
  groupedCoverages: Record<string, GroupedCoverage[]>
  policyType: string
  locale: string
}) {
  const { t } = useI18n()
  const { formatConverted: formatAmount } = useDisplayCurrency()

  // Category order for display
  const categoryOrder: CoverageCategory[] = [
    'main',
    'liability',
    'personal_accident',
    'supplementary',
    'assistance',
    'legal',
    'other',
  ]

  // For kasko, add implicit coverages note
  const isKasko = policyType === 'kasko'

  return (
    <div className="space-y-6 w-full overflow-hidden">
      {/* Implicit coverages note for kasko */}
      {isKasko && (
        <div className="p-3 sm:p-4 bg-green-50 border border-green-200 rounded-xl overflow-hidden">
          <div className="flex items-start gap-2 text-green-800 font-medium mb-2">
            <Check className="text-green-600 flex-shrink-0 mt-0.5" size={16} />
            <span className="text-sm">{t.policy.coreKaskoCoverages}</span>
          </div>
          <p className="text-xs sm:text-sm text-green-700 mb-2 leading-relaxed">
            {t.policy.coreKaskoCoveragesDesc}
          </p>
          <div className="text-xs text-green-600 flex items-start gap-1">
            <HelpCircle size={12} className="flex-shrink-0 mt-0.5" />
            <span>{t.policy.coreKaskoCoveragesNote}</span>
          </div>
        </div>
      )}

      {/* Grouped coverages - Collapsible categories for mobile */}
      {categoryOrder.map((categoryKey, index) => {
        const categoryCoverages = groupedCoverages[categoryKey]
        if (!categoryCoverages || categoryCoverages.length === 0) return null

        const categoryInfo = getCategoryInfo(categoryKey)
        const CategoryIcon = getCategoryIcon(categoryKey)

        return (
          <CollapsibleCoverageCategory
            key={categoryKey}
            categoryKey={categoryKey}
            categoryLabel={locale === 'tr' ? categoryInfo.labelTr : categoryInfo.labelEn}
            CategoryIcon={CategoryIcon}
            coverages={categoryCoverages}
            locale={locale}
            t={t}
            coverageNames={t.coverageNames}
            defaultExpanded={index === 0} // First category expanded by default
            formatAmount={formatAmount}
          />
        )
      })}
    </div>
  )
}

/**
 * Comprehensive Exclusions Section
 * Analyzes exclusions, provides explanations, and highlights items needing clarification
 */
function ExclusionsSection({
  analysis,
  policyType: _policyType, // Reserved for future policy-type-specific logic
  locale,
  evidenceData,
  quoteTranslations,
}: {
  analysis: ExclusionAnalysisResult
  policyType: string
  locale: string
  evidenceData?: Record<string, string>
  quoteTranslations?: Record<string, string>
}) {
  const [expandedExclusion, setExpandedExclusion] = useState<number | null>(null)

  const { t } = useI18n()
  const { formatConverted: formatAmount } = useDisplayCurrency()

  const getSeverityStyles = (severity: AnalyzedExclusion['severity']) => {
    switch (severity) {
      case 'critical':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-800',
          icon: 'text-red-600',
          badge: 'destructive' as const,
        }
      case 'important':
        return {
          bg: 'bg-amber-50',
          border: 'border-amber-200',
          text: 'text-amber-800',
          icon: 'text-amber-600',
          badge: 'warning' as const,
        }
      case 'standard':
        return {
          bg: 'bg-yellow-50',
          border: 'border-yellow-100',
          text: 'text-gray-700',
          icon: 'text-yellow-600',
          badge: 'outline' as const,
        }
      default:
        return {
          bg: 'bg-gray-50',
          border: 'border-gray-200',
          text: 'text-gray-600',
          icon: 'text-gray-400',
          badge: 'secondary' as const,
        }
    }
  }

  const getSeverityLabel = (severity: AnalyzedExclusion['severity']) => {
    switch (severity) {
      case 'critical':
        return t.global.critical
      case 'important':
        return t.global.important
      case 'standard':
        return t.global.standard
      default:
        return t.global.info
    }
  }

  return (
    <div className="space-y-6">
      {/* Coverages mistakenly in exclusions (if any) */}
      {analysis.coveragesInExclusions.length > 0 && (
        <Card className="border-green-200">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="text-green-600" size={18} />
              {t.policy.additionalCoverageLimited}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analysis.coveragesInExclusions.map((item, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between p-3 bg-green-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <Check className="text-green-600" size={16} />
                    <span className="text-sm text-gray-700">
                      {(locale === 'tr' ? item.original : item.originalEn || item.original)
                        .replace(/\(.*\)/, '')
                        .trim()}
                    </span>
                  </div>
                  <span className="text-sm font-semibold text-green-700">
                    {item.extractedLimit ? formatAmount(item.extractedLimit) : ''}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Exclusions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertTriangle className="text-amber-500" size={20} />
            {t.policy.exclusionsTitle}
          </CardTitle>
          <p className="text-sm text-gray-500 mt-1">{t.policy.exclusionsDescription}</p>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {/* Deduplicate exclusions: substring match + trigram Jaccard similarity (>0.55) */}
            {(() => {
              // Trigram-based Jaccard similarity to detect paraphrases
              const trigramSet = (s: string): Set<string> => {
                const clean = s
                  .toLowerCase()
                  .replace(/[^a-zçğıöşüa-z0-9]/gi, ' ')
                  .replace(/\s+/g, ' ')
                  .trim()
                const set = new Set<string>()
                for (let i = 0; i <= clean.length - 3; i++) set.add(clean.slice(i, i + 3))
                return set
              }
              const jaccardSimilarity = (a: string, b: string): number => {
                const tA = trigramSet(a)
                const tB = trigramSet(b)
                if (tA.size === 0 || tB.size === 0) return 0
                let intersection = 0
                for (const t of tA) if (tB.has(t)) intersection++
                return intersection / (tA.size + tB.size - intersection)
              }

              const deduplicatedExclusions = analysis.exclusions.filter((current, index, self) => {
                const currentText = current.original.trim().toLowerCase()
                // Check for exact/substring duplicates AND semantic (trigram) duplicates
                const isDuplicate =
                  self.findIndex((other, otherIndex) => {
                    if (index === otherIndex) return false
                    const otherText = other.original.trim().toLowerCase()
                    // Same text? Keep the first one only.
                    if (currentText === otherText) return otherIndex < index
                    // Other text is longer and contains current text? This is a subset, hide it.
                    if (otherText.length > currentText.length && otherText.includes(currentText))
                      return true
                    // Trigram Jaccard similarity >0.85? These are likely paraphrases.
                    // Keep the LONGER version (more informative).
                    // Also ensure we don't deduplicate very short phrases unless they are highly similar (>0.9)
                    const similarity = jaccardSimilarity(currentText, otherText)
                    const isShort = currentText.length < 30 || otherText.length < 30
                    const threshold = isShort ? 0.9 : 0.85

                    if (similarity > threshold) {
                      // If the other is longer or equal and appears earlier, this one is the dup
                      return otherText.length >= currentText.length && otherIndex < index
                        ? true
                        : // If the other is shorter, we keep ours — mark other as dup instead
                          otherText.length > currentText.length
                    }
                    return false
                  }) !== -1

                return !isDuplicate
              })

              return deduplicatedExclusions.map((exclusion, i) => {
                const styles = getSeverityStyles(exclusion.severity)
                const isExpanded = expandedExclusion === i

                const hasExplanation = !!exclusion.explanation
                const hasEvidence = !!(
                  evidenceData && evidenceData[exclusion.original.trim().toLowerCase()]
                )
                const hasContentToExpand = hasExplanation || hasEvidence

                return (
                  <li key={i} data-testid="exclusion-row">
                    <button
                      onClick={() =>
                        hasContentToExpand && setExpandedExclusion(isExpanded ? null : i)
                      }
                      className={`w-full text-left p-3 rounded-lg border ${styles.bg} ${styles.border} transition-all ${
                        hasContentToExpand ? 'hover:shadow-sm cursor-pointer' : 'cursor-default'
                      }`}
                      aria-expanded={isExpanded}
                      disabled={!hasContentToExpand}
                    >
                      <div className="flex items-start gap-3">
                        <X className={`flex-shrink-0 mt-0.5 ${styles.icon}`} size={16} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-sm leading-relaxed ${styles.text} ${exclusion.severity === 'critical' ? 'font-medium' : ''}`}
                            >
                              {locale === 'tr'
                                ? exclusion.original
                                : exclusion.originalEn || exclusion.original}
                            </span>
                            {exclusion.severity !== 'standard' &&
                              exclusion.severity !== 'informational' && (
                                <Badge variant={styles.badge} className="text-xs">
                                  {getSeverityLabel(exclusion.severity)}
                                </Badge>
                              )}
                            {exclusion.needsClarification && (
                              <HelpCircle className="text-blue-500" size={14} />
                            )}
                          </div>

                          {isExpanded && hasContentToExpand && (
                            <div className="mt-3 p-3 bg-white/70 rounded-md border border-gray-200">
                              {hasExplanation && (
                                <p className="text-sm text-gray-700 mb-2">
                                  <Info className="inline mr-1 text-blue-500" size={14} />
                                  {locale === 'tr'
                                    ? exclusion.explanation
                                    : exclusion.explanationEn || exclusion.explanation}
                                </p>
                              )}
                              {exclusion.examples && exclusion.examples.length > 0 && (
                                <div className="mt-2">
                                  <p className="text-xs font-medium text-gray-500 mb-1">
                                    {t.policy.examples}
                                  </p>
                                  <ul className="text-xs text-gray-600 space-y-1">
                                    {exclusion.examples.map((ex, j) => (
                                      <li key={j} className="flex items-center gap-1">
                                        <span className="text-gray-400">•</span> {ex}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {hasEvidence && (
                                <EvidenceQuote
                                  quote={evidenceData[exclusion.original.trim().toLowerCase()]}
                                  quoteTr={
                                    quoteTranslations?.[exclusion.original.trim().toLowerCase()]
                                  }
                                />
                              )}
                            </div>
                          )}
                        </div>
                        {hasContentToExpand && (
                          <Info className="text-gray-400 flex-shrink-0" size={14} />
                        )}
                      </div>
                    </button>
                  </li>
                )
              })
            })()}
          </ul>
        </CardContent>
      </Card>

      {/* Clarification Needed */}
      {(analysis.clarificationNeeded.length > 0 ||
        analysis.missingImportantExclusions.length > 0 ||
        (analysis.addressedByPolicy?.length ?? 0) > 0) && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-blue-900">
              <HelpCircle className="text-blue-600" size={18} />
              {t.policy.askInsurer}
            </CardTitle>
            <p className="text-sm text-blue-700 mt-1">{t.policy.clarifyWithInsurer}</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2.5">
              {/* Items from exclusions that need clarification */}
              {analysis.clarificationNeeded.map((item, i) => (
                <div
                  key={`clarify-${i}`}
                  data-testid="ask-insurer-clarify"
                  className="p-3 bg-white rounded-lg border border-blue-100 shadow-sm"
                >
                  <p className="text-sm font-semibold text-gray-900">{item.item}</p>
                  <div className="flex items-start gap-1.5 mt-1.5">
                    <HelpCircle className="text-blue-500 shrink-0 mt-0.5" size={14} />
                    <p className="text-sm text-blue-700">
                      {locale === 'tr' ? item.question : item.questionEn || item.question}
                    </p>
                  </div>
                </div>
              ))}

              {/* Sprint 2 #11B — template questions whose answers are
                  pre-filled from the policy itself (conditionalDeductibles,
                  exclusions, or coverage carveOuts). Render with a green
                  "Addressed in policy" badge plus the verbatim matched
                  string as the answer. */}
              {(analysis.addressedByPolicy ?? [])
                .filter((item) => item.importance === 'high')
                .map((item, i) => (
                  <div
                    key={`addressed-${i}`}
                    data-testid="ask-insurer-addressed"
                    className="p-3 bg-white rounded-lg border border-emerald-100 shadow-sm"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {locale === 'tr' ? item.name : item.nameEn || item.name}
                      </span>
                      <Badge
                        variant="outline"
                        className="shrink-0 text-[11px] py-0.5 px-2 text-emerald-700 border-emerald-300 bg-emerald-50 whitespace-nowrap"
                      >
                        {t.policy.addressedByPolicy}
                      </Badge>
                    </div>
                    <p className="text-sm text-emerald-900 mt-1.5 italic">{item.answer}</p>
                  </div>
                ))}

              {/* Important topics not mentioned in exclusions */}
              {analysis.missingImportantExclusions
                .filter((item) => item.importance === 'high')
                .map((item, i) => (
                  <div
                    key={`missing-${i}`}
                    data-testid="ask-insurer-missing"
                    className="p-3 bg-white rounded-lg border border-blue-100 shadow-sm"
                  >
                    <div className="flex justify-between items-start gap-2">
                      <span className="text-sm font-semibold text-gray-900">
                        {locale === 'tr' ? item.name : item.nameEn || item.name}
                      </span>
                      <Badge
                        variant="outline"
                        className="shrink-0 text-[11px] py-0.5 px-2 text-blue-600 border-blue-300 bg-blue-50 whitespace-nowrap"
                      >
                        {t.policy.notSpecifiedInPolicy}
                      </Badge>
                    </div>
                    <div className="flex items-start gap-1.5 mt-1.5">
                      <HelpCircle className="text-blue-500 shrink-0 mt-0.5" size={14} />
                      <p className="text-sm text-blue-700">
                        {locale === 'tr' ? item.question : item.question}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export { CoveragesByCategory, ExclusionsSection }
