/**
 * Policies Tab
 * Monitor policy operations and processing
 */

import { adminFetch } from '@/lib/admin/api'
import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import {
  FileText,
  Upload,
  CheckCircle,
  XCircle,
  Clock,
  Eye,
  RefreshCw,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react'

interface PolicyOperation {
  id: string
  timestamp: string
  type: string
  userId: string
  policyId?: string
  status: string
  duration?: number
  documentInfo?: {
    filename: string
    size: number
    pageCount: number
  }
  extractionInfo?: {
    provider: string
    model: string
    confidence: number
    ocrUsed: boolean
  }
  error?: string
}

export function PoliciesTab() {
  const [operations, setOperations] = useState<PolicyOperation[]>([])
  const [stats, setStats] = useState<{
    total: number
    byType: Record<string, number>
    byStatus: Record<string, number>
    averageExtractionTime: number
    extractionSuccessRate: number
    ocrUsageRate: number
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setIsLoading(true)
    try {
      const [opsResponse, statsResponse] = await Promise.all([
        adminFetch('/api/admin/policies/operations?limit=50'),
        adminFetch('/api/admin/policies/stats'),
      ])

      const opsData = await opsResponse.json()
      const statsData = await statsResponse.json()

      if (opsData.success) setOperations(opsData.data)
      if (statsData.success) setStats(statsData.data)
    } catch (error) {
      console.error('Failed to fetch policy data:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'processing':
        return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />
      default:
        return <AlertTriangle className="h-4 w-4 text-gray-500" />
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'upload':
        return <Upload className="h-4 w-4" />
      case 'extraction':
        return <FileText className="h-4 w-4" />
      case 'ocr':
        return <Eye className="h-4 w-4" />
      default:
        return <FileText className="h-4 w-4" />
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Policy Operations</h1>
          <p className="text-gray-500">Monitor document processing and extractions</p>
        </div>
        <Button onClick={fetchData} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                <FileText className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">{stats?.total || 0}</div>
                <div className="text-sm text-gray-500">Total Operations</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {((stats?.extractionSuccessRate || 0) * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-gray-500">Success Rate</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <Clock className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {((stats?.averageExtractionTime || 0) / 1000).toFixed(1)}s
                </div>
                <div className="text-sm text-gray-500">Avg Extraction Time</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center">
                <Eye className="h-5 w-5 text-orange-600" />
              </div>
              <div>
                <div className="text-2xl font-bold">
                  {((stats?.ocrUsageRate || 0) * 100).toFixed(1)}%
                </div>
                <div className="text-sm text-gray-500">OCR Usage</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Operation Types Breakdown */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle>Operations by Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(stats.byType).map(([type, count]) => (
                <div key={type} className="flex items-center gap-4">
                  <div className="w-24 text-sm font-medium capitalize">{type}</div>
                  <div className="flex-1">
                    <Progress
                      value={(count / stats.total) * 100}
                      className="h-2"
                    />
                  </div>
                  <div className="w-16 text-sm text-right text-gray-500">{count}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Operations */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Operations</CardTitle>
          <CardDescription>Last 50 policy processing operations</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading operations...</div>
          ) : operations.length === 0 ? (
            <div className="text-center py-8 text-gray-500">No operations found</div>
          ) : (
            <div className="space-y-3">
              {operations.map((op) => (
                <div
                  key={op.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-2 bg-white rounded-lg">
                      {getTypeIcon(op.type)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium capitalize">{op.type}</span>
                        {op.documentInfo && (
                          <span className="text-sm text-gray-500">
                            {op.documentInfo.filename}
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">
                        {new Date(op.timestamp).toLocaleString()}
                        {op.documentInfo && (
                          <span className="ml-2">
                            • {formatBytes(op.documentInfo.size)}
                            • {op.documentInfo.pageCount} pages
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    {op.extractionInfo && (
                      <div className="text-sm text-right">
                        <div className="text-gray-600">{op.extractionInfo.provider}</div>
                        <div className="text-gray-400">
                          {(op.extractionInfo.confidence * 100).toFixed(0)}% confidence
                        </div>
                      </div>
                    )}
                    {op.duration && (
                      <Badge variant="outline">
                        {(op.duration / 1000).toFixed(1)}s
                      </Badge>
                    )}
                    <div className="flex items-center gap-2">
                      {getStatusIcon(op.status)}
                      <span className="text-sm capitalize">{op.status}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default PoliciesTab
