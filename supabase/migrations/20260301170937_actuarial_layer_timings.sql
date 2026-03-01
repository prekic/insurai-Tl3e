-- Add granular layer timings to track actuarial engine performance
ALTER TABLE public.actuarial_evaluation_runs
ADD COLUMN IF NOT EXISTS layer_a_ms NUMERIC,
ADD COLUMN IF NOT EXISTS layer_b_ms NUMERIC,
ADD COLUMN IF NOT EXISTS layer_c_ms NUMERIC,
ADD COLUMN IF NOT EXISTS layer_d_ms NUMERIC;

COMMENT ON COLUMN public.actuarial_evaluation_runs.layer_a_ms IS 'Time spent in Layer A (Exclusions & Evidence) in milliseconds';
COMMENT ON COLUMN public.actuarial_evaluation_runs.layer_b_ms IS 'Time spent in Layer B (Compliance Gate) in milliseconds';
COMMENT ON COLUMN public.actuarial_evaluation_runs.layer_c_ms IS 'Time spent in Layer C (Monte Carlo simulation) in milliseconds';
COMMENT ON COLUMN public.actuarial_evaluation_runs.layer_d_ms IS 'Time spent in Layer D (TOPSIS Ranking) in milliseconds';
