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
import type { AnalyzedPolicy } from '@/types/policy'

interface AIInsightsPanelProps {
  policy: AnalyzedPolicy
  locale?: string
}

export function AIInsightsPanel({ policy, locale = 'tr' }: AIInsightsPanelProps) {
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
    confidence >= 0.95 ? 'excellent' : confidence >= 0.85 ? 'good' : confidence >= 0.7 ? 'fair' : 'needs_review'

  const qualityColors = {
    excellent: 'text-green-600 bg-green-50 border-green-200',
    good: 'text-blue-600 bg-blue-50 border-blue-200',
    fair: 'text-amber-600 bg-amber-50 border-amber-200',
    needs_review: 'text-red-600 bg-red-50 border-red-200',
  }

  const qualityLabels = {
    excellent: { en: 'Excellent Analysis', tr: 'Mükemmel Analiz' },
    good: { en: 'Good Analysis', tr: 'İyi Analiz' },
    fair: { en: 'Fair Analysis', tr: 'Orta Analiz' },
    needs_review: { en: 'Needs Review', tr: 'İnceleme Gerekli' },
  }

  return (
    <Card className="overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50 border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Brain className="text-purple-600" size={20} />
            {locale === 'tr' ? 'Yapay Zeka Analizi' : 'AI Analysis'}
          </CardTitle>
          <Badge className={`${qualityColors[qualityLevel]} border`}>
            <Sparkles size={12} className="mr-1" />
            {Math.round(confidence * 100)}% {locale === 'tr' ? 'Güven' : 'Confidence'}
          </Badge>
        </div>
        <p className="text-sm text-gray-600 mt-1">
          {locale === 'tr'
            ? 'Poliçenizin kapsamlı yapay zeka analizi'
            : 'Comprehensive AI analysis of your policy'}
        </p>
      </CardHeader>

      <CardContent className="p-0">
        {/* Analysis Quality Summary */}
        <div className={`p-4 border-b ${qualityColors[qualityLevel].replace('text-', 'bg-').replace('-600', '-50')}`}>
          <div className="flex items-center gap-3">
            {qualityLevel === 'excellent' || qualityLevel === 'good' ? (
              <CheckCircle className="text-green-600" size={24} />
            ) : (
              <AlertTriangle className="text-amber-600" size={24} />
            )}
            <div>
              <p className="font-semibold text-gray-900">
                {qualityLabels[qualityLevel][locale === 'tr' ? 'tr' : 'en']}
              </p>
              <p className="text-sm text-gray-600">
                {locale === 'tr'
                  ? `${policy.coverages?.length || 0} teminat, ${policy.exclusions?.length || 0} istisna tespit edildi`
                  : `${policy.coverages?.length || 0} coverages, ${policy.exclusions?.length || 0} exclusions detected`}
              </p>
            </div>
          </div>
        </div>

        {/* Collapsible Sections */}
        <div className="divide-y">
          {/* Key Insights Section */}
          <CollapsibleSection
            id="summary"
            title={locale === 'tr' ? 'Önemli Bulgular' : 'Key Findings'}
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
              title={locale === 'tr' ? 'Piyasa Karşılaştırması' : 'Market Comparison'}
              icon={<BarChart3 size={18} />}
              isExpanded={isExpanded('market')}
              onToggle={() => toggleSection('market')}
            >
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 uppercase">
                      {locale === 'tr' ? 'Priminiz' : 'Your Premium'}
                    </p>
                    <p className="text-lg font-semibold text-gray-900">
                      ₺{policy.premium.toLocaleString('tr-TR')}
                    </p>
                    {policy.marketComparison.averagePremium && (
                      <p className="text-xs text-gray-500 mt-1">
                        {locale === 'tr' ? 'Piyasa Ort:' : 'Market Avg:'} ₺
                        {policy.marketComparison.averagePremium.toLocaleString('tr-TR')}
                      </p>
                    )}
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500 uppercase">
                      {locale === 'tr' ? 'Piyasa Sıralaması' : 'Market Rank'}
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
                        ? locale === 'tr'
                          ? 'Piyasa ortalamasının üzerinde'
                          : 'Above market average'
                        : locale === 'tr'
                          ? 'Piyasa ortalamasının altında'
                          : 'Below market average'}
                    </p>
                  </div>
                </div>

                {/* Premium position bar */}
                <div>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{locale === 'tr' ? 'En Düşük' : 'Lowest'}</span>
                    <span>{locale === 'tr' ? 'En Yüksek' : 'Highest'}</span>
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
              title={locale === 'tr' ? 'Risk Değerlendirmesi' : 'Risk Assessment'}
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
                      {locale === 'tr'
                        ? {
                            very_low: 'Çok Düşük Risk',
                            low: 'Düşük Risk',
                            moderate: 'Orta Risk',
                            high: 'Yüksek Risk',
                            very_high: 'Çok Yüksek Risk',
                          }[policy.riskScore.level]
                        : {
                            very_low: 'Very Low Risk',
                            low: 'Low Risk',
                            moderate: 'Moderate Risk',
                            high: 'High Risk',
                            very_high: 'Very High Risk',
                          }[policy.riskScore.level]}
                    </p>
                    {policy.riskScore.topIssue && (
                      <p className="text-sm text-gray-600">
                        {locale === 'tr' ? 'Ana Konu: ' : 'Top Issue: '}
                        {policy.riskScore.topIssue}
                      </p>
                    )}
                  </div>
                </div>

                {/* Risk actions */}
                {policy.riskActions && policy.riskActions.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700">
                      {locale === 'tr' ? 'Önerilen Aksiyonlar:' : 'Recommended Actions:'}
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
              title={locale === 'tr' ? 'Eksiklik Analizi' : 'Gap Analysis'}
              icon={<HelpCircle size={18} />}
              isExpanded={isExpanded('gaps')}
              onToggle={() => toggleSection('gaps')}
              badge={
                policy.gapAnalysis.criticalCount > 0 ? (
                  <Badge variant="destructive">{policy.gapAnalysis.criticalCount} Kritik</Badge>
                ) : undefined
              }
            >
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2 bg-red-50 rounded-lg">
                    <p className="text-2xl font-bold text-red-700">
                      {policy.gapAnalysis.criticalCount}
                    </p>
                    <p className="text-xs text-red-600">
                      {locale === 'tr' ? 'Kritik' : 'Critical'}
                    </p>
                  </div>
                  <div className="p-2 bg-amber-50 rounded-lg">
                    <p className="text-2xl font-bold text-amber-700">
                      {policy.gapAnalysis.highCount}
                    </p>
                    <p className="text-xs text-amber-600">
                      {locale === 'tr' ? 'Yüksek' : 'High'}
                    </p>
                  </div>
                  <div className="p-2 bg-blue-50 rounded-lg">
                    <p className="text-2xl font-bold text-blue-700">
                      {policy.gapAnalysis.totalCount -
                        policy.gapAnalysis.criticalCount -
                        policy.gapAnalysis.highCount}
                    </p>
                    <p className="text-xs text-blue-600">
                      {locale === 'tr' ? 'Diğer' : 'Other'}
                    </p>
                  </div>
                </div>

                {policy.gapAnalysis.topIssue && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
                    <p className="text-sm font-medium text-amber-800">
                      {locale === 'tr' ? 'En Önemli Eksiklik:' : 'Top Gap:'}
                    </p>
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
                        {locale === 'tr' ? 'Potansiyel Finansal Risk:' : 'Potential Financial Exposure:'}
                      </span>
                      <span className="font-semibold text-gray-900">
                        ₺{policy.gapAnalysis.financialExposure.toLocaleString('tr-TR')}
                      </span>
                    </div>
                    {policy.gapAnalysis.remediationCost > 0 && (
                      <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-200">
                        <span className="text-sm text-gray-600">
                          {locale === 'tr' ? 'Tahmini Düzeltme Maliyeti:' : 'Est. Remediation Cost:'}
                        </span>
                        <span className="font-semibold text-green-700">
                          ₺{policy.gapAnalysis.remediationCost.toLocaleString('tr-TR')}
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
            title={locale === 'tr' ? 'Bilgi Kaynakları' : 'Knowledge References'}
            icon={<BookOpen size={18} />}
            isExpanded={isExpanded('knowledge')}
            onToggle={() => toggleSection('knowledge')}
          >
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Users size={16} />
                <span>
                  {locale === 'tr'
                    ? 'SEDDK ve TSB düzenlemeleri referans alındı'
                    : 'SEDDK and TSB regulations referenced'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <BarChart3 size={16} />
                <span>
                  {locale === 'tr'
                    ? '2025 piyasa verileri ile karşılaştırıldı'
                    : 'Compared with 2025 market data'}
                </span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600">
                <Shield size={16} />
                <span>
                  {locale === 'tr'
                    ? `${policy.type === 'kasko' ? 'Kasko' : policy.typeTr} Genel Şartları uygulandı`
                    : `${policy.type === 'kasko' ? 'Kasko' : policy.typeTr} General Conditions applied`}
                </span>
              </div>
            </div>
          </CollapsibleSection>
        </div>

        {/* Action Footer */}
        <div className="p-4 bg-gray-50 border-t">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <MessageCircle size={16} />
              <span>
                {locale === 'tr' ? 'Sorularınız mı var?' : 'Have questions?'}
              </span>
            </div>
            <Button variant="outline" size="sm" onClick={() => window.location.href = '/chat'}>
              {locale === 'tr' ? 'AI ile Sohbet Et' : 'Chat with AI'}
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
