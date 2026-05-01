/**
 * Phase 1 self-audit detectors.
 *
 * Pure functions that take fragments of an `AnalyzedPolicy` (and optionally
 * the raw extracted PDF text) and emit `QualityFinding` records. Used by:
 *
 *   1. `scripts/qa-extraction-quality.ts` — backend QA gate (CSV + markdown
 *      report, exit-non-zero on critical findings).
 *   2. `src/lib/policy-evaluation/evaluator.ts` — runtime per-policy
 *      evaluation; critical findings flip `extractionIncomplete` and cap
 *      `displayedAiConfidence`, warn findings surface in a non-blocking
 *      "Quality findings" panel.
 *
 * Each detector returns either `null` (nothing to report; pure pass case
 * needs no row) or a `QualityFinding` with `severity: 'pass' | 'warn' |
 * 'critical'`. Callers decide whether to record pass-rows for audit-trail
 * completeness.
 *
 * Trigger codes (stable; consumed by `evaluator.ts` filter):
 *   - FINANCIAL_RISKS_DUPLICATED
 *   - EK_SOZLESME_BULLETS_UNDERREPORTED
 *   - NAMED_SCENARIO_MISSING_HIGH_IMPACT
 *   - NAMED_SCENARIO_MISSING
 *   - CARVE_OUT_DISPLAY_MISMATCH
 *
 * Reusable building blocks (all imported from existing modules — gotcha #45
 * note: this file lives under `src/lib/` so it's safe for both Vite
 * (browser) and Node (qa script) consumers):
 *   - `dedupByTrigramJaccard()` from `policy-converter.ts`
 *   - `extractEkSozlesmeBullets()` from `policy-converter.ts`
 *   - `NAMED_DEDUCTIBLE_SCENARIOS` from `policy-converter.ts`
 *
 * Two helpers (`bucketSeverityByPercent`, `hasLatentCarveOutSignals`) are
 * INLINED below rather than imported from `evaluator.ts` to break a
 * potential circular import cycle should `evaluator.ts` later wire these
 * detectors into the runtime gate.
 */

import {
  dedupByTrigramJaccard,
  extractEkSozlesmeBullets,
  NAMED_DEDUCTIBLE_SCENARIOS,
} from '../ai/policy-converter.js'
import type { Coverage } from '../../types/policy.js'
import type { QualityFinding, ScenarioCard } from '../policy-evaluation/types.js'

/**
 * Inlined to break a potential circular import cycle (evaluator.ts already
 * exports `bucketConditionalDeductibleSeverity`, but if `evaluator.ts`
 * later imports from this module to wire detectors into the runtime gate,
 * the cycle could leave one of the functions `undefined` during module
 * init in some bundlers). Mirror of the implementation at
 * `src/lib/policy-evaluation/evaluator.ts:bucketConditionalDeductibleSeverity`.
 * Severity returned here uses our 3-level enum (`pass | warn | critical`).
 */
function bucketSeverityByPercent(scenario: string): {
  severity: 'critical' | 'warn'
  percent: number | null
} {
  const m = scenario.match(/%\s*(\d{1,3})(?!\d)/)
  if (!m) return { severity: 'warn', percent: null }
  const percent = Math.min(100, Math.max(0, parseInt(m[1], 10)))
  if (percent >= 80) return { severity: 'critical', percent }
  return { severity: 'warn', percent }
}

/**
 * Location keywords for the canonical Artan Mali Sorumluluk Sınırsız
 * carve-out (airports, ports, fuel depots, refineries). Mirrors
 * `IMM_CARVEOUT_LOCATION_HINTS` in `evaluator.ts` — kept inline to avoid the
 * circular import noted above.
 */
const IMM_CARVEOUT_LOCATION_HINTS = [
  'havaliman',
  'liman',
  'akaryak',
  'rafineri',
  'benzin istasyon',
  'kimyasal',
  'mühimmat',
  'tren istasyon',
  'demiryolu',
]

