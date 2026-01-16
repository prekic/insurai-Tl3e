import { useState, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { ArrowLeft, Download, Share2, Shield, AlertTriangle, Check, X, Sparkles, TrendingUp, TrendingDown, BarChart3, Loader2, Car, Scale, Users, Briefcase, Gavel, LifeBuoy, HelpCircle, Info, ShieldCheck, FileText, ChevronDown, ChevronUp, Copy, CheckCircle, Code } from 'lucide-react'
import { Button } from './ui/button'
import { Badge } from './ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { PolicyDocuments } from './PolicyDocuments'
import { formatCurrency, formatDate } from '@/lib/utils'
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

/**
 * Format coverage limit with special handling for unlimited and market value
 * Uses kasko knowledge hub for intelligent detection
 */
function formatCoverageLimit(coverage: Coverage): string {
  // Explicit flags take priority
  if (coverage.isUnlimited) {
    return 'Sınırsız'
  }
  if (coverage.isMarketValue) {
    return 'Rayiç Değer'
  }

  // Use kasko knowledge hub for intelligent detection
  if (shouldShowUnlimited(coverage.name, coverage.limit)) {
    return 'Sınırsız'
  }
  if (shouldShowIncluded(coverage.name, coverage.limit)) {
    return 'Dahil'
  }

  // Legacy fallback checks
  if (coverage.limit === 0) {
    const nameLower = coverage.name.toLowerCase()
    if (nameLower.includes('sınırsız') || nameLower.includes('unlimited')) {
      return 'Sınırsız'
    }
    if (nameLower.includes('rayiç') || nameLower.includes('market value')) {
      return 'Rayiç Değer'
    }
    // Services without numeric limits
    if (nameLower.includes('asistans') || nameLower.includes('hizmet') ||
        nameLower.includes('ikame') || nameLower.includes('onarım')) {
      return 'Dahil'
    }
    return 'Dahil' // Default to "Dahil" instead of ₺0 for zero-limit coverages
  }
  return formatCurrency(coverage.limit)
}

/**
 * Get icon for coverage category
 */
function getCategoryIcon(category: CoverageCategory) {
  switch (category) {
    case 'main': return Car
    case 'liability': return Scale
    case 'personal_accident': return Users
    case 'supplementary': return Briefcase
    case 'assistance': return LifeBuoy
    case 'legal': return Gavel
    default: return Shield
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
 * Collapsible coverage category for mobile-friendly display
 */
function CollapsibleCoverageCategory({
  categoryKey: _categoryKey,
  categoryLabel,
  CategoryIcon,
  coverages,
  locale,
  defaultExpanded = false,
}: {
  categoryKey: string // Used for React key prop
  categoryLabel: string
  CategoryIcon: React.ElementType
  coverages: GroupedCoverage[]
  locale: string
  defaultExpanded?: boolean
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const PREVIEW_COUNT = 2

  const hasMore = coverages.length > PREVIEW_COUNT
  const displayedCoverages = isExpanded ? coverages : coverages.slice(0, PREVIEW_COUNT)

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
                  <p className="font-medium text-gray-900 text-sm truncate">{groupedCoverage.name}</p>
                </div>
                <div className="grid grid-cols-1 gap-1 ml-8">
                  {groupedCoverage.subLimits.map((subLimit, j) => (
                    <div key={j} className="flex justify-between items-center text-xs">
                      <span className="text-gray-600 truncate mr-2">{subLimit.label}</span>
                      <span className={`font-medium flex-shrink-0 ${subLimit.isUnlimited ? 'text-blue-600' : 'text-gray-900'}`}>
                        {subLimit.isUnlimited ? 'Sınırsız' : formatCurrency(subLimit.limit)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )
          }

          // Regular coverage
          const coverage = groupedCoverage as unknown as Coverage
          const limitDisplay = formatCoverageLimit(coverage)
          const isSpecialValue = coverage.isUnlimited || coverage.isMarketValue ||
            limitDisplay === 'Dahil' || limitDisplay === 'Sınırsız' || limitDisplay === 'Rayiç Değer'

          return (
            <div key={i} className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
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
                <p className="font-medium text-gray-900 text-sm truncate">{coverage.name}</p>
              </div>
              <p className={`font-semibold text-sm flex-shrink-0 ${isSpecialValue ? 'text-blue-600' : 'text-gray-900'}`}>
                {limitDisplay}
              </p>
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
                {locale === 'tr' ? 'Daha az göster' : 'Show less'}
              </>
            ) : (
              <>
                <ChevronDown size={14} />
                +{coverages.length - PREVIEW_COUNT} {locale === 'tr' ? 'daha fazla' : 'more'}
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
  // Filter and prepare coverages
  const filteredCoverages = coverages.filter(coverage => {
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
    return !categoryPatterns.some(pattern => nameLower.includes(pattern))
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
            <span className="text-sm">Temel Kasko Teminatları (Dahil)</span>
          </div>
          <p className="text-xs sm:text-sm text-green-700 mb-2 leading-relaxed">
            Çarpma/Çarpışma, Hırsızlık, Yangın, Doğal Afetler (deprem, sel, dolu, fırtına) araç rayiç bedeli üzerinden teminat altındadır.
          </p>
          <div className="text-xs text-green-600 flex items-start gap-1">
            <HelpCircle size={12} className="flex-shrink-0 mt-0.5" />
            <span>Muafiyet, hasar oranı kesintisi ve özel şartlar için poliçenizi kontrol edin.</span>
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
            categoryLabel={categoryInfo.labelTr}
            CategoryIcon={CategoryIcon}
            coverages={categoryCoverages}
            locale={locale}
            defaultExpanded={index === 0} // First category expanded by default
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
  policyType: _policyType, // Reserved for future policy-type-specific logic
  isCommercial = false,
  locale,
}: {
  exclusions: string[]
  policyType: string
  isCommercial?: boolean
  locale: string
}) {
  const [expandedExclusion, setExpandedExclusion] = useState<number | null>(null)

  // Analyze exclusions comprehensively
  const analysis = useMemo(
    () => analyzeExclusionsComprehensive(exclusions, isCommercial),
    [exclusions, isCommercial]
  )

  const getSeverityStyles = (severity: AnalyzedExclusion['severity']) => {
    switch (severity) {
      case 'critical':
        return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-800', icon: 'text-red-600', badge: 'destructive' as const }
      case 'important':
        return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-800', icon: 'text-amber-600', badge: 'warning' as const }
      case 'standard':
        return { bg: 'bg-yellow-50', border: 'border-yellow-100', text: 'text-gray-700', icon: 'text-yellow-600', badge: 'outline' as const }
      default:
        return { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-600', icon: 'text-gray-400', badge: 'secondary' as const }
    }
  }

  const getSeverityLabel = (severity: AnalyzedExclusion['severity']) => {
    switch (severity) {
      case 'critical': return locale === 'tr' ? 'Kritik' : 'Critical'
      case 'important': return locale === 'tr' ? 'Önemli' : 'Important'
      case 'standard': return locale === 'tr' ? 'Standart' : 'Standard'
      default: return locale === 'tr' ? 'Bilgi' : 'Info'
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
              {locale === 'tr' ? 'Ek Teminatlar (Limitli)' : 'Additional Coverage (Limited)'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {analysis.coveragesInExclusions.map((item, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Check className="text-green-600" size={16} />
                    <span className="text-sm text-gray-700">{item.original.replace(/\(.*\)/, '').trim()}</span>
                  </div>
                  <span className="text-sm font-semibold text-green-700">
                    {item.extractedLimit ? formatCurrency(item.extractedLimit) : ''}
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
            {locale === 'tr' ? 'İstisnalar (Kapsam Dışı)' : 'Exclusions'}
          </CardTitle>
          <p className="text-sm text-gray-500 mt-1">
            {locale === 'tr'
              ? 'Bu durumlar sigorta kapsamı dışındadır. Detaylı açıklama için tıklayın.'
              : 'These situations are not covered. Click for detailed explanation.'}
          </p>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2">
            {analysis.exclusions.map((exclusion, i) => {
              const styles = getSeverityStyles(exclusion.severity)
              const isExpanded = expandedExclusion === i

              return (
                <li key={i}>
                  <button
                    onClick={() => setExpandedExclusion(isExpanded ? null : i)}
                    className={`w-full text-left p-3 rounded-lg border ${styles.bg} ${styles.border} transition-all hover:shadow-sm`}
                  >
                    <div className="flex items-start gap-3">
                      <X className={`flex-shrink-0 mt-0.5 ${styles.icon}`} size={16} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-sm leading-relaxed ${styles.text} ${exclusion.severity === 'critical' ? 'font-medium' : ''}`}>
                            {exclusion.original}
                          </span>
                          {exclusion.severity !== 'standard' && exclusion.severity !== 'informational' && (
                            <Badge variant={styles.badge} className="text-xs">
                              {getSeverityLabel(exclusion.severity)}
                            </Badge>
                          )}
                          {exclusion.needsClarification && (
                            <HelpCircle className="text-blue-500" size={14} />
                          )}
                        </div>

                        {/* Expanded explanation */}
                        {isExpanded && exclusion.explanation && (
                          <div className="mt-3 p-3 bg-white/70 rounded-md border border-gray-200">
                            <p className="text-sm text-gray-700 mb-2">
                              <Info className="inline mr-1 text-blue-500" size={14} />
                              {locale === 'tr' ? exclusion.explanation : exclusion.explanationEn}
                            </p>
                            {exclusion.examples && exclusion.examples.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs font-medium text-gray-500 mb-1">
                                  {locale === 'tr' ? 'Örnekler:' : 'Examples:'}
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
                          </div>
                        )}
                      </div>
                      <Info className="text-gray-400 flex-shrink-0" size={14} />
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </CardContent>
      </Card>

      {/* Clarification Needed */}
      {(analysis.clarificationNeeded.length > 0 || analysis.missingImportantExclusions.length > 0) && (
        <Card className="border-blue-200 bg-blue-50/50">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-blue-900">
              <HelpCircle className="text-blue-600" size={18} />
              {locale === 'tr' ? 'Sigortanıza Sorun' : 'Ask Your Insurer'}
            </CardTitle>
            <p className="text-sm text-blue-700 mt-1">
              {locale === 'tr'
                ? 'Bu konuları sigorta şirketinizle netleştirmenizi öneririz.'
                : 'We recommend clarifying these points with your insurance company.'}
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {/* Items from exclusions that need clarification */}
              {analysis.clarificationNeeded.map((item, i) => (
                <div key={`clarify-${i}`} className="p-3 bg-white rounded-lg border border-blue-200">
                  <p className="text-sm font-medium text-gray-800 mb-1">{item.item}</p>
                  <p className="text-sm text-blue-700 flex items-center gap-1">
                    <HelpCircle size={12} />
                    {locale === 'tr' ? item.question : item.questionEn}
                  </p>
                </div>
              ))}

              {/* Important topics not mentioned in exclusions */}
              {analysis.missingImportantExclusions
                .filter(item => item.importance === 'high')
                .map((item, i) => (
                  <div key={`missing-${i}`} className="p-3 bg-white rounded-lg border border-blue-200">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-gray-800">{item.name}</span>
                      <Badge variant="outline" className="text-xs text-blue-600 border-blue-300">
                        {locale === 'tr' ? 'Poliçede belirtilmemiş' : 'Not specified'}
                      </Badge>
                    </div>
                    <p className="text-sm text-blue-700 flex items-center gap-1">
                      <HelpCircle size={12} />
                      {locale === 'tr' ? item.question : item.question}
                    </p>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/**
 * Document Text Section
 * Displays the AI-processed or raw text extracted from the PDF document
 * Shows processed text by default (with OCR corrections) if available
 */
function RawExtractedTextSection({
  extractedText,
  processedText,
  locale,
}: {
  extractedText: string
  processedText?: string
  locale: string
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  // Use processed text by default if available, otherwise fall back to raw
  const hasProcessedText = processedText && processedText !== extractedText
  const displayText = showRaw || !processedText ? extractedText : processedText

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(displayText)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea')
      textarea.value = displayText
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Calculate text stats for current display text
  const lineCount = displayText.split('\n').length
  const wordCount = displayText.split(/\s+/).filter(w => w.length > 0).length
  const charCount = displayText.length

  // Show preview (first 500 characters)
  const previewText = displayText.slice(0, 500)
  const hasMore = displayText.length > 500

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
            <FileText className="text-gray-600 flex-shrink-0" size={18} />
            <span className="truncate">
              {locale === 'tr'
                ? (showRaw ? 'Ham Metin' : 'Poliçe Metni')
                : (showRaw ? 'Raw Text' : 'Document')}
            </span>
            {!showRaw && hasProcessedText && (
              <Badge variant="success" className="text-xs flex-shrink-0">
                AI
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
            {hasProcessedText && (
              <Button
                variant={showRaw ? 'default' : 'outline'}
                size="sm"
                onClick={() => setShowRaw(!showRaw)}
                className="gap-1 text-xs h-8 px-2 sm:px-3"
              >
                {showRaw ? <Sparkles size={12} /> : <Code size={12} />}
                <span className="hidden sm:inline">{showRaw ? (locale === 'tr' ? 'İşlenmiş' : 'Processed') : (locale === 'tr' ? 'Ham' : 'Raw')}</span>
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="gap-1 h-8 px-2 sm:px-3"
            >
              {copied ? <CheckCircle className="text-green-600" size={14} /> : <Copy size={14} />}
              <span className="hidden sm:inline">{copied ? (locale === 'tr' ? 'Kopyalandı' : 'Copied') : (locale === 'tr' ? 'Kopyala' : 'Copy')}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="gap-1 h-8 px-2"
            >
              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              <span className="hidden sm:inline">{isExpanded ? (locale === 'tr' ? 'Küçült' : 'Less') : (locale === 'tr' ? 'Genişlet' : 'More')}</span>
            </Button>
          </div>
        </div>
        <p className="text-xs sm:text-sm text-gray-500 mt-2">
          {locale === 'tr'
            ? `${lineCount} satır • ${wordCount.toLocaleString()} kelime`
            : `${lineCount} lines • ${wordCount.toLocaleString()} words`}
        </p>
      </CardHeader>
      <CardContent>
        <div className={`relative bg-gray-50 rounded-lg border border-gray-200 ${isExpanded ? '' : 'max-h-48 overflow-hidden'}`}>
          <pre className="p-4 text-sm text-gray-700 whitespace-pre-wrap break-words font-mono leading-relaxed max-w-full">
            {isExpanded ? displayText : previewText}
            {!isExpanded && hasMore && '...'}
          </pre>
          {!isExpanded && hasMore && (
            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-gray-50 to-transparent pointer-events-none" />
          )}
        </div>
        {!isExpanded && hasMore && (
          <button
            onClick={() => setIsExpanded(true)}
            className="mt-2 text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
          >
            <ChevronDown size={14} />
            {locale === 'tr'
              ? `Tamamını göster (${(charCount - 500).toLocaleString()} karakter daha)`
              : `Show full text (${(charCount - 500).toLocaleString()} more chars)`}
          </button>
        )}
      </CardContent>
    </Card>
  )
}

import { usePolicies } from '@/lib/policy-context'
import { useI18n } from '@/lib/i18n'
import { usePolicyEvaluation } from '@/hooks/usePolicyEvaluation'
import { GradeBadge } from './evaluation/GradeBadge'
import { StatusIndicator } from './evaluation/StatusIndicator'
import { ScoreBreakdown } from './evaluation/ScoreBreakdown'
import { RecommendationCard } from './evaluation/RecommendationCard'
import type { AnalyzedPolicy } from '@/types/policy'

export function PolicyDetailView() {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const { getPolicyById, fetchPolicyById } = usePolicies()
  const { locale } = useI18n()

  // Try local cache first, then fetch from Supabase if not found
  const [policy, setPolicy] = useState<AnalyzedPolicy | undefined>(() =>
    id ? getPolicyById(id) : undefined
  )
  const [isLoadingPolicy, setIsLoadingPolicy] = useState(!policy && !!id)

  useEffect(() => {
    // If policy is already in local cache, no need to fetch
    if (policy || !id) return

    let cancelled = false
    setIsLoadingPolicy(true)

    fetchPolicyById(id).then((fetchedPolicy) => {
      if (cancelled) return
      setPolicy(fetchedPolicy ?? undefined)
      setIsLoadingPolicy(false)
    }).catch(() => {
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

  // Show loading state while fetching policy
  if (isLoadingPolicy) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600">Loading policy...</p>
        </div>
      </div>
    )
  }

  if (!policy) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Policy not found</h2>
          <p className="text-gray-600 mb-4">The policy you&apos;re looking for doesn&apos;t exist.</p>
          <Button onClick={() => navigate('/dashboard')}>Go to Dashboard</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 w-full max-w-[100vw] overflow-x-hidden">
      {/* Mobile-first header - ultra compact */}
      <div className="sticky top-0 z-10 bg-white border-b shadow-sm w-full">
        <div className="max-w-6xl mx-auto px-2 sm:px-4 py-2 sm:py-3 w-full overflow-hidden">
          <div className="flex items-center gap-2 w-full">
            {/* Back button - minimal padding */}
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors flex-shrink-0"
              aria-label={locale === 'tr' ? 'Geri' : 'Go back'}
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
                <p className="text-xs text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis" title={policy.provider}>
                  {policy.provider}
                </p>
                {/* Show plate for vehicle policies */}
                {(policy.type === 'kasko' || policy.type === 'traffic') && policy.vehicleInfo?.plate && (
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
                        title: `${policy.provider} - ${policy.typeTr}`,
                        text: `${locale === 'tr' ? 'Poliçe' : 'Policy'} ${policy.policyNumber}`,
                        url: shareUrl,
                      })
                    } else {
                      await navigator.clipboard.writeText(shareUrl)
                      toast.success(locale === 'tr' ? 'Bağlantı kopyalandı' : 'Link copied')
                    }
                  } catch (err) {
                    if ((err as Error).name !== 'AbortError') {
                      toast.error(locale === 'tr' ? 'Paylaşım başarısız' : 'Share failed')
                    }
                  }
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label={locale === 'tr' ? 'Paylaş' : 'Share'}
              >
                <Share2 size={18} className="text-gray-600" />
              </button>
              <button
                onClick={() => {
                  const summary = [
                    `${locale === 'tr' ? 'Poliçe' : 'Policy'}: ${policy.policyNumber}`,
                    `${locale === 'tr' ? 'Şirket' : 'Provider'}: ${policy.provider}`,
                    `${locale === 'tr' ? 'Tür' : 'Type'}: ${policy.typeTr}`,
                    `${locale === 'tr' ? 'Sigortalı' : 'Insured'}: ${policy.insuredPerson}`,
                    `${locale === 'tr' ? 'Teminat' : 'Coverage'}: ${policy.type === 'kasko' ? 'Araç Rayiç Bedeli' : formatCurrency(policy.coverage)}`,
                    `${locale === 'tr' ? 'Prim' : 'Premium'}: ${formatCurrency(policy.premium)}`,
                    `${locale === 'tr' ? 'Muafiyet' : 'Deductible'}: ${formatCurrency(policy.deductible)}`,
                    `${locale === 'tr' ? 'Dönem' : 'Period'}: ${formatDate(policy.startDate)} - ${formatDate(policy.expiryDate)}`,
                    '',
                    `=== ${locale === 'tr' ? 'TEMİNATLAR' : 'COVERAGES'} ===`,
                    ...policy.coverages.map(c => `• ${c.nameTr || c.name}: ${c.isUnlimited ? 'Sınırsız' : formatCurrency(c.limit)}`),
                    '',
                    `=== ${locale === 'tr' ? 'İSTİSNALAR' : 'EXCLUSIONS'} ===`,
                    ...policy.exclusions.map(e => `• ${e}`),
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
                  toast.success(locale === 'tr' ? 'Özet indirildi' : 'Summary downloaded')
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                aria-label={locale === 'tr' ? 'İndir' : 'Download'}
              >
                <Download size={18} className="text-gray-600" />
              </button>
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
                    <span className="truncate">Poliçe Özeti</span>
                  </span>
                  <Badge variant={policy.status === 'active' ? 'success' : 'warning'} className="text-xs flex-shrink-0">
                    {policy.status === 'active' ? 'Aktif' : 'Bitiyor'}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-6">
                {/* Key info in compact 2-column grid - FORCE Turkish labels for Turkish insurance app */}
                <div className="grid grid-cols-2 gap-2 sm:gap-3 text-sm w-full overflow-hidden">
                  {/* Coverage - stacked vertically to prevent overflow */}
                  <div className="col-span-2 p-2.5 sm:p-3 bg-blue-50 rounded-lg border border-blue-100 overflow-hidden">
                    <p className="text-xs text-blue-600 font-medium mb-1">Teminat</p>
                    <p className="text-lg sm:text-xl font-bold text-blue-700 truncate">
                      {policy.type === 'kasko' ? 'Araç Rayiç Bedeli' : formatCurrency(policy.coverage)}
                    </p>
                    {policy.type === 'kasko' && (
                      <p className="text-[10px] text-blue-500 mt-0.5">Hasar anındaki piyasa değeri</p>
                    )}
                  </div>

                  {/* Premium & Deductible row */}
                  <div className="p-2 sm:p-2.5 bg-gray-50 rounded-lg overflow-hidden">
                    <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5">Prim</p>
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {policy.premium > 0 ? formatCurrency(policy.premium) : 'Belirtilmemiş'}
                    </p>
                  </div>
                  <div className="p-2 sm:p-2.5 bg-gray-50 rounded-lg overflow-hidden">
                    <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5">Muafiyet</p>
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {policy.deductible > 0 ? formatCurrency(policy.deductible) : 'Yok'}
                    </p>
                  </div>

                  {/* Insured - full width for long names */}
                  <div className="col-span-2 p-2 sm:p-2.5 bg-gray-50 rounded-lg overflow-hidden">
                    <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5">Sigortalı</p>
                    <p className="text-sm font-semibold text-gray-900 truncate" title={policy.insuredPerson}>
                      {policy.insuredPerson || '-'}
                    </p>
                  </div>

                  {/* Policy number - now that type is in header */}
                  <div className="p-2 sm:p-2.5 bg-gray-50 rounded-lg overflow-hidden">
                    <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5">Poliçe No</p>
                    <p className="text-sm font-semibold text-gray-900 truncate">{policy.policyNumber}</p>
                  </div>

                  {/* Location for non-vehicle policies */}
                  {policy.type !== 'kasko' && policy.type !== 'traffic' && policy.location && (
                    <div className="p-2 sm:p-2.5 bg-gray-50 rounded-lg overflow-hidden">
                      <p className="text-[10px] sm:text-xs text-gray-500 mb-0.5">Konum</p>
                      <p className="text-sm font-semibold text-gray-900 truncate">{policy.location}</p>
                    </div>
                  )}
                </div>

                {/* Dates row - grid layout to prevent overflow */}
                <div className="grid grid-cols-2 gap-2 mt-2.5 pt-2.5 border-t text-xs text-gray-500">
                  <div className="truncate">
                    <span className="text-gray-400">Başlangıç:</span>{' '}
                    <span className="font-medium text-gray-700">{formatDate(policy.startDate)}</span>
                  </div>
                  <div className="truncate text-right">
                    <span className="text-gray-400">Bitiş:</span>{' '}
                    <span className="font-medium text-gray-700">{formatDate(policy.expiryDate)}</span>
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
                    <span className="truncate">{locale === 'tr' ? 'Poliçe Değerlendirmesi' : 'Policy Evaluation'}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 sm:p-6 space-y-3 sm:space-y-4">
                  {/* Overall Score with Grade - Compact */}
                  <div className="flex items-center justify-between p-2.5 sm:p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg">
                    <div className="flex items-center gap-2 sm:gap-3">
                      <div className="text-2xl sm:text-3xl font-bold text-gray-900">{evaluation.overallScore}</div>
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
                        {locale === 'tr' ? 'Puan Dağılımı' : 'Score Breakdown'}
                      </p>
                      <ChevronDown
                        size={16}
                        className={`text-gray-400 transition-transform ${scoreBreakdownExpanded ? 'rotate-180' : ''}`}
                      />
                    </button>
                    {scoreBreakdownExpanded ? (
                      <ScoreBreakdown
                        breakdown={evaluation.scoreBreakdown}
                        variant="full"
                      />
                    ) : (
                      <ScoreBreakdown
                        breakdown={evaluation.scoreBreakdown}
                        variant="mini"
                      />
                    )}
                  </div>

                  {/* Recommendations - Expandable */}
                  {evaluation.recommendations.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-xs sm:text-sm font-medium text-gray-700 mb-2">
                        {locale === 'tr' ? 'Öneriler' : 'Recommendations'}
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
                              {locale === 'tr' ? 'Daha az göster' : 'Show less'}
                            </>
                          ) : (
                            <>
                              <ChevronDown size={14} />
                              +{evaluation.recommendations.length - 2} {locale === 'tr' ? 'daha fazla öneri' : 'more recommendations'}
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
                  <span className="truncate">AI Insights</span>
                  <Badge variant="outline" className="text-xs text-purple-600 border-purple-300 ml-auto">
                    {Math.round(policy.aiConfidence * 100)}%
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-3 sm:p-6">
                <div className="space-y-2 sm:space-y-3">
                  {(insightsExpanded
                    ? policy.aiInsights
                    : policy.aiInsights.slice(0, 3)
                  ).map((insight, i) => {
                    // Strip any existing checkmark characters from the text
                    const cleanInsight = insight.replace(/^[✓✔☑]\s*/g, '').trim()
                    return (
                      <div key={i} className="p-2 sm:p-3 bg-white/60 rounded-lg text-xs sm:text-sm text-gray-700 flex items-start gap-2">
                        <Check className="text-purple-500 flex-shrink-0 mt-0.5" size={14} />
                        <span>{cleanInsight}</span>
                      </div>
                    )
                  })}
                  {policy.aiInsights.length > 3 && (
                    <button
                      onClick={() => setInsightsExpanded(!insightsExpanded)}
                      className="flex items-center justify-center gap-1 w-full mt-1 py-1.5 text-xs text-purple-600 hover:text-purple-700 font-medium"
                    >
                      {insightsExpanded ? (
                        <>
                          <ChevronUp size={14} />
                          {locale === 'tr' ? 'Daha az göster' : 'Show less'}
                        </>
                      ) : (
                        <>
                          <ChevronDown size={14} />
                          +{policy.aiInsights.length - 3} {locale === 'tr' ? 'daha fazla içgörü' : 'more insights'}
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
                    <span className="truncate">{locale === 'tr' ? 'Piyasa Karşılaştırması' : 'Market Comparison'}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-3 sm:p-6">
                  <div className="space-y-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-500">{locale === 'tr' ? 'Priminiz' : 'Your Premium'}</span>
                        <span className="text-xs text-gray-500">{locale === 'tr' ? 'Piyasa Ort.' : 'Market Avg'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-sm text-gray-900">{formatCurrency(policy.premium)}</span>
                        <span className="font-semibold text-sm text-gray-600">{formatCurrency(policy.marketComparison.averagePremium)}</span>
                      </div>
                      {policy.premium < policy.marketComparison.averagePremium && (
                        <div className="flex items-center gap-1 mt-1 text-green-600 text-xs">
                          <TrendingDown size={12} />
                          <span>
                            {Math.round((1 - policy.premium / policy.marketComparison.averagePremium) * 100)}% {locale === 'tr' ? 'ortalamanın altında' : 'below average'}
                          </span>
                        </div>
                      )}
                      {policy.premium > policy.marketComparison.averagePremium && (
                        <div className="flex items-center gap-1 mt-1 text-amber-600 text-xs">
                          <TrendingUp size={12} />
                          <span>
                            {Math.round((policy.premium / policy.marketComparison.averagePremium - 1) * 100)}% {locale === 'tr' ? 'ortalamanın üstünde' : 'above average'}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="pt-2 border-t">
                      <p className="text-xs text-gray-500 mb-1">{locale === 'tr' ? 'Piyasa Yüzdeliği' : 'Market Percentile'}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600"
                            style={{ width: `${policy.marketComparison.percentile}%` }}
                          />
                        </div>
                        <span className="font-semibold text-gray-900 text-xs">{policy.marketComparison.percentile}%</span>
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
                    {locale === 'tr' ? 'Araç Bilgileri' : 'Vehicle Information'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-4">
                    {policy.vehicleInfo.plate && (
                      <div>
                        <p className="text-sm text-gray-500">Plaka</p>
                        <p className="font-semibold text-gray-900">{policy.vehicleInfo.plate}</p>
                      </div>
                    )}
                    {policy.vehicleInfo.make && (
                      <div>
                        <p className="text-sm text-gray-500">Marka</p>
                        <p className="font-semibold text-gray-900">{policy.vehicleInfo.make}</p>
                      </div>
                    )}
                    {policy.vehicleInfo.model && (
                      <div>
                        <p className="text-sm text-gray-500">Model</p>
                        <p className="font-semibold text-gray-900">{policy.vehicleInfo.model}</p>
                      </div>
                    )}
                    {policy.vehicleInfo.year && (
                      <div>
                        <p className="text-sm text-gray-500">Model Yılı</p>
                        <p className="font-semibold text-gray-900">{policy.vehicleInfo.year}</p>
                      </div>
                    )}
                    {policy.vehicleInfo.usage && (
                      <div>
                        <p className="text-sm text-gray-500">Kullanım Şekli</p>
                        <p className="font-semibold text-gray-900">{policy.vehicleInfo.usage}</p>
                      </div>
                    )}
                    {policy.vehicleInfo.vehicleClass && (
                      <div>
                        <p className="text-sm text-gray-500">Araç Sınıfı</p>
                        <p className="font-semibold text-gray-900">{policy.vehicleInfo.vehicleClass}</p>
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
                    Teminat Detayları
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
                  <p className="text-sm text-gray-500">
                    {locale === 'tr' ? 'Detayları görmek için tıklayın' : 'Click to view details'}
                  </p>
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
                    {locale === 'tr' ? 'İstisnalar & Sorular' : 'Exclusions & Questions'}
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
                    policyType={policy.type}
                    isCommercial={policy.vehicleInfo?.usage === 'Ticari'}
                    locale={locale}
                  />
                </CardContent>
              ) : (
                <CardContent className="pt-0 pb-3">
                  <p className="text-sm text-gray-500">
                    {locale === 'tr' ? 'Kapsam dışı durumlar ve sigortacıya sorulacak konular' : 'Uncovered situations and questions for your insurer'}
                  </p>
                </CardContent>
              )}
            </Card>

            {/* Policy Documents - Mobile only (shown in sidebar on desktop) */}
            <div className="lg:hidden">
              <PolicyDocuments policyId={policy.id} />
            </div>

            {/* Document Text Section - Low priority, at bottom */}
            {(policy.extractedText || policy.processedText) && (
              <RawExtractedTextSection
                extractedText={policy.extractedText || ''}
                processedText={policy.processedText}
                locale={locale}
              />
            )}
          </div>

          {/* Sidebar - Desktop only */}
          <div className="hidden lg:block space-y-6 min-w-0 overflow-hidden">
            {/* Status Card */}
            <Card>
              <CardContent className="pt-6">
                <div className="text-center">
                  <Badge variant={policy.status === 'active' ? 'success' : 'warning'} className="mb-4">
                    {policy.status === 'active' ? 'Active' : 'Expiring Soon'}
                  </Badge>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Start Date</span>
                      <span className="font-medium">{formatDate(policy.startDate)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-500">Expiry Date</span>
                      <span className="font-medium">{formatDate(policy.expiryDate)}</span>
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
                    {locale === 'tr' ? 'Poliçe Değerlendirmesi' : 'Policy Evaluation'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* Overall Score with Grade */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-3xl font-bold text-gray-900">{evaluation.overallScore}</div>
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
                      {locale === 'tr' ? 'Puan Dağılımı' : 'Score Breakdown'}
                    </p>
                    <ScoreBreakdown
                      breakdown={evaluation.scoreBreakdown}
                      variant="full"
                    />
                  </div>

                  {/* Top Recommendations */}
                  {evaluation.recommendations.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-sm font-medium text-gray-700 mb-2">
                        {locale === 'tr' ? 'Öneriler' : 'Recommendations'}
                      </p>
                      <div className="space-y-2">
                        {evaluation.recommendations.slice(0, 2).map((rec, i) => (
                          <RecommendationCard key={i} recommendation={rec} compact />
                        ))}
                      </div>
                      {evaluation.recommendations.length > 2 && (
                        <p className="text-xs text-gray-500 mt-2 text-center">
                          +{evaluation.recommendations.length - 2} {locale === 'tr' ? 'daha fazla öneri' : 'more recommendations'}
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
                  AI Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-purple-600">Confidence:</span>
                    <span className="font-semibold text-purple-900">{Math.round(policy.aiConfidence * 100)}%</span>
                  </div>
                  {policy.aiInsights.map((insight, i) => (
                    <div key={i} className="p-3 bg-white/60 rounded-lg text-sm text-gray-700">
                      {insight}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Market Comparison - Only show when we have valid premium data */}
            {policy.marketComparison && policy.premium > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <TrendingUp className="text-blue-600" size={18} />
                    {locale === 'tr' ? 'Piyasa Karşılaştırması' : 'Market Comparison'}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs sm:text-sm text-gray-500">{locale === 'tr' ? 'Priminiz' : 'Your Premium'}</span>
                        <span className="text-xs sm:text-sm text-gray-500">{locale === 'tr' ? 'Piyasa Ort.' : 'Market Avg'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-gray-900">{formatCurrency(policy.premium)}</span>
                        <span className="font-semibold text-gray-600">{formatCurrency(policy.marketComparison.averagePremium)}</span>
                      </div>
                      {policy.premium < policy.marketComparison.averagePremium && (
                        <div className="flex items-center gap-1 mt-1 text-green-600 text-xs sm:text-sm">
                          <TrendingDown size={14} />
                          <span>
                            {Math.round((1 - policy.premium / policy.marketComparison.averagePremium) * 100)}% {locale === 'tr' ? 'ortalamanın altında' : 'below average'}
                          </span>
                        </div>
                      )}
                      {policy.premium > policy.marketComparison.averagePremium && (
                        <div className="flex items-center gap-1 mt-1 text-amber-600 text-xs sm:text-sm">
                          <TrendingUp size={14} />
                          <span>
                            {Math.round((policy.premium / policy.marketComparison.averagePremium - 1) * 100)}% {locale === 'tr' ? 'ortalamanın üstünde' : 'above average'}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="pt-2 border-t">
                      <p className="text-xs sm:text-sm text-gray-500 mb-1">{locale === 'tr' ? 'Piyasa Yüzdeliği' : 'Market Percentile'}</p>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600"
                            style={{ width: `${policy.marketComparison.percentile}%` }}
                          />
                        </div>
                        <span className="font-semibold text-gray-900 text-sm">{policy.marketComparison.percentile}%</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
