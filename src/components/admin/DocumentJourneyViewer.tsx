/**
 * Document Journey Viewer
 *
 * Displays the complete processing journey of a document through the extraction pipeline.
 * Shows each stage with inputs, outputs, timing, metrics, and status.
 *
 * Enhanced version with comprehensive debugging information.
 */

import React, { useState, useMemo } from 'react'
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
  BrainCog,
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
  Lightbulb,
  Target,
  Calculator,
  Sparkles,
  Camera,
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
  ocr_decision: BrainCog,
  ocr_check: Search,
  ocr_processing: ScanLine,
  cloud_vision_ocr: Camera,
  gemini_ocr: Sparkles,
  text_preprocessing: Wand2,
  ai_extraction: Brain,
  form_field_enhancement: FormInput,
  table_parsing: Table,
  validation: CheckCircle2,
  duplicate_check: Copy,
  conflict_resolution: GitMerge,
  database_save: Database,
  actuarial_evaluation: Calculator,
}

// Stage labels
const STAGE_LABELS: Record<ProcessingStage, { en: string; tr: string; description: string }> = {
  upload: { en: 'Upload', tr: 'Yükleme', description: 'File received and validated in browser' },
  pdf_extraction: {
    en: 'PDF Extraction',
    tr: 'PDF Metin Çıkarma',
    description: 'Text extracted from PDF using pdf.js',
  },
  ocr_decision: {
    en: 'OCR Decision',
    tr: 'OCR Karar Motoru',
    description:
      'Analyzing document quality to determine if OCR is needed (language, policy type, text quality)',
  },
  ocr_check: {
    en: 'OCR Check',
    tr: 'OCR Kontrolü',
    description: 'Checking text density to determine if OCR is needed',
  },
  ocr_processing: {
    en: 'OCR Processing',
    tr: 'OCR İşleme',
    description: 'Optical character recognition for scanned documents',
  },
  cloud_vision_ocr: {
    en: 'Cloud Vision OCR',
    tr: 'Cloud Vision OCR',
    description: 'Google Cloud Vision API OCR fallback',
  },
  gemini_ocr: {
    en: 'Gemini OCR',
    tr: 'Gemini OCR',
    description: 'Multimodal OCR fallback using Gemini 2.5 Flash (for font-corrupted PDFs)',
  },
  text_preprocessing: {
    en: 'Text Preprocessing',
    tr: 'Metin Ön İşleme',
    description: 'Text normalization, Turkish OCR cleanup, spacing fixes',
  },
  ai_extraction: {
    en: 'AI Extraction',
    tr: 'AI Çıkarma',
    description: 'Structured data extraction using AI (GPT-4o/Claude)',
  },
  form_field_enhancement: {
    en: 'Form Fields',
    tr: 'Form Alanları',
    description: 'Enhancement using Document AI form field detection',
  },
  table_parsing: {
    en: 'Table Parsing',
    tr: 'Tablo Ayrıştırma',
    description: 'Coverage table extraction and parsing',
  },
  validation: {
    en: 'Validation',
    tr: 'Doğrulama',
    description: 'Data validation, business rules, Turkish pattern matching',
  },
  duplicate_check: {
    en: 'Duplicate Check',
    tr: 'Mükerrer Kontrol',
    description: 'Checking for existing similar policies with fuzzy matching',
  },
  conflict_resolution: {
    en: 'Conflict Resolution',
    tr: 'Çakışma Çözümü',
    description: 'User resolved duplicate/amendment conflict',
  },
  database_save: { en: 'Save', tr: 'Kayıt', description: 'Policy saved to database' },
  actuarial_evaluation: {
    en: 'Actuarial Evaluation',
    tr: 'Aktüeryal Değerlendirme',
    description: 'Actuarial scoring (Monte Carlo & TOPSIS)',
  },
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

// Error section component - extracted to help TypeScript inference
function ErrorSection({ error }: { error: string | undefined }): React.ReactElement | null {
  if (!error) return null
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
      <h4 className="text-sm font-semibold text-red-700 mb-2 flex items-center gap-2">
        <XCircle size={14} />
        Error
      </h4>
      <div className="text-sm text-red-800 font-mono bg-white p-3 rounded border border-red-200">
        {error}
      </div>
    </div>
  )
}

