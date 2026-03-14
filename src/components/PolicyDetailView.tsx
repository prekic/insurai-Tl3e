import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useNavigate, useParams, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Download,
  Share2,
  Shield,
  AlertTriangle,
  Check,
  X,
  Sparkles,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Loader2,
  Car,
  Scale,
  Users,
  Briefcase,
  Gavel,
  LifeBuoy,
  HelpCircle,
  Info,
  ShieldCheck,
  FileText,
  ChevronDown,
  ChevronUp,
  FileSpreadsheet,
  FileDown,
  Quote,
} from 'lucide-react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { PolicyDocuments } from './PolicyDocuments'
import { formatDate } from '@/lib/utils'
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency'
import type { Coverage, CoverageCategory } from '@/types/policy'
import {
  KASKO_COVERAGE_CATEGORIES,
  detectCoverageCategory,
  shouldShowUnlimited,
  shouldShowIncluded,
  groupCoverageSubLimits,
  sortByImportance,
  analyzeExclusionsComprehensive,
  type GroupedCoverage,
  type AnalyzedExclusion,
} from '@/lib/knowledge/kasko-knowledge'
import { getShortCompanyName } from '@/lib/insurance-display'
import { useI18n } from '@/lib/i18n'
import { usePdfExport } from '@/hooks/usePdfExport'
import { exportSinglePolicyToCSV, exportSinglePolicyToExcel } from '@/lib/export'
import {
  evaluateAndRankPolicies,
  mapAnalyzedToActuarialInput,
  emitEvaluation,
} from '@/lib/actuarial-engine'
import { PolicyActuarialHistoryChart } from './actuarial/PolicyActuarialHistoryChart'

/**
 * Format coverage limit with special handling for unlimited and market value
 * Uses kasko knowledge hub for intelligent detection
 */
function formatCoverageLimit(
  coverage: Coverage,
  _locale: string,
  t: any,
  fmt: (amount: number) => string = (a) => String(a)
): string {
  // Explicit flags take priority
  if (coverage.isUnlimited) {
    return t.global.unlimited
  }
  if (coverage.isMarketValue) {
    return t.global.marketValue
  }

  // Use kasko knowledge hub for intelligent detection
  if (shouldShowUnlimited(coverage.name, coverage.limit)) {
    return t.global.unlimited
  }
  if (shouldShowIncluded(coverage.name, coverage.limit)) {
    return t.global.included
  }

  // Legacy fallback checks
  if (coverage.limit === 0) {
    const nameLower = coverage.name.toLowerCase()
    if (nameLower.includes('sınırsız') || nameLower.includes('unlimited')) {
      return t.global.unlimited
    }
    if (nameLower.includes('rayiç') || nameLower.includes('market value')) {
      return t.global.marketValue
    }
    // Services without numeric limits
    if (
      nameLower.includes('asistans') ||
      nameLower.includes('hizmet') ||
      nameLower.includes('ikame') ||
      nameLower.includes('onarım')
    ) {
      return t.global.included
    }
    return t.global.included // Default to "Dahil" instead of ₺0 for zero-limit coverages
  }
  return fmt(coverage.limit)
}

/**
 * TruncatableText Component
 * Re-added to satisfy UI branch tests and provide truncation for long insights/exclusions
 */
function TruncatableText({
  text,
  maxLength,
  showFullTextTranslation,
  showLessTranslation,
}: {
  text: string
  maxLength: number
  showFullTextTranslation: string
  showLessTranslation: string
}) {
  const [isExpanded, setIsExpanded] = useState(false)

  if (text.length <= maxLength) {
    return <span className="leading-relaxed block">{text}</span>
  }

  const displayText = isExpanded ? text : `${text.slice(0, maxLength)}...`

  return (
    <div className="space-y-1 w-full">
      <span className="leading-relaxed block">{displayText}</span>
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          setIsExpanded(!isExpanded)
        }}
        className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
      >
        {isExpanded ? (
          <>
            <ChevronUp size={12} />
            {showLessTranslation}
          </>
        ) : (
          <>
            <ChevronDown size={12} />
            {showFullTextTranslation.replace('{chars}', (text.length - maxLength).toString())}
          </>
        )}
      </button>
    </div>
  )
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
  t: any,
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

  // Add info about special values
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
 * Translate AI insight text using the i18n insight translations map.
 * Legacy fallback for policies extracted before aiInsightsTr was added.
 */
