# Session Handoff — April 16, 2026 (Ray Sigorta Commercial Kasko QA Fixes)

> **Session type**: Bug fix + test hardening. User provided a detailed QA bug report from a Ray Sigorta 32630901/3 Grup Kasko policy (1997 IVECO commercial fleet truck) surfacing 16 extraction/interpretation bugs. We fixed the 8 most impactful ones (P0 + key P1) and added 63 regression tests guarding against them. All changes committed and pushed on feature branch; PR #351 open.

## 🎯 Immediate Next Steps for the Next Agent

### Priority 1: Merge PR #351
- **URL**: https://github.com/prekic/insurai/pull/351
- **Branch**: `claude/load-project-context-BkEVh`
- **Status**: 3 commits pushed, clean working tree, CI should be green (617 tests across 11 suites verified locally, 0 TS errors)
- **PR Title**: `fix(extraction): fix 8 QA bugs from Ray Sigorta commercial kasko` (valid Conventional Commit — will trigger release-please correctly)

### Priority 2: Upload Ray Sigorta PDF Fixture (DEFERRED)
- The original Ray Sigorta PDF `KRK_35_VD_458_Kasko_Police_32630901_3.pdf` is NOT in the repo
- **User was asked to upload it** but we ended the session before it happened
- **Where to drop it**: `policies/` folder (committed, runs in CI) OR `test-data/` (gitignored, local-only for PII)
- **Once uploaded**, add a fixture entry to `src/lib/ai/__tests__/qa-pdf-golden.test.ts`:
  ```ts
  {
    path: 'policies/KRK_35_VD_458_Kasko_Police_32630901_3.pdf',
    insurer: 'Ray Sigorta',
    description: 'Ray Sigorta Commercial Fleet Truck (1997 IVECO)',
    expectedMakeContains: 'IVECO',
    expectedYear: 1997,
    expectedPlate: '35 VD 458',
    expectedPremiumOneOf: [755.21, 719.25], // Brüt / Net
    shouldFindDahilHaric: true,
  },
  ```
- Then run: `npx vitest run src/lib/ai/__tests__/qa-pdf-golden.test.ts`

### Priority 3: Monitor KASKO Pilot Calibration (carry-forward)
- Pilot thresholds A: 93, B: 85, C/D: 60 were forced at n=29. Monitor for skew as volume grows past 50 policies.
- `scripts/calibrate-grade-thresholds.ts` min sample was lowered 50→5 to unblock pilot; revert to 50 when volume sufficient.

### Priority 4: Address Deferred P1/P2 Bugs (not fixed this session)
From the original QA report, these remain open:
- **#6 Depreciation clause (Eskime Payı/Kıymet Artışı)**: Add AI prompt guidance for 50%-max depreciation on aged vehicles
- **#7 Parts clause (Eşdeğer/Çıkma Parça)**: Add risk flag for non-OEM parts on older vehicles
- **#9 NCD/Group discount extraction**: Add `discounts` section to schema (ncdDiscount, groupDiscount %)
- **#10 Commercial template**: Branch output language by `KULLANIM TARZI` (KAMYON/OTOMOBİL) and insured entity type (VKN vs TCKN)
- **#13 Market comparison for commercial/truck**: Integrate TSB data or suppress market comparison when benchmark confidence is low for niche vehicles
- **#14 Confidence score post-processing**: AI returns 99% even with 30+ graph warnings; add post-extraction confidence adjustment
- **#15 Locale mixing in output**: Some recommendation strings still leak English into Turkish UI

## Current State

**Branch**: `claude/load-project-context-BkEVh` — 3 commits ahead of `origin/main`.
**Working tree**: Clean (after docs update).
**Tests**: 617 passing across 11 suites (verified locally). 0 TS errors.

## What This Session Produced

### Bug Fixes (8 bugs across 10 files)

**P0 (Critical Parser/Extraction Bugs)**:

1. **Premium 100× Turkish decimal comma**: Expanded `premiumPatterns` in `policy-extractor.ts:1697-1731` to handle Turkish İ (U+0130) with character classes `pr[iİ]m`, `br[uü]t`, and to allow intervening words like "NET" in "TOPLAM NET PRİM". Root cause: JS `/i` flag does simple case folding and does not match `PRİM` against `prim`.

