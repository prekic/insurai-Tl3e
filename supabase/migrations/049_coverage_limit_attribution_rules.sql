-- Migration 049: Add coverage-attribution rules to live extraction prompts
--
-- Reviewer (Apr 30 2026) caught two distinct attribution bugs on a real
-- Anadolu Birleşik Kasko policy:
--
-- 1. ROADSIDE ASSISTANCE LIMIT MIS-ATTRIBUTION
--    Hero card showed "Roadside Assistance TRY 80,000". The 80,000 TL
--    is actually Hukuksal Koruma's annual aggregate cap; Yol Yardım
--    (Roadside Assistance) on Anadolu policies is a service tier
--    ("Anadolu Hizmet Grup 2") with NO numeric TL limit. The AI was
--    attaching the adjacent legal-protection limit to the wrong row.
--
-- 2. LEGAL PROTECTION (HUKUKİ/HUKUKSAL KORUMA) UNDER-REPORTING
--    Real structure: 4,000 TL Kefalet + 4,000 TL Avans + 40,000 TL
--    per-event ceiling + 80,000 TL annual aggregate. The AI was picking
--    one limit (typically the smallest, 4,000) and dropping the others,
--    understating exposure by 10-20×.
--
-- Both issues stem from the live DB prompt not having explicit rules
-- for service-tier vs numeric-limit coverages, and not requiring the
-- AI to preserve per-event + aggregate pairs when the policy provides
-- both.
--
-- This migration appends a new "COVERAGE LIMIT ATTRIBUTION" section to
-- the same three prompt_templates rows migration 048 touched:
--   - 'Kasko Extraction'           (used first for policyType='kasko')
--   - 'Traffic Insurance Extraction'
--   - 'Policy Extraction - Master' (fallback)
--
-- Idempotent — guarded by a sentinel string so re-runs don't double-append.

DO $$
DECLARE
  v_rules TEXT := E'\n\n## COVERAGE LIMIT ATTRIBUTION (kasko / traffic only)\n\nWhen extracting coverage limits, follow these rules:\n\n1. SERVICE-TIER COVERAGES — DO NOT ATTACH NUMERIC LIMITS:\n   - Yol Yardım / Roadside Assistance\n   - Çekme Kurtarma / Towing\n   - İkame Araç / Replacement Vehicle (when described as a service tier, e.g. "Anadolu Hizmet Grup 2", "Grup 1", or by day count without a TL ceiling)\n   - Asistans / Assistance\n\n   These are service tiers, not financial caps. Set `limit: null` and capture the tier name (e.g. "Anadolu Hizmet Grup 2") in `description`. NEVER attach a TL value from an adjacent table row to one of these coverages.\n\n2. LEGAL PROTECTION (Hukuki Koruma / Hukuksal Koruma) — PRESERVE ALL LIMITS:\n   The standard Hukuksal Koruma structure has 4 distinct limits:\n   - Kefalet (bail security) per-event\n   - Avans (legal fee advance) per-event\n   - Per-event total ceiling (Olay Başı)\n   - Annual aggregate ceiling (Yıllık Toplam)\n\n   When the policy provides multiple limits for Hukuki/Hukuksal Koruma:\n   - Capture the per-event total ceiling in `limit` (the larger per-event number)\n   - Set `limitType: "per_event"`\n   - Capture the annual aggregate AND the sub-limits in `description` as e.g. "40,000 TL per claim / 80,000 TL annual aggregate / 4,000 TL bail / 4,000 TL legal advance"\n\n   NEVER pick only the smallest of the four; that understates exposure by 10-20×.\n\n3. PER-EVENT vs ANNUAL AGGREGATE — capture both when both are stated:\n   When a policy says "Olay Başı X / Yıllık Toplam Y" (or "Per claim: X / Annual aggregate: Y"), put the per-event in `limit` with `limitType: "per_event"`, and add the annual aggregate to `description`. Do NOT collapse them into a single number.\n\n4. SPELLING VARIANTS — Hukuksal Koruma (with -sal suffix, used by Anadolu) is the same coverage as Hukuki Koruma (with -i suffix, used by AXA/Allianz). Treat them identically.';
BEGIN
  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_rules,
      updated_at = NOW()
  WHERE name = 'Kasko Extraction'
    AND system_prompt NOT LIKE '%COVERAGE LIMIT ATTRIBUTION%';

  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_rules,
      updated_at = NOW()
  WHERE name = 'Traffic Insurance Extraction'
    AND system_prompt NOT LIKE '%COVERAGE LIMIT ATTRIBUTION%';

  UPDATE public.prompt_templates
  SET system_prompt = system_prompt || v_rules,
      updated_at = NOW()
  WHERE name = 'Policy Extraction - Master'
    AND system_prompt NOT LIKE '%COVERAGE LIMIT ATTRIBUTION%';
END $$;

-- Verification (informational — not enforced):
--   SELECT name, system_prompt LIKE '%COVERAGE LIMIT ATTRIBUTION%' AS has_rules
--   FROM public.prompt_templates
--   WHERE name IN ('Kasko Extraction','Traffic Insurance Extraction','Policy Extraction - Master');
-- Expect 3 rows with has_rules = true.
