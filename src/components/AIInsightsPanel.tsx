/**
 * AI Insights Panel
 *
 * Displays comprehensive AI-powered policy analysis including:
 * - Multi-AI consensus results
 * - Knowledge base enrichment
 * - Market comparison
 * - Actionable recommendations
 * - Potential issues and clarifications needed
 */

import { useState } from 'react'
import {
  Brain,
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Lightbulb,
  BookOpen,
  Users,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Shield,
  Target,
  BarChart3,
  MessageCircle,
  Sparkles,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { useI18n } from '@/lib/i18n'
import { formatCurrency } from '@/lib/utils'
import type { AnalyzedPolicy } from '@/types/policy'

interface AIInsightsPanelProps {
  policy: AnalyzedPolicy
}

export function AIInsightsPanel({ policy }: AIInsightsPanelProps) {
  const { t, locale } = useI18n()
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['summary']))

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  const isExpanded = (section: string) => expandedSections.has(section)

  // Derive analysis quality from confidence
  const confidence = policy.aiConfidence ?? 0.85
  const qualityLevel =
    confidence >= 0.95
      ? 'excellent'
      : confidence >= 0.85
        ? 'good'
        : confidence >= 0.7
          ? 'fair'
          : 'needs_review'

  const qualityColors = {
    excellent: 'text-green-600 bg-green-50 border-green-200',
    good: 'text-blue-600 bg-blue-50 border-blue-200',
    fair: 'text-amber-600 bg-amber-50 border-amber-200',
    needs_review: 'text-red-600 bg-red-50 border-red-200',
  }

  const qualityLabelMap: Record<string, string> = {
    excellent: t.aiInsightsPanel.excellentAnalysis,
    good: t.aiInsightsPanel.goodAnalysis,
    fair: t.aiInsightsPanel.fairAnalysis,
    needs_review: t.aiInsightsPanel.needsReview,
  }

  const riskLevelMap: Record<string, string> = {
    very_low: t.aiInsightsPanel.veryLowRisk,
    low: t.aiInsightsPanel.lowRisk,
    moderate: t.aiInsightsPanel.moderateRisk,
    high: t.aiInsightsPanel.highRisk,
    very_high: t.aiInsightsPanel.veryHighRisk,
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Brain className="text-purple-600" size={20} />
            {t.aiInsightsPanel.title}
          </CardTitle>
          <Badge className={`${qualityColors[qualityLevel]} border`}>
            <Sparkles size={12} className="mr-1" />
            {Math.round(confidence * 100)}% {t.aiInsightsPanel.confidence}
          </Badge>
        </div>
        <p className="text-sm text-gray-600 mt-1">{t.aiInsightsPanel.description}</p>
      </CardHeader>

      <CardContent className="p-0">
        {/* Analysis Quality Summary */}
        <div
          className={`p-4 border-b ${qualityColors[qualityLevel].replace('text-', 'bg-').replace('-600', '-50')}`}
        >
          <div className="flex items-center gap-3">
            {qualityLevel === 'excellent' || qualityLevel === 'good' ? (
              <CheckCircle className="text-green-600" size={24} />
            ) : (
              <AlertTriangle className="text-amber-600" size={24} />
            )}
            <div>
              <p className="font-semibold text-gray-900">{qualityLabelMap[qualityLevel]}</p>
              <p className="text-sm text-gray-600">
                {t.aiInsightsPanel.detectedSummary
                  .replace('{coverages}', String(policy.coverages?.length ?? 0))
                  .replace('{exclusions}', String(policy.exclusions?.length ?? 0))}
              </p>
            </div>
          </div>
        </div>

        {/* Collapsible Sections */}
        <div className="divide-y">
          {/* Key Insights Section */}
          <CollapsibleSection
            id="summary"
            title={t.aiInsightsPanel.keyFindings}
            icon={<Target size={18} />}
            isExpanded={isExpanded('summary')}
            onToggle={() => toggleSection('summary')}
          >
            <div className="space-y-3">
              {/* Positive findings */}
              {policy.aiInsights
                ?.filter((i) => i.startsWith('✓'))
                .map((insight, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="text-green-600 mt-0.5 flex-shrink-0" size={16} />
                    <span className="text-gray-700">{insight.replace('✓ ', '')}</span>
                  </div>
                ))}

              {/* Warnings */}
              {policy.aiInsights
                ?.filter((i) => i.startsWith('⚠'))
                .map((insight, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm">
                    <AlertTriangle className="text-amber-600 mt-0.5 flex-shrink-0" size={16} />
                    <span className="text-gray-700">{insight.replace('⚠ ', '')}</span>
                  </div>
                ))}

              {/* Tips */}
              {policy.aiInsights
                ?.filter((i) => i.startsWith('💡'))
                .map((insight, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm">
                    <Lightbulb className="text-blue-600 mt-0.5 flex-shrink-0" size={16} />
                    <span className="text-gray-700">{insight.replace('💡 ', '')}</span>
                  </div>
                ))}
            </div>
          </CollapsibleSection>

          {/* Market Comparison Section */}
          {policy.marketComparison && (
            <CollapsibleSection
              id="market"
              title={t.aiInsightsPanel.marketComparison}
              icon={<BarChart3 size={18} />}
              isExpanded={isExpanded('market')}
              onToggle={() => toggleSection('market')}
            >
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 uppercase">
                      {t.aiInsightsPanel.yourPremium}
                    </p>
                    <p className="text-lg font-semibold text-gray-900">
                      {formatCurrency(policy.premium, 'TRY', locale)}
                    </p>
                    {policy.marketComparison.averagePremium && (
                      <p className="text-xs text-gray-500 mt-1">
                        {t.aiInsightsPanel.marketAvg}{' '}
                        {formatCurrency(policy.marketComparison.averagePremium, 'TRY', locale)}
                      </p>
                    )}
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 uppercase">
                      {t.aiInsightsPanel.marketRank}
                    </p>
                    <div className="flex items-center gap-2">
                      <p className="text-lg font-semibold text-gray-900">
                        {policy.marketComparison.percentile ?? 50}%
                      </p>
                      {(policy.marketComparison.percentile ?? 50) > 50 ? (
                        <TrendingUp className="text-amber-600" size={18} />
                      ) : (
                        <TrendingDown className="text-green-600" size={18} />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {(policy.marketComparison.percentile ?? 50) > 50
                        ? t.aiInsightsPanel.aboveMarket.replace('{percent}', '')
                        : t.aiInsightsPanel.belowMarket.replace('{percent}', '')}
                    </p>
                  </div>
                </div>

                {/* Premium position bar */}
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{t.aiInsightsPanel.lowest}</span>
                    <span>{t.aiInsightsPanel.highest}</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div
                    className="relative"
                    style={{ marginLeft: `${policy.marketComparison.percentile ?? 50}%` }}
                  >
                    <div className="absolute -top-4 -ml-1">
                      <div className="w-2 h-2 bg-gray-900 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* Risk Assessment Section */}
          {policy.riskScore && (
            <CollapsibleSection
              id="risk"
              title={t.aiInsightsPanel.riskAssessment}
              icon={<Shield size={18} />}
              isExpanded={isExpanded('risk')}
              onToggle={() => toggleSection('risk')}
            >
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <div
                    className={`w-16 h-16 rounded-full flex items-center justify-center text-xl font-bold ${
                      policy.riskScore.level === 'very_low' || policy.riskScore.level === 'low'
                        ? 'bg-green-100 text-green-700'
                        : policy.riskScore.level === 'moderate'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-red-100 text-red-700'
                    }`}
                  >
                    {policy.riskScore.overall}
                  </div>
                  <div>
                    <p className="font-semibold text-gray-900">
                      {riskLevelMap[policy.riskScore.level]}
                    </p>
                    {policy.riskScore.topIssue && (
                      <p className="text-sm text-gray-600">
                        {t.aiInsightsPanel.topIssue} {policy.riskScore.topIssue}
                      </p>
                    )}
                  </div>
                </div>

                {/* Risk actions */}
                {policy.riskActions && policy.riskActions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">
                      {t.aiInsightsPanel.recommendedActions}
                    </p>
                    {policy.riskActions.map((action, idx) => (
                      <div
                        key={idx}
                        className={`p-2 rounded-lg text-sm flex items-start gap-2 ${
                          action.priority === 'critical'
                            ? 'bg-red-50 text-red-700'
                            : action.priority === 'high'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-blue-50 text-blue-700'
                        }`}
                      >
                        <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                        <span>{action.action}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}

          {/* Gap Analysis Section */}
          {policy.gapAnalysis && (
            <CollapsibleSection
              id="gaps"
              title={t.aiInsightsPanel.gapAnalysis}
              icon={<HelpCircle size={18} />}
              isExpanded={isExpanded('gaps')}
              onToggle={() => toggleSection('gaps')}
              badge={
                policy.gapAnalysis.criticalCount > 0 ? (
                  <Badge variant="destructive">
                    {policy.gapAnalysis.criticalCount} {t.aiInsightsPanel.critical}
                  </Badge>
                ) : undefined
              }
            >
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-red-50 rounded-lg">
                    <p className="text-2xl font-bold text-red-700">
                      {policy.gapAnalysis.criticalCount}
                    </p>
                    <p className="text-xs text-red-600">{t.aiInsightsPanel.critical}</p>
                  </div>
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <p className="text-2xl font-bold text-amber-700">
                      {policy.gapAnalysis.highCount}
                    </p>
                    <p className="text-xs text-amber-600">{t.aiInsightsPanel.high}</p>
                  </div>
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <p className="text-2xl font-bold text-blue-700">
                      {policy.gapAnalysis.totalCount -
                        policy.gapAnalysis.criticalCount -
                        policy.gapAnalysis.highCount}
                    </p>
                    <p className="text-xs text-blue-600">{t.aiInsightsPanel.other}</p>
                  </div>
                </div>

                {policy.gapAnalysis.topIssue && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm font-medium text-amber-800">{t.aiInsightsPanel.topGap}</p>
                    <p className="text-sm text-amber-700">
                      {locale === 'tr'
                        ? policy.gapAnalysis.topIssueTr || policy.gapAnalysis.topIssue
                        : policy.gapAnalysis.topIssue}
                    </p>
                  </div>
                )}

                {policy.gapAnalysis.financialExposure > 0 && (
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">
                        {t.aiInsightsPanel.financialExposure}
                      </span>
                      <span className="font-semibold text-gray-900">
                        {formatCurrency(policy.gapAnalysis.financialExposure, 'TRY', locale)}
                      </span>
                    </div>
                    {policy.gapAnalysis.remediationCost > 0 && (
                      <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200">
                        <span className="text-sm text-gray-600">
                          {t.aiInsightsPanel.remediationCost}
                        </span>
                        <span className="font-semibold text-green-700">
                          {formatCurrency(policy.gapAnalysis.remediationCost, 'TRY', locale)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CollapsibleSection>
          )}

          {/* Knowledge Base References */}
          <CollapsibleSection
            id="knowledge"
            title={t.aiInsightsPanel.knowledgeReferences}
            icon={<BookOpen size={18} />}
            isExpanded={isExpanded('knowledge')}
            onToggle={() => toggleSection('knowledge')}
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Users size={16} />
                <span>{t.aiInsightsPanel.seddkTsb}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <BarChart3 size={16} />
                <span>{t.aiInsightsPanel.marketData}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Shield size={16} />
                <span>{t.aiInsightsPanel.generalConditions}</span>
              </div>
            </div>
          </CollapsibleSection>
        </div>

        {/* Action Footer */}
        <div className="p-4 bg-gray-50 border-t">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MessageCircle size={16} />
              <span>{t.aiInsightsPanel.haveQuestions}</span>
            </div>
            <Button variant="outline" size="sm" onClick={() => (window.location.href = '/chat')}>
              {t.aiInsightsPanel.chatWithAI}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

interface CollapsibleSectionProps {
  id: string
  title: string
  icon: React.ReactNode
  isExpanded: boolean
  onToggle: () => void
  badge?: React.ReactNode
  children: React.ReactNode
}

function CollapsibleSection({
  id,
  title,
  icon,
  isExpanded,
  onToggle,
  badge,
  children,
}: CollapsibleSectionProps) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
        aria-expanded={isExpanded}
        aria-controls={`section-${id}`}
      >
        <div className="flex items-center gap-3">
          <span className="text-gray-600">{icon}</span>
          <span className="font-medium text-gray-900">{title}</span>
          {badge}
        </div>
        {isExpanded ? (
          <ChevronUp className="text-gray-400" size={18} />
        ) : (
          <ChevronDown className="text-gray-400" size={18} />
        )}
      </button>
      {isExpanded && (
        <div id={`section-${id}`} className="px-4 pb-4">
          {children}
        </div>
      )}
    </div>
  )
}