2. **Vehicle make/model column-aligned extraction**: Widened `extractVehicleInfoFromText()` regex in `turkish-utils.ts:388-433` to allow `\s{0,50}` spacing, handle `MARKASI/TİPİ` variant (commercial policies), and added standalone `MODEL:` pattern.

3. **Sigorta Bedeli raw-text fallback**: Added patterns in `calculateMainCoverage()` block (`policy-extractor.ts:1682-1701`) to match `sigorta bedeli (16750 -TL)` free-text references when structured coverages don't contain the sum insured. Uses `s[iİ]gorta\s+bedel[iİ]` for Turkish İ.

4. **DAHİL/HARİÇ flag inversion (6-part fix)**:
   - `shared/extraction-schema.ts`: Added `included: boolean` to coverage items; required array 8→9
   - `src/lib/ai/extraction-schema.ts`: Added `included?: boolean` to `ExtractedCoverage`; DAHİL/HARİÇ + commercial alcohol prompt guidance
   - `src/lib/ai/policy-extractor.ts`: Changed hardcoded `included: true` to `c.included ?? true` (both sites)
   - `src/lib/ai/kasko-parser-prompts.ts`: Added `included?: boolean` to `StructuredPolicyData.coverages`
   - `src/lib/ai/table-parser.ts`: Keep excluded coverages with `included: false` instead of returning `null`; `isIncludedValue()` default is now `false` (safe); patterns strengthened with `/dahi̇l/i` variant and `/^x$/i` (anchored, was `/x/i`)
   - `shared/__tests__/extraction-schema.test.ts`: Updated coverage property count 8→9

**P1 (Interpretation/Logic)**:

5. **Unresolved relationship filtering**: `relationship-resolver.ts:44-54` now `console.warn()` internal warnings instead of pushing to `policy.aiInsights[]`.

6. **Historical policy detection**: `evaluator.ts:1347-1362` adds >2-year threshold — policies expired >2yr get "Historical Policy — For Reference Only" instead of absurd "Renew Expired Policy Immediately".

7. **Commercial vehicle alcohol exclusion (prompt-only)**: Added AI prompt guidance in `extraction-schema.ts` for 0.00‰ ticari araç rules vs 0.50‰ hususi.

8. **Deductible assignment max-across**: `policy-extractor.ts` two sites (1834, 3324) now use `Math.max(0, ...coverages.map((c) => c.deductible ?? 0))` instead of `coverages[0]?.deductible ?? 0`.

### Regression Tests Added (63 new tests)

- **`src/lib/ai/__tests__/qa-regression-fixes.test.ts`** (38 tests): Unit tests per bug — parseTurkishCurrency, vehicle regex, sigorta bedeli patterns, DAHİL/HARİÇ schema, isIncludedValue behavior, resolveClauseRelationships, historical policy, deductible max.
- **`src/lib/ai/__tests__/qa-pdf-golden.test.ts`** (25 tests): Loads 4 real Turkish kasko PDFs from `policies/` directory (Eriş Ambalaj/VOLKSWAGEN, Allianz/PEUGEOT, Anadolu/RENAULT, Anadolu/VOLKSWAGEN) and asserts extraction patterns work. Includes cross-PDF aggregate check that guards against 100× bug regression (fails if any premium >200K TL appears).

### Additional Bugs Discovered During Test Authoring

- `INCLUDED_PATTERNS` in `table-parser.ts` had `/x/i` matching any word containing x ("text", "next") → changed to `/^x$/i` (anchored)
- `INCLUDED_PATTERNS` missed Turkish İ→i̇ lowercase variant → added `/dahi̇l/i` fallback
- Sigorta bedeli production regex also had Turkish İ issue → fixed to `s[iİ]gorta\s+bedel[iİ]`

### Note: Prettier Auto-Formatted Unrelated Code in `table-parser.ts`

The lint-staged pre-commit hook ran `prettier --write` on `table-parser.ts` and reformatted ~25 lines of code unrelated to our bug fixes:
- 6 arrow functions: `(p =>` → `((p) =>`
- ~12 quoted object keys: `'hırsızlık':` → `hırsızlık:`
- `mainTypes` array reformatted to multi-line

