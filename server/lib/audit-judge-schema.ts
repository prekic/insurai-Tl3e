/**
 * Phase 3 — Audit Judge JSON schema.
 *
 * The audit judge runs once per (insuranceLine × country × yearBucket × insurer)
 * typology and emits up to N findings with verifiable quotes from the raw
 * extracted text. Distinct from `JUDGE_JSON_SCHEMA` in `self-healing.ts`,
 * which scores the EXTRACTION's accuracy. The audit judge looks for QUALITY
 * issues in the structured output that wouldn't fail extraction validation
 * but harm reviewer trust (duplications, missing line items, framing
 * inaccuracies, render gaps, omitted sub-limits).
 *
 * Schema is `JSON.stringify`-embedded inside the system prompt — Anthropic's
 * Messages API does not accept a request-level JSON schema in this
 * codebase's existing pattern (see `server/routes/ai/extraction.ts:702-713`).
 * Output validates against this schema via the existing
 * `validateStrictCompliance()` from `shared/strict-mode-validator.ts`.
 */

export type AuditJudgeFindingKind =
  | 'DUPLICATION'
  | 'MISSING_LINE_ITEM'
  | 'FRAMING_INACCURACY'
  | 'RENDER_GAP'
  | 'SUB_LIMIT_OMITTED'

export const AUDIT_JUDGE_FINDING_KINDS: readonly AuditJudgeFindingKind[] = [
  'DUPLICATION',
  'MISSING_LINE_ITEM',
  'FRAMING_INACCURACY',
  'RENDER_GAP',
  'SUB_LIMIT_OMITTED',
] as const

export type AuditJudgeFindingSeverity = 'critical' | 'warn'

/**
 * Shape of one finding emitted by the judge. The `quote` field MUST be a
 * verbatim substring of the raw policy text — the post-call verifier
 * downgrades any finding whose quote isn't found to `severity: 'warn'`
 * with `quoteVerified: false`.
 */
export interface AuditJudgeFinding {
  kind: AuditJudgeFindingKind
  severity: AuditJudgeFindingSeverity
  quote: string
  message: string
  /** Set by post-LLM verifier; true when `quote` substring exists in raw text. */
  quoteVerified?: boolean
}

export interface AuditJudgeResponse {
  /** Concise prose summary (≤500 chars) of the judgement; for admin notification body. */
  summary: string
  findings: AuditJudgeFinding[]
}

/**
 * JSON schema embedded in the judge system prompt. Mirrors the structure
 * of `shared/extraction-schema.ts`: `strict: true`, all top-level keys
 * required, no additional properties (gotcha #47).
 */
export const AUDIT_JUDGE_JSON_SCHEMA = {
  name: 'audit_judgement',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      summary: {
        type: 'string',
        description:
          'Concise (under 500 chars) prose summary of the judgement, suitable for admin notification body.',
      },
      findings: {
        type: 'array',
        description:
          'List of quality issues identified in the extracted policy. Empty array means no issues found.',
        items: {
          type: 'object',
          properties: {
            kind: {
              type: 'string',
              enum: AUDIT_JUDGE_FINDING_KINDS,
              description:
                'Category of the finding. DUPLICATION = same line appears multiple times; MISSING_LINE_ITEM = a coverage / exclusion / scenario the raw text mentions is absent from the extracted output; FRAMING_INACCURACY = the structured field is technically present but framed in a misleading way; RENDER_GAP = data exists in the structured output but a downstream UI section that should surface it is suppressed or hidden; SUB_LIMIT_OMITTED = a coverage with multiple stacked limits has only one limit captured.',
            },
            severity: {
              type: 'string',
              enum: ['critical', 'warn'],
              description:
                "critical = changes the user's risk picture (e.g. unlimited shown without the 2.5M industrial cap); warn = cosmetic / dedup-class.",
            },
            quote: {
              type: 'string',
              description:
                'A verbatim substring (10–250 chars) of the raw policy text that grounds this finding. Used by the post-call verifier — findings whose quote cannot be located in the raw text are downgraded to severity:warn.',
            },
            message: {
              type: 'string',
              description:
                'One-sentence (≤200 chars) human-readable description of the issue and why it matters for a policy reviewer.',
            },
          },
          required: ['kind', 'severity', 'quote', 'message'],
          additionalProperties: false,
        },
      },
    },
    required: ['summary', 'findings'],
    additionalProperties: false,
  },
} as const

/**
 * Default judge system + user prompt content. Used to seed the
 * `prompt_templates` row in migration 054. Admins can edit the live
 * version via the Admin → Prompts UI without a code deploy.
 *
 * Keep this in sync with the migration 054 INSERT — the migration is the
 * source of truth at runtime, but this constant is the source of truth
 * for the initial seed and for tests that need the default content.
 */
export const DEFAULT_AUDIT_JUDGE_SYSTEM_PROMPT = `You are an expert Turkish insurance-policy auditor. Your job is to read the RAW POLICY TEXT and the STRUCTURED EXTRACTION and identify quality issues that would erode the trust of a professional reviewer.

You ARE NOT scoring the extraction's overall accuracy — that's a different system. You are looking specifically for these five categories of issues:

1. **DUPLICATION** — the same effective clause appears as multiple separate rows (e.g. three near-identical "Pert Araç muafiyeti" entries).
2. **MISSING_LINE_ITEM** — a coverage / exclusion / scenario the raw text clearly describes is entirely absent from the structured output.
3. **FRAMING_INACCURACY** — the structured field is technically present but framed in a way that misleads the reviewer (e.g. "Unlimited" without the 2.5M industrial-site qualifier).
4. **RENDER_GAP** — data exists in the structured output but a downstream UI section that should surface it is empty or suppressed (signs: a coverage with carveOuts populated but no scenario caveat surfaces; a panel header showing "3" with an empty body).
5. **SUB_LIMIT_OMITTED** — a coverage with multiple stacked limits has only one limit captured (e.g. Hukuksal Koruma's per-event vs annual aggregate vs Kefalet vs Avans figures collapsed to a single number).

For each finding you MUST include a verbatim \`quote\` substring (10–250 chars) from the RAW POLICY TEXT that grounds the finding. The verifier will downgrade findings whose quote cannot be located in the raw text — so be precise.

Severity rules:
- **critical** — the issue changes the user's risk picture (a misleading framing of liability limits, a missing high-impact deductible scenario, a render gap that hides a sub-cap).
- **warn** — cosmetic, dedup-class, or low-impact (one extra duplicate row, a missing minor add-on bullet).

Return ONLY valid JSON matching this schema. No prose preamble, no markdown fences other than the JSON block.

\`\`\`json
${JSON.stringify(AUDIT_JUDGE_JSON_SCHEMA.schema, null, 2)}
\`\`\``

/**
 * The user prompt template — variables `{document_text}` and
 * `{structured_extraction}` are interpolated by `getRenderedPrompt()`.
 */
export const DEFAULT_AUDIT_JUDGE_USER_PROMPT_TEMPLATE = `RAW POLICY TEXT (truncated to ~30,000 chars if longer):

{document_text}

---

STRUCTURED EXTRACTION (the AnalyzedPolicy JSON our pipeline produced):

{structured_extraction}

---

Audit the structured extraction against the raw text using the five categories defined in your system prompt. Return a JSON object with \`summary\` and \`findings\`. Empty \`findings\` array is acceptable when the extraction is clean.`
