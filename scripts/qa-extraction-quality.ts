/**
 * scripts/qa-extraction-quality.ts
 *
 * Backend QA gate. Iterates every kasko policy in the DB, reconstructs it,
 * runs the evaluator + display-mode gate, and emits a CSV + markdown
 * report of three trust-damage patterns:
 *
 *   1. VEHICLE_COMPLETENESS (kasko only) — headline vehicle fields (make,
 *      model, year) are present and not "label-leak" values ("No", "Hayır").
 *   2. CONFIDENCE_GATE_SYNC — when the extraction gate fires,
 *      aiConfidence must already be <= INCOMPLETE_CONFIDENCE_CAP (0.65).
 *      If not, the UI will render e.g. 98% confidence next to an
 *      "Incomplete extraction" banner — the contradiction the April 24
 *      human review flagged.
 *   3. GRADE_GATE_SYNC — when the gate fires, isProvisional MUST be true
 *      so downstream UI conditionals (grade badge hidden, sub-scores
 *      suppressed, scenarios/market/actuarial cards suppressed) engage.
 *
 * Usage:
 *   npx tsx scripts/qa-extraction-quality.ts
 *   npm run qa:extraction
 *
 * Options:
 *   --provider=anadolu   ilike filter on provider name
 *   --type=traffic       override default `kasko` filter
 *   --limit=50           cap rows fetched (default 200)
 *
 * Outputs:
 *   reports/qa-extraction-quality-<iso-timestamp>.csv
 *   reports/qa-extraction-quality-<iso-timestamp>.md
 *
 * Exit code is non-zero when any check has >=1 critical failure, so the
 * script can be used as a CLI gate (e.g. `npm run qa:extraction && git commit`).
 *
 * See docs/runbooks/07-qa-extraction-quality.md for the full runbook.
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { parseArgs } from 'node:util'

import { reconstructPolicySafely } from './backfill-evaluation-scores'
import { evaluatePolicy } from '../src/lib/policy-evaluation'
import { initializeBenchmarks } from '../src/lib/policy-evaluation/benchmark-service'
import type { Database } from '../src/lib/supabase/types'
import type { PolicyEvaluation, QualityFinding } from '../src/lib/policy-evaluation/types'
import {
  checkFinancialRisksDedup,
  checkEkSozlesmeBulletParity,
  checkNamedScenarioCoverage,
  checkCarveOutDisplayContract,
} from '../src/lib/audit/quality-detectors'

dotenv.config()

// -----------------------------------------------------------------------------
// Thresholds
// -----------------------------------------------------------------------------

/**
 * When extractionIncomplete fires, the displayed confidence in the UI is
 * capped at this value (see plan item B2). This script checks that the
 * underlying data either satisfies the cap OR that the UI will clamp it.
 * Keep in sync with src/lib/policy-evaluation/evaluator.ts.
 */
const INCOMPLETE_CONFIDENCE_CAP = 0.65

/**
 * Strings that the AI extractor sometimes emits in place of a proper parse
 * when a label was found but the value was blank / bled from an adjacent field.
 * Any of these as `make` or `model` is treated as a missing field.
 */
const LABEL_LEAK_VALUES = new Set(['no', 'hayır', 'hayir', '-', 'n/a', 'na', 'null'])

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type Severity = 'pass' | 'warn' | 'critical'
type CheckName =
  | 'VEHICLE_COMPLETENESS'
  | 'CONFIDENCE_GATE_SYNC'
  | 'GRADE_GATE_SYNC'
  | 'FINANCIAL_RISKS_DUPLICATED'
  | 'EK_SOZLESME_BULLETS_UNDERREPORTED'
  | 'NAMED_SCENARIO_MISSING'
  | 'NAMED_SCENARIO_MISSING_HIGH_IMPACT'
  | 'CARVE_OUT_DISPLAY_MISMATCH'

interface CheckResult {
  check: CheckName
  severity: Severity
  detail: string
}

interface PolicyReport {
  id: string
  policyNumber: string
  provider: string
  type: string
  checks: CheckResult[]
}