These are zero-functional-impact stylistic changes. Reviewers should NOT flag them as suspicious. Functional changes in `table-parser.ts` are limited to: `INCLUDED_PATTERNS` array, `EXCLUDED_PATTERN` regex, `extractCoverageFromRow()` block (~248-275), and `isIncludedValue()` default return.

## Files Modified / Created (This Session)

| File | Change |
|------|--------|
| `shared/extraction-schema.ts` | Added `included` boolean to coverage items + required array (8→9) |
| `shared/__tests__/extraction-schema.test.ts` | Updated coverage property count assertion 8→9 |
| `src/lib/ai/extraction-schema.ts` | Added `included?` to `ExtractedCoverage`; expanded prompt with DAHİL/HARİÇ + alcohol guidance |
| `src/lib/ai/policy-extractor.ts` | Fixed 4 premium patterns for Turkish İ; added sigorta bedeli fallback; `c.included ?? true`; deductible max-across |
| `src/lib/ai/table-parser.ts` | Preserve excluded coverages; `isIncludedValue()` default false; `/^x$/i` + `/dahi̇l/i` patterns |
| `src/lib/ai/turkish-utils.ts` | Widened vehicle make/model regex (MARKASI/TİPİ + wide spacing) |
| `src/lib/ai/kasko-parser-prompts.ts` | Added `included?: boolean` to `StructuredPolicyData.coverages` |
| `src/lib/ai/relationship-resolver.ts` | Filtered unresolved warnings from aiInsights → console.warn |
| `src/lib/policy-evaluation/evaluator.ts` | Historical policy detection (>2yr expired) |
| `src/lib/policy-evaluation/evaluator-branches.test.ts` | Split expired test into recent/historical cases |
| `src/lib/ai/__tests__/qa-regression-fixes.test.ts` | **NEW** — 38 unit regression tests |
| `src/lib/ai/__tests__/qa-pdf-golden.test.ts` | **NEW** — 25 golden tests against 4 real PDFs |
| `CLAUDE.md` | Added "Next Session Instructions" block (PR #351 merge priority + deferred PDF upload); added gotchas #62-#72 (extends #70 with #71 lint-staged + #72 parseTurkishCurrency dot-only ambiguity); updated project state + Last Updated |
| `SESSION_HANDOFF.md` | This file |

## Environment / Configuration

**No new environment variables added.** No config changes to `app_settings` or database schema required. The `shared/extraction-schema.ts` change (added `included` field) changes the OpenAI strict-mode JSON schema sent to the LLM — next AI extraction call will include the new field. No migration needed; AI will default `included: true` when the DAHİL/HARİÇ column isn't present.

**Existing env vars still required** (all pre-existing — verify in `.env` before running locally):
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_CLOUD_API_KEY`, `GCP_SERVICE_ACCOUNT_BASE64`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_JWT_SECRET`
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`

## Known Issues / Limitations (NOT bugs to fix this round)

- **`parseTurkishCurrency('500.000')` returns 500, not 500,000**: Known dot-only ambiguity. See CLAUDE.md gotcha #72. Production impact: zero today (all premium/coverage values come from text containing `,XX` cents); future risk if a PDF presents a round amount without cents.
- **`[ClauseResolver]` warnings in test stderr**: Intentional. The relationship-resolver fix (gotcha #67) routes ambiguous edges to `console.warn` instead of user-visible `aiInsights`. Tests exercising this path will print warnings — these prove the fix works.
- **Prettier reformatted unrelated arrow-function syntax in `table-parser.ts`**: 25 lines of stylistic-only changes from the lint-staged pre-commit hook. Not bug fixes; do not revert.

## Verification Commands (for the next agent)

```bash
# Branch state
git status                           # should be clean
git log --oneline -5                 # top 3 should be this session's commits
git diff origin/main...HEAD --stat   # should show ~12-14 files

# Tests (isolated — DO NOT run full suite without permission)
npx vitest run src/lib/ai/__tests__/qa-pdf-golden.test.ts          # 25 pass
npx vitest run src/lib/ai/__tests__/qa-regression-fixes.test.ts    # 38 pass
npx vitest run shared/__tests__/extraction-schema.test.ts          # 12 pass
npx vitest run src/lib/ai/extraction-schema.test.ts                # 69 pass
npx vitest run src/lib/ai/turkish-utils.test.ts                    # 44 pass
npx vitest run src/lib/policy-evaluation/evaluator-branches.test.ts # 75 pass

# TypeScript
npx tsc --noEmit  # 0 errors expected
```

### GitHub Operations (PR management, comments, merge)

The `gh` CLI is **NOT available** in this sandbox. All GitHub operations must use the GitHub MCP server tools (prefixed `mcp__github__`):

| Task | Tool |
|------|------|
| Read PR #351 | `mcp__github__pull_request_read` |
| Add PR comment | `mcp__github__add_issue_comment` |
| Merge PR | `mcp__github__merge_pull_request` |
| Check CI status | `mcp__github__list_commits` (then inspect `status`) |

If the MCP github server is disconnected at session start, ToolSearch with `select:mcp__github__create_pull_request` (or similar) loads the schema. The server may disconnect/reconnect mid-session — handle gracefully.

## Carry-Forward Priorities

| # | Priority | Status |
|---|----------|--------|
| 1 | Merge PR #351 (Ray Sigorta fixes) | 🟢 READY — CI should be green |
| 2 | Upload Ray Sigorta PDF fixture | ⚠️ DEFERRED — awaiting user upload |
| 3 | Address deferred P1/P2 bugs (#6, #7, #9, #10, #13, #14, #15) | 🟡 NOT STARTED |
| 4 | Pilot threshold calibration monitoring | ⏳ ONGOING (from prior session) |
| 5 | Phase E production scale-up | ⏳ PENDING (from prior session) |
| 6 | Vitest console noise cleanup | ⏳ PENDING (from prior session) — **EXCLUDE `[ClauseResolver]` warnings from `qa-regression-fixes.test.ts`; they are intentional verification of the unresolved-relationship fix (gotcha #67), not noise** |
| 7 | `[ConfidenceDiag]` log gating | ⏳ PENDING (from prior session) |

## Non-Negotiable Rules (Carry Forward)

1. Legacy arrays (`coverages`, `exclusions`, `insights`) NEVER overwritten
2. Full test suite NEVER run without explicit user permission (>10 min)
3. Pilot evidence from real live data only
4. Never `VITE_` prefix on API keys
5. All admin endpoints must have auth middleware
6. Market conclusions gated by `BenchmarkConfidence`
7. Draft policies: TASLAK/DRAFT labeling on export/share
8. Benchmark test mocks MUST include `dataDate`
9. User-facing comparison: "estimate" / "model-based" qualifiers
10. `auditLogs` array MUST have `MAX_ENTRIES` cap after `.push()`
11. Extraction schema changes go in `shared/extraction-schema.ts` only (both client & server re-export)
12. `ProcessingLogger.onStageChange()` listener errors are caught individually
13. `translations-skeleton.ts` accepts new KEYS with empty-string VALUES
14. Server `__dirname` paths: `dist-server/server/` is the base — need 2 levels up to reach project root
15. **NEW**: Turkish regex patterns must handle Turkish İ (U+0130) via `[iİ]` character class — JS `/i` flag alone does NOT match `PRİM` against `prim` (see gotcha #62)
16. **NEW**: Coverage `included` field is now end-to-end required — schema, prompt, converter, and both extraction paths must preserve it (see gotcha #65)
17. **NEW**: Historical policy threshold is 2 years — tests using hardcoded expired dates must use dates >2yr old or dynamic `setMonth(-6)` for Renew case (see gotcha #66)

## Anti-Patterns Not Repeated

- No full test suite run (>10 min rule) without prompting the user
- No push to `main` — commit stays on feature branch `claude/load-project-context-BkEVh`
- No mocking of real AI API calls — PDF golden tests use only deterministic regex layer, no API keys required
- No hardcoded test dates near the 2-year threshold (`'2024-01-01'` would flip Renew/Historical over time)
