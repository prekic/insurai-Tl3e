-- Migration 044: Seed ocr_fetch_timeout_ms config key (category: ai)
--
-- Background: production logs (2026-04-27T12:51 UTC) showed Document AI
-- aborting at exactly 60.057 s on the Allianz fixture. The hardcoded 60 000 ms
-- AbortController timeout in server/routes/ai/extraction.ts had no DB
-- override, so admins could not raise it without a redeploy. This migration
-- adds the override key (default 90 000 ms) per the migration-033 pattern.
--
-- The server reads this value via getAIConfig().ocrFetchTimeoutMs and falls
-- back to 90 000 ms when the row is absent (i.e. before this migration runs).
-- ON CONFLICT DO NOTHING — safe to re-run.

INSERT INTO public.app_settings (category, key, value, value_type, description, is_sensitive)
VALUES
  ('ai', 'ocr_fetch_timeout_ms', '90000', 'number', 'Server-side fetch timeout for Document AI / Vision OCR calls in milliseconds. Default 90000 (90 s). Raise if Document AI cold-start latency causes false 60 s aborts.', false)
ON CONFLICT (category, key) DO NOTHING;