/**
 * Inlined inspector that mirrors `detectImmCarveOut` in `evaluator.ts`:
 * returns true when a coverage's clause/quote/description text contains
 * canonical IMM carve-out signals (location hint OR amount marker like
 * 2,500,000 / 2.5 milyon). Used to flag latent carve-outs the LLM should
 * have populated into `coverage.carveOuts`.
 */
function hasLatentCarveOutSignals(coverage: Coverage): boolean {
  const haystack =
    `${coverage.clause ?? ''} ${coverage.quote ?? ''} ${coverage.description ?? ''}`.toLowerCase()
  if (!haystack.trim()) return false
  const locationHit = IMM_CARVEOUT_LOCATION_HINTS.some((h) => haystack.includes(h))
  const amountHit = /2[.,\s]*500[.,\s]*000/.test(haystack) || /2[,.]?5\s*milyon/.test(haystack)
  return locationHit && amountHit
}

// -----------------------------------------------------------------------------
// Detector 1 — Financial-risks dedup
// -----------------------------------------------------------------------------

/**
 * Reviewer feedback (Sprint 3, Anadolu Birleşik Kasko round): the Critical
 * Financial Risks panel showed three Pert Araç entries for what was
 * structurally one underlying clause. The semantic dedup that already exists
 * for exclusion paraphrasing (`dedupByTrigramJaccard`) was not being applied
 * to the bucketed conditional-deductibles list.
 *
 * Input: the policy's `conditionalDeductibles[]` (canonical strings emitted
 * by `classifyExclusions()`, format `"<Scenario>: %<N>"`).
 *
 * Severity:
 *   - `pass`     — no collapses
 *   - `warn`     — 1-2 collapses
 *   - `critical` — 3+ collapses (the reviewer's case: 3 Pert rows)
 */
export function checkFinancialRisksDedup(
  conditionalDeductibles: string[] | undefined | null
): QualityFinding {
  const input = Array.isArray(conditionalDeductibles) ? conditionalDeductibles : []
  if (input.length <= 1) {
    return {
      check: 'FINANCIAL_RISKS_DUPLICATED',
      severity: 'pass',
      detail: `${input.length} conditional deductible row(s); nothing to dedup`,
    }
  }
  const deduped = dedupByTrigramJaccard(input, 0.65)
  const collapsed = input.length - deduped.length
  if (collapsed === 0) {
    return {
      check: 'FINANCIAL_RISKS_DUPLICATED',
      severity: 'pass',
      detail: `${input.length} rows, no semantic duplicates`,
    }
  }
  const severity: QualityFinding['severity'] = collapsed >= 3 ? 'critical' : 'warn'
  return {
    check: 'FINANCIAL_RISKS_DUPLICATED',
    severity,
    detail: `Collapsed ${input.length}→${deduped.length} issue rows (${collapsed} duplicates)`,
  }
}

// -----------------------------------------------------------------------------
// Detector 2 — EK SÖZLEŞME bullet count parity
// -----------------------------------------------------------------------------

/**
 * Reviewer feedback: Anadolu policy had 11 bulleted Ek Sözleşme add-on items
 * but only 1 surfaced in the Coverage Details panel. The deterministic
 * fallback `extractEkSozlesmeBullets()` was added in gotcha #92 to catch
 * cases where the LLM under-extracts supplementary coverages — but no audit
 * existed to flag the gap.
 *
 * Input: raw extracted PDF text + count of supplementary coverages
 * (`policy.coverages.filter(c => c.category === 'supplementary').length`).
 *
 * Severity:
 *   - `pass`     — bullets ≤ 2 (no parity check meaningful) OR ratio ≥ 0.9
 *   - `warn`     — ratio in [0.5, 0.9) OR shortfall ≤ 2
 *   - `critical` — ratio < 0.5 AND shortfall ≥ 5
 */
