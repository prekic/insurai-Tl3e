-- Migration 062: Restore AI Temperature
-- Reverts temperature from 0 to 0.1 for production as part of 4-stage pipeline transition

UPDATE public.app_settings
SET value = '0.1'
WHERE key = 'ai.temperature';
