/**
 * Document Journey Viewer
 *
 * Displays the complete processing journey of a document through the extraction pipeline.
 * Shows each stage with inputs, outputs, timing, metrics, and status.
 *
 * Enhanced version with comprehensive debugging information.
 */

import { useState, useMemo } from 'react'
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
  ArrowDown,
  ArrowUp,
  DollarSign,
  Hash,
  Zap,
  Timer,
  FileInput,
  FileOutput,
  Clipboard,
  Check,
  X,
  ExternalLink,
  Maximize2,
  Info,
  HelpCircle,
  Lightbulb,
  Target,
  Scale,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type {
  DocumentProcessingLog,
  ProcessingStageRecord,
  ProcessingStage,
  ProcessingStageStatus,
  StageDecisionContext,
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
const STAGE_LABELS: Record<ProcessingStage, { en: string; tr: string; description: string }> = {
  upload: { en: 'Upload', tr: 'Yükleme', description: 'File received and validated in browser' },
  pdf_extraction: { en: 'PDF Extraction', tr: 'PDF Metin Çıkarma', description: 'Text extracted from PDF using pdf.js' },
  ocr_check: { en: 'OCR Check', tr: 'OCR Kontrolü', description: 'Checking text density to determine if OCR is needed' },
  ocr_processing: { en: 'OCR Processing', tr: 'OCR İşleme', description: 'Optical character recognition for scanned documents' },
  text_preprocessing: { en: 'Text Preprocessing', tr: 'Metin Ön İşleme', description: 'Text normalization, Turkish OCR cleanup, spacing fixes' },
  ai_extraction: { en: 'AI Extraction', tr: 'AI Çıkarma', description: 'Structured data extraction using AI (GPT-4o/Claude)' },
  form_field_enhancement: { en: 'Form Fields', tr: 'Form Alanları', description: 'Enhancement using Document AI form field detection' },
  table_parsing: { en: 'Table Parsing', tr: 'Tablo Ayrıştırma', description: 'Coverage table extraction and parsing' },
  validation: { en: 'Validation', tr: 'Doğrulama', description: 'Data validation, business rules, Turkish pattern matching' },
  duplicate_check: { en: 'Duplicate Check', tr: 'Mükerrer Kontrol', description: 'Checking for existing similar policies with fuzzy matching' },
  conflict_resolution: { en: 'Conflict Resolution', tr: 'Çakışma Çözümü', description: 'User resolved duplicate/amendment conflict' },
  database_save: { en: 'Save', tr: 'Kayıt', description: 'Policy saved to database' },
}

// Status colors and icons
function getStatusInfo(status: ProcessingStageStatus): {
  color: string
  bgColor: string
  borderColor: string
  icon: LucideIcon
  label: string
} {
  switch (status) {
    case 'completed':
      return {
        color: 'text-green-600',
        bgColor: 'bg-green-50',
        borderColor: 'border-green-200',
        icon: CheckCircle,
        label: 'Completed',
      }
    case 'failed':
      return {
        color: 'text-red-600',
        bgColor: 'bg-red-50',
        borderColor: 'border-red-200',
        icon: XCircle,
        label: 'Failed',
      }
    case 'running':
      return {
        color: 'text-blue-600',
        bgColor: 'bg-blue-50',
        borderColor: 'border-blue-200',
        icon: Loader2,
        label: 'Running',
      }
    case 'skipped':
      return {
        color: 'text-gray-400',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
        icon: SkipForward,
        label: 'Skipped',
      }
    case 'partial':
      return {
        color: 'text-amber-600',
        bgColor: 'bg-amber-50',
        borderColor: 'border-amber-200',
        icon: AlertCircle,
        label: 'Partial',
      }
    default:
      return {
        color: 'text-gray-400',
        bgColor: 'bg-gray-50',
        borderColor: 'border-gray-200',
        icon: Clock,
        label: 'Pending',
      }
  }
}

function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return '-'
  if (ms === 0) return '0ms'
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

function formatNumber(n?: number): string {
  if (n === undefined || n === null) return '-'
  return n.toLocaleString('tr-TR')
}

function formatBytes(bytes?: number): string {
  if (bytes === undefined || bytes === null) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function formatCurrency(amount?: number): string {
  if (amount === undefined || amount === null) return '-'
  return `$${amount.toFixed(4)}`
}

// Calculate metrics from stage data
interface StageMetrics {
  inputSize?: number
  outputSize?: number
  charsDelta?: number
  charsPercent?: number
  tokens?: { input?: number; output?: number; total?: number }
  cost?: number
  confidence?: number
  itemCount?: number
  errorCount?: number
  warningCount?: number
}

function calculateMetrics(stage: ProcessingStageRecord): StageMetrics {
  const metrics: StageMetrics = {}

  // Calculate input size
  if (stage.input) {
    const inputStr = JSON.stringify(stage.input)
    metrics.inputSize = inputStr.length

    // Extract specific metrics from input
    if ('text_length' in stage.input && typeof stage.input.text_length === 'number') {
      metrics.inputSize = stage.input.text_length
    }
  }

  // Calculate output size
  if (stage.output) {
    const outputStr = JSON.stringify(stage.output)
    metrics.outputSize = outputStr.length

    // Extract specific metrics from output
    if ('text_length' in stage.output && typeof stage.output.text_length === 'number') {
      metrics.outputSize = stage.output.text_length
    }
    if ('processed_text_length' in stage.output && typeof stage.output.processed_text_length === 'number') {
      metrics.outputSize = stage.output.processed_text_length
    }
    if ('chars_changed' in stage.output && typeof stage.output.chars_changed === 'number') {
      metrics.charsDelta = stage.output.chars_changed
    }
    if ('confidence' in stage.output && typeof stage.output.confidence === 'number') {
      metrics.confidence = stage.output.confidence
    }
    if ('coverages_count' in stage.output && typeof stage.output.coverages_count === 'number') {
      metrics.itemCount = stage.output.coverages_count
    }
    if ('validation_errors' in stage.output && typeof stage.output.validation_errors === 'number') {
      metrics.errorCount = stage.output.validation_errors
    }
    if ('validation_warnings' in stage.output && typeof stage.output.validation_warnings === 'number') {
      metrics.warningCount = stage.output.validation_warnings
    }
  }

  // Calculate delta percentage
  if (metrics.inputSize && metrics.outputSize) {
    metrics.charsPercent = ((metrics.outputSize - metrics.inputSize) / metrics.inputSize) * 100
  }

  // Extract token/cost from metadata
  if (stage.metadata) {
    if ('usage' in stage.metadata) {
      const usage = stage.metadata.usage as Record<string, unknown>
      metrics.tokens = {
        input: usage.input_tokens as number,
        output: usage.output_tokens as number,
        total: (usage.input_tokens as number || 0) + (usage.output_tokens as number || 0),
      }
    }
    if ('cost' in stage.metadata && typeof stage.metadata.cost === 'number') {
      metrics.cost = stage.metadata.cost
    }
  }

  return metrics
}

// Copy to clipboard hook
function useCopyToClipboard() {
  const [copied, setCopied] = useState<string | null>(null)

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      console.error('Failed to copy')
    }
  }

  return { copied, copy }
}

