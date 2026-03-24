/**
 * Admin Backfill Pilot Routes
 *
 * Provides HTTP endpoints to run the legacy header hydration backfill
 * using the server's existing service-role Supabase client.
 *
 * GET  /backfill/pilot?limit=10            → dry-run classification + proposed changes
 * POST /backfill/pilot  { limit, confirm }  → execute the backfill (writes to DB)
 * GET  /backfill/verify?ids=a,b,c          → verify specific records post-write
 *
 * All require super_admin authentication.
 *
 * ---
 * PRECEDENCE RULES (canonical, shared with scripts/backfill_legacy_policies.ts):
 *
 * 1. DB header columns win if already populated (→ bucket: modern, no action).
 * 2. Missing headers may be recovered from raw_data / extracted_data JSONB
 *    (→ bucket: recoverableFromRawData). Source chain:
 *      insured:  raw_data.insured.name → raw_data.insuredName
 *                → extracted_data.insured.name → extracted_data.insured (string)
 *                → extracted_data.metadata.insured
 *      dates:    raw_data.startDate → extracted_data.startDate
 *                raw_data.endDate → extracted_data.expiryDate → raw_data.expiryDate
 * 3. If headers are still missing but raw_data.processedText exists,
 *    targeted AI re-extraction is possible (→ bucket: requiresReExtraction).
 *    This endpoint does NOT perform re-extraction; use the CLI script for that.
 * 4. Records with no processedText and no recoverable headers are unrecoverable
 *    (→ bucket: unrecoverable). These show "Doğrulanamadı" / "Cannot Verify".
 * 5. Legacy structured arrays (coverages, exclusions, insights) in raw_data
 *    are NEVER overwritten by any hydration path — they remain authoritative.
 *
 * DB COLUMNS (schema: supabase/migrations/001_initial_schema.sql):
 *   insured_person TEXT NOT NULL
 *   start_date     DATE NOT NULL
 *   expiry_date    DATE NOT NULL
 *   There is NO column named "insured" or "end_date".
 */

import { Router, Response } from 'express'
import {
  authenticateAdmin,
  requireSuperAdmin,
  getSupabaseWithError,
  logAdminAction,
  logger,
} from './shared.js'
import type { AuthenticatedRequest } from './shared.js'

const router = Router()
const log = logger.child('backfill')

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Absolute maximum records per request to prevent runaway queries */
const MAX_LIMIT = 200

/** Columns selected from policies table — no "insured" or "end_date" (don't exist) */
const POLICY_SELECT =
  'id, policy_number, insured_person, start_date, expiry_date, raw_data, extracted_data, user_id, type, provider'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PolicyRow {
  id: string
  policy_number: string
  insured_person: string | null
  start_date: string | null
  expiry_date: string | null
  raw_data: Record<string, unknown> | null
  extracted_data: Record<string, unknown> | null
  user_id: string
  type: string
  provider: string
}

type BucketName = 'modern' | 'recoverableFromRawData' | 'requiresReExtraction' | 'unrecoverable'

interface FieldDelta {
  field: string
  before: string | null
  after: string | null
  changed: boolean
}

interface VerificationResult {
  legacy_arrays_before: { coverages: number; exclusions: number; insights: number }
  legacy_arrays_after: { coverages: number; exclusions: number; insights: number }
  arrays_stable: boolean
}

interface ClassifiedPolicy {
  id: string
  policy_number: string
  type: string
  provider: string
  bucket: BucketName
  current: {
    insured_person: string | null
    start_date: string | null
    expiry_date: string | null
  }
  proposed?: {
    insured_person: string | null
    start_date: string | null
    expiry_date: string | null
    source: 'raw_data' | 're-extraction' | 'none'
  }
  deltas?: FieldDelta[]
  legacy_arrays: { coverages: number; exclusions: number; insights: number }
  verification?: VerificationResult
  write_action?: 'updated' | 'skipped_no_changes' | 'skipped_wrong_bucket' | 'error'
  write_error?: string
}