const CHECK_NAMES: readonly CheckName[] = [
  'VEHICLE_COMPLETENESS',
  'CONFIDENCE_GATE_SYNC',
  'GRADE_GATE_SYNC',
  'FINANCIAL_RISKS_DUPLICATED',
  'EK_SOZLESME_BULLETS_UNDERREPORTED',
  'NAMED_SCENARIO_MISSING',
  'CARVE_OUT_DISPLAY_MISMATCH',
] as const

/**
 * Map a `QualityFinding` from the shared detector module into a CheckResult.
 * The detectors emit one of 5 stable check IDs; the
 * `NAMED_SCENARIO_MISSING_HIGH_IMPACT` variant is collapsed to a row under
 * `NAMED_SCENARIO_MISSING` for the markdown summary table (severity is
 * preserved, so the critical bucket still reflects the high-impact case).
 */
function findingToCheckResult(f: QualityFinding): CheckResult {
  const check =
    f.check === 'NAMED_SCENARIO_MISSING_HIGH_IMPACT'
      ? 'NAMED_SCENARIO_MISSING'
      : (f.check as CheckName)
  return {
    check,
    severity: f.severity,
    detail: f.detail,
  }
}

// -----------------------------------------------------------------------------
// Per-policy checks
// -----------------------------------------------------------------------------

interface PolicyLike {
  id: string
  policyNumber: string
  provider: string
  type: string
  aiConfidence?: number
  vehicleInfo?: {
    make?: string | null
    model?: string | null
    year?: number | null
  } | null
}

function checkVehicleCompleteness(policy: PolicyLike): CheckResult {
  if (policy.type !== 'kasko') {
    return { check: 'VEHICLE_COMPLETENESS', severity: 'pass', detail: 'non-kasko, skipped' }
  }
  const v = policy.vehicleInfo ?? {}
  const make = typeof v.make === 'string' ? v.make.trim() : ''
  const model = typeof v.model === 'string' ? v.model.trim() : ''
  const year = typeof v.year === 'number' ? v.year : null

  const problems: string[] = []
  if (make.length < 2) problems.push('make missing')
  else if (LABEL_LEAK_VALUES.has(make.toLowerCase())) problems.push(`make label-leak ("${make}")`)
  if (model.length < 2) problems.push('model missing')
  else if (LABEL_LEAK_VALUES.has(model.toLowerCase()))
    problems.push(`model label-leak ("${model}")`)
  if (year === null) problems.push('year missing')

  return {
    check: 'VEHICLE_COMPLETENESS',
    severity: problems.length > 0 ? 'critical' : 'pass',
    detail: problems.length ? problems.join('; ') : `make="${make}" model="${model}" year=${year}`,
  }
}

function checkConfidenceGateSync(policy: PolicyLike, evaluation: PolicyEvaluation): CheckResult {
  const gateActive = Boolean(evaluation.extractionIncomplete)
  const rawConfidence = typeof policy.aiConfidence === 'number' ? policy.aiConfidence : null

  if (rawConfidence === null) {
    return {
      check: 'CONFIDENCE_GATE_SYNC',
      severity: 'warn',
      detail: 'policy has no aiConfidence stored',
    }
  }

  const rawPct = Math.round(rawConfidence * 100)

  if (!gateActive) {
    return {
      check: 'CONFIDENCE_GATE_SYNC',
      severity: 'pass',
      detail: `gate not active (raw conf ${rawPct}%)`,
    }
  }

  if (rawConfidence <= INCOMPLETE_CONFIDENCE_CAP) {
    return {
      check: 'CONFIDENCE_GATE_SYNC',
      severity: 'pass',
      detail: `gate active, raw conf ${rawPct}% already <= ${INCOMPLETE_CONFIDENCE_CAP * 100}% cap`,
    }
  }

  if (
    typeof evaluation.displayedAiConfidence === 'number' &&
    evaluation.displayedAiConfidence <= INCOMPLETE_CONFIDENCE_CAP
  ) {
    return {
      check: 'CONFIDENCE_GATE_SYNC',
      severity: 'pass',
      detail: `gate active, raw conf ${rawPct}% > cap, but evaluator properly capped displayedAiConfidence to ${Math.round(evaluation.displayedAiConfidence * 100)}%`,
    }
  }

  const triggers = evaluation.extractionGateTriggers?.join(',') ?? '-'
  return {
    check: 'CONFIDENCE_GATE_SYNC',
    severity: 'critical',
    detail: `gate active (${triggers}) but raw conf ${rawPct}% > ${INCOMPLETE_CONFIDENCE_CAP * 100}% cap — UI will contradict itself unless displayed-confidence cap is wired`,
  }
}

