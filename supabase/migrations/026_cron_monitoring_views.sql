-- Migration: 026_cron_monitoring_views
-- Description: Create secure views for admin API to monitor pg_cron jobs and runs without requiring superuser access directly from the API.

-- 1. Create a secure view for active jobs
CREATE OR REPLACE VIEW public.vw_cron_jobs AS
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

-- 2. Create a secure view for job run details
CREATE OR REPLACE VIEW public.vw_cron_job_runs AS
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

-- 3. Grant access to authenticated users (our admin API runs as authenticated/service_role but through views it's safer)
GRANT SELECT ON public.vw_cron_jobs TO authenticated;
GRANT SELECT ON public.vw_cron_job_runs TO authenticated;
GRANT SELECT ON public.vw_cron_jobs TO service_role;
GRANT SELECT ON public.vw_cron_job_runs TO service_role;
