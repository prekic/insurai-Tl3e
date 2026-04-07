import { useEffect, useState } from 'react'
import {
  Upload,
  FileText,
  BrainCircuit,
  Search,
  ScanLine,
  Wand2,
  Brain,
  FormInput,
  Table,
  CheckCircle,
  Database,
  Calculator,
  Copy,
  GitMerge,
  Loader2,
  Circle,
  Check,
  Minus,
  type LucideIcon,
} from 'lucide-react'
import { useI18n, useTranslation } from '@/lib/i18n'
import { STAGE_CONFIGS } from '@/types/processing-log'
import type { DocumentProcessingLog, ProcessingStage } from '@/types/processing-log'
import { AnalysisTipsCarousel } from './AnalysisTipsCarousel'

/**
 * Resolves a STAGE_CONFIGS icon name string to a real Lucide component.
 * Falls back to FileText if the name is unknown.
 */
const STAGE_ICON_MAP: Record<string, LucideIcon> = {
  Upload,
  FileText,
  BrainCircuit,
  Search,
  ScanLine,
  Wand2,
  Brain,
  FormInput,
  Table,
  CheckCircle,
  Database,
  Calculator,
  Copy,
  GitMerge,
}

/**
 * User-visible pipeline stages. Internal-only stages (ocr_decision, ocr_check,
 * conflict_resolution) are excluded so the checklist stays concise.
 */
const VISIBLE_STAGES: ProcessingStage[] = [
  'upload',
  'pdf_extraction',
  'ocr_processing', // shown only if it actually runs
  'text_preprocessing',
  'ai_extraction',
  'table_parsing',
  'validation',
  'database_save',
]

/**
 * Tailwind color class lookup for STAGE_CONFIGS.color (string).
 * Keeps colors centralized so the active stage's icon can be tinted.
 */
const COLOR_TO_TEXT: Record<string, string> = {
  blue: 'text-blue-600',
  indigo: 'text-indigo-600',
  purple: 'text-purple-600',
  violet: 'text-violet-600',
  fuchsia: 'text-fuchsia-600',
  pink: 'text-pink-600',
  rose: 'text-rose-600',
  orange: 'text-orange-600',
  amber: 'text-amber-600',
  yellow: 'text-yellow-600',
  lime: 'text-lime-600',
  green: 'text-green-600',
  teal: 'text-teal-600',
}

const COLOR_TO_BG: Record<string, string> = {
  blue: 'bg-blue-100',
  indigo: 'bg-indigo-100',
  purple: 'bg-purple-100',
  violet: 'bg-violet-100',
  fuchsia: 'bg-fuchsia-100',
  pink: 'bg-pink-100',
  rose: 'bg-rose-100',
  orange: 'bg-orange-100',
  amber: 'bg-amber-100',
  yellow: 'bg-yellow-100',
  lime: 'bg-lime-100',
  green: 'bg-green-100',
  teal: 'bg-teal-100',
}

interface AnalysisProgressCardProps {
  fileName: string
  fileSizeBytes?: number
  log: DocumentProcessingLog | null
  state: 'uploading' | 'analyzing'
  startTimeMs: number
}

function formatBytes(bytes: number | undefined): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

