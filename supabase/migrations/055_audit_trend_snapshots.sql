-- Migration 055: audit_trend_snapshots table.
--
-- Phase 4 of the self-audit layer. Detects regressions like "previous
-- run extracted 10 insights, this run extracted 3" — both runs pass
-- schema validation, but the structured output silently lost signal.
--
-- One row per (fixture_id × run_at). The most recent successful row
-- per fixture is the baseline for the next run's comparison. Six
-- numeric metrics live in the JSONB `metrics` column (see
-- src/lib/audit/trend-metrics.ts:TrendMetrics for the canonical shape):
--   coverages, exclusions, conditional_deductibles,
--   ai_insights, supplementary_count, bundle_products
--
-- Permissive RLS mirrors migration 040 + 053 (kasko_pilot_qa_records,
-- audit_judgements): auth is enforced at the API layer; only the
-- server-side trend-track CLI writes here, using the SERVICE_ROLE key.
--
-- See also:
--   - scripts/audit-trend-track.ts (writer + comparator)
--   - src/lib/audit/trend-metrics.ts (pure metric extraction + diffing)
--   - tests/fixtures/golden/golden.json (fixture corpus)

CREATE TABLE IF NOT EXISTS public.audit_trend_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Stable identifier from tests/fixtures/golden/golden.json
  fixture_id TEXT NOT NULL,
  run_at TIMESTAMPTZ DEFAULT NOW(),

  -- 6 metrics: { coverages, exclusions, conditional_deductibles,
  -- ai_insights, supplementary_count, bundle_products }
  metrics JSONB NOT NULL,

  -- Provenance fields used to disambiguate snapshots when extraction
  -- code or schema changes (a drop after a schema_version bump may be
  -- intentional, not a regression).
  schema_version INT NOT NULL DEFAULT 1,
  git_sha TEXT,

  -- Did the underlying extraction pass schema validation? Comparator
  -- only uses qa_pass=true rows as baselines.
  qa_pass BOOLEAN NOT NULL DEFAULT true,

  -- Optional cross-link to the corresponding audit_judgements row.
  judge_critical_count INT,

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.audit_trend_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Open read/write (API layer enforces auth)"
  ON public.audit_trend_snapshots
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Baseline lookup: latest qa_pass=true row per fixture, ordered by run_at DESC.
CREATE INDEX IF NOT EXISTS idx_audit_trend_fixture_run
  ON public.audit_trend_snapshots(fixture_id, run_at DESC);

-- Schema-version filter index for the rare case where a recent schema
-- bump invalidates older baselines and the comparator wants to skip
-- pre-bump snapshots.
CREATE INDEX IF NOT EXISTS idx_audit_trend_schema_version
  ON public.audit_trend_snapshots(schema_version, run_at DESC);

COMMENT ON TABLE public.audit_trend_snapshots IS
  'Phase 4 fixture-level trend snapshots. One row per golden fixture run; baseline = most recent qa_pass=true row per fixture_id. Permissive RLS (auth at API layer).';
COMMENT ON COLUMN public.audit_trend_snapshots.metrics IS
  '{coverages, exclusions, conditional_deductibles, ai_insights, supplementary_count, bundle_products} — see src/lib/audit/trend-metrics.ts.';
COMMENT ON COLUMN public.audit_trend_snapshots.schema_version IS
  'Bump when extraction schema or trend-metrics.ts changes shape; comparator can filter out pre-bump baselines.';