// Metric Badge Component
function MetricBadge({
  icon: Icon,
  label,
  value,
  subValue,
  color = 'gray',
}: {
  icon: LucideIcon
  label: string
  value: string
  subValue?: string
  color?: 'gray' | 'green' | 'red' | 'blue' | 'amber' | 'purple'
}) {
  const colorClasses = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
    amber: 'bg-amber-100 text-amber-700',
    purple: 'bg-purple-100 text-purple-700',
  }

  return (
    <div className={cn('flex items-center gap-2 px-3 py-2 rounded-lg', colorClasses[color])}>
      <Icon size={14} className="flex-shrink-0" />
      <div className="min-w-0">
        <div className="text-xs opacity-75">{label}</div>
        <div className="font-semibold text-sm truncate">{value}</div>
        {subValue && <div className="text-xs opacity-75">{subValue}</div>}
      </div>
    </div>
  )
}

// JSON Viewer with syntax highlighting
function JsonViewer({
  data,
  label,
  maxHeight = 'max-h-96',
  id,
}: {
  data: unknown
  label: string
  maxHeight?: string
  id: string
}) {
  const { copied, copy } = useCopyToClipboard()
  const jsonString = JSON.stringify(data, null, 2)

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-gray-100 border-b border-gray-200">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          <FileJson size={14} />
          {label}
          <span className="text-xs text-gray-500">({formatBytes(jsonString.length)})</span>
        </div>
        <button
          onClick={() => copy(jsonString, id)}
          className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-gray-200 transition-colors"
        >
          {copied === id ? (
            <>
              <Check size={12} className="text-green-600" />
              <span className="text-green-600">Copied!</span>
            </>
          ) : (
            <>
              <Clipboard size={12} />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className={cn('p-3 text-xs overflow-auto bg-gray-50 font-mono', maxHeight)}>
        {jsonString}
      </pre>
    </div>
  )
}

// Full Text Content Viewer with expandable sections
function TextContentViewer({
  text,
  label,
  id,
  icon: Icon = FileText,
  defaultExpanded = false,
}: {
  text: string
  label: string
  id: string
  icon?: LucideIcon
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const [showFullText, setShowFullText] = useState(false)
  const { copied, copy } = useCopyToClipboard()

  const lineCount = text.split('\n').length
  const charCount = text.length
  const previewLines = 20
  const previewText = text.split('\n').slice(0, previewLines).join('\n')
  const hasMore = lineCount > previewLines

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Header - always visible, clickable to expand */}
      <div
        className={cn(
          'flex items-center justify-between px-3 py-2 bg-gray-100 border-b border-gray-200 cursor-pointer hover:bg-gray-150',
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <Icon size={14} />
          {label}
          <span className="text-xs text-gray-500">
            ({formatNumber(charCount)} chars, {formatNumber(lineCount)} lines)
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation()
              copy(text, id)
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-gray-200 transition-colors"
          >
            {copied === id ? (
              <>
                <Check size={12} className="text-green-600" />
                <span className="text-green-600">Copied!</span>
              </>
            ) : (
              <>
                <Clipboard size={12} />
                <span>Copy All</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Content - shown when expanded */}
      {expanded && (
        <div className="relative">
          <pre className={cn(
            'p-3 text-xs overflow-auto bg-gray-50 font-mono whitespace-pre-wrap break-words',
            showFullText ? 'max-h-[70vh]' : 'max-h-96'
          )}>
            {showFullText ? text : previewText}
            {!showFullText && hasMore && '\n...'}
          </pre>

          {/* Show more/less button */}
          {hasMore && (
            <div className="sticky bottom-0 left-0 right-0 bg-gradient-to-t from-gray-100 to-transparent py-3 px-4">
              <button
                onClick={() => setShowFullText(!showFullText)}
                className="flex items-center gap-2 mx-auto px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
              >
                {showFullText ? (
                  <>
                    <ArrowUp size={14} />
                    Show Less
                  </>
                ) : (
                  <>
                    <ArrowDown size={14} />
                    Show All {formatNumber(lineCount - previewLines)} More Lines
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// Diff Summary Viewer for text preprocessing
function DiffSummaryViewer({
  diffSummary,
  inputText,
  outputText,
}: {
  diffSummary: {
    characters_added: number
    characters_removed: number
    lines_changed: number
    major_changes: string[]
  }
  inputText?: string
  outputText?: string
}) {
  const [showSideBySide, setShowSideBySide] = useState(false)
  const netChange = diffSummary.characters_added - diffSummary.characters_removed

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 bg-amber-50 border-b border-gray-200">
        <div className="flex items-center gap-2 text-sm font-medium text-amber-800">
          <GitMerge size={14} />
          Text Diff Summary
        </div>
        {inputText && outputText && (
          <button
            onClick={() => setShowSideBySide(!showSideBySide)}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-amber-100 hover:bg-amber-200 transition-colors text-amber-800"
          >
            <Maximize2 size={12} />
            {showSideBySide ? 'Hide Comparison' : 'Side-by-Side'}
          </button>
        )}
      </div>

      <div className="p-4 space-y-4">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-green-700">+{formatNumber(diffSummary.characters_added)}</div>
            <div className="text-xs text-green-600">Characters Added</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-red-700">-{formatNumber(diffSummary.characters_removed)}</div>
            <div className="text-xs text-red-600">Characters Removed</div>
          </div>
          <div className={cn(
            'border rounded-lg p-3 text-center',
            netChange >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'
          )}>
            <div className={cn('text-lg font-bold', netChange >= 0 ? 'text-blue-700' : 'text-amber-700')}>
              {netChange >= 0 ? '+' : ''}{formatNumber(netChange)}
            </div>
            <div className={cn('text-xs', netChange >= 0 ? 'text-blue-600' : 'text-amber-600')}>Net Change</div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-sm font-medium text-gray-700 mb-1">Lines Changed: {formatNumber(diffSummary.lines_changed)}</div>
        </div>

        {/* Major changes */}
        {diffSummary.major_changes.length > 0 && (
          <div>
            <h5 className="text-sm font-semibold text-gray-700 mb-2">Sample Changes:</h5>
            <div className="space-y-2 max-h-48 overflow-auto">
              {diffSummary.major_changes.map((change, i) => (
                <div key={i} className="bg-gray-50 rounded p-2 text-xs font-mono text-gray-700">
                  {change}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Side-by-side comparison */}
        {showSideBySide && inputText && outputText && (
          <div className="grid grid-cols-2 gap-4 mt-4">
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-red-50 px-3 py-2 text-sm font-medium text-red-800 border-b border-gray-200">
                Before (Input)
              </div>
              <pre className="p-2 text-xs max-h-64 overflow-auto bg-gray-50 font-mono whitespace-pre-wrap">
                {inputText.substring(0, 5000)}
                {inputText.length > 5000 && `\n\n... (${formatNumber(inputText.length - 5000)} more characters)`}
              </pre>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-green-50 px-3 py-2 text-sm font-medium text-green-800 border-b border-gray-200">
                After (Output)
              </div>
              <pre className="p-2 text-xs max-h-64 overflow-auto bg-gray-50 font-mono whitespace-pre-wrap">
                {outputText.substring(0, 5000)}
                {outputText.length > 5000 && `\n\n... (${formatNumber(outputText.length - 5000)} more characters)`}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// Decision Context Viewer - explains WHY a stage was skipped
function DecisionContextViewer({
  context,
  stageName: _stageName,
}: {
  context: StageDecisionContext
  stageName: string
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="border border-purple-200 rounded-lg overflow-hidden bg-purple-50/30">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-purple-100 border-b border-purple-200 cursor-pointer hover:bg-purple-150"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-purple-800">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <HelpCircle size={16} />
          Why Was This Stage Skipped?
        </div>
        <span className="text-xs text-purple-600 bg-purple-200 px-2 py-1 rounded">
          Decision Explanation
        </span>
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          {/* Assessment Performed */}
          <div className="bg-white rounded-lg border border-purple-200 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-purple-700 mb-2">
              <Search size={14} />
              Assessment Performed
            </div>
            <p className="text-sm text-gray-700">{context.assessment_performed}</p>
          </div>

          {/* Threshold (if applicable) */}
          {context.threshold && (
            <div className="bg-white rounded-lg border border-blue-200 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-blue-700 mb-2">
                <Target size={14} />
                Decision Threshold
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-gray-500">Threshold Name:</span>
                  <span className="ml-2 font-mono text-blue-800">{context.threshold.name}</span>
                </div>
                <div>
                  <span className="text-gray-500">Threshold Value:</span>
                  <span className="ml-2 font-bold text-blue-800">
                    {context.threshold.comparison === 'less_than' && '< '}
                    {context.threshold.comparison === 'greater_than' && '> '}
                    {context.threshold.comparison === 'equals' && '= '}
                    {context.threshold.comparison === 'not_equals' && '≠ '}
                    {formatNumber(context.threshold.value)}
                    {context.threshold.unit && ` ${context.threshold.unit}`}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Actual Values */}
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
              <Scale size={14} />
              Actual Measured Values
            </div>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(context.actual_values).map(([key, value]) => (
                <div key={key} className="flex justify-between items-center bg-gray-50 rounded px-3 py-2">
                  <span className="text-xs text-gray-600">{key.replace(/_/g, ' ')}:</span>
                  <span className={cn(
                    'text-xs font-mono font-semibold',
                    typeof value === 'boolean'
                      ? (value ? 'text-green-700' : 'text-red-700')
                      : 'text-gray-900'
                  )}>
                    {typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Decision Logic */}
          <div className="bg-amber-50 rounded-lg border border-amber-200 p-3">
            <div className="flex items-center gap-2 text-sm font-medium text-amber-800 mb-2">
              <Brain size={14} />
              Decision Logic
            </div>
            <p className="text-sm text-amber-900 leading-relaxed">{context.decision_logic}</p>
          </div>

          {/* Alternatives */}
          {context.alternatives && context.alternatives.length > 0 && (
            <div className="bg-green-50 rounded-lg border border-green-200 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-green-800 mb-2">
                <Lightbulb size={14} />
                What Would Trigger This Stage?
              </div>
              <ul className="space-y-2">
                {context.alternatives.map((alt, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-green-800">
                    <ArrowRight size={14} className="mt-0.5 flex-shrink-0" />
                    <span>{alt}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Documentation Link */}
          {context.documentation_url && (
            <a
              href={context.documentation_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
            >
              <ExternalLink size={14} />
              View Documentation
            </a>
          )}
        </div>
      )}
    </div>
  )
}

// Stage Details Panel Component
function StageDetailsPanel({
  stage,
  onClose,
}: {
  stage: ProcessingStageRecord
  onClose: () => void
}) {
  const statusInfo = getStatusInfo(stage.status)
  const StageIcon = STAGE_ICONS[stage.stage as ProcessingStage] || FileText
  const StatusIcon = statusInfo.icon
  const labels = STAGE_LABELS[stage.stage as ProcessingStage] || { en: stage.stage, tr: stage.stage, description: '' }
  const metrics = calculateMetrics(stage)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className={cn('flex items-center justify-between px-6 py-4 border-b', statusInfo.bgColor)}>
          <div className="flex items-center gap-3">
            <div className={cn('w-12 h-12 rounded-lg flex items-center justify-center',
              stage.status === 'completed' ? 'bg-green-200' :
              stage.status === 'failed' ? 'bg-red-200' :
              stage.status === 'running' ? 'bg-blue-200' :
              'bg-gray-200'
            )}>
              <StageIcon className={statusInfo.color} size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-gray-900">{labels.en}</h3>
                <span className="text-sm text-gray-500">({labels.tr})</span>
              </div>
              <div className="text-sm text-gray-600">{labels.description}</div>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <StatusIcon className={cn(statusInfo.color, stage.status === 'running' && 'animate-spin')} size={20} />
              <span className={cn('font-medium', statusInfo.color)}>{statusInfo.label}</span>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Timing Section */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricBadge
              icon={Clock}
              label="Started At"
              value={formatTimestamp(stage.started_at)}
              color="blue"
            />
            <MetricBadge
              icon={Timer}
              label="Duration"
              value={formatDuration(stage.duration_ms)}
              color={stage.duration_ms && stage.duration_ms > 5000 ? 'amber' : 'green'}
            />
            <MetricBadge
              icon={Clock}
              label="Completed At"
              value={formatTimestamp(stage.completed_at)}
              color="blue"
            />
            <MetricBadge
              icon={Zap}
              label="Status"
              value={statusInfo.label}
              color={stage.status === 'completed' ? 'green' : stage.status === 'failed' ? 'red' : 'gray'}
            />
          </div>

          {/* Metrics Section */}
          {(metrics.inputSize || metrics.outputSize || metrics.tokens || metrics.cost || metrics.confidence) && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Hash size={14} />
                Metrics
              </h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {metrics.inputSize !== undefined && (
                  <MetricBadge
                    icon={FileInput}
                    label="Input Size"
                    value={formatNumber(metrics.inputSize)}
                    subValue="characters"
                    color="gray"
                  />
                )}
                {metrics.outputSize !== undefined && (
                  <MetricBadge
                    icon={FileOutput}
                    label="Output Size"
                    value={formatNumber(metrics.outputSize)}
                    subValue="characters"
                    color="gray"
                  />
                )}
                {metrics.charsDelta !== undefined && (
                  <MetricBadge
                    icon={metrics.charsDelta >= 0 ? ArrowUp : ArrowDown}
                    label="Chars Changed"
                    value={`${metrics.charsDelta >= 0 ? '+' : ''}${formatNumber(metrics.charsDelta)}`}
                    subValue={metrics.charsPercent ? `${metrics.charsPercent.toFixed(1)}%` : undefined}
                    color={metrics.charsDelta > 0 ? 'green' : metrics.charsDelta < 0 ? 'amber' : 'gray'}
                  />
                )}
                {metrics.confidence !== undefined && (
                  <MetricBadge
                    icon={Zap}
                    label="Confidence"
                    value={`${(metrics.confidence * 100).toFixed(0)}%`}
                    color={metrics.confidence >= 0.8 ? 'green' : metrics.confidence >= 0.6 ? 'amber' : 'red'}
                  />
                )}
                {metrics.tokens?.total !== undefined && (
                  <MetricBadge
                    icon={Hash}
                    label="Tokens"
                    value={formatNumber(metrics.tokens.total)}
                    subValue={`In: ${formatNumber(metrics.tokens.input)} / Out: ${formatNumber(metrics.tokens.output)}`}
                    color="purple"
                  />
                )}
                {metrics.cost !== undefined && (
                  <MetricBadge
                    icon={DollarSign}
                    label="API Cost"
                    value={formatCurrency(metrics.cost)}
                    color="amber"
                  />
                )}
                {metrics.itemCount !== undefined && (
                  <MetricBadge
                    icon={Hash}
                    label="Items Found"
                    value={formatNumber(metrics.itemCount)}
                    color="blue"
                  />
                )}
                {(metrics.errorCount !== undefined || metrics.warningCount !== undefined) && (
                  <MetricBadge
                    icon={AlertCircle}
                    label="Issues"
                    value={`${metrics.errorCount || 0} errors, ${metrics.warningCount || 0} warnings`}
                    color={metrics.errorCount ? 'red' : metrics.warningCount ? 'amber' : 'green'}
                  />
                )}
              </div>
            </div>
          )}

          {/* Error Section */}
          {stage.error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2">
                <XCircle size={14} />
                Error
              </h4>
              <div className="text-sm text-red-800 font-mono bg-white p-3 rounded border border-red-200">
                {stage.error}
              </div>
            </div>
          )}

          {/* Decision Context Section - explains why stage was skipped */}
          {stage.decision_context && (
            <DecisionContextViewer
              context={stage.decision_context}
              stageName={stage.stage}
            />
          )}

          {/* Input Section */}
          {stage.input && Object.keys(stage.input).length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <FileInput size={14} />
                Input Data
              </h4>
              <JsonViewer
                data={stage.input}
                label="Stage Input"
                id={`${stage.stage}-input`}
              />
            </div>
          )}

          {/* Output Section */}
          {stage.output && Object.keys(stage.output).length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <FileOutput size={14} />
                Output Data
              </h4>
              <JsonViewer
                data={stage.output}
                label="Stage Output"
                id={`${stage.stage}-output`}
              />
            </div>
          )}

          {/* Metadata Section */}
          {stage.metadata && Object.keys(stage.metadata).length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Info size={14} />
                Metadata
              </h4>
              <JsonViewer
                data={stage.metadata}
                label="Stage Metadata"
                id={`${stage.stage}-metadata`}
              />
            </div>
          )}

          {/* ========== FULL CONTENT SECTIONS ========== */}

          {/* Diff Summary for text preprocessing */}
          {stage.diff_summary && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <GitMerge size={14} />
                Text Changes (Diff Summary)
              </h4>
              <DiffSummaryViewer
                diffSummary={stage.diff_summary}
                inputText={stage.full_input_text}
                outputText={stage.full_output_text}
              />
            </div>
          )}

          {/* Full Input Text */}
          {stage.full_input_text && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <FileInput size={14} />
                Full Input Text
              </h4>
              <TextContentViewer
                text={stage.full_input_text}
                label="Input Text (Before Processing)"
                id={`${stage.stage}-full-input`}
                icon={FileInput}
                defaultExpanded={false}
              />
            </div>
          )}

          {/* Full Output Text */}
          {stage.full_output_text && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <FileOutput size={14} />
                Full Output Text
              </h4>
              <TextContentViewer
                text={stage.full_output_text}
                label="Output Text (After Processing)"
                id={`${stage.stage}-full-output`}
                icon={FileOutput}
                defaultExpanded={false}
              />
            </div>
          )}

          {/* Full Extracted JSON */}
          {stage.full_extracted_json && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <FileJson size={14} />
                Full Extracted Data (JSON)
              </h4>
              <TextContentViewer
                text={stage.full_extracted_json}
                label="Extracted JSON"
                id={`${stage.stage}-full-json`}
                icon={FileJson}
                defaultExpanded={false}
              />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t bg-gray-50">
          <div className="text-sm text-gray-500">
            Stage: <code className="bg-gray-200 px-1 rounded">{stage.stage}</code>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg font-medium transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// Stage Card Component
function StageCard({
  stage,
  isLast,
  onViewDetails,
}: {
  stage: ProcessingStageRecord
  isLast: boolean
  onViewDetails: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const statusInfo = getStatusInfo(stage.status)
  const StageIcon = STAGE_ICONS[stage.stage as ProcessingStage] || FileText
  const StatusIcon = statusInfo.icon
  const labels = STAGE_LABELS[stage.stage as ProcessingStage] || { en: stage.stage, tr: stage.stage, description: '' }
  const metrics = calculateMetrics(stage)

  const hasDetails = stage.input || stage.output || stage.metadata || stage.error

  // Calculate quick summary metrics for collapsed view
  const quickMetrics = useMemo(() => {
    const items: Array<{ label: string; value: string; color?: string }> = []

    if (stage.duration_ms) {
      items.push({ label: 'Time', value: formatDuration(stage.duration_ms) })
    }

    if (metrics.outputSize) {
      items.push({ label: 'Chars', value: formatNumber(metrics.outputSize) })
    }

    if (metrics.charsDelta !== undefined && metrics.charsDelta !== 0) {
      items.push({
        label: 'Delta',
        value: `${metrics.charsDelta >= 0 ? '+' : ''}${formatNumber(metrics.charsDelta)}`,
        color: metrics.charsDelta > 0 ? 'text-green-600' : 'text-amber-600'
      })
    }

    if (metrics.confidence !== undefined) {
      items.push({
        label: 'Conf',
        value: `${(metrics.confidence * 100).toFixed(0)}%`,
        color: metrics.confidence >= 0.8 ? 'text-green-600' : 'text-amber-600'
      })
    }

    if (metrics.itemCount !== undefined) {
      items.push({ label: 'Items', value: String(metrics.itemCount) })
    }

    if (metrics.tokens?.total) {
      items.push({ label: 'Tokens', value: formatNumber(metrics.tokens.total) })
    }

    if (metrics.cost !== undefined) {
      items.push({ label: 'Cost', value: formatCurrency(metrics.cost), color: 'text-amber-600' })
    }

    return items
  }, [stage, metrics])

  return (
    <div className="relative">
      {/* Connecting line */}
      {!isLast && (
        <div className="absolute left-6 top-14 bottom-0 w-0.5 bg-gray-200" />
      )}

      {/* Stage card */}
      <div
        className={cn(
          'relative border rounded-lg transition-all',
          statusInfo.bgColor,
          statusInfo.borderColor,
        )}
      >
        {/* Header row - Always clickable to expand */}
        <div
          className={cn(
            'flex items-center gap-3 p-4',
            hasDetails && 'cursor-pointer hover:bg-white/50'
          )}
          onClick={() => hasDetails && setExpanded(!expanded)}
        >
          {/* Stage icon */}
          <div
            className={cn(
              'w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
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
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-gray-900">{labels.en}</span>
              <span className="text-sm text-gray-500">({labels.tr})</span>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500 flex-wrap">
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {formatTimestamp(stage.started_at)}
              </span>
              {stage.duration_ms !== undefined && stage.duration_ms !== 0 && (
                <span className="flex items-center gap-1">
                  <ArrowRight size={12} />
                  {formatDuration(stage.duration_ms)}
                </span>
              )}
              {/* Quick metrics */}
              {quickMetrics.slice(0, 4).map((m, i) => (
                <span key={i} className={cn('hidden sm:inline-flex items-center gap-1', m.color)}>
                  <span className="text-gray-400">{m.label}:</span>
                  <span className="font-medium">{m.value}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Status and actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <StatusIcon
              className={cn(
                statusInfo.color,
                stage.status === 'running' && 'animate-spin'
              )}
              size={20}
            />
            <span className={cn('text-sm font-medium hidden sm:inline', statusInfo.color)}>
              {statusInfo.label}
            </span>

            {/* View Details button */}
            {hasDetails && (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  onViewDetails()
                }}
                className="p-2 hover:bg-white rounded-lg transition-colors"
                title="View Full Details"
              >
                <Maximize2 size={16} className="text-gray-500" />
              </button>
            )}

            {hasDetails && (
              <div className="text-gray-400">
                {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              </div>
            )}
          </div>
        </div>

        {/* Error message (always visible if present) */}
        {stage.error && (
          <div className="mx-4 mb-4 p-2 bg-red-100 border border-red-200 rounded text-sm text-red-700 font-mono">
            {stage.error}
          </div>
        )}

        {/* Expanded details (inline preview) */}
        {expanded && hasDetails && (
          <div className="border-t border-gray-200 p-4 space-y-3 bg-white/50">
            {/* Quick metrics grid */}
            {quickMetrics.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {quickMetrics.map((m, i) => (
                  <div key={i} className="flex items-center gap-1 px-2 py-1 bg-white rounded border border-gray-200 text-xs">
                    <span className="text-gray-500">{m.label}:</span>
                    <span className={cn('font-semibold', m.color || 'text-gray-900')}>{m.value}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Input */}
            {stage.input && Object.keys(stage.input).length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <FileInput size={14} />
                  Input
                </div>
                <pre className="p-2 bg-white rounded border border-gray-200 text-xs overflow-x-auto max-h-32">
                  {JSON.stringify(stage.input, null, 2)}
                </pre>
              </div>
            )}

            {/* Output */}
            {stage.output && Object.keys(stage.output).length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <FileOutput size={14} />
                  Output
                </div>
                <pre className="p-2 bg-white rounded border border-gray-200 text-xs overflow-x-auto max-h-32">
                  {JSON.stringify(stage.output, null, 2)}
                </pre>
              </div>
            )}

            {/* Metadata */}
            {stage.metadata && Object.keys(stage.metadata).length > 0 && (
              <div>
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-1">
                  <Info size={14} />
                  Metadata
                </div>
                <pre className="p-2 bg-white rounded border border-gray-200 text-xs overflow-x-auto max-h-32">
                  {JSON.stringify(stage.metadata, null, 2)}
                </pre>
              </div>
            )}

            {/* Full details button */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                onViewDetails()
              }}
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              <ExternalLink size={14} />
              View Full Stage Details
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

export function DocumentJourneyViewer({ log, className }: DocumentJourneyViewerProps) {
  const [selectedStage, setSelectedStage] = useState<ProcessingStageRecord | null>(null)
  const { copied, copy } = useCopyToClipboard()

  const overallStatusInfo = getStatusInfo(log.status as ProcessingStageStatus)
  const OverallStatusIcon = overallStatusInfo.icon

  // Calculate overall stats
  const stats = useMemo(() => {
    const completedStages = log.stages.filter(s => s.status === 'completed').length
    const failedStages = log.stages.filter(s => s.status === 'failed').length
    const skippedStages = log.stages.filter(s => s.status === 'skipped').length

    let totalTokens = 0
    let totalCost = 0

    log.stages.forEach(stage => {
      const m = calculateMetrics(stage)
      if (m.tokens?.total) totalTokens += m.tokens.total
      if (m.cost) totalCost += m.cost
    })

    return { completedStages, failedStages, skippedStages, totalTokens, totalCost }
  }, [log.stages])

  return (
    <div className={cn('space-y-6', className)}>
      {/* Header with summary */}
      <div className="bg-white border border-gray-200 rounded-xl p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{log.filename}</h3>
            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500 flex-wrap">
              {log.file_size && (
                <span>{formatBytes(log.file_size)}</span>
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
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mt-6">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-sm text-gray-500">Total Duration</div>
            <div className="text-lg font-semibold text-gray-900">
              {formatDuration(log.total_duration_ms)}
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-sm text-gray-500">Stages</div>
            <div className="text-lg font-semibold text-gray-900">
              {stats.completedStages}/{log.stages.length}
              {stats.failedStages > 0 && (
                <span className="text-red-600 text-sm ml-1">({stats.failedStages} failed)</span>
              )}
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

          {stats.totalTokens > 0 && (
            <div className="bg-purple-50 rounded-lg p-3">
              <div className="text-sm text-purple-600">Total Tokens</div>
              <div className="text-lg font-semibold text-purple-900">
                {formatNumber(stats.totalTokens)}
              </div>
            </div>
          )}

          {stats.totalCost > 0 && (
            <div className="bg-amber-50 rounded-lg p-3">
              <div className="text-sm text-amber-600">Total Cost</div>
              <div className="text-lg font-semibold text-amber-900">
                {formatCurrency(stats.totalCost)}
              </div>
            </div>
          )}

          {log.extraction_confidence && (
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="text-sm text-blue-600">Confidence</div>
              <div className="text-lg font-semibold text-blue-900">
                {log.extraction_confidence}%
              </div>
            </div>
          )}
        </div>

        {/* Extracted summary */}
        {log.extracted_summary && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-sm font-medium text-blue-800 mb-2">Extracted Data Summary</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {log.extracted_summary.policy_number && (
                <div>
                  <span className="text-blue-600">Policy #:</span>{' '}
                  <span className="text-blue-900 font-medium">{log.extracted_summary.policy_number}</span>
                </div>
              )}
              {log.extracted_summary.provider && (
                <div>
                  <span className="text-blue-600">Provider:</span>{' '}
                  <span className="text-blue-900 font-medium">{log.extracted_summary.provider}</span>
                </div>
              )}
              {log.extracted_summary.type_tr && (
                <div>
                  <span className="text-blue-600">Type:</span>{' '}
                  <span className="text-blue-900 font-medium">{log.extracted_summary.type_tr}</span>
                </div>
              )}
              {log.extracted_summary.insured_person && (
                <div>
                  <span className="text-blue-600">Insured:</span>{' '}
                  <span className="text-blue-900 font-medium">{log.extracted_summary.insured_person}</span>
                </div>
              )}
              {log.extracted_summary.premium && (
                <div>
                  <span className="text-blue-600">Premium:</span>{' '}
                  <span className="text-blue-900 font-medium">₺{formatNumber(log.extracted_summary.premium)}</span>
                </div>
              )}
              {log.extracted_summary.coverage && (
                <div>
                  <span className="text-blue-600">Coverage:</span>{' '}
                  <span className="text-blue-900 font-medium">₺{formatNumber(log.extracted_summary.coverage)}</span>
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
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-md font-semibold text-gray-900">Processing Pipeline</h4>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <CheckCircle size={12} className="text-green-600" />
              {stats.completedStages}
            </span>
            {stats.failedStages > 0 && (
              <span className="flex items-center gap-1">
                <XCircle size={12} className="text-red-600" />
                {stats.failedStages}
              </span>
            )}
            {stats.skippedStages > 0 && (
              <span className="flex items-center gap-1">
                <SkipForward size={12} className="text-gray-400" />
                {stats.skippedStages}
              </span>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {log.stages.map((stage, index) => (
            <StageCard
              key={`${stage.stage}-${index}`}
              stage={stage}
              isLast={index === log.stages.length - 1}
              onViewDetails={() => setSelectedStage(stage)}
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
        <summary className="p-4 cursor-pointer text-sm font-medium text-gray-700 hover:bg-gray-50 flex items-center justify-between">
          <span>View Raw Log Data</span>
          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              copy(JSON.stringify(log, null, 2), 'raw-log')
            }}
            className="flex items-center gap-1 px-2 py-1 text-xs rounded hover:bg-gray-200 transition-colors"
          >
            {copied === 'raw-log' ? (
              <>
                <Check size={12} className="text-green-600" />
                <span className="text-green-600">Copied!</span>
              </>
            ) : (
              <>
                <Clipboard size={12} />
                <span>Copy All</span>
              </>
            )}
          </button>
        </summary>
        <div className="p-4 border-t border-gray-200">
          <pre className="text-xs overflow-x-auto bg-gray-50 p-4 rounded-lg max-h-96">
            {JSON.stringify(log, null, 2)}
          </pre>
        </div>
      </details>

      {/* Stage Details Modal */}
      {selectedStage && (
        <StageDetailsPanel
          stage={selectedStage}
          onClose={() => setSelectedStage(null)}
        />
      )}
    </div>
  )
}

export default DocumentJourneyViewer
