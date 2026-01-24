/**
 * Document Journey Viewer
 *
 * Displays the complete processing journey of a document through the extraction pipeline.
 * Shows each stage with inputs, outputs, timing, and status.
 */

import { useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  SkipForward,
  Loader2,
  Upload,
  FileText,
  Search,
  ScanLine,
  Wand2,
  Brain,
  FormInput,
  Table,
  CheckCircle2,
  Copy,
  GitMerge,
  Database,
  FileJson,
  ArrowRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  DocumentProcessingLog,
  ProcessingStageRecord,
  ProcessingStage,
  ProcessingStageStatus,
} from '@/types/processing-log'

interface DocumentJourneyViewerProps {
  log: DocumentProcessingLog
  className?: string
}

// Icon mapping for stages
const STAGE_ICONS: Record<ProcessingStage, LucideIcon> = {
  upload: Upload,
  pdf_extraction: FileText,
  ocr_check: Search,
  ocr_processing: ScanLine,
  text_preprocessing: Wand2,
  ai_extraction: Brain,
  form_field_enhancement: FormInput,
  table_parsing: Table,
  validation: CheckCircle2,
  duplicate_check: Copy,
  conflict_resolution: GitMerge,
  database_save: Database,
}

// Stage labels
const STAGE_LABELS: Record<ProcessingStage, { en: string; tr: string }> = {
  upload: { en: 'Upload', tr: 'Yükleme' },
  pdf_extraction: { en: 'PDF Extraction', tr: 'PDF Metin Çıkarma' },
  ocr_check: { en: 'OCR Check', tr: 'OCR Kontrolü' },
  ocr_processing: { en: 'OCR Processing', tr: 'OCR İşleme' },
  text_preprocessing: { en: 'Text Preprocessing', tr: 'Metin Ön İşleme' },
  ai_extraction: { en: 'AI Extraction', tr: 'AI Çıkarma' },
  form_field_enhancement: { en: 'Form Fields', tr: 'Form Alanları' },
  table_parsing: { en: 'Table Parsing', tr: 'Tablo Ayrıştırma' },
  validation: { en: 'Validation', tr: 'Doğrulama' },
  duplicate_check: { en: 'Duplicate Check', tr: 'Mükerrer Kontrol' },
  conflict_resolution: { en: 'Conflict Resolution', tr: 'Çakışma Çözümü' },
  database_save: { en: 'Save', tr: 'Kayıt' },
}

// Status colors and icons
function getStatusInfo(status: ProcessingStageStatus): {
  color: string
  bgColor: string
  borderColor: string
  icon: LucideIcon
} {
  switch (status) {
    case 'completed':
      return {
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        icon: CheckCircle,
      }
    case 'failed':
      return {
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        icon: XCircle,
      }
    case 'running':
      return {
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        icon: Loader2,
      }
    case 'skipped':
      return {
        color: 'text-gray-400',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
        icon: SkipForward,
      }
    case 'partial':
      return {
        color: 'text-amber-600',
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-200',
        icon: AlertCircle,
      }
    default:
      return {
        color: 'text-gray-400',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
        icon: Clock,
      }
  }
}

