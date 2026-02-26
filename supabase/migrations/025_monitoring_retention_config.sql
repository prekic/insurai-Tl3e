-- Migration 025: Monitoring alerts + Data retention configuration
--
-- Seeds monitoring and retention config settings into app_settings table.
-- Creates configurable DB functions for pg_cron cleanup jobs.
-- Replaces hardcoded 90-day/30-day retention with admin-configurable values.

-- ============================================================================
-- SEED MONITORING CONFIG
-- ============================================================================

INSERT INTO app_settings (category, key, value, value_type, description, display_order)
VALUES
  ('monitoring', 'error_rate_warning_threshold', '"0.05"', 'number', 'Warning alert fires when 24h error rate exceeds this (0-1)', 1),
  ('monitoring', 'error_rate_critical_threshold', '"0.20"', 'number', 'Critical alert fires when 24h error rate exceeds this (0-1)', 2),
  ('monitoring', 'avg_latency_critical_ms', '"12000"', 'number', 'Alert fires when provider avg latency exceeds this (ms)', 3),
  ('monitoring', 'check_interval_ms', '"300000"', 'number', 'How often to evaluate alert conditions (ms)', 4),
  ('monitoring', 'alert_cooldown_minutes', '"15"', 'number', 'Minimum minutes between same alert type', 5),
  ('monitoring', 'enable_email_alerts', '"false"', 'boolean', 'Send email notifications for extraction alerts', 6),
  ('monitoring', 'alert_email_addresses', '""', 'string', 'Comma-separated admin email addresses for alerts', 7)
ON CONFLICT (category, key) DO NOTHING;

-- ============================================================================
-- SEED RETENTION CONFIG
-- ============================================================================

INSERT INTO app_settings (category, key, value, value_type, description, display_order)
VALUES
  ('retention', 'processing_log_retention_days', '"90"', 'number', 'Days to keep document processing logs before auto-cleanup', 1),
  ('retention', 'extraction_metrics_retention_days', '"30"', 'number', 'Days to keep extraction metrics before auto-cleanup', 2)
ON CONFLICT (category, key) DO NOTHING;

-- ============================================================================
-- CONFIGURABLE CLEANUP FUNCTIONS (read retention from app_settings)
-- ============================================================================

-- Processing logs cleanup: reads retention_days from app_settings
CREATE OR REPLACE FUNCTION cleanup_processing_logs_configurable()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  retention_days int;
BEGIN
  SELECT COALESCE((value #>> '{}')::int, 90)
    INTO retention_days
    FROM app_settings
    WHERE category = 'retention' AND key = 'processing_log_retention_days';

  -- Fallback if no row found
  IF retention_days IS NULL THEN
    retention_days := 90;
  END IF;

  DELETE FROM document_processing_logs
    WHERE started_at < NOW() - (retention_days || ' days')::interval;
END;
$fn$;

-- Extraction metrics cleanup: reads retention_days from app_settings
CREATE OR REPLACE FUNCTION cleanup_extraction_metrics_configurable()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $fn$
DECLARE
  retention_days int;
BEGIN
  SELECT COALESCE((value #>> '{}')::int, 30)
    INTO retention_days
    FROM app_settings
    WHERE category = 'retention' AND key = 'extraction_metrics_retention_days';

  -- Fallback if no row found
  IF retention_days IS NULL THEN
    retention_days := 30;
  END IF;

  DELETE FROM extraction_metrics
    WHERE created_at < NOW() - (retention_days || ' days')::interval;
END;
$fn$;

-- ============================================================================
-- REPLACE PG_CRON JOBS TO USE CONFIGURABLE FUNCTIONS
-- ============================================================================
-- Note: pg_cron extension must already be enabled (migration 022/20260223191019)
-- The old hardcoded jobs from migrations 023/024 are replaced here.

DO $do$
BEGIN
  -- Attempt to unschedule old hardcoded jobs (ignore if they don't exist)
  BEGIN
    PERFORM cron.unschedule('cleanup-extraction-metrics');
  EXCEPTION WHEN OTHERS THEN
    NULL; -- job didn't exist, that's fine
  END;

  BEGIN
    PERFORM cron.unschedule('cleanup-processing-logs');
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  -- Schedule new configurable jobs
  PERFORM cron.schedule(
    'cleanup-extraction-metrics-configurable',
    '0 3 * * *',
    'SELECT cleanup_extraction_metrics_configurable()'
  );

  PERFORM cron.schedule(
    'cleanup-processing-logs-configurable',
    '0 4 * * *',
    'SELECT cleanup_processing_logs_configurable()'
  );
END;
$do$;
