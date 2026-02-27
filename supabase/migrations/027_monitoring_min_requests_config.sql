-- Migration 027: Add min_provider_requests_for_latency_alert config
-- Minimum number of requests from a provider before latency alerts can fire.
-- Prevents false alerts from 1-2 slow requests.

INSERT INTO public.app_settings (category, key, value, description)
VALUES (
  'monitoring',
  'min_provider_requests_for_latency_alert',
  '3',
  'Minimum number of requests from a provider before latency alerts can fire. Prevents false alerts from 1-2 slow requests.'
) ON CONFLICT (category, key) DO NOTHING;
