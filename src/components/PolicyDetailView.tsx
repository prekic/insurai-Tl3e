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
  getCoverageClarifications,
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
 * Get background color based on coverage importance
 */
function getCoverageBackground(coverage: Coverage): string {
  const importance = coverage.importance || 'standard'

  if (!coverage.included) {
    return 'bg-gray-50'
  }

  switch (importance) {
    case 'critical':
      return 'bg-green-50'
    case 'standard':
      return 'bg-blue-50'
    case 'minor':
      return 'bg-gray-50'
    default:
      return 'bg-green-50'
  }
}

/**
 * Get icon color based on coverage importance
 */
function getCoverageIconStyle(coverage: Coverage): { bg: string; icon: string } {
  const importance = coverage.importance || 'standard'

  if (!coverage.included) {
    return { bg: 'bg-gray-200', icon: 'text-gray-400' }
  }

  switch (importance) {
    case 'critical':
      return { bg: 'bg-green-100', icon: 'text-green-600' }
    case 'standard':
      return { bg: 'bg-blue-100', icon: 'text-blue-600' }
    case 'minor':
      return { bg: 'bg-gray-100', icon: 'text-gray-500' }
    default:
      return { bg: 'bg-green-100', icon: 'text-green-600' }
  }
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
    <div className="space-y-6">
      {/* Implicit coverages note for kasko */}
      {isKasko && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-xl">
          <div className="flex items-center gap-2 text-green-800 font-medium mb-2">
            <Check className="text-green-600" size={18} />
            {locale === 'tr' ? 'Temel Kasko Teminatları (Dahil)' : 'Base Kasko Coverage (Included)'}
          </div>
          <p className="text-sm text-green-700 mb-2">
            {locale === 'tr'
              ? 'Çarpma/Çarpışma, Hırsızlık, Yangın, Doğal Afetler (deprem, sel, dolu, fırtına) araç rayiç bedeli üzerinden teminat altındadır.'
              : 'Collision, Theft, Fire, Natural Disasters (earthquake, flood, hail, storm) are covered up to vehicle market value.'}
          </p>
          <div className="text-xs text-green-600 flex items-center gap-1">
            <HelpCircle size={12} />
            {locale === 'tr'
              ? 'Muafiyet, hasar oranı kesintisi ve özel şartlar için poliçenizi kontrol edin.'
              : 'Check your policy for deductibles, depreciation, and special conditions.'}
          </div>
        </div>
      )}

      {/* Grouped coverages */}
      {categoryOrder.map(categoryKey => {
        const categoryCoverages = groupedCoverages[categoryKey]
        if (!categoryCoverages || categoryCoverages.length === 0) return null

        const categoryInfo = getCategoryInfo(categoryKey)
        const CategoryIcon = getCategoryIcon(categoryKey)

        return (
          <div key={categoryKey}>
            <div className="flex items-center gap-2 mb-3">
              <CategoryIcon className="text-gray-600" size={18} />
              <h4 className="font-semibold text-gray-900">{categoryInfo.labelTr}</h4>
              <Badge variant="outline" className="text-xs">
                {categoryCoverages.length}
              </Badge>
            </div>
            <div className="space-y-2">
              {categoryCoverages.map((groupedCoverage, i) => {
                // Handle grouped coverages with sub-limits
                if (groupedCoverage.isGrouped && groupedCoverage.subLimits) {
                  return (
                    <div
                      key={i}
                      className="p-3 rounded-lg bg-blue-50 border border-blue-100"
                    >
                      {/* Parent coverage header */}
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                          <Check className="text-blue-600" size={14} />
                        </div>
                        <p className="font-medium text-gray-900">{groupedCoverage.name}</p>
                      </div>
                      {/* Sub-limits grid - single column on mobile, 2 cols on tablet+ */}
                      <div className="ml-0 md:ml-10 mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {groupedCoverage.subLimits.map((subLimit, j) => (
                          <div key={j} className="flex justify-between items-center bg-white/60 px-3 py-2 rounded-md">
                            <span className="text-xs sm:text-sm text-gray-600 truncate mr-2">{subLimit.label}</span>
                            <span className={`text-xs sm:text-sm font-medium whitespace-nowrap ${subLimit.isUnlimited ? 'text-blue-600' : 'text-gray-900'}`}>
                              {subLimit.isUnlimited ? 'Sınırsız' : formatCurrency(subLimit.limit)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                }

                // Regular (non-grouped) coverage
                const coverage = groupedCoverage as unknown as Coverage
                const iconStyle = getCoverageIconStyle(coverage)
                const limitDisplay = formatCoverageLimit(coverage)
                const isSpecialValue = coverage.isUnlimited || coverage.isMarketValue ||
                  limitDisplay === 'Dahil' || limitDisplay === 'Sınırsız' || limitDisplay === 'Rayiç Değer'

                // Check if this coverage needs clarification
                const clarification = getCoverageClarifications(coverage.name)

                return (
                  <div
                    key={i}
                    className={`p-3 rounded-lg ${getCoverageBackground(coverage)}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {coverage.included !== false ? (
                          <div className={`w-7 h-7 ${iconStyle.bg} rounded-lg flex items-center justify-center`}>
                            <Check className={iconStyle.icon} size={14} />
                          </div>
                        ) : (
                          <div className="w-7 h-7 bg-gray-200 rounded-lg flex items-center justify-center">
                            <X className="text-gray-400" size={14} />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{coverage.name}</p>
                          {coverage.nameTr && coverage.nameTr !== coverage.name && (
                            <p className="text-xs text-gray-500">{coverage.nameTr}</p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`font-semibold text-sm ${isSpecialValue ? 'text-blue-600' : 'text-gray-900'}`}>
                          {limitDisplay}
                        </p>
                        {coverage.deductible > 0 && (
                          <p className="text-xs text-gray-500">Muafiyet: {formatCurrency(coverage.deductible)}</p>
                        )}
                      </div>
                    </div>
                    {/* Clarification prompt for service coverages */}
                    {clarification && isSpecialValue && (
                      <div className="mt-2 ml-10 p-2 bg-blue-50/50 rounded-md border border-blue-100">
                        <p className="text-xs text-blue-700 flex items-center gap-1">
                          <HelpCircle size={11} />
                          {locale === 'tr' ? clarification.question : clarification.questionEn}
                        </p>
                        <div className="text-xs text-blue-600 mt-1">
                          {clarification.details.map((detail, j) => (
                            <span key={j} className="inline-block mr-2">• {detail}</span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
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
          <pre className="p-4 text-sm text-gray-700 whitespace-pre-wrap font-mono leading-relaxed overflow-x-auto">
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
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-2 sm:gap-4 mb-6 sm:mb-8">
          <button
            onClick={() => navigate(-1)}
            className="p-2 hover:bg-white rounded-lg transition-colors flex-shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft size={20} className="sm:w-6 sm:h-6" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 sm:gap-3">
              <span className="text-2xl sm:text-3xl flex-shrink-0">{policy.logo}</span>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 truncate">{policy.provider}</h1>
                <p className="text-sm sm:text-base text-gray-600 truncate">{policy.policyNumber}</p>
              </div>
            </div>
          </div>
          <div className="flex gap-1 sm:gap-2 flex-shrink-0">
            <Button
              variant="outline"
              size="sm"
              className="gap-1 sm:gap-2 h-9 px-2 sm:px-3"
              onClick={async () => {
                try {
                  const shareUrl = `${window.location.origin}/policy/${policy.id}`
                  if (navigator.share) {
                    await navigator.share({
                      title: `${policy.provider} - ${policy.typeTr}`,
                      text: `Policy ${policy.policyNumber} - ${policy.insuredPerson}`,
                      url: shareUrl,
                    })
                  } else {
                    await navigator.clipboard.writeText(shareUrl)
                    toast.success(locale === 'tr' ? 'Bağlantı kopyalandı' : 'Link copied to clipboard')
                  }
                } catch (err) {
                  if ((err as Error).name !== 'AbortError') {
                    toast.error(locale === 'tr' ? 'Paylaşım başarısız' : 'Share failed')
                  }
                }
              }}
            >
              <Share2 size={16} />
              <span className="hidden sm:inline">{locale === 'tr' ? 'Paylaş' : 'Share'}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-1 sm:gap-2 h-9 px-2 sm:px-3"
              onClick={() => {
                // Generate policy summary for download
                const summary = [
                  `Policy: ${policy.policyNumber}`,
                  `Provider: ${policy.provider}`,
                  `Type: ${policy.typeTr}`,
                  `Insured: ${policy.insuredPerson}`,
                  `Coverage: ${policy.type === 'kasko' ? 'Araç Rayiç Bedeli' : formatCurrency(policy.coverage)}`,
                  `Premium: ${formatCurrency(policy.premium)}`,
                  `Deductible: ${formatCurrency(policy.deductible)}`,
                  `Period: ${formatDate(policy.startDate)} - ${formatDate(policy.expiryDate)}`,
                  '',
                  '=== COVERAGES ===',
                  ...policy.coverages.map(c => `• ${c.nameTr || c.name}: ${c.isUnlimited ? 'Sınırsız' : formatCurrency(c.limit)}`),
                  '',
                  '=== EXCLUSIONS ===',
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
            >
              <Download size={16} />
              <span className="hidden sm:inline">{locale === 'tr' ? 'İndir' : 'Download'}</span>
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Policy Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="text-blue-600" size={20} />
                  Policy Overview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-500">Policy Type</p>
                      <p className="font-semibold text-gray-900">{policy.typeTr}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Insured</p>
                      <p className="font-semibold text-gray-900">{policy.insuredPerson || 'N/A'}</p>
                    </div>
                    {/* Show vehicle info for auto policies, location for others */}
                    {(policy.type === 'kasko' || policy.type === 'traffic') && policy.vehicleInfo ? (
                      <div>
                        <p className="text-sm text-gray-500">{locale === 'tr' ? 'Araç' : 'Vehicle'}</p>
                        <p className="font-semibold text-gray-900">
                          {[
                            policy.vehicleInfo.plate,
                            policy.vehicleInfo.make,
                            policy.vehicleInfo.model,
                            policy.vehicleInfo.year,
                          ]
                            .filter(Boolean)
                            .join(' • ') || 'N/A'}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-sm text-gray-500">Location</p>
                        <p className="font-semibold text-gray-900">{policy.location || 'N/A'}</p>
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div>
                      <p className="text-sm text-gray-500">
                        {locale === 'tr' ? 'Teminat Limiti' : 'Coverage Limit'}
                      </p>
                      <p className="text-xl md:text-2xl font-bold text-gray-900">
                        {/* Kasko always uses market value for main coverage */}
                        {policy.type === 'kasko'
                          ? (locale === 'tr' ? 'Araç Rayiç Bedeli' : 'Vehicle Market Value')
                          : (policy.coverage === 0 && policy.coverages.some(c => c.isMarketValue))
                            ? (locale === 'tr' ? 'Rayiç Değer' : 'Market Value')
                            : formatCurrency(policy.coverage)}
                      </p>
                      {policy.type === 'kasko' && (
                        <p className="text-xs text-gray-500 mt-1">
                          {locale === 'tr'
                            ? 'Hasar anındaki piyasa değeri üzerinden'
                            : 'Based on market value at time of loss'}
                        </p>
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">{locale === 'tr' ? 'Yıllık Prim' : 'Annual Premium'}</p>
                      <p className="text-lg md:text-xl font-semibold text-gray-900">
                        {policy.premium > 0 ? formatCurrency(policy.premium) : (locale === 'tr' ? 'Belirtilmemiş' : 'Not specified')}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">{locale === 'tr' ? 'Muafiyet' : 'Deductible'}</p>
                      <p className="font-semibold text-gray-900">
                        {policy.deductible > 0 ? formatCurrency(policy.deductible) : (locale === 'tr' ? 'Yok' : 'None')}
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

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

            {/* Coverages - Grouped by Category */}
            <Card>
              <CardHeader>
                <CardTitle>
                  {locale === 'tr' ? 'Teminat Detayları' : 'Coverage Details'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <CoveragesByCategory
                  coverages={policy.coverages}
                  policyType={policy.type}
                  locale={locale}
                />
              </CardContent>
            </Card>

            {/* Exclusions - Comprehensive Analysis */}
            <ExclusionsSection
              exclusions={policy.exclusions}
              policyType={policy.type}
              isCommercial={policy.vehicleInfo?.usage === 'Ticari'}
              locale={locale}
            />

            {/* Document Text Section */}
            {(policy.extractedText || policy.processedText) && (
              <RawExtractedTextSection
                extractedText={policy.extractedText || ''}
                processedText={policy.processedText}
                locale={locale}
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
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
