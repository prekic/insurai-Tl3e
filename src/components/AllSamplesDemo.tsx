import { useState } from 'react'
import {
  Eye,
  EyeOff,
  FileText,
  Shield,
  AlertTriangle,
  MapPin,
  User,
  Calendar,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { samplePolicies } from '@/data/sample-policies'
import { useI18n } from '@/lib/i18n'
import { useDisplayCurrency } from '@/hooks/useDisplayCurrency'

// Translate AI insight string using the i18n insightTranslations map
function translateInsight(
  insight: string,
  locale: string,
  insightTranslations: Record<string, string>
): string {
  if (locale === 'en') return insight

  // Strip emoji prefix if present
  const prefixMatch = insight.match(/^([✓✔☑⚠💡❌]\s*)/u)
  const prefix = prefixMatch ? prefixMatch[1] : ''
  const text = prefix ? insight.slice(prefix.length).trim() : insight

  // Exact match
  if (insightTranslations[text] && insightTranslations[text] !== text) {
    return prefix ? `${prefix}${insightTranslations[text]}` : insightTranslations[text]
  }

  return insight
}

export function AllSamplesDemo() {
  const { t, locale } = useI18n()
  const { formatConverted } = useDisplayCurrency()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">{t.landing.samplePoliciesTitle}</h1>
          <p className="text-gray-600 mt-1">{t.landing.samplePoliciesDesc}</p>
        </div>

        {/* Policy Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {samplePolicies.map((policy) => {
            const isExpanded = expandedId === policy.id
            return (
              <Card key={policy.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{policy.logo}</span>
                      <div>
                        <CardTitle className="text-lg">{policy.provider}</CardTitle>
                        <p className="text-sm text-gray-500">{policy.policyNumber}</p>
                      </div>
                    </div>
                    <Badge variant={policy.status === 'active' ? 'success' : 'warning'}>
                      {policy.status === 'active'
                        ? t.policy.active
                        : policy.status === 'expiring'
                          ? t.policy.expiring
                          : policy.status === 'expired'
                            ? t.policy.expired
                            : t.policy.pending}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 text-gray-600">
                      <FileText size={16} />
                      <span className="font-medium">{policy.typeTr}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-500">{t.policy.coverage}</p>
                        <p className="font-semibold text-gray-900">
                          {formatConverted(policy.coverage)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-500">{t.policy.premium}</p>
                        <p className="font-semibold text-gray-900">
                          {formatConverted(policy.premium)}
                          {t.policy.perYear}
                        </p>
                      </div>
                    </div>

                    {/* AI Insights - translated */}
                    <div className="pt-4 border-t border-gray-100">
                      <p className="text-sm text-gray-500 mb-2">{t.insights.aiInsights}</p>
                      <div className="space-y-1">
                        {policy.aiInsights
                          .slice(0, isExpanded ? undefined : 2)
                          .map((insight, i) => (
                            <p key={i} className="text-sm text-gray-600">
                              • {translateInsight(insight, locale, t.insightTranslations)}
                            </p>
                          ))}
                      </div>
                    </div>

                    {/* Expanded Detail View */}
                    {isExpanded && (
                      <div className="space-y-4 pt-4 border-t border-gray-100 animate-in fade-in slide-in-from-top-2 duration-200">
                        {/* Key Info Row */}
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="flex items-center gap-2 text-gray-600">
                            <User size={14} />
                            <span>
                              <span className="text-gray-400">{t.policy.insuredPerson}:</span>{' '}
                              {policy.insuredPerson}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-600">
                            <MapPin size={14} />
                            <span>
                              <span className="text-gray-400">{t.policy.location}:</span>{' '}
                              {policy.location}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-600">
                            <Calendar size={14} />
                            <span>
                              <span className="text-gray-400">{t.policy.period}:</span>{' '}
                              {policy.startDate} — {policy.expiryDate}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-gray-600">
                            <Shield size={14} />
                            <span>
                              <span className="text-gray-400">{t.policy.deductible}:</span>{' '}
                              {formatConverted(policy.deductible)}
                            </span>
                          </div>
                        </div>

                        {/* AI Confidence */}
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-500">{t.policy.confidence}:</span>
                          <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[200px]">
                            <div
                              className="bg-green-500 h-2 rounded-full"
                              style={{ width: `${policy.aiConfidence * 100}%` }}
                            />
                          </div>
                          <span className="text-sm font-medium text-green-600">
                            {Math.round(policy.aiConfidence * 100)}%
                          </span>
                        </div>

                        {/* Coverages */}
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                            <Shield size={14} />
                            {t.policy.coverageDetails}
                          </h4>
                          <div className="space-y-1.5">
                            {policy.coverages.map((cov, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-1.5"
                              >
                                <span className="text-gray-700">
                                  {locale === 'tr' && cov.nameTr ? cov.nameTr : cov.name}
                                </span>
                                <div className="flex items-center gap-3">
                                  {cov.included ? (
                                    <>
                                      <span className="text-gray-900 font-medium">
                                        {formatConverted(cov.limit)}
                                      </span>
                                      {cov.deductible > 0 && (
                                        <span className="text-xs text-gray-400">
                                          ({t.policy.deductible}: {formatConverted(cov.deductible)})
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    <span className="text-red-400 text-xs">
                                      {t.policy.notIncluded}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Exclusions */}
                        {policy.exclusions.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-2 flex items-center gap-1">
                              <AlertTriangle size={14} />
                              {t.policy.exclusions}
                            </h4>
                            <ul className="space-y-1">
                              {policy.exclusions.map((ex, i) => (
                                <li
                                  key={i}
                                  className="text-sm text-red-600 flex items-start gap-1.5"
                                >
                                  <span className="mt-0.5">✕</span>
                                  <span>{ex}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* Special Conditions */}
                        {policy.specialConditions && policy.specialConditions.length > 0 && (
                          <div>
                            <h4 className="text-sm font-semibold text-gray-700 mb-2">
                              {t.policy.specialConditions}
                            </h4>
                            <ul className="space-y-1">
                              {policy.specialConditions.map((cond, i) => (
                                <li
                                  key={i}
                                  className="text-sm text-amber-700 flex items-start gap-1.5"
                                >
                                  <span className="mt-0.5">⚠</span>
                                  <span>{cond}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Toggle Button */}
                    <Button
                      variant="outline"
                      className="w-full gap-2"
                      onClick={() => toggleExpand(policy.id)}
                    >
                      {isExpanded ? (
                        <>
                          <EyeOff size={16} />
                          {t.policy.hideDetails}
                          <ChevronUp size={14} />
                        </>
                      ) : (
                        <>
                          <Eye size={16} />
                          {t.policy.viewDetails}
                          <ChevronDown size={14} />
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}
