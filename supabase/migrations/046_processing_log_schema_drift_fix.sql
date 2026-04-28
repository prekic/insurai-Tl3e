-- Migration 046: Fix schema drift in document_processing_logs
--
-- The TypeScript DocumentProcessingLog interface (src/types/processing-log.ts)
-- accumulated 9 columns that were never added to the underlying table.
-- Production Railway logs surfaced repeated `Failed to update processing log`
-- errors with pgCode PGRST204 ("Could not find the 'extraction_mode' column
-- of 'document_processing_logs' in the schema cache") — visible only after
-- the structured-logging fix in PR #393 (commit e558186).
--
-- All 9 columns are written by ProcessingLogger / policy-extractor on every
-- extraction. None are required for read paths; existing rows backfill to NULL.

ALTER TABLE public.document_processing_logs
  ADD COLUMN IF NOT EXISTS extraction_mode TEXT
    CHECK (extraction_mode IS NULL OR extraction_mode IN ('proxy', 'direct', 'consensus')),
  ADD COLUMN IF NOT EXISTS extraction_route TEXT,
  ADD COLUMN IF NOT EXISTS request_id TEXT,
  ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN,
  ADD COLUMN IF NOT EXISTS fallback_chain JSONB,
  ADD COLUMN IF NOT EXISTS error_stack TEXT,
  ADD COLUMN IF NOT EXISTS error_type TEXT,
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS error_context JSONB;

-- Index for correlating frontend/backend logs by request ID
CREATE INDEX IF NOT EXISTS idx_processing_logs_request_id
  ON public.document_processing_logs(request_id)
  WHERE request_id IS NOT NULL;

-- Index for filtering by extraction mode (proxy vs direct vs consensus)
CREATE INDEX IF NOT EXISTS idx_processing_logs_extraction_mode
  ON public.document_processing_logs(extraction_mode)
  WHERE extraction_mode IS NOT NULL;

COMMENT ON COLUMN public.document_processing_logs.extraction_mode IS
  'How extraction was invoked: proxy (server route), direct (client SDK), consensus (multi-provider)';

COMMENT ON COLUMN public.document_processing_logs.extraction_route IS
  'Server endpoint used for extraction (e.g., /api/ai/extract, /api/ai/extract/openai)';

COMMENT ON COLUMN public.document_processing_logs.request_id IS
  'Correlates frontend extraction to server-side logs';

COMMENT ON COLUMN public.document_processing_logs.fallback_chain IS
  'Provider attempt chain: [{ provider, success, duration_ms, error, error_code }]';
