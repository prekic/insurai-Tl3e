# Session Handoff — April 26, 2026 — Production-Grade Pipeline Finalization & Gemini SDK Integration

> **Session type**: Stabilization, Feature Integration, & Data Repair. Finalized the KASKO insurance extraction pipeline for production readiness. Upgraded legacy LLMs to state-of-the-art models (gpt-5.4, claude-sonnet-4-6). Integrated the Gemini 2.5 Flash SDK via `@google/genai` to serve as a tertiary AI provider and multimodal OCR engine (`POST /api/ai/ocr/gemini`). Hardened extraction mappings to eliminate developer artifacts, removed free-trial bottlenecks, implemented `typeof` guards against runtime crashes, fixed a 10x premium inflation bug, and enforced mandatory IMM extraction rules.
> Also ran `npm run qa:extraction`, revealing 69/70 kasko policies in production were missing vehicle info. Traced the root cause to `scripts/pilot-batch-ingest.ts` discarding PDF text. Built a diagnose-then-backfill toolchain and repaired 53/70 rows.

## 🎯 Immediate Next Steps for the Next Agent

### Priority 1: Environment Setup
Add `GEMINI_API_KEY` to the production/Railway environment. It is required for the new Gemini 2.5 Flash SDK to function and is distinct from the `GCP_SERVICE_ACCOUNT_BASE64` used for Document AI/Cloud Vision. Ensure existing `OPENAI_API_KEY` and `ANTHROPIC_API_KEY` are active.

### Priority 2: Frontend Orchestration
Update the frontend OCR orchestrator to conditionally use `/api/ai/ocr/gemini` as an alternative to Cloud Vision. The endpoint is currently implemented on the backend but needs to be wired into the frontend's document ingestion flow.

### Priority 3: Validation & Testing
Run a pilot extraction batch to compare Gemini OCR quality against the existing Document AI pipeline. If unit tests for the extraction route are added, ensure they mock the `GoogleGenAI` client using the established factory pattern (`getGeminiClient()`).

### Priority 4: PR and Review
Open + merge a PR for this session's work if not already done.


**Files added/modified**:
- `scripts/diagnose-vehicle-extraction.ts` — new, read-only DB inventory tool
- `scripts/backfill-vehicle-info.ts` — new, write-capable repair script (dry-run by default)
- `scripts/inspect-pdf-labels.ts` — new, single-PDF label inspector for unfamiliar insurer formats
- `scripts/pilot-batch-ingest.ts` — patched: now preserves `raw_data.extractedText` + populates `raw_data.vehicleInfo` at ingest time
- `shared/field-aliases.ts` — extended for AXA's single-space label separator format
- `src/lib/ai/__tests__/turkish-utils-vehicle.test.ts` — new tests for AXA format
- `CLAUDE.md` — gotchas #105 / #106 / #107
- `SESSION_HANDOFF.md` — this file

### Priority 2: Triage the 17 remaining critical fails (decide which to chase)

After this session's apply, `VEHICLE_COMPLETENESS` is at 53/70 (76%). The 17 critical fails break down into:

| Category | Count | Recoverable? | Action |
|---|---|---|---|
| Synthetic test rows (`sample-kasko-policy.pdf`, `synthetic-kasko-{4,5}.pdf`) | 3 | No — they're fixtures | Delete from DB to clean baseline |
| Scanned-image PDFs (Güneş `208678401/2`, Ray `32630901/3`) | 2 | Only with OCR | Out of scope; mark for re-upload |
| Duplicate Anadolu Tiguan (`5a96af60` — same policy as `6651fb91`) | 1 | No — it's a dup | Delete from DB |
| AXA `make=-` rows (CARAVELLE / TALISMAN / VITO / SPRINTER / blank `999`) | 8 | Yes — needs another alias pass | Run `inspect-pdf-labels.ts` on one of these PDFs, find the alternate Marka layout, extend `shared/field-aliases.ts` |
| Ray + Groupama partial extraction | 3 | Yes — different format | Same pattern as AXA |

After deleting the 4 garbage rows, **real-data pass rate is 53/64 = 83%**.

Theoretical ceiling with current PDFs: 64/64 = **100%** (pursuing the 8 AXA + 3 Ray/Groupama would land here).

### Priority 3: Verify the upstream fix on the next batch ingest

