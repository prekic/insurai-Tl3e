-- Migration 034: Add trial_max_uploads_per_day to app_settings
-- Configures how many free trial uploads anonymous users get per 24-hour window.
-- Default: 3 uploads per day.
-- Idempotent via ON CONFLICT DO NOTHING.

INSERT INTO public.app_settings (category, key, value, value_type, description, is_sensitive)
VALUES
  ('ui', 'trial_max_uploads_per_day', '3', 'number', 'Maximum free trial uploads per 24-hour window for anonymous users', false)
ON CONFLICT (category, key) DO NOTHING;
