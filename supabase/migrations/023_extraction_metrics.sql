-- Migration 023: Extraction Metrics Persistence
-- Persists in-memory extraction events to DB for historical analysis
-- Includes pg_cron cleanup for 30-day TTL

-- Create extraction_metrics table
CREATE TABLE IF NOT EXISTS public.extraction_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('openai', 'anthropic', 'unknown')),
  success BOOLEAN NOT NULL DEFAULT true,
  duration_ms INTEGER NOT NULL DEFAULT 0,
  error_code TEXT,
  error_message TEXT,
  document_length INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_extraction_metrics_created_at
  ON public.extraction_metrics(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_extraction_metrics_provider
  ON public.extraction_metrics(provider);

CREATE INDEX IF NOT EXISTS idx_extraction_metrics_success
  ON public.extraction_metrics(success);

CREATE INDEX IF NOT EXISTS idx_extraction_metrics_provider_created
  ON public.extraction_metrics(provider, created_at DESC);

-- No RLS — admin-only access via service role key (same as admin_notifications)

-- Schedule daily cleanup: delete records older than 30 days
-- Uses pg_cron (enabled in migration 022)
DO $$
BEGIN
  -- Only create the cron job if pg_cron extension is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup-extraction-metrics',
      '0 3 * * *',  -- 03:00 UTC daily
      $$DELETE FROM public.extraction_metrics WHERE created_at < NOW() - INTERVAL '30 days'$$
    );
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'pg_cron not available, skipping cleanup schedule';
END;
$$;

COMMENT ON TABLE public.extraction_metrics IS 'Persistent storage for AI extraction events. Auto-cleaned after 30 days via pg_cron.';
