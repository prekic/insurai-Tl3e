/**
 * Pipeline Tab
 * Document processing pipeline monitoring
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Workflow,
  FileText,
  Shield,
  Brain,
  CheckCircle,
  Lock,
} from 'lucide-react'

export function PipelineTab() {
  const [pipelineStats] = useState({
    totalExecutions: 0,
    successRate: 0.95,
    avgDuration: 3500,
    byType: {
      combined: 150,
      quick: 80,
      clean_room: 30,
    },
    piiDetection: {
      tcKimlik: 245,
      iban: 120,
      phone: 89,
      email: 156,
      plateNumber: 312,
    },
  })

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Document Pipeline</h1>
        <p className="text-gray-500">Monitor the combined document processing pipeline</p>
      </div>

      {/* Pipeline Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Workflow className="h-5 w-5" />
            Pipeline Stages
          </CardTitle>
          <CardDescription>Two-stage document processing architecture</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            {/* Stage 1: Clean Room */}
            <div className="flex-1 p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-bold text-blue-600">1</span>
                </div>
                <div>
                  <h4 className="font-medium">Clean Room Processing</h4>
                  <p className="text-xs text-gray-500">Deterministic</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Turkish OCR spacing fixes</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>PII detection & redaction</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <span>Character normalization</span>
                </div>
              </div>
            </div>

            {/* Arrow */}
            <div className="text-gray-300">→</div>

            {/* Stage 2: AI Processing */}
            <div className="flex-1 p-4 border border-gray-200 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-purple-100 rounded-full flex items-center justify-center">
                  <span className="text-sm font-bold text-purple-600">2</span>
                </div>
                <div>
                  <h4 className="font-medium">AI-Enhanced Processing</h4>
                  <p className="text-xs text-gray-500">Context-aware</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-purple-500" />
                  <span>Context-aware OCR correction</span>
                </div>
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-purple-500" />
                  <span>Structured data extraction</span>
                </div>
                <div className="flex items-center gap-2">
                  <Brain className="h-4 w-4 text-purple-500" />
                  <span>Insurance term validation</span>
                </div>
              </div>
            </div>

            {/* Arrow */}
            <div className="text-gray-300">→</div>

            {/* Output */}
            <div className="flex-1 p-4 border border-green-200 bg-green-50 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </div>
                <div>
                  <h4 className="font-medium">Output</h4>
                  <p className="text-xs text-gray-500">3 documents</p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-green-600" />
                  <span>Clean Copy</span>
                </div>
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-green-600" />
                  <span>Redacted Copy</span>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-green-600" />
                  <span>PII Vault</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500">Total Executions</div>
            <div className="text-2xl font-bold">
              {pipelineStats.byType.combined + pipelineStats.byType.quick + pipelineStats.byType.clean_room}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500">Success Rate</div>
            <div className="text-2xl font-bold text-green-600">
              {(pipelineStats.successRate * 100).toFixed(1)}%
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500">Avg Duration</div>
            <div className="text-2xl font-bold">
              {(pipelineStats.avgDuration / 1000).toFixed(1)}s
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-sm text-gray-500">PII Detected</div>
            <div className="text-2xl font-bold text-orange-600">
              {Object.values(pipelineStats.piiDetection).reduce((a, b) => a + b, 0)}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline Type Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline Usage by Type</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="w-32 text-sm font-medium">Combined</div>
              <div className="flex-1">
                <Progress
                  value={(pipelineStats.byType.combined / 260) * 100}
                  className="h-3"
                />
              </div>
              <div className="w-16 text-sm text-right">{pipelineStats.byType.combined}</div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-32 text-sm font-medium">Quick</div>
              <div className="flex-1">
                <Progress
                  value={(pipelineStats.byType.quick / 260) * 100}
                  className="h-3"
                />
              </div>
              <div className="w-16 text-sm text-right">{pipelineStats.byType.quick}</div>
            </div>
            <div className="flex items-center gap-4">
              <div className="w-32 text-sm font-medium">Clean Room Only</div>
              <div className="flex-1">
                <Progress
                  value={(pipelineStats.byType.clean_room / 260) * 100}
                  className="h-3"
                />
              </div>
              <div className="w-16 text-sm text-right">{pipelineStats.byType.clean_room}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* PII Detection Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            PII Detection Statistics
          </CardTitle>
          <CardDescription>Personal information detected and protected</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            {Object.entries(pipelineStats.piiDetection).map(([type, count]) => (
              <div key={type} className="p-4 bg-gray-50 rounded-lg text-center">
                <div className="text-2xl font-bold text-gray-900">{count}</div>
                <div className="text-sm text-gray-500 capitalize">
                  {type.replace(/([A-Z])/g, ' $1').trim()}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default PipelineTab
