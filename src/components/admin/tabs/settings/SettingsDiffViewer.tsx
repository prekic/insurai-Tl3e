/**
 * Settings Diff Viewer
 *
 * Visual diff component for comparing previous and new setting values.
 * Supports primitives, objects/arrays (JSON), and null/empty values.
 * Highlights additions, removals, and changes inline.
 */

import { useState } from 'react'
import { ArrowRight, Minus, Plus, Replace, Equal, ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'

interface SettingsDiffViewerProps {
  previousValue: unknown
  newValue: unknown
  /** Render in compact inline mode (for the collapsed entry header) */
  inline?: boolean
}

type ChangeType = 'added' | 'removed' | 'changed' | 'unchanged'

interface DiffLine {
  key?: string
  oldValue?: string
  newValue?: string
  type: ChangeType
}

/** Normalize a value to a consistent string for comparison */
function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

/** Format a value for display */
function formatDisplayValue(value: unknown): string {
  if (value === null || value === undefined) return '(empty)'
  if (typeof value === 'boolean') return value ? 'true' : 'false'
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

/** Check if a value is a plain object (not array, not null) */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Compute diff lines for two objects */
function computeObjectDiff(
  prev: Record<string, unknown>,
  next: Record<string, unknown>
): DiffLine[] {
  const allKeys = new Set([...Object.keys(prev), ...Object.keys(next)])
  const lines: DiffLine[] = []

  for (const key of allKeys) {
    const hasPrev = key in prev
    const hasNext = key in next

    if (hasPrev && hasNext) {
      const oldStr = normalizeValue(prev[key])
      const newStr = normalizeValue(next[key])
      if (oldStr === newStr) {
        lines.push({ key, oldValue: oldStr, newValue: newStr, type: 'unchanged' })
      } else {
        lines.push({ key, oldValue: oldStr, newValue: newStr, type: 'changed' })
      }
    } else if (hasPrev && !hasNext) {
      lines.push({ key, oldValue: normalizeValue(prev[key]), type: 'removed' })
    } else {
      lines.push({ key, newValue: normalizeValue(next[key]), type: 'added' })
    }
  }

  return lines
}

/** Compute inline character-level diff segments for two strings */
interface DiffSegment {
  text: string
  type: 'same' | 'added' | 'removed'
}

function computeInlineStringDiff(oldStr: string, newStr: string): { oldSegments: DiffSegment[]; newSegments: DiffSegment[] } {
  // Find common prefix
  let prefixLen = 0
  const minLen = Math.min(oldStr.length, newStr.length)
  while (prefixLen < minLen && oldStr[prefixLen] === newStr[prefixLen]) {
    prefixLen++
  }

  // Find common suffix (but don't overlap with prefix)
  let suffixLen = 0
  while (
    suffixLen < minLen - prefixLen &&
    oldStr[oldStr.length - 1 - suffixLen] === newStr[newStr.length - 1 - suffixLen]
  ) {
    suffixLen++
  }

  const prefix = oldStr.slice(0, prefixLen)
  const oldMiddle = oldStr.slice(prefixLen, oldStr.length - suffixLen)
  const newMiddle = newStr.slice(prefixLen, newStr.length - suffixLen)
  const suffix = oldStr.slice(oldStr.length - suffixLen)

  const oldSegments: DiffSegment[] = []
  const newSegments: DiffSegment[] = []

  if (prefix) {
    oldSegments.push({ text: prefix, type: 'same' })
    newSegments.push({ text: prefix, type: 'same' })
  }
  if (oldMiddle) {
    oldSegments.push({ text: oldMiddle, type: 'removed' })
  }
  if (newMiddle) {
    newSegments.push({ text: newMiddle, type: 'added' })
  }
  if (suffix) {
    oldSegments.push({ text: suffix, type: 'same' })
    newSegments.push({ text: suffix, type: 'same' })
  }

  return { oldSegments, newSegments }
}

/** Get a human-readable change summary */
function getChangeSummary(previousValue: unknown, newValue: unknown): string {
  const prevEmpty = previousValue === null || previousValue === undefined
  const newEmpty = newValue === null || newValue === undefined

  if (prevEmpty && !newEmpty) return 'Value set'
  if (!prevEmpty && newEmpty) return 'Value cleared'

  if (typeof previousValue === 'number' && typeof newValue === 'number') {
    const diff = newValue - previousValue
    const pct = previousValue !== 0 ? ((diff / previousValue) * 100).toFixed(1) : 'N/A'
    if (diff > 0) return `Increased by ${diff} (${pct}%)`
    if (diff < 0) return `Decreased by ${Math.abs(diff)} (${pct}%)`
    return 'No change'
  }

  if (typeof previousValue === 'boolean' && typeof newValue === 'boolean') {
    return `Toggled ${previousValue ? 'off' : 'on'}`
  }

  if (typeof previousValue === 'string' && typeof newValue === 'string') {
    if (previousValue.length !== newValue.length) {
      return `Text changed (${previousValue.length} → ${newValue.length} chars)`
    }
    return 'Text changed'
  }

  if (isPlainObject(previousValue) && isPlainObject(newValue)) {
    const prevKeys = Object.keys(previousValue)
    const nextKeys = Object.keys(newValue)
    const added = nextKeys.filter(k => !prevKeys.includes(k)).length
    const removed = prevKeys.filter(k => !nextKeys.includes(k)).length
    const changed = prevKeys.filter(k =>
      nextKeys.includes(k) && normalizeValue(previousValue[k]) !== normalizeValue(newValue[k])
    ).length
    const parts: string[] = []
    if (added) parts.push(`${added} added`)
    if (removed) parts.push(`${removed} removed`)
    if (changed) parts.push(`${changed} changed`)
    return parts.length ? parts.join(', ') : 'No change'
  }

  return 'Value changed'
}

/** Render diff segments with inline highlights */
function DiffSegments({ segments }: { segments: DiffSegment[] }) {
  return (
    <span>
      {segments.map((seg, i) => {
        if (seg.type === 'same') {
          return <span key={i}>{seg.text}</span>
        }
        if (seg.type === 'removed') {
          return (
            <span
              key={i}
              className="bg-red-200 text-red-900 rounded-sm px-0.5"
            >
              {seg.text}
            </span>
          )
        }
        return (
          <span
            key={i}
            className="bg-green-200 text-green-900 rounded-sm px-0.5"
          >
            {seg.text}
          </span>
        )
      })}
    </span>
  )
}

/** Inline diff summary for compact display in entry headers */
function InlineDiff({ previousValue, newValue }: { previousValue: unknown; newValue: unknown }) {
  const prevStr = formatDisplayValue(previousValue)
  const newStr = formatDisplayValue(newValue)

  // Truncate long values for inline display
  const maxLen = 30
  const truncPrev = prevStr.length > maxLen ? prevStr.slice(0, maxLen) + '...' : prevStr
  const truncNew = newStr.length > maxLen ? newStr.slice(0, maxLen) + '...' : newStr

  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-mono">
      <span className="text-red-600 line-through">{truncPrev}</span>
      <ArrowRight className="h-3 w-3 text-gray-400 flex-shrink-0" />
      <span className="text-green-600">{truncNew}</span>
    </span>
  )
}

/** Change type icon */
function ChangeTypeIcon({ type }: { type: ChangeType }) {
  switch (type) {
    case 'added':
      return <Plus className="h-3.5 w-3.5 text-green-600" />
    case 'removed':
      return <Minus className="h-3.5 w-3.5 text-red-600" />
    case 'changed':
      return <Replace className="h-3.5 w-3.5 text-amber-600" />
    case 'unchanged':
      return <Equal className="h-3.5 w-3.5 text-gray-400" />
  }
}

/** Full diff view for expanded entry details */
function FullDiffView({ previousValue, newValue }: { previousValue: unknown; newValue: unknown }) {
  const [showUnchanged, setShowUnchanged] = useState(false)

  const prevEmpty = previousValue === null || previousValue === undefined
  const newEmpty = newValue === null || newValue === undefined

  // Case 1: Value set from empty
  if (prevEmpty && !newEmpty) {
    return (
      <div className="space-y-2">
        <Badge variant="success" className="text-xs">Value Set</Badge>
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 font-mono text-sm text-green-800">
          <pre className="whitespace-pre-wrap break-all">{formatDisplayValue(newValue)}</pre>
        </div>
      </div>
    )
  }

  // Case 2: Value cleared
  if (!prevEmpty && newEmpty) {
    return (
      <div className="space-y-2">
        <Badge variant="destructive" className="text-xs">Value Cleared</Badge>
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 font-mono text-sm text-red-800 line-through">
          <pre className="whitespace-pre-wrap break-all">{formatDisplayValue(previousValue)}</pre>
        </div>
      </div>
    )
  }

  // Case 3: Object diff
  if (isPlainObject(previousValue) && isPlainObject(newValue)) {
    const diffLines = computeObjectDiff(previousValue, newValue)
    const changedLines = diffLines.filter(l => l.type !== 'unchanged')
    const unchangedLines = diffLines.filter(l => l.type === 'unchanged')

    return (
      <div className="space-y-2">
        <div className="text-xs text-gray-500">
          {changedLines.length} field{changedLines.length !== 1 ? 's' : ''} changed
          {unchangedLines.length > 0 && `, ${unchangedLines.length} unchanged`}
        </div>
        <div className="border border-gray-200 rounded-lg overflow-hidden divide-y divide-gray-100">
          {changedLines.map((line, i) => (
            <div key={`changed-${i}`} className="flex items-start gap-3 px-3 py-2 text-sm bg-white">
              <ChangeTypeIcon type={line.type} />
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-700">{line.key}</span>
                <div className="mt-1 font-mono text-xs">
                  {line.type === 'added' && (
                    <span className="text-green-700 bg-green-50 rounded px-1 py-0.5">
                      {line.newValue}
                    </span>
                  )}
                  {line.type === 'removed' && (
                    <span className="text-red-700 bg-red-50 rounded px-1 py-0.5 line-through">
                      {line.oldValue}
                    </span>
                  )}
                  {line.type === 'changed' && (
                    <div className="flex flex-col gap-1">
                      <span className="text-red-700 bg-red-50 rounded px-1 py-0.5 line-through">
                        {line.oldValue}
                      </span>
                      <span className="text-green-700 bg-green-50 rounded px-1 py-0.5">
                        {line.newValue}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
          {unchangedLines.length > 0 && (
            <div className="bg-gray-50">
              <button
                className="w-full flex items-center justify-center gap-1 px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                onClick={() => setShowUnchanged(!showUnchanged)}
                type="button"
              >
                {showUnchanged ? (
                  <>
                    <ChevronUp className="h-3 w-3" />
                    Hide {unchangedLines.length} unchanged field{unchangedLines.length !== 1 ? 's' : ''}
                  </>
                ) : (
                  <>
                    <ChevronDown className="h-3 w-3" />
                    Show {unchangedLines.length} unchanged field{unchangedLines.length !== 1 ? 's' : ''}
                  </>
                )}
              </button>
              {showUnchanged && (
                <div className="divide-y divide-gray-100">
                  {unchangedLines.map((line, i) => (
                    <div key={`unchanged-${i}`} className="flex items-start gap-3 px-3 py-2 text-sm text-gray-400">
                      <ChangeTypeIcon type="unchanged" />
                      <div className="flex-1 min-w-0">
                        <span className="font-medium">{line.key}</span>
                        <div className="mt-0.5 font-mono text-xs">{line.oldValue}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // Case 4: Primitive diff with inline character highlighting
  const prevStr = formatDisplayValue(previousValue)
  const newStr = formatDisplayValue(newValue)
  const { oldSegments, newSegments } = computeInlineStringDiff(prevStr, newStr)
  const hasInlineChanges = oldSegments.some(s => s.type !== 'same') || newSegments.some(s => s.type !== 'same')

  return (
    <div className="space-y-2">
      <div className="text-xs text-gray-500">{getChangeSummary(previousValue, newValue)}</div>
      <div className="flex flex-col sm:flex-row items-start sm:items-stretch gap-2 sm:gap-3">
        <div className="flex-1 w-full">
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <Minus className="h-3 w-3 text-red-500" />
            Previous
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 font-mono text-sm text-red-800 overflow-x-auto">
            <pre className="whitespace-pre-wrap break-all">
              {hasInlineChanges ? <DiffSegments segments={oldSegments} /> : prevStr}
            </pre>
          </div>
        </div>
        <div className="hidden sm:flex items-center">
          <ArrowRight className="h-5 w-5 text-gray-400 flex-shrink-0" />
        </div>
        <div className="flex-1 w-full">
          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
            <Plus className="h-3 w-3 text-green-500" />
            New
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 font-mono text-sm text-green-800 overflow-x-auto">
            <pre className="whitespace-pre-wrap break-all">
              {hasInlineChanges ? <DiffSegments segments={newSegments} /> : newStr}
            </pre>
          </div>
        </div>
      </div>
    </div>
  )
}

export function SettingsDiffViewer({ previousValue, newValue, inline = false }: SettingsDiffViewerProps) {
  if (inline) {
    return <InlineDiff previousValue={previousValue} newValue={newValue} />
  }

  return <FullDiffView previousValue={previousValue} newValue={newValue} />
}

// Named exports for testing
export { computeObjectDiff, computeInlineStringDiff, getChangeSummary, normalizeValue, formatDisplayValue }
export type { DiffLine, DiffSegment, ChangeType }
