-- Migration 050: Add bundle-policy detection rules to live extraction prompts
--
-- Reviewer's Sprint 2 #4: an Anadolu Birleşik Kasko policy whose title is
-- 'BİRLEŞİK KASKO SİGORTA POLİÇESİ "GENİŞLETİLMİŞ KASKO"' bundles four
-- separately-priced products (Genişletilmiş Kasko + Koltuk Ferdi Kaza +
-- Artan Mali Sorumluluk + Hukuksal Koruma). The current UI treats this as
-- kasko-only with supplementary lines and never surfaces the "this is a
-- bundle" signal.
--
-- After PR #4xx the schema has two new top-level fields:
--   isBundle:       boolean | null
--   bundleProducts: string[] | null
--
-- This migration teaches the LIVE DB extraction prompts how to populate
-- them. Same idempotent guarded-update pattern as 048/049.

DO $$
DECLARE
  v_rules TEXT := E'\n\n## BUNDLE POLICY DETECTION (kasko / traffic / multi-product)\n\nMany Turkish kasko policies are bundles ("Birleşik Sigorta Poliçesi" / "Combined Insurance Policy") that combine multiple separately-priced products on a single document. Detect and surface this:\n\n1. SET `isBundle = true` when ANY of these signals is present:\n   - Policy title or product name contains "Birleşik" or "Combined"\n   - Cover page lists two or more separately-priced insurance products with their own premium lines\n   - "Bundle" / "Paket" / "Combined" / "Birleşik" appears as the policy product type\n\n   Otherwise set `isBundle = false`. NEVER leave it null when you have a policy text — the field is always known.\n\n2. WHEN `isBundle = true`, populate `bundleProducts` with the bundled product names exactly as written in the policy. Examples:\n   - ["Genişletilmiş Kasko", "Koltuk Ferdi Kaza", "Artan Mali Sorumluluk", "Hukuksal Koruma"]\n   - ["Comprehensive Kasko", "Personal Accident", "Excess Liability"]\n\n   Each entry must be a distinct insurance product, NOT a coverage type. "Hırsızlık", "Yangın", "Cam Kırılması" are coverages within Kasko — they do NOT belong in bundleProducts. By contrast "Koltuk Ferdi Kaza" is a separate insurance product that happens to be bundled with Kasko — it DOES belong.\n\n3. WHEN `isBundle = false` or null, set `bundleProducts = null`.\n\n4. The primary `policyType` field stays as the dominant product (usually "kasko"). The bundle flag is additive context, not a replacement.';
BEGIN
  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_rules,
      updated_at = NOW()
  WHERE name = 'Kasko Extraction'
    AND system_prompt NOT LIKE '%BUNDLE POLICY DETECTION%';

  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_rules,
      updated_at = NOW()
  WHERE name = 'Traffic Insurance Extraction'
    AND system_prompt NOT LIKE '%BUNDLE POLICY DETECTION%';

  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_rules,
      updated_at = NOW()
  WHERE name = 'Policy Extraction - Master'
    AND system_prompt NOT LIKE '%BUNDLE POLICY DETECTION%';
END $$;

-- Verification:
--   SELECT name, system_prompt LIKE '%BUNDLE POLICY DETECTION%' AS has_rules
--   FROM public.prompt_templates
--   WHERE name IN ('Kasko Extraction','Traffic Insurance Extraction','Policy Extraction - Master');
-- Expect 3 rows with has_rules = true.
