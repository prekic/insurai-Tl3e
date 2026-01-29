/**
 * OCR Dashboard Tab
 *
 * Comprehensive OCR cleanup monitoring dashboard showing:
 * - Confidence score distributions
 * - QA gate statistics
 * - Pattern learning insights
 * - Processing trends
 */

import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import {
  Eye,
  Zap,
  AlertTriangle,
  CheckCircle,
  XCircle,
  TrendingUp,
  TrendingDown,
  Clock,
  FileText,
  RefreshCw,
  Download,
  Search,
} from 'lucide-react'
import type { OCRDashboardData, OCRAggregatedStats, OCRExecution } from '@/lib/pipeline/ocr-stats'
import type { ConfidenceGrade } from '@/lib/pipeline/ocr-confidence'
import type { PatternStats } from '@/lib/pipeline/pattern-store'

// Mock data generator for demo (replace with real API calls)
function generateMockData(): OCRDashboardData {
  const now = new Date()

  const mockStats: OCRAggregatedStats = {
    period: 'day',
    periodStart: new Date(now.setHours(0, 0, 0, 0)).toISOString(),
    periodEnd: new Date(now.setHours(23, 59, 59, 999)).toISOString(),
    totalExecutions: 156,
    successfulExecutions: 142,
    failedExecutions: 14,
    successRate: 0.91,
    avgDuration: 2340,
    minDuration: 450,
    maxDuration: 8200,
    totalCharsProcessed: 2456000,
    totalCharsOutput: 1842000,
    avgReductionPercent: 25,
    confidenceStats: {
      average: 82.5,
      min: 45,
      max: 98,
      gradeDistribution: { A: 45, B: 62, C: 35, D: 10, F: 4 },
      statusDistribution: { excellent: 45, good: 62, fair: 35, poor: 10, critical: 4 },
    },
    qaStats: {
      totalChunks: 468,
      chunksPassedFirstTry: 392,
      chunksPassedAfterRetry: 58,
      chunksFailed: 18,
      firstTryPassRate: 0.838,
      overallPassRate: 0.962,
    },
    sanitizerStats: {
      totalLinesRemoved: 2340,
      totalGarbageLinesRemoved: 890,
      totalFragmentsMerged: 456,
      totalControlCharsRemoved: 234,
      avgLinesRemovedPerDoc: 15,
    },
    patternStats: {
      totalPatternsDetected: 234,
      newPatternsLearned: 12,
      avgPatternsPerDoc: 1.5,
    },
    byPipelineType: { full: 78, standard: 65, quick: 13 },
  }

  const previousStats: OCRAggregatedStats = {
    ...mockStats,
    totalExecutions: 145,
    successfulExecutions: 128,
    successRate: 0.88,
    avgDuration: 2580,
    confidenceStats: {
      ...mockStats.confidenceStats,
      average: 79.2,
    },
  }

  const mockPatternStats: PatternStats = {
    totalPatterns: 89,
    byType: {
      barcode: 23,
      control_char: 12,
      spaced_fragment: 34,
      garbage_line: 8,
      high_ascii: 7,
      special_cluster: 3,
      repetitive: 2,
      unknown: 0,
    },
    byCategory: {
      scanner_artifact: 26,
      ocr_error: 34,
      encoding_issue: 19,
      document_noise: 8,
      watermark: 2,
      other: 0,
    },
    topPatterns: [],
    promotedCount: 15,
    averageConfidence: 0.72,
    totalOccurrences: 456,
    totalFailures: 89,
  }

  const mockExecutions: OCRExecution[] = Array.from({ length: 10 }, (_, i) => ({
    id: `exec_${i}`,
    documentId: `doc_${Math.random().toString(36).slice(2, 8)}`,
    userId: `user_${Math.floor(Math.random() * 5) + 1}`,
    pipelineType: ['full', 'standard', 'quick'][Math.floor(Math.random() * 3)] as 'full' | 'standard' | 'quick',
    startedAt: new Date(Date.now() - Math.random() * 3600000).toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: Math.floor(Math.random() * 5000) + 500,
    success: Math.random() > 0.1,
    inputSize: Math.floor(Math.random() * 50000) + 5000,
    outputSize: Math.floor(Math.random() * 40000) + 4000,
    reductionPercent: Math.floor(Math.random() * 40) + 10,
    totalChunks: Math.floor(Math.random() * 5) + 1,
    chunksPassedQA: Math.floor(Math.random() * 5) + 1,
    chunksRetried: Math.floor(Math.random() * 2),
    chunksFailed: Math.random() > 0.9 ? 1 : 0,
    confidenceScore: Math.floor(Math.random() * 40) + 60,
    confidenceGrade: ['A', 'B', 'C', 'D', 'F'][Math.floor(Math.random() * 5)] as ConfidenceGrade,
    sanitizerStats: {
      linesRemoved: Math.floor(Math.random() * 50),
      garbageLinesRemoved: Math.floor(Math.random() * 20),
      lowLetterRatioLinesRemoved: Math.floor(Math.random() * 10),
      spacedFragmentsMerged: Math.floor(Math.random() * 5),
      controlCharsRemoved: Math.floor(Math.random() * 10),
      spacesNormalized: Math.floor(Math.random() * 100),
      newlinesNormalized: Math.floor(Math.random() * 20),
      barcodeTokensIsolated: Math.floor(Math.random() * 3),
    },
    patternsDetected: Math.floor(Math.random() * 5),
    newPatternsLearned: Math.floor(Math.random() * 2),
  }))

  return {
    current: mockStats,
    previous: previousStats,
    trends: {
      executions: Array.from({ length: 24 }, (_, i) => ({
        timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
        value: Math.floor(Math.random() * 15) + 3,
      })),
      successRate: Array.from({ length: 24 }, (_, i) => ({
        timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
        value: 0.85 + Math.random() * 0.1,
      })),
      avgConfidence: Array.from({ length: 24 }, (_, i) => ({
        timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
        value: 75 + Math.random() * 15,
      })),
      avgDuration: Array.from({ length: 24 }, (_, i) => ({
        timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
        value: 2000 + Math.random() * 1500,
      })),
      patternsDetected: Array.from({ length: 24 }, (_, i) => ({
        timestamp: new Date(Date.now() - (23 - i) * 3600000).toISOString(),
        value: Math.floor(Math.random() * 20),
      })),
    },
    recentExecutions: mockExecutions,
    topFailingPatterns: [
      { pattern: 'B^^^B', type: 'barcode', failureCount: 23, occurrenceCount: 45 },
      { pattern: 'a!!!a!AAA', type: 'barcode', failureCount: 18, occurrenceCount: 32 },
      { pattern: 'S İ G O R T A', type: 'spaced_fragment', failureCount: 15, occurrenceCount: 89 },
      { pattern: '\\x80\\x81\\x82', type: 'high_ascii', failureCount: 12, occurrenceCount: 28 },
      { pattern: 'B İ R L E Ş İ K', type: 'spaced_fragment', failureCount: 9, occurrenceCount: 56 },
    ],
    patternStats: mockPatternStats,
    lastUpdated: new Date().toISOString(),
  }
}

