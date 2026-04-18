/**
 * Segments Tab — manage user_segments membership for gated features
 * (currently only `kasko_pilot_reviewers`).
 *
 * Backed by server/routes/admin/segments.ts which:
 *   - Lists members:  GET /api/admin/segments?name=kasko_pilot_reviewers
 *   - Adds members:   POST /api/admin/segments { userId, segmentName }
 *   - Removes:        DELETE /api/admin/segments/:userId/:segmentName
 *
 * Bulk-add UX is UUID-paste-only this session; email resolver is a
 * follow-up (see Phase E runbook + plan doc).
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { UserCheck, Plus, Trash2, RefreshCw, AlertCircle, CheckCircle2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  fetchSegmentMembers,
  bulkAddSegmentMembers,
  removeSegmentMember,
  resolveEmailsToUuids,
  EmailResolverDisabledError,
  type SegmentMember,
  type SegmentBulkAddResult,
} from '@/lib/admin/api'

// Allowlist mirrors server/routes/admin/segments.ts:18.
// New segments should be added there first; tab picks them up automatically.
const AVAILABLE_SEGMENTS = ['kasko_pilot_reviewers'] as const
type SegmentName = (typeof AVAILABLE_SEGMENTS)[number]

type InputMode = 'uuid' | 'email'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function parseUuids(input: string): { valid: string[]; invalid: string[] } {
  const tokens = input
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
  const valid: string[] = []
  const invalid: string[] = []
  for (const t of tokens) {
    if (UUID_REGEX.test(t)) valid.push(t.toLowerCase())
    else invalid.push(t)
  }
  return { valid, invalid }
}

function parseEmails(input: string): { valid: string[]; invalid: string[] } {
  const tokens = input
    .split(/[\s,;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
  const valid: string[] = []
  const invalid: string[] = []
  for (const t of tokens) {
    const lower = t.toLowerCase()
    if (EMAIL_REGEX.test(lower) && !valid.includes(lower)) valid.push(lower)
    else if (!EMAIL_REGEX.test(lower)) invalid.push(t)
  }
  return { valid, invalid }
}

export function SegmentsTab() {
  const [selectedSegment, setSelectedSegment] = useState<SegmentName>(AVAILABLE_SEGMENTS[0])
  const [members, setMembers] = useState<SegmentMember[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [isAddOpen, setIsAddOpen] = useState(false)
  const [inputMode, setInputMode] = useState<InputMode>('uuid')
  const [pasteInput, setPasteInput] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [bulkResults, setBulkResults] = useState<SegmentBulkAddResult[] | null>(null)
  const [resolveError, setResolveError] = useState<string | null>(null)
  const [missingEmails, setMissingEmails] = useState<string[]>([])

  const [removingId, setRemovingId] = useState<string | null>(null)

  const loadMembers = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const rows = await fetchSegmentMembers(selectedSegment)
      setMembers(rows)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load members')
      setMembers([])
    } finally {
      setIsLoading(false)
    }
  }, [selectedSegment])

  useEffect(() => {
    loadMembers()
  }, [loadMembers])

  const parsed = useMemo(
    () => (inputMode === 'uuid' ? parseUuids(pasteInput) : parseEmails(pasteInput)),
    [pasteInput, inputMode]
  )

  const handleSubmitBulk = async () => {
    if (parsed.valid.length === 0 || isSubmitting) return
    setIsSubmitting(true)
    setBulkResults(null)
    setResolveError(null)
    setMissingEmails([])
    try {
      let userIds: string[] = parsed.valid
      if (inputMode === 'email') {
        try {
          const { resolved, missing } = await resolveEmailsToUuids(parsed.valid)
          userIds = resolved.map((r) => r.userId)
          if (missing.length > 0) setMissingEmails(missing)
          if (userIds.length === 0) {
            setResolveError(`No emails resolved to users (${missing.length} missing).`)
            return
          }
        } catch (err) {
          if (err instanceof EmailResolverDisabledError) {
            setResolveError(err.message)
          } else {
            setResolveError(err instanceof Error ? err.message : 'Email resolver failed')
          }
          return
        }
      }
      const results = await bulkAddSegmentMembers(userIds, selectedSegment)
      setBulkResults(results)
      await loadMembers()
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRemove = async (userId: string) => {
    if (removingId) return
    const confirmed = window.confirm(`Remove user ${userId.slice(0, 8)}… from ${selectedSegment}?`)
    if (!confirmed) return
    setRemovingId(userId)
    try {
      await removeSegmentMember(userId, selectedSegment)
      setMembers((prev) => prev.filter((m) => m.user_id !== userId))
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Remove failed')
    } finally {
      setRemovingId(null)
    }
  }

  const addedCount = bulkResults?.filter((r) => r.status === 'added').length ?? 0
  const dupeCount = bulkResults?.filter((r) => r.status === 'already_assigned').length ?? 0
  const errorCount = bulkResults?.filter((r) => r.status === 'error').length ?? 0

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <UserCheck className="h-5 w-5" />
                Segments
              </CardTitle>
              <CardDescription>
                Manage user membership in feature-gating segments (e.g. KASKO pilot reviewers).
                Segment membership is the primary gate — rollout % on the feature flag is a
                secondary filter.
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadMembers} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-gray-700">Segment:</label>
            <select
              value={selectedSegment}
              onChange={(e) => setSelectedSegment(e.target.value as SegmentName)}
              className="border rounded-md px-3 py-1.5 text-sm"
              data-testid="segment-select"
            >
              {AVAILABLE_SEGMENTS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <Badge variant="secondary">{members.length} members</Badge>
            <div className="flex-1" />
            <Button size="sm" onClick={() => setIsAddOpen(true)} data-testid="add-members-open">
              <Plus className="h-4 w-4 mr-1" />
              Add Members
            </Button>
          </div>

          {loadError && (
            <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-3">
              <AlertCircle className="h-4 w-4" />
              {loadError}
            </div>
          )}

          {!isLoading && !loadError && members.length === 0 && (
            <div className="text-sm text-gray-500 text-center py-8">
              No members in <code>{selectedSegment}</code>. Use Add Members to paste user UUIDs.
            </div>
          )}

          {members.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-3 font-medium text-gray-600">User ID</th>
                    <th className="py-2 pr-3 font-medium text-gray-600">Assigned At</th>
                    <th className="py-2 pr-3 font-medium text-gray-600">Assigned By</th>
                    <th className="py-2 text-right font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m) => (
                    <tr
                      key={m.id}
                      className="border-b last:border-0"
                      data-testid={`member-row-${m.user_id}`}
                    >
                      <td className="py-2 pr-3 font-mono text-xs">{m.user_id}</td>
                      <td className="py-2 pr-3 text-gray-600">
                        {new Date(m.assigned_at).toLocaleDateString()}
                      </td>
                      <td className="py-2 pr-3 text-gray-500 font-mono text-xs">
                        {m.assigned_by ? m.assigned_by.slice(0, 8) + '…' : '—'}
                      </td>
                      <td className="py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemove(m.user_id)}
                          disabled={removingId === m.user_id}
                          data-testid={`remove-${m.user_id}`}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {isAddOpen && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Add members to <code>{selectedSegment}</code>
            </CardTitle>
            <CardDescription>
              Paste identifiers (one per line, or separated by spaces/commas). Each will be
              validated client-side and assigned one by one. Invalid rows are dropped silently —
              they appear under &quot;Invalid&quot; below.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div
              className="inline-flex rounded-md border bg-gray-50 p-0.5 text-xs"
              role="tablist"
              data-testid="input-mode-toggle"
            >
              <button
                type="button"
                role="tab"
                aria-selected={inputMode === 'uuid'}
                onClick={() => {
                  setInputMode('uuid')
                  setPasteInput('')
                  setResolveError(null)
                  setMissingEmails([])
                }}
                className={`px-3 py-1 rounded ${
                  inputMode === 'uuid' ? 'bg-white shadow-sm font-medium' : 'text-gray-600'
                }`}
                data-testid="mode-uuid"
              >
                Paste UUIDs
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={inputMode === 'email'}
                onClick={() => {
                  setInputMode('email')
                  setPasteInput('')
                  setResolveError(null)
                  setMissingEmails([])
                }}
                className={`px-3 py-1 rounded ${
                  inputMode === 'email' ? 'bg-white shadow-sm font-medium' : 'text-gray-600'
                }`}
                data-testid="mode-email"
              >
                Paste Emails
              </button>
            </div>
            {inputMode === 'email' && (
              <div className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md p-2">
                Email resolution requires <code>ENABLE_ADMIN_EMAIL_RESOLVER=true</code> on the
                server. Disabled by default pending a privacy review of exposing{' '}
                <code>auth.users.email</code> to admins.
              </div>
            )}
            <textarea
              value={pasteInput}
              onChange={(e) => setPasteInput(e.target.value)}
              placeholder={
                inputMode === 'uuid'
                  ? '00000000-0000-0000-0000-000000000001\n00000000-0000-0000-0000-000000000002'
                  : 'alice@example.com\nbob@example.com'
              }
              className="w-full h-40 border rounded-md p-3 text-sm font-mono"
              data-testid="add-members-textarea"
            />
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <Badge variant="secondary" data-testid="valid-count">
                {parsed.valid.length} valid {inputMode === 'email' ? 'emails' : 'UUIDs'}
              </Badge>
              {parsed.invalid.length > 0 && (
                <Badge variant="destructive" data-testid="invalid-count">
                  {parsed.invalid.length} invalid
                </Badge>
              )}
            </div>
            {parsed.invalid.length > 0 && (
              <details className="text-xs text-gray-500">
                <summary className="cursor-pointer">Show invalid tokens</summary>
                <ul className="mt-1 list-disc list-inside">
                  {parsed.invalid.slice(0, 10).map((t, i) => (
                    <li key={i} className="font-mono">
                      {t}
                    </li>
                  ))}
                  {parsed.invalid.length > 10 && <li>… and {parsed.invalid.length - 10} more</li>}
                </ul>
              </details>
            )}

            {resolveError && (
              <div
                className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md p-2"
                data-testid="resolve-error"
              >
                <AlertCircle className="h-4 w-4 flex-shrink-0" />
                {resolveError}
              </div>
            )}
            {missingEmails.length > 0 && (
              <details className="text-xs text-amber-700" data-testid="missing-emails">
                <summary className="cursor-pointer font-medium">
                  {missingEmails.length} email{missingEmails.length === 1 ? '' : 's'} did not match
                  any user — expand to review
                </summary>
                <ul className="mt-1 list-disc list-inside">
                  {missingEmails.slice(0, 10).map((e, i) => (
                    <li key={i} className="font-mono">
                      {e}
                    </li>
                  ))}
                  {missingEmails.length > 10 && <li>… and {missingEmails.length - 10} more</li>}
                </ul>
              </details>
            )}

            {bulkResults && (
              <div className="text-sm border rounded-md p-3 bg-gray-50 space-y-1">
                <div className="flex items-center gap-2 font-medium">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Bulk-add complete
                </div>
                <div className="text-xs text-gray-600">
                  Added: <span className="font-mono">{addedCount}</span> · Already assigned:{' '}
                  <span className="font-mono">{dupeCount}</span> · Errors:{' '}
                  <span className="font-mono">{errorCount}</span>
                </div>
                {errorCount > 0 && (
                  <details className="text-xs text-red-700">
                    <summary className="cursor-pointer">Show errors</summary>
                    <ul className="mt-1 list-disc list-inside">
                      {bulkResults
                        .filter((r) => r.status === 'error')
                        .slice(0, 10)
                        .map((r) => (
                          <li key={r.userId} className="font-mono">
                            {r.userId.slice(0, 8)}…: {r.message}
                          </li>
                        ))}
                    </ul>
                  </details>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setIsAddOpen(false)
                  setPasteInput('')
                  setBulkResults(null)
                }}
              >
                Close
              </Button>
              <Button
                size="sm"
                onClick={handleSubmitBulk}
                disabled={parsed.valid.length === 0 || isSubmitting}
                data-testid="bulk-submit"
              >
                {isSubmitting
                  ? 'Adding…'
                  : `Add ${parsed.valid.length} user${parsed.valid.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
