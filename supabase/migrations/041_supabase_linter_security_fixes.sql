-- Migration: 041_supabase_linter_security_fixes
-- Description: Fix all Supabase database linter security errors:
--   1. Recreate cron monitoring views as SECURITY INVOKER (not SECURITY DEFINER)
--   2. Enable RLS on all admin/system tables missing it
--   3. Add service_role-only policies for admin tables
--
-- This migration is idempotent — safe to re-run.

-- ============================================================================
-- 1. FIX SECURITY DEFINER VIEWS → SECURITY INVOKER
-- ============================================================================
-- The cron.job and cron.job_run_details tables are in a restricted schema.
-- Grant service_role direct SELECT on cron tables, then recreate views
-- as SECURITY INVOKER so they use the querying user's permissions.

-- Grant service_role access to cron schema objects
GRANT USAGE ON SCHEMA cron TO service_role;
GRANT SELECT ON cron.job TO service_role;
GRANT SELECT ON cron.job_run_details TO service_role;

-- Recreate views explicitly as SECURITY INVOKER
CREATE OR REPLACE VIEW public.vw_cron_jobs
WITH (security_invoker = true) AS
SELECT
    jobid,
    schedule,
    command,
    nodename,
    nodeport,
    database,
    username,
    active,
    jobname
FROM
    cron.job;

CREATE OR REPLACE VIEW public.vw_cron_job_runs
WITH (security_invoker = true) AS
SELECT
    jobid,
    runid,
    job_pid,
    database,
    username,
    command,
    status,
    return_message,
    start_time,
    end_time
FROM
    cron.job_run_details;

-- Revoke authenticated access (admin API uses service_role key, not anon/authenticated)
REVOKE SELECT ON public.vw_cron_jobs FROM authenticated;
REVOKE SELECT ON public.vw_cron_job_runs FROM authenticated;

-- Keep service_role grants
GRANT SELECT ON public.vw_cron_jobs TO service_role;
GRANT SELECT ON public.vw_cron_job_runs TO service_role;


-- ============================================================================
-- 2. ENABLE RLS ON ALL ADMIN/SYSTEM TABLES
-- ============================================================================
-- All these tables are accessed only via the server using SUPABASE_SERVICE_ROLE_KEY.
-- RLS with service_role-only policies ensures PostgREST (anon/authenticated) cannot
-- read or write these tables directly.

-- Admin core tables (may already have RLS from 005a/005b — idempotent)
ALTER TABLE IF EXISTS public.admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.admin_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.security_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.app_configs ENABLE ROW LEVEL SECURITY;

-- Admin notification & webhook tables
ALTER TABLE IF EXISTS public.admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.settings_webhooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Config drift baselines
ALTER TABLE IF EXISTS public.config_drift_baselines ENABLE ROW LEVEL SECURITY;

-- Actuarial engine tables
ALTER TABLE IF EXISTS public.policy_extractions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.extraction_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.actuarial_config_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.actuarial_config_set_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.actuarial_evaluation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.actuarial_evaluation_results ENABLE ROW LEVEL SECURITY;

-- FX rate history
ALTER TABLE IF EXISTS public.fx_rate_history ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- 3. CREATE SERVICE-ROLE-ONLY POLICIES (idempotent via DROP IF EXISTS + CREATE)
-- ============================================================================
-- Pattern: Only service_role can perform ALL operations. This blocks anon and
-- authenticated roles from direct PostgREST access while allowing the Express
-- server (which uses SUPABASE_SERVICE_ROLE_KEY) full access.

-- Helper: create a service-role-only policy for a table
-- Using DO blocks for idempotency (drop + create in one transaction)

DO $$ BEGIN
  -- admin_notifications
  DROP POLICY IF EXISTS admin_notifications_service_role ON public.admin_notifications;
  CREATE POLICY admin_notifications_service_role ON public.admin_notifications
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

  -- settings_webhooks
  DROP POLICY IF EXISTS settings_webhooks_service_role ON public.settings_webhooks;
  CREATE POLICY settings_webhooks_service_role ON public.settings_webhooks
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

  -- webhook_deliveries
  DROP POLICY IF EXISTS webhook_deliveries_service_role ON public.webhook_deliveries;
  CREATE POLICY webhook_deliveries_service_role ON public.webhook_deliveries
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

  -- config_drift_baselines
  DROP POLICY IF EXISTS config_drift_baselines_service_role ON public.config_drift_baselines;
  CREATE POLICY config_drift_baselines_service_role ON public.config_drift_baselines
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

  -- policy_extractions
  DROP POLICY IF EXISTS policy_extractions_service_role ON public.policy_extractions;
  CREATE POLICY policy_extractions_service_role ON public.policy_extractions
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

  -- extraction_evidence
  DROP POLICY IF EXISTS extraction_evidence_service_role ON public.extraction_evidence;
  CREATE POLICY extraction_evidence_service_role ON public.extraction_evidence
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

  -- actuarial_config_sets
  DROP POLICY IF EXISTS actuarial_config_sets_service_role ON public.actuarial_config_sets;
  CREATE POLICY actuarial_config_sets_service_role ON public.actuarial_config_sets
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

  -- actuarial_config_set_versions
  DROP POLICY IF EXISTS actuarial_config_set_versions_service_role ON public.actuarial_config_set_versions;
  CREATE POLICY actuarial_config_set_versions_service_role ON public.actuarial_config_set_versions
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

  -- actuarial_evaluation_runs
  DROP POLICY IF EXISTS actuarial_evaluation_runs_service_role ON public.actuarial_evaluation_runs;
  CREATE POLICY actuarial_evaluation_runs_service_role ON public.actuarial_evaluation_runs
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

  -- actuarial_evaluation_results
  DROP POLICY IF EXISTS actuarial_evaluation_results_service_role ON public.actuarial_evaluation_results;
  CREATE POLICY actuarial_evaluation_results_service_role ON public.actuarial_evaluation_results
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

  -- fx_rate_history
  DROP POLICY IF EXISTS fx_rate_history_service_role ON public.fx_rate_history;
  CREATE POLICY fx_rate_history_service_role ON public.fx_rate_history
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

  -- Re-create policies for tables that may have had them from 005a/005b
  -- (idempotent — DROP IF EXISTS first)
  DROP POLICY IF EXISTS admin_users_service_role ON public.admin_users;
  CREATE POLICY admin_users_service_role ON public.admin_users
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

  DROP POLICY IF EXISTS admin_sessions_service_role ON public.admin_sessions;
  CREATE POLICY admin_sessions_service_role ON public.admin_sessions
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

  DROP POLICY IF EXISTS security_events_service_role ON public.security_events;
  CREATE POLICY security_events_service_role ON public.security_events
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

  DROP POLICY IF EXISTS audit_logs_service_role ON public.audit_logs;
  CREATE POLICY audit_logs_service_role ON public.audit_logs
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

  DROP POLICY IF EXISTS app_configs_service_role ON public.app_configs;
  CREATE POLICY app_configs_service_role ON public.app_configs
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
END $$;
