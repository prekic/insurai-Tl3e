-- Migration: Config Drift Baselines
-- Purpose: Store "known-good" configuration snapshots for drift detection
-- Created: 2026-02-06

CREATE TABLE IF NOT EXISTS public.config_drift_baselines (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Snapshot metadata
  name TEXT NOT NULL,                  -- e.g. "Post-deploy Feb 6", "Production baseline"
  description TEXT,

  -- The full settings snapshot (same format as export)
  snapshot JSONB NOT NULL,             -- { category: { key: value } }

  -- Who/when
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Whether this is the active baseline for comparison
  is_active BOOLEAN NOT NULL DEFAULT false
);

-- Only one active baseline at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_config_drift_baselines_active
  ON public.config_drift_baselines(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_config_drift_baselines_created_at
  ON public.config_drift_baselines(created_at DESC);

COMMENT ON TABLE public.config_drift_baselines IS
  'Stores known-good configuration snapshots for detecting config drift';

COMMENT ON COLUMN public.config_drift_baselines.snapshot IS
  'Flattened settings map: { "ai": { "temperature": 0.1, ... }, "evaluation": { ... } }';

COMMENT ON COLUMN public.config_drift_baselines.is_active IS
  'Only one baseline can be active. Used as the comparison target for drift detection';