function translateInsightLegacy(
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

  // Pattern matches for dynamic content using i18n templates
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
function getLocalizedInsight(
  policy: { aiInsights: string[]; aiInsightsTr?: string[]; aiInsightsEn?: string[] },
  index: number,
  locale: string,
  insightTranslations: Record<string, string>
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
  return translateInsightLegacy(policy.aiInsights[index], locale, insightTranslations)
}

/**
 * Collapsible coverage category for mobile-friendly display
 */
function CollapsibleCoverageCategory({
  categoryKey: _categoryKey,
  categoryLabel,
  CategoryIcon,
  coverages,
  locale,
  t,
  coverageNames,
  defaultExpanded = false,
  formatAmount,
}: {
  categoryKey: string // Used for React key prop
  categoryLabel: string
  coverageNames: Record<string, string>
  CategoryIcon: React.ElementType
  coverages: GroupedCoverage[]
  locale: string
  t: any
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
    <div className="border border-gray-200 rounded-xl overflow-hidden">
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
              <div key={i} className="p-2.5 rounded-lg bg-blue-50 border border-blue-100">
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
          const hasInfo = !!infoText

          return (
            <div key={i} className="rounded-lg bg-gray-50 overflow-hidden">
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
              {isCoverageExpanded && infoText && (
                <div className="px-2.5 pb-2.5">
                  <div className="p-2 bg-blue-50 rounded-md border border-blue-100 ml-8">
                    <p className="text-xs text-gray-600 leading-relaxed">{infoText}</p>
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
  coverages,
  policyType,
  locale,
}: {
  coverages: Coverage[]
  policyType: string
  locale: string
}) {
  const { t } = useI18n()
  const { formatConverted: formatAmount } = useDisplayCurrency()
  // Filter and prepare coverages
  const filteredCoverages = coverages.filter((coverage) => {
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

  // Group coverages by category, then apply sub-limit grouping
  const groupedCoverages = useMemo(() => {
    const groups: Record<string, Coverage[]> = {
      main: [],
      liability: [],
      personal_accident: [],
      supplementary: [],
      assistance: [],
      legal: [],
      other: [],
    }

    for (const coverage of filteredCoverages) {
      const category = coverage.category || detectCoverageCategory(coverage.name)
      if (groups[category]) {
        groups[category].push(coverage)
      } else {
        groups.other.push(coverage)
      }
    }

    // Apply sub-limit grouping to each category, then sort by importance
    const groupedWithSubLimits: Record<string, GroupedCoverage[]> = {}
    for (const [category, coverages] of Object.entries(groups)) {
      const grouped = groupCoverageSubLimits(coverages)
      groupedWithSubLimits[category] = sortByImportance(grouped)
    }

    return groupedWithSubLimits
  }, [filteredCoverages])

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
  exclusions,
  exclusionsEn,
  policyType: _policyType, // Reserved for future policy-type-specific logic
  isCommercial = false,
  locale,
  evidenceData,
  quoteTranslations,
}: {
  exclusions: string[]
  exclusionsEn?: string[] | null
  policyType: string
  isCommercial?: boolean
  locale: string
  evidenceData?: Record<string, string>
  quoteTranslations?: Record<string, string>
}) {
  const [expandedExclusion, setExpandedExclusion] = useState<number | null>(null)

  const { t } = useI18n()
  const { formatConverted: formatAmount } = useDisplayCurrency()

  // Analyze exclusions comprehensively
  const analysis = useMemo(
    () => analyzeExclusionsComprehensive(exclusions, exclusionsEn || [], isCommercial),
    [exclusions, exclusionsEn, isCommercial]
  )

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
            {/* Deduplicate exclusions to hide LLM variability (e.g. "Aracın çalınması" vs "Aracın çalınması.") */}
            {(() => {
              const deduplicatedExclusions = analysis.exclusions.filter((current, index, self) => {
                const currentText = current.original.trim().toLowerCase()
                // Keep if there's no OTHER item that is slightly longer but contains this text
                // OR if another item is identical but we are the FIRST occurrence
                const isDuplicate =
                  self.findIndex((other, otherIndex) => {
                    if (index === otherIndex) return false
                    const otherText = other.original.trim().toLowerCase()
                    // Same text? Keep the first one only.
                    if (currentText === otherText) return otherIndex < index
                    // Other text is longer and contains current text? This is a subset, hide it.
                    if (otherText.length > currentText.length && otherText.includes(currentText))
                      return true
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
                  <li key={i}>
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
        analysis.missingImportantExclusions.length > 0) && (
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

              {/* Important topics not mentioned in exclusions */}
              {analysis.missingImportantExclusions
                .filter((item) => item.importance === 'high')
                .map((item, i) => (
                  <div
                    key={`missing-${i}`}
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

import { usePolicies } from '@/lib/policy-context'
import { usePolicyEvaluation } from '@/hooks/usePolicyEvaluation'
import { GradeBadge } from './evaluation/GradeBadge'
import { StatusIndicator } from './evaluation/StatusIndicator'
import { ScoreBreakdown } from './evaluation/ScoreBreakdown'
import { RecommendationCard } from './evaluation/RecommendationCard'
import type { AnalyzedPolicy } from '@/types/policy'

interface LocationState {
  policy?: AnalyzedPolicy
  isTrialResult?: boolean
  lowConfidence?: boolean
  confidenceScore?: number
}

function EvidenceQuote({ quote, quoteTr }: { quote: string; quoteTr?: string }) {
  const { t } = useI18n()
  const [showQuote, setShowQuote] = useState(false)

  if (!quote) return null

  return (
    <div className="mt-4 border-t border-gray-100 pt-3 w-full">
      <button
        onClick={(e) => {
          e.stopPropagation()
          setShowQuote(!showQuote)
        }}
        className="text-xs font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1 transition-colors"
      >
        <Quote size={12} />
        {showQuote ? t.common.hideQuote : t.common.showQuote}
      </button>
      {showQuote && (
        <div className="mt-2 space-y-2">
          {quoteTr && (
            <div className="text-xs text-gray-800 bg-blue-50 p-2 text-left rounded border border-blue-100 leading-relaxed font-medium">
              &quot;{quoteTr}&quot;
            </div>
          )}
          <div
            className={`text-left rounded italic whitespace-pre-wrap leading-relaxed ${
              quoteTr
                ? 'text-[11px] text-gray-500 bg-gray-50 border border-gray-100 p-2 opacity-80'
                : 'text-xs text-gray-600 bg-blue-50/50 border border-blue-100/50 p-2'
            }`}
          >
            &quot;{quote}&quot;
          </div>
        </div>
      )}
    </div>
  )
}

export function PolicyDetailView() {
  const navigate = useNavigate()
  const location = useLocation()
  const { id } = useParams<{ id: string }>()
  const { getPolicyById, fetchPolicyById } = usePolicies()
  const { t, locale } = useI18n()
  const { formatConverted } = useDisplayCurrency()

  // Check for policy passed via location state (for trial results)
  const locationState = location.state as LocationState | null
  const trialPolicy = locationState?.policy
  const isTrialResult = locationState?.isTrialResult ?? false
  const lowConfidence = locationState?.lowConfidence ?? false
  const confidenceScore = locationState?.confidenceScore

  // Try local cache first, then fetch from Supabase if not found
  const [policy, setPolicy] = useState<AnalyzedPolicy | undefined>(
    () => trialPolicy ?? (id ? getPolicyById(id) : undefined)
  )
  const [isLoadingPolicy, setIsLoadingPolicy] = useState(!policy && !!id && !trialPolicy)

  useEffect(() => {
    // If policy is already in local cache, no need to fetch
    if (policy || !id) return

    let cancelled = false
    setIsLoadingPolicy(true)

    fetchPolicyById(id)
      .then((fetchedPolicy) => {
        if (cancelled) return
        setPolicy(fetchedPolicy ?? undefined)
        setIsLoadingPolicy(false)
      })
      .catch(() => {
        if (cancelled) return
        setIsLoadingPolicy(false)
      })

    return () => {
      cancelled = true
    }
  }, [id, policy, fetchPolicyById])

  const { evaluation, isLoading: isEvaluationLoading } = usePolicyEvaluation(policy)

  // Mobile expandable section states
  const [insightsExpanded, setInsightsExpanded] = useState(false)
  const [recommendationsExpanded, setRecommendationsExpanded] = useState(false)
  const [scoreBreakdownExpanded, setScoreBreakdownExpanded] = useState(false)
  const [coveragesExpanded, setCoveragesExpanded] = useState(true) // Default expanded - important content
  const [exclusionsExpanded, setExclusionsExpanded] = useState(false) // Default collapsed

  // Export dropdown state
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const { exportPolicy, isGenerating: isPdfGenerating } = usePdfExport()

  // Close export menu on outside click
  useEffect(() => {
    if (!exportMenuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [exportMenuOpen])

  // Actuarial Engine Integration
  const actuarialResult = useMemo(() => {
    if (!policy) return null
    if (isTrialResult) return null

    // Beta Actuarial engine currently only supports specific policy types
    const supportedTypes = ['kasko', 'traffic', 'dask', 'zas']
    if (!supportedTypes.includes(policy.type)) return null

    try {
      const input = mapAnalyzedToActuarialInput(policy)
      const results = evaluateAndRankPolicies([input])
      return results[0]
    } catch (err) {
      console.error('Failed to run beta Actuarial Engine', err)
      return null
    }
  }, [policy, isTrialResult])

  // P1: Emit actuarial timing data to event bus for ActuarialTab
  useEffect(() => {
    if (actuarialResult?.layerTimings && policy) {
      emitEvaluation(policy.id, actuarialResult)
    }
  }, [actuarialResult, policy])

  // Export handlers
  const handleExportPdf = useCallback(async () => {
    if (!policy) return
    setExportMenuOpen(false)
    const success = await exportPolicy(policy)
    if (success) {
      toast.success(t.exportMenu.pdfSuccess)
    } else {
      toast.error(t.exportMenu.popupBlocked)
    }
  }, [policy, exportPolicy, t.exportMenu.pdfSuccess, t.exportMenu.popupBlocked])

  const handleExportCsv = useCallback(() => {
    if (!policy) return
    setExportMenuOpen(false)
    exportSinglePolicyToCSV(policy, locale as 'tr' | 'en')
    toast.success(t.exportMenu.csvSuccess)
  }, [policy, locale, t.exportMenu.csvSuccess])

  const handleExportExcel = useCallback(async () => {
    if (!policy) return
    setExportMenuOpen(false)
    await exportSinglePolicyToExcel(policy, locale as 'tr' | 'en')
    toast.success(t.exportMenu.excelSuccess)
  }, [policy, locale, t.exportMenu.excelSuccess])

  const handleExportText = useCallback(() => {
    if (!policy) return
    setExportMenuOpen(false)
    const summary = [
      `${t.policy.policy}: ${policy.policyNumber}`,
      `${t.policy.provider}: ${getShortCompanyName(policy.provider)}`,
      `${t.policy.type}: ${policy.typeTr}`,
      `${t.policy.insured}: ${policy.insuredPerson}`,
      `${t.policy.coverageLabel}: ${policy.type === 'kasko' ? t.policy.vehicleMarketValue : formatConverted(policy.coverage)}`,
      `${t.policy.premiumLabel}: ${formatConverted(policy.premium)}`,
      `${t.policy.deductibleLabel}: ${formatConverted(policy.deductible)}`,
      `${t.policy.period}: ${formatDate(policy.startDate, locale)} - ${formatDate(policy.expiryDate, locale)}`,
      '',
      `=== ${t.policy.coveragesTitleExport} ===`,
      ...policy.coverages.map(
        (c) =>
          `• ${getLocalizedCoverageName(c, locale, t.coverageNames)}: ${c.isUnlimited ? t.global.unlimited : formatConverted(c.limit)}`
      ),
      '',
      `=== ${t.policy.exclusionsTitleExport} ===`,
      ...policy.exclusions.map((e) => `• ${e}`),
      '',
      `=== ${t.policy.aiInsightsTitleExport} ===`,
      ...policy.aiInsights.map(
        (_, i) => `• ${getLocalizedInsight(policy, i, locale, t.insightTranslations)}`
      ),
    ].join('\n')

    const blob = new Blob([summary], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${policy.policyNumber.replace(/[^a-zA-Z0-9]/g, '_')}_summary.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success(t.exportMenu.textSuccess)
  }, [policy, locale, t, formatConverted])

  // Show loading state while fetching policy
  if (isLoadingPolicy) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">{t.common.loading}</p>
        </div>
      </div>
    )
  }

  if (!policy) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{t.policy.policyNotFound}</h2>
          <p className="text-gray-600 mb-4">{t.policy.policyNotFoundDesc}</p>
          <Button onClick={() => navigate('/dashboard')}>{t.policy.goToDashboard}</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 w-full max-w-[100vw] overflow-x-hidden">
      {/* Mobile-first header - ultra compact */}
      {/* Trial result banner */}
      {isTrialResult && (
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-4">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Sparkles size={18} />
              <span className="text-sm font-medium">{t.policy.freeTrialResult}</span>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="bg-white text-blue-600 hover:bg-blue-50"
              onClick={() => navigate('/auth?mode=signup')}
            >
              {t.policy.signUpAndSave}
            </Button>
          </div>
        </div>
      )}
      {lowConfidence && (
        <div className="bg-amber-50 border-b border-amber-200 py-3 px-4">
          <div className="max-w-6xl mx-auto flex items-center gap-3">
            <AlertTriangle size={18} className="text-amber-600 flex-shrink-0" />
            <div className="flex-1">
              <span className="text-sm font-medium text-amber-800">
                {t.policy.lowConfidenceScore.replace(
                  '{score}',
                  (confidenceScore ? Math.round(confidenceScore * 100) : '?').toString()
                )}
              </span>
              <span className="text-xs text-amber-600 ml-2">{t.policy.verifyImportantFields}</span>
            </div>
          </div>
        </div>
      )}

      <div className="sticky top-0 z-10 bg-white border-b shadow-sm w-full">
        <div className="max-w-6xl mx-auto px-2 sm:px-4 py-2 sm:py-3 w-full">
          <div className="flex items-center gap-2 w-full">
            {/* Back button - minimal padding */}
            <button
              onClick={() => (isTrialResult ? navigate('/') : navigate(-1))}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              aria-label={t.common.back}
            >
              <ArrowLeft size={18} className="sm:w-5 sm:h-5" />
            </button>

            {/* Policy type as title, provider and plate as subtitles */}
            <div className="flex items-center gap-2 flex-1 overflow-hidden" style={{ minWidth: 0 }}>
              <span className="text-lg sm:text-2xl flex-shrink-0">{policy.logo}</span>
              <div className="overflow-hidden" style={{ minWidth: 0 }}>
                <h1
                  className="text-sm sm:text-base font-bold text-gray-900 whitespace-nowrap overflow-hidden text-ellipsis"
                  style={{ maxWidth: '100%' }}
                  title={policy.typeTr}
                >
                  {policy.typeTr}
                </h1>
                <p
                  className="text-xs text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis"
                  title={policy.provider}
                >
                  {getShortCompanyName(policy.provider)}
                </p>
                {/* Show plate for vehicle policies */}
                {(policy.type === 'kasko' || policy.type === 'traffic') &&
                  policy.vehicleInfo?.plate && (
                    <p className="text-xs text-blue-600 font-medium whitespace-nowrap overflow-hidden text-ellipsis">
                      🚗 {policy.vehicleInfo.plate}
                    </p>
                  )}
              </div>
            </div>

            {/* Action buttons - ICON ONLY on mobile, no exceptions */}
            <div className="flex gap-0.5 sm:gap-1 flex-shrink-0">
              <button
                onClick={async () => {
                  try {
                    const shareUrl = `${window.location.origin}/policy/${policy.id}`
                    if (navigator.share) {
                      await navigator.share({
                        title: `${getShortCompanyName(policy.provider)} - ${policy.typeTr}`,
                        text: `${t.policy.policy} ${policy.policyNumber}`,
                        url: shareUrl,
                      })
                    } else {
                      await navigator.clipboard.writeText(shareUrl)
                      toast.success(t.common.linkCopied)
                    }
                  } catch (err) {
                    if ((err as Error).name !== 'AbortError') {
                      toast.error(t.common.shareFailed)
                    }
                  }
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label={t.common.share}
              >
                <Share2 size={18} className="text-gray-600" />
              </button>
              {/* Export dropdown */}
              <div className="relative" ref={exportMenuRef}>
                <button
                  onClick={() => setExportMenuOpen((prev) => !prev)}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  aria-label={t.exportMenu.exportAs}
                  aria-expanded={exportMenuOpen}
                  aria-haspopup="true"
                >
                  {isPdfGenerating ? (
                    <Loader2 size={18} className="text-gray-600 animate-spin" />
                  ) : (
                    <Download size={18} className="text-gray-600" />
                  )}
                </button>
                {exportMenuOpen && (
                  <div className="absolute right-0 top-full mt-1 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                    <button
                      onClick={handleExportPdf}
                      disabled={isPdfGenerating}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors disabled:opacity-50"
                    >
                      <FileText size={16} className="text-red-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900">
                          {t.exportMenu.pdfReport}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {t.exportMenu.pdfReportDesc}
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={handleExportCsv}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <FileSpreadsheet size={16} className="text-green-600 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900">
                          {t.exportMenu.csvExport}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {t.exportMenu.csvExportDesc}
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={handleExportExcel}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <FileSpreadsheet size={16} className="text-emerald-700 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900">
                          {t.exportMenu.excelExport}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {t.exportMenu.excelExportDesc}
                        </div>
                      </div>
                    </button>
                    <div className="border-t border-gray-100 my-1" />
                    <button
                      onClick={handleExportText}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                    >
                      <FileDown size={16} className="text-gray-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-gray-900">
                          {t.exportMenu.textSummary}
                        </div>
                        <div className="text-xs text-gray-500 truncate">
                          {t.exportMenu.textSummaryDesc}
                        </div>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-2 sm:px-4 py-3 sm:py-6 w-full overflow-hidden overflow-x-hidden">
        <div className="grid lg:grid-cols-3 gap-3 sm:gap-6 w-full min-w-0">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-6 min-w-0 overflow-hidden">
            {/* Policy Overview - Ultra compact mobile-first - ALWAYS Turkish */}
            <Card className="overflow-hidden w-full">
              <CardHeader className="py-2 px-3 sm:py-4 sm:px-6 bg-gradient-to-r from-blue-50 to-blue-100/50">
                <CardTitle className="flex items-center justify-between gap-2 overflow-hidden">
                  <span className="flex items-center gap-2 text-sm sm:text-base font-semibold text-gray-800 truncate">
                    <Shield className="text-blue-600 flex-shrink-0" size={16} />
                    <span className="truncate">{t.policy.policySummary}</span>
                  </span>
                  <Badge
                    variant={policy.status === 'active' ? 'success' : 'warning'}
                    className="text-xs flex-shrink-0"
                  >
                    {policy.status === 'active'
                      ? t.policy.activeStatus
                      : t.policy.expiringSoonStatus}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-6">
                {/* Key info in compact 2-column grid localized */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3 text-sm w-full overflow-hidden">
                  {/* Coverage - stacked vertically to prevent overflow */}
                  <div className="col-span-2 p-2.5 sm:p-3 bg-blue-50 rounded-lg border border-blue-100 overflow-hidden">
                    <p className="text-xs text-blue-600 font-medium mb-1">
                      {t.policy.coverageLabel}
                    </p>
                    <p className="text-lg sm:text-xl font-bold text-blue-700 truncate">
                      {policy.type === 'kasko'
                        ? t.policy.vehicleMarketValue
                        : formatConverted(policy.coverage)}
                    </p>
                    {policy.type === 'kasko' && (
                      <p className="text-[10px] text-blue-500 mt-0.5">{t.policy.marketValueHelp}</p>
                    )}
                  </div>

                  {/* Premium & Deductible row */}
                  <div className="p-2 sm:p-2.5 bg-gray-50 rounded-lg overflow-hidden">
                    <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5">
                      {t.policy.premiumLabel}
                    </p>
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {policy.premium > 0 ? formatConverted(policy.premium) : t.policy.notSpecified}
                    </p>
                  </div>
                  <div className="p-2 sm:p-2.5 bg-gray-50 rounded-lg overflow-hidden">
                    <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5">
                      {t.policy.deductibleLabel}
                    </p>
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {policy.deductible > 0 ? formatConverted(policy.deductible) : t.global.none}
                    </p>
                  </div>

                  {/* Insured - full width for long names */}
                  <div className="col-span-2 p-2 sm:p-2.5 bg-gray-50 rounded-lg overflow-hidden">
                    <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5">
                      {t.policy.insured}
                    </p>
                    <p
                      className="text-sm font-semibold text-gray-900 truncate"
                      title={policy.insuredPerson}
                    >
                      {policy.insuredPerson || '-'}
                    </p>
                  </div>

                  {/* Policy number */}
                  <div className="p-2 sm:p-2.5 bg-gray-50 rounded-lg overflow-hidden">
                    <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5">
                      {t.policy.policyNumberLabel}
                    </p>
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {policy.policyNumber}
                    </p>
                  </div>

                  {/* Location for non-vehicle policies */}

                  {policy.type !== 'kasko' && policy.type !== 'traffic' && policy.location && (
                    <div className="p-2 sm:p-2.5 bg-gray-50 rounded-lg overflow-hidden">
                      <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5">
                        {t.policy.location}
                      </p>
                      <p className="text-sm font-semibold text-gray-900 truncate">
                        {policy.location}
                      </p>
                    </div>
                  )}
                </div>

                {/* Dates row */}
                <div className="grid grid-cols-2 gap-2 mt-2.5 pt-2.5 border-t text-xs text-gray-500">
                  <div className="truncate">
                    <span className="text-gray-400">{t.policy.dates.start}</span>{' '}
                    <span className="font-medium text-gray-700">
                      {formatDate(policy.startDate, locale)}
                    </span>
                  </div>
                  <div className="truncate text-right">
                    <span className="text-gray-400">{t.policy.dates.end}</span>{' '}
                    <span className="font-medium text-gray-700">
                      {formatDate(policy.expiryDate, locale)}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Policy Evaluation - Mobile only (high priority) */}
            {evaluation && !isEvaluationLoading && (
              <Card className="lg:hidden">
                <CardHeader className="py-2 px-3 sm:py-4 sm:px-6">
                  <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                    <BarChart3 className="text-blue-600 flex-shrink-0" size={18} />
                    <span className="truncate">{t.policy.policyEvaluation}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 sm:p-6 space-y-3 sm:space-y-4">
                  {/* Overall Score with Grade - Compact */}
                  <div className="flex items-center justify-between p-2.5 sm:p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="text-2xl sm:text-3xl font-bold text-gray-900">
                        {evaluation.overallScore}
                      </div>
                      <div className="text-xs sm:text-sm text-gray-500">/100</div>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <GradeBadge grade={evaluation.grade} size="md" />
                      <StatusIndicator status={evaluation.status} showLabel size="sm" />
                    </div>
                  </div>

                  {/* Score Breakdown - Expandable */}
                  <div className="pt-2 border-t">
                    <button
                      onClick={() => setScoreBreakdownExpanded(!scoreBreakdownExpanded)}
                      className="flex items-center justify-between w-full text-left mb-2"
                    >
                      <p className="text-xs sm:text-sm font-medium text-gray-700">
                        {t.policy.scoreBreakdown}
                      </p>
                      <ChevronDown
                        size={16}
                        className={`text-gray-400 transition-transform ${scoreBreakdownExpanded ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {scoreBreakdownExpanded ? (
                      <ScoreBreakdown breakdown={evaluation.scoreBreakdown} variant="full" />
                    ) : (
                      <ScoreBreakdown breakdown={evaluation.scoreBreakdown} variant="mini" />
                    )}
                  </div>

                  {/* Recommendations - Expandable */}
                  {evaluation.recommendations.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-xs sm:text-sm font-medium text-gray-700 mb-2">
                        {t.policy.recommendations}
                      </p>
                      <div className="space-y-2">
                        {(recommendationsExpanded
                          ? evaluation.recommendations
                          : evaluation.recommendations.slice(0, 2)
                        ).map((rec, i) => (
                          <RecommendationCard key={i} recommendation={rec} compact />
                        ))}
                      </div>
                      {evaluation.recommendations.length > 2 && (
                        <button
                          onClick={() => setRecommendationsExpanded(!recommendationsExpanded)}
                          className="flex items-center justify-center gap-1 w-full mt-2 py-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                          {recommendationsExpanded ? (
                            <>
                              <ChevronUp size={14} />
                              {t.common.showLess}
                            </>
                          ) : (
                            <>
                              <ChevronDown size={14} />+{evaluation.recommendations.length - 2}{' '}
                              {t.policy.moreRecommendations}
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* AI Insights - Mobile only (high priority) */}
            <Card className="lg:hidden bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200">
              <CardHeader className="py-2 px-3 sm:py-4 sm:px-6">
                <CardTitle className="flex items-center gap-2 text-sm sm:text-base text-purple-900">
                  <Sparkles className="text-purple-600 flex-shrink-0" size={18} />
                  <span className="truncate">{t.policy.aiInsightsTitle}</span>
                  <Badge
                    variant="outline"
                    className="text-xs text-purple-600 border-purple-300 ml-auto"
                  >
                    {Math.round(policy.aiConfidence * 100)}%
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-6">
                <div className="space-y-2 sm:space-y-3">
                  {(insightsExpanded ? policy.aiInsights : policy.aiInsights.slice(0, 3)).map(
                    (_insight, i) => {
                      // Get localized insight: pre-translated (new) or display-time translated (legacy)
                      const rawLocalized = getLocalizedInsight(
                        policy,
                        i,
                        locale,
                        t.insightTranslations
                      )
                      // Strip any existing prefix characters from the text for clean display
                      const displayText = rawLocalized.replace(/^[✓✔☑⚠💡❌]\s*/gu, '').trim()

                      const originalInsight = policy.aiInsights[i]
                      const originalInsightKey = originalInsight.trim().toLowerCase()
                      const hasEvidence =
                        policy.evidenceData?.insights &&
                        policy.evidenceData.insights[originalInsightKey]

                      return (
                        <div
                          key={i}
                          className="flex flex-col gap-1 p-2 sm:p-3 bg-white/60 rounded-lg text-xs sm:text-sm text-gray-700"
                        >
                          <div className="flex items-start gap-2">
                            <Check className="text-purple-500 flex-shrink-0 mt-0.5" size={14} />
                            <TruncatableText
                              text={displayText}
                              maxLength={100}
                              showFullTextTranslation={t.policy.showFullText}
                              showLessTranslation={t.common.showLess}
                            />
                          </div>
                          {hasEvidence && (
                            <div className="w-full pl-5">
                              <EvidenceQuote
                                quote={policy.evidenceData!.insights[originalInsightKey]}
                                quoteTr={
                                  policy.evidenceData?.quoteTranslations?.insights?.[
                                    originalInsightKey
                                  ]
                                }
                              />
                            </div>
                          )}
                        </div>
                      )
                    }
                  )}
                  {policy.aiInsights.length > 3 && (
                    <button
                      onClick={() => setInsightsExpanded(!insightsExpanded)}
                      className="flex items-center justify-center gap-1 w-full mt-1 py-1.5 text-xs text-purple-600 hover:text-purple-700 font-medium"
                    >
                      {insightsExpanded ? (
                        <>
                          <ChevronUp size={14} />
                          {t.common.showLess}
                        </>
                      ) : (
                        <>
                          <ChevronDown size={14} />+{policy.aiInsights.length - 3}{' '}
                          {t.policy.moreInsights}
                        </>
                      )}
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Market Comparison - Mobile only */}
            {policy.marketComparison && policy.premium > 0 && (
              <Card className="lg:hidden">
                <CardHeader className="py-2 px-3 sm:py-4 sm:px-6">
                  <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
                    <TrendingUp className="text-blue-600 flex-shrink-0" size={18} />
                    <span className="truncate">{t.policy.marketComparison}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 sm:p-6">
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-500">{t.policy.yourPremium}</span>
                        <span className="text-xs text-gray-500">{t.policy.marketAvg}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-gray-900">
                          {formatConverted(policy.premium)}
                        </span>
                        <span className="font-semibold text-sm text-gray-600">
                          {formatConverted(policy.marketComparison.averagePremium)}
                        </span>
                      </div>
                      {policy.premium < policy.marketComparison.averagePremium && (
                        <div className="flex items-center gap-1 mt-1 text-green-600 text-xs">
                          <TrendingDown size={12} />
                          <span>
                            {Math.round(
                              (1 - policy.premium / policy.marketComparison.averagePremium) * 100
                            )}
                            % {t.policy.belowAverage}
                          </span>
                        </div>
                      )}
                      {policy.premium > policy.marketComparison.averagePremium && (
                        <div className="flex items-center gap-1 mt-1 text-amber-600 text-xs">
                          <TrendingUp size={12} />
                          <span>
                            {Math.round(
                              (policy.premium / policy.marketComparison.averagePremium - 1) * 100
                            )}
                            % {t.policy.aboveAverage}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="pt-2 border-t">
                      <p className="text-xs text-gray-500 mb-1">{t.policy.marketPercentile}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600"
                            style={{ width: `${policy.marketComparison.percentile}%` }}
                          />
                        </div>
                        <span className="font-semibold text-gray-900 text-xs">
                          {policy.marketComparison.percentile}%
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Vehicle Information (Kasko Only) */}
            {policy.type === 'kasko' && policy.vehicleInfo && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Car className="text-blue-600" size={20} />
                    {t.policy.vehicleInfoTitle}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-4">
                    {policy.vehicleInfo.plate && (
                      <div>
                        <p className="text-sm text-gray-500">{t.policy.plate}</p>
                        <p className="font-semibold text-gray-900">{policy.vehicleInfo.plate}</p>
                      </div>
                    )}
                    {policy.vehicleInfo.make && (
                      <div>
                        <p className="text-sm text-gray-500">{t.policy.make}</p>
                        <p className="font-semibold text-gray-900">{policy.vehicleInfo.make}</p>
                      </div>
                    )}
                    {policy.vehicleInfo.model && (
                      <div>
                        <p className="text-sm text-gray-500">{t.policy.model}</p>
                        <p className="font-semibold text-gray-900">{policy.vehicleInfo.model}</p>
                      </div>
                    )}
                    {policy.vehicleInfo.year && (
                      <div>
                        <p className="text-sm text-gray-500">{t.policy.modelYear}</p>
                        <p className="font-semibold text-gray-900">{policy.vehicleInfo.year}</p>
                      </div>
                    )}
                    {policy.vehicleInfo.usage && (
                      <div>
                        <p className="text-sm text-gray-500">{t.policy.usageType}</p>
                        <p className="font-semibold text-gray-900">{policy.vehicleInfo.usage}</p>
                      </div>
                    )}
                    {policy.vehicleInfo.vehicleClass && (
                      <div>
                        <p className="text-sm text-gray-500">{t.policy.vehicleClass}</p>
                        <p className="font-semibold text-gray-900">
                          {policy.vehicleInfo.vehicleClass}
                        </p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Coverages - Grouped by Category - Expandable */}
            <Card className="overflow-hidden">
              <CardHeader className="py-3 px-4 sm:py-4 sm:px-6">
                <button
                  onClick={() => setCoveragesExpanded(!coveragesExpanded)}
                  className="flex items-center justify-between w-full"
                >
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <Shield className="text-blue-600" size={20} />
                    {t.policy.coverageDetails}
                    <Badge variant="outline" className="text-xs ml-1">
                      {policy.coverages.length}
                    </Badge>
                  </CardTitle>
                  <ChevronDown
                    size={20}
                    className={`text-gray-400 transition-transform ${coveragesExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
              </CardHeader>
              {coveragesExpanded && (
                <CardContent>
                  <CoveragesByCategory
                    coverages={policy.coverages}
                    policyType={policy.type}
                    locale={locale}
                  />
                </CardContent>
              )}
              {!coveragesExpanded && (
                <CardContent className="pt-0 pb-3">
                  <p className="text-sm text-gray-500">{t.policy.clickToViewDetails}</p>
                </CardContent>
              )}
            </Card>

            {/* Exclusions - Comprehensive Analysis - Expandable */}
            <Card className="overflow-hidden">
              <CardHeader className="py-3 px-4 sm:py-4 sm:px-6">
                <button
                  onClick={() => setExclusionsExpanded(!exclusionsExpanded)}
                  className="flex items-center justify-between w-full"
                >
                  <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                    <AlertTriangle className="text-amber-500" size={20} />
                    {t.policy.exclusionsAndQuestions}
                    <Badge variant="outline" className="text-xs ml-1">
                      {policy.exclusions.length}
                    </Badge>
                  </CardTitle>
                  <ChevronDown
                    size={20}
                    className={`text-gray-400 transition-transform ${exclusionsExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
              </CardHeader>
              {exclusionsExpanded ? (
                <CardContent className="pt-0">
                  <ExclusionsSection
                    exclusions={policy.exclusions}
                    exclusionsEn={policy.exclusionsEn}
                    policyType={policy.type}
                    isCommercial={policy.vehicleInfo?.usage === 'Ticari'}
                    locale={locale}
                    evidenceData={policy.evidenceData?.exclusions}
                    quoteTranslations={policy.evidenceData?.quoteTranslations?.exclusions}
                  />
                </CardContent>
              ) : (
                <CardContent className="pt-0 pb-3">
                  <p className="text-sm text-gray-500">{t.policy.exclusionsDesc}</p>
                </CardContent>
              )}
            </Card>

            {/* Policy Documents - Mobile only (shown in sidebar on desktop) */}
            <div className="lg:hidden">
              <PolicyDocuments policyId={policy.id} />
            </div>
          </div>

          {/* Sidebar - Desktop only */}
          <div className="hidden lg:block space-y-6 min-w-0 overflow-hidden">
            {/* Status Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <Badge
                    variant={policy.status === 'active' ? 'success' : 'warning'}
                    className="mb-4"
                  >
                    {policy.status === 'active'
                      ? t.policy.activeStatus
                      : t.policy.expiringSoonStatus}
                  </Badge>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{t.policy.startDate}</span>
                      <span className="font-medium">{formatDate(policy.startDate, locale)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">{t.policy.endDate}</span>
                      <span className="font-medium">{formatDate(policy.expiryDate, locale)}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Policy Evaluation */}
            {evaluation && !isEvaluationLoading && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="text-blue-600" size={20} />
                    {t.policy.policyEvaluation}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Overall Score with Grade */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-3xl font-bold text-gray-900">
                        {evaluation.overallScore}
                      </div>
                      <div className="text-sm text-gray-500">/100</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <GradeBadge grade={evaluation.grade} size="md" />
                      <StatusIndicator status={evaluation.status} showLabel size="sm" />
                    </div>
                  </div>

                  {/* Score Breakdown */}
                  <div className="pt-2 border-t">
                    <p className="text-sm font-medium text-gray-700 mb-2">
                      {t.policy.scoreBreakdown}
                    </p>
                    <ScoreBreakdown breakdown={evaluation.scoreBreakdown} variant="full" />
                  </div>

                  {/* Top Recommendations */}
                  {evaluation.recommendations.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        {t.policy.recommendations}
                      </p>
                      <div className="space-y-2">
                        {evaluation.recommendations.slice(0, 2).map((rec, i) => (
                          <RecommendationCard key={i} recommendation={rec} compact />
                        ))}
                      </div>
                      {evaluation.recommendations.length > 2 && (
                        <p className="text-xs text-gray-500 mt-2 text-center">
                          +{evaluation.recommendations.length - 2} {t.policy.moreRecommendations}
                        </p>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Policy Documents */}
            <PolicyDocuments policyId={policy.id} />

            {/* AI Insights */}
            <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-purple-900">
                  <Sparkles className="text-purple-600" size={20} />
                  {t.policy.aiInsightsTitle}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-purple-600">{t.policy.confidenceLabel}</span>
                    <span className="font-semibold text-purple-900">
                      {Math.round(policy.aiConfidence * 100)}%
                    </span>
                  </div>
                  {policy.aiInsights.map((_insight, i) => {
                    const originalInsight = policy.aiInsights[i]
                    const originalInsightKey = originalInsight.trim().toLowerCase()
                    const hasEvidence =
                      policy.evidenceData?.insights &&
                      policy.evidenceData.insights[originalInsightKey]
                    return (
                      <div key={i} className="p-3 bg-white/60 rounded-lg text-sm text-gray-700">
                        <TruncatableText
                          text={getLocalizedInsight(policy, i, locale, t.insightTranslations)}
                          maxLength={150}
                          showFullTextTranslation={t.policy.showFullText}
                          showLessTranslation={t.common.showLess}
                        />
                        {hasEvidence && (
                          <EvidenceQuote
                            quote={policy.evidenceData!.insights[originalInsightKey]}
                          />
                        )}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Market Comparison - Only show when we have valid premium data */}
            {policy.marketComparison && policy.premium > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="text-blue-600" size={18} />
                    {t.policy.marketComparison}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs sm:text-sm text-gray-500">
                          {t.policy.yourPremium}
                        </span>
                        <span className="text-xs sm:text-sm text-gray-500">
                          {t.policy.marketAvg}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900">
                          {formatConverted(policy.premium)}
                        </span>
                        <span className="font-semibold text-gray-600">
                          {formatConverted(policy.marketComparison.averagePremium)}
                        </span>
                      </div>
                      {policy.premium < policy.marketComparison.averagePremium && (
                        <div className="flex items-center gap-1 mt-1 text-green-600 text-xs sm:text-sm">
                          <TrendingDown size={14} />
                          <span>
                            {Math.round(
                              (1 - policy.premium / policy.marketComparison.averagePremium) * 100
                            )}
                            % {t.policy.belowAverage}
                          </span>
                        </div>
                      )}
                      {policy.premium > policy.marketComparison.averagePremium && (
                        <div className="flex items-center gap-1 mt-1 text-amber-600 text-xs sm:text-sm">
                          <TrendingUp size={14} />
                          <span>
                            {Math.round(
                              (policy.premium / policy.marketComparison.averagePremium - 1) * 100
                            )}
                            % {t.policy.aboveAverage}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="pt-2 border-t">
                      <p className="text-xs sm:text-sm text-gray-500 mb-1">
                        {t.policy.marketPercentile}
                      </p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600"
                            style={{ width: `${policy.marketComparison.percentile}%` }}
                          />
                        </div>
                        <span className="font-semibold text-gray-900 text-sm">
                          {policy.marketComparison.percentile}%
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Beta Actuarial Engine Insights */}
            {actuarialResult && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 rounded-xl p-4 sm:p-5 mt-6 border border-blue-100">
                <div className="flex items-center gap-2 mb-3">
                  <BarChart3 className="text-blue-600 w-5 h-5" />
                  <h3 className="font-semibold text-gray-900">Beta Actuarial Engine (EOOP)</h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg p-4 border border-blue-50">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                      {t.policy.expectedOutOfPocket}
                    </p>
                    <p className="text-2xl font-bold text-gray-900">
                      {actuarialResult.expectedOutOfPocket.expectedCost.amount.toLocaleString()}{' '}
                      {actuarialResult.expectedOutOfPocket.expectedCost.currency}
                    </p>
                    <p className="text-sm text-gray-600 mt-2">
                      {t.policy.premiumLabel}{' '}
                      <span className="font-medium">
                        {actuarialResult.expectedOutOfPocket.premium.amount.toLocaleString()}{' '}
                        {actuarialResult.expectedOutOfPocket.premium.currency}
                      </span>
                    </p>
                    <p className="text-sm text-gray-600">
                      {t.policy.expectedUncoveredLoss}{' '}
                      <span className="font-medium text-amber-600">
                        {actuarialResult.expectedOutOfPocket.expectedUncoveredLoss.amount.toLocaleString()}{' '}
                        {actuarialResult.expectedOutOfPocket.expectedUncoveredLoss.currency}
                      </span>
                    </p>
                  </div>

                  <div className="bg-white rounded-lg p-4 border border-blue-50">
                    <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">
                      {t.policy.contractQualityScore}
                    </p>
                    <div className="flex items-end gap-2">
                      <p className="text-2xl font-bold text-gray-900">
                        {Math.round(actuarialResult.contractQualityScore)}
                      </p>
                      <span className="text-sm font-medium text-gray-500 mb-1">/ 100</span>
                    </div>

                    <p className="text-sm text-gray-600 mt-2">
                      {t.policy.partsStandard}{' '}
                      <span className="font-medium capitalize">
                        {actuarialResult.indemnityMechanics?.partsStandard?.value ||
                          t.global.unspecified}
                      </span>
                    </p>
                    <p className="text-sm text-gray-600">
                      {t.policy.repairNetwork}{' '}
                      <span className="font-medium capitalize">
                        {actuarialResult.indemnityMechanics?.repairNetworkRule?.value?.replace(
                          '_',
                          ' '
                        ) || t.global.unspecified}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Historical Score Trend */}
            <div className="mt-6">
              <PolicyActuarialHistoryChart policyId={policy.id} />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
