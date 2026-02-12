import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Eye, FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { samplePolicies } from '@/data/sample-policies'
import { formatCurrency } from '@/lib/utils'
import { useI18n } from '@/lib/i18n'

export function AllSamplesDemo() {
  const navigate = useNavigate()
  const { t } = useI18n()

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => navigate(-1)} className="p-2 hover:bg-white rounded-lg transition-colors">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t.landing.samplePoliciesTitle}</h1>
            <p className="text-gray-600">{t.landing.samplePoliciesDesc}</p>
          </div>
        </div>

        {/* Policy Grid */}
        <div className="grid md:grid-cols-2 gap-6">
          {samplePolicies.map((policy) => (
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
                    {policy.status === 'active' ? t.policy.active : policy.status === 'expiring' ? t.policy.expiring : policy.status === 'expired' ? t.policy.expired : t.policy.pending}
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
                      <p className="font-semibold text-gray-900">{formatCurrency(policy.coverage)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">{t.policy.premium}</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(policy.premium)}{t.policy.perYear}</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100">
                    <p className="text-sm text-gray-500 mb-2">{t.insights.aiInsights}</p>
                    <div className="space-y-1">
                      {policy.aiInsights.slice(0, 2).map((insight, i) => (
                        <p key={i} className="text-sm text-gray-600">• {insight}</p>
                      ))}
                    </div>
                  </div>

                  <Button variant="outline" className="w-full gap-2">
                    <Eye size={16} />
                    {t.policy.viewDetails}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  )
}