`scripts/pilot-batch-ingest.ts` now passes `textResult.text` to `persistToPoliciesTable` and stores it (sanitized) as `raw_data.extractedText`, plus runs `extractVehicleInfoFromText()` to pre-populate `raw_data.vehicleInfo`. **Before running the next batch**, sanity-check:

```bash
# Dry-run first (existing flag)
npx tsx scripts/pilot-batch-ingest.ts --pdf-dir <dir> --reviewer-id <uuid>

# Then for one new policy, confirm raw_data has both:
#   1. extractedText (>1000 chars)
#   2. vehicleInfo with make/model/year
# Use the same diagnostic:
npx tsx scripts/diagnose-vehicle-extraction.ts
```

If a future batch ingest produces 0% pass rate again, the fix didn't apply — check git history on `scripts/pilot-batch-ingest.ts` to see if the patch was reverted.

### Priority 4: (deferred) Clean up the AXA `make=-` cohort

For each of the 8 rows, run `npx tsx scripts/inspect-pdf-labels.ts <filename>` and look for AXA's alternate layout — likely the `Marka` line is blank because the make is in a different column position on those specific PDFs. Add the new alias to `shared/field-aliases.ts:VEHICLE_FIELD_ALIASES` and re-backfill those 8 rows.

## Current State

**Branch**: `claude/diagnose-vehicle-extraction`, clean working tree, 5 commits ahead of `origin/main`.

```
d07a67e fix(scripts): sanitize NUL + control chars before JSONB write
6c6e0da fix(scripts): print DB error detail on backfill ERROR rows
1852db6 feat(extraction): support AXA single-space label format
e1bf553 chore(scripts): add inspect-pdf-labels diagnostic
46b2b32 chore(scripts): add backfill-vehicle-info to repair 69/70 broken policies
3afca44 chore(scripts): add diagnose-vehicle-extraction read-only diagnostic
```

(Plus pending uncommitted changes for the upstream `pilot-batch-ingest.ts` fix + this doc + CLAUDE.md gotchas — all committed in the final PR.)

**Database**: 70 kasko policies, **53 now have full vehicleInfo (was 1)**.
**Grade thresholds**: unchanged.
**Tests**: typecheck clean, lint clean.

## What This Session Produced

### Phase 1 — Discovery (the QA gate fired)

User ran `npm run qa:extraction` for the first time on production data. Output:

```
VEHICLE_COMPLETENESS: 0/70 pass (0%) — 0 warn, 70 critical
CONFIDENCE_GATE_SYNC: 0/70 pass (0%) — 0 warn, 70 critical
GRADE_GATE_SYNC: 70/70 pass (100%) — 0 warn, 0 critical
```

100% failure on vehicle extraction. The Tiguan complaint that triggered PR #364 was one symptom of a much bigger problem.

### Phase 2 — Diagnosis (`scripts/diagnose-vehicle-extraction.ts`)

Read-only DB tool. Three sections of output:
1. Population split per provider × `raw_data.extractedText` present-or-not.
2. Top-level `raw_data` keys for one no-text sample row.
3. Text-field lengths across 5 standard field names.

**Finding**: 1 of 70 rows had `extractedText` (the user-upload via the app). 69 came from `pilot-batch-ingest.ts` and had no text stored anywhere. But — crucially — they all had `raw_data.sourceFilename` pointing at PDFs in `policies/` (committed to repo).

### Phase 3 — Inspection (`scripts/inspect-pdf-labels.ts`)

Sub-diagnostic that opens a PDF and prints (a) first 2500 chars + (b) all label-bearing lines. Used to discover the AXA format.

**Finding**: AXA uses `Marka VALUE\n` with a single space separator (not `:`, tab, or 2+ spaces). Our existing `hasKvSeparator` guard rejected it because single-space is the prose-protection guard for other use cases.

### Phase 4 — Alias extension (`shared/field-aliases.ts`)

Added single-space-separator support for AXA's tabular format with narrow guards to prevent prose false positives. Plus `Marka Tipi` as a new model alias. 5 new unit tests in `turkish-utils-vehicle.test.ts`.

### Phase 5 — Backfill (`scripts/backfill-vehicle-info.ts`)

Write-capable repair. For each broken row:
1. Reads `raw_data.sourceFilename` to find the PDF in `policies/`.
2. Re-parses with pdf-parse v2 (Node-native, free, ~1 sec per PDF).
3. Runs the same `extractVehicleInfoFromText()` the production conversion path uses.
4. Writes both `extractedText` (sanitized) AND `vehicleInfo` to `raw_data`.

