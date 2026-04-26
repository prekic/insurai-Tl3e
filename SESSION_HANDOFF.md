# Session Handoff — April 26, 2026 — AI Model Upgrade & Gemini SDK Integration

> **Session type**: Feature Integration & Infrastructure Upgrade. Upgraded core legacy LLM references across the system to state-of-the-art models (gpt-5.4, claude-sonnet-4-6). Integrated the Gemini 2.5 Flash SDK via `@google/genai` to serve as a tertiary AI provider and direct multimodal OCR engine via `POST /api/ai/ocr/gemini`. Updated the diagnostics pipeline to include Gemini health checks.

## 🎯 Immediate Next Steps for the Next Agent

### Priority 1: Environment Setup
Add `GEMINI_API_KEY` to the production/Railway environment. It is required for the new Gemini 2.5 Flash SDK to function and is distinct from the `GCP_SERVICE_ACCOUNT_BASE64` used for Document AI/Cloud Vision.

### Priority 2: Frontend Orchestration
Update the frontend OCR orchestrator to conditionally use `/api/ai/ocr/gemini` as an alternative to Cloud Vision. The endpoint is currently implemented on the backend but needs to be wired into the frontend's document ingestion flow.

### Priority 3: Validation & Testing
Run a pilot extraction batch to compare Gemini OCR quality against the existing Document AI pipeline. If unit tests for the extraction route are added, ensure they mock the `GoogleGenAI` client using the established factory pattern (`getGeminiClient()`).

## Current State

**Branch**: `main` (Committed in `a282fb78ae28ba3bbe5dedc4c6c12b15b9e0f08b`).
**Recent Changes**:
- Upgraded legacy models to latest SOTA in `config-service.ts`, `prompt-service.ts`, `cost-control.ts`, `admin/cost.ts`, and `admin/operations.ts`.
- Added `@google/genai` dependency to `package.json`.
- Implemented `getGeminiClient()` factory and `POST /api/ai/ocr/gemini` in `server/routes/ai/extraction.ts`.
- Added Gemini health checks and provider detection in `server/routes/ai/diagnostics.ts`.

**Tests**: Build check passed with zero TS errors (`npx tsc --noEmit`).

## What This Session Produced

### Phase 1 — AI Model Upgrade
Migrated 6 primary AI model references across 7 production files from legacy 2024/2025 models to the latest state-of-the-art versions (e.g., `claude-sonnet-4-6`, `gpt-5.4`). This included updating the default `ai.extraction_model` in `server/routes/admin/operations.ts` and the cost tracking models in `server/middleware/cost-control.ts` and `server/routes/admin/cost.ts`.

### Phase 2 — Gemini SDK Integration
Added `@google/genai` to `package.json` to leverage Google's latest multimodal capabilities. Created a new lazy factory `getGeminiClient()` to align with the existing OpenAI and Anthropic singleton patterns.

### Phase 3 — New Extraction Endpoint
Implemented a `POST /api/ai/ocr/gemini` endpoint designed for single-pass multimodal OCR and extraction, optimized with Turkish-specific prompt instructions to bypass traditional text-only OCR engines like Cloud Vision.

### Phase 4 — Diagnostics Hardening
Updated `diagnostics.ts` to include Gemini in the `/providers` discovery route and the `/diagnose` health check rollup, maintaining consistent observability across all AI dependencies.

## Environment / Configuration
- **New Environment Variable**: `GEMINI_API_KEY` (Required).

## New Patterns / Gotchas Introduced (cross-ref to CLAUDE.md)

| # | Topic | CLAUDE.md gotcha |
|---|-------|------------------|
| 1 | Gemini SDK Choice & OCR Pipeline | #116 |

## Non-Negotiable Rules (Carry Forward — Unchanged)

1. Legacy arrays (`coverages`, `exclusions`, `insights`) NEVER overwritten.
2. Full test suite NEVER run without explicit user permission (>10 min).
3. Pilot evidence from real live data only.
4. All new AI extraction routes MUST follow the `/api/ai/extract/:provider` pattern in `server/routes/ai/`.
5. The use of `as unknown as` is a code smell — prefer explicit typing and safe fallbacks.
6. Market conclusions gated by `BenchmarkConfidence`.
7. Extraction schema changes go in `shared/extraction-schema.ts` ONLY.
8. Turkish regex patterns must handle Turkish İ (U+0130) via `[iİ]`.
9. `auditLogs` array MUST have `MAX_ENTRIES` cap after `.push()`.
10. `isIncluded()` treats `undefined` as included (industry standard).
11. Grade recalibrations require n ≥ 50 sample size.
12. When adding a coverage-item schema property, update THREE places: `properties`, `required[]`, AND the count-assertion tests (see gotcha #47 / #95).
13. When adding a value-label alias to `VEHICLE_FIELD_ALIASES`, remember that `matchLabeledField()` requires a KV separator (`:`, tab, 2+ spaces).
14. NEVER wrap structural translation keys (`t.global.unlimited`, `t.policy.noUpperLimit`) in `applySafeWording()` — destroys the signal (gotcha #90).
15. Before claiming any extraction-quality fix complete, run `npm run qa:extraction` and confirm the relevant check's pass rate moved (gotcha #102).
16. Any code path that writes free-form text into a JSONB column MUST apply `sanitizeForJsonb`-style C0+surrogate stripping first (gotcha #106).
17. Any new ingest path that lands rows in `policies` MUST preserve `raw_data.extractedText` and populate `raw_data.vehicleInfo` for kasko/traffic types (gotcha #105).
