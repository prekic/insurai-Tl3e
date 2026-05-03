-- Migration 059: Roll back migration 058's AS+ section (it was too large)
--
-- Migration 058 added a ~3KB AS+ AUTHORIZED SERVICE NETWORK EXTRACTION
-- section to the Kasko Extraction and Policy Extraction - Master prompt
-- templates. Production verification (Output Stability workflow run on
-- May 3, 2026) showed two regressions:
--
--   1. Tiguan extraction's coverage list dropped from 26-29 rows down
--      to 12 rows — the LLM started truncating output to fit within the
--      32K stream-token budget (gotcha #128).
--   2. Subsequent runs returned "All AI providers failed" — both
--      Anthropic and OpenAI errored on the same call, indicating a
--      common upstream cause like input-token-budget overflow on the
--      combined system-prompt + 60K-char Tiguan input.
--
-- Migration 058 was prompt-bloat from too much explanatory content
-- (worked example, redundant trigger lists). The AS+ instruction itself
-- is small; the supporting prose was the problem.
--
-- This migration restores the prompt to its pre-058 state. Migration
-- 060 (next) re-adds the AS+ instruction in a trimmed ~400-byte form
-- that avoids the budget pressure.
--
-- Idempotent: REGEXP_REPLACE silently no-ops when the marker is absent.

UPDATE public.prompt_templates
SET system_prompt = REGEXP_REPLACE(
      system_prompt,
      E'\\n\\n## AS\\+ AUTHORIZED SERVICE NETWORK EXTRACTION.*?(?=\\n\\n##|$)',
      '',
      's'
    ),
    updated_at = NOW()
WHERE name IN ('Kasko Extraction','Policy Extraction - Master')
  AND system_prompt LIKE '%AS+ AUTHORIZED SERVICE NETWORK EXTRACTION%';

-- Verification:
--   SELECT name,
--          system_prompt LIKE '%AS+ AUTHORIZED SERVICE NETWORK EXTRACTION%' AS still_has_058
--   FROM public.prompt_templates
--   WHERE name IN ('Kasko Extraction','Policy Extraction - Master');
-- Expect 2 rows with still_has_058 = false.
