-- ============================================================================
-- AI Insight Guidelines
-- Migration: 032_ai_insight_guidelines.sql
-- Description: Creates table for admins to manage AI sense-check prompt rules
-- Date: 2026-03-10
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_insight_guidelines (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  policy_type VARCHAR(50) NOT NULL DEFAULT '*', -- '*' for global rules, or specific ('kasko', 'home', etc.)
  region_code VARCHAR(10) NOT NULL DEFAULT '*', -- '*' for global, or specific ('TR', etc.)
  guidance_text TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  notes TEXT,
  created_by UUID REFERENCES public.admin_users(id),
  updated_by UUID REFERENCES public.admin_users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying by the sense-check endpoint
CREATE INDEX IF NOT EXISTS idx_ai_insight_guidelines_policy_type ON public.ai_insight_guidelines(policy_type);
CREATE INDEX IF NOT EXISTS idx_ai_insight_guidelines_region_code ON public.ai_insight_guidelines(region_code);
CREATE INDEX IF NOT EXISTS idx_ai_insight_guidelines_active ON public.ai_insight_guidelines(is_active) WHERE is_active = TRUE;

-- Row Level Security
ALTER TABLE public.ai_insight_guidelines ENABLE ROW LEVEL SECURITY;

-- Anyone can view active rules (backend needs to read these during extraction)
CREATE POLICY "Anyone can view active ai guidelines"
  ON public.ai_insight_guidelines
  FOR SELECT
  USING (is_active = true);

-- Admins can manage all rules
CREATE POLICY "Admin users can manage ai guidelines"
  ON public.ai_insight_guidelines
  FOR ALL
  USING (true); -- Enforced at API level via admin middleware

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_ai_insight_guidelines_updated_at ON public.ai_insight_guidelines;
CREATE TRIGGER update_ai_insight_guidelines_updated_at
  BEFORE UPDATE ON public.ai_insight_guidelines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed initial rules from the hardcoded sense-check endpoint
INSERT INTO public.ai_insight_guidelines (policy_type, region_code, guidance_text, notes)
VALUES
  ('kasko', '*', 'Kasko policies inherently cover "çarpışma" (collision), "çarpma", "yangın" (fire), and natural disasters (sel, deprem) even if not explicitly listed as sub-coverages. If the policy is Kasko and these "missing coverage" warnings appear, discard them.', 'Migrated from hardcoded kasko sense-check rule'),
  ('*', 'TR', 'If the policy address is in Turkey, "TL" or "TRY" are valid currencies. Discard any "Unusual currency TL detected" warnings.', 'Migrated from hardcoded Turkey currency rule'),
  ('*', '*', 'Keep legitimate insights (e.g. high deductibles, low limits, DASK recommendations).', 'Default legitimate insight preservation rule');

COMMENT ON TABLE public.ai_insight_guidelines IS 'Admin-configurable rules guiding AI sense-checking of extracted insights';
