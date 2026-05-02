-- Migration 057: Add previousInsurer extraction instruction (Round-4 #9)
--
-- Round-4 reviewer flagged that Anadolu's policy page 8 indicates
-- renewal from Sompo Japan with %50 NCD (Tier 3) preserved, but the
-- transfer context is not surfaced anywhere in the rendered output.
--
-- Sprint 3 PR-S3.2 adds:
--   1. `previousInsurer: string | null` top-level field on the strict
--      JSON schema (shared/extraction-schema.ts)
--   2. Mirror field on `ExtractedPolicyData` and `AnalyzedPolicy`
--   3. UI rendering on the Discounts panel when both NCD and
--      previousInsurer are present (PolicyKeyMetricsAndDiscounts.tsx)
--   4. Tier-1 signal in generateInsurerTransferInsight() when the
--      structured field is populated (insights.ts)
--
-- This migration completes the chain by instructing the LLM to actually
-- populate the field. Without this, the schema field exists but the
-- LLM doesn't know to fill it.
--
-- Same idempotent guarded-update pattern as 048-056.

DO $$
DECLARE
  v_rules TEXT := E'\n\n## PREVIOUS INSURER EXTRACTION (Round-4 PR-S3.2)\n\nWhen the policy text indicates a RENEWAL or TRANSFER from a different insurer, set the top-level `previousInsurer` field to the previous insurer''s name. Otherwise, set it to null.\n\n### Trigger phrasings (Turkish)\n\n- "yenilenmiştir" / "yenilenmiş" / "yenilemedir"\n- "geçiş poliçesi" / "geçiş" (in renewal context)\n- "devir" / "devredilmiş" / "devren düzenlenmiştir"\n- "önceki sigortacı" / "önceki poliçe"\n- "Sompo / Aksigorta / AXA / Allianz / Ergo / Türkiye / HDI / Mapfre poliçesinden"\n  (any insurer name followed by "poliçesinden" / "poliçeden" with renewal context)\n\n### Trigger phrasings (English)\n\n- "renewed from <insurer>"\n- "carry-over from <insurer>"\n- "transfer from <insurer>"\n- "previously insured by / with <insurer>"\n\n### Examples\n\nSource: "Bu poliçe Sompo Japan poliçesinden yenilenmiştir. Hasarsızlık indirimi %50 (Tier 3) korunmuştur."\n→ previousInsurer: "Sompo Japan"\n\nSource: "Aksigorta\'dan devren düzenlenmiştir."\n→ previousInsurer: "Aksigorta"\n\nSource: "Renewed from AXA Sigorta with 40% NCD preserved."\n→ previousInsurer: "AXA Sigorta"\n\nSource: "Yeni poliçe (no transfer language anywhere)"\n→ previousInsurer: null\n\n### Normalization\n\n- Use the insurer\'s commonly-used display name (e.g. "Sompo Japan" not "Sompo Japan Sigorta A.Ş."). If the policy spells the full legal name, you MAY trim corporate suffixes (Sigorta, A.Ş., Ltd. Şti.) for cleaner display.\n- Do NOT extract the CURRENT insurer here — only the PREVIOUS one. The current insurer is captured in the `provider` field.\n- If the source mentions a transfer but doesn''t name the previous insurer (rare), set previousInsurer to null and capture the transfer narrative in specialConditions instead.';
BEGIN
  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_rules,
      updated_at = NOW()
  WHERE name = 'Kasko Extraction'
    AND system_prompt NOT LIKE '%PREVIOUS INSURER EXTRACTION (Round-4 PR-S3.2)%';

  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_rules,
      updated_at = NOW()
  WHERE name = 'Traffic Insurance Extraction'
    AND system_prompt NOT LIKE '%PREVIOUS INSURER EXTRACTION (Round-4 PR-S3.2)%';

  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_rules,
      updated_at = NOW()
  WHERE name = 'Policy Extraction - Master'
    AND system_prompt NOT LIKE '%PREVIOUS INSURER EXTRACTION (Round-4 PR-S3.2)%';
END $$;

-- Verification:
--   SELECT name,
--          system_prompt LIKE '%PREVIOUS INSURER EXTRACTION (Round-4 PR-S3.2)%' AS has_rules
--   FROM public.prompt_templates
--   WHERE name IN ('Kasko Extraction','Traffic Insurance Extraction','Policy Extraction - Master');
-- Expect 3 rows with has_rules = true.
--
-- Pre-flight check (operator manual step):
--   1. Apply this migration via Supabase SQL Editor
--   2. Run the verification query above — confirm 3 rows return true
--   3. Re-upload the Round-4 Anadolu fixture via the production UI
--   4. Confirm raw_data.previousInsurer is set to "Sompo Japan" (or
--      whatever the policy actually names)
--   5. Confirm the Discounts panel renders "Hasarsızlık İndirimi —
--      Sompo Japan devri" instead of just "Hasarsızlık İndirimi"
