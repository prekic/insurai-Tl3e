/**
 * Phase 3 — Audit Judge Service.
 *
 * Runs an LLM-as-judge critique against a structured extraction +
 * raw policy text. Cached per typology hash (one row per
 * (insuranceLine × country × yearBucket × insurer × judge_prompt_version))
 * so each unique typology costs at most one Anthropic call until the
 * prompt is edited. A daily-budget circuit breaker (`judge_max_runs_per_day`
 * from `app_settings.audit`) caps cost runaway.
 *
 * Distinct from `server/lib/self-healing.ts` (the extraction self-healing
 * judge that scores accuracy 1-100). The audit judge looks for QUALITY
 * issues that wouldn't fail extraction validation but harm reviewer trust:
 * duplications, missing line items, framing inaccuracies, render gaps,
 * omitted sub-limits.
 *
 * Result shape: `AuditJudgeResult` (see below). Returns null on circuit
 * breaker trip, missing prompt, missing API key, or unrecoverable error
 * — callers (fire-and-forget hooks + CLI) check for null and log warn.
 *
 * See:
 *   - src/lib/audit/typology.ts (cache key derivation)
 *   - server/lib/audit-judge-schema.ts (finding shape)
 *   - supabase/migrations/053_audit_judgements_table.sql (storage)
 *   - supabase/migrations/054_seed_audit_judge_prompt_and_config.sql (prompt + config)
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

import { logger } from '../lib/logger.js'
import { pgErr } from '../lib/pg-err.js'
import { calculateCost } from '../middleware/cost-control.js'
import { getRenderedPrompt } from './prompt-service.js'
import { getAuditConfig } from './config-service.js'
import { notifyAuditQuality } from './admin-notification-service.js'
import {
  AUDIT_JUDGE_FINDING_KINDS,
  type AuditJudgeFinding,
  type AuditJudgeFindingKind,
  type AuditJudgeFindingSeverity,
  type AuditJudgeResponse,
} from '../lib/audit-judge-schema.js'
import {
  computeTypologyHashFromPolicy,
  type TypologyDimensions,
} from '../../src/lib/audit/typology.js'

const log = logger.child('AuditJudge')

const PROMPT_NAME = 'Audit Judge - Kasko'
const ANTHROPIC_TIMEOUT_MS = 180_000
const MAX_DOCUMENT_TEXT_LENGTH = 30_000
const MAX_STRUCTURED_LENGTH = 12_000

// -----------------------------------------------------------------------------
// Lazy clients
// -----------------------------------------------------------------------------

let supabase: SupabaseClient | null = null
function getSupabase(): SupabaseClient | null {
  if (supabase && process.env.NODE_ENV !== 'test') return supabase
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    log.warn('Supabase not configured for AuditJudge')
    return null
  }
  supabase = createClient(url, key)
  return supabase
}

let anthropicClient: Anthropic | null = null
function getAnthropicClient(): Anthropic | null {
  if (anthropicClient && process.env.NODE_ENV !== 'test') return anthropicClient
  if (!process.env.ANTHROPIC_API_KEY) {
    log.warn('ANTHROPIC_API_KEY not set; AuditJudge disabled')
    return null
  }
  anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  return anthropicClient
}

// -----------------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------------

export interface AuditJudgeInput {
  /** Branch / insurance line ('kasko', etc.). */
  insuranceLine: string
  /** ISO 3166-1 alpha-2 country code. Defaults to 'TR'. */
  country?: string
  /** Raw policy start date (DD.MM.YYYY or ISO). Used to derive yearBucket. */
  startDate: string | null | undefined
  /** Insurer / provider name as extracted; will be normalised for hashing. */
  insurer: string
  /** Full extracted PDF text — sanitised (gotcha #106 NUL-strip not required here, performed upstream). */
  rawText: string
  /** Structured AnalyzedPolicy JSON (will be JSON.stringify'd for the prompt). */
  structuredExtraction: unknown
  /** Optional UUID of the source policies row (null for fixture runs). */
  policyId?: string | null
  /** Optional fixture identifier when run from CLI (null for production uploads). */
  fixtureId?: string | null
}

