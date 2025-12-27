import { ArrowLeft, Eye, FileText } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { samplePolicies } from '@/data/sample-policies'
import { formatCurrency } from '@/lib/utils'

interface AllSamplesDemoProps {
  onBack: () => void
}

export function AllSamplesDemo({ onBack }: AllSamplesDemoProps) {
  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <button onClick={onBack} className="p-2 hover:bg-white rounded-lg transition-colors">
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Sample Policies Collection</h1>
            <p className="text-gray-600">Explore Turkish insurance policy samples analyzed by InsurAI</p>
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
                    {policy.status}
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
                      <p className="text-sm text-gray-500">Coverage</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(policy.coverage)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">Premium</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(policy.premium)}/yr</p>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-gray-100">
                    <p className="text-sm text-gray-500 mb-2">AI Insights</p>
                    <div className="space-y-1">
                      {policy.aiInsights.slice(0, 2).map((insight, i) => (
                        <p key={i} className="text-sm text-gray-600">• {insight}</p>
                      ))}
                    </div>
                  </div>

                  <Button variant="outline" className="w-full gap-2">
                    <Eye size={16} />
                    View Details
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