export function checkEkSozlesmeBulletParity(
  rawText: string | undefined | null,
  supplementaryCount: number
): QualityFinding {
  if (!rawText || rawText.length < 20) {
    return {
      check: 'EK_SOZLESME_BULLETS_UNDERREPORTED',
      severity: 'pass',
      detail: 'no raw text available; check skipped',
    }
  }
  const bullets = extractEkSozlesmeBullets(rawText)
  const bulletCount = bullets.length
  if (bulletCount <= 2) {
    return {
      check: 'EK_SOZLESME_BULLETS_UNDERREPORTED',
      severity: 'pass',
      detail: `${bulletCount} bullets detected in raw text; threshold not meaningful`,
    }
  }
  const ratio = bulletCount > 0 ? supplementaryCount / bulletCount : 1
  const shortfall = Math.max(0, bulletCount - supplementaryCount)
  const detail = `raw text has ${bulletCount} EK SÖZLEŞME bullets, structured output has ${supplementaryCount} supplementary coverages (ratio ${(ratio * 100).toFixed(0)}%, shortfall ${shortfall})`
  if (ratio >= 0.9) {
    return {
      check: 'EK_SOZLESME_BULLETS_UNDERREPORTED',
      severity: 'pass',
      detail,
    }
  }
  if (ratio < 0.5 && shortfall >= 5) {
    return {
      check: 'EK_SOZLESME_BULLETS_UNDERREPORTED',
      severity: 'critical',
      detail,
    }
  }
  return {
    check: 'EK_SOZLESME_BULLETS_UNDERREPORTED',
    severity: 'warn',
    detail,
  }
}

// -----------------------------------------------------------------------------
// Detector 3 — Named-scenario coverage probe
// -----------------------------------------------------------------------------

/**
 * Reviewer feedback: the Anadolu policy explicitly defined a 80% Kullanım
 * Şekli deductible (rideshare/rental misuse) and a 80% LPG fire deductible,
 * but neither showed up in the Critical Financial Risks panel. The
 * `NAMED_DEDUCTIBLE_SCENARIOS` table already enumerates the seven canonical
 * scenarios (gotcha #93); this detector inverts the lookup to flag
 * scenarios present in raw text but absent from the structured output.
 *
 * Input: raw text + the policy's `conditionalDeductibles[]`.
 *
 * Severity:
 *   - `pass`     — no missing scenarios
 *   - `warn`     — at least one missing scenario at < 80% deductible
 *   - `critical` — at least one missing scenario at ≥ 80% deductible
 *                  (per `bucketConditionalDeductibleSeverity()`)
 *
 * The percentage is sniffed from the raw text within ±200 chars of the
 * scenario keyword match. If no percentage is found, severity defaults to
 * `warn` (we know the scenario was mentioned but can't tell its impact).
 */
