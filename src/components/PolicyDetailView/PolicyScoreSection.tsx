import { useState } from 'react'
import { BarChart3, Sparkles, AlertTriangle, ChevronDown, ChevronUp, Check } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card'
import { Badge } from '../ui/badge'
import { GradeBadge } from '../evaluation/GradeBadge'
import { StatusIndicator } from '../evaluation/StatusIndicator'
import { ScoreBreakdown } from '../evaluation/ScoreBreakdown'
import { RecommendationCard } from '../evaluation/RecommendationCard'
import { TruncatableText, EvidenceQuote } from './shared'

// Mobile Evaluation
export function MobileEvaluationCard(props: any) {
  const { evaluation, isEvaluationLoading, isUnverified, locale, t } = props
  const [scoreBreakdownExpanded, setScoreBreakdownExpanded] = useState(false)
  const [recommendationsExpanded, setRecommendationsExpanded] = useState(false)
  /* Policy Evaluation - Mobile only (high priority) */
  if (!evaluation || isEvaluationLoading) return null
  return (
    <Card className="lg:hidden">
      {isUnverified && (
        <div className="px-3 pt-2 sm:px-6 sm:pt-3">
          <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
            <AlertTriangle size={12} className="flex-shrink-0" />
            <span>
              {locale === 'tr'
                ? 'Puanlar taslak niteliğindedir — insan incelemesi bekleniyor'
                : 'Scores are preliminary — pending human review'}
            </span>
          </div>
        </div>
      )}
      <CardHeader className="py-2 px-3 sm:py-4 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-sm sm:text-base">
          <BarChart3 className="text-blue-600 flex-shrink-0" size={18} />
          <span className="truncate">{t.policy.policyEvaluation}</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 space-y-3 sm:space-y-4">
        /* Overall Score with Grade - Compact */
        <div className="flex items-center justify-between p-2.5 sm:p-3 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg">
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="text-2xl sm:text-3xl font-bold text-gray-900">
              {isUnverified ? '-' : evaluation.overallScore}
            </div>
            <div className="text-xs sm:text-sm text-gray-500">/100</div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            {isUnverified ? (
              <Badge variant="outline" className="text-gray-500 border-gray-300">
                {t.policy.draftStatus}
              </Badge>
            ) : (
              <GradeBadge
                grade={evaluation.grade}
                isProvisional={evaluation.isProvisional}
                size="md"
              />
            )}
            <StatusIndicator status={evaluation.status} showLabel size="sm" />
          </div>
        </div>
        /* Top Score Drivers — concise "why this grade" */ /* Suppressed for unverified/draft
        policies to avoid leaking confident category scores */
        {!isUnverified &&
          (() => {
            const breakdown = evaluation.scoreBreakdown
            const categories = [
              {
                key: 'premium',
                score: breakdown.premium.score,
                weight: breakdown.premium.weight,
                label: locale === 'tr' ? 'Prim' : 'Premium',
              },
              {
                key: 'coverage',
                score: breakdown.coverage.score,
                weight: breakdown.coverage.weight,
                label: locale === 'tr' ? 'Teminat' : 'Coverage',
              },
              {
                key: 'deductible',
                score: breakdown.deductible.score,
                weight: breakdown.deductible.weight,
                label: locale === 'tr' ? 'Muafiyet' : 'Deductible',
              },
              {
                key: 'compliance',
                score: breakdown.compliance.score,
                weight: breakdown.compliance.weight,
                label: locale === 'tr' ? 'Uyum' : 'Compliance',
              },
              {
                key: 'value',
                score: breakdown.value.score,
                weight: breakdown.value.weight,
                label: locale === 'tr' ? 'Değer' : 'Value',
              },
            ].filter((c) => c.score >= 0)
            const sorted = [...categories].sort((a, b) => b.score * b.weight - a.score * a.weight)
            const topDriver = sorted[0]
            const topPenalty = [...categories].sort((a, b) => a.score - b.score)[0]
            const showPenalty =
              topPenalty && topPenalty.score < 70 && topPenalty.key !== topDriver?.key

            return (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] sm:text-xs text-gray-500 mt-1">
                {topDriver && (
                  <span>
                    {locale === 'tr' ? 'En güçlü' : 'Strongest'}:{' '}
                    <span className="font-medium text-emerald-700">
                      {topDriver.label} ({topDriver.score})
                    </span>
                  </span>
                )}
                {showPenalty && (
                  <span>
                    {locale === 'tr' ? 'En zayıf' : 'Weakest'}:{' '}
                    <span className="font-medium text-amber-700">
                      {topPenalty.label} ({topPenalty.score})
                    </span>
                  </span>
                )}
              </div>
            )
          })()}
        /* Model disclosure */
        <p
          className="text-[10px] text-gray-400 italic leading-tight"
          data-testid="grade-model-disclosure"
        >
          {locale === 'tr'
            ? 'Bu derecelendirme mevcut iç model eşiklerine dayanmaktadır ve karşılaştırma kapsamı geliştikçe yeniden kalibre edilebilir.'
            : 'This rating is based on current internal model thresholds and may be recalibrated as benchmark coverage improves.'}
        </p>
        /* Score Breakdown - Expandable */
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
          <div className={isUnverified ? 'opacity-60 transition-opacity hover:opacity-100' : ''}>
            {scoreBreakdownExpanded ? (
              <ScoreBreakdown breakdown={evaluation.scoreBreakdown} variant="full" />
            ) : (
              <ScoreBreakdown breakdown={evaluation.scoreBreakdown} variant="mini" />
            )}
          </div>
        </div>
        /* Recommendations - Expandable */
        {evaluation.recommendations.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs sm:text-sm font-medium text-gray-700 mb-2">
              {t.policy.recommendations}
            </p>
            <div className="space-y-2">
              {(recommendationsExpanded
                ? evaluation.recommendations
                : evaluation.recommendations.slice(0, 2)
              ).map((rec: any, i: number) => (
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
  )
}

// Mobile Insights
export function MobileInsightsCard(props: any) {
  const { policy, summary, isPilotResult, displaySummary, locale, t } = props
  const [insightsExpanded, setInsightsExpanded] = useState(false)
  /* AI Insights - Mobile only (high priority) */
  return (
    <Card className="lg:hidden bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200">
      {isPilotResult && (
        <div
          className="p-3 border-b-2 border-amber-400 bg-amber-50 rounded-t-lg"
          role="alert"
          aria-live="polite"
          data-testid="pilot-review-banner"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={16} />
            <div>
              <p className="font-semibold text-amber-800 text-xs">
                TASLAK / DRAFT — İnsan İncelemesi Gerekli / Human Review Required
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                {displaySummary?.pilotReviewBanner ||
                  (locale === 'tr'
                    ? 'Bu sonuçlar yapay zeka tarafından oluşturulmuştur. İnsan onayı olmadan kesinleşmiş değildir.'
                    : 'These results are AI-generated. Not finalized without human approval.')}
              </p>
            </div>
          </div>
        </div>
      )}
      <CardHeader className="py-2 px-3 sm:py-4 sm:px-6">
        <CardTitle className="flex items-center gap-2 text-sm sm:text-base text-purple-900">
          <Sparkles className="text-purple-600 flex-shrink-0" size={18} />
          <span className="truncate">{t.policy.aiInsightsTitle}</span>
          <Badge variant="outline" className="text-xs text-purple-600 border-purple-300 ml-auto">
            {Math.round(policy.aiConfidence * 100)}%
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 sm:p-6">
        <div className="space-y-2 sm:space-y-3">
          {(() => {
            // Deduplicate insights using LOCALIZED text to catch cross-language duplicates.
            // Track original indices so evidence lookup and TR/EN parallel arrays stay correct.
            const seenLocalized = new Set<string>()
            const dedupedEntries: { originalIndex: number; localizedText: string }[] = []
            for (let idx = 0; idx < summary.insights.length; idx++) {
              const rawLocalized = summary.insights[idx]
              const normalized = rawLocalized
                .replace(/^[✓✔☑⚠💡❌]\s*/gu, '')
                .trim()
                .toLowerCase()
                .replace(/\s+/g, ' ')
              if (!seenLocalized.has(normalized)) {
                seenLocalized.add(normalized)
                dedupedEntries.push({ originalIndex: idx, localizedText: rawLocalized })
              }
            }
            const visible = insightsExpanded ? dedupedEntries : dedupedEntries.slice(0, 3)
            return visible.map(({ originalIndex, localizedText }, i) => {
              const displayText = localizedText.replace(/^[✓✔☑⚠💡❌]\s*/gu, '').trim()

              const originalInsight = summary.rawInsights[originalIndex]
              const originalInsightKey = originalInsight.trim().toLowerCase()
              const hasEvidence =
                policy.evidenceData?.insights && policy.evidenceData.insights[originalInsightKey]

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
                        quote={policy.evidenceData?.insights[originalInsightKey] ?? ''}
                        quoteTr={
                          policy.evidenceData?.quoteTranslations?.insights?.[originalInsightKey]
                        }
                      />
                    </div>
                  )}
                </div>
              )
            })
          })()}
          {(() => {
            // Compute deduped count using localized text (same logic as render dedup)
            const seenBtnL = new Set<string>()
            let dedupedCount = 0
            for (let idx = 0; idx < summary.insights.length; idx++) {
              const raw = summary.insights[idx]
              const n = raw
                .replace(/^[✓✔☑⚠💡❌]\s*/gu, '')
                .trim()
                .toLowerCase()
                .replace(/\s+/g, ' ')
              if (!seenBtnL.has(n)) {
                seenBtnL.add(n)
                dedupedCount++
              }
            }
            return dedupedCount > 3 ? (
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
                    <ChevronDown size={14} />+{dedupedCount - 3} {t.policy.moreInsights}
                  </>
                )}
              </button>
            ) : null
          })()}
        </div>
      </CardContent>
    </Card>
  )
}

