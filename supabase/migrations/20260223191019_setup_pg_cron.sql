-- Enable the pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Enable the pg_net extension to make HTTP requests
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the cron job to run daily at 08:00 UTC
-- This makes a POST request to our Edge Function
SELECT cron.schedule(
  'invoke-notify-expiring',
  '0 8 * * *',
  $$
  SELECT net.http_post(
      url:=(select current_setting('app.settings.edge_function_url', true) || '/notify-expiring'),
      headers:=jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || (select current_setting('app.settings.service_role_key', true))
      )
  ) as request_id;
  $$
);