export function checkNamedScenarioCoverage(
  rawText: string | undefined | null,
  conditionalDeductibles: string[] | undefined | null
): QualityFinding {
  if (!rawText || rawText.length < 20) {
    return {
      check: 'NAMED_SCENARIO_MISSING',
      severity: 'pass',
      detail: 'no raw text available; check skipped',
    }
  }
  // Normalise Turkish İ→i case-folding bug (gotcha #62). Without this,
  // patterns like /ilk/i fail against "İlk cam" because V8 lowercases İ
  // to "i + combining dot above" (U+0307), which breaks string-position
  // regex matching for the literal "ilk" alternative.
  const rawNormalized = rawText.toLowerCase().replace(/i̇/g, 'i')
  const cd = Array.isArray(conditionalDeductibles) ? conditionalDeductibles : []
  const cdLower = cd.map((s) => s.toLowerCase().replace(/i̇/g, 'i'))

  const missing: { label: string; severity: QualityFinding['severity']; percent: number | null }[] =
    []
  for (const scenario of NAMED_DEDUCTIBLE_SCENARIOS) {
    // All keywords for the scenario must appear somewhere in the text.
    let firstMatchIndex = -1
    let allMatch = true
    for (const kw of scenario.keywords) {
      const m = rawNormalized.match(kw)
      if (!m || m.index === undefined) {
        allMatch = false
        break
      }
      if (firstMatchIndex === -1 || m.index < firstMatchIndex) firstMatchIndex = m.index
    }
    if (!allMatch || firstMatchIndex < 0) continue

    // Already extracted? Substring match against existing canonical labels.
    const labelLower = scenario.labelTr.toLowerCase().replace(/i̇/g, 'i')
    if (cdLower.some((cdEntry) => cdEntry.includes(labelLower))) continue

    // Sniff the percent in a window around the first keyword match.
    const windowStart = Math.max(0, firstMatchIndex - 200)
    const windowEnd = Math.min(rawNormalized.length, firstMatchIndex + 200)
    const window = rawNormalized.slice(windowStart, windowEnd)
    const pctMatch = window.match(/%\s*(\d{1,3})(?!\d)/) || window.match(/(\d{1,3})\s*%/)
    let percent: number | null = null
    if (pctMatch) {
      const parsed = parseInt(pctMatch[1], 10)
      if (parsed > 0 && parsed <= 100) percent = parsed
    }
    const probeStr = percent !== null ? `: %${percent}` : ''
    const sev = bucketSeverityByPercent(`${scenario.labelTr}${probeStr}`).severity
    missing.push({ label: scenario.labelTr, severity: sev, percent })
  }

  if (missing.length === 0) {
    return {
      check: 'NAMED_SCENARIO_MISSING',
      severity: 'pass',
      detail: `all detected named scenarios present in conditionalDeductibles`,
    }
  }
  const anyCritical = missing.some((m) => m.severity === 'critical')
  const summary = missing
    .map((m) => `${m.label}${m.percent !== null ? ` (%${m.percent})` : ''}`)
    .join('; ')
  return {
    check: anyCritical ? 'NAMED_SCENARIO_MISSING_HIGH_IMPACT' : 'NAMED_SCENARIO_MISSING',
    severity: anyCritical ? 'critical' : 'warn',
    detail: `missing from conditionalDeductibles: ${summary}`,
  }
}

// -----------------------------------------------------------------------------
// Detector 4 — Carve-out display contract
// -----------------------------------------------------------------------------

/**
 * Reviewer feedback: "Excess Liability Unlimited" was rendered as a
 * confident headline despite the policy explicitly capping it at 2,500,000
 * TL at airports, ports, fuel depots, refineries, and similar high-exposure
 * locations. The data layer already supports `Coverage.carveOuts[]` and
 * `ScenarioCard.caveat` (gotcha #94) — this detector flags the structural
 * mismatch where unlimited coverages have populated carve-outs but the
 * downstream scenario cards never render a caveat.
 *
 * Input: full coverages list + the evaluation's scenarioCards.
 *
 * Severity:
 *   - `pass`     — no unlimited-with-carveOuts coverages, OR all such
 *                  coverages have at least one scenario with non-empty caveat
 *   - `critical` — at least one unlimited coverage with `carveOuts.length > 0`
 *                  AND no scenario card surfaces a caveat
 *   - `warn`     — at least one unlimited coverage where `carveOuts` is
 *                  empty/null but `detectImmCarveOut()` finds latent carve-out
 *                  signals in the clause/quote text (i.e. we should have
 *                  extracted the carve-out but didn't)
 */