function formatDuration(ms?: number): string {
  if (!ms || ms < 0) return ''
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/**
 * Multi-stage animated pipeline visualization for the free-trial analysis.
 *
 * Reads stage events from a ProcessingLogger via subscription (parent passes
 * the latest log snapshot via the `log` prop). Renders a truthful checklist
 * driven by real backend stage transitions — never fake auto-increment.
 *
 * Visual elements:
 * - File header with name, size, and live elapsed-time chip (ticks every 1s)
 * - Active stage banner with localized label and shimmer pulse
 * - Pipeline checklist (visible stages only) with status icons and durations
 * - Honest progress bar based on (completed / visible) stage ratio
 * - Early-win chips (page count, AI provider) appear as backend reports them
 * - Rotating tips carousel at the bottom
 */
export function AnalysisProgressCard({
  fileName,
  fileSizeBytes,
  log,
  state,
  startTimeMs,
}: AnalysisProgressCardProps) {
  const { locale } = useI18n()
  const { t } = useTranslation()

  // Tick elapsed-time chip every 1s so the screen never looks frozen
  const [elapsedMs, setElapsedMs] = useState(() => Date.now() - startTimeMs)
  useEffect(() => {
    const id = setInterval(() => setElapsedMs(Date.now() - startTimeMs), 1000)
    return () => clearInterval(id)
  }, [startTimeMs])

  // Compute per-stage status from the log
  const stageRecords = log?.stages || []
  const stageStatusMap = new Map<
    ProcessingStage,
    { status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped'; durationMs?: number }
  >()
  for (const record of stageRecords) {
    stageStatusMap.set(record.stage, {
      status: record.status as 'pending' | 'running' | 'completed' | 'failed' | 'skipped',
      durationMs: record.duration_ms,
    })
  }

  // Filter visible stages: hide ocr_processing if it never ran
  const visibleStages = VISIBLE_STAGES.filter((stage) => {
    if (stage === 'ocr_processing') {
      const record = stageStatusMap.get(stage)
      return record !== undefined // only show if backend touched it
    }
    return true
  })

  // Honest progress: count completed visible stages over total visible stages
  const completedCount = visibleStages.filter(
    (s) => stageStatusMap.get(s)?.status === 'completed'
  ).length
  const progressPct =
    visibleStages.length > 0 ? Math.round((completedCount / visibleStages.length) * 100) : 0

  // Find currently running stage (banner content)
  const runningStage = visibleStages.find((s) => stageStatusMap.get(s)?.status === 'running')
  const activeStage: ProcessingStage | undefined =
    runningStage || (state === 'uploading' ? 'upload' : undefined)

  const activeStageConfig = activeStage ? STAGE_CONFIGS[activeStage] : null
  const activeIconName = activeStageConfig?.icon || 'FileText'
  const ActiveIcon = STAGE_ICON_MAP[activeIconName] || FileText
  const activeColor = activeStageConfig?.color || 'blue'
  const activeLabel = activeStageConfig
    ? locale === 'tr'
      ? activeStageConfig.labelTr
      : activeStageConfig.label
    : t.tryAnalysis.preparingToAnalyze

  // Early-win chips
  const pageCount = log?.page_count
  const aiProvider = log?.ai_provider

  return (
    <div className="p-6 sm:p-8">
      {/* File header */}
      <div className="flex items-center gap-3 sm:gap-4 mb-5">
        <div className="w-11 h-11 bg-blue-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <FileText className="text-blue-600" size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-gray-900 truncate text-sm sm:text-base">{fileName}</p>
          {fileSizeBytes && <p className="text-xs text-gray-500">{formatBytes(fileSizeBytes)}</p>}
        </div>
        {/* Live elapsed-time chip */}
        <div className="flex-shrink-0 px-2.5 py-1 bg-gray-100 rounded-full text-xs font-medium text-gray-600 tabular-nums">
          {t.tryAnalysis.elapsed} {formatElapsed(elapsedMs)}
        </div>
      </div>

      {/* Active stage banner */}
      <div className="mb-5 flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-gray-50 to-blue-50/40 border border-gray-100 rounded-xl">
        <div
          className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${COLOR_TO_BG[activeColor] || 'bg-blue-100'}`}
        >
          <ActiveIcon
            className={`${COLOR_TO_TEXT[activeColor] || 'text-blue-600'} animate-pulse`}
            size={18}
          />
        </div>
        <p className="flex-1 text-sm font-medium text-gray-800 truncate">{activeLabel}…</p>
      </div>

      {/* Honest progress bar */}
      <div
        className="relative h-2 bg-gray-100 rounded-full overflow-hidden mb-5"
        role="progressbar"
        aria-valuenow={progressPct}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500 ease-out"
          style={{ width: `${progressPct}%` }}
        />
      </div>

      {/* Pipeline checklist */}
      <ul className="space-y-2 mb-5">
        {visibleStages.map((stage) => {
          const record = stageStatusMap.get(stage)
          const status = record?.status || 'pending'
          const cfg = STAGE_CONFIGS[stage]
          const label = locale === 'tr' ? cfg.labelTr : cfg.label

          let StatusIcon: LucideIcon
          let iconClass: string
          let rowClass: string
          if (status === 'completed') {
            StatusIcon = Check
            iconClass = 'text-green-600'
            rowClass = 'text-gray-700'
          } else if (status === 'running') {
            StatusIcon = Loader2
            iconClass = 'text-blue-600 animate-spin'
            rowClass = 'text-gray-900 font-medium'
          } else if (status === 'failed') {
            StatusIcon = Circle
            iconClass = 'text-red-500'
            rowClass = 'text-red-700'
          } else if (status === 'skipped') {
            StatusIcon = Minus
            iconClass = 'text-amber-500'
            rowClass = 'text-gray-500'
          } else {
            // pending
            StatusIcon = Circle
            iconClass = 'text-gray-300'
            rowClass = 'text-gray-400'
          }

          const isRunning = status === 'running'

          return (
            <li
              key={stage}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${rowClass} ${
                isRunning ? 'bg-blue-50/60' : ''
              }`}
            >
              <StatusIcon className={`flex-shrink-0 ${iconClass}`} size={16} />
              <span className="flex-1 truncate">{label}</span>
              {status === 'completed' && record?.durationMs !== undefined && (
                <span className="text-xs text-gray-400 tabular-nums">
                  {formatDuration(record.durationMs)}
                </span>
              )}
            </li>
          )
        })}
      </ul>

      {/* Early-win chips */}
      {(pageCount || aiProvider) && (
        <div className="flex flex-wrap gap-2 mb-2">
          {pageCount && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium"
              style={{ animation: 'fadeIn 0.5s ease both' }}
            >
              📄 {t.tryAnalysis.detectedPages.replace('{count}', String(pageCount))}
            </span>
          )}
          {aiProvider && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-50 text-purple-700 rounded-full text-xs font-medium"
              style={{ animation: 'fadeIn 0.5s ease both' }}
            >
              🤖 {t.tryAnalysis.detectedProvider.replace('{provider}', aiProvider)}
            </span>
          )}
        </div>
      )}

      {/* Educational tips */}
      <AnalysisTipsCarousel />
    </div>
  )
}