// Data section component - helps TypeScript inference for Record<string, unknown> types
function DataSection({
  data,
  title,
  icon: Icon,
  label,
  id,
}: {
  data: Record<string, unknown> | undefined
  title: string
  icon: LucideIcon
  label: string
  id: string
}): React.ReactElement | null {
  if (!data || Object.keys(data).length === 0) return null
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <Icon size={14} />
        {title}
      </h4>
      <JsonViewer data={data} label={label} id={id} />
    </div>
  )
}

// OCR Decision section component
function OCRDecisionSection({
  stage,
}: {
  stage: ProcessingStageRecord
}): React.ReactElement | null {
  const shouldShow =
    stage.metadata &&
    (stage.stage === 'ocr_check' || stage.stage === 'ocr_processing') &&
    (stage.metadata.document_classification || stage.metadata.analysis)

  if (!shouldShow || !stage.metadata) return null

  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
        <Brain size={14} />
        OCR Decision Analysis
      </h4>
      <OCRDecisionViewer metadata={stage.metadata} />
    </div>
  )
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
    if (
      'processed_text_length' in stage.output &&
      typeof stage.output.processed_text_length === 'number'
    ) {
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
    if (
      'validation_warnings' in stage.output &&
      typeof stage.output.validation_warnings === 'number'
    ) {
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
        total: ((usage.input_tokens as number) || 0) + ((usage.output_tokens as number) || 0),
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
          'flex items-center justify-between px-3 py-2 bg-gray-100 border-b border-gray-200 cursor-pointer hover:bg-gray-150'
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
          <pre
            className={cn(
              'p-3 text-xs overflow-auto bg-gray-50 font-mono whitespace-pre-wrap break-words',
              showFullText ? 'max-h-[70vh]' : 'max-h-96'
            )}
          >
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
            <div className="text-lg font-bold text-green-700">
              +{formatNumber(diffSummary.characters_added)}
            </div>
            <div className="text-xs text-green-600">Characters Added</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-center">
            <div className="text-lg font-bold text-red-700">
              -{formatNumber(diffSummary.characters_removed)}
            </div>
            <div className="text-xs text-red-600">Characters Removed</div>
          </div>
          <div
            className={cn(
              'border rounded-lg p-3 text-center',
              netChange >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-amber-50 border-amber-200'
            )}
          >
            <div
              className={cn(
                'text-lg font-bold',
                netChange >= 0 ? 'text-blue-700' : 'text-amber-700'
              )}
            >
              {netChange >= 0 ? '+' : ''}
              {formatNumber(netChange)}
            </div>
            <div className={cn('text-xs', netChange >= 0 ? 'text-blue-600' : 'text-amber-600')}>
              Net Change
            </div>
          </div>
        </div>

        <div className="bg-gray-50 rounded-lg p-3">
          <div className="text-sm font-medium text-gray-700 mb-1">
            Lines Changed: {formatNumber(diffSummary.lines_changed)}
          </div>
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
                {inputText.length > 5000 &&
                  `\n\n... (${formatNumber(inputText.length - 5000)} more characters)`}
              </pre>
            </div>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-green-50 px-3 py-2 text-sm font-medium text-green-800 border-b border-gray-200">
                After (Output)
              </div>
              <pre className="p-2 text-xs max-h-64 overflow-auto bg-gray-50 font-mono whitespace-pre-wrap">
                {outputText.substring(0, 5000)}
                {outputText.length > 5000 &&
                  `\n\n... (${formatNumber(outputText.length - 5000)} more characters)`}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Helper to safely format values for display
 * Ensures all values are strings to avoid TypeScript ReactNode inference issues
 */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'N/A'
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * Decision Context Viewer - explains WHY a stage was skipped
 * Shows the assessment performed, thresholds, actual values, and decision logic
 */
function DecisionContextViewer({ context }: { context: StageDecisionContext }) {
  const [expanded, setExpanded] = useState(true)

  // Format threshold comparison for display
  const getComparisonSymbol = (comparison: string): string => {
    switch (comparison) {
      case 'less_than':
        return '<'
      case 'greater_than':
        return '>'
      case 'equals':
        return '='
      case 'not_equals':
        return '≠'
      default:
        return comparison
    }
  }

  return (
    <div className="border border-purple-200 rounded-lg overflow-hidden bg-purple-50/30 mt-3">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-purple-100 border-b border-purple-200 cursor-pointer hover:bg-purple-150"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-purple-800">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <Info size={16} />
          Decision Context
        </div>
        <span className="text-xs text-purple-600 bg-purple-200 px-2 py-1 rounded">
          Why this stage was skipped
        </span>
      </div>

      {expanded && (
        <div className="p-4 space-y-4 text-sm">
          {/* Assessment Performed */}
          <div>
            <div className="font-medium text-purple-700 mb-1 flex items-center gap-2">
              <Target size={14} />
              Assessment Performed
            </div>
            <div className="text-gray-700 bg-white rounded px-3 py-2 border border-purple-100">
              {formatValue(context.assessment_performed)}
            </div>
          </div>

          {/* Threshold */}
          {context.threshold && (
            <div>
              <div className="font-medium text-purple-700 mb-1 flex items-center gap-2">
                <Hash size={14} />
                Decision Threshold
              </div>
              <div className="bg-white rounded px-3 py-2 border border-purple-100 font-mono text-sm">
                {formatValue(context.threshold.name)}{' '}
                {getComparisonSymbol(context.threshold.comparison)}{' '}
                {formatValue(context.threshold.value)}
                {context.threshold.unit && (
                  <span className="text-gray-500 ml-1">
                    ({formatValue(context.threshold.unit)})
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Actual Values */}
          {context.actual_values && Object.keys(context.actual_values).length > 0 && (
            <div>
              <div className="font-medium text-purple-700 mb-1 flex items-center gap-2">
                <Zap size={14} />
                Actual Measured Values
              </div>
              <div className="bg-white rounded border border-purple-100 overflow-hidden">
                <table className="w-full text-sm">
                  <tbody>
                    {Object.entries(context.actual_values).map(([key, value], idx) => (
                      <tr key={key} className={idx % 2 === 0 ? 'bg-gray-50' : ''}>
                        <td className="px-3 py-1.5 font-medium text-gray-600 border-r border-purple-100">
                          {formatValue(key.replace(/_/g, ' '))}
                        </td>
                        <td className="px-3 py-1.5 text-gray-800 font-mono">
                          {formatValue(value)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Decision Logic */}
          <div>
            <div className="font-medium text-purple-700 mb-1 flex items-center gap-2">
              <Lightbulb size={14} />
              Decision Logic
            </div>
            <div className="text-gray-700 bg-white rounded px-3 py-2 border border-purple-100">
              {formatValue(context.decision_logic)}
            </div>
          </div>

          {/* Alternatives */}
          {context.alternatives && context.alternatives.length > 0 && (
            <div>
              <div className="font-medium text-purple-700 mb-1 flex items-center gap-2">
                <ArrowRight size={14} />
                What Would Trigger This Stage
              </div>
              <ul className="list-disc list-inside text-gray-700 bg-white rounded px-3 py-2 border border-purple-100 space-y-1">
                {context.alternatives.map((alt, idx) => (
                  <li key={idx}>{formatValue(alt)}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// OCR Decision Viewer - displays comprehensive OCR decision analysis
function OCRDecisionViewer({ metadata }: { metadata: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(true)

  // Extract OCR decision data from metadata
  const documentClassification = metadata.document_classification as
    | {
        detected_language?: { locale_code: string; confidence: number; method: string }
        detected_policy_type?: {
          policy_type_id: string
          policy_type_name: string
          category: string
          confidence: number
          matched_terms: string[]
        }
      }
    | undefined

  const analysis = metadata.analysis as
    | {
        density?: {
          total_pages: number
          total_characters: number
          average_chars_per_page: number
          threshold_used: number
          pages_below_threshold: number[]
          min_chars_page?: { page: number; chars: number }
          max_chars_page?: { page: number; chars: number }
        }
        text_quality?: {
          quality_score: number
          terms_found: number
          terms_checked: number
          found_terms_sample?: string[]
          encoding_issues: boolean
          locale_used: string
        }
        field_extraction?: {
          fields_checked: number
          fields_found: number
          required_fields_found: number
          required_fields_total: number
          extraction_rate: number
          field_results?: Record<
            string,
            { found: boolean; value: string | null; required: boolean }
          >
        }
        confidence_breakdown?: {
          overall: number
          component_scores: {
            char_density: number
            text_quality: number
            page_variance: number
            encoding_check: number
            field_extraction: number
          }
          weights_used: Record<string, number>
        }
      }
    | undefined

  const reasoning = metadata.reasoning as string[] | undefined
  const configurationsUsed = metadata.configurations_used as
    | {
        locale_config?: string
        policy_config?: string
        ocr_settings_version?: string
      }
    | undefined

  if (!documentClassification && !analysis) return null

  return (
    <div className="border border-indigo-200 rounded-lg overflow-hidden bg-indigo-50/30">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-indigo-100 border-b border-indigo-200 cursor-pointer hover:bg-indigo-150"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2 text-sm font-semibold text-indigo-800">
          {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <Brain size={16} />
          OCR Decision Analysis
        </div>
        <span className="text-xs text-indigo-600 bg-indigo-200 px-2 py-1 rounded">
          Multi-Language & Policy Detection
        </span>
      </div>

      {expanded && (
        <div className="p-4 space-y-4">
          {/* Document Classification */}
          {documentClassification && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Language Detection */}
              {documentClassification.detected_language && (
                <div className="bg-white rounded-lg border border-blue-200 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-blue-700 mb-3">
                    <span className="text-lg">🌐</span>
                    Language Detection
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Detected:</span>
                      <span className="font-bold text-blue-800 uppercase">
                        {documentClassification.detected_language.locale_code}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Confidence:</span>
                      <span
                        className={cn(
                          'font-bold',
                          documentClassification.detected_language.confidence >= 0.8
                            ? 'text-green-700'
                            : documentClassification.detected_language.confidence >= 0.6
                              ? 'text-amber-700'
                              : 'text-red-700'
                        )}
                      >
                        {(documentClassification.detected_language.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Method:</span>
                      <span className="text-sm text-gray-800">
                        {documentClassification.detected_language.method}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Policy Type Classification */}
              {documentClassification.detected_policy_type && (
                <div className="bg-white rounded-lg border border-purple-200 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-purple-700 mb-3">
                    <span className="text-lg">📋</span>
                    Policy Type
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Type:</span>
                      <span className="font-bold text-purple-800">
                        {documentClassification.detected_policy_type.policy_type_name}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Category:</span>
                      <span className="text-sm text-gray-800 capitalize">
                        {documentClassification.detected_policy_type.category}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Confidence:</span>
                      <span
                        className={cn(
                          'font-bold',
                          documentClassification.detected_policy_type.confidence >= 0.8
                            ? 'text-green-700'
                            : documentClassification.detected_policy_type.confidence >= 0.6
                              ? 'text-amber-700'
                              : 'text-red-700'
                        )}
                      >
                        {(documentClassification.detected_policy_type.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    {documentClassification.detected_policy_type.matched_terms.length > 0 && (
                      <div>
                        <span className="text-xs text-gray-500">Matched terms:</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {documentClassification.detected_policy_type.matched_terms
                            .slice(0, 5)
                            .map((term, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs"
                              >
                                {term}
                              </span>
                            ))}
                          {documentClassification.detected_policy_type.matched_terms.length > 5 && (
                            <span className="text-xs text-gray-500">
                              +
                              {documentClassification.detected_policy_type.matched_terms.length - 5}{' '}
                              more
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Confidence Breakdown */}
          {analysis?.confidence_breakdown && (
            <div className="bg-white rounded-lg border border-green-200 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-green-700 mb-3">
                <Target size={14} />
                Confidence Breakdown
                <span
                  className={cn(
                    'ml-auto px-2 py-1 rounded text-sm font-bold',
                    analysis.confidence_breakdown.overall >= 0.85
                      ? 'bg-green-100 text-green-800'
                      : analysis.confidence_breakdown.overall >= 0.6
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-red-100 text-red-800'
                  )}
                >
                  Overall: {(analysis.confidence_breakdown.overall * 100).toFixed(0)}%
                </span>
              </div>
              <div className="grid grid-cols-5 gap-2">
                {Object.entries(analysis.confidence_breakdown.component_scores).map(
                  ([key, value]) => (
                    <div key={key} className="text-center p-2 bg-gray-50 rounded">
                      <div
                        className={cn(
                          'text-lg font-bold',
                          value >= 0.8
                            ? 'text-green-600'
                            : value >= 0.6
                              ? 'text-amber-600'
                              : 'text-red-600'
                        )}
                      >
                        {(value * 100).toFixed(0)}%
                      </div>
                      <div className="text-xs text-gray-500 capitalize">
                        {key.replace(/_/g, ' ')}
                      </div>
                      <div className="text-[10px] text-gray-400">
                        weight:{' '}
                        {(
                          (analysis.confidence_breakdown?.weights_used?.[
                            key as keyof typeof analysis.confidence_breakdown.weights_used
                          ] || 0) * 100
                        ).toFixed(0)}
                        %
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* Text Quality & Density */}
          {(analysis?.text_quality || analysis?.density) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Text Quality */}
              {analysis.text_quality && (
                <div className="bg-white rounded-lg border border-amber-200 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-amber-700 mb-3">
                    <CheckCircle size={14} />
                    Text Quality Analysis
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Quality Score:</span>
                      <span className="font-bold">
                        {(analysis.text_quality.quality_score * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Terms Found:</span>
                      <span>
                        {analysis.text_quality.terms_found}/{analysis.text_quality.terms_checked}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Encoding Issues:</span>
                      <span
                        className={
                          analysis.text_quality.encoding_issues
                            ? 'text-red-600 font-bold'
                            : 'text-green-600'
                        }
                      >
                        {analysis.text_quality.encoding_issues ? 'Yes' : 'No'}
                      </span>
                    </div>
                    {analysis.text_quality.found_terms_sample &&
                      analysis.text_quality.found_terms_sample.length > 0 && (
                        <div>
                          <span className="text-xs text-gray-500">Sample terms found:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {analysis.text_quality.found_terms_sample.slice(0, 6).map((term, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-xs"
                              >
                                {term}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                  </div>
                </div>
              )}

              {/* Density Analysis */}
              {analysis.density && (
                <div className="bg-white rounded-lg border border-cyan-200 p-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-cyan-700 mb-3">
                    <Hash size={14} />
                    Density Analysis
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Pages:</span>
                      <span>{analysis.density.total_pages}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Chars:</span>
                      <span>{formatNumber(analysis.density.total_characters)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Avg Chars/Page:</span>
                      <span
                        className={cn(
                          'font-bold',
                          analysis.density.average_chars_per_page >=
                            analysis.density.threshold_used * 5
                            ? 'text-green-600'
                            : analysis.density.average_chars_per_page >=
                                analysis.density.threshold_used
                              ? 'text-amber-600'
                              : 'text-red-600'
                        )}
                      >
                        {formatNumber(analysis.density.average_chars_per_page)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Threshold:</span>
                      <span>{formatNumber(analysis.density.threshold_used)}</span>
                    </div>
                    {analysis.density.pages_below_threshold.length > 0 && (
                      <div className="text-xs text-red-600">
                        Pages below threshold: {analysis.density.pages_below_threshold.join(', ')}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Field Extraction Results */}
          {analysis?.field_extraction && (
            <div className="bg-white rounded-lg border border-teal-200 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-teal-700 mb-3">
                <FormInput size={14} />
                Field Extraction Test
                <span
                  className={cn(
                    'ml-auto px-2 py-1 rounded text-xs font-bold',
                    analysis.field_extraction.extraction_rate >= 0.75
                      ? 'bg-green-100 text-green-800'
                      : analysis.field_extraction.extraction_rate >= 0.5
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-red-100 text-red-800'
                  )}
                >
                  {analysis.field_extraction.required_fields_found}/
                  {analysis.field_extraction.required_fields_total} Required (
                  {(analysis.field_extraction.extraction_rate * 100).toFixed(0)}%)
                </span>
              </div>
              {analysis.field_extraction.field_results && (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                  {Object.entries(analysis.field_extraction.field_results).map(
                    ([field, result]) => (
                      <div
                        key={field}
                        className={cn(
                          'p-2 rounded border text-xs',
                          result.found ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                        )}
                      >
                        <div className="flex items-center gap-1 font-medium">
                          {result.found ? (
                            <CheckCircle size={12} className="text-green-600" />
                          ) : (
                            <XCircle size={12} className="text-red-600" />
                          )}
                          <span className={result.found ? 'text-green-800' : 'text-red-800'}>
                            {field.replace(/_/g, ' ')}
                          </span>
                          {result.required && <span className="text-red-500">*</span>}
                        </div>
                        {result.found && result.value && (
                          <div className="mt-1 text-gray-600 truncate" title={result.value}>
                            {result.value.substring(0, 30)}...
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              )}
            </div>
          )}

          {/* Reasoning */}
          {reasoning && reasoning.length > 0 && (
            <div className="bg-gray-50 rounded-lg border border-gray-200 p-3">
              <div className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                <Lightbulb size={14} />
                Decision Reasoning
              </div>
              <ul className="space-y-1">
                {reasoning.map((reason, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <ArrowRight size={12} className="mt-1 flex-shrink-0 text-gray-400" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Configurations Used */}
          {configurationsUsed && (
            <div className="bg-slate-50 rounded-lg border border-slate-200 p-3">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <FileJson size={12} />
                <span>
                  Configs: {configurationsUsed.locale_config || 'default'} |{' '}
                  {configurationsUsed.policy_config || 'generic'} | v
                  {configurationsUsed.ocr_settings_version || '1.0'}
                </span>
              </div>
            </div>
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
  const labels = STAGE_LABELS[stage.stage as ProcessingStage] || {
    en: stage.stage,
    tr: stage.stage,
    description: '',
  }
  const metrics = calculateMetrics(stage)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div
          className={cn('flex items-center justify-between px-6 py-4 border-b', statusInfo.bgColor)}
        >
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'w-12 h-12 rounded-lg flex items-center justify-center',
                stage.status === 'completed'
                  ? 'bg-green-200'
                  : stage.status === 'failed'
                    ? 'bg-red-200'
                    : stage.status === 'running'
                      ? 'bg-blue-200'
                      : 'bg-gray-200'
              )}
            >
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
              <StatusIcon
                className={cn(statusInfo.color, stage.status === 'running' && 'animate-spin')}
                size={20}
              />
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
              color={
                stage.status === 'completed' ? 'green' : stage.status === 'failed' ? 'red' : 'gray'
              }
            />
          </div>

          {/* Metrics Section */}
          {(metrics.inputSize ||
            metrics.outputSize ||
            metrics.tokens ||
            metrics.cost ||
            metrics.confidence) && (
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
                    subValue={
                      metrics.charsPercent ? `${metrics.charsPercent.toFixed(1)}%` : undefined
                    }
                    color={
                      metrics.charsDelta > 0 ? 'green' : metrics.charsDelta < 0 ? 'amber' : 'gray'
                    }
                  />
                )}
                {metrics.confidence !== undefined && (
                  <MetricBadge
                    icon={Zap}
                    label="Confidence"
                    value={`${(metrics.confidence * 100).toFixed(0)}%`}
                    color={
                      metrics.confidence >= 0.8
                        ? 'green'
                        : metrics.confidence >= 0.6
                          ? 'amber'
                          : 'red'
                    }
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

          <ErrorSection error={stage.error} />

          <DataSection
            data={stage.input}
            title="Input Data"
            icon={FileInput}
            label="Stage Input"
            id={`${stage.stage}-input`}
          />

          <DataSection
            data={stage.output}
            title="Output Data"
            icon={FileOutput}
            label="Stage Output"
            id={`${stage.stage}-output`}
          />

          <OCRDecisionSection stage={stage} />

          <DataSection
            data={stage.metadata}
            title="Metadata"
            icon={Info}
            label="Stage Metadata"
            id={`${stage.stage}-metadata`}
          />

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
  const labels = STAGE_LABELS[stage.stage as ProcessingStage] || {
    en: stage.stage,
    tr: stage.stage,
    description: '',
  }
  const metrics = calculateMetrics(stage)

  const hasDetails =
    stage.input || stage.output || stage.metadata || stage.error || stage.decision_context

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
        color: metrics.charsDelta > 0 ? 'text-green-600' : 'text-amber-600',
      })
    }

    if (metrics.confidence !== undefined) {
      items.push({
        label: 'Conf',
        value: `${(metrics.confidence * 100).toFixed(0)}%`,
        color: metrics.confidence >= 0.8 ? 'text-green-600' : 'text-amber-600',
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
      {!isLast && <div className="absolute left-6 top-14 bottom-0 w-0.5 bg-gray-200" />}

      {/* Stage card */}
      <div
        className={cn(
          'relative border rounded-lg transition-all',
          statusInfo.bgColor,
          statusInfo.borderColor
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
              stage.status === 'completed'
                ? 'bg-green-100'
                : stage.status === 'failed'
                  ? 'bg-red-100'
                  : stage.status === 'running'
                    ? 'bg-blue-100'
                    : 'bg-gray-100'
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
              className={cn(statusInfo.color, stage.status === 'running' && 'animate-spin')}
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
            {String(stage.error)}
          </div>
        )}

        {/* Expanded details (inline preview) */}
        {expanded && hasDetails && (
          <div className="border-t border-gray-200 p-4 space-y-3 bg-white/50">
            {/* Quick metrics grid */}
            {quickMetrics.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {quickMetrics.map((m, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1 px-2 py-1 bg-white rounded border border-gray-200 text-xs"
                  >
                    <span className="text-gray-500">{m.label}:</span>
                    <span className={cn('font-semibold', m.color || 'text-gray-900')}>
                      {m.value}
                    </span>
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

            {/* Decision Context - explains WHY a stage was skipped */}
            {stage.status === 'skipped' && stage.decision_context && (
              <DecisionContextViewer context={stage.decision_context} />
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
    const completedStages = log.stages.filter((s) => s.status === 'completed').length
    const failedStages = log.stages.filter((s) => s.status === 'failed').length
    const skippedStages = log.stages.filter((s) => s.status === 'skipped').length

    let totalTokens = 0
    let totalCost = 0

    log.stages.forEach((stage) => {
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
              {log.file_size && <span>{formatBytes(log.file_size)}</span>}
              {log.page_count && (
                <span>
                  {log.page_count} page{log.page_count !== 1 ? 's' : ''}
                </span>
              )}
              {log.mime_type && <span>{log.mime_type}</span>}
            </div>
          </div>

          <div
            className={cn(
              'flex items-center gap-2 px-3 py-1.5 rounded-full',
              overallStatusInfo.bgColor
            )}
          >
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
            <div className="text-lg font-semibold text-gray-900">{log.ai_provider || '-'}</div>
          </div>

          {log.extraction_route && (
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-sm text-gray-500">Route</div>
              <div className="text-sm font-mono font-semibold text-gray-900">
                {log.extraction_route}
              </div>
            </div>
          )}

          {log.extraction_mode && (
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-sm text-gray-500">Mode</div>
              <div className="text-lg font-semibold text-gray-900 capitalize">
                {log.extraction_mode}
              </div>
            </div>
          )}

          {log.request_id && (
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-sm text-gray-500">Request ID</div>
              <div className="text-xs font-mono font-semibold text-gray-900 break-all">
                {log.request_id}
              </div>
            </div>
          )}

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

        {/* Provider Fallback Chain */}
        {log.fallback_used && log.fallback_chain && log.fallback_chain.length > 0 && (
          <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="text-sm font-medium text-amber-800 mb-2">Provider Fallback Chain</div>
            <div className="flex items-center gap-2 flex-wrap">
              {log.fallback_chain.map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  {i > 0 && <span className="text-amber-400">&rarr;</span>}
                  <div
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                      step.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${step.success ? 'bg-green-500' : 'bg-red-500'}`}
                    />
                    {step.provider}
                    {step.duration_ms != null && (
                      <span className="text-xs opacity-70">({step.duration_ms}ms)</span>
                    )}
                  </div>
                  {step.error_code && (
                    <span className="text-xs text-red-600 font-mono">{step.error_code}</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Extracted summary */}
        {log.extracted_summary && (
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="text-sm font-medium text-blue-800 mb-2">Extracted Data Summary</div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              {log.extracted_summary.policy_number && (
                <div>
                  <span className="text-blue-600">Policy #:</span>{' '}
                  <span className="text-blue-900 font-medium">
                    {log.extracted_summary.policy_number}
                  </span>
                </div>
              )}
              {log.extracted_summary.provider && (
                <div>
                  <span className="text-blue-600">Provider:</span>{' '}
                  <span className="text-blue-900 font-medium">
                    {log.extracted_summary.provider}
                  </span>
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
                  <span className="text-blue-900 font-medium">
                    {log.extracted_summary.insured_person}
                  </span>
                </div>
              )}
              {log.extracted_summary.premium && (
                <div>
                  <span className="text-blue-600">Premium:</span>{' '}
                  <span className="text-blue-900 font-medium">
                    ₺{formatNumber(log.extracted_summary.premium)}
                  </span>
                </div>
              )}
              {log.extracted_summary.coverage && (
                <div>
                  <span className="text-blue-600">Coverage:</span>{' '}
                  <span className="text-blue-900 font-medium">
                    ₺{formatNumber(log.extracted_summary.coverage)}
                  </span>
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
                <div className="text-xs font-medium text-red-700 uppercase tracking-wide mb-1">
                  Error Message
                </div>
                <div className="bg-white border border-red-200 rounded p-3 font-mono text-sm text-red-900">
                  {log.error_message}
                </div>
              </div>

              {/* Error Type */}
              {log.error_type && (
                <div>
                  <div className="text-xs font-medium text-red-700 uppercase tracking-wide mb-1">
                    Error Type
                  </div>
                  <div className="inline-flex px-2 py-1 bg-red-100 text-red-800 rounded text-sm font-medium">
                    {log.error_type}
                  </div>
                </div>
              )}

              {/* Error Context Grid */}
              {log.error_context && (
                <div>
                  <div className="text-xs font-medium text-red-700 uppercase tracking-wide mb-2">
                    Error Context
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {log.error_context.extraction_provider && (
                      <div className="bg-white border border-red-200 rounded p-2">
                        <div className="text-xs text-gray-500">Provider</div>
                        <div className="font-medium text-gray-900">
                          {log.error_context.extraction_provider}
                        </div>
                      </div>
                    )}
                    {log.error_context.document_length !== undefined && (
                      <div className="bg-white border border-red-200 rounded p-2">
                        <div className="text-xs text-gray-500">Document Length</div>
                        <div className="font-medium text-gray-900">
                          {log.error_context.document_length.toLocaleString()} chars
                        </div>
                      </div>
                    )}
                    {log.error_context.last_successful_stage && (
                      <div className="bg-white border border-red-200 rounded p-2">
                        <div className="text-xs text-gray-500">Last OK Stage</div>
                        <div className="font-medium text-gray-900">
                          {log.error_context.last_successful_stage}
                        </div>
                      </div>
                    )}
                    {log.error_context.ocr_used !== undefined && (
                      <div className="bg-white border border-red-200 rounded p-2">
                        <div className="text-xs text-gray-500">OCR Used</div>
                        <div className="font-medium text-gray-900">
                          {log.error_context.ocr_used ? 'Yes' : 'No'}
                        </div>
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
              {log.error_context?.data_at_failure &&
                Object.keys(log.error_context.data_at_failure).length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-red-700 uppercase tracking-wide mb-1">
                      Data at Failure
                    </div>
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
          <div className="text-center py-8 text-gray-500">No processing stages recorded yet.</div>
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
        <StageDetailsPanel stage={selectedStage} onClose={() => setSelectedStage(null)} />
      )}
    </div>
  )
}

export default DocumentJourneyViewer
