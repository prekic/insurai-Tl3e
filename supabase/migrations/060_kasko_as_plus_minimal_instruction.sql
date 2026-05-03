-- Migration 060: Re-add AS+ extraction instruction in trimmed form
--
-- Migration 058 attempted the same instruction in ~3KB of prose with a
-- worked example and redundant trigger lists. That bloat tipped the
-- combined system-prompt + Tiguan input over the LLM's effective
-- token budget, causing coverage truncation and "all providers failed"
-- errors. Migration 059 rolled it back.
--
-- This migration ships the same INSTRUCTION as 058 but compressed to
-- ~500 bytes — a single paragraph, no worked example, no redundant
-- trigger restatement. Tested by reading the LLM-emitted output: the
-- short form is sufficient for the model to surface AS+ as a coverage
-- row, and the prompt-size headroom is restored.
--
-- Same idempotent guarded-update pattern as 048-058. Sentinel marker
-- distinct from 058's so future code-spelunkers can tell them apart.

DO $$
DECLARE
  v_rule TEXT := E'\n\n## AS+ NETWORK COVERAGE (compact)\nIf the policy mentions AS+, Anlaşmalı Servis Ağı, Yetkili Servis Ağı, Authorized Service Network, or Hasarsızlık İndirimini Etkilemeyen Servis, emit ONE coverage item with name="Authorized Service Network", nameTr containing the carrier brand string (e.g. "AS+ Yetkili Servis Ağı"), category="supplementary", limit=null, isUnlimited=false, included=true. Description should note in-network repairs are deductible-free; out-of-network repairs trigger a separate percentage deductible captured in conditionalDeductibles. Do NOT collapse with glass-protection, mini-repair, or assistance rows. Skip entirely if no AS+ language appears.';
BEGIN
  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_rule,
      updated_at = NOW()
  WHERE name = 'Kasko Extraction'
    AND system_prompt NOT LIKE '%AS+ NETWORK COVERAGE (compact)%';

  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_rule,
      updated_at = NOW()
  WHERE name = 'Policy Extraction - Master'
    AND system_prompt NOT LIKE '%AS+ NETWORK COVERAGE (compact)%';
END $$;

-- Verification:
--   SELECT name,
--          system_prompt LIKE '%AS+ NETWORK COVERAGE (compact)%' AS has_compact_rule
--   FROM public.prompt_templates
--   WHERE name IN ('Kasko Extraction','Policy Extraction - Master');
-- Expect 2 rows with has_compact_rule = true.
--
-- Combined verification (after applying both 059 and 060):
--   SELECT name,
--          system_prompt LIKE '%AS+ AUTHORIZED SERVICE NETWORK EXTRACTION%' AS has_058,
--          system_prompt LIKE '%AS+ NETWORK COVERAGE (compact)%'           AS has_060,
--          LENGTH(system_prompt) AS prompt_bytes
--   FROM public.prompt_templates
--   WHERE name IN ('Kasko Extraction','Policy Extraction - Master');
-- Expect 2 rows: has_058=false, has_060=true. prompt_bytes should be
-- ~3KB smaller than before applying 059+060.
--
-- Rollback (rare):
--   UPDATE public.prompt_templates
--   SET system_prompt = REGEXP_REPLACE(
--         system_prompt,
--         E'\\n\\n## AS\\+ NETWORK COVERAGE \\(compact\\).*?(?=\\n\\n##|$)',
--         '',
--         's'
--       ),
--       updated_at = NOW()
--   WHERE name IN ('Kasko Extraction','Policy Extraction - Master');