export function OCRDashboardTab() {
  const [data, setData] = useState<OCRDashboardData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day')
  const [showAllExecutions, setShowAllExecutions] = useState(false)

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    try {
      // In production, this would be an API call
      // const response = await adminFetch(`/api/admin/ocr/dashboard?period=${period}`)
      // const data = await response.json()
      await new Promise(resolve => setTimeout(resolve, 500)) // Simulate API delay
      setData(generateMockData())
    } catch (error) {
      console.error('Failed to fetch OCR dashboard data:', error)
    } finally {
      setIsLoading(false)
    }
    // Note: Add `period` to deps when API is implemented (line 201)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    )
  }

  const { current, previous, recentExecutions, topFailingPatterns, patternStats } = data

  // Calculate changes from previous period
  const executionChange = previous
    ? ((current.totalExecutions - previous.totalExecutions) / previous.totalExecutions) * 100
    : 0
  const successRateChange = previous
    ? (current.successRate - previous.successRate) * 100
    : 0
  const confidenceChange = previous
    ? current.confidenceStats.average - previous.confidenceStats.average
    : 0
  const durationChange = previous
    ? ((current.avgDuration - previous.avgDuration) / previous.avgDuration) * 100
    : 0

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">OCR Analytics Dashboard</h1>
          <p className="text-gray-500">
            Monitor OCR cleanup performance, confidence scores, and pattern learning
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Period Selector */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden">
            {(['day', 'week', 'month'] as const).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-sm font-medium capitalize ${
                  period === p
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={fetchData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Key Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Executions */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Executions</p>
                <p className="text-2xl font-bold mt-1">{current.totalExecutions}</p>
              </div>
              <div className={`flex items-center gap-1 text-sm ${
                executionChange >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {executionChange >= 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                <span>{Math.abs(executionChange).toFixed(1)}%</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">vs previous {period}</p>
          </CardContent>
        </Card>

        {/* Success Rate */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Success Rate</p>
                <p className="text-2xl font-bold mt-1 text-green-600">
                  {(current.successRate * 100).toFixed(1)}%
                </p>
              </div>
              <div className={`flex items-center gap-1 text-sm ${
                successRateChange >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {successRateChange >= 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                <span>{Math.abs(successRateChange).toFixed(1)}pp</span>
              </div>
            </div>
            <div className="mt-2">
              <Progress value={current.successRate * 100} className="h-1.5" />
            </div>
          </CardContent>
        </Card>

        {/* Average Confidence */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Avg Confidence</p>
                <div className="flex items-center gap-2 mt-1">
                  <p className="text-2xl font-bold">{current.confidenceStats.average.toFixed(1)}</p>
                  <Badge className={getGradeColor(getGradeFromScore(current.confidenceStats.average))}>
                    {getGradeFromScore(current.confidenceStats.average)}
                  </Badge>
                </div>
              </div>
              <div className={`flex items-center gap-1 text-sm ${
                confidenceChange >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {confidenceChange >= 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                <span>{Math.abs(confidenceChange).toFixed(1)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Average Duration */}
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Avg Duration</p>
                <p className="text-2xl font-bold mt-1">
                  {(current.avgDuration / 1000).toFixed(1)}s
                </p>
              </div>
              <div className={`flex items-center gap-1 text-sm ${
                durationChange <= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {durationChange <= 0 ? (
                  <TrendingDown className="h-4 w-4" />
                ) : (
                  <TrendingUp className="h-4 w-4" />
                )}
                <span>{Math.abs(durationChange).toFixed(1)}%</span>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Min: {(current.minDuration / 1000).toFixed(1)}s | Max: {(current.maxDuration / 1000).toFixed(1)}s
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Confidence Score Distribution & QA Stats */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Confidence Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Confidence Score Distribution
            </CardTitle>
            <CardDescription>Distribution of confidence grades across executions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {(['A', 'B', 'C', 'D', 'F'] as ConfidenceGrade[]).map(grade => {
                const count = current.confidenceStats.gradeDistribution[grade]
                const percentage = current.totalExecutions > 0
                  ? (count / current.totalExecutions) * 100
                  : 0
                return (
                  <div key={grade} className="flex items-center gap-4">
                    <div className="w-16">
                      <Badge className={getGradeColor(grade)}>
                        Grade {grade}
                      </Badge>
                    </div>
                    <div className="flex-1">
                      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${getGradeBarColor(grade)}`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                    <div className="w-20 text-right">
                      <span className="font-medium">{count}</span>
                      <span className="text-gray-400 text-sm ml-1">({percentage.toFixed(0)}%)</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>

        {/* QA Gate Statistics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5" />
              QA Gate Statistics
            </CardTitle>
            <CardDescription>Chunk processing outcomes</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div className="p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {current.qaStats.chunksPassedFirstTry}
                </div>
                <div className="text-sm text-green-700">Passed First Try</div>
              </div>
              <div className="p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {current.qaStats.chunksPassedAfterRetry}
                </div>
                <div className="text-sm text-blue-700">Passed After Retry</div>
              </div>
              <div className="p-4 bg-red-50 rounded-lg">
                <div className="text-2xl font-bold text-red-600">
                  {current.qaStats.chunksFailed}
                </div>
                <div className="text-sm text-red-700">Failed</div>
              </div>
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold text-gray-600">
                  {current.qaStats.totalChunks}
                </div>
                <div className="text-sm text-gray-700">Total Chunks</div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">First Try Pass Rate</span>
                <span className="font-medium">
                  {(current.qaStats.firstTryPassRate * 100).toFixed(1)}%
                </span>
              </div>
              <Progress value={current.qaStats.firstTryPassRate * 100} className="h-2" />

              <div className="flex items-center justify-between mt-3">
                <span className="text-sm text-gray-600">Overall Pass Rate</span>
                <span className="font-medium">
                  {(current.qaStats.overallPassRate * 100).toFixed(1)}%
                </span>
              </div>
              <Progress value={current.qaStats.overallPassRate * 100} className="h-2" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pattern Learning Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pattern Statistics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Pattern Learning
            </CardTitle>
            <CardDescription>Garbage patterns detected and learned</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl font-bold">{patternStats.totalPatterns}</div>
                <div className="text-xs text-gray-500">Total Patterns</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">{patternStats.promotedCount}</div>
                <div className="text-xs text-gray-500">Promoted</div>
              </div>
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {(patternStats.averageConfidence * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-gray-500">Avg Confidence</div>
              </div>
            </div>

            <h4 className="font-medium mb-2">Patterns by Type</h4>
            <div className="space-y-2">
              {Object.entries(patternStats.byType)
                .filter(([, count]) => count > 0)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([type, count]) => (
                  <div key={type} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 capitalize">
                      {type.replace(/_/g, ' ')}
                    </span>
                    <Badge variant="outline">{count}</Badge>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>

        {/* Top Failing Patterns */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Top Failing Patterns
            </CardTitle>
            <CardDescription>Patterns causing most QA failures</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {topFailingPatterns.map((pattern, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-2 border border-gray-100 rounded-lg hover:bg-gray-50"
                >
                  <div className="w-6 h-6 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center text-xs font-bold">
                    {index + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <code className="text-sm bg-gray-100 px-2 py-0.5 rounded truncate block">
                      {pattern.pattern}
                    </code>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="text-xs">
                        {pattern.type}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-red-600 font-medium">{pattern.failureCount}</div>
                    <div className="text-xs text-gray-400">
                      of {pattern.occurrenceCount}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sanitizer Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5" />
            Sanitizer Statistics
          </CardTitle>
          <CardDescription>Deterministic cleanup operations performed</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg text-center">
              <div className="text-2xl font-bold">{current.sanitizerStats.totalLinesRemoved}</div>
              <div className="text-sm text-gray-500">Lines Removed</div>
            </div>
            <div className="p-4 bg-red-50 rounded-lg text-center">
              <div className="text-2xl font-bold text-red-600">
                {current.sanitizerStats.totalGarbageLinesRemoved}
              </div>
              <div className="text-sm text-gray-500">Garbage Lines</div>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg text-center">
              <div className="text-2xl font-bold text-blue-600">
                {current.sanitizerStats.totalFragmentsMerged}
              </div>
              <div className="text-sm text-gray-500">Fragments Merged</div>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg text-center">
              <div className="text-2xl font-bold text-purple-600">
                {current.sanitizerStats.totalControlCharsRemoved}
              </div>
              <div className="text-sm text-gray-500">Control Chars</div>
            </div>
            <div className="p-4 bg-green-50 rounded-lg text-center">
              <div className="text-2xl font-bold text-green-600">
                {current.sanitizerStats.avgLinesRemovedPerDoc.toFixed(1)}
              </div>
              <div className="text-sm text-gray-500">Avg per Doc</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recent Executions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recent Executions
              </CardTitle>
              <CardDescription>Latest OCR pipeline runs</CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowAllExecutions(!showAllExecutions)}
            >
              {showAllExecutions ? 'Show Less' : 'Show All'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left border-b border-gray-200">
                  <th className="pb-2 text-sm font-medium text-gray-500">Document</th>
                  <th className="pb-2 text-sm font-medium text-gray-500">Type</th>
                  <th className="pb-2 text-sm font-medium text-gray-500">Status</th>
                  <th className="pb-2 text-sm font-medium text-gray-500">Confidence</th>
                  <th className="pb-2 text-sm font-medium text-gray-500">Duration</th>
                  <th className="pb-2 text-sm font-medium text-gray-500">Reduction</th>
                  <th className="pb-2 text-sm font-medium text-gray-500">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recentExecutions
                  .slice(0, showAllExecutions ? undefined : 5)
                  .map((exec) => (
                    <tr key={exec.id} className="hover:bg-gray-50">
                      <td className="py-3">
                        <code className="text-sm text-gray-700">{exec.documentId}</code>
                      </td>
                      <td className="py-3">
                        <Badge variant="outline" className="capitalize">
                          {exec.pipelineType}
                        </Badge>
                      </td>
                      <td className="py-3">
                        {exec.success ? (
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Success
                          </Badge>
                        ) : (
                          <Badge className="bg-red-100 text-red-800">
                            <XCircle className="h-3 w-3 mr-1" />
                            Failed
                          </Badge>
                        )}
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <span>{exec.confidenceScore}</span>
                          <Badge className={getGradeColor(exec.confidenceGrade)}>
                            {exec.confidenceGrade}
                          </Badge>
                        </div>
                      </td>
                      <td className="py-3 text-sm text-gray-600">
                        {(exec.durationMs / 1000).toFixed(2)}s
                      </td>
                      <td className="py-3 text-sm text-gray-600">
                        {exec.reductionPercent}%
                      </td>
                      <td className="py-3 text-sm text-gray-500">
                        {formatRelativeTime(new Date(exec.startedAt))}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Pipeline Type Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Pipeline Type Distribution
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(current.byPipelineType).map(([type, count]) => {
              const percentage = current.totalExecutions > 0
                ? (count / current.totalExecutions) * 100
                : 0
              return (
                <div key={type} className="flex items-center gap-4">
                  <div className="w-24 text-sm font-medium capitalize">{type}</div>
                  <div className="flex-1">
                    <Progress value={percentage} className="h-3" />
                  </div>
                  <div className="w-24 text-right">
                    <span className="font-medium">{count}</span>
                    <span className="text-gray-400 text-sm ml-1">({percentage.toFixed(0)}%)</span>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getGradeFromScore(score: number): ConfidenceGrade {
  if (score >= 90) return 'A'
  if (score >= 75) return 'B'
  if (score >= 60) return 'C'
  if (score >= 40) return 'D'
  return 'F'
}

function getGradeColor(grade: ConfidenceGrade): string {
  switch (grade) {
    case 'A':
      return 'bg-green-100 text-green-800 border-green-200'
    case 'B':
      return 'bg-blue-100 text-blue-800 border-blue-200'
    case 'C':
      return 'bg-yellow-100 text-yellow-800 border-yellow-200'
    case 'D':
      return 'bg-orange-100 text-orange-800 border-orange-200'
    case 'F':
      return 'bg-red-100 text-red-800 border-red-200'
  }
}

function getGradeBarColor(grade: ConfidenceGrade): string {
  switch (grade) {
    case 'A':
      return 'bg-green-500'
    case 'B':
      return 'bg-blue-500'
    case 'C':
      return 'bg-yellow-500'
    case 'D':
      return 'bg-orange-500'
    case 'F':
      return 'bg-red-500'
  }
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return date.toLocaleDateString()
}

export default OCRDashboardTab
