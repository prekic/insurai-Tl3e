-- Migration 052: Tighten exclusion extraction — scope, dedup intent, demand specific custom exclusions
--
-- Reviewer's Sprint 2 #9: an Anadolu Birleşik Kasko policy showed:
--   - 4 different paraphrases of the same "no driver's license" clause
--   - 2 different paraphrases of the same keys-in-ignition clause
--   - Generic kasko boilerplate substituted for policy-specific custom
--     exclusions (Salgın, Siber Saldırı, NBC, Yaptırım, Kullanım Şekli)
--
-- The dedup side is fixed in code (PR #4yy adds dedupByTrigramJaccard before
-- the existing cluster pass). This migration tightens the AI prompt so the
-- LLM produces fewer paraphrases AND surfaces the policy-specific custom
-- exclusions over the boilerplate.
--
-- Same idempotent guarded-update pattern as 048-051.

DO $$
DECLARE
  v_rules TEXT := E'\n\n## EXCLUSION EXTRACTION (kasko / traffic)\n\nMany Turkish kasko policies bundle generic kasko Genel Şartlar boilerplate (which doesn''t need to be re-extracted on every policy) AND policy-specific custom exclusions (which DO need to surface). Differentiate aggressively:\n\n1. SCOPE — extract exclusions ONLY from text that appears under one of these labels or section headings:\n   - "İstisna" / "İstisnalar" / "Hariç Tutulanlar"\n   - "Teminat Dışı" / "Teminat Dışında Kalan"\n   - "UYARI" (when followed by an exclusionary clause)\n   - Named "Klozu" sections that explicitly exclude (e.g. "Yaptırım Klozu", "Siber Saldırı İstisna Klozu", "Salgın ve Bulaşıcı Hastalık İstisnası")\n\n   DO NOT extract from procedural sections ("Hasar Bildirimi", "Tazminatın Ödenmesi", "Genel Hükümler", general kasko Genel Şartları boilerplate) unless they explicitly exclude coverage.\n\n2. NO PARAPHRASING — emit ONE entry per distinct exclusion clause. If the same clause appears multiple times (e.g. driver-without-license, key-in-ignition theft, drunk driving), emit it ONCE in the most specific phrasing. Do not paraphrase the same clause in 2-4 different ways.\n\n3. PRIORITIZE POLICY-SPECIFIC CUSTOM EXCLUSIONS — these named klozes appear in many recent Turkish kasko policies and MUST be surfaced when present:\n   - Salgın ve Bulaşıcı Hastalık İstisnası — pandemic exclusion (incl. indirect costs from public-authority closures)\n   - Siber Saldırı İstisna Klozu — formal cyber-attack exclusion\n   - Nükleer, Biyolojik ve Kimyasal Rizikolar Klozu — NBC exclusion (often capped, e.g. 500,000 TL environmental damage)\n   - Yaptırım Klozu — sanctions exclusion (BMGK, EU, UK, US lists)\n   - Terör İstisnası / Savaş Halleri — terror / war\n   - Kullanım Şekli Klozu — when phrased as "%80 muafiyet on rideshare/rental/test drive", treat as a high-deductible conditional rather than a true exclusion (capture in conditionalDeductibles, not exclusions)\n\n4. PRESERVE CAPS — when an exclusion has a numeric cap (e.g. NBC capped at 500,000 TL), capture both the exclusion AND the cap in the description.\n\n5. KASKO GENEL ŞARTLARI BOILERPLATE — the standard kasko Genel Şartları already excludes drunk driving, racing, and military use. Surface these only when the SPECIFIC policy adds non-standard language (e.g. higher deductibles, broader scope). Do not re-emit the standard wording on every policy.';
BEGIN
  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_rules,
      updated_at = NOW()
  WHERE name = 'Kasko Extraction'
    AND system_prompt NOT LIKE '%EXCLUSION EXTRACTION (kasko / traffic)%';

  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_rules,
      updated_at = NOW()
  WHERE name = 'Traffic Insurance Extraction'
    AND system_prompt NOT LIKE '%EXCLUSION EXTRACTION (kasko / traffic)%';

  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_rules,
      updated_at = NOW()
  WHERE name = 'Policy Extraction - Master'
    AND system_prompt NOT LIKE '%EXCLUSION EXTRACTION (kasko / traffic)%';
END $$;

-- Verification:
--   SELECT name, system_prompt LIKE '%EXCLUSION EXTRACTION (kasko / traffic)%' AS has_rules
--   FROM public.prompt_templates
--   WHERE name IN ('Kasko Extraction','Traffic Insurance Extraction','Policy Extraction - Master');
-- Expect 3 rows with has_rules = true.
