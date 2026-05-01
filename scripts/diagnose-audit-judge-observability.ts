/**
 * One-off read-only diagnostic for the audit-judge observability gaps
 * (gotchas #144 cost_usd null, #145 admin notifications not firing).
 *
 * Runs FOUR Supabase queries and prints a tabular summary so the operator
 * can decide whether the production state matches the source-code fixes
 * shipped in the May-2 PR. NO writes — safe to run any time.
 *
 * Required env vars (all already needed for the audit-judge runtime):
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *
 * Run: npx tsx scripts/diagnose-audit-judge-observability.ts
 */
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'

interface Row {
  [key: string]: unknown
}

function exitSetup(msg: string): never {
  console.error(`[diag] SETUP ERROR: ${msg}`)
  process.exit(2)
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return 'null'
  if (typeof v === 'string' && v.length > 60) return v.slice(0, 57) + '...'
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 60)
  return String(v)
}

async function diagnose(): Promise<void> {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) exitSetup('SUPABASE_URL not set')
  if (!key) exitSetup('SUPABASE_SERVICE_ROLE_KEY not set')

  const db = createClient(url, key)

  console.log('━'.repeat(80))
  console.log('AUDIT-JUDGE OBSERVABILITY DIAGNOSTIC')
  console.log('━'.repeat(80))

  // -------------------------------------------------------------------------
  // Q1: latest 20 audit_judgements rows — does cost_usd correlate with judge_model?
  // -------------------------------------------------------------------------
  console.log('\n[Q1] Latest 20 audit_judgements rows — judge_model + cost_usd correlation')
  console.log('     If judge_model carries a dated suffix, the May-2 fix swaps it for the')
  console.log('     bare alias. If cost_usd is null but judge_model looks correct, look at')
  console.log('     getTokenPricing() DB cache (Q4) for a missing key.')
  const { data: q1, error: q1err } = await db
    .from('audit_judgements')
    .select('id, judge_model, finding_count, critical_count, cost_usd, created_at')
    .order('created_at', { ascending: false })
    .limit(20)
  if (q1err) {
    console.error('  ✗ Q1 failed:', q1err.message)
  } else {
    const nullCost = (q1 ?? []).filter((r: Row) => r.cost_usd === null).length
    const totalRows = q1?.length ?? 0
    console.log(`  Rows returned: ${totalRows}, with null cost_usd: ${nullCost}`)
    console.log(
      `  Distinct judge_model values: ${[...new Set((q1 ?? []).map((r: Row) => r.judge_model as string))].join(', ')}`
    )
    if (totalRows > 0) {
      console.log('  Sample (latest 5):')
      for (const r of (q1 as Row[]).slice(0, 5)) {
        console.log(
          `    ${fmt(r.created_at).slice(0, 19)}  model=${fmt(r.judge_model).padEnd(28)}  cost=${fmt(r.cost_usd).padStart(10)}  findings=${fmt(r.finding_count)}  crit=${fmt(r.critical_count)}`
        )
      }
    }
  }

  // -------------------------------------------------------------------------
  // Q2: admin_notifications fired by the audit judge?
  // -------------------------------------------------------------------------
  console.log("\n[Q2] admin_notifications with title prefix '[Audit Judge]'")
  console.log('     If Q1 shows critical_count > 0 rows but Q2 returns zero, EITHER all')
  console.log('     critical findings were subsequent-of-typology (correctly suppressed by')
  console.log('     judge_critical_notify_first_only) OR the notification path failed. The')
  console.log('     May-2 fix escalates the catch from warn → error and adds an info log')
  console.log('     for each suppressed-but-critical finding so the next case is debuggable.')
  const { data: q2, error: q2err } = await db
    .from('admin_notifications')
    .select('id, category, type, title, created_at')
    .eq('category', 'system')
    .like('title', '%Audit Judge%')
    .order('created_at', { ascending: false })
    .limit(20)
  if (q2err) {
    console.error('  ✗ Q2 failed:', q2err.message)
  } else {
    console.log(`  Audit-judge notifications found: ${q2?.length ?? 0}`)
    for (const r of (q2 as Row[]) ?? []) {
      console.log(`    ${fmt(r.created_at).slice(0, 19)}  type=${fmt(r.type)}  ${fmt(r.title)}`)
    }
  }

  // -------------------------------------------------------------------------
  // Q3: typology hashes with multiple critical rows (= would suppress under firstOnly=true)
  // -------------------------------------------------------------------------
  console.log('\n[Q3] Typology hashes with ≥2 critical_count > 0 rows (first-only suppression)')
  console.log('     A high count here means production critical findings ARE being correctly')
  console.log("     suppressed because they're not the first-of-typology — not a bug.")
  const { data: q3, error: q3err } = await db
    .from('audit_judgements')
    .select('typology_hash')
    .gt('critical_count', 0)
    .limit(500)
  if (q3err) {
    console.error('  ✗ Q3 failed:', q3err.message)
  } else {
    const counts = new Map<string, number>()
    for (const r of (q3 as Row[]) ?? []) {
      const h = r.typology_hash as string
      counts.set(h, (counts.get(h) ?? 0) + 1)
    }
    const repeats = [...counts.entries()].filter(([, c]) => c > 1)
    console.log(
      `  Total critical rows: ${q3?.length ?? 0}; distinct typologies: ${counts.size}; with repeats: ${repeats.length}`
    )
    for (const [h, c] of repeats.slice(0, 5)) {
      console.log(`    typology ${h.slice(0, 16)}…  ${c} critical rows`)
    }
  }

  // -------------------------------------------------------------------------
  // Q4: app_settings.cost.token_pricing — does DB-cached pricing override miss claude-sonnet-4-6?
  // -------------------------------------------------------------------------
  console.log("\n[Q4] app_settings: category='cost', key='token_pricing'")
  console.log('     If this row exists and the JSON value lacks the judge_model key, it')
  console.log('     overrides DEFAULT_COST_PER_1K_TOKENS at runtime and silently routes the')
  console.log('     audit judge through the `default` rate. Fix: upsert the missing key.')
  const { data: q4, error: q4err } = await db
    .from('app_settings')
    .select('key, value, value_type')
    .eq('category', 'cost')
    .in('key', ['token_pricing'])
  if (q4err) {
    console.error('  ✗ Q4 failed:', q4err.message)
  } else if (!q4 || q4.length === 0) {
    console.log('  No DB override — calculateCost() uses DEFAULT_COST_PER_1K_TOKENS only ✓')
  } else {
    for (const r of q4 as Row[]) {
      console.log(`  ${r.key}: ${fmt(r.value)} (${r.value_type})`)
      // Try to parse and check for claude-sonnet-4-6
      try {
        const parsed = JSON.parse(String(r.value))
        const hasJudgeModel = Object.prototype.hasOwnProperty.call(parsed, 'claude-sonnet-4-6')
        const hasDefault = Object.prototype.hasOwnProperty.call(parsed, 'default')
        console.log(
          `    Has 'claude-sonnet-4-6' key: ${hasJudgeModel ? '✓' : '✗ MISSING — bug source'}`
        )
        console.log(
          `    Has 'default' key:           ${hasDefault ? '✓' : '✗ MISSING — also a bug'}`
        )
      } catch {
        console.log('    (could not JSON-parse the value column — type may be string)')
      }
    }
  }

  console.log('\n' + '━'.repeat(80))
  console.log('Done. Decision tree:')
  console.log('  • Q1 has null cost_usd & Q4 shows DB override missing key → bug confirmed (P2a)')
  console.log('  • Q1 all-null but Q4 absent → check for OLD rows pre-dating the fix')
  console.log('  • Q3 has repeats → P2b "no notifications" may be correct strict first-only')
  console.log('  • Q3 has no repeats but Q2 still empty → real notification-path failure')
  console.log('━'.repeat(80))
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  diagnose().catch((err) => {
    console.error('[diag] FAILED:', err instanceof Error ? err.message : String(err))
    if (err instanceof Error && err.stack) console.error(err.stack)
    process.exit(2)
  })
}
