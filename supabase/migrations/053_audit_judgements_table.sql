-- Migration 053: audit_judgements table.
--
-- Phase 3 of the self-audit layer. Stores LLM-as-judge critiques of
-- extracted policies, keyed by typology hash so each unique
-- (insuranceLine × country × yearBucket × insurer) tuple costs at most
-- one judge run per prompt version. Subsequent uploads matching the same
-- typology hash short-circuit on the cached row.
--
-- Permissive RLS mirrors migration 040 (kasko_pilot_qa_records): auth is
-- enforced at the API layer via the service-role server. The audit-judge
-- service writes from the server using the SERVICE_ROLE key; the table
-- is not exposed to the anon REST client.
--
-- See also:
--   - src/lib/audit/typology.ts (computeTypologyHash)
--   - server/services/audit-judge-service.ts (consumer)
--   - server/lib/audit-judge-schema.ts (finding shape)

CREATE TABLE IF NOT EXISTS public.audit_judgements (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Typology key (cache lookup)
  typology_hash TEXT NOT NULL,
  -- {insuranceLine, country, yearBucket, insurer, insurerNormalised}
  typology_dimensions JSONB NOT NULL,

  -- Source of the judged extraction (one of the two is non-null)
  policy_id UUID,
  fixture_id TEXT,

  -- Judge invocation metadata
  judge_model TEXT NOT NULL,
  judge_prompt_template_id UUID NOT NULL,
  judge_prompt_version INT NOT NULL,

  -- Findings + cost
  finding_count INT NOT NULL DEFAULT 0,
  critical_count INT NOT NULL DEFAULT 0,
  findings JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_critique TEXT,
  cost_usd NUMERIC(8,4),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.audit_judgements ENABLE ROW LEVEL SECURITY;

-- Permissive policy mirrors migration 040 (kasko_pilot_qa_records).
-- Auth is enforced at the API layer; only the server-side audit-judge
-- service writes here, using the SERVICE_ROLE key.
CREATE POLICY "Open read/write (API layer enforces auth)"
  ON public.audit_judgements
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Cache lookup index — every cache-hit query filters by both fields.
CREATE INDEX IF NOT EXISTS idx_audit_judgements_typology
  ON public.audit_judgements(typology_hash, judge_prompt_version, created_at DESC);

-- Reverse-lookup index: given a policy_id, find its judgements.
CREATE INDEX IF NOT EXISTS idx_audit_judgements_policy
  ON public.audit_judgements(policy_id)
  WHERE policy_id IS NOT NULL;

-- Reverse-lookup index for golden-corpus runs.
CREATE INDEX IF NOT EXISTS idx_audit_judgements_fixture
  ON public.audit_judgements(fixture_id)
  WHERE fixture_id IS NOT NULL;

-- Daily-budget circuit-breaker support: counting recent rows is fast.
CREATE INDEX IF NOT EXISTS idx_audit_judgements_created_at
  ON public.audit_judgements(created_at DESC);

COMMENT ON TABLE public.audit_judgements IS
  'Phase 3 self-audit-layer LLM-as-judge results. One row per (typology_hash, judge_prompt_version) cache key, plus rows for additional policy_ids/fixture_ids that match the same typology (audit trail).';
COMMENT ON COLUMN public.audit_judgements.typology_hash IS
  'SHA-256 hex of "<insuranceLine>|<country>|<yearBucket>|<normalisedInsurer>".';
COMMENT ON COLUMN public.audit_judgements.judge_prompt_version IS
  'prompt_templates.version at run time; cache invalidates when prompt is edited.';
COMMENT ON COLUMN public.audit_judgements.findings IS
  '[{kind, severity, quote, message, quoteVerified}] — see server/lib/audit-judge-schema.ts.';
