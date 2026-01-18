/**
 * Analytics Tab
 * Usage analytics and cost tracking
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Users,
  FileText,
  Brain,
} from 'lucide-react'

export function AnalyticsTab() {
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('week')
  const [analytics] = useState({
    keyMetrics: {
      totalUsers: 150,
      activeUsers: 45,
      newUsers: 12,
      totalPolicies: 1250,
      policiesUploaded: 89,
      aiRequests: 456,
      totalCost: 125.50,
    },
    trends: {
      userGrowth: 15.5,
      policyGrowth: 8.2,
      aiUsageGrowth: 22.3,
      costGrowth: -5.2,
    },
    topPolicyTypes: [
      { type: 'Kasko', count: 450, percentage: 36 },
      { type: 'Traffic', count: 380, percentage: 30 },
      { type: 'Health', count: 220, percentage: 18 },
      { type: 'Home', count: 120, percentage: 10 },
      { type: 'Other', count: 80, percentage: 6 },
    ],
    topProviders: [
      { provider: 'Allianz', count: 280, avgRating: 4.2 },
      { provider: 'AXA', count: 240, avgRating: 4.0 },
      { provider: 'Anadolu', count: 200, avgRating: 4.3 },
      { provider: 'Aksigorta', count: 180, avgRating: 4.1 },
      { provider: 'Mapfre', count: 150, avgRating: 3.9 },
    ],
    costBreakdown: {
      byProvider: {
        openai: 95.20,
        anthropic: 28.50,
        google: 1.80,
      },
      byOperation: {
        extraction: 85.30,
        chat: 35.40,
        ocr: 4.80,
      },
    },
  })

  const getTrendIcon = (value: number) => {
    if (value > 0) return <TrendingUp className="h-4 w-4 text-green-500" />
    if (value < 0) return <TrendingDown className="h-4 w-4 text-red-500" />
    return null
  }

  const getTrendColor = (value: number, inverse = false) => {
    const isPositive = inverse ? value < 0 : value > 0
    return isPositive ? 'text-green-600' : value === 0 ? 'text-gray-600' : 'text-red-600'
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
          <p className="text-gray-500">Usage statistics and cost analysis</p>
        </div>
        <div className="flex gap-2">
          {(['day', 'week', 'month'] as const).map((p) => (
            <Button
              key={p}
              variant={period === p ? 'default' : 'outline'}
              size="sm"
              onClick={() => setPeriod(p)}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Active Users</p>
                <p className="text-2xl font-bold">{analytics.keyMetrics.activeUsers}</p>
                <div className="flex items-center gap-1 mt-1">
                  {getTrendIcon(analytics.trends.userGrowth)}
                  <span className={`text-sm ${getTrendColor(analytics.trends.userGrowth)}`}>
                    {analytics.trends.userGrowth > 0 ? '+' : ''}
                    {analytics.trends.userGrowth}%
                  </span>
                </div>
              </div>
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Policies Uploaded</p>
                <p className="text-2xl font-bold">{analytics.keyMetrics.policiesUploaded}</p>
                <div className="flex items-center gap-1 mt-1">
                  {getTrendIcon(analytics.trends.policyGrowth)}
                  <span className={`text-sm ${getTrendColor(analytics.trends.policyGrowth)}`}>
                    {analytics.trends.policyGrowth > 0 ? '+' : ''}
                    {analytics.trends.policyGrowth}%
                  </span>
                </div>
              </div>
              <div className="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center">
                <FileText className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">AI Requests</p>
                <p className="text-2xl font-bold">{analytics.keyMetrics.aiRequests}</p>
                <div className="flex items-center gap-1 mt-1">
                  {getTrendIcon(analytics.trends.aiUsageGrowth)}
                  <span className={`text-sm ${getTrendColor(analytics.trends.aiUsageGrowth)}`}>
                    {analytics.trends.aiUsageGrowth > 0 ? '+' : ''}
                    {analytics.trends.aiUsageGrowth}%
                  </span>
                </div>
              </div>
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                <Brain className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">Total Cost</p>
                <p className="text-2xl font-bold">${analytics.keyMetrics.totalCost.toFixed(2)}</p>
                <div className="flex items-center gap-1 mt-1">
                  {getTrendIcon(analytics.trends.costGrowth)}
                  <span className={`text-sm ${getTrendColor(analytics.trends.costGrowth, true)}`}>
                    {analytics.trends.costGrowth > 0 ? '+' : ''}
                    {analytics.trends.costGrowth}%
                  </span>
                </div>
              </div>
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <DollarSign className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Policy Types */}
        <Card>
          <CardHeader>
            <CardTitle>Policy Types Distribution</CardTitle>
            <CardDescription>Breakdown by insurance type</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analytics.topPolicyTypes.map((type) => (
                <div key={type.type}>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="font-medium">{type.type}</span>
                    <span className="text-gray-500">{type.count} ({type.percentage}%)</span>
                  </div>
                  <Progress value={type.percentage} className="h-2" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Insurance Providers */}
        <Card>
          <CardHeader>
            <CardTitle>Top Insurance Providers</CardTitle>
            <CardDescription>Most uploaded policy providers</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {analytics.topProviders.map((provider, index) => (
                <div
                  key={provider.provider}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-sm font-medium text-blue-600">
                      {index + 1}
                    </span>
                    <span className="font-medium">{provider.provider}</span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-500">{provider.count} policies</span>
                    <Badge variant="outline">★ {provider.avgRating.toFixed(1)}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Cost Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="h-5 w-5" />
            Cost Breakdown
          </CardTitle>
          <CardDescription>AI costs by provider and operation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* By Provider */}
            <div>
              <h4 className="font-medium mb-4">By Provider</h4>
              <div className="space-y-3">
                {Object.entries(analytics.costBreakdown.byProvider).map(([provider, cost]) => {
                  const total = Object.values(analytics.costBreakdown.byProvider).reduce((a, b) => a + b, 0)
                  const percentage = (cost / total) * 100

                  return (
                    <div key={provider}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="capitalize">{provider}</span>
                        <span className="font-medium">${cost.toFixed(2)}</span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  )
                })}
              </div>
            </div>

            {/* By Operation */}
            <div>
              <h4 className="font-medium mb-4">By Operation</h4>
              <div className="space-y-3">
                {Object.entries(analytics.costBreakdown.byOperation).map(([operation, cost]) => {
                  const total = Object.values(analytics.costBreakdown.byOperation).reduce((a, b) => a + b, 0)
                  const percentage = (cost / total) * 100

                  return (
                    <div key={operation}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="capitalize">{operation}</span>
                        <span className="font-medium">${cost.toFixed(2)}</span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default AnalyticsTab
