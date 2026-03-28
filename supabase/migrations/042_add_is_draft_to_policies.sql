-- Migration 042: Add is_draft column to policies table
-- Persists draft status so it survives feature flag changes

ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS is_draft BOOLEAN DEFAULT false;

-- Index for filtering by draft status per user
CREATE INDEX IF NOT EXISTS idx_policies_user_is_draft ON public.policies (user_id, is_draft);
