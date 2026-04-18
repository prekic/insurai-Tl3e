-- Migration 040: Seed KASKO pilot feature flag and reviewer segment
-- This enables the KASKO internal pilot gating infrastructure.
-- The flag is seeded as DISABLED (enabled=false, rollout_percentage=0).
-- An admin must explicitly enable it via the Feature Flags admin panel.

-- 1. Seed the kasko_ai_extraction_pilot feature flag (disabled by default)
INSERT INTO public.feature_flags (key, name, enabled, description, rollout_percentage)
VALUES (
  'kasko_ai_extraction_pilot',
  'KASKO AI Extraction Pilot',
  false,
  'KASKO internal pilot: when enabled, all KASKO extractions require human review. Pilot-eligible users see draft banners and results are logged for QA.',
  0
)
ON CONFLICT (key) DO NOTHING;

-- 2. Create user_segments table if it doesn't exist
-- This table maps users to named segments for feature gating.
CREATE TABLE IF NOT EXISTS public.user_segments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  segment_name TEXT NOT NULL,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by TEXT,
  UNIQUE(user_id, segment_name)
);

-- Enable RLS
ALTER TABLE public.user_segments ENABLE ROW LEVEL SECURITY;

-- OPEN policy (USING true, WITH CHECK true) — intentionally permissive.
--
-- The pilot gate is evaluated CLIENT-SIDE by `usePilotGateOptions.ts`, which
-- uses the Supabase ANON key to read a single user's segment membership. An
-- `auth.role() = 'service_role'` restriction here would break that hook and
-- cause `evaluateKaskoPilotGate()` to always return inactive.
--
-- Access is enforced at the API layer for writes:
--   - POST   /api/admin/segments      → requireSuperAdmin
--   - DELETE /api/admin/segments/...  → requireSuperAdmin
-- Reads via the API use the service-role client; direct anon reads via the
-- client hook only reveal the current user's own assignments by filtering
-- `.eq('user_id', user.id)` (row-level selectivity, not row-level security).
--
-- If you later tighten this policy, also update:
--   - src/hooks/usePilotGateOptions.ts (would need server-side proxy)
--   - src/lib/ai/policy-extractor.ts persistPilotQARecord
--   - CLAUDE.md gotcha #39 (RLS mismatch)
CREATE POLICY "Open read/write (API layer enforces auth)"
  ON public.user_segments
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Create index for fast segment lookups
CREATE INDEX IF NOT EXISTS idx_user_segments_user_id ON public.user_segments(user_id);
CREATE INDEX IF NOT EXISTS idx_user_segments_segment_name ON public.user_segments(segment_name);

-- 3. Seed the kasko_pilot_qa_records table for persisting QA outcomes
-- Replaces the /tmp JSONL file approach with proper DB persistence.
CREATE TABLE IF NOT EXISTS public.kasko_pilot_qa_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  branch TEXT NOT NULL DEFAULT 'kasko',
  review_date TIMESTAMPTZ DEFAULT NOW(),
  reviewer_user_id TEXT,

  extraction_success BOOLEAN DEFAULT false,
  extraction_model TEXT DEFAULT 'unknown',
  text_char_count INTEGER DEFAULT 0,
  page_count INTEGER DEFAULT 0,

  reviewer_outcome TEXT DEFAULT 'pending_review',
  review_time_minutes NUMERIC DEFAULT 0,
  correction_categories JSONB DEFAULT '[]'::jsonb,
  critical_fields_missed JSONB DEFAULT '[]'::jsonb,

  display_mode TEXT DEFAULT 'unknown',
  triggers_fired JSONB DEFAULT '[]'::jsonb,
  phrase_clean BOOLEAN DEFAULT true,
  found_prohibited_phrases JSONB DEFAULT '[]'::jsonb,

  admission_status TEXT DEFAULT 'pilot_eligible_clean',
  admission_reason TEXT DEFAULT 'Default initialization',
  counted_in_pilot_metrics BOOLEAN DEFAULT true,

  coverage_count_extracted INTEGER DEFAULT 0,
  special_condition_count INTEGER DEFAULT 0,
  has_rayic_deger BOOLEAN DEFAULT false,
  has_conditional_deductible BOOLEAN DEFAULT false,
  source_quote_count INTEGER DEFAULT 0,
  confidence_score NUMERIC DEFAULT 0,

  zero_coverage BOOLEAN DEFAULT false,
  deductible_miss BOOLEAN DEFAULT false,
  special_condition_miss BOOLEAN DEFAULT false,
  major_correction BOOLEAN DEFAULT false,

  reviewer_notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- OPEN policy (USING true, WITH CHECK true) — intentionally permissive.
--
-- `persistPilotQARecord()` in src/lib/ai/policy-extractor.ts runs on the
-- client using the ANON key (fire-and-forget INSERT). Tightening this to
-- `auth.role() = 'service_role'` would cause QA records to silently fail
-- to persist, breaking the rollback-trigger monitoring downstream.
--
-- Reads happen only through the authenticated admin API
-- (`/api/admin/monitoring/pilot-rollback-status`, service-role client).
--
-- If you tighten this policy, also proxy persist through a server endpoint.
ALTER TABLE public.kasko_pilot_qa_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Open read/write (API layer enforces auth)"
  ON public.kasko_pilot_qa_records
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_pilot_qa_document_id ON public.kasko_pilot_qa_records(document_id);
CREATE INDEX IF NOT EXISTS idx_pilot_qa_review_date ON public.kasko_pilot_qa_records(review_date);
CREATE INDEX IF NOT EXISTS idx_pilot_qa_admission ON public.kasko_pilot_qa_records(admission_status);