export function checkCarveOutDisplayContract(
  coverages: Coverage[] | undefined | null,
  scenarioCards: ScenarioCard[] | undefined | null
): QualityFinding {
  const cov = Array.isArray(coverages) ? coverages : []
  const cards = Array.isArray(scenarioCards) ? scenarioCards : []
  const unlimited = cov.filter((c) => c.isUnlimited === true)
  if (unlimited.length === 0) {
    return {
      check: 'CARVE_OUT_DISPLAY_MISMATCH',
      severity: 'pass',
      detail: 'no unlimited coverages; nothing to verify',
    }
  }
  const anyCardCaveat = cards.some((s) => Boolean(s.caveat || s.caveatTR))

  // Path A: data has carveOuts but UI/scenarios surface no caveat
  const withCarveOuts = unlimited.filter(
    (c) => Array.isArray(c.carveOuts) && c.carveOuts.length > 0
  )
  if (withCarveOuts.length > 0 && !anyCardCaveat) {
    const names = withCarveOuts.map((c) => c.name || c.nameTr || 'unnamed').join('; ')
    return {
      check: 'CARVE_OUT_DISPLAY_MISMATCH',
      severity: 'critical',
      detail: `${withCarveOuts.length} unlimited coverage(s) with populated carveOuts but no scenario card surfaces a caveat: ${names}`,
    }
  }

  // Path B: data has no carveOuts but raw clause/quote text mentions them
  const latent = unlimited.filter((c) => !Array.isArray(c.carveOuts) || c.carveOuts.length === 0)
  const latentMissed = latent.filter((c) => hasLatentCarveOutSignals(c))
  if (latentMissed.length > 0) {
    const names = latentMissed.map((c) => c.name || c.nameTr || 'unnamed').join('; ')
    return {
      check: 'CARVE_OUT_DISPLAY_MISMATCH',
      severity: 'warn',
      detail: `${latentMissed.length} unlimited coverage(s) have carve-out signals in clause/quote text but carveOuts[] not populated: ${names}`,
    }
  }

  return {
    check: 'CARVE_OUT_DISPLAY_MISMATCH',
    severity: 'pass',
    detail: `${unlimited.length} unlimited coverage(s); no carve-out display mismatches`,
  }
}

// -----------------------------------------------------------------------------
// Aggregator
// -----------------------------------------------------------------------------

export interface DetectorInputs {
  conditionalDeductibles?: string[] | null
  coverages?: Coverage[] | null
  scenarioCards?: ScenarioCard[] | null
  rawText?: string | null
  /** Number of coverages where category === 'supplementary' (caller computes
   *  this — keeps the detector module independent of `Coverage.category`'s
   *  exact string union). */
  supplementaryCount?: number
}

/**
 * Run all 4 detectors and return their findings. Caller decides what to do
 * with each (e.g. write to CSV, append to `evaluation.qualityFindings`,
 * escalate critical findings into `extractionGateTriggers`).
 */
export function runAllQualityDetectors(inputs: DetectorInputs): QualityFinding[] {
  const supplementaryCount =
    typeof inputs.supplementaryCount === 'number'
      ? inputs.supplementaryCount
      : (inputs.coverages ?? []).filter((c) => c.category === 'supplementary').length
  return [
    checkFinancialRisksDedup(inputs.conditionalDeductibles),
    checkEkSozlesmeBulletParity(inputs.rawText ?? null, supplementaryCount),
    checkNamedScenarioCoverage(inputs.rawText ?? null, inputs.conditionalDeductibles),
    checkCarveOutDisplayContract(inputs.coverages, inputs.scenarioCards),
  ]
}

/** Trigger codes that should flip `extractionIncomplete` when severity is critical. */
export const CRITICAL_QUALITY_TRIGGERS = [
  'FINANCIAL_RISKS_DUPLICATED',
  'EK_SOZLESME_BULLETS_UNDERREPORTED',
  'NAMED_SCENARIO_MISSING_HIGH_IMPACT',
  'CARVE_OUT_DISPLAY_MISMATCH',
] as const

export type CriticalQualityTrigger = (typeof CRITICAL_QUALITY_TRIGGERS)[number]

/**
 * Pull the critical trigger codes out of a findings array. Used by the
 * evaluator and the QA script to escalate detector results into the
 * existing extractionIncomplete gate.
 */
export function extractCriticalTriggers(findings: QualityFinding[]): string[] {
  return findings.filter((f) => f.severity === 'critical').map((f) => f.check)
}