function checkGradeGateSync(evaluation: PolicyEvaluation): CheckResult {
  const gateActive = Boolean(evaluation.extractionIncomplete)
  if (!gateActive) {
    return {
      check: 'GRADE_GATE_SYNC',
      severity: 'pass',
      detail: `gate not active (grade ${evaluation.grade})`,
    }
  }
  if (!evaluation.isProvisional) {
    return {
      check: 'GRADE_GATE_SYNC',
      severity: 'critical',
      detail:
        'gate active but isProvisional=false — signal chain broken; UI will show confident grade',
    }
  }
  return {
    check: 'GRADE_GATE_SYNC',
    severity: 'pass',
    detail: `gate active, isProvisional=true, grade=${evaluation.grade} rendered as provisional`,
  }
}

// -----------------------------------------------------------------------------
// Report writers
// -----------------------------------------------------------------------------

function writeCsv(reports: PolicyReport[], csvPath: string): void {
  const escape = (s: string) => `"${s.replace(/"/g, '""')}"`
  const lines = [
    'policy_id,policy_number,provider,type,check,severity,detail',
    ...reports.flatMap((r) =>
      r.checks.map((c) =>
        [
          r.id,
          escape(r.policyNumber),
          escape(r.provider),
          r.type,
          c.check,
          c.severity,
          escape(c.detail),
        ].join(',')
      )
    ),
  ]
  fs.writeFileSync(csvPath, lines.join('\n') + '\n', 'utf8')
}

