-- Migration 051: Demand specific Anadolu supplementary coverages in extraction
--
-- Reviewer's Sprint 2 #8: an Anadolu Birleşik Kasko policy lists 8 Ek Sözleşme
-- Maddeleri add-on coverages on page 9, but the LLM only returned a generic
-- subset (Cam, Hırsızlık, Doğal Afetler) and dropped:
--   - Hatalı Akaryakıt (50,000 TL annual cap)
--   - Cam Hasar Koruma (deductible-free first glass replacement in network)
--   - Hasarsızlık İndirimi Koruma (NCD protection)
--   - İkame Araç (Anadolu Hizmet Grup 2 — service tier, not numeric)
--   - Evcil Hayvan (cat/dog injury treatment)
--   - Anahtar Çalınma (theft via key acquisition)
--   - Mini Onarım Hizmeti (1× per period, free)
--   - Eskisi Yerine Yenisi (NEW vehicle replacement if pert/stolen in 1st year)
--
-- The deterministic Ek Sözleşme bullet parser in
-- src/lib/ai/policy-converter.ts:extractEkSozlesmeBullets() now always runs
-- (gate < 3 dropped), but stronger AI extraction reduces the dependency on
-- regex fallback and produces structured limit/deductible data the regex
-- can't recover.
--
-- This migration appends a SUPPLEMENTARY COVERAGE EXTRACTION section to the
-- live DB extraction prompts. Same idempotent guarded-update pattern as 048-050.

DO $$
DECLARE
  v_rules TEXT := E'\n\n## SUPPLEMENTARY COVERAGE EXTRACTION (kasko)\n\nTurkish kasko policies bundle a long tail of Ek Sözleşme Maddeleri (additional contract clauses / supplementary coverages) that materially shape the policy. Extract EVERY one you find, even if no numeric limit is given. Common Anadolu/AXA/Allianz add-ons:\n\n- Hatalı Akaryakıt — Wrong-fuel mechanical damage. Often capped (e.g. 50,000 TL annual).\n- Cam Hasar Koruma — Deductible-free first glass replacement in contracted network.\n- Hasarsızlık İndirimi Koruma — No-claims-discount protection (preserves NCD after first claim).\n- İkame Araç — Replacement vehicle. May be a service tier (e.g. "Anadolu Hizmet Grup 2") or day-count only — set limit: null per the COVERAGE LIMIT ATTRIBUTION rules.\n- Evcil Hayvan — Cat/dog injury treatment in vehicle.\n- Anahtar Çalınma / Anahtar Ele Geçirme — Theft via stolen-key acquisition.\n- Mini Onarım Hizmeti / Mini Repair Service — 1× per period free service.\n- Eskisi Yerine Yenisi — NEW vehicle replacement if pert/stolen within 1st year of registration.\n- Sigara ve Benzeri Madde Zararları — Cigarette burns inside cabin.\n- Kıymet Kazanma Tenzili İstisnası — No betterment deduction at claim payout.\n- Enflasyondan Korunma — Sum-insured indexed to inflation.\n- Araca İlave Donanım/Aksesuar — Add-on accessories up to 10% of rayiç.\n\nRules:\n1. EVERY add-on you find in the document MUST appear as a coverage item with category="supplementary".\n2. If no numeric limit is stated, use limit: null and put the qualitative description in the `description` field — DO NOT omit the row.\n3. If a numeric annual cap is stated (e.g. "50.000 TL yıllık aggregate"), capture it in `limit` with `limitType: "aggregate"`.\n4. Preserve the original Turkish coverage name in `nameTr`. Provide an English translation in `name`.\n5. NEVER drop a supplementary coverage just because it lacks a TL limit. The presence of the named feature IS the value to the policyholder.';
BEGIN
  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_rules,
      updated_at = NOW()
  WHERE name = 'Kasko Extraction'
    AND system_prompt NOT LIKE '%SUPPLEMENTARY COVERAGE EXTRACTION%';

  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_rules,
      updated_at = NOW()
  WHERE name = 'Policy Extraction - Master'
    AND system_prompt NOT LIKE '%SUPPLEMENTARY COVERAGE EXTRACTION%';
END $$;

-- Verification:
--   SELECT name, system_prompt LIKE '%SUPPLEMENTARY COVERAGE EXTRACTION%' AS has_rules
--   FROM public.prompt_templates
--   WHERE name IN ('Kasko Extraction','Policy Extraction - Master');
-- Expect 2 rows with has_rules = true.