export interface AuditJudgeResult {
  cacheHit: boolean
  judgementId?: string
  typologyHash: string
  typologyDimensions: TypologyDimensions
  findings: AuditJudgeFinding[]
  criticalCount: number
  costUsd: number
}

/**
 * Run the audit judge for a single extraction. Returns the cached
 * result when a row already exists for the typology; otherwise calls
 * Anthropic and persists. Returns null on circuit-breaker trip,
 * missing-prompt, or unrecoverable error — callers MUST handle null.
 */
export async function runAuditJudge(input: AuditJudgeInput): Promise<AuditJudgeResult | null> {
  // 1. Derive typology hash. Skip when start date is unparseable.
  const typology = computeTypologyHashFromPolicy({
    insuranceLine: input.insuranceLine,
    country: input.country,
    startDate: input.startDate,
    insurer: input.insurer,
  })
  if (!typology) {
    log.warn('Skipping audit judge: typology hash could not be derived', {
      insuranceLine: input.insuranceLine,
      startDate: input.startDate,
    })
    return null
  }

  // 2. Load the prompt template — captures version for cache key.
  const structuredJson = JSON.stringify(input.structuredExtraction, null, 2)
  const truncatedText = input.rawText.slice(0, MAX_DOCUMENT_TEXT_LENGTH)
  const truncatedStructured = structuredJson.slice(0, MAX_STRUCTURED_LENGTH)
  const renderedPrompt = await getRenderedPrompt(PROMPT_NAME, {
    document_text: truncatedText,
    structured_extraction: truncatedStructured,
  })
  if (!renderedPrompt) {
    log.warn(`Audit judge prompt template '${PROMPT_NAME}' not found — skipping`)
    return null
  }

  // 3. Cache hit short-circuit.
  const db = getSupabase()
  if (!db) return null
  const { data: cachedRows, error: cacheErr } = await db
    .from('audit_judgements')
    .select('id, findings, critical_count, cost_usd')
    .eq('typology_hash', typology.hash)
    .eq('judge_prompt_version', renderedPrompt.version)
    .order('created_at', { ascending: false })
    .limit(1)
  if (cacheErr) {
    log.warn('Failed to query audit_judgements cache', pgErr(cacheErr))
    // Continue to make the call — cache miss semantics keep the audit alive.
  } else if (cachedRows && cachedRows.length > 0) {
    const row = cachedRows[0] as {
      id: string
      findings: AuditJudgeFinding[]
      critical_count: number
      cost_usd: number | null
    }
    return {
      cacheHit: true,
      judgementId: row.id,
      typologyHash: typology.hash,
      typologyDimensions: typology.dimensions,
      findings: row.findings ?? [],
      criticalCount: row.critical_count ?? 0,
      costUsd: row.cost_usd ?? 0,
    }
  }

  // 4. Daily-budget circuit breaker.
  const auditConfig = await getAuditConfig()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: recentCount, error: countErr } = await db
    .from('audit_judgements')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', since)
  if (countErr) {
    log.warn('Failed to count recent audit_judgements rows', pgErr(countErr))
  } else if (typeof recentCount === 'number' && recentCount >= auditConfig.judgeMaxRunsPerDay) {
    log.warn('Audit judge daily budget exceeded — skipping', {
      recentCount,
      limit: auditConfig.judgeMaxRunsPerDay,
    })
    return null
  }

  // 5. Anthropic call.
  const client = getAnthropicClient()
  if (!client) return null
  const judgeModel = auditConfig.judgeModel
  let response
  try {
    response = await client.messages.create(
      {
        model: judgeModel,
        max_tokens: 8192,
        system: renderedPrompt.systemPrompt,
        messages: [{ role: 'user', content: renderedPrompt.userPrompt }],
        temperature: 0,
      },
      { signal: AbortSignal.timeout(ANTHROPIC_TIMEOUT_MS) }
    )
  } catch (err) {
    log.error('Audit judge Anthropic call failed', {
      error: err instanceof Error ? err.message : String(err),
      typologyHash: typology.hash,
    })
    return null
  }

  // 6. Parse response.
  const textBlock = response.content.find((b) => b.type === 'text')
  let jsonContent = textBlock?.type === 'text' ? textBlock.text : ''
  const fenceMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) jsonContent = fenceMatch[1].trim()
  let parsed: AuditJudgeResponse
  try {
    parsed = JSON.parse(jsonContent) as AuditJudgeResponse
  } catch (err) {
    log.warn('Audit judge returned non-JSON content', {
      typologyHash: typology.hash,
      contentSample: jsonContent.slice(0, 200),
      error: err instanceof Error ? err.message : String(err),
    })
    return null
  }
  if (!isValidAuditJudgeResponse(parsed)) {
    log.warn('Audit judge response failed schema sanity check', {
      typologyHash: typology.hash,
      keys: Object.keys(parsed ?? {}),
    })
    return null
  }

  // 7. Verifiable-quote post-check (gotcha #62 Turkish-fold).
  const verifiedFindings = parsed.findings.map((f) => verifyFinding(f, input.rawText))
  const criticalCount = verifiedFindings.filter((f) => f.severity === 'critical').length

  // 8. Persist row.
  const inputTokens = response.usage?.input_tokens ?? 0
  const outputTokens = response.usage?.output_tokens ?? 0
  const usedModel = response.model || judgeModel
  const costUsd = calculateCost(usedModel, inputTokens, outputTokens).totalCost

  const insertRow = {
    typology_hash: typology.hash,
    typology_dimensions: typology.dimensions,
    policy_id: input.policyId ?? null,
    fixture_id: input.fixtureId ?? null,
    judge_model: usedModel,
    judge_prompt_template_id: renderedPrompt.templateId,
    judge_prompt_version: renderedPrompt.version,
    finding_count: verifiedFindings.length,
    critical_count: criticalCount,
    findings: verifiedFindings,
    raw_critique: jsonContent.slice(0, 8000),
    cost_usd: costUsd,
  }

  const { data: insertedRows, error: insertErr } = await db
    .from('audit_judgements')
    .insert(insertRow)
    .select('id')
    .limit(1)
  if (insertErr) {
    log.error('Failed to persist audit_judgements row', {
      ...pgErr(insertErr),
      typologyHash: typology.hash,
    })
    // Still return the result so callers can act on it; just no cache hit next time.
    return {
      cacheHit: false,
      typologyHash: typology.hash,
      typologyDimensions: typology.dimensions,
      findings: verifiedFindings,
      criticalCount,
      costUsd,
    }
  }

  const judgementId = insertedRows?.[0]?.id

  // 9. First-of-typology critical-finding notification.
  if (criticalCount > 0) {
    const shouldNotify = await shouldNotifyCritical(
      typology.hash,
      auditConfig.judgeCriticalNotifyFirstOnly,
      judgementId
    )
    if (shouldNotify) {
      await notifyAuditQuality(typology.dimensions, parsed.summary, {
        typologyHash: typology.hash,
        typologyDimensions: typology.dimensions,
        findingCount: verifiedFindings.length,
        criticalCount,
        findings: verifiedFindings,
        judgementId,
      }).catch((err) =>
        log.warn('notifyAuditQuality failed', {
          error: err instanceof Error ? err.message : String(err),
        })
      )
    }
  }

  return {
    cacheHit: false,
    judgementId,
    typologyHash: typology.hash,
    typologyDimensions: typology.dimensions,
    findings: verifiedFindings,
    criticalCount,
    costUsd,
  }
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Structural sanity-check on the parsed JSON. Doesn't enforce the full
 * schema (Anthropic compliance is best-effort); just verifies the
 * top-level shape so we don't crash on a missing `findings` field.
 */
