-- Migration: Actuarial Engine Enhancements (Worker Settings & Trend Data)
-- Description: Adds configuration for web worker simulations and storage for Monte Carlo confidence bounds

-- 1. Add new config keys to app_settings if they don't exist
INSERT INTO app_settings (category, key, value, value_type, description, description_tr, display_order)
VALUES 
    ('evaluation', 'worker_enabled', 'true', 'boolean', 'Enable Web Worker for running Monte Carlo simulations off the main thread', 'Monte Carlo simülasyonları için Web Worker ı etkinleştir', 40),
    ('evaluation', 'worker_iterations', '10000', 'number', 'Number of iterations for actuarial simulations (recommended: 10000)', 'Aktüeryal simülasyonlar için iterasyon sayısı', 41)
ON CONFLICT (category, key) DO NOTHING;

-- 2. Add columns to store Monte Carlo confidence intervals for historical trend charting
ALTER TABLE actuarial_evaluation_results
ADD COLUMN IF NOT EXISTS monte_carlo_lower_bound NUMERIC(10, 2),
ADD COLUMN IF NOT EXISTS monte_carlo_upper_bound NUMERIC(10, 2);

-- Note: existing records will have NULL for these bounds, which the UI should handle gracefully.
