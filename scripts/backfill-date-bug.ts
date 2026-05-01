import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline/promises'
import { stdin, stdout } from 'node:process'

import { parseExtractedDate } from './_simple-date-parser'

dotenv.config()

/**
 * V8 DD.MM.YYYY Date-Corruption Audit & Repair
 *
 * Covers handoff item #3 (SESSION_HANDOFF.md) and CLAUDE.md gotcha #52.
 *
 * Production code was fixed in commit `ed487ef` — all five call sites now use
 * `parseTurkishDate()` from `turkish-utils.ts`. But rows written before that
 * fix may carry silently day/month-swapped `start_date` / `expiry_date` values.
 * This script identifies and (with explicit --apply) repairs those rows.
 *
 * Modes:
 *   --audit-only (default)   Read-only. Prints summary + writes CSV report.
 *   --apply                  Repairs confirmed-corrupted rows. Interactive
 *                            confirm unless --yes is also passed.
 *   --csv <path>             Override CSV output path.
 *   --yes                    Skip interactive confirmation in --apply mode.
 *   --help                   Print usage and exit.
 *
 * Confirmed-corruption predicate (matches runbook 05 §3):
 *   A row is CORRUPTED when BOTH are true:
 *     1. raw `startDate` matches /^\d{1,2}\.\d{1,2}\.\d{4}$/
 *     2. DB `start_date` equals the V8-swapped interpretation AND does NOT
 *        equal the Turkish interpretation.
 *   A row is OK when DB matches the Turkish interpretation.
 *   Otherwise MANUAL_REVIEW.
 */

type Status = 'CORRUPTED' | 'OK' | 'MANUAL_REVIEW'

interface RawPolicy {
  id: string
  policy_number: string | null
  provider: string | null
  created_at: string | null
  start_date: string | null
  expiry_date: string | null
  raw_data: Record<string, unknown> | null
}

interface ClassifiedRow {
  id: string
  policy_number: string
  provider: string
  created_at: string
  raw_start: string
  raw_end: string
  db_start: string
  db_end: string
  tr_interpreted_start: string
  v8_interpreted_start: string
  status: Status
}

const DOT_PATTERN = /^\d{1,2}\.\d{1,2}\.\d{4}$/

interface CliArgs {
  mode: 'audit-only' | 'apply' | 'help'
  csvPath: string | null
  yes: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { mode: 'audit-only', csvPath: null, yes: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--help' || a === '-h') {
      args.mode = 'help'
    } else if (a === '--audit-only') {
      args.mode = 'audit-only'
    } else if (a === '--apply') {
      args.mode = 'apply'
    } else if (a === '--yes' || a === '-y') {
      args.yes = true
    } else if (a === '--csv') {
      const next = argv[i + 1]
      if (!next || next.startsWith('--')) {
        throw new Error('--csv requires a file path argument')
      }
      args.csvPath = next
      i++
    } else {
      throw new Error(`Unknown flag: ${a}`)
    }
  }
  return args
}

function printHelp(): void {
  stdout.write(
    `V8 DD.MM.YYYY Date-Corruption Audit & Repair

Usage:
  npx tsx scripts/backfill-date-bug.ts [--audit-only | --apply] [--csv <path>] [--yes]
  npx tsx scripts/backfill-date-bug.ts --help

Modes:
  --audit-only   (default) Read-only. Prints counts and writes CSV report.
  --apply        Repairs confirmed-corrupted rows. Interactive confirm.

Options:
  --csv <path>   Override CSV output path.
                 Audit-only default: ./date-audit-report-<timestamp>.csv
                 Apply default:      ./date-audit-applied-<timestamp>.csv
  --yes          Skip interactive confirmation prompt in --apply mode.
  --help         Print this help.

See docs/runbooks/05-date-corruption-audit.md for the full workflow.
`
  )
}

/**
 * Single source of truth for corruption classification. Used by both audit
 * and apply modes so reporting and repair stay aligned.
 *
 * Returns null when the row isn't even a candidate (raw startDate not in
 * Turkish DD.MM.YYYY pattern).
 */