function formatDuration(ms?: number): string {
  if (!ms) return '-'
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${(ms / 60000).toFixed(1)}m`
}

function formatTimestamp(iso?: string): string {
  if (!iso) return '-'
  return new Date(iso).toLocaleTimeString('tr-TR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

// Stage Card Component
function StageCard({
  stage,
  isLast,
}: {
  stage: ProcessingStageRecord
  isLast: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const statusInfo = getStatusInfo(stage.status)
  const StageIcon = STAGE_ICONS[stage.stage as ProcessingStage] || FileText
  const StatusIcon = statusInfo.icon
  const labels = STAGE_LABELS[stage.stage as ProcessingStage] || { en: stage.stage, tr: stage.stage }

  const hasDetails = stage.input || stage.output || stage.metadata || stage.error

  return (
    <div className="relative">
      {/* Connecting line */}
      {!isLast && (
        <div className="absolute left-6 top-14 bottom-0 w-0.5 bg-gray-200" />
      )}

      {/* Stage card */}
      <div
        className={cn(
          'relative border rounded-lg p-4 transition-all',
          statusInfo.bgColor,
          statusInfo.borderColor,
          hasDetails && 'cursor-pointer hover:shadow-md'
        )}
        onClick={() => hasDetails && setExpanded(!expanded)}
      >
        {/* Header row */}
        <div className="flex items-center gap-3">
          {/* Stage icon */}
          <div
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center',
              stage.status === 'completed' ? 'bg-green-100' :
              stage.status === 'failed' ? 'bg-red-100' :
              stage.status === 'running' ? 'bg-blue-100' :
              'bg-gray-100'
            )}
          >
            <StageIcon className={statusInfo.color} size={20} />
          </div>

          {/* Stage info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-gray-900">{labels.en}</span>
              <span className="text-sm text-gray-500">({labels.tr})</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {formatTimestamp(stage.started_at)}
              </span>
              {stage.duration_ms && (
                <span className="flex items-center gap-1">
                  <ArrowRight size={12} />
                  {formatDuration(stage.duration_ms)}
                </span>
              )}
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2">
            <StatusIcon
              className={cn(
                statusInfo.color,
                stage.status === 'running' && 'animate-spin'
              )}
              size={20}
            />
            <span className={cn('text-sm font-medium', statusInfo.color)}>
              {stage.status.charAt(0).toUpperCase() + stage.status.slice(1)}
            </span>
            {hasDetails && (
              <div className="text-gray-400">
                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </div>
            )}
          </div>
        </div>

        {/* Error message (always visible if present) */}
        {stage.error && (
          <div className="mt-3 p-2 bg-red-100 border border-red-200 rounded text-sm text-red-700">
            {stage.error}
          </div>
        )}

        {/* Expanded details */}
        {expanded && hasDetails && (
          <div className="mt-4 space-y-3 border-t border-gray-200 pt-3">
            {/* Input */}
            {stage.input && Object.keys(stage.input).length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <FileJson size={14} />
                  Input
                </div>
                <pre className="p-2 bg-white rounded border border-gray-200 text-xs overflow-x-auto max-h-40">
                  {JSON.stringify(stage.input, null, 2)}
                </pre>
              </div>
            )}

            {/* Output */}
            {stage.output && Object.keys(stage.output).length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <FileJson size={14} />
                  Output
                </div>
                <pre className="p-2 bg-white rounded border border-gray-200 text-xs overflow-x-auto max-h-40">
                  {JSON.stringify(stage.output, null, 2)}
                </pre>
              </div>
            )}

            {/* Metadata */}
            {stage.metadata && Object.keys(stage.metadata).length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <FileJson size={14} />
                  Metadata
                </div>
                <pre className="p-2 bg-white rounded border border-gray-200 text-xs overflow-x-auto max-h-40">
                  {JSON.stringify(stage.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export function DocumentJourneyViewer({ log, className }: DocumentJourneyViewerProps) {
  const overallStatusInfo = getStatusInfo(log.status as ProcessingStageStatus)
  const OverallStatusIcon = overallStatusInfo.icon

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header with summary */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{log.filename}</h3>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
              {log.file_size && (
                <span>{(log.file_size / 1024).toFixed(1)} KB</span>
              )}
              {log.page_count && (
                <span>{log.page_count} page{log.page_count !== 1 ? 's' : ''}</span>
              )}
              {log.mime_type && (
                <span>{log.mime_type}</span>
              )}
            </div>
          </div>

          <div className={cn('flex items-center gap-2 px-3 py-1.5 rounded-full', overallStatusInfo.bgColor)}>
            <OverallStatusIcon className={overallStatusInfo.color} size={16} />
            <span className={cn('text-sm font-medium', overallStatusInfo.color)}>
              {log.status.charAt(0).toUpperCase() + log.status.slice(1)}
            </span>
          </div>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-sm text-gray-500">Total Duration</div>
            <div className="text-lg font-semibold text-gray-900">
              {formatDuration(log.total_duration_ms)}
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-sm text-gray-500">Stages</div>
            <div className="text-lg font-semibold text-gray-900">
              {log.stages.length}
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-sm text-gray-500">OCR Used</div>
            <div className="text-lg font-semibold text-gray-900">
              {log.ocr_used ? log.ocr_engine || 'Yes' : 'No'}
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-sm text-gray-500">AI Provider</div>
            <div className="text-lg font-semibold text-gray-900">
              {log.ai_provider || '-'}
            </div>
          </div>
        </div>

        {/* Extracted summary */}
        {log.extracted_summary && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-sm font-medium text-blue-800 mb-2">Extracted Data Summary</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {log.extracted_summary.policy_number && (
                <div>
                  <span className="text-blue-600">Policy #:</span>{' '}
                  <span className="text-blue-900">{log.extracted_summary.policy_number}</span>
                </div>
              )}
              {log.extracted_summary.provider && (
                <div>
                  <span className="text-blue-600">Provider:</span>{' '}
                  <span className="text-blue-900">{log.extracted_summary.provider}</span>
                </div>
              )}
              {log.extracted_summary.type_tr && (
                <div>
                  <span className="text-blue-600">Type:</span>{' '}
                  <span className="text-blue-900">{log.extracted_summary.type_tr}</span>
                </div>
              )}
              {log.extracted_summary.insured_person && (
                <div>
                  <span className="text-blue-600">Insured:</span>{' '}
                  <span className="text-blue-900">{log.extracted_summary.insured_person}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Detailed Error Information Panel */}
        {log.error_message && (
          <div className="mt-6 bg-red-50 border border-red-300 rounded-lg overflow-hidden">
            {/* Error Header */}
            <div className="bg-red-100 border-b border-red-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <XCircle className="text-red-600" size={20} />
                <span className="font-semibold text-red-800">Extraction Failed</span>
                {log.error_stage && (
                  <span className="text-sm text-red-600">at stage: {log.error_stage}</span>
                )}
              </div>
            </div>

            {/* Error Content */}
            <div className="p-4 space-y-4">
              {/* Error Message */}
              <div>
                <div className="text-xs font-medium text-red-700 uppercase tracking-wide mb-1">Error Message</div>
                <div className="bg-white border border-red-200 rounded p-3 font-mono text-sm text-red-900">
                  {log.error_message}
                </div>
              </div>

              {/* Error Type */}
              {log.error_type && (
                <div>
                  <div className="text-xs font-medium text-red-700 uppercase tracking-wide mb-1">Error Type</div>
                  <div className="inline-flex px-2 py-1 bg-red-100 text-red-800 rounded text-sm font-medium">
                    {log.error_type}
                  </div>
                </div>
              )}

              {/* Error Context Grid */}
              {log.error_context && (
                <div>
                  <div className="text-xs font-medium text-red-700 uppercase tracking-wide mb-2">Error Context</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {log.error_context.extraction_provider && (
                      <div className="bg-white border border-red-200 rounded p-2">
                        <div className="text-xs text-gray-500">Provider</div>
                        <div className="font-medium text-gray-900">{log.error_context.extraction_provider}</div>
                      </div>
                    )}
                    {log.error_context.document_length !== undefined && (
                      <div className="bg-white border border-red-200 rounded p-2">
                        <div className="text-xs text-gray-500">Document Length</div>
                        <div className="font-medium text-gray-900">{log.error_context.document_length.toLocaleString()} chars</div>
                      </div>
                    )}
                    {log.error_context.last_successful_stage && (
                      <div className="bg-white border border-red-200 rounded p-2">
                        <div className="text-xs text-gray-500">Last OK Stage</div>
                        <div className="font-medium text-gray-900">{log.error_context.last_successful_stage}</div>
                      </div>
                    )}
                    {log.error_context.ocr_used !== undefined && (
                      <div className="bg-white border border-red-200 rounded p-2">
                        <div className="text-xs text-gray-500">OCR Used</div>
                        <div className="font-medium text-gray-900">{log.error_context.ocr_used ? 'Yes' : 'No'}</div>
                      </div>
                    )}
                    {log.error_context.timestamp && (
                      <div className="bg-white border border-red-200 rounded p-2">
                        <div className="text-xs text-gray-500">Timestamp</div>
                        <div className="font-medium text-gray-900 text-xs">
                          {new Date(log.error_context.timestamp).toLocaleString('tr-TR')}
                        </div>
                      </div>
                    )}
                    {log.error_context.browser_info && (
                      <div className="bg-white border border-red-200 rounded p-2 col-span-2">
                        <div className="text-xs text-gray-500">Browser/Environment</div>
                        <div className="font-medium text-gray-900 text-xs truncate">
                          {log.error_context.browser_info.substring(0, 50)}...
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Data at Failure */}
              {log.error_context?.data_at_failure && Object.keys(log.error_context.data_at_failure).length > 0 && (
                <div>
                  <div className="text-xs font-medium text-red-700 uppercase tracking-wide mb-1">Data at Failure</div>
                  <pre className="bg-white border border-red-200 rounded p-3 text-xs overflow-x-auto max-h-40">
                    {JSON.stringify(log.error_context.data_at_failure, null, 2)}
                  </pre>
                </div>
              )}

              {/* Stack Trace (Collapsible) */}
              {log.error_stack && (
                <details className="group">
                  <summary className="text-xs font-medium text-red-700 uppercase tracking-wide cursor-pointer hover:text-red-800">
                    Stack Trace (click to expand)
                  </summary>
                  <pre className="mt-2 bg-gray-900 text-green-400 rounded p-3 text-xs overflow-x-auto max-h-60 font-mono">
                    {log.error_stack}
                  </pre>
                </details>
              )}

              {/* Additional Error Details (if any) */}
              {log.error_details && Object.keys(log.error_details).length > 0 && (
                <details className="group">
                  <summary className="text-xs font-medium text-red-700 uppercase tracking-wide cursor-pointer hover:text-red-800">
                    Additional Details (click to expand)
                  </summary>
                  <pre className="mt-2 bg-white border border-red-200 rounded p-3 text-xs overflow-x-auto max-h-40">
                    {JSON.stringify(log.error_details, null, 2)}
                  </pre>
                </details>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Timeline / Pipeline */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <h4 className="text-md font-semibold text-gray-900 mb-4">Processing Pipeline</h4>

        <div className="space-y-4">
          {log.stages.map((stage, index) => (
            <StageCard
              key={`${stage.stage}-${index}`}
              stage={stage}
              isLast={index === log.stages.length - 1}
            />
          ))}
        </div>

        {log.stages.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            No processing stages recorded yet.
          </div>
        )}
      </div>

      {/* Raw log data (collapsible) */}
      <details className="bg-white border border-gray-200 rounded-xl">
        <summary className="p-4 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50">
          View Raw Log Data
        </summary>
        <div className="p-4 border-t border-gray-200">
          <pre className="text-xs overflow-x-auto bg-gray-50 p-4 rounded-lg max-h-96">
            {JSON.stringify(log, null, 2)}
          </pre>
        </div>
      </details>
    </div>
  )
}

export default DocumentJourneyViewer
