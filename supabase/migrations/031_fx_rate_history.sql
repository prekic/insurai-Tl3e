-- Migration: FX Rate History
-- Purpose: Store FX rate change history to enable deviation charts and monitoring alerts.
-- Created: 2026-03-06

-- ============================================================================
-- FX RATE HISTORY TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.fx_rate_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  base_currency TEXT NOT NULL DEFAULT 'TRY',
  target_currency TEXT NOT NULL,
  rate NUMERIC NOT NULL,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- For querying the latest rate history
CREATE INDEX IF NOT EXISTS idx_fx_rate_history_lookup
  ON public.fx_rate_history(target_currency, created_at DESC);

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.fx_rate_history IS
  'Stores historical FX rates fetched from exchangerate.host or fallbacks';

COMMENT ON COLUMN public.fx_rate_history.rate IS
  'Exchange rate (how many units of base currency per 1 unit of target currency)';
