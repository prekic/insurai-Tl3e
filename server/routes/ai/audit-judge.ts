/**
 * POST /api/ai/audit-judge — Phase 3 follow-up.
 *
 * Per-policy fire-and-forget invocation of the audit judge. The client
 * (`src/lib/audit/judge-client.ts`) calls this after a successful
 * extraction completes; the route validates input, kicks off
 * `runAuditJudge()` in the background, and returns 202 Accepted
 * immediately. The actual judgement (Anthropic call + cache + persist
 * + first-of-typology notification) runs server-side without blocking
 * the user-facing extraction response.
 *
 * Why a separate endpoint and not direct in-process calling from
 * `policy-extractor.ts`: the policy extractor runs in the BROWSER. The
 * audit-judge service uses ANTHROPIC_API_KEY + SUPABASE_SERVICE_ROLE_KEY
 * which are server-only. So the browser fires off a small POST and
 * forgets about it.
 *
 * Rate limiting: `generalLimiter` (the default API limit) — the
 * audit-judge service has its own daily-budget circuit breaker
 * (`judge_max_runs_per_day` from app_settings.audit) for cost control.
 *
 * Security: the request body has no client-supplied auth; this is fine
 * because the endpoint only ever WRITES to the audit_judgements table
 * (via the server-side service-role key), never reads or returns
 * cached judgement data. Rate limiting + payload validation are the
 * abuse mitigations.
 */

import { Request, Response, Router } from 'express'

import logger from '../../lib/logger.js'
import { generalLimiter } from '../../middleware/rate-limit.js'
import {
  validateAuditJudge,
  validateJSON,
  type AuditJudgeInput,
} from '../../middleware/validation.js'
import { runAuditJudge } from '../../services/audit-judge-service.js'

const log = logger.child('AI.AuditJudge')

const router = Router()

router.post(
  '/audit-judge',
  validateJSON,
  generalLimiter,
  validateAuditJudge,
  async (req: Request, res: Response) => {
    const body = req.body as AuditJudgeInput

    // Return 202 Accepted IMMEDIATELY — the client doesn't await the
    // judgement result. We respond before kicking off the work so a
    // slow Anthropic call can't time out the client's fire-and-forget
    // request and surface as a network error in the browser console.
    res.status(202).json({
      ok: true,
      message: 'Audit judge enqueued',
    })

    // Fire-and-forget: the request has already been responded to, so
    // a thrown error here can only be logged. `runAuditJudge` is
    // already defensive (returns null on circuit-breaker trip, missing
    // API key, etc.); we only need to catch fully unexpected errors.
    runAuditJudge({
      insuranceLine: body.insuranceLine,
      country: body.country,
      startDate: body.startDate,
      insurer: body.insurer,
      rawText: body.rawText,
      structuredExtraction: body.structuredExtraction,
      policyId: body.policyId ?? null,
      fixtureId: body.fixtureId ?? null,
    }).catch((err) => {
      log.warn('Audit judge background invocation failed', {
        error: err instanceof Error ? err.message : String(err),
        policyId: body.policyId,
        insuranceLine: body.insuranceLine,
      })
    })
  }
)

export default router