export function classifyRow(
  rawStart: string | null | undefined,
  dbStart: string | null | undefined
): { status: Status; trInterpreted: string; v8Interpreted: string } | null {
  if (typeof rawStart !== 'string' || !DOT_PATTERN.test(rawStart)) return null
  if (typeof dbStart !== 'string' || dbStart.length === 0) {
    // Candidate pattern matched but DB has no date — classify as manual review
    // so operator eyeballs it; don't auto-repair.
    const parts = rawStart.split('.')
    const tr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
    const v8 = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
    return { status: 'MANUAL_REVIEW', trInterpreted: tr, v8Interpreted: v8 }
  }

  const parts = rawStart.split('.')
  const tr = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`
  const v8 = `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
  // Normalize dbStart to YYYY-MM-DD (Supabase may return ISO datetime for
  // date columns via PostgREST in some projections).
  const db = dbStart.length >= 10 ? dbStart.slice(0, 10) : dbStart

  if (db === tr) return { status: 'OK', trInterpreted: tr, v8Interpreted: v8 }
  if (db === v8 && db !== tr) return { status: 'CORRUPTED', trInterpreted: tr, v8Interpreted: v8 }
  return { status: 'MANUAL_REVIEW', trInterpreted: tr, v8Interpreted: v8 }
}

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function writeCsv(path: string, rows: ClassifiedRow[]): void {
  const header = [
    'id',
    'policy_number',
    'provider',
    'created_at',
    'raw_start',
    'raw_end',
    'db_start',
    'db_end',
    'tr_interpreted_start',
    'v8_interpreted_start',
    'status',
  ].join(',')
  const body = rows
    .map((r) =>
      [
        r.id,
        r.policy_number,
        r.provider,
        r.created_at,
        r.raw_start,
        r.raw_end,
        r.db_start,
        r.db_end,
        r.tr_interpreted_start,
        r.v8_interpreted_start,
        r.status,
      ]
        .map(csvEscape)
        .join(',')
    )
    .join('\n')
  writeFileSync(path, `${header}\n${body}\n`, 'utf-8')
}

async function fetchCandidates(supabase: ReturnType<typeof createClient>): Promise<RawPolicy[]> {
  const { data, error } = await supabase
    .from('policies')
    .select('id, policy_number, provider, created_at, start_date, expiry_date, raw_data')
    .eq('type', 'kasko')
    .not('raw_data', 'is', null)
  if (error) {
    throw new Error(`Supabase fetch failed: ${error.message}`)
  }
  return (data ?? []) as RawPolicy[]
}

function classifyAll(rows: RawPolicy[]): ClassifiedRow[] {
  const out: ClassifiedRow[] = []
  for (const p of rows) {
    const rd = (p.raw_data ?? {}) as Record<string, unknown>
    const rawStart = typeof rd.startDate === 'string' ? rd.startDate : ''
    const rawEnd = typeof rd.endDate === 'string' ? rd.endDate : ''
    // Only classify if startDate is in the candidate pattern. Matches runbook
    // §3 predicate (which anchors on startDate as the primary signal).
    const verdict = classifyRow(rawStart, p.start_date)
    if (!verdict) continue
    out.push({
      id: p.id,
      policy_number: p.policy_number ?? '',
      provider: p.provider ?? '',
      created_at: p.created_at ?? '',
      raw_start: rawStart,
      raw_end: rawEnd,
      db_start: p.start_date ?? '',
      db_end: p.expiry_date ?? '',
      tr_interpreted_start: verdict.trInterpreted,
      v8_interpreted_start: verdict.v8Interpreted,
      status: verdict.status,
    })
  }
  return out
}

function timestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

async function promptConfirm(expected: string): Promise<boolean> {
  const rl = createInterface({ input: stdin, output: stdout })
  const answer = await rl.question(`Type '${expected}' to confirm: `)
  rl.close()
  return answer.trim() === expected
}

function getSupabase(): ReturnType<typeof createClient> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    stdout.write('❌ Missing Supabase credentials.\n')
    stdout.write('   Required env vars: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY\n')
    process.exit(1)
  }
  return createClient(url, key)
}

