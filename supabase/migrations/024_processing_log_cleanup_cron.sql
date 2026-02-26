-- Migration 024: Processing Log Auto-Cleanup via pg_cron
--
-- Schedule daily cleanup of processing logs older than 90 days.
-- Matches deleteOldLogs() default of 90 days in processing-log-service.ts.
-- Runs at 04:00 UTC daily (1 hour after extraction_metrics cleanup at 03:00 UTC).
--
-- Idempotent: safe to run multiple times.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'cleanup-processing-logs',
      '0 4 * * *',
      $$DELETE FROM public.document_processing_logs
        WHERE started_at < NOW() - INTERVAL '90 days'$$
    );
    RAISE NOTICE 'pg_cron job scheduled: cleanup-processing-logs (daily at 04:00 UTC, 90-day retention)';
  ELSE
    RAISE NOTICE 'pg_cron extension not available, skipping processing log cleanup schedule';
  END IF;
EXCEPTION
  WHEN others THEN
    RAISE NOTICE 'pg_cron not available or scheduling failed, skipping processing log cleanup schedule: %', SQLERRM;
END;
$$;