// Desktop Evaluation
export function DesktopEvaluationCard(props: any) {
  const { evaluation, isEvaluationLoading, isUnverified, locale, t } = props
  /* Policy Evaluation */
  if (!evaluation || isEvaluationLoading) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BarChart3 className="text-blue-600" size={20} />
          {t.policy.policyEvaluation}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        /* Overall Score with Grade */
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="text-3xl font-bold text-gray-900">
              {isUnverified ? '-' : evaluation.overallScore}
            </div>
            <div className="text-sm text-gray-500">/100</div>
          </div>
          <div className="flex items-center gap-2">
            {isUnverified ? (
              <Badge variant="outline" className="text-gray-500 border-gray-300">
                {t.policy.draftStatus}
              </Badge>
            ) : (
              <GradeBadge
                grade={evaluation.grade}
                isProvisional={evaluation.isProvisional}
                size="md"
              />
            )}
            <StatusIndicator status={evaluation.status} showLabel size="sm" />
          </div>
        </div>
        /* Top Score Drivers — desktop */ /* Suppressed for unverified/draft policies to avoid
        leaking confident category scores */
        {!isUnverified &&
          (() => {
            const bd = evaluation.scoreBreakdown
            const cats = [
              {
                key: 'premium',
                score: bd.premium.score,
                weight: bd.premium.weight,
                label: locale === 'tr' ? 'Prim' : 'Premium',
              },
              {
                key: 'coverage',
                score: bd.coverage.score,
                weight: bd.coverage.weight,
                label: locale === 'tr' ? 'Teminat' : 'Coverage',
              },
              {
                key: 'deductible',
                score: bd.deductible.score,
                weight: bd.deductible.weight,
                label: locale === 'tr' ? 'Muafiyet' : 'Deductible',
              },
              {
                key: 'compliance',
                score: bd.compliance.score,
                weight: bd.compliance.weight,
                label: locale === 'tr' ? 'Uyum' : 'Compliance',
              },
              {
                key: 'value',
                score: bd.value.score,
                weight: bd.value.weight,
                label: locale === 'tr' ? 'Değer' : 'Value',
              },
            ].filter((c) => c.score >= 0)
            const sorted = [...cats].sort((a, b) => b.score * b.weight - a.score * a.weight)
            const topDriver = sorted[0]
            const topPenalty = [...cats].sort((a, b) => a.score - b.score)[0]
            const showPenalty =
              topPenalty && topPenalty.score < 70 && topPenalty.key !== topDriver?.key

            return (
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 mt-1">
                {topDriver && (
                  <span>
                    {locale === 'tr' ? 'En güçlü' : 'Strongest'}:{' '}
                    <span className="font-medium text-emerald-700">
                      {topDriver.label} ({topDriver.score})
                    </span>
                  </span>
                )}
                {showPenalty && (
                  <span>
                    {locale === 'tr' ? 'En zayıf' : 'Weakest'}:{' '}
                    <span className="font-medium text-amber-700">
                      {topPenalty.label} ({topPenalty.score})
                    </span>
                  </span>
                )}
              </div>
            )
          })()}
        /* Model disclosure — desktop */
        <p
          className="text-[10px] text-gray-400 italic leading-tight"
          data-testid="grade-model-disclosure"
        >
          {locale === 'tr'
            ? 'Bu derecelendirme mevcut iç model eşiklerine dayanmaktadır ve karşılaştırma kapsamı geliştikçe yeniden kalibre edilebilir.'
            : 'This rating is based on current internal model thresholds and may be recalibrated as benchmark coverage improves.'}
        </p>
        /* Score Breakdown */
        <div className="pt-2 border-t">
          <p className="text-sm font-medium text-gray-700 mb-2">{t.policy.scoreBreakdown}</p>
          <ScoreBreakdown breakdown={evaluation.scoreBreakdown} variant="full" />
        </div>
        /* Top Recommendations */
        {evaluation.recommendations.length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-sm font-medium text-gray-700 mb-2">{t.policy.recommendations}</p>
            <div className="space-y-2">
              {evaluation.recommendations.slice(0, 2).map((rec: any, i: number) => (
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
  )
}

// Desktop Insights
export function DesktopInsightsCard(props: any) {
  const { policy, summary, isPilotResult, displaySummary, locale, t } = props
  /* AI Insights */
  return (
    <Card className="bg-gradient-to-br from-purple-50 to-indigo-50 border-purple-200">
      {isPilotResult && (
        <div
          className="p-4 border-b-2 border-amber-400 bg-amber-50 rounded-t-lg"
          role="alert"
          aria-live="polite"
          data-testid="pilot-review-banner-desktop"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-semibold text-amber-800 text-sm">
                TASLAK / DRAFT — İnsan İncelemesi Gerekli / Human Review Required
              </p>
              <p className="text-xs text-amber-700 mt-1">
                {displaySummary?.pilotReviewBanner ||
                  (locale === 'tr'
                    ? 'Bu sonuçlar yapay zeka tarafından oluşturulmuştur. İnsan onayı olmadan kesinleşmiş değildir.'
                    : 'These results are AI-generated. Not finalized without human approval.')}
              </p>
              {displaySummary?.pilotReviewStatus && (
                <Badge className="mt-2 bg-amber-100 text-amber-800 border border-amber-300">
                  {displaySummary.pilotReviewStatus === 'pending_review'
                    ? locale === 'tr'
                      ? 'İnceleme Bekliyor'
                      : 'Pending Review'
                    : displaySummary.pilotReviewStatus === 'review_in_progress'
                      ? locale === 'tr'
                        ? 'İnceleniyor'
                        : 'Review In Progress'
                      : displaySummary.pilotReviewStatus}
                </Badge>
              )}
            </div>
          </div>
        </div>
      )}
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
          {summary.insights.map((insightText: string, i: number) => {
            const originalInsight = summary.rawInsights[i]
            const originalInsightKey = originalInsight.trim().toLowerCase()
            const hasEvidence =
              policy.evidenceData?.insights && policy.evidenceData.insights[originalInsightKey]
            return (
              <div key={i} className="p-3 bg-white/60 rounded-lg text-sm text-gray-700">
                <TruncatableText
                  text={insightText}
                  maxLength={150}
                  showFullTextTranslation={t.policy.showFullText}
                  showLessTranslation={t.common.showLess}
                />
                {hasEvidence && (
                  <EvidenceQuote quote={policy.evidenceData?.insights[originalInsightKey] ?? ''} />
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
