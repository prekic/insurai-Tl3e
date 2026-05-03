-- Migration 058: Surface AS+ Yetkili Servis Ağı as a distinct coverage row
--
-- The Output Stability Test (PR #453) Round-4 substantive check #5 looks for
-- an AS+ / Anlaşmalı Servis Ağı network row in `data.coverages[]`. PR #457
-- found that — even after the gate's regex fixes — the live DB extraction
-- prompt does not currently emit this feature as a structured coverage row.
-- The AS+ phrase appears in source policies (e.g. the Tiguan / Eriş Ambalaj
-- fleet's "Hasarsızlık İndirimini Etkilemeyen AS+ Yetkili Servis Ağı") and
-- often becomes UI marketing copy or part of an unrelated coverage's
-- description, but never a separate line item.
--
-- This migration appends an AS+ AUTHORIZED SERVICE NETWORK EXTRACTION
-- section to the kasko prompt instructing the LLM to emit a dedicated
-- supplementary coverage row when AS+ network language is present, with
-- a description that names the in-network deductible-relief AND the
-- relationship to the out-of-network AS35 deductible (gotcha #93).
--
-- Same idempotent guarded-update pattern as 048-057. Applied only to
-- 'Kasko Extraction' and 'Policy Extraction - Master' since AS+ is a
-- kasko-only feature (traffic policies don't have a service network).
--
-- After this migration is applied to production, the Output Stability
-- Test should report 7/7 substantive checks present on the canonical
-- Tiguan fixture, and the gate's quality-floor (PR #457) will see one
-- fewer always-absent signal.

DO $$
DECLARE
  v_rules TEXT := E'\n\n## AS+ AUTHORIZED SERVICE NETWORK EXTRACTION (Round-4 PR-S3.5 follow-up)\n\nTurkish kasko policies often advertise an AUTHORIZED SERVICE NETWORK feature distinct from the underlying repair coverage. Anadolu calls it "AS+ Yetkili Servis Ağı". Other carriers use "Anlaşmalı Servis Ağı", "Yetkili Servis Ağı", or "Hasarsızlık İndirimini Etkilemeyen Servis". Whatever the brand, the feature has the same shape:\n\n- IN-NETWORK repairs are deductible-free AND do NOT affect the no-claims discount\n- OUT-OF-NETWORK repairs trigger a percentage deductible (commonly 35%, captured separately in `conditionalDeductibles[]` per the NAMED DEDUCTIBLE rules)\n\n### Trigger phrasings (Turkish)\n\n- "AS+" / "AS Plus" / "AS+ Yetkili Servis Ağı"\n- "Anlaşmalı Servis Ağı" / "Anlaşmalı Yetkili Servis Ağı"\n- "Yetkili Servis Ağı" (in a network/in-network context, NOT as a generic phrase)\n- "Hasarsızlık İndirimini Etkilemeyen Servis"\n- Any sentence pairing "anlaşmalı servis", "yetkili servis", or "ağ" with deductible-relief or NCD-preservation language\n\n### Trigger phrasings (English)\n\n- "Authorized Service Network"\n- "Contracted Service Network"\n- "In-Network Repair Service"\n- Any sentence pairing "contracted service" or "authorized service" with deductible-free language\n\n### Required output\n\nWhen any of the above triggers is present, emit a dedicated coverage item:\n\n```json\n{\n  "name": "Authorized Service Network",\n  "nameTr": "AS+ Yetkili Servis Ağı",   // or the carrier''s exact brand if different\n  "limit": null,\n  "deductible": null,\n  "isUnlimited": false,\n  "category": "supplementary",\n  "included": true,\n  "limitType": null,\n  "description": "In-network repairs are deductible-free and do not affect the no-claims discount. Out-of-network repairs trigger a separate percentage deductible (see conditionalDeductibles).",\n  "clause": "<the source clause / page reference>",\n  "quote": "<the literal Turkish phrase from the policy>"\n}\n```\n\n### Rules\n\n1. The AS+ row IS distinct from any glass-protection row, mini-repair row, or assistance (Anadolu Hizmet) row. Do NOT collapse them. Glass protection is a sub-feature; AS+ is the umbrella service-network feature.\n2. Use the carrier''s exact brand string in `nameTr` (e.g. "AS+ Yetkili Servis Ağı" for Anadolu, "Anlaşmalı Servis Ağı" for AXA). Always provide an English translation in `name`.\n3. Set `limit: null` — AS+ is a service feature, NOT a numeric cap. Do not invent a TL value.\n4. Use `category: "supplementary"` consistent with other Ek Sözleşme add-ons per migration 051.\n5. The `description` MUST mention BOTH the in-network deductible-relief AND the relationship to the out-of-network deductible. This lets the UI render the AS+ servisNetworkCallout (PR #436, Sprint 3 #14) accurately.\n6. If the policy mentions AS+ ONLY in marketing copy at the very top (e.g. as a bundled-product header) AND there is no clause-level reference elsewhere, you MAY still emit the row — the marketing copy IS the source of truth for the feature''s presence in the contract. Set the `quote` to the marketing line.\n7. If NO AS+ / authorized-service-network language appears anywhere in the document, do NOT invent the row. Skip the AS+ coverage entirely.\n\n### Worked example (Tiguan / Eriş Ambalaj fleet)\n\nSource phrase (page 1, marketing band): "Hasarsızlık İndirimini Etkilemeyen AS+ Yetkili Servis Ağı"\nSource phrase (clause): "Şirketimizle anlaşmalı olmayan yetkili serviste tamir ettirilmesi halinde, ... %35''i oranında tenzili muafiyet uygulanır."\n\nExpected coverage row:\n```json\n{\n  "name": "Authorized Service Network",\n  "nameTr": "AS+ Yetkili Servis Ağı",\n  "limit": null,\n  "deductible": null,\n  "isUnlimited": false,\n  "category": "supplementary",\n  "included": true,\n  "limitType": null,\n  "description": "In-network repairs are deductible-free and do not affect the no-claims discount. Out-of-network repairs trigger a 35% percentage deductible (captured in conditionalDeductibles).",\n  "clause": "AS+ Yetkili Servis Ağı (page 1 marketing band)",\n  "quote": "Hasarsızlık İndirimini Etkilemeyen AS+ Yetkili Servis Ağı"\n}\n```\n\nIn parallel, the corresponding non-network deductible MUST also appear in `conditionalDeductibles[]` per the existing AS35 / NAMED DEDUCTIBLE rules (gotcha #93):\n```json\n{\n  "trigger": "repair at non-contracted authorized service",\n  "rate": "%35",\n  "evidence": "Şirketimizle anlaşmalı olmayan yetkili serviste tamir ettirilmesi halinde, ... %35''i oranında tenzili muafiyet uygulanır."\n}\n```\n\nThe coverage row + the conditional deductible together form the complete picture. Do not drop either.';
BEGIN
  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_rules,
      updated_at = NOW()
  WHERE name = 'Kasko Extraction'
    AND system_prompt NOT LIKE '%AS+ AUTHORIZED SERVICE NETWORK EXTRACTION%';

  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_rules,
      updated_at = NOW()
  WHERE name = 'Policy Extraction - Master'
    AND system_prompt NOT LIKE '%AS+ AUTHORIZED SERVICE NETWORK EXTRACTION%';
END $$;

-- Verification:
--   SELECT name,
--          system_prompt LIKE '%AS+ AUTHORIZED SERVICE NETWORK EXTRACTION%' AS has_rules
--   FROM public.prompt_templates
--   WHERE name IN ('Kasko Extraction','Policy Extraction - Master');
-- Expect 2 rows with has_rules = true.
--
-- Pre-flight check (operator manual step, per gotcha #138):
--   1. Apply this migration via Supabase SQL Editor.
--   2. Run the verification query above — confirm 2 rows return true.
--   3. Wait 5 minutes for the prompt-service cache to expire (gotcha #159),
--      OR trigger a Railway redeploy to flush the cache immediately.
--   4. Re-run the Output Stability Test workflow against the canonical
--      Tiguan fixture (default after PR #457):
--          GitHub → Actions → output-stability.yml → Run workflow
--      Expect 7/7 substantive checks present (the AS+ ○ that previously
--      remained absent should now read ✓).
--   5. Re-upload `tests/fixtures/kasko/anadolu-volkswagen-tiguan.pdf` via
--      the production UI and confirm the rendered output now shows an
--      "AS+ Yetkili Servis Ağı" row in the Coverages section with the
--      bilingual gloss describing the in-network / out-of-network deductible
--      split.
--
-- Rollback (rare — only if the AS+ instructions cause regressions on
-- non-Anadolu carriers):
--   UPDATE public.prompt_templates
--   SET system_prompt = REGEXP_REPLACE(
--         system_prompt,
--         E'\\n\\n## AS\\+ AUTHORIZED SERVICE NETWORK EXTRACTION.*?(?=\\n\\n##|$)',
--         '',
--         's'
--       ),
--       updated_at = NOW()
--   WHERE name IN ('Kasko Extraction','Policy Extraction - Master');