Default mode is dry-run; `--apply` required. Per-row outcomes: `WOULD`/`OK`/`SKIP`/`NO_PDF`/`NO_TXT`/`NO_VEH`/`ERROR`. `--policy-id <uuid>` for single-row debugging.

### Phase 6 — JSONB sanitization

First `--apply` run hit one ERROR: `DB update failed: unsupported Unicode escape sequence` on the Anadolu VW Golf 2001 row. Root cause: a NUL byte (U+0000) in the PDF text. PostgreSQL JSONB rejects it.

Added `sanitizeForJsonb()` that strips C0 controls (NUL..0x1F except TAB/LF/CR) and unpaired surrogates. The regex source is built from a string (not a literal) so the source file stays grep-friendly. Re-ran the failed row → succeeded.

### Phase 7 — Upstream fix (`scripts/pilot-batch-ingest.ts`)

Patched `persistToPoliciesTable` to:
1. Accept a new `pdfText` parameter from the call site.
2. Sanitize via the same C0-strip pattern.
3. Store as `raw_data.extractedText`.
4. Run `extractVehicleInfoFromText()` and store result as `raw_data.vehicleInfo`.

Without this fix, the next batch ingest would have recreated the 0%-pass state.

### QA Gate Verification (final)

```
VEHICLE_COMPLETENESS: 53/70 pass (76%) — 0 warn, 17 critical
CONFIDENCE_GATE_SYNC: 53/70 pass (76%) — 0 warn, 17 critical
GRADE_GATE_SYNC: 70/70 pass (100%) — 0 warn, 0 critical
```

Δ: +53 pass on each of the two affected checks. The QA gate itself is unchanged from PR #364.

## Environment / Configuration

No environment variable changes this session. No new packages. No migrations. No `package.json` deps.

**Existing env vars used by the new scripts** (all already in `.env`):

| Variable | Used by | Purpose |
|---|---|---|
| `SUPABASE_URL` | All 4 scripts (qa, diagnose, backfill, ingest) | Service-role connection |
| `SUPABASE_SERVICE_ROLE_KEY` | All 4 scripts | Service-role auth |

The new scripts share the same env contract as `npm run qa:extraction` and `scripts/backfill-evaluation-scores.ts`. No additions required.
>>>>>>> origin/claude/diagnose-vehicle-extraction

## New Patterns / Gotchas Introduced (cross-ref to CLAUDE.md)

| # | Topic | CLAUDE.md gotcha |
|---|-------|------------------|
| 1 | Pilot-batch-ingest must preserve `extractedText` + populate `vehicleInfo` | #105 |
| 2 | JSONB NUL sanitization (build regex from string, not literal) | #106 |
| 3 | Diagnose-then-backfill workflow pattern | #107 |
| 4 | Gemini SDK Choice & OCR Pipeline | #116 |

## Operational Notes

- The 53 fixed rows now have `raw_data.extractedText` (full PDF text, sanitized) and `raw_data.vehicleInfo` (make/model/year/plate where extractable).
- The 8 AXA `make=-` rows and 3 Ray/Groupama partials still have valid `extractedText` from the backfill — meaning a follow-up alias addition can repair them via `npm run qa:extraction` -> identify failures -> `inspect-pdf-labels.ts` -> add aliases -> re-run backfill (which will now skip the already-OK rows automatically).
- The 3 synthetic + 1 duplicate row should be deleted from DB before the next QA-gate baseline measurement, otherwise pass rate is artificially low.

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
13. When adding a value-label alias to `VEHICLE_FIELD_ALIASES`, remember that `matchLabeledField()` requires a KV separator (`:`, tab, 2+ spaces) — single-space is now also accepted in the AXA tabular fallback path (gotcha #89, extended).
14. NEVER wrap structural translation keys (`t.global.unlimited`, `t.policy.noUpperLimit`) in `applySafeWording()` — destroys the signal (gotcha #90).
15. Before claiming any extraction-quality fix complete, run `npm run qa:extraction` and confirm the relevant check's pass rate moved (gotcha #102).
16. Any code path that writes free-form text into a JSONB column MUST apply `sanitizeForJsonb`-style C0+surrogate stripping first (gotcha #106).
17. Any new ingest path that lands rows in `policies` MUST preserve `raw_data.extractedText` and populate `raw_data.vehicleInfo` for kasko/traffic types (gotcha #105).
