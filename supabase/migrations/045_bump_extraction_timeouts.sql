-- Migration 045: Bump AI extraction timeouts after Run #5 finding
--
-- Background: Run #5 verification (Apr 27, 17:21 UTC) caught Allianz extraction
-- failing with ALL_PROVIDERS_FAILED. Both providers hit their ceilings exactly:
--   server_anthropic_ms: 65006  (= primary_provider_timeout_ms 65000)
--   server_openai_ms:    55003  (= fallback_provider_timeout_ms 55000)
--   server_total_ms:     120268 (= request_budget_ms 125000 minus margin)
-- The Doc AI OCR phase succeeded in 14 s (from migration 044's bump). The
-- chat-completion path was the bottleneck — Allianz's OCR text is large enough
-- that Sonnet/OpenAI structured output exceeds 65 s/55 s.
--
-- This migration raises the per-provider and budget ceilings:
--   primary_provider_timeout_ms: 65000  -> 90000  (+25 s)
--   fallback_provider_timeout_ms: 55000 -> 75000  (+20 s)
--   request_budget_ms:           125000 -> 175000 (+50 s, covers new sum)
--   client_fetch_timeout_ms:     135000 -> 185000 (+50 s, mirrors budget)
--   trial_extraction_timeout_ms: 150000 -> 200000 (+50 s, umbrella for /try)
-- ocr_fetch_timeout_ms stays at 90000 (already healthy from migration 044).
--
-- Idempotent: UPDATE only if the row currently equals the OLD value, so admins
-- who manually tuned to a different value via the Settings UI are not
-- overwritten. Re-runnable without effect after the first apply.

UPDATE public.app_settings
SET value = '90000', updated_at = NOW()
WHERE category = 'ai' AND key = 'primary_provider_timeout_ms' AND value = '65000';

UPDATE public.app_settings
SET value = '75000', updated_at = NOW()
WHERE category = 'ai' AND key = 'fallback_provider_timeout_ms' AND value = '55000';

UPDATE public.app_settings
SET value = '175000', updated_at = NOW()
WHERE category = 'ai' AND key = 'request_budget_ms' AND value = '125000';

UPDATE public.app_settings
SET value = '185000', updated_at = NOW()
WHERE category = 'ai' AND key = 'client_fetch_timeout_ms' AND value = '135000';

UPDATE public.app_settings
SET value = '200000', updated_at = NOW()
WHERE category = 'ai' AND key = 'trial_extraction_timeout_ms' AND value = '150000';