function isValidAuditJudgeResponse(value: unknown): value is AuditJudgeResponse {
  if (!value || typeof value !== 'object') return false
  const v = value as Partial<AuditJudgeResponse>
  if (typeof v.summary !== 'string') return false
  if (!Array.isArray(v.findings)) return false
  for (const f of v.findings) {
    if (!f || typeof f !== 'object') return false
    if (
      typeof f.kind !== 'string' ||
      !AUDIT_JUDGE_FINDING_KINDS.includes(f.kind as AuditJudgeFindingKind)
    ) {
      return false
    }
    if (f.severity !== 'critical' && f.severity !== 'warn') return false
    if (typeof f.quote !== 'string' || typeof f.message !== 'string') return false
  }
  return true
}

/**
 * Verify that a finding's quote substring actually appears in the raw text.
 * Hallucinated quotes get downgraded to severity:'warn' + quoteVerified:false.
 * Turkish-fold (gotcha #62) is applied to both sides so İ → i case-folding
 * doesn't produce false negatives.
 */
function verifyFinding(finding: AuditJudgeFinding, rawText: string): AuditJudgeFinding {
  const fold = (s: string) => s.toLowerCase().replace(/i̇/g, 'i')
  const haystack = fold(rawText)
  const needle = fold(finding.quote.trim())
  // Tolerate the LLM collapsing internal whitespace differently from PDF text.
  const normalisedHaystack = haystack.replace(/\s+/g, ' ')
  const normalisedNeedle = needle.replace(/\s+/g, ' ')
  const verified =
    needle.length >= 8 &&
    (haystack.includes(needle) || normalisedHaystack.includes(normalisedNeedle))
  if (verified) {
    return { ...finding, quoteVerified: true }
  }
  // Hallucinated quote — downgrade severity if it was critical.
  const downgraded: AuditJudgeFindingSeverity =
    finding.severity === 'critical' ? 'warn' : finding.severity
  return { ...finding, severity: downgraded, quoteVerified: false }
}