interface BackfillResult {
  mode: 'dry-run' | 'write'
  timestamp: string
  total: number
  buckets: Record<BucketName, number>
  records: ClassifiedPolicy[]
  write_summary?: {
    attempted: number
    updated: number
    skipped: number
    errors: number
    all_arrays_stable: boolean
  }
  errors: string[]
  warnings: string[]
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractRecoverableHeaders(p: PolicyRow) {
  const rd = (p.raw_data || {}) as Record<string, unknown>
  const ed = (p.extracted_data || {}) as Record<string, unknown>

  // Insured recovery chain (same precedence as script)
  const rdInsured = rd.insured as Record<string, unknown> | undefined
  const edInsured = ed.insured as Record<string, unknown> | string | undefined
  const edMeta = ed.metadata as Record<string, unknown> | undefined

  const possibleInsured =
    rdInsured?.name ||
    rd.insuredName ||
    (typeof edInsured === 'object' ? edInsured?.name : edInsured) ||
    edMeta?.insured ||
    null

  // Date recovery chain (same precedence as script)
  const possibleStart = (rd.startDate || ed.startDate || null) as string | null
  const possibleExpiry = (rd.endDate || ed.expiryDate || rd.expiryDate || null) as string | null

  return {
    insured: possibleInsured as string | null,
    startDate: possibleStart,
    expiryDate: possibleExpiry,
  }
}

function countLegacyArrays(p: PolicyRow | { raw_data: Record<string, unknown> | null }) {
  const rd = (p.raw_data || {}) as Record<string, unknown>
  return {
    coverages: Array.isArray(rd.coverages) ? rd.coverages.length : 0,
    exclusions: Array.isArray(rd.exclusions) ? rd.exclusions.length : 0,
    insights: Array.isArray(rd.insights) ? rd.insights.length : 0,
  }
}

function computeDeltas(
  current: ClassifiedPolicy['current'],
  proposed: ClassifiedPolicy['proposed']
): FieldDelta[] {
  if (!proposed) return []
  return [
    {
      field: 'insured_person',
      before: current.insured_person,
      after: proposed.insured_person,
      changed: current.insured_person !== proposed.insured_person,
    },
    {
      field: 'start_date',
      before: current.start_date,
      after: proposed.start_date,
      changed: current.start_date !== proposed.start_date,
    },
    {
      field: 'expiry_date',
      before: current.expiry_date,
      after: proposed.expiry_date,
      changed: current.expiry_date !== proposed.expiry_date,
    },
  ]
}

function parseLimit(raw: unknown): number {
  if (typeof raw === 'string') {
    const n = parseInt(raw, 10)
    if (!isNaN(n) && n > 0) return Math.min(n, MAX_LIMIT)
  }
  return 10
}

function parseOffset(raw: unknown): number {
  if (typeof raw === 'string') {
    const n = parseInt(raw, 10)
    if (!isNaN(n) && n >= 0) return n
  }
  return 0
}

// ---------------------------------------------------------------------------
// Classification (mirrors scripts/backfill_legacy_policies.ts)
// ---------------------------------------------------------------------------

function classifyPolicies(policies: PolicyRow[], mode: 'dry-run' | 'write'): BackfillResult {
  const result: BackfillResult = {
    mode,
    timestamp: new Date().toISOString(),
    total: policies.length,
    buckets: { modern: 0, recoverableFromRawData: 0, requiresReExtraction: 0, unrecoverable: 0 },
    records: [],
    errors: [],
    warnings: [],
  }

  for (const p of policies) {
    const hasInsuredDB = !!p.insured_person
    const hasDatesDB = !!(p.start_date && p.expiry_date)
    const legacy = countLegacyArrays(p)

    const current = {
      insured_person: p.insured_person,
      start_date: p.start_date,
      expiry_date: p.expiry_date,
    }

    // Bucket: modern — all header fields present in DB columns
    if (hasInsuredDB && hasDatesDB) {
      result.buckets.modern++
      result.records.push({
        id: p.id,
        policy_number: p.policy_number,
        type: p.type,
        provider: p.provider,
        bucket: 'modern',
        current,
        legacy_arrays: legacy,
      })
      continue
    }

    // Attempt recovery from raw_data / extracted_data
    const recovered = extractRecoverableHeaders(p)
    const effectivelyHasInsured = hasInsuredDB || !!recovered.insured
    const effectivelyHasDates = hasDatesDB || (!!recovered.startDate && !!recovered.expiryDate)

    if (effectivelyHasInsured && effectivelyHasDates) {
      result.buckets.recoverableFromRawData++
      const proposed = {
        insured_person: recovered.insured || p.insured_person,
        start_date: recovered.startDate || p.start_date,
        expiry_date: recovered.expiryDate || p.expiry_date,
        source: 'raw_data' as const,
      }
      const deltas = computeDeltas(current, proposed)

      // Warn if proposed values look suspicious
      if (proposed.start_date && !/^\d{4}-\d{2}-\d{2}/.test(proposed.start_date)) {
        result.warnings.push(
          `${p.id}: recovered start_date '${proposed.start_date}' is not YYYY-MM-DD format`
        )
      }
      if (proposed.expiry_date && !/^\d{4}-\d{2}-\d{2}/.test(proposed.expiry_date)) {
        result.warnings.push(
          `${p.id}: recovered expiry_date '${proposed.expiry_date}' is not YYYY-MM-DD format`
        )
      }

      result.records.push({
        id: p.id,
        policy_number: p.policy_number,
        type: p.type,
        provider: p.provider,
        bucket: 'recoverableFromRawData',
        current,
        proposed,
        deltas,
        legacy_arrays: legacy,
      })
      continue
    }

    // Check for processedText → re-extraction possible
    const rd = (p.raw_data || {}) as Record<string, unknown>
    if (rd.processedText) {
      result.buckets.requiresReExtraction++
      result.records.push({
        id: p.id,
        policy_number: p.policy_number,
        type: p.type,
        provider: p.provider,
        bucket: 'requiresReExtraction',
        current,
        legacy_arrays: legacy,
      })
    } else {
      result.buckets.unrecoverable++
      result.records.push({
        id: p.id,
        policy_number: p.policy_number,
        type: p.type,
        provider: p.provider,
        bucket: 'unrecoverable',
        current,
        legacy_arrays: legacy,
      })
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /backfill/pilot — Dry-run: classify policies and show proposed changes.
 * Performs zero writes. Safe to call repeatedly.
 *
 * Query params:
 *   limit  — max records to scan (default 10, max 200)
 *   offset — skip first N records for pagination (default 0)
 */
router.get(
  '/backfill/pilot',
  authenticateAdmin,
  requireSuperAdmin(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const limit = parseLimit(req.query.limit)
      const offset = parseOffset(req.query.offset)

      const { client: supabase } = getSupabaseWithError()
      if (!supabase) {
        return res.status(503).json({ success: false, error: 'Database not configured' })
      }

      const { data: policies, error } = await supabase
        .from('policies')
        .select(POLICY_SELECT)
        .range(offset, offset + limit - 1)

      if (error) {
        log.error('Failed to fetch policies', { error: error.message })
        return res
          .status(500)
          .json({ success: false, error: 'Database query failed', details: error.message })
      }

      const result = classifyPolicies(policies as PolicyRow[], 'dry-run')

      logAdminAction(req, 'backfill_pilot_dryrun', 'policies', undefined, undefined, {
        limit,
        offset,
        total: result.total,
        buckets: result.buckets,
      })

      return res.json({ success: true, data: result })
    } catch (err) {
      log.error('Backfill pilot dry-run failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return res.status(500).json({ success: false, error: 'Internal server error' })
    }
  }
)

/**
 * POST /backfill/pilot — Execute: hydrate header fields from raw_data.
 *
 * Body (JSON):
 *   confirm — must be true to execute writes (safety gate)
 *   limit   — max records to process (default 10, max 200)
 *   offset  — skip first N records (default 0)
 *   ids     — optional string[] of specific policy IDs to process
 *
 * Only processes records in the 'recoverableFromRawData' bucket.
 * Does NOT perform AI re-extraction (use CLI script for that).
 */
router.post(
  '/backfill/pilot',
  authenticateAdmin,
  requireSuperAdmin(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = req.body || {}

      // Safety gate: require explicit confirmation
      if (body.confirm !== true) {
        return res.status(400).json({
          success: false,
          error: 'Write mode requires { "confirm": true } in request body',
          hint: 'Use GET /api/admin/backfill/pilot for dry-run first',
        })
      }

      const limit = parseLimit(body.limit ?? req.query.limit)
      const offset = parseOffset(body.offset ?? req.query.offset)
      const filterIds: string[] | undefined = Array.isArray(body.ids) ? body.ids : undefined

      const { client: supabase } = getSupabaseWithError()
      if (!supabase) {
        return res.status(503).json({ success: false, error: 'Database not configured' })
      }

      // Fetch policies — optionally filtered by IDs
      let query = supabase.from('policies').select(POLICY_SELECT)
      if (filterIds && filterIds.length > 0) {
        query = query.in('id', filterIds)
      } else {
        query = query.range(offset, offset + limit - 1)
      }

      const { data: policies, error } = await query
      if (error) {
        log.error('Failed to fetch policies', { error: error.message })
        return res
          .status(500)
          .json({ success: false, error: 'Database query failed', details: error.message })
      }

      const result = classifyPolicies(policies as PolicyRow[], 'write')

      // Execute hydration for recoverable records only
      let attempted = 0
      let updated = 0
      let skipped = 0

      for (const record of result.records) {
        if (record.bucket !== 'recoverableFromRawData' || !record.proposed) {
          record.write_action = 'skipped_wrong_bucket'
          continue
        }

        const p = (policies as PolicyRow[]).find((pol) => pol.id === record.id)
        if (!p) continue

        attempted++

        // Build update object — only include fields that actually changed
        const updates: Record<string, unknown> = {}
        if (record.proposed.insured_person && record.proposed.insured_person !== p.insured_person) {
          updates.insured_person = record.proposed.insured_person
        }
        if (record.proposed.start_date && record.proposed.start_date !== p.start_date) {
          updates.start_date = record.proposed.start_date
        }
        if (record.proposed.expiry_date && record.proposed.expiry_date !== p.expiry_date) {
          updates.expiry_date = record.proposed.expiry_date
        }

        if (Object.keys(updates).length === 0) {
          record.write_action = 'skipped_no_changes'
          skipped++
          continue
        }

        // Snapshot legacy arrays BEFORE update
        const legacyBefore = countLegacyArrays(p)

        const { error: updateError } = await supabase
          .from('policies')
          .update(updates)
          .eq('id', record.id)

        if (updateError) {
          record.write_action = 'error'
          record.write_error = updateError.message
          result.errors.push(`${record.id}: ${updateError.message}`)
          log.error('Failed to update policy', { id: record.id, error: updateError.message })
          continue
        }

        updated++
        record.write_action = 'updated'

        // Post-write verification: re-read row and confirm legacy arrays unchanged
        const { data: afterRow } = await supabase
          .from('policies')
          .select('raw_data')
          .eq('id', record.id)
          .single()

        if (afterRow) {
          const legacyAfter = countLegacyArrays(afterRow as PolicyRow)
          const stable =
            legacyAfter.coverages === legacyBefore.coverages &&
            legacyAfter.exclusions === legacyBefore.exclusions &&
            legacyAfter.insights === legacyBefore.insights

          record.verification = {
            legacy_arrays_before: legacyBefore,
            legacy_arrays_after: legacyAfter,
            arrays_stable: stable,
          }

          if (!stable) {
            result.errors.push(
              `CRITICAL: Legacy arrays changed for ${record.id}! Before: ${JSON.stringify(legacyBefore)}, After: ${JSON.stringify(legacyAfter)}`
            )
            log.error('CRITICAL: Legacy arrays changed during backfill', {
              id: record.id,
              before: legacyBefore,
              after: legacyAfter,
            })
          }
        }
      }

      result.write_summary = {
        attempted,
        updated,
        skipped,
        errors: result.errors.length,
        all_arrays_stable: result.records
          .filter((r) => r.verification)
          .every((r) => r.verification?.arrays_stable === true),
      }

      logAdminAction(req, 'backfill_pilot_execute', 'policies', undefined, undefined, {
        limit,
        offset,
        filterIds,
        total: result.total,
        buckets: result.buckets,
        write_summary: result.write_summary,
      })

      return res.json({ success: true, data: result })
    } catch (err) {
      log.error('Backfill pilot execution failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return res.status(500).json({ success: false, error: 'Internal server error' })
    }
  }
)

/**
 * GET /backfill/verify?ids=uuid1,uuid2 — Verify specific records post-write.
 * Returns current DB state + legacy array counts for the given IDs.
 */
router.get(
  '/backfill/verify',
  authenticateAdmin,
  requireSuperAdmin(),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const idsParam = req.query.ids as string | undefined
      if (!idsParam) {
        return res
          .status(400)
          .json({ success: false, error: 'Query param "ids" is required (comma-separated UUIDs)' })
      }

      const ids = idsParam
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      if (ids.length === 0 || ids.length > 50) {
        return res.status(400).json({ success: false, error: 'Provide 1-50 comma-separated IDs' })
      }

      const { client: supabase } = getSupabaseWithError()
      if (!supabase) {
        return res.status(503).json({ success: false, error: 'Database not configured' })
      }

      const { data: policies, error } = await supabase
        .from('policies')
        .select(POLICY_SELECT)
        .in('id', ids)

      if (error) {
        return res.status(500).json({ success: false, error: error.message })
      }

      const records = (policies as PolicyRow[]).map((p) => ({
        id: p.id,
        policy_number: p.policy_number,
        type: p.type,
        provider: p.provider,
        insured_person: p.insured_person,
        start_date: p.start_date,
        expiry_date: p.expiry_date,
        legacy_arrays: countLegacyArrays(p),
        has_processed_text: !!(p.raw_data as Record<string, unknown> | null)?.processedText,
      }))

      return res.json({ success: true, data: { total: records.length, records } })
    } catch (err) {
      log.error('Backfill verify failed', {
        error: err instanceof Error ? err.message : String(err),
      })
      return res.status(500).json({ success: false, error: 'Internal server error' })
    }
  }
)

export default router
