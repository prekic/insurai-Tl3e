-- Migration 056: Strengthen the formal-exclusion checklist (Round-4 #5)
--
-- Round-4 reviewer's Anadolu policy explicitly contained four formal
-- exclusions that the LLM extraction missed despite migration 052
-- listing them in the "PRIORITIZE POLICY-SPECIFIC CUSTOM EXCLUSIONS"
-- section:
--   - Salgın ve Bulaşıcı Hastalık İstisnası (pandemic, page 14)
--   - Siber Saldırı İstisna Klozu (cyber, page 15)
--   - Yaptırım Klozu (sanctions: BMGK, EU, UK, US, pages 13-14)
--   - NBC 500,000 TL sub-limit (page 12)
--
-- Diagnosis: 052's instructions are buried at the end of a long
-- system prompt where Anthropic's instruction-following weakens.
-- 056 appends a SHORT, HIGH-PRIORITY checklist that fires as a
-- final step BEFORE returning the JSON, listing the four mandatory
-- exclusions with example phrasings the LLM can pattern-match.
--
-- Same idempotent guarded-update pattern as 048-055.

DO $$
DECLARE
  v_checklist TEXT := E'\n\n## FORMAL EXCLUSION CHECKLIST (FINAL STEP — REQUIRED)\n\nBefore returning your JSON output, run this checklist against the source text. For EACH item below, scan the source for the listed Turkish or English phrasings. If found, the exclusion MUST appear in your `exclusions[]` array (or `coverages[].carveOuts[]` if it''s a per-coverage cap). If absent, do nothing — but you MUST scan.\n\n1. PANDEMIC — search for: "Salgın", "Pandemi", "Bulaşıcı Hastalık", "COVID", "Pandemic", "Communicable Disease". Common heading: "Salgın ve Bulaşıcı Hastalık İstisnası". Surface as: a single exclusion entry capturing the exclusion AND any indirect-cost language (e.g. "kamu otoritesi tarafından kapatma kararı"). Do NOT re-paraphrase if multiple variants of this clause appear in the source.\n\n2. CYBER — search for: "Siber", "Cyber", "Bilişim", "Cyber Attack", "Veri İhlali". Common heading: "Siber Saldırı İstisna Klozu" / "Siber Risk Klozu". Surface as: one exclusion entry referencing the kloz name. If the policy has BOTH a kloz AND a separate "elektronik veri" line, prefer the kloz wording (more specific).\n\n3. SANCTIONS — search for: "Yaptırım", "Sanctions", "BMGK", "OFAC", "Avrupa Birliği yaptırım", "UK sanctions". Common heading: "Yaptırım Klozu". Surface as: one exclusion entry naming the source authorities. Critical for corporate/fleet policies.\n\n4. NBC (Nuclear/Biological/Chemical) — search for: "Nükleer", "Biyolojik", "Kimyasal", "NBC", "Nuclear", "Radyasyon". Common heading: "Nükleer, Biyolojik ve Kimyasal Rizikolar Klozu". OFTEN HAS A CAP — typically 500,000 TL for environmental damage. If a cap is present, capture BOTH the exclusion AND the cap amount in the description (e.g. "NBC riskleri — çevresel hasar 500,000 TL ile sınırlı").\n\n### Why this checklist exists\n\nThese four exclusions are increasingly standard in Turkish kasko policies (post-2020 pandemic, post-Russia/Ukraine sanctions waves). Reviewers consistently catch them missing from extraction outputs even when the source text clearly contains them. The "PRIORITIZE POLICY-SPECIFIC CUSTOM EXCLUSIONS" section earlier in this prompt covers them but its placement reduces follow-through. This checklist is positioned at the END of the prompt deliberately — closest to the JSON-generation step — to maximize compliance.\n\n### Self-verification\n\nAfter generating your JSON, before returning it, ask: "Did the source text mention pandemic / cyber / sanctions / NBC, AND if so does my exclusions[] array contain entries for each?" If you skipped any, add them now. Do not return the JSON without this scan.';
BEGIN
  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_checklist,
      updated_at = NOW()
  WHERE name = 'Kasko Extraction'
    AND system_prompt NOT LIKE '%FORMAL EXCLUSION CHECKLIST (FINAL STEP — REQUIRED)%';

  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_checklist,
      updated_at = NOW()
  WHERE name = 'Traffic Insurance Extraction'
    AND system_prompt NOT LIKE '%FORMAL EXCLUSION CHECKLIST (FINAL STEP — REQUIRED)%';

  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_checklist,
      updated_at = NOW()
  WHERE name = 'Policy Extraction - Master'
    AND system_prompt NOT LIKE '%FORMAL EXCLUSION CHECKLIST (FINAL STEP — REQUIRED)%';
END $$;

-- Verification:
--   SELECT name,
--          system_prompt LIKE '%FORMAL EXCLUSION CHECKLIST (FINAL STEP — REQUIRED)%' AS has_checklist
--   FROM public.prompt_templates
--   WHERE name IN ('Kasko Extraction','Traffic Insurance Extraction','Policy Extraction - Master');
-- Expect 3 rows with has_checklist = true.
--
-- Pre-flight check (operator manual step):
--   1. Apply this migration via Supabase SQL Editor
--   2. Run the verification query above — confirm 3 rows return true
--   3. Re-upload the Round-4 Anadolu fixture via the production UI
--   4. Confirm the rendered exclusions panel now contains entries for
--      Salgın, Siber Saldırı, Yaptırım, NBC (the four 052 missed)
--   5. If any of the 4 still missing, the LLM is genuinely ignoring the
--      instruction — investigate by re-running the extraction with
--      VITE_DEBUG_LOGS=true and inspecting the raw exclusions[] array
--      before classifyExclusions() runs (gotcha #74)