/**
 * Decide whether to enqueue an admin notification for this critical finding.
 * Honours `judge_critical_notify_first_only` (true → notify only when this
 * is the FIRST audit_judgements row for the typology hash, identified by
 * skipping the just-inserted row).
 */
async function shouldNotifyCritical(
  typologyHash: string,
  firstOnly: boolean,
  excludeJudgementId: string | undefined
): Promise<boolean> {
  if (!firstOnly) return true
  const db = getSupabase()
  if (!db) return false
  let query = db
    .from('audit_judgements')
    .select('id', { count: 'exact', head: true })
    .eq('typology_hash', typologyHash)
    .gt('critical_count', 0)
  if (excludeJudgementId) {
    query = query.neq('id', excludeJudgementId)
  }
  const { count, error } = await query
  if (error) {
    log.warn('shouldNotifyCritical query failed', pgErr(error))
    return false
  }
  return (count ?? 0) === 0
}

// Re-exports for downstream consumers.
export type { AuditJudgeFinding, AuditJudgeFindingKind, AuditJudgeFindingSeverity }

// =============================================================================
// PHASE 3 FOLLOW-UP — Per-policy fire-and-forget invocation path
// =============================================================================
//
// The current Phase 3 commit ships:
//   - runAuditJudge() (this file)
//   - DB migrations 053 + 054
//   - tests/fixtures/golden/ corpus
//   - scripts/audit-judge-corpus.ts CLI (npm run audit:judge)
//
// What's NOT yet wired: per-policy invocation from production extraction.
// The cleanest path is a new API endpoint `/api/audit/judge` (POST) that
// the client calls fire-and-forget after `convertToAnalyzedPolicy()`
// succeeds. The endpoint:
//   1. Reads { policyId, structuredExtraction, rawText, ... } from body
//   2. Validates origin / user session
//   3. Calls runAuditJudge() and returns 202 immediately
//      (or runs in background via a queue if response time matters)
//
// Why deferred: the CLI script gives full coverage of the golden corpus,
// which is the primary verification path. The per-policy hook adds a
// separate moving piece (API endpoint + client wrapper + auth check)
// that benefits from being its own commit so the server / endpoint
// changes can be reviewed and rolled back independently.