async function runAuditOnly(args: CliArgs): Promise<void> {
  const supabase = getSupabase()
  stdout.write('🔍 Fetching KASKO policies with raw_data…\n')
  const rows = await fetchCandidates(supabase)
  stdout.write(`   ${rows.length} kasko rows read.\n`)

  const classified = classifyAll(rows)
  const byStatus: Record<Status, number> = { CORRUPTED: 0, OK: 0, MANUAL_REVIEW: 0 }
  for (const r of classified) byStatus[r.status]++

  const csvPath = args.csvPath ?? `./date-audit-report-${timestamp()}.csv`
  writeCsv(csvPath, classified)

  stdout.write('\n📊 Audit summary\n')
  stdout.write(`   candidates           : ${classified.length}\n`)
  stdout.write(`   confirmed_corrupted  : ${byStatus.CORRUPTED}\n`)
  stdout.write(`   ok                   : ${byStatus.OK}\n`)
  stdout.write(`   manual_review        : ${byStatus.MANUAL_REVIEW}\n`)
  stdout.write(`\n📝 Report written to: ${csvPath}\n`)
  stdout.write(
    '\nThis was read-only. No rows were modified. Re-run with --apply to repair ' +
      'confirmed-corrupted rows.\n'
  )
}

async function runApply(args: CliArgs): Promise<void> {
  const supabase = getSupabase()

  stdout.write('🔍 Fetching KASKO policies with raw_data…\n')
  const rows = await fetchCandidates(supabase)
  const classified = classifyAll(rows)
  const toFix = classified.filter((r) => r.status === 'CORRUPTED')

  stdout.write('\n📊 Pre-apply summary\n')
  stdout.write(`   candidates           : ${classified.length}\n`)
  stdout.write(`   confirmed_corrupted  : ${toFix.length}\n`)
  stdout.write(
    `   ok + manual_review   : ${classified.length - toFix.length} (will NOT be touched)\n`
  )

  if (toFix.length === 0) {
    stdout.write('\n✅ Nothing to repair. Exiting.\n')
    return
  }

  if (!args.yes) {
    stdout.write(`\n⚠️  About to UPDATE ${toFix.length} rows in the policies table.\n`)
    const ok = await promptConfirm('repair')
    if (!ok) {
      stdout.write('❌ Confirmation not received. Aborting.\n')
      process.exit(2)
    }
  }

  const appliedLogPath = args.csvPath ?? `./date-audit-applied-${timestamp()}.csv`
  const applied: ClassifiedRow[] = []
  let updated = 0
  let failed = 0

  for (const row of toFix) {
    const correctStart = parseExtractedDate(row.raw_start, 0)
    const correctEnd = row.raw_end ? parseExtractedDate(row.raw_end, 365) : null
    const updates: { start_date?: string; expiry_date?: string } = {}
    if (correctStart && correctStart !== row.db_start) updates.start_date = correctStart
    if (correctEnd && correctEnd !== row.db_end) updates.expiry_date = correctEnd

    if (Object.keys(updates).length === 0) {
      // classifyRow called it CORRUPTED but parseExtractedDate already equals
      // db_start — defensive skip.
      continue
    }

    const { error } = await supabase.from('policies').update(updates).eq('id', row.id)
    if (error) {
      stdout.write(`❌ ${row.id}: ${error.message}\n`)
      failed++
      continue
    }
    updated++
    applied.push(row)
  }

  writeCsv(appliedLogPath, applied)

  stdout.write('\n✅ Repair complete\n')
  stdout.write(`   updated : ${updated}\n`)
  stdout.write(`   failed  : ${failed}\n`)
  stdout.write(`\n📝 Applied log: ${appliedLogPath}\n`)
  stdout.write(
    '\nNext: re-run `npx tsx scripts/backfill-date-bug.ts --audit-only` to verify ' +
      'confirmed_corrupted == 0, then `npx tsx scripts/backfill-evaluation-scores.ts` ' +
      'to rescore the repaired rows.\n'
  )
}

async function main(): Promise<void> {
  let args: CliArgs
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (err) {
    stdout.write(`❌ ${(err as Error).message}\n\n`)
    printHelp()
    process.exit(1)
  }

  if (args.mode === 'help') {
    printHelp()
    return
  }
  if (args.mode === 'audit-only') {
    await runAuditOnly(args)
    return
  }
  await runApply(args)
}

// Only run main() when executed directly (not when imported by tests).
// import.meta.url is a file:// URL; process.argv[1] is the absolute path.
// pathToFileURL handles cross-platform path normalisation (Windows
// backslashes + triple-slash) which the literal template-string form misses.
import { pathToFileURL } from 'node:url'
const invokedDirectly =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href

if (invokedDirectly) {
  main().catch((err) => {
    stdout.write(`❌ ${(err as Error).stack ?? (err as Error).message}\n`)
    process.exit(1)
  })
}
