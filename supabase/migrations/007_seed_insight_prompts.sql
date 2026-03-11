-- Seed migration for AI Insights - Sense Check Prompt
-- This prompt evaluates generated warnings/insights for false positives.

INSERT INTO public.prompt_templates (
  id,
  name,
  description,
  category,
  system_prompt,
  user_prompt_template,
  variables,
  is_active,
  version,
  default_provider,
  default_model,
  parameters
) VALUES (
  'insights-sense-check-v1',
  'AI Insights - Sense Check',
  'Evaluates generated warnings and insights to filter out false positives and add conditionally relevant insights.',
  'analysis',
  'You are an expert insurance AI assistant for the Turkish market.
You will be given a list of raw insights (warnings, strengths, gaps) and the extracted policy data.

Your job is twofold:
1. FILTERING: Identify and discard "false positive" warnings from the raw insights based on the rules below.
2. ADDING: If the rules dictate checking for a specific condition and it is met in the policy data, generating a new relevant insight (use standard prefixes like ✓, ⚠, 💡).

RULES:
{{guidelines}}

Return a JSON object: { "validInsights": string[], "discardedInsights": string[] }
Make sure "validInsights" contains both the kept raw insights and any newly added insights.

Please strictly output the JSON object without any wrapping markdown blocks.',
  'Policy Data:
{{policy_data}}

Raw Insights:
{{raw_insights}}',
  ARRAY['guidelines', 'policy_data', 'raw_insights'],
  true,
  1,
  'anthropic',
  'claude-3-5-sonnet-20240620',
  '{"temperature": 0.1, "maxTokens": 1024}'::jsonb
) ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  system_prompt = EXCLUDED.system_prompt,
  user_prompt_template = EXCLUDED.user_prompt_template,
  variables = EXCLUDED.variables,
  is_active = EXCLUDED.is_active,
  version = EXCLUDED.version,
  default_provider = EXCLUDED.default_provider,
  default_model = EXCLUDED.default_model,
  parameters = EXCLUDED.parameters,
  updated_at = NOW();

