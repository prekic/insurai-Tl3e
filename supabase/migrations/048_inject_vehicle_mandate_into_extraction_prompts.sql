-- Migration 048: Inject mandatory vehicle-fields rule into the live extraction prompts
--
-- The production extraction endpoint /api/ai/extract/anthropic loads its
-- prompt from the prompt_templates DB table (via getExtractionPrompt → 'Kasko
-- Extraction' for kasko, falling back to 'Policy Extraction - Master').
--
-- PR #399 added a "MANDATORY VEHICLE FIELDS" rule to
-- src/lib/ai/kasko-parser-prompts.ts EXTRACTION_SYSTEM_PROMPT — but that's
-- a separate Phase-2 comprehensive parser prompt that the production
-- /api/ai/extract/anthropic endpoint does NOT use.
--
-- The April 29 production smoke (4 real Turkish kasko PDFs) confirmed:
-- 0/4 fixtures returned vehicle.make / .model. The schemaPrompt + admin
-- userPrompt path doesn't push hard enough on vehicle extraction, so the
-- LLM happily returns vehicle: null even when the document has a clear
-- "Marka : PEUGEOT" or "Aracın Markası" block.
--
-- This migration appends a non-negotiable Vehicle Extraction section to the
-- system_prompt of 'Kasko Extraction', 'Traffic Insurance Extraction',
-- and 'Policy Extraction - Master'. Idempotent — guarded by a sentinel
-- string so re-runs don't double-append.

DO $$
DECLARE
  v_mandate TEXT := E'\n\n## MANDATORY VEHICLE FIELDS (kasko / traffic only)\n\nFor every kasko or traffic policy you MUST populate vehicle.make, vehicle.model, vehicle.year, and vehicle.plate whenever they appear anywhere in the document. This is non-negotiable.\n\nLook in:\n- Labelled blocks: "Marka", "Tip", "Aracın Markası", "Model", "Modeli", "Model Yılı", "İmal Yılı", "Plaka", "Plaka No"\n- Tabular rows where the row label is one of the above\n- Inverted "value-then-label" layouts (e.g. AXA Peugeot format where the value PRECEDES the label on the same line — `: PEUGEOT (114)\\tMarka Plaka No : 34 GM 6461`)\n- Vehicle identification blocks at the top or in the appendix\n\nRules:\n1. DO NOT return `vehicle: null` if any of these fields are visible. If only the make is found, still return the make and set the missing fields to null individually.\n2. DO NOT collapse make+model into one field. They are separate fields. "RENAULT MEGANE" → make="RENAULT", model="MEGANE".\n3. Make must be an actual automotive brand (FORD, RENAULT, PEUGEOT, VOLKSWAGEN, OPEL, FIAT, TOYOTA, etc.). DO NOT extract repair clauses like "Yetkili" or "Serviste Onar" as Make/Model.\n4. Year must be the model year (Model Yılı / İmal Yılı), 4-digit, between 1950 and the current year + 1.\n5. Plate is the Turkish license plate (e.g. "34 ABC 123", "67 LJ 968"). Strip extra spaces but keep the canonical "NN XXX NNN" or "NN XX NNNN" format.';
BEGIN
  -- Kasko Extraction (used first for policyType='kasko')
  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_mandate,
      updated_at = NOW()
  WHERE name = 'Kasko Extraction'
    AND system_prompt NOT LIKE '%MANDATORY VEHICLE FIELDS%';

  -- Traffic Insurance Extraction (vehicle data is required here too)
  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_mandate,
      updated_at = NOW()
  WHERE name = 'Traffic Insurance Extraction'
    AND system_prompt NOT LIKE '%MANDATORY VEHICLE FIELDS%';

  -- Policy Extraction - Master (fallback when type-specific lookup misses)
  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_mandate,
      updated_at = NOW()
  WHERE name = 'Policy Extraction - Master'
    AND system_prompt NOT LIKE '%MANDATORY VEHICLE FIELDS%';
END $$;

-- Verification (informational — not enforced):
--   SELECT name, system_prompt LIKE '%MANDATORY VEHICLE FIELDS%' AS has_mandate
--   FROM public.prompt_templates
--   WHERE name IN ('Kasko Extraction', 'Traffic Insurance Extraction', 'Policy Extraction - Master');
-- Expect 3 rows with has_mandate = true.
