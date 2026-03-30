-- Migration 043: Seed benchmark aging/stale threshold configs
-- Makes benchmark freshness thresholds admin-configurable via Settings UI

INSERT INTO public.app_settings (category, key, value, description, "schema")
VALUES
  ('evaluation', 'benchmark_aging_days', '180', 'Days after dataDate before benchmark is considered aging (181-365 default range)', '{"type":"number","minimum":30,"maximum":730}'),
  ('evaluation', 'benchmark_stale_days', '365', 'Days after dataDate before benchmark is considered stale (>365 default)', '{"type":"number","minimum":60,"maximum":1460}')
ON CONFLICT (category, key) DO NOTHING;