function writeMarkdown(
  reports: PolicyReport[],
  totals: { rowsFetched: number; evaluated: number; skipped: number; crashed: number },
  filterDescription: string,
  mdPath: string
): void {
  const counts: Record<CheckName, { pass: number; warn: number; critical: number }> = {
    VEHICLE_COMPLETENESS: { pass: 0, warn: 0, critical: 0 },
    CONFIDENCE_GATE_SYNC: { pass: 0, warn: 0, critical: 0 },
    GRADE_GATE_SYNC: { pass: 0, warn: 0, critical: 0 },
    FINANCIAL_RISKS_DUPLICATED: { pass: 0, warn: 0, critical: 0 },
    EK_SOZLESME_BULLETS_UNDERREPORTED: { pass: 0, warn: 0, critical: 0 },
    NAMED_SCENARIO_MISSING: { pass: 0, warn: 0, critical: 0 },
    NAMED_SCENARIO_MISSING_HIGH_IMPACT: { pass: 0, warn: 0, critical: 0 },
    CARVE_OUT_DISPLAY_MISMATCH: { pass: 0, warn: 0, critical: 0 },
  }
  for (const r of reports) {
    for (const c of r.checks) counts[c.check][c.severity]++
  }

  const topOffenders = (check: CheckName) =>
    reports
      .map((r) => ({ r, c: r.checks.find((x) => x.check === check) }))
      .filter(({ c }) => c?.severity === 'critical')
      .slice(0, 5)

  let md = `# QA Extraction Quality Report\n\n`
  md += `**Generated:** ${new Date().toISOString()}\n\n`
  md += `**Scope:** ${filterDescription}\n\n`
  md += `**Rows fetched:** ${totals.rowsFetched}  |  **Evaluated:** ${totals.evaluated}  |  **Skipped:** ${totals.skipped}  |  **Crashed:** ${totals.crashed}\n\n`

  md += `## Pass / Fail by Check\n\n`
  md += `| Check | Pass | Warn | Critical | % Pass |\n`
  md += `|---|---|---|---|---|\n`
  for (const c of CHECK_NAMES) {
    const total = totals.evaluated
    const passPct = total ? Math.round((counts[c].pass / total) * 100) : 0
    md += `| ${c} | ${counts[c].pass} | ${counts[c].warn} | ${counts[c].critical} | ${passPct}% |\n`
  }
  md += `\n`

  for (const c of CHECK_NAMES) {
    const offenders = topOffenders(c)
    if (offenders.length === 0) continue
    md += `## Top 5 Offenders — ${c}\n\n`
    for (const o of offenders) {
      md += `- \`${o.r.id}\` — ${o.r.provider} / ${o.r.policyNumber}\n`
      md += `  - ${o.c!.detail}\n`
    }
    md += `\n`
  }

  if (CHECK_NAMES.every((c) => counts[c].critical === 0)) {
    md += `## Verdict\n\nAll checks passed. Safe to ship.\n`
  } else {
    md += `## Verdict\n\nAt least one check has critical failures. Do NOT claim the related fix as complete until this report is clean.\n`
  }

  fs.writeFileSync(mdPath, md, 'utf8')
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      provider: { type: 'string' },
      type: { type: 'string' },
      limit: { type: 'string' },
    },
  })

  const providerFilter = values.provider
  const typeFilter = values.type ?? 'kasko'
  const limit = values.limit ? parseInt(values.limit, 10) : 200

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment.')
    console.error('Add them to .env or export them before running.')
    process.exit(1)
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey)

  console.log('Initialising benchmarks...')
  try {
    await initializeBenchmarks()
  } catch (e) {
    // Gotcha #45 — the evaluator may emit a non-fatal Vite-env stack trace
    // when imported from a plain Node script. Evaluation still works via
    // static fallback. Swallow and proceed.
    console.warn('Benchmark init warning (non-fatal):', e instanceof Error ? e.message : String(e))
  }

  let query = supabase.from('policies').select('*').limit(limit)
  if (typeFilter) query = query.eq('type', typeFilter)
  if (providerFilter) query = query.ilike('provider', `%${providerFilter}%`)
  const { data, error } = await query
  const rows = (data || []) as any[]
  if (error) {
    console.error('Error fetching policies:', error)
    process.exit(1)
  }
  if (!rows || rows.length === 0) {
    console.log('No policies found matching criteria.')
    process.exit(0)
  }

  const filterDescription = `type=${typeFilter}${providerFilter ? `, provider~="${providerFilter}"` : ''}, limit=${limit}`
  console.log(`Evaluating ${rows.length} policies (${filterDescription})...\n`)

  const reports: PolicyReport[] = []
  let skipped = 0
  let crashed = 0

  for (const row of rows) {
    const { policy, skipReason } = reconstructPolicySafely(row)
    if (!policy) {
      if (skipReason) {
        // Skips are not failures, just diagnostic breadcrumbs.
        console.log(`SKIP  ${row.id}: ${skipReason}`)
      }
      skipped++
      continue
    }
    try {
      // Pull raw text for the text-dependent detectors (gotcha #105 — present
      // on policies ingested after Apr 25, 2026; older rows return undefined
      // and the bullet-count + named-scenario detectors short-circuit to pass).
      const rawText: string | undefined =
        typeof (row as { raw_data?: { extractedText?: string } }).raw_data?.extractedText ===
        'string'
          ? (
              (row as { raw_data?: { extractedText?: string } }).raw_data as {
                extractedText: string
              }
            ).extractedText
          : undefined
      const evaluation = evaluatePolicy(policy, { rawText: rawText ?? null })
      const conditionalDeductibles = (policy as { conditionalDeductibles?: string[] })
        .conditionalDeductibles
      const supplementaryCount = (policy.coverages || []).filter(
        (c) => (c as { category?: string }).category === 'supplementary'
      ).length
      const detectorFindings = [
        checkFinancialRisksDedup(conditionalDeductibles),
        checkEkSozlesmeBulletParity(rawText ?? null, supplementaryCount),
        checkNamedScenarioCoverage(rawText ?? null, conditionalDeductibles),
        checkCarveOutDisplayContract(policy.coverages, evaluation.scenarioCards ?? null),
      ]
      const report: PolicyReport = {
        id: policy.id,
        policyNumber: policy.policyNumber,
        provider: policy.provider,
        type: policy.type,
        checks: [
          checkVehicleCompleteness(policy as PolicyLike),
          checkConfidenceGateSync(policy as PolicyLike, evaluation),
          checkGradeGateSync(evaluation),
          ...detectorFindings.map(findingToCheckResult),
        ],
      }
      reports.push(report)

      const worst = report.checks.reduce<Severity>((acc, c) => {
        if (c.severity === 'critical') return 'critical'
        if (c.severity === 'warn' && acc !== 'critical') return 'warn'
        return acc
      }, 'pass')
      const tag = worst === 'critical' ? 'CRIT' : worst === 'warn' ? 'WARN' : 'OK  '
      console.log(`${tag}  ${policy.id} ${policy.provider} / ${policy.policyNumber}`)
    } catch (e) {
      console.error(`CRASH ${row.id}: ${e instanceof Error ? e.message : String(e)}`)
      crashed++
    }
  }

  const reportsDir = path.resolve(process.cwd(), 'reports')
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true })
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const csvPath = path.join(reportsDir, `qa-extraction-quality-${ts}.csv`)
  const mdPath = path.join(reportsDir, `qa-extraction-quality-${ts}.md`)

  writeCsv(reports, csvPath)
  writeMarkdown(
    reports,
    { rowsFetched: rows.length, evaluated: reports.length, skipped, crashed },
    filterDescription,
    mdPath
  )

  const counts: Record<CheckName, { pass: number; warn: number; critical: number }> = {
    VEHICLE_COMPLETENESS: { pass: 0, warn: 0, critical: 0 },
    CONFIDENCE_GATE_SYNC: { pass: 0, warn: 0, critical: 0 },
    GRADE_GATE_SYNC: { pass: 0, warn: 0, critical: 0 },
    FINANCIAL_RISKS_DUPLICATED: { pass: 0, warn: 0, critical: 0 },
    EK_SOZLESME_BULLETS_UNDERREPORTED: { pass: 0, warn: 0, critical: 0 },
    NAMED_SCENARIO_MISSING: { pass: 0, warn: 0, critical: 0 },
    NAMED_SCENARIO_MISSING_HIGH_IMPACT: { pass: 0, warn: 0, critical: 0 },
    CARVE_OUT_DISPLAY_MISMATCH: { pass: 0, warn: 0, critical: 0 },
  }
  for (const r of reports) {
    for (const c of r.checks) counts[c.check][c.severity]++
  }

  console.log(`\n--- QA Summary ---`)
  for (const c of CHECK_NAMES) {
    const total = reports.length
    const passPct = total ? Math.round((counts[c].pass / total) * 100) : 0
    console.log(
      `${c}: ${counts[c].pass}/${total} pass (${passPct}%) — ${counts[c].warn} warn, ${counts[c].critical} critical`
    )
  }
  console.log(`Skipped: ${skipped}  Crashed: ${crashed}`)
  console.log(`\nCSV:       ${csvPath}`)
  console.log(`Markdown:  ${mdPath}`)

  const anyCritical = CHECK_NAMES.some((c) => counts[c].critical > 0)
  process.exit(anyCritical ? 1 : 0)
}

// Only run if executed directly (allows safe import of helpers in tests).
// Cross-platform main() guard — pathToFileURL handles Windows backslashes.
import { pathToFileURL } from 'node:url'
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}

export {
  checkVehicleCompleteness,
  checkConfidenceGateSync,
  checkGradeGateSync,
  findingToCheckResult,
  INCOMPLETE_CONFIDENCE_CAP,
  LABEL_LEAK_VALUES,
}
// Re-export Phase 1 self-audit detectors for downstream tooling that prefers
// to import everything from the QA gate module.
export {
  checkFinancialRisksDedup,
  checkEkSozlesmeBulletParity,
  checkNamedScenarioCoverage,
  checkCarveOutDisplayContract,
} from '../src/lib/audit/quality-detectors'
