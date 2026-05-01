-- Migration 054: seed audit judge prompt + audit config category.
--
-- Companion to migration 053. Two seeds:
--   1. A `prompt_templates` row named 'Audit Judge - Kasko' that the
--      `runAuditJudge` server-side service loads via the existing
--      `getRenderedPrompt()` cache. Versioning is automatic — every
--      admin-side `updatePrompt()` increments the row's `version` and
--      archives the old state into `prompt_versions`. The audit-judge
--      cache key (`audit_judgements.judge_prompt_version`) tracks which
--      prompt version a row was generated against, so the cache
--      auto-invalidates when admins edit the prompt.
--   2. Three `app_settings` rows under category='audit' that the new
--      `getAuditConfig()` getter reads (5-min cache + camelCase mapping).
--
-- Both INSERTs use `ON CONFLICT DO NOTHING` so admin overrides are
-- preserved when the migration is re-applied.
--
-- Source of truth for the prompt content:
--   server/lib/audit-judge-schema.ts (DEFAULT_AUDIT_JUDGE_SYSTEM_PROMPT,
--   DEFAULT_AUDIT_JUDGE_USER_PROMPT_TEMPLATE) — keep that file in sync if
--   you update the prompt below.

-- ============================================================================
-- 1. Prompt template
-- ============================================================================

INSERT INTO public.prompt_templates (
  name,
  description,
  category,
  version,
  is_active,
  system_prompt,
  user_prompt_template,
  variables,
  default_provider,
  default_model
)
VALUES (
  'Audit Judge - Kasko',
  'Phase 3 self-audit-layer LLM critic. Reads raw policy text + structured AnalyzedPolicy and emits findings (DUPLICATION, MISSING_LINE_ITEM, FRAMING_INACCURACY, RENDER_GAP, SUB_LIMIT_OMITTED). Distinct from server/lib/self-healing.ts JUDGE which scores extraction accuracy.',
  'analysis',
  1,
  true,
  $audit_judge_sys$You are an expert Turkish insurance-policy auditor. Your job is to read the RAW POLICY TEXT and the STRUCTURED EXTRACTION and identify quality issues that would erode the trust of a professional reviewer.

You ARE NOT scoring the extraction's overall accuracy — that's a different system. You are looking specifically for these five categories of issues:

1. DUPLICATION — the same effective clause appears as multiple separate rows (e.g. three near-identical "Pert Araç muafiyeti" entries).
2. MISSING_LINE_ITEM — a coverage / exclusion / scenario the raw text clearly describes is entirely absent from the structured output.
3. FRAMING_INACCURACY — the structured field is technically present but framed in a way that misleads the reviewer (e.g. "Unlimited" without the 2.5M industrial-site qualifier).
4. RENDER_GAP — data exists in the structured output but a downstream UI section that should surface it is empty or suppressed (signs: a coverage with carveOuts populated but no scenario caveat surfaces; a panel header showing "3" with an empty body).
5. SUB_LIMIT_OMITTED — a coverage with multiple stacked limits has only one limit captured (e.g. Hukuksal Koruma's per-event vs annual aggregate vs Kefalet vs Avans figures collapsed to a single number).

For each finding you MUST include a verbatim "quote" substring (10–250 chars) from the RAW POLICY TEXT that grounds the finding. The verifier will downgrade findings whose quote cannot be located in the raw text — so be precise.

Severity rules:
- critical — the issue changes the user's risk picture (a misleading framing of liability limits, a missing high-impact deductible scenario, a render gap that hides a sub-cap).
- warn — cosmetic, dedup-class, or low-impact (one extra duplicate row, a missing minor add-on bullet).

Return ONLY valid JSON matching this schema. No prose preamble, no markdown fences other than the JSON block.

{
  "type": "object",
  "properties": {
    "summary": { "type": "string", "description": "Concise (under 500 chars) prose summary." },
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "kind": { "type": "string", "enum": ["DUPLICATION","MISSING_LINE_ITEM","FRAMING_INACCURACY","RENDER_GAP","SUB_LIMIT_OMITTED"] },
          "severity": { "type": "string", "enum": ["critical","warn"] },
          "quote": { "type": "string" },
          "message": { "type": "string" }
        },
        "required": ["kind","severity","quote","message"],
        "additionalProperties": false
      }
    }
  },
  "required": ["summary","findings"],
  "additionalProperties": false
}$audit_judge_sys$,
  $audit_judge_user$RAW POLICY TEXT (truncated to ~30,000 chars if longer):

{document_text}

---

STRUCTURED EXTRACTION (the AnalyzedPolicy JSON our pipeline produced):

{structured_extraction}

---

Audit the structured extraction against the raw text using the five categories defined in your system prompt. Return a JSON object with "summary" and "findings". Empty "findings" array is acceptable when the extraction is clean.$audit_judge_user$,
  '["document_text", "structured_extraction"]'::jsonb,
  'anthropic',
  'claude-sonnet-4-6'
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 2. Audit config category (3 keys)
-- ============================================================================

INSERT INTO public.app_settings (category, key, value, value_type, description, is_sensitive)
VALUES
  ('audit', 'judge_max_runs_per_day', '50', 'number',
    'Daily circuit-breaker for the audit judge — runAuditJudge returns null when this many rows have been inserted in the last 24 hours.', false),
  ('audit', 'judge_model', '"claude-sonnet-4-6"', 'string',
    'Anthropic model used by the audit judge. Sonnet is favourable for this task vs Opus on cost.', false),
  ('audit', 'judge_critical_notify_first_only', 'true', 'boolean',
    'When true, only the first audit_judgements row per typology with critical_count>0 enqueues an admin_notifications row. False = notify on every critical.', false)
ON CONFLICT (category, key) DO NOTHING;

COMMENT ON COLUMN public.prompt_templates.name IS
  'Stable lookup key. The audit-judge service loads the row WHERE name=''Audit Judge - Kasko''.';
