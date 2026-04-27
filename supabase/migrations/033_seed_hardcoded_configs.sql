-- Migration 033: Seed all hardcoded backend configurations as admin-configurable app_settings
-- These values were previously hardcoded constants across the codebase.
-- Pattern: DB-first with hardcoded fallback (if DB unavailable, code uses defaults from types.ts)

-- =============================================================================
-- Phase 1: Extraction Timeouts (category: ai)
-- =============================================================================
INSERT INTO public.app_settings (category, key, value, value_type, description, is_sensitive)
VALUES
  ('ai', 'request_budget_ms', '175000', 'number', 'Total extraction time budget in milliseconds', false),
  ('ai', 'primary_provider_timeout_ms', '90000', 'number', 'Primary AI provider timeout in milliseconds', false),
  ('ai', 'fallback_provider_timeout_ms', '75000', 'number', 'Fallback AI provider timeout in milliseconds', false),
  ('ai', 'client_fetch_timeout_ms', '185000', 'number', 'Client-side fetch timeout for extraction proxy calls in milliseconds', false),
  ('ai', 'trial_extraction_timeout_ms', '200000', 'number', 'Umbrella timeout for trial page extraction in milliseconds', false)
ON CONFLICT (category, key) DO NOTHING;

-- =============================================================================
-- Phase 2: FX Service Settings (category: fx)
-- =============================================================================
INSERT INTO public.app_settings (category, key, value, value_type, description, is_sensitive)
VALUES
  ('fx', 'server_cache_ttl_ms', '21600000', 'number', 'Server-side FX rate cache TTL in milliseconds (default 6 hours)', false),
  ('fx', 'supported_currencies', '["TRY","USD","EUR","GBP","CHF","SAR","AED"]', 'json', 'List of supported currency symbols for FX conversion', false),
  ('fx', 'fallback_rates', '{"TRYUSD":0.0299,"TRYEUR":0.0275,"TRYGBP":0.0236,"TRYCHF":0.0264,"TRYSAR":0.1121,"TRYAED":0.1098,"TRYJPY":4.4700,"TRYCAD":0.0420,"TRYAUD":0.0473}', 'json', 'Fallback FX rates when API is unavailable (base: TRY)', false),
  ('fx', 'api_timeout_ms', '10000', 'number', 'exchangerate.host API fetch timeout in milliseconds', false),
  ('fx', 'client_cache_ttl_ms', '14400000', 'number', 'Client-side FX rate cache TTL in milliseconds (default 4 hours)', false)
ON CONFLICT (category, key) DO NOTHING;

-- =============================================================================
-- Phase 3: Service Cache TTLs (category: server)
-- =============================================================================
INSERT INTO public.app_settings (category, key, value, value_type, description, is_sensitive)
VALUES
  ('server', 'db_query_timeout_ms', '8000', 'number', 'Database query timeout for config/prompt fetches in milliseconds', false),
  ('server', 'config_cache_ttl_ms', '300000', 'number', 'Config service in-memory cache TTL in milliseconds (default 5 min)', false),
  ('server', 'prompt_cache_ttl_ms', '300000', 'number', 'Prompt service in-memory cache TTL in milliseconds (default 5 min)', false),
  ('server', 'translation_cache_ttl_ms', '300000', 'number', 'Translation service cache TTL in milliseconds (default 5 min)', false),
  ('server', 'rate_limit_config_cache_ttl_ms', '60000', 'number', 'Rate limit config cache TTL in milliseconds (default 1 min)', false)
ON CONFLICT (category, key) DO NOTHING;

-- =============================================================================
-- Phase 4: Webhook Config (category: webhooks)
-- =============================================================================
INSERT INTO public.app_settings (category, key, value, value_type, description, is_sensitive)
VALUES
  ('webhooks', 'max_delivery_attempts', '3', 'number', 'Maximum number of webhook delivery retry attempts', false),
  ('webhooks', 'delivery_timeout_ms', '10000', 'number', 'Webhook delivery HTTP timeout in milliseconds', false),
  ('webhooks', 'max_response_body_length', '1000', 'number', 'Maximum characters to store from webhook response body', false)
ON CONFLICT (category, key) DO NOTHING;

-- =============================================================================
-- Phase 5: PDF/OCR Pipeline (category: ocr — extends existing ocr category)
-- =============================================================================
INSERT INTO public.app_settings (category, key, value, value_type, description, is_sensitive)
VALUES
  ('ocr', 'pdf_load_timeout_ms', '30000', 'number', 'PDF.js loading timeout in milliseconds', false),
  ('ocr', 'max_worker_failures', '2', 'number', 'Maximum PDF worker failures before switching to fake worker mode', false),
  ('ocr', 'ocr_cleanup_timeout_ms', '30000', 'number', 'LLM OCR cleanup timeout in milliseconds', false)
ON CONFLICT (category, key) DO NOTHING;

-- =============================================================================
-- Phase 6: Cost Tracking / Token Pricing (category: cost)
-- =============================================================================
INSERT INTO public.app_settings (category, key, value, value_type, description, is_sensitive)
VALUES
  ('cost', 'token_pricing', '{
    "gpt-4o": 0.005,
    "gpt-4o-mini": 0.00015,
    "gpt-4-turbo": 0.01,
    "gpt-4": 0.03,
    "gpt-3.5-turbo": 0.0005,
    "claude-opus-4-20250514": 0.015,
    "claude-sonnet-4-20250514": 0.003,
    "claude-3-5-haiku-latest": 0.001,
    "claude-3-opus-20240229": 0.015,
    "claude-3-sonnet-20240229": 0.003,
    "claude-3-haiku-20240307": 0.00025,
    "gemini-1.5-pro": 0.00125,
    "gemini-1.5-flash": 0.000075,
    "gemini-2.0-flash": 0.0001,
    "gemini-1.0-pro": 0.0005,
    "document-ai-ocr": 0.0015,
    "vision-api": 0.0015,
    "default": 0.001
  }', 'json', 'Cost per 1K tokens by model name (USD). Used for usage tracking and budget alerts.', false)
ON CONFLICT (category, key) DO NOTHING;

-- =============================================================================
-- Phase 7: Free Trial Duration (category: ui — extends existing ui category)
-- =============================================================================
INSERT INTO public.app_settings (category, key, value, value_type, description, is_sensitive)
VALUES
  ('ui', 'trial_expiry_ms', '86400000', 'number', 'Free trial session expiry in milliseconds (default 24 hours)', false)
ON CONFLICT (category, key) DO NOTHING;

-- =============================================================================
-- Ring Buffers & Monitoring Limits (category: monitoring — extends existing)
-- =============================================================================
INSERT INTO public.app_settings (category, key, value, value_type, description, is_sensitive)
VALUES
  ('monitoring', 'extraction_buffer_size', '200', 'number', 'In-memory extraction metrics ring buffer size', false),
  ('monitoring', 'max_metrics_buffer_size', '10000', 'number', 'Maximum monitoring metrics buffer size', false),
  ('monitoring', 'max_alert_history', '1000', 'number', 'Maximum alert history entries to retain in memory', false),
  ('monitoring', 'max_response_times', '1000', 'number', 'Maximum response time entries for monitoring buffer', false),
  ('monitoring', 'server_perf_max_events', '500', 'number', 'Maximum server performance events to retain', false),
  ('monitoring', 'server_perf_max_age_ms', '3600000', 'number', 'Maximum age for server performance events in milliseconds (default 1 hour)', false)
ON CONFLICT (category, key) DO NOTHING;
