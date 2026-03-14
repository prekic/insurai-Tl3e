-- Update the configured default models from the deprecated claude-3-5-haiku-20241022
-- to claude-3-5-haiku-latest (which maps to the active 20241022 successor)

UPDATE app_settings
SET 
  setting_value = '"claude-3-5-haiku-latest"',
  updated_at = NOW()
WHERE 
  setting_key IN ('anthropic_extraction_model', 'anthropic_backup_model')
  AND setting_value = '"claude-3-5-haiku-20241022"';
