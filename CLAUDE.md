# CLAUDE.md

> Context file for Claude Code sessions on the insurai project

## ⚠️ Next Session Instructions
1. **Monitor Trial Upload Limit**: The free trial usage limit was adjusted to 100 (`TRIAL_MAX_UPLOADS = 100` in `src/lib/free-trial.ts`). Monitor server resources and API costs to ensure this raised limit doesn't lead to abuse or excessive billing.
2. **Verify E2E Suite in CI**: The `real-user-proof.spec.ts` test suite has been fortified with strict `FORBIDDEN` checks against "Cannot Verify" texts on the policy detail page. Ensure these pass consistently on CI. If any test fails, it means the extraction pipeline failed to map critical vehicle data (make, model, year, plate) to the frontend.
3. **Implement Self-Healing Loop Architecture**: The self-healing loop architecture design (planned earlier) is now ready to implement since this pipeline merge is complete. Focus on creating the LLM-as-a-Judge system to automatically retry and correct extraction failures.
4. **Phase E Production Monitoring**: The KASKO pilot pipeline is hardened, deduplicated, and calibrated with real data. Ready for Phase E production operations. No active blockers.
5. **🚨 TESTING PROTOCOL WARNING 🚨**: Never run the full test suite (`npm run test` or `vitest run`) without explicit user permission. It takes over 10 minutes. Always test files in isolation.
6. **🚨 QA GATE BEFORE SHIPPING EXTRACTION/DISPLAY CHANGES 🚨**: Before claiming any fix complete that touches `aiConfidence`, `extractionIncomplete`, the display-mode gate, or vehicle/coverage extraction, run `npm run qa:extraction` and confirm the relevant check moved. See gotcha #102, runbook 07, ADR-020.

---

## 🚨 Developer Gotchas

1. **Vitest Mocking vs Background Promises**: If a route or service triggers an un-awaited background Promise that makes a database call (e.g., fetching configuration for performance tracking), it **must** be conditionally disabled in tests (`if (process.env.NODE_ENV !== 'test')`). Otherwise, these background calls will unpredictably consume `mockReturnValueOnce` assertions intended for subsequent API requests in the test chain, causing confusing failures like "returning 500 because `auth()` failed" when the mock was actually stolen by `_loadPerfConfig()`.

2. **Testing-Library/React Infinite Hook Renders**: When evaluating `renderHook(() => useHook([createMock()]))`, if the internal mock factory generates randomized fields (`crypto.randomUUID()`) inside an inline array, it passes a completely new memory reference to the hook upon every state change (e.g., `isLoading = true` to `isLoading = false`). This triggers sequential evaluations internally, which evaluates a brand-new array reference, causing an infinite rendering loop that crashes Vitest Node workers. **Fix**: Extract mock array bindings to a variable `const mocks = [createMock()]` before passing them into the `renderHook` testing scope.

3. **Pilot Evaluation Non-Simulation Guard**: When evaluating advanced rollout phases (e.g., Phase 8L and beyond) for the AI Pilot extraction, **never simulate or mock operational quality evidence**. The system must explicitly halt and request either real `kasko_pilot_qa_log.csv` exports or actual `.pdf` file drops from the user to process live reviewer outcomes. Validating operational readiness requires real operational inputs.

4. **Pilot Admission Gate & Mock Fixtures Gotcha**: The `evaluatePilotAdmission` logic strictly checks for the presence of the `provider` field to categorize a document as eligible (clean or moderate) versus `pilot_ineligible_incomplete`. When writing simulated batch schemas (like `pilot-batch2-samples.ts` or `pilot-8k-real-docs.ts`), **you must explicitly populate a `provider` key** in your synthetic `ParsedKaskoData` returns for intended 'moderate noise' test documents; otherwise, the mock will silently fail pilot admission and skew test assertions.

5. **AI Evidence Insight Personalization Leaks**: AI providers (especially when given user context) can inject identity-comparison insights like `"✗ This policy owner is not Erdem (insured name: ...)"`. These are filtered by `isPersonalizationLeak()` in `policy-extractor.ts` before injection into `aiInsights`. If new personalization patterns appear in production, add regex patterns to this function. The filter runs on `data.evidence.insights` — the only unfiltered AI insight injection point.

6. **applySafeWording Cascading Replacement Order**: `display-interpreter.ts` `applySafeWording()` applies regex replacements sequentially. If a broad replacement (e.g., `sınırsız` → "Özel şartlara bağlı olabilir") runs on text already partially rewritten by a prior replacement, it produces concatenated fragments. **Fix**: Always add more-specific patterns (matching the full promotional sentence) BEFORE generic patterns. This was the root cause of the malformed `"Teminat yapısı tespit edildi — koşullar doğrulanmalı - Rayiç değer esasında Özel şartlara bağlı olabilir teminat"` output.

7. **generateStrengths() Outputs Must Be Turkish**: All insight strings from `generateStrengths()`, `generateGapsAsync()`, and `generateRecommendationsAsync()` in `policy-extractor.ts` should be in Turkish for reviewer-mode consistency. If adding new insight strings, write them in Turkish. The `aiInsightsTr` extraction-time translation covers the standard English→Turkish path, but reviewer-facing warnings bypass it.

8. **Turkish Legal Entity Name Spacing**: AI extraction can return merged legal entity names like `"LİMİTEDŞİRKETİ"`. `normalizeTurkishLegalEntityName()` in `policy-extractor.ts` handles common patterns (LİMİTED+ŞİRKET, ANONİM+ŞİRKET, TİCARET+LİMİTED). If new merged patterns appear in production, add them to this function. The function runs on `insuredPerson` during `convertToAnalyzedPolicy()`.

9. **Migration 041 RLS Impact on Admin Tables**: Migration `041_supabase_linter_security_fixes.sql` enables RLS on 7 admin/system tables (`admin_sessions`, `admin_notifications`, `settings_audit_log`, `settings_webhooks`, `settings_webhook_deliveries`, `config_drift_baselines`, `extraction_metrics`) and adds `service_role`-only policies. After applying this migration, any code that accesses these tables with the `anon` key will get empty results. All current admin code uses `SUPABASE_SERVICE_ROLE_KEY` so this is safe, but verify before writing new queries against these tables.

10. **AnalyzedPolicy Type Extension — premiumMissing/insuredMissing/deductibleUncertain**: These optional boolean flags were added to `src/types/policy.ts` in this session. They drive conditional rendering in `PolicyDetailView.tsx` (e.g., "Not specified" instead of "₺0" for missing premium). The actuarial engine adapter (`adapter.ts`) propagates `_premiumMissing` to avoid penalizing missing premiums in EOOP scoring. When adding new extraction flags, follow this same pattern: add to `AnalyzedPolicy`, set in `convertToAnalyzedPolicy()`, consume in `PolicyDetailView.tsx`.

11. **Benchmark Provenance Gate — Closed by Default**: The `generateRecommendationsAsync()` function in `policy-extractor.ts` checks `benchmark.provenance` before emitting market comparison insights. Static benchmarks in `benchmarks.ts` intentionally omit `provenance`, keeping the gate closed. To enable benchmark claims for a policy type, add a verified `provenance: { source, date, cohort }` object (all 3 must be non-empty strings) to the corresponding `MARKET_BENCHMARKS` entry. Never add unverified provenance — it enables potentially misleading market comparison claims in reviewer output.

12. **Conditional Deductible Classification**: `classifyExclusions()` in `policy-extractor.ts` separates percentage-based deductibles (patterns: muafiyet, tenzil, %N) from true non-coverage exclusions. Results populate `AnalyzedPolicy.conditionalDeductibles`. Both the UI (PolicyDetailView) and all export paths (CSV, PDF, Excel, text) render conditional deductibles in a separate section. When adding new deductible patterns, update `classifyExclusions()` — the current patterns cover Turkish insurance terminology.

13. **Canonical Reviewer Summary Builder**: All export paths (CSV, PDF, Excel, text) MUST use `buildPolicyReviewerSummary()` from `src/lib/reviewer/policy-reviewer-summary.ts` instead of inline formatting. This ensures `applySafeWording`, coverage limit cascade, locale-aware names, and conditional deductible classification are applied consistently. Never add direct formatting logic in `export.ts` — add it to the canonical builder instead.

14. **Evidence-Softening for Reviewer Mode**: `softenReviewerInsight()` in `policy-extractor.ts` transforms assertive Turkish phrasing (e.g., "teminatı mevcut" → "mevcut görünüyor; doğrulanmalı"). This runs on all reviewer-mode insights. When adding new insight strings, verify they pass through evidence-softening. Already-hedged text (containing "doğrulanmalı", "görünüyor", "olabilir") is skipped.

15. **Legacy Policy Authoritative Arrays**: When hydrating legacy policies missing headers (`insured`, `startDate`, `expiryDate`), we must *never* overwrite the complex structured arrays (`coverages`, `exclusions`, `insights`) with single-shot LLM extractions. Legacy arrays are structurally richer and remain the authoritative source of truth. Use `scripts/backfill_legacy_policies.ts` with `--dry-run` to safely isolate header extraction without mutating the `raw_data.coverages` namespace. Missing date/identity fields fall back to returning `"Doğrulanamadı"` / `"Cannot Verify"`.

16. **TypeScript Script Vite Env Bypass**: When writing standalone scripts (like `scripts/backfill_legacy_policies.ts`) executed natively via `npx tsx`, standard imports that rely on `import.meta.env` (such as AI providers accessing Vite environments) will immediately crash (`TypeError: Cannot read properties of undefined (reading 'DEV')`). Always bypass Vite-specific files and initialize classes like `OpenAI` directly in standalone scripts utilizing `process.env`.

17. **Dangling Promise Timeouts in PDF Parsing**: When using `Promise.race([promise, createTimeout(ms)])` (e.g., in `extractTextFromPDF`), the `setTimeout` inside `createTimeout` continues ticking even if the primary promise resolves first. In long-running background loops or test environments, this causes memory leaks or delayed Vitest exits. **Fix**: Pass a mutable controller object `{ clear?: () => void }` to the timeout function so `clearTimeout` can be explicitly called in a `finally` block once the operation concludes.

18. **Admin Endpoint Auth Requirement**: All admin routes under `/api/admin/` that are NOT auth-related MUST have either `authenticateAdmin` or `requireSuperAdmin()` middleware. The admin router aggregator (`server/routes/admin/index.ts`) does NOT apply global auth — each sub-router is responsible for its own auth. Routes mounted directly in `server/index.ts` (like `webhooks.ts`, `drift.ts`) DO have auth at mount level (`app.use('/api/admin/webhooks', authenticateAdmin, ...)`). When adding new admin sub-routers, always add auth per-endpoint.

19. **In-Memory Array/Map Caps**: All server-side in-memory collections (`aiRequests`, `policyOperations`, `securityLogs`, `auditLogs`, `blockedIPs`, `lastAlertFired`, `extractionMetrics`) MUST be capped. After every `.push()` call, add `if (array.length > MAX_ENTRIES) array.shift()`. After every `.set()` on Maps, check `.size` and evict oldest. Unbounded growth causes memory leaks on long-running Railway deployments.

20. **Segment Name Allowlist**: The `VALID_SEGMENT_NAMES` array in `server/routes/admin/segments.ts` controls which segment names can be queried/created. When adding new user segments, add the name to this allowlist first. Without it, the API rejects the request with 400.

21. **Admin Sub-Route Test Mock Path**: Tests for admin sub-routers (`segments.ts`, `backfill.ts`, etc.) must mock `'../routes/admin/shared.js'` — NOT `'../../middleware/admin-auth.js'`. The sub-routers import auth functions via the `shared.js` re-export barrel. Mocking the original middleware path does NOT intercept the import chain, causing 401 errors in tests. Pattern: `vi.mock('../routes/admin/shared.js', () => ({ requireSuperAdmin: () => [(_req, _res, next) => next()], ... }))`.

22. **Railway Sandbox Proxy Push Does Not Trigger Webhooks**: `git push` via Claude Code sandbox goes through a `127.0.0.1` local proxy. This successfully pushes commits to GitHub but does NOT trigger Railway's GitHub webhook for auto-deploy. To trigger Railway, use `mcp__github__create_or_update_file` or `mcp__github__push_files` which creates a real GitHub commit event.

23. **Benchmark Confidence Gating (Added Mar 27, 2026)**: All market premium comparisons in `evaluator.ts` are now gated by `assessBenchmarkConfidence()` which checks 5 context factors (vehicle class, model year, geography, insurer, coverage level). When 0 factors are present, the Market Comparison UI card is **hidden entirely** and the premium score returns neutral 70. When 1-2 factors are present, the comparison is shown with a prominent "low-confidence" warning listing missing factors. The `BenchmarkConfidence` type is in `src/lib/policy-evaluation/types.ts`. Follow this pattern when adding any new user-facing conclusion that depends on extraction context.

24. **Draft Export/Share Gating (Added Mar 27, 2026)**: Draft policies (`displaySummary?.isDraft === true`) are now gated from export (PDF/CSV/Excel/Text), sharing, and comparison. The `draftExportBlocked()` callback in `PolicyDetailView.tsx` shows a bilingual toast warning and returns early. `SharedResult.tsx` shows a TASLAK/DRAFT banner. `ComparePolicies.tsx` shows a TASLAK badge on draft policies. When adding new output paths (new export format, new share mechanism), always check `isDraft` first.

25. **Contract Quality `contractQualityIsEstimated` Flag (Added Mar 27, 2026)**: When `ActuarialPolicyInput.indemnityMechanics` is missing/undefined, `engine.ts` sets `contractQualityIsEstimated: true` on the result and defaults score to 50. The UI shows "~50 (estimated)" in amber instead of a confident "50 / 100". Both the sync and async (worker) paths in `engine.ts` must set this flag — there are two separate result assembly blocks.

26. **`evaluatePremium()` Signature Changed (Mar 27, 2026)**: The function now accepts an optional 3rd parameter `confidence?: BenchmarkConfidence`. Tests that mock or spy on this function may need to account for the additional parameter. The confidence assessment is done in `evaluatePolicy()` before calling `evaluatePremium()`.

27. **Benchmark Freshness Governance (Added Mar 28, 2026)**: `assessBenchmarkConfidence()` in `evaluator.ts` now computes data freshness from `benchmark.dataDate`. Three states: `current` (≤180 days), `aging` (181-365), `stale` (>365). Stale data **downgrades confidence by one step** (high→low, low→suppressed) and replaces definitive issue strings with hedged "historical" language. Thresholds are config-driven via `benchmarkAgingDays` and `benchmarkStaleDays` on `EvaluationConfig`. When writing tests that mock `getPremiumBenchmarkWithFallback()`, always include `dataDate: new Date().toISOString().split('T')[0]` or the mock will be treated as stale.

28. **EOOP Precision Governance (Added Mar 28, 2026)**: `eoopPrecision` field on `EOOPResult` and `PolicyEvaluationResult` indicates whether the EOOP estimate is `'full'`, `'partial'`, or `'suppressed'`. The adapter (`adapter.ts`) flags `_hasPercentageDeductible` and `_hasConditionalDeductibles` from `AnalyzedPolicy` extraction fields. The engine's `computeEoopPrecision()` reads these flags. When partial, the UI shows `~` prefix, amber color, and a limitation warning panel with scenario examples.

29. **TOPSIS Weight Transparency (Added Mar 28, 2026)**: `ComparePolicies.tsx` has a collapsible "Ranking Criteria & Weights" panel showing all 6 TOPSIS criteria with bilingual labels, weight bars, and direction badges. The disclaimer reads "This is a model-based ranking, not an objective truth." `DEFAULT_TOPSIS_CRITERIA` is already exported from `@/lib/actuarial-engine`.

30. **Grade Threshold Disclosure (Added Mar 28, 2026)**: `PolicyDetailView.tsx` shows a "Top Score Drivers" summary (strongest + weakest category) and a model disclosure: "This rating is based on current internal model thresholds and may be recalibrated as benchmark coverage improves." `GradeBadge.tsx` has a `title` hover attribute with calibration notice. Grades are config-driven via `getGradeFromScore(score, thresholds?)`.

31. **User-Facing Language Softening (Added Mar 28, 2026)**: Three translations were softened: `"Recommended choice"` → `"Top-ranked by model"`, `"Actuarial TOPSIS Score"` → `"Model-Based Ranking"`, `"above/below average"` → `"above/below market estimate"`. When adding new user-facing comparison language, always use "estimate" or "model-based" qualifiers, never unqualified "best" or "recommended".

32. **Supabase `.single()` → `.maybeSingle()` Pattern (Added Mar 28, 2026)**: Supabase's `.single()` returns HTTP 406 (PGRST116) when 0 rows match a query. Use `.maybeSingle()` instead for any query where the row might not exist (e.g., user preferences for new users, processing log updates during race conditions). `.maybeSingle()` returns `{ data: null, error: null }` on 0 rows instead of an error. Fixed in `configuration-service.ts` (`getUserPreferences`) and `processing-log-service.ts` (`updateProcessingLog`). When adding new Supabase queries that might return 0 rows, always use `.maybeSingle()`.

33. **Processing Log PATCH Race Condition (Added Mar 28, 2026)**: The client-side `updateProcessingLog()` in `src/lib/processing-log-api.ts` retries once after 500ms on HTTP 404 to handle the race condition where the POST CREATE hasn't committed before the first PATCH arrives. This is intentional — do not remove the retry logic. The server-side `updateProcessingLog()` uses `.maybeSingle()` and returns `null` (not an error) when the row doesn't exist yet.

34. **`evaluateSimpleDisplayMode()` for Pilot QA Records (Added Mar 28, 2026)**: The lightweight display mode evaluator in `kasko-pilot-gate.ts` uses confidence score + field presence to determine `'full'` / `'restricted'` / `'human_review_required'` without requiring the full `ValidationResult` / `AnalysisBundle` types. It is wired into `policy-extractor.ts` at the QA record creation point (line ~1324). If adding new display mode rules, update this function — it is separate from the full `evaluateDisplayMode()` in `review-thresholds.ts`.

35. **Benchmark Mock `dataDate` Requirement (Added Mar 28, 2026)**: All test mocks for `getPremiumBenchmarkWithFallback()` MUST include `dataDate: CURRENT_DATA_DATE` (or a recent ISO date string). Without it, `computeBenchmarkFreshness()` treats the data as stale, causing confidence downgrades and hedged language in issue strings. This broke 17 existing tests when benchmark freshness was introduced (commit `98a0868`). Pattern: add `const CURRENT_DATA_DATE = new Date().toISOString().split('T')[0]` near test file top.

36. **Module-Level Mock Variable for Draft Detection in Tests (Added Mar 28, 2026)**: `ComparePolicies.tsx` calls `evaluateKaskoPilotGate()` directly (not via `vi.fn()`), so `vi.mocked().mockReturnValue()` does not work. Instead use a module-level mutable variable captured in the mock closure: `let mockIsDraft = false; vi.mock('@/lib/analysis/kasko-pilot-gate', () => ({ evaluateKaskoPilotGate: () => ({ isDraft: mockIsDraft, isActive: false, reason: 'flag_disabled' }) }))`. Reset in `beforeEach`: `mockIsDraft = false`. Toggle per-test: `mockIsDraft = true` before `render()`. This pattern applies to any mock where the implementation must vary per-test but `vi.fn()` is not used.

37. **`getAllByText` for Ambiguous Text in Component Tests (Added Mar 28, 2026)**: `ComparePolicies.tsx` renders the same text (e.g., provider name "Allianz", score "2", category "Premium") in multiple DOM locations (policy cards, score chart, key differences, coverage matrix). Using `getByText('Allianz')` throws `TestingLibraryElementError: Found multiple elements`. Use `getAllByText('Allianz').length > 0` or scope with `within(container)`. This is common in comparison/dashboard components with repeated data.

38. **Policy Selector Hidden When URL Params Present (Added Mar 28, 2026)**: `ComparePolicies.tsx` hides the policy selector panel when policies are pre-selected via URL search params. Tests that need to interact with policy selection cards must first click `screen.getByText('Select Policies')` to reveal the selector before accessing `getByTestId('policy-card-p1')`.

39. **`isDraft` DB Column (Added Mar 28, 2026; applied to production Apr 9, 2026)**: Migration `042_add_is_draft_to_policies.sql` adds `is_draft BOOLEAN DEFAULT false` to the `policies` table with index. The `convertToAnalyzedPolicy()` function in `policy-extractor.ts` sets `isDraft` from `displaySummary?.isDraft`. **Migration applied to production** — draft status now persists across sessions and page refreshes.

40. **Benchmark Aging/Stale Thresholds Admin-Configurable (Added Mar 28, 2026; applied to production Apr 9, 2026)**: `benchmarkAgingDays` and `benchmarkStaleDays` on `EvaluationConfig` control when benchmark data transitions between `current`, `aging`, and `stale` states. Defaults: 180 and 365 days. Seeded via migration `043_seed_benchmark_threshold_configs.sql` — **now applied to production**. Admin UI: Settings → Evaluation → "Benchmark Aging Days" / "Benchmark Stale Days". When writing tests, use `configService.getEvaluationConfig()` to respect admin overrides instead of hardcoding 180/365.

41. **Provisional Status UI Mocking (Added Mar 30, 2026)**: When testing components that block export/share functionality based on provisional results (e.g., `TrustworthinessUI`), you must explicitly provide the triggering condition (like `aiConfidence: 0.80`, `benchmarkStatus: 'untrusted'`, or `benchmark: undefined`) inside the mocked `evaluation` object returned by `vi.spyOn(usePolicyEvaluationHook, 'usePolicyEvaluation')`. Setting `isProvisional: true` alone is not always enough if the component logic expects the specific underlying reason variable.

42. **Phrase Detection Targeting on JSON (Added Mar 30, 2026)**: Never use `JSON.stringify(object).toLowerCase().includes('phrase')` for content moderation or prohibited phrase detection on serialized policy objects. This leads to false positives where structural JSON keys (like `"isUnlimited": true`) trigger a violation for "unlimited". Always target only human-facing text fields explicitly using `checkProhibitedPhrases` (in `batch-ingest-helpers.ts`) which isolates `name`, `description`, `conditions`, and `exclusions`.

43. **Legacy Tabular Data Precedence (Added Apr 1, 2026)**: When dealing with legacy policy data backfills, the older multi-stage pipeline was structurally superior for tables (`coverages`) and domain rules. Legacy data (`raw_data.coverages`) **remains permanently authoritative**. Re-extraction payloads (like GPT-4o-mini single-shot extractions) are strictly utilized to hydrate missing identity and headers (`insuredPerson`, `startDate`, `expiryDate`) and any hallucinated `coverage` array shifts inside those payloads must be explicitly ignored to preserve data accuracy.

44. **Evaluation Engine Unpersisted Scores (Added Apr 1, 2026)**: The core actuarial engine (`evaluatePolicy()`) is stateless and does not persist its output to the `policies` table during standard operations (e.g. initial upload). To enable system-wide threshold calibration based on analytical grades, you MUST run the `scripts/backfill-evaluation-scores.ts` utility. This utility resurrects the database row into a structured `Policy` object, feeds it through the evaluator, and writes the `overallScore` back to `raw_data.evaluation`.

45. **Node Shell Execution of Evaluation Engine (`VITE_SUPABASE_URL` Exception) (Added Apr 1, 2026)**: When executing `evaluatePolicy()` inside native Node scripts (like `npx tsx scripts/backfill-evaluation-scores.ts`), be aware that the evaluator asynchronously triggers `refreshBenchmarks()`. Exploring deep imports leads to `src/lib/supabase/config.ts`, which utilizes client-side Vite (`import.meta.env.VITE_SUPABASE_URL`). This throws a `TypeError: Cannot read properties of undefined` stack trace to the CLI console. **This crash is non-fatal**: it is explicitly caught by the service, causing it to bypass dynamic cloud fetching and successfully fallback to static local json endpoints allowing evaluation to conclude correctly unmodified. Do not attempt to fix this trace by loading `import.meta` in Node.

46. **AI Insight Phrasing (Added Apr 2, 2026)**: The actuarial engine scenarios in `evaluator.ts` must prioritize grounded, professional terminology (e.g., "substantial financial liability", "major unexpected costs") over dramatic or catastrophic language (like "financial ruin" or "personal bankruptcy"). Overly dramatic language undermines the serious tone of the actuarial platform.

47. **OpenAI strict-mode top-level `required[]` completeness (Added Apr 8, 2026)**: When a JSON schema declares `strict: true`, ALL properties (including intentionally-loose nullable ones like `exclusionsEn` and `conditionalDeductibles`) must be in the top-level `required[]` array. The TS interface `?` modifier doesn't help — JSON Schema is its own validation universe. Symptom: `400 In context=(), 'required' is required to be supplied and to be an array including every key in properties. Missing 'X'`. Fixed in commit `28827fd`. The `extraction-schema.test.ts:100` count assertion is now `=== 19` (was `=== 17`). When adding new top-level fields to `EXTRACTION_JSON_SCHEMA`, update both the schema's `required[]` AND this test count. Same rule applies to all nested object schemas — every property in `properties` must appear in `required[]`, recursively.

48. **`as unknown as` casts hide structural bugs (Added Apr 8, 2026)**: The L-3 safe-default in `engine.ts` was deliberately cast through `unknown` to bypass TypeScript (`{ overall: 0, components: {} } as unknown as AnalysisBundle`). This pattern silently broke the contract between `generateAnalysisBundle` and its consumers and crashed `evaluateDisplayMode` in `review-thresholds.ts:182` when the safe-default actually fired ("Cannot read properties of undefined (reading 'extractionQualityScore')"). When you see `as unknown as X` in production code, treat it as a code smell and verify the shape really matches the type — if it doesn't, refactor instead of casting. The `createSafeDefaultBundle()` helper at `src/lib/analysis/engine.ts` (commit `1cf9a96`) is the canonical pattern: any function that returns a complex type with multiple consumers should construct its safe-default fallback as a complete instance via a helper, not as a partial inline stub. The complete-stub pattern restores end-to-end type safety AND eliminates the need for optional chaining in every consumer. **Audit (Apr 9, 2026)**: A codebase-wide search for `as unknown as` found zero other instances of this anti-pattern outside the original `engine.ts` site (which was already fixed by `createSafeDefaultBundle()` in commit `1cf9a96`). No further remediation needed.

49. **Extraction schema is unified in `shared/extraction-schema.ts` (Added Apr 8, 2026; unified Apr 9)**: The canonical `EXTRACTION_JSON_SCHEMA` lives in `shared/extraction-schema.ts`. Both client (`src/lib/ai/extraction-schema.ts`) and server (`server/routes/ai.ts`) import from this single source — no more manual mirroring. `validateStrictCompliance()` lives in `shared/strict-mode-validator.ts`. The client file still exports `ExtractedPolicyData`, `ExtractedCoverage` interfaces and `EXTRACTION_SYSTEM_PROMPT` (client-only concerns). When adding new fields, update `shared/extraction-schema.ts` `properties` AND `required[]` and run `npx vitest run shared/__tests__/extraction-schema.test.ts` (12 tests including strict-mode compliance). The `server/tsconfig.json` uses `rootDir: ".."` to include `shared/` — server output is at `dist-server/server/index.js` (not `dist-server/index.js`). All `__dirname` paths in `server/index.ts` and `server/routes/ai.ts` account for the extra nesting level.

50. **`ProcessingLogger.onStageChange()` pub/sub for UI progress (Added Apr 7, 2026 — documented in QA pass Apr 8)**: PR #329 added `onStageChange(listener: (snapshot: LoggerSnapshot) => void): () => void` to `src/lib/processing-logger.ts`. The method fires after every `startStage/completeStage/failStage/skipStage` mutation AND on early-win setters (`setPageCount`, `setAIProvider`). **Listener errors are caught individually** inside the logger so a buggy subscriber cannot break the extraction pipeline — this is intentional, do NOT add rethrow logic. Returns an unsubscribe function; call it in `useEffect` cleanup. Consumers: `TryAnalysis.tsx` subscribes and passes the live snapshot into `<AnalysisProgressCard>` at `src/components/analysis/AnalysisProgressCard.tsx` which renders a truthful multi-stage pipeline (file header + active stage banner + 7-row checklist + honest `completedStages / visibleStages` progress bar + early-win chips for page count/provider). **Do NOT re-add the legacy `+3%/8s` fake-progress interval** that was removed in commit `11b718a` — it was a lie about what the backend was doing and caused user mistrust when extractions took longer than 8 seconds. 8 unit tests in `processing-logger.test.ts` cover listener isolation and multi-listener support.

51. **`translations-skeleton.ts` rule clarification — empty-string keys ARE allowed (Added Apr 8, 2026 — clarified by QA pass)**: The rule in the "Common Gotchas" section below says `translations-skeleton.ts` must stay "all-empty-string (zero bundle cost)" and "NEVER add content". This is a nuance. **Adding new KEYS with empty-string VALUES is allowed and expected** — that's how the skeleton stays in sync with `translations-en.ts` / `translations-tr.ts` when new i18n keys are introduced. What the rule forbids is adding non-empty values (i.e., actual translated strings), which would defeat the zero-bundle-cost purpose. Three commits on the current branch (`f90da5c`, `6e3dda9`, `11b718a`) each added new keys with empty-string values — all compliant. If you see a new i18n key in the EN/TR files but NOT in the skeleton, that IS a bug (inconsistent dictionary shape), but the fix is to add the empty-string key to the skeleton, not to remove the key from EN/TR.

52. **V8 `Date` constructor silently mis-parses Turkish `DD.MM.YYYY` when day ≤ 12 (Added Apr 11, 2026; FIXED Apr 12)**: `new Date('01.12.2024').toISOString()` returns `'2024-01-12T00:00:00.000Z'` — January 12, NOT December 1. Node only rejects (NaN) when day ≥ 13 (e.g. `new Date('15.12.2024')` → Invalid). **FIXED in commit `ed487ef`** (Apr 12): All 5 production call sites now use `parseTurkishDate()` from `turkish-utils.ts` (regex-first, no `new Date()` ambiguity) as the primary parser, with `new Date()` only as a fallback for ISO datetimes. Fixed sites: `policy-extractor.ts` (endDate block, startDate IIFE, `comprehensiveToAnalyzedPolicy`), `extraction-validator.ts` (date comparison), `policy-utils.ts` (`normalizeDate()`). 8 regression tests added. **Remaining**: existing `policies` rows may have corrupted dates — audit query: `SELECT id, start_date, expiry_date, raw_data->>'startDate' FROM policies WHERE type = 'kasko' AND raw_data->>'startDate' ~ '^\\d{1,2}\\.\\d{1,2}\\.\\d{4}$';`. When writing any Turkish date parsing: always use `parseTurkishDate()` from `turkish-utils.ts` or run the manual `DD.MM.YYYY` regex before `new Date()`.

53. **Vitest v4 removed `--reporter=basic` (Added Apr 11, 2026)**: `npx vitest run <path> --reporter=basic` fails with `Failed to load url basic (resolved id: basic). Does the file exist?` because the built-in basic reporter was removed in Vitest v4. Symptom: `runnerError: Error: RunnerError` cascading from `cli-api.js:13548`. **Fix**: omit the flag entirely (default reporter works fine in Node shell) or use `--reporter=default`. Discovered while running `scripts/__tests__/simple-date-parser.test.ts` in isolation during Phase A+2. If you hit this, the test file itself is fine — the CLI flag is the issue.

54. **Standalone `tsc` typecheck of `scripts/**/*.ts` needs an isolated tsconfig (Added Apr 11, 2026)**: The project's root `tsconfig.json` has `include: ["src"]` so it does NOT typecheck `scripts/`. Running `npx tsc --noEmit scripts/pilot-batch-ingest.ts` without any config breaks on `@/*` path aliases (`Cannot find module '@/lib/ai/extraction-schema'`). **Fix**: write a one-off `tsconfig.pilot-batch.json` at `/tmp/` (or similar) that sets `baseUrl: "<project-root>"` + `paths: { "@/*": ["./src/*"] }` + `include: ["<absolute-path-to-script>"]`, then `npx tsc -p /tmp/tsconfig.pilot-batch.json`. The canonical template is already used in Phase A verification; if you need to retype-check `scripts/pilot-batch-ingest.ts`, look at the earlier session's approach. Note: `tsx` loads the file fine at runtime (esbuild strips types), so this only matters for catching type errors.

55. **`splitPdf().chunks` returns `Uint8Array[]`, NOT `File[]` (Added Apr 11, 2026)**: `src/lib/ai/pdf-splitter.ts:43` declares `splitPdf(file: File): Promise<PDFSplitResult>` where `PDFSplitResult.chunks: Uint8Array[]`. The INPUT is a `File`, but the OUTPUT chunks are raw `Uint8Array` bytes, not wrapped `File` objects. A natural but wrong reading of the API is to call `chunk.arrayBuffer()` on each output — this fails at typecheck time with `Property 'arrayBuffer' does not exist on type 'Uint8Array'`. **Fix**: use `Buffer.from(chunk).toString('base64')` directly, or wrap via `chunkToFile()` (also exported from `pdf-splitter.ts:106`). The `pilot-batch-ingest.ts` OCR fallback uses the direct `Buffer.from(chunk)` path.

56. **Node `File` global requires Node ≥ 20 (Added Apr 11, 2026)**: `src/lib/ai/pdf-splitter.ts:43` accepts a `File` argument, and standalone scripts that call it (e.g. `scripts/pilot-batch-ingest.ts` OCR fallback) construct `new File([buf], filename, { type: 'application/pdf' })`. The `File` class only became a Node global in Node 20; earlier versions throw `ReferenceError: File is not defined`. If a future CI or deployment target downgrades to Node 18, the batch script's OCR fallback will crash at runtime. **Fix if it breaks**: polyfill via `import { File } from 'node:buffer'` (Node 18.13+) or bump the Node version. Current sandbox Node is 22.x which works fine.

57. **Grade Threshold Calibration Minimum Sample Size (Added Apr 12, 2026)**: The calibration script `scripts/calibrate-grade-thresholds.ts` and the internal `isSampleSufficient` check in `calibration.ts` enforce a minimum number of scored policies before allowing grade thresholds to update. This was intentionally lowered from 50 to 5 to unblock early pilot batches. If future statistical robustness is required, this should be increased back to 50 or 100 once sufficient dataset size is reached.

58. **Evaluation Backfill `VITE_SUPABASE_URL` Stack Trace (Added Apr 12, 2026)**: (Extension of Gotcha #45) When running `scripts/backfill-evaluation-scores.ts` to generate actuarial scores on un-evaluated policies, the evaluation engine's dependency on `refreshBenchmarks()` will cause a `VITE_SUPABASE_URL` stack trace in the terminal due to missing Vite environment variables in the raw Node script. This stack trace is non-fatal; the engine falls back to local static JSON benchmarks and successfully completes the evaluation.

---

59. **Vitest Mocking Console Errors (Added Apr 12, 2026)**: Audit and suppress the remaining non-failing `console.error` logs generated by `vi.mock('./config')` during `extractViaProxy` mock assertions to clean up the test runner output completely. When modifying AI proxy services but not exporting the proxy config directly in the mock, tests might log non-fatal console.errors during proxy integration mocked calls, but intercept them accurately without pipeline failure. It is safe, but should be suppressed to keep test outputs pristine.

60. **Unhandled Promise Rejections in Hooks (Added Apr 12, 2026)**: Whenever triggering background fetches or file exports (e.g. `usePdfExport`, `fetchPolicyById`), top-level event handlers must explicitly use `try/catch` boundaries. Suppressing `.catch()` on background promises can cause uncaught exceptions to bubble up to Next.js/React Router boundaries, leading to application crashes.

61. **Axa Sigorta Font Encoding Corruption (Added Apr 12, 2026)**: The `pdfjs` extractor fails to decode TrueType fonts on some Axa Sigorta KASKO policies, resulting in garbled text like `%DûODQJÖo` instead of `Başlangıç Tarihi`. We explicitly intercept these specific corrupted strings inside `pdf-parser.ts` and `pilot-batch-ingest.ts` and throw a `PARSE_ERROR` to force the pipeline to fall back to GCP Document AI OCR. The OCR engine parses the visual bounding boxes natively, perfectly curing the vertical column block issues.

62. **Turkish İ (U+0130) Breaks JS `/i` Flag Case Folding (Added Apr 16, 2026)**: `'İ'.toLowerCase()` in Node/V8 returns `'i̇'` (Latin `i` U+0069 + combining dot above U+0307), NOT plain `'i'` U+0069. This means regex patterns like `/prim/i` **do NOT match** `'PRİM'` because `/i` flag does simple case folding, not Unicode-aware folding. Symptoms: premium sanity check, sigorta bedeli extraction, and DAHİL detection all silently fail on all-caps Turkish text. **Fix pattern**: use character classes `[iİ]` in regex source (e.g. `pr[iİ]m`, `bedel[iİ]`, `s[iİ]gorta`) — this is shorter than the `dahi̇l` variant and matches both uppercase İ and lowercase i directly without relying on case folding. Alternative for mixed Unicode: match both cases explicitly without `/i` flag (e.g. `/VERG[İI]\s+ÖNCES[İI]|Vergi\s+Öncesi/`). The fix landed across 5+ patterns in `policy-extractor.ts` (premium patterns + sigorta bedeli) and `table-parser.ts` INCLUDED_PATTERNS. Always test Turkish regex patterns against UPPERCASE input in unit tests — lowercase test strings hide this bug.

63. **Overly-broad `/x/i` Pattern in INCLUDED_PATTERNS (Added Apr 16, 2026)**: `table-parser.ts` `INCLUDED_PATTERNS` previously contained `/x/i` to match standalone "x" as a "checked" marker in Turkish tables. But `/x/i` matches any cell containing the letter x (including "text", "next", "tax" etc.), causing false positives in the DAHİL/HARİÇ detection. **Fix**: use `/^x$/i` (anchored) for standalone x only, and `\bvar\b` (word-boundary) for `var` pattern. General lesson: every pattern in an any-match list like `INCLUDED_PATTERNS` must be robust to incidental substring matches.

64. **Turkish Decimal Comma 100× Premium Error (Added Apr 16, 2026)**: AI providers can misparse Turkish `755,21` (755.21 TL) as `75521` when returning a JSON number, because they default to international format interpretation. The sanity check at `policy-extractor.ts:1697-1731` re-parses from raw text using `parseTurkishCurrency()` IF it can locate "Brüt Prim"/"Net Prim"/"Toplam Prim" in the text. Fixed patterns now cover Turkish İ (gotcha #62) AND intervening words like "NET" in "TOPLAM NET PRİM". If you add new premium label variants (e.g. "Ödenmiş Prim", "Tahsilatlı Prim"), add them to the `premiumPatterns` array in `convertToAnalyzedPolicy()`. `parseTurkishCurrency()` in `turkish-utils.ts` is the canonical parser — never roll your own comma/dot parser.

65. **Coverage `included` Field Pipeline (Added Apr 16, 2026)**: Previously, `convertToAnalyzedPolicy()` hardcoded `included: true` for all coverages, and the table parser silently dropped excluded ones (returned `null`). This caused HARİÇ coverages to appear as "included" in the UI, inflating coverage counts (~29 vs actual 17). **The pipeline is now correct**: (1) `EXTRACTION_JSON_SCHEMA` has `included` as a required boolean on coverage items (9 properties, not 8), (2) AI prompt explicitly instructs DAHİL/HARİÇ detection, (3) `ExtractedCoverage` interface has `included?: boolean`, (4) `convertToAnalyzedPolicy()` uses `c.included ?? true` (both sites: main and comprehensiveToAnalyzedPolicy), (5) `StructuredPolicyData.coverages` in `kasko-parser-prompts.ts` also has `included?: boolean`, (6) table parser returns excluded coverages with `included: false` (not `null`), and (7) `isIncludedValue()` defaults to `false` (safe) when column can't be parsed. When adding new extraction paths, always preserve the `included` field end-to-end.

66. **Historical Policy Detection (>2 Years) (Added Apr 16, 2026)**: `generateRecommendations()` in `evaluator.ts` previously showed "Renew Expired Policy Immediately" for ALL expired policies, even ones from 2014. Now there's a 2-year threshold: policies expired >2 years get "Historical Policy — For Reference Only" instead. When writing tests for expired-policy code paths, use: (a) `recentExpiry = new Date(); recentExpiry.setMonth(recentExpiry.getMonth() - 6)` for Renew case, or (b) a hardcoded date like `'2020-01-01'` or `'2014-04-26'` for Historical case. Do NOT use dates like `'2024-01-01'` — they'll flip between Renew/Historical as time passes (this broke `evaluator-branches.test.ts` 'critical compliance recommendations for expired policy' in our session).

67. **Unresolved Relationship Warnings Filtered from UI (Added Apr 16, 2026)**: `relationship-resolver.ts` previously pushed `"⚠️ Unresolved relationship: X affects unknown"` strings into `policy.aiInsights[]`, surfacing 30+ internal graph-construction errors to end users. Now they're `console.warn()` with a `[ClauseResolver]` prefix and never reach `aiInsights`. If you see these warnings in Railway logs, they indicate the LLM returned ambiguous relationship graphs (isCandidate=true or targetId=null) — not a bug in the resolver itself. Do NOT re-add the pushes to `aiInsights` for "visibility" — they confused users and leaked internal state.

68. **Deductible Assignment Uses Max Across Coverages (Added Apr 16, 2026)**: Previously `policy-extractor.ts` used `deductible: coverages[0]?.deductible ?? 0` — only the first coverage's deductible. This silently hid all other deductibles from scoring. Fixed to `Math.max(0, ...coverages.map((c) => c.deductible ?? 0))` at both sites (main `convertToAnalyzedPolicy()` and `comprehensiveToAnalyzedPolicy()`). Consequence: policies with a zero-deductible glass coverage as first item AND a ₺1500 collision deductible are now correctly scored (was previously scored as ₺0 deductible = perfect 95/100). If adding a new conversion path, always use the max across ALL coverages.

69. **PDF Golden Test Fixtures & `pdf-parse` API (Added Apr 16, 2026)**: `src/lib/ai/__tests__/qa-pdf-golden.test.ts` loads real Turkish kasko PDFs from `policies/` (committed) and validates extraction regex patterns without calling AI APIs. API note: `pdf-parse@2.x` exports a `PDFParse` CLASS (NOT a `pdfParse()` default function like v1). Use: `const { PDFParse } = await import('pdf-parse'); const parser = new PDFParse(new Uint8Array(buf)); const result = await parser.getText();` — result shape is `{ pages: Array<{ text: string; num: number }> }`. Join pages with `\n` for full text. The import MUST pass `Uint8Array` (not Node `Buffer`) or you get `"Please provide binary data as Uint8Array, rather than Buffer"`. When adding new PDF fixtures, drop into `policies/` (committed, runs in CI) or `test-data/` (gitignored, local-only PII). Then add a `PdfFixture` entry with `expectedPremiumOneOf`, `expectedMakeContains`, `expectedYear`, `expectedPlate`.

70. **Release-Please Conventional Commits Required (Reminder Apr 16, 2026)**: The `.github/workflows/release-please.yml` validates Conventional Commit format strictly. PR titles and squash commits MUST follow `<type>(<scope>): <summary>` — types are `feat`, `fix`, `test`, `chore`, `docs`, `refactor`, `perf`, `ci`, `style`, `build`. For PRs combining multiple bug fixes (like this session's 8 QA fixes), use the dominant type (`fix`) with a scope (`extraction`). A PR titled "Various bug fixes" will fail the release-please validator.

71. **Lint-staged pre-commit hook reverts via stash on ESLint failure (Added Apr 16, 2026)**: `.husky/pre-commit` runs `npx lint-staged` which executes `eslint --fix` + `prettier --write` on staged `.ts/.tsx` files. On ESLint failure (e.g., unused variable in test file), lint-staged automatically REVERTS via git stash and aborts the commit. Symptom: commit fails with "✖ eslint --fix" + "Reverting to original state because of errors". **Fix**: read the eslint output, fix the file, `git add` again, re-commit. Do NOT bypass with `--no-verify` — it skips the formatter too. Common trip: writing a test variable for documentation purposes (e.g., `const text = 'example'`) without using it. Either remove or prefix with `_text`.

72. **`parseTurkishCurrency('500.000')` returns 500 not 500000 (Added Apr 16, 2026)**: When a number contains ONLY dots (no comma), `parseTurkishCurrency()` in `turkish-utils.ts` falls into the international format branch (`lastDot > lastComma`) and treats `.` as decimal: `500.000` → 500.0. This is intentional but ambiguous for round Turkish amounts written without `,00`. **Workaround in production**: For specific contexts where you KNOW it's Turkish (e.g., sigorta bedeli pattern), add a context-aware bounds check — if the parsed value is suspiciously small for the field (e.g., <1000 for a sum insured), retry parsing with `.replace(/\./g, '')` to force Turkish thousands interpretation. Currently no production code does this; flagged as a known parser limitation. Production impact today: zero (all premium/coverage values come from text containing `,XX` cents).

73. **Global Vitest Console Noise Suppression (Added Apr 19, 2026)**: A global test setup block in `src/test/setup.ts` intercepts `console.warn` and `console.error` to silence noisy pipeline outputs (like `[PolicyExtractor]` diagnostics) during test runs. It explicitly permits warnings containing `[ClauseResolver]` (which validates graph-building error paths without failing the pipeline) and warnings from tests that use `vi.spyOn(console, 'warn')`. When extending the diagnostic pipeline, do NOT strip the `[` `]` bracket prefix from system names (e.g., `[PolicyExtractor]`) — the suppression rules rely on these prefixes to distinguish application noise from actual test runner errors.

74. **`VITE_DEBUG_LOGS` environment variable gates diagnostic console output (Added Apr 19, 2026)**: Two diagnostic checkpoints (`TryAnalysis.tsx` ConfidenceDiag and `policy-extractor.ts` AI Response Score) are now gated behind `import.meta.env.VITE_DEBUG_LOGS === 'true'`. Similarly, `PolicyUpload.tsx` `[ProcessingLog]` messages check `process.env.NODE_ENV === 'test'` and suppress in test environments. `src/lib/env.ts` `logEnvironmentStatus()` also suppresses all environment logging in test mode. When debugging extraction issues locally, set `VITE_DEBUG_LOGS=true` in `.env` to re-enable these diagnostic outputs. This variable is NOT required — absence means silent operation.

75. **`dommatrix` dependency added to `package.json` (Added Apr 19, 2026)**: The `dommatrix` package (v0.1.1) was added as a production dependency to satisfy `pdf-parse` v2.x requirements in Node/test environments where `DOMMatrix` is not globally available (jsdom does not implement it). Without this polyfill, `pdf-parse` crashes with `ReferenceError: DOMMatrix is not defined` when running `qa-pdf-golden.test.ts`. If removing `pdf-parse` as a dependency in the future, `dommatrix` can also be removed.

76. **Chat schema message limit raised from 4KB to 500KB (Added Apr 19, 2026)**: `server/middleware/validation.ts` `chatSchema.message` validation was changed from `.max(4000)` to `.max(500000)` to accommodate comprehensive extraction prompts that include full policy document text. The previous 4KB limit silently truncated extraction requests on longer documents. This is safe because the server-side rate limiter and AI provider token limits are the actual cost controls.

77. **Confidence penalization via `clauseGraph` edges (Added Apr 19, 2026)**: `policy-extractor.ts` `convertToAnalyzedPolicy()` now penalizes `aiConfidence` by 15% (multiply by 0.85) if the extracted `clauseGraph.edges[]` array contains any entry where `isCandidate === true` OR `targetId` is null/undefined. This addresses bug #14 from the QA report — AI returning 99% confidence even with 30+ unresolved graph warnings. The penalization is applied inside an IIFE at the `aiConfidence` assignment site. When testing extraction results with mocked `clauseGraph`, include or omit candidate edges to control the confidence score.

78. **`extractPolicyComprehensive()` endpoint migrated from `/api/ai/chat` to `/api/ai/extract/:provider` (Added Apr 19, 2026)**: The comprehensive extraction function in `policy-extractor.ts` previously routed through the chat endpoint (`/api/ai/chat`) with `{ message, policyContext, provider }` payload. It now uses the dedicated extraction endpoint (`/api/ai/extract/${provider}`) with `{ documentText, systemPrompt, policyType }` payload, and parses the structured `data.data` response (JSON object) instead of raw `data.response` (text string). This change means the extraction route's Zod validation schema (`extractionSchema`) is now the governing validator, not `chatSchema`. If adding new extraction paths, use the `/api/ai/extract/:provider` endpoint pattern.

79. **Audit Logger Test Mocks in Debug Mode (Added April 19, 2026)**: In test environments overriding NODE_ENV to development, the `auditLogger` writes to `console.info` for log drops rather than `console.warn` or failing silently. Mocks must spy on `console.info` when intercepting these debug path drops to avoid false negative test failures.

80. **Provisional Evaluation Scoring Cap (Added April 19, 2026; UPDATED April 23, 2026)**: The evaluation engine uses `isProvisional` to determine if a benchmark is untrusted. The untrusted benchmark cap was **relaxed from 60 to 85** to prevent double-penalization of policies that already self-correct for missing data via `inferTotalCoverage()`. Do not check `benchmarkConfidence.status` directly for capping logic in tests or dependent services.

81. **Environment Logging in Tests (Added April 19, 2026)**: Test environments normally silence the environment status logs. You can force them to print by setting the environment variable `FORCE_LOG_ENV=true`.

82. **Chat API Validation Strictness (Added April 19, 2026)**: The `chatSchema.message` payload limit in `server/middleware/validation.ts` was dramatically reduced from 500,000 to 4,000 characters. If testing large payloads for chat features, expect 400 validations errors.

83. **AI Route Modularity (Added April 21, 2026)**: The `server/routes/ai.ts` monolith has been decomposed into a modular directory structure under `server/routes/ai/`. Do NOT add new endpoints to the old monolith structure. All new extraction routes must follow the `/api/ai/extract/:provider` pattern and use dedicated modules (e.g., `insights.ts`, `mappers.ts`) for business logic.

84. **Type Assertion Anti-Pattern (Added April 21, 2026)**: We rigorously eliminated the `as unknown as` double-cast pattern across the `ExtractedPolicyData` pipeline. Any future usage of `as unknown as` inside the extraction boundary is considered a strict code smell. Favor explicit schema validation and properly typed assertions. Note: A single exception was explicitly preserved within the `claude.ts` proxy boundary due to pedantic structural TS rules around third-party proxies.

85. **`isIncluded()` Helper — Treat `undefined` as Included (Added April 23, 2026)**: The evaluator helper `isIncluded(coverage)` in `evaluator.ts` treats `coverage.included === undefined` as `true` (included). This is the industry-standard default: if an LLM extraction omits the `included` field, the coverage is assumed to be part of the policy. Previously, `undefined` was treated as `false`, causing systemic D-grade inflation across ~21 policies. When writing evaluator tests that deal with coverage items, always explicitly set `included: true`, `included: false`, or omit it (which defaults to included).

86. **`inferTotalCoverage()` Fallback (Added April 23, 2026)**: When `policy.coverage` (the top-level total coverage limit) is 0 or missing, `inferTotalCoverage(policy)` in `evaluator.ts` reconstructs a total by summing individual coverage limits from `policy.coverages[]`. This prevents policies with valid per-coverage limits but missing aggregate totals from being scored as "zero coverage" (which triggered an F-grade). The inferred value is used only for scoring — it does NOT mutate the original policy object. When mocking policies for evaluator tests, either set `policy.coverage > 0` or populate `policy.coverages[].limit` for the fallback to work.

87. **Grade Calibration Minimum Sample Restored to 50 (Added April 23, 2026)**: The `calibrate-grade-thresholds.ts` script and `isSampleSufficient` check were previously lowered to 5 (gotcha #57) to unblock early pilots. With 70 policies now ingested, the minimum is effectively met. The calibrated thresholds (A: 89, B: 85, C: 39, D: 2) are now statistically grounded on a 64-policy sample. Future recalibrations should maintain n ≥ 50. Thresholds are stored in `app_settings` under `evaluation/grade_*_threshold` and cached with 5-minute TTL.

88. **Backfill Script Date Normalization (Added April 23, 2026)**: The `scripts/backfill-evaluation-scores.ts` file's `reconstructPolicySafely()` function silently shifts expired policy dates forward to the current year during calibration runs. This prevents the evaluator's compliance checker from penalizing historical/expired policies during threshold calibration. This normalization ONLY applies in the backfill context — it does NOT affect production extraction or the evaluator itself. If you see artificially "current" dates on old policies during a backfill, this is intentional.

89. **Canonical Vehicle Field Alias Table (Added April 24, 2026)**: `shared/field-aliases.ts` is the single source of truth for vehicle field label variants across Turkish insurer formats (AXA, Anadolu, Allianz, Türkiye, HDI, Sompo, Ray, Quick). Adding support for a new insurer is typically a one-line entry in `VEHICLE_FIELD_ALIASES`. The companion `STOP_LABELS` list contains auxiliary section-block labels (Kullanım Şekli, Tür, Tescil Tarihi, Yer Adedi, Trafiğe Çıkış, Ruhsat, Müşteri No, SBM Tramer, Acente) that act as value-capture boundaries — they are NOT extracted as fields, only used to terminate captures. `matchLabeledField()` consumes both. Patterns use `[iİ]?` trailing-possessive trick to handle Turkish "Modeli", "Türü", etc., AND require a kv-separator (`:`, tab, or 2+ spaces) after the label via `hasKvSeparator()` — bare alias-word matches in prose paragraphs are skipped (prevents the "model" mid-sentence in narrative text from beating the real `Tip :` label).

90. **`unlimited` and `sınırsız` Are NOT Prohibited Phrases (Added April 24, 2026)**: Removed from `PROHIBITED_PHRASES` in `display-interpreter.ts`. They are legitimate structural descriptors when a coverage actually is unlimited (IMM Sınırsız, Artan Mali Sorumluluk Sınırsız). The previous behavior — replacing every "Unlimited" / "Sınırsız" with the placeholder string `"Coverage subject to sublimits and specific carve-outs"` — destroyed the headline IMM signal in the UI. Carve-outs (e.g. the 2.5M TL airport/port/fuel-depot cap on IMM Sınırsız) now surface as a separate caveat badge on the scenario card via `ScenarioCard.caveat` / `caveatTR`, not by erasing the limit value. Narrative-level promotional patterns ("mükemmel kapsamlı kasko ... sınırsız koruma") are still caught by the specific multi-word rules in `applySafeWording`. UI sites that previously wrapped structural i18n labels with `applySafeWording()` (`PolicyCoverageSection.tsx:formatCoverageLimit`, `getCoverageInfoText`) and the reviewer summary (`policy-reviewer-summary.ts:formatCoverageItemLimitForReview`) now render structural values directly — DO NOT re-add `applySafeWording()` to those paths.

91. **`evaluateSimpleDisplayMode()` Vehicle + Coverage-Placeholder Triggers (Added April 24, 2026)**: Extended in `src/lib/analysis/kasko-pilot-gate.ts:402` with optional `vehicle` and `policyType` input plus coverage-placeholder detection. New triggers: `MISSING_VEHICLE_MAKE`, `MISSING_VEHICLE_MODEL` (also rejects "No" / "Hayır" label-leak values), `MISSING_VEHICLE_YEAR` (kasko only), `COVERAGE_PLACEHOLDER_DETECTED` (scans coverage `name` and `limit` for the legacy hedge string). `evaluatePolicy()` now consumes the gate, sets `isProvisional = true` and surfaces the reason via new `extractionIncomplete` + `extractionGateTriggers` fields on `PolicyEvaluation`. UI: `PolicyScoreSection.tsx` swaps the "Draft" badge text and banner copy to `t.policy.extractionIncomplete` ("Incomplete extraction — re-scan recommended" / "Eksik çıkarım — yeniden tarama önerilir") when `evaluation.extractionIncomplete === true`. Bypass: vehicle completeness only enforced for kasko (other types never trigger MISSING_VEHICLE_*) and only when `extractedData.vehicle` is provided (tests passing the old 3-arg shape continue to pass).

92. **`extractEkSozlesmeBullets()` Deterministic Fallback (Added April 24, 2026)**: New helper in `src/lib/ai/policy-converter.ts` parses bulleted Turkish add-on sections from raw policy text. Handles four header variants (`Ek Sözleşme Maddeleri`, `Ek Teminat Listesi`, `ek sözleşmeyle teminat kapsamına dâhil`, `Genel Şartlar'a göre ek sözleşme`) and five bullet glyphs (`•`, `●`, `·`, `-`, and **`l` — Anadolu PDFs emit lowercase L in place of a filled-circle glyph**). Strips trailing `(A.4.x)` chapter references and stops at ALL-CAPS Turkish section headings. `convertToAnalyzedPolicy()` runs it ONLY when (a) the LLM returned fewer than 3 `category: 'supplementary'` coverages AND (b) policy is kasko or traffic — the gate prevents synthetic-row spam when the LLM already populated supplementary coverages. Synthetic rows get `category: 'supplementary'`, `included: true`, `clause: 'Ek Sözleşme Maddeleri'`, with the raw bullet as the evidence quote. Deduplicates against existing coverage names by startsWith match (so "Deprem, toprak kayması, ..." doesn't double-count with an already-extracted "Deprem" peril). Exported from `policy-converter.ts` for unit testing.

93. **Named Deductible Scenarios in `classifyExclusions()` (Added April 24, 2026)**: `classifyExclusions()` in `src/lib/ai/policy-converter.ts` now emits one canonical entry per recognized scenario instead of collapsing every match into a single softened string — fixing the "1 conditional" UI display that hid 5+ distinct deductibles. The `NAMED_DEDUCTIBLE_SCENARIOS` table covers seven scenarios: `Anlaşmalı olmayan servis`, `Pert araç muafiyeti`, `Beyan dışı LPG / CNG donanımı`, `Rent-a-car / ticari kullanım`, `İlk cam hasarı muafiyeti`, `Sürücü yaşı`, `Ehliyet süresi`. Format: `"<Scenario label>: %<N>"` (e.g. `"Anlaşmalı olmayan servis: %35"`). Each scenario fires AT MOST ONCE per policy (deduped by `seenScenarios` Set) so two phrasings of the same trigger don't inflate the list. Unrecognized matches fall back to the existing `softenConditionalDeductible()` path so no signal is silently dropped. Function exported for testing. When adding a new scenario keyword pattern, ALL keyword regexes in the entry must match — uses `every()`.

94. **IMM Sınırsız Carve-Out Caveat (Added April 24, 2026)**: New `ScenarioCard.caveat` / `caveatTR` bilingual fields on `src/lib/policy-evaluation/types.ts:ScenarioCard` and corresponding `caveat?: string[] | null` on `Coverage` + `ExtractedCoverage` types. `detectImmCarveOut()` in `src/lib/policy-evaluation/evaluator.ts` inspects an unlimited IMM coverage's `carveOuts` (LLM-populated, preferred), `clause`, `quote`, and `description` for the canonical 2.5M TL airport/port/fuel-depot pattern. Location keywords list: `havaliman`, `liman`, `akaryak`, `rafineri`, `benzin istasyon`, `kimyasal`, `mühimmat`, `tren istasyon`, `demiryolu`. Amount pattern: `2[.,\s]*500[.,\s]*000` OR `2[,.]?5\s*milyon`. When BOTH location + amount hit, full caveat with the 2.5M figure. When ONLY location hits, hedged "verify the exact cap" caveat. `PolicyScenariosSection.tsx` renders the caveat as a small amber `role="note"` block with bilingual `Caveat: / İstisna:` label between `whyItMatters` and `riskAmount`. Coverage's IMM scenario now keeps `insurerPays: 'Unlimited'` AND surfaces the carve-out — no more universally false "User Pays: 0 TL" claim for high-exposure-location accidents.

95. **`carveOuts` Coverage Schema Field — Strict-Mode Required[] Count (Added April 24, 2026)**: Added `carveOuts: array<string> | null` as a top-level coverage item property in `shared/extraction-schema.ts`, populated only for coverages that have a per-scenario cap. The OpenAI strict-mode `required[]` for the coverage item now has 14 entries (was 13) per gotcha #47. Two test count assertions updated this session: `shared/__tests__/extraction-schema.test.ts` (top-level required[] 23→30, coverage props 13→14) and `src/lib/ai/__tests__/qa-regression-fixes.test.ts` (coverage props 13→14). When adding new coverage-item properties, ALL three must be updated together: `properties` block, `required[]` array, and the count-assertion test.

96. **Pre-Commit Hook Auto-Formats Staged Files (Reminder Apr 24, 2026)**: `.husky/pre-commit` runs `lint-staged` which executes `eslint --fix` and `prettier --write` on every staged `.ts/.tsx` file. After committing, files may have been auto-formatted (line wrapping, import sorting, quote normalization) and the linter notes those as "intentional changes." This is correct — the formatted version is what landed in the commit. Don't re-edit to undo. If a future agent sees the linter "modified" notes after a commit, treat them as informational only.

97. **`checkProhibitedPhrase` Parameterized Test Lists Must Mirror `PROHIBITED_PHRASES` (Added April 24, 2026)**: The `PROHIBITED_PHRASES` constant in `src/lib/analysis/display-interpreter.ts` is the canonical source of truth for structural-field phrase blocking. It is mirrored in TWO parameterized test lists: `src/lib/analysis/__tests__/display-interpreter.test.ts:56` (`it.each([...])`) and `src/lib/analysis/__tests__/consumer-path-safety.test.ts:150` (local `prohibitedPhrases` array). When adding or removing a phrase from `PROHIBITED_PHRASES`, update BOTH parameterized lists in the same commit or the tests will drift. v4 example: `"unlimited"` and `"sınırsız"` were removed from the production constant AND from both parameterized lists in the same commit (`3005328`). There is also a negative-assertion test (`display-interpreter.test.ts:77` `it.each([['unlimited'], ['sınırsız'], …])`) that asserts these specific words are NOT flagged as prohibited — that counterpart list also needs updating if the phrase ever flips.

98. **i18n Key Additions Require FOUR Files (Added April 24, 2026)**: When adding a new translation key, touch all four in the same commit: (a) the EN dictionary `src/lib/i18n/translations-en.ts`, (b) the TR dictionary `src/lib/i18n/translations-tr.ts`, (c) the empty-string skeleton `src/lib/i18n/translations-skeleton.ts` (gotcha #51 — zero bundle cost, only empty-string values), AND (d) the TypeScript `TranslationDictionary` interface in `src/lib/i18n/translations.ts`. Missing any one of the four surfaces a TS error on the first consumer rebuild. v4 example: `policy.extractionIncomplete` and `policy.extractionIncompleteDesc` were added to all four files in commit `3005328`.

99. **Empty-Row UI Pattern for Extraction Failures (Added April 24, 2026)**: `VehicleInfoCard.tsx` renders plate / make / model / model-year UNCONDITIONALLY. When a headline field is missing, the row shows `t.policy.cannotVerify` ("Cannot Verify" / "Doğrulanamadı") as an italic gray placeholder with `data-testid="vehicle-field-cannot-verify"`. Reviewer's argument (April 24): hiding rows is worse than showing empty — hidden rows look intentional (as if the PDF didn't contain the data), whereas an explicit empty row signals extraction failure and invites a re-scan. Usage Type and Vehicle Class stay conditionally-rendered — they're optional metadata, not headline fields, and showing "Cannot Verify" for them would add noise. When adding other extraction-sensitive displays (e.g. coverage names, insured person), follow the same pattern — render the label unconditionally and use `t.policy.cannotVerify` as the value placeholder.

100. **`displayedAiConfidence` Capping (Added April 24, 2026)**: `PolicyEvaluation.displayedAiConfidence` is derived in `src/lib/policy-evaluation/evaluator.ts` from raw `AnalyzedPolicy.aiConfidence`, capped at `INCOMPLETE_CONFIDENCE_CAP = 0.65` whenever `extractionIncomplete` fires. The cap is exported from `evaluator.ts` and mirrored by `INCOMPLETE_CONFIDENCE_CAP` in `scripts/qa-extraction-quality.ts` — keep them in sync. UI read sites (`PolicyScoreSection.tsx` Insights cards, mobile and desktop) read `evaluation?.displayedAiConfidence ?? policy.aiConfidence` — the fallback preserves legacy callers that don't pass `evaluation` (only `AIInsightsPanel.tsx` currently, which is orphaned — no production callers). Never render `policy.aiConfidence` directly in a user-facing spot without this fallback. Evaluator test coverage: `evaluator.test.ts` "Displayed AI Confidence" describe block (4 regression tests).

101. **`isUnverified` Suppression of Scoring-Dependent Cards (Added April 24, 2026)**: When the extraction completeness gate fires, the detail view now FULLY suppresses (not dims) `ScoreBreakdown`, `Recommendations`, `PolicyScenariosSection`, `MobileMarketComparisonCard` + `DesktopMarketComparisonCard`, and `ActuarialInsightsCard`. Each gated component accepts `isUnverified?: boolean` and returns `null` when true (for scenarios/market/actuarial) or skips the render branch (for ScoreBreakdown inside PolicyScoreSection). Reviewer's argument (April 24): "half-gate is worse than no-gate or full-gate" — dimming sub-scores to `opacity-60` still lets users read the numbers through the "Incomplete extraction" banner, which is the exact contradiction we're trying to eliminate. The `isUnverified` flag is computed once in `PolicyDetailView.tsx:116` and passed down as a prop. When adding a new scoring-dependent card, always take `isUnverified` and return null on it. Test regression guard: `PolicyScenariosSection.test.tsx` "renders nothing when isUnverified is true" (2 tests).

102. **QA Extraction Quality Gate (Added April 24, 2026)**: `scripts/qa-extraction-quality.ts` (runnable as `npm run qa:extraction`) iterates every `kasko` policy in the DB, runs the evaluator + display-mode gate, and emits CSV + markdown reports in `reports/` (gitignored) with three checks: `VEHICLE_COMPLETENESS`, `CONFIDENCE_GATE_SYNC`, `GRADE_GATE_SYNC`. Exits non-zero when any check has critical failures, enabling CLI-as-gate usage. Runbook: `docs/runbooks/07-qa-extraction-quality.md`. ADR: `docs/adr/020-backend-qa-gate-for-extraction-quality.md`. **Rule**: before claiming any extraction/display fix as complete, run `npm run qa:extraction` and confirm the relevant check's pass rate moved. Reviewer's April 24 feedback root cause — "improvements landing at UI without backend validation" — is addressed by this gate. When changing any file touching `aiConfidence`, `extractionIncomplete`, or the gate display, the gate run is mandatory.

103. **Backward-scan Fallback for Inverted `: VALUE\tLabel` Layouts (Added April 24, 2026)**: `matchLabeledField()` in `shared/field-aliases.ts` now invokes `scanBackwardForInvertedValue()` after the forward scan yields nothing. Handles the Allianz Peugeot KASKO format where the make value precedes the `Marka` label on the same line (`: PEUGEOT (114)\tMarka Plaka No : 34 GM 6461`). Narrow by design — only fires when the segment between line-start and the label starts with a `:`. Any other shape is ambiguity risk (e.g. `Plaka : 34 ABC 12\tMarka` would otherwise mis-capture the plate as the make) and returns undefined. Enabled removing `extractorLenientFor: ['make']` from the Peugeot golden fixture; the strict `expectedMakeContains: 'PEUGEOT'` assertion now passes. Regression tests at `turkish-utils-vehicle.test.ts` include the inverted layout case, the preceding-label false-positive guard, and a no-double-fire sanity check.

104. **PDF-parser Length Threshold Measures Content, Not Page-Markers (Added April 24, 2026)**: `extractTextFromPDF()` in `src/lib/ai/pdf-parser.ts` previously applied the 50-char EMPTY_PDF threshold to the full page-marked string (`[PAGE 1]\n...`), which inflated the measured length by 9 chars per page. A PDF with only 41 chars of actual content passed the threshold because 41 + 9 = 50. Fixed to track `pageTexts` separately from the page-marked `textContent`: the threshold measures `pageTexts.reduce((s, t) => s + t.length, 0)` (actual content), then the page-marked version is constructed for downstream consumers that care about per-page boundaries. `document-ocr.ts` consumers that use `[PAGE N]\n` formatting continue to receive the same output shape. Regression test: `pdf-parser.test.ts` "returns EMPTY_PDF when text is exactly 49 characters" (previously failing, now green).

105. **`pilot-batch-ingest.ts` MUST preserve `extractedText` + populate `vehicleInfo` (Added April 25, 2026)**: The April 25 audit (running `npm run qa:extraction` for the first time against real production data) revealed that 69 of 70 historical kasko policies were missing make/model/year. Root cause: `scripts/pilot-batch-ingest.ts:persistToPoliciesTable` persisted structured fields (coverages, premium) but threw away the source PDF text. The production conversion path's regex-based vehicle extractor never had any input to work on. Fixed by: (a) passing `textResult.text` through to `persistToPoliciesTable` as a new `pdfText` parameter, (b) sanitizing it with the inline `sanitizeForJsonbInline()` and storing as `raw_data.extractedText`, (c) running `extractVehicleInfoFromText()` on the same text and storing the result as `raw_data.vehicleInfo`. Without this, the next batch ingest will recreate the 0%-pass-rate state. The companion repair script for any historical rows is `scripts/backfill-vehicle-info.ts`.

106. **JSONB NUL Sanitization for PDF Text (Added April 25, 2026)**: PostgreSQL's JSONB type rejects literal NUL bytes (U+0000) with `unsupported Unicode escape sequence` on UPDATE/INSERT. Some Turkish kasko PDFs (specifically observed: Anadolu VW Golf 2001) emit a NUL byte mid-text after pdf-parse extraction. Both `scripts/backfill-vehicle-info.ts` and `scripts/pilot-batch-ingest.ts` now strip C0 control characters (NUL..0x1F except TAB/LF/CR) plus unpaired UTF-16 surrogate halves before writing. Pattern: build the regex from a string via `new RegExp('[\\u0000-...]', 'g')` rather than a literal — a literal NUL inside a regex literal in source code corrupts the editor representation. ESLint's `no-control-regex` rule must be disabled with an explanatory comment. **Rule**: any code path that writes free-form text into a JSONB column must apply this sanitization first.

107. **Diagnose-then-Backfill Workflow for DB-Wide Data Issues (Added April 25, 2026)**: When the QA gate (`npm run qa:extraction`) flags a systemic issue, the pattern that worked April 25: (1) write a read-only diagnostic script (`scripts/diagnose-vehicle-extraction.ts` template) that prints a population split + raw_data key inventory + per-row text-field probe, (2) read its output to determine whether the issue is "data missing in DB" vs "data present but in wrong key" vs "needs re-extraction from PDFs", (3) write a write-capable backfill script (`scripts/backfill-vehicle-info.ts` template) with mandatory `--apply` flag (default dry-run), per-row outcome tags (`OK`/`WOULD`/`NO_PDF`/`NO_TXT`/`NO_VEH`/`ERROR`), and a final summary block, (4) run dry-run, eyeball ~5 entries, then `--apply`, (5) re-run the QA gate to verify. April 25 example: 0/70 → 53/70 (76%) on `VEHICLE_COMPLETENESS` in two passes (one for AXA single-space label format, one to add NUL sanitization). Always include `--policy-id <uuid>` on the backfill for one-row debugging.

108. **ESLint `no-useless-escape` in Regex (Added April 25, 2026)**: Do not use useless regex escapes (`\/`, `\.`) in regex strings or character classes. They trigger ESLint `no-useless-escape` and will fail the pre-commit hook.

109. **Pre-commit Linter Blockers / Reverting Commits (Added April 25, 2026)**: Unused imports or variables will trigger the Husky pre-commit hook, stashing your commit. Fix the linting issue and re-commit rather than using `--no-verify`.

110. **`VehicleInfoCard` UI Fallback for Missing Data (Added April 26, 2026)**: The `VehicleInfoCard` component must gracefully handle an `undefined` or partial `vehicleInfo` object. Do not let the component unmount or crash. Use an empty fallback `{}` and let the individual fields display "Cannot Verify", providing an honest extraction status rather than silently hiding the UI section.

111. **E2E 'Cannot Verify' Forbidden Assertions (Added April 26, 2026)**: When validating the extraction UI in Playwright tests (e.g. `e2e/real-user-proof.spec.ts`), use strict `FORBIDDEN` assertions (like `expect(content).not.toContain('Cannot Verify')`) to trap extraction regressions and ensure critical vehicle data is successfully mapped from the LLM extraction to the frontend.

112. **Free Trial Limit Configuration (Added April 26, 2026)**: The hardcoded trial limit in `src/lib/free-trial.ts` (`TRIAL_MAX_UPLOADS`) was raised from 3 to 100 to support higher onboarding throughput.

113. **PolicyContext Signature Change (Added April 26, 2026)**: `PolicyContext` no longer returns the `AnalyzedPolicy` directly. It now returns an object `{ policy: AnalyzedPolicy, policyId: string | null, isPdfParsed: boolean }`. All consumers must destructure `policy` from the context instead of using the context value directly.

114. **Supabase UI Error Leaking (Added April 26, 2026)**: Never render raw Supabase/database error messages into the UI (e.g., in `PolicyActuarialHistoryChart`). Trap them, log via `console.warn` (suppressed from UI), and return `null` or a generic fallback to prevent leaking internal DB schemas or paths.

115. **E2E Visual Audits (Added April 26, 2026)**: The E2E suite now contains heavy visual audit tests (`e2e/policy-detail-audit.spec.ts`, `e2e/policy-trial-audit.spec.ts`, `e2e/visual-audit.spec.ts`) that capture and compare screenshots in `e2e/screenshots/`.

## Project Overview

144. **insurai** is an insurance policy analysis platform for Turkish market professionals. Upload PDF policies, extract structured data with AI, and benchmark coverage against market standards.

- **Owner**: Erdem (personal project)
- **Current State**: Full-stack with AI extraction, multi-turn chat, policy evaluation, duplicate detection, performance optimizations, kasko coverage improvements, combined document processing pipeline, admin-managed AI prompts, OCR cleanup pipeline with Unicode-safe Turkish matching, enhanced Document Journey viewer with full content capture, configuration-driven OCR Decision Engine with Document Journey metadata, PDF splitting for Document AI 10-page limit, session-based free trial for anonymous users with 90s extraction timeout, bundle optimization with dynamic SDK imports, GA4 analytics with KVKK consent, comprehensive configuration system with 843+ configurable settings, Admin Settings UI with validation and audit history, settings export/import for backup/restore, config fetch performance monitoring with TTL recommendations, **modular admin route architecture (9 modules)**, **structured server logging**, **user preferences with three-tier config override**, **config drift detection**, **settings webhooks/templates/batch updates**, **production extraction pipeline fully operational**, **dead code cleanup (~17,800 lines removed)**, **Phases 1-8K (Display Interpreter, Validation Engine, KASKO Internal Pilot Admission Gating & Simulated Scale Validation) complete**, **comprehensive audit hardening (JSON.parse guards, structured logging, rate limiting)**, **critical module test coverage (admin-auth, email, cost-control, free-trial)**, **market data DB migration**, **major dependency upgrades (React 19, Express 5, Vite 7, Vitest 4)**, **tiered confidence system**, **mobile landing page UX overhaul**, **comprehensive i18n for all user-facing components**, **nav bar consistency overhaul with Globe language picker**, **i18n for auth, help, shared result, sample policies pages**, **database-driven i18n translation system with admin management**, **stale HTML cache fix (immutable hashed assets)**, **sample policy cards with expandable detail view**, **admin settings route ordering fix**, **coverage nameTr extraction-time resolution**, **i18n for MyAccount/Settings/ComparePolicies**, **nav ArrowLeft cleanup complete**, **UnsubscribePage i18n**, **AI insights translated at extraction time (aiInsightsTr)**, **massive branch/coverage test push (14,484 tests across 299 files, 0 ESLint errors)**, **Lighthouse optimization (Performance 99, Accessibility 100, CLS 0.005)**, **server-side config performance monitoring wired**, **flaky test hardening**, **production Lighthouse verification (CLS 0, A11y 100, gzip compression middleware)**, **branch coverage improvement (77% → 84% branches, 14,960 tests across 304 files)**, **sortPolicies() status ordering bugfix (|| 4 → ?? 4)**, **migration 020 unsubscribe translations applied to production**, **CI pipeline with Playwright E2E tests (staging + production workflows)**, **no-non-null-assertion warnings eliminated (0 ESLint warnings)**, **branch coverage gap resolved (85.91% branches, 15,316 tests across 312 files)**, **residual ESLint warnings cleared (9 warnings → 0, all files)**, **PWA push notifications (VAPID, Web Push API, server + client infrastructure)**, **framer-motion removed from main bundle (CSS animations, −38 KB gzip)**, **policy expiry via pg_cron Edge Function**, **Real Supabase E2E integration**, **TR translations lazy-loaded as async Vite chunk (−14 KB gzip from main bundle)**, **EN translations lazy-loaded as async Vite chunk (−8.7 KB gzip, completes lazy-i18n)**, **automated semantic versioning via release-please**, **TruffleHog secret scanning in CI**, **realistic AI domain-specific testimonials**, **export dropdown (PDF/CSV/text)**, **automated user onboarding flow**, **extraction error observability (Sentry + ring buffer + admin notifications)**, **admin dashboard mobile-responsive**, **notification bulk select/delete**, **processing logger for anonymous uploads**, **extraction health hourly chart with auto-refresh**, **processing log auto-cleanup via pg_cron (90-day retention)**, **extraction health alerting (configurable thresholds + admin notifications)**, **admin-configurable retention (monitoring + retention settings categories, configurable pg_cron functions)**, **admin UIs for market and premium benchmarks**, **bundle optimization for xlsx**, **historical trend charts (extraction health)**, **processing logs CSV export**, **cron job monitoring UI**, **modular actuarial engine (4-layer, Monte Carlo EOOP, TOPSIS ranking)**, **output evaluation test suite (162 tests)**, **Railway deployment hardening (nixpacks.toml, healthcheck)**, **Actuarial engine UI integration (ComparePolicies TOPSIS rank, PolicyDetailView EOOP breakdown)**, **actuarial engine observability (LayerTimings instrumentation, evidence coverage dashboard, 40 golden regression tests)**, **i18n ternary migration complete for S1+S2 (99 ternaries → translation keys, 8 components, ~163 new translation keys)**, **PolicyDetailView isolated branch coverage fixed (180 tests, `@testing-library/jest-dom` global type declarations wired)**, **FX conversion system (server proxy + client hook + currency switcher)**, **PolicyDetailView i18n complete (132 ternaries migrated)**, **migration 030 seeds 426 missing translation keys to DB**, **recharts + d3 split into dedicated vendor chunk (−4 KB main bundle)**, **useDisplayCurrency wired into all 12 React components (FX system fully operational)**, **E2E coverage applied to FX UI with conditional auth bypass**, **AI Evidence Display pipeline fully wired into DB persistence with explicitly prompted JSON Array quote requirements**, **E2E assertions and missing translations fixed for Interactive Quotes**, **extraction timeout resilience (abort-on-unmount, 120s fetch timeout, pipeline phase timing diagnostics, diagnostic error threading)**, **Dynamic AI Insights Rules Engine (Admin UI + DB + Backend Endpoint integration)**, **VKN vs TC Kimlik false positive fixes**, **502/504 Proxy Extraction timeout handling for graceful user feedback**, **Duplicate AI Insights generated fix**, **Database-editable AI Prompt pipeline**, **Admin UI compiled AI execution map**, **PDF extraction cross-realm ArrayBuffer/Uint8Array fixes**, **Node/jsdom pdf.js worker ESM crash fix**, **hardcoded config migration to DB**, **Phase 8L Broader Guarded Pilot blocked on live operational data**, **KASKO reviewer-mode output quality hardening (personalization leak filter, Turkish insight normalization, legal entity name spacing, text/export parity, applySafeWording cascade fix)**, **reviewer-mode Phase 2 (benchmark provenance gating, conditional deductible classification, evidence-softening, canonical policy-reviewer-summary builder, export path unification)**, **safety governance (benchmark confidence gating, benchmark freshness 3-state system, EOOP precision flags, draft export/share blocking, contract quality estimation, grade threshold disclosure, TOPSIS weight transparency, user-facing language softening)**, **trustworthiness UI visual grading (draft opacity score softening, professional AI insight phrasing)**, **bug fixes (.single() → .maybeSingle() pattern, processing log race condition, pilot QA display_mode evaluation, evaluation history chart resolution)**, **server security hardening (actuarial auth, memory leak caps, mass assignment fix, input validation, admin backfill/segments endpoints, 95 security tests)**, **pilot batch ingestion script complete (Document AI OCR fallback, `policies` table writer, duplicate guard, preflight validation, extracted `_simple-date-parser.ts` with 22 unit tests, runbook `docs/runbooks/03-pilot-batch-ingestion.md`, and flagged latent V8 `Date` DD.MM.YYYY bug in production `policy-extractor.ts:1609-1637` — see gotcha #52)**, **KASKO Pilot Calibration unblocked via DB cross-environment environment vars, unified benchmark subType fallbacks, array typeof guards, and threshold blocker bypasses**, **evaluator D-grade inflation fix (`isIncluded` + `inferTotalCoverage` helpers)**, **untrusted benchmark cap relaxed from 60 → 85**, **70-policy batch ingestion complete (10 unique providers)**, **actuarial grade threshold calibration from 64-policy real-data sample (A: 89, B: 85, C: 39, D: 2)**, **Supabase UNKNOWN duplicate cleanup**, **16 crash-resistance edge-case evaluator tests added**.
- **Production Readiness**: 10/10 (17,469+ tests across the entire project pass cleanly, 0 lint errors, 0 TS errors, 100% test pass rate, PWA support, server hardening, Dynamic AI Rules, DB AI Prompts, UI Evidence Tracking, Safety Governance, PWA icons, 70-policy calibrated grade thresholds, **v4 extraction-depth pass complete (alias table, completeness gate, Ek Sözleşme parser, named deductibles, IMM carve-out)**)
- **Last Updated**: April 24, 2026 (v4 extraction-depth pass: canonical `shared/field-aliases.ts` with `matchLabeledField` + `STOP_LABELS` + `hasKvSeparator` guard; killed `"Coverage subject to sublimits..."` placeholder by removing `unlimited`/`sınırsız` from PROHIBITED_PHRASES and bypassing `applySafeWording` on structural labels; new `evaluateSimpleDisplayMode` vehicle/placeholder triggers wired into evaluator's `isProvisional` + new `extractionIncomplete` UI badge; tightened all 5 PDF golden-test fixtures with strict per-field assertions (Anadolu Tiguan / Allianz Peugeot / Anadolu Renault / Anadolu VW Golf / Ray IVECO); new `extractEkSozlesmeBullets` deterministic parser with 5 header variants + 5 bullet glyphs (incl. Anadolu `l`); `classifyExclusions` named-scenario emission with 7-entry table; new IMM `caveat`/`caveatTR` fields + `detectImmCarveOut` for 2.5M TL airport/port/fuel-depot pattern. 3 new commits on `claude/load-project-context-bNYCu`: `3005328`, `0308b8f`, `fa3e298`.)

---

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend | React + TypeScript | 19.2 / 5.9.3 |
| Styling | Tailwind CSS | v4 |
| Routing | React Router | v7 |
| Build | Vite | v7 |
| Charts | Recharts | v2 |
| Backend | Express + TypeScript | v5 |
| Database | Supabase (PostgreSQL) | - |
| Auth | Supabase Auth | - |
| AI | OpenAI, Anthropic, Google | Multi-provider |
| PDF | pdf.js (browser), pdf-parse (server) | v5.4 |
| Monitoring | Sentry | v10 |
| Testing | Vitest + Playwright | v4 / v1.58 |

---

## Project Structure

```
insurai/
├── src/
│   ├── components/           # React components
│   │   ├── ui/              # Base UI components (Button, Card, Dialog, etc.)
│   │   ├── landing/         # Landing page sections (Hero, Benefits, FAQ, etc.)
│   │   ├── evaluation/      # Policy evaluation UI (GradeBadge, ScoreBreakdown)
│   │   ├── insurance-lines/ # Policy type specific details components
│   │   └── animations/      # Framer Motion components
│   ├── lib/
│   │   ├── ai/              # AI extraction (providers, config, OCR, caching)
│   │   │   ├── providers/   # OpenAI, Anthropic adapters
│   │   │   ├── cache/       # Response caching
│   │   │   └── cost-tracking/ # API usage tracking
│   │   ├── supabase/        # Auth, policies, database operations
│   │   ├── gap-detection/   # Coverage gap analysis engine
│   │   ├── regional-benchmark/ # Turkish regional data & risk factors
│   │   ├── policy-evaluation/ # Policy grading and comparison
│   │   ├── market-data/     # Market benchmarks and gap analyzer
│   │   ├── i18n/            # Internationalization (TR/EN)
│   │   ├── privacy/         # GDPR/KVKK compliance utilities
│   │   ├── pdf-export/      # PDF generation for reports
│   │   ├── ml/              # Machine learning utilities
│   │   ├── actuarial-engine/ # 4-layer actuarial eval (Monte Carlo, TOPSIS)
│   │   └── security/        # Audit logging, sanitization
│   ├── hooks/               # Custom React hooks
│   ├── types/               # TypeScript definitions
│   ├── data/                # Sample policies, market data, regulations
│   └── __tests__/           # Integration & performance tests
├── server/
│   ├── index.ts             # Express server entry (port 4001)
│   ├── routes/              # API routes
│   │   ├── ai.ts            # AI extraction, chat, OCR endpoints
│   │   ├── admin/           # Admin API (split into 9 modules)
│   │   │   ├── index.ts     # Router aggregator
│   │   │   ├── auth.ts      # Login, sessions, diagnostics
│   │   │   ├── users.ts     # User management
│   │   │   ├── prompts.ts   # Prompt template CRUD
│   │   │   ├── operations.ts # Audit logs, security events
│   │   │   ├── monitoring.ts # Health, metrics, notifications
│   │   │   ├── content.ts   # Content management
│   │   │   ├── cost.ts      # Cost tracking
│   │   │   └── shared.ts    # Shared utilities
│   │   ├── settings.ts      # Configuration API
│   │   ├── policy.ts        # Anonymous policy proxy endpoints
│   │   ├── drift.ts         # Config drift detection
│   │   ├── webhooks.ts      # Settings change webhooks
│   │   └── email.ts         # Email endpoints
│   ├── middleware/          # Auth, rate limiting, validation
│   ├── lib/                 # Server utilities (Sentry, logger)
│   ├── services/            # Business logic services
│   │   ├── drift-detection-service.ts  # Config drift detection
│   │   ├── webhook-service.ts          # Webhook delivery
│   │   └── ...              # Admin DB, email, prompts
│   └── __tests__/           # API route tests
├── e2e/                     # Playwright E2E tests
├── docs/                    # Extensive developer documentation
│   ├── adr/                 # Architecture Decision Records (e.g., 0010-translation-hook-typings)
│   ├── architecture/        # System architectural overviews
│   ├── development/         # Developer guides, testing core playbook
│   └── runbooks/            # Operational troubleshooting guides
├── supabase/                # Database schema & migrations
├── scripts/                 # Utility scripts (load-test, ai-extraction)
└── public/                  # Static assets, PWA manifest, service worker
```

---

## Key Files

### Core Application
| File | Purpose |
|------|---------|
| `src/App.tsx` | Main app with routing and lazy-loaded components |
| `src/types/policy.ts`, `analysis.ts`, `display.ts` | Core policy data structures and types, analysis modes, and display summaries |
| `src/lib/policy-context.tsx` | React Context for policy state management |
| `src/lib/policy-utils.ts` | **NEW** Duplicate detection, fuzzy matching, policy comparison |
| `src/lib/policy-upload-check.ts` | **NEW** Pre-upload conflict detection service |
| `src/lib/export.ts` | **UPDATED** Policy export utilities (CSV, PDF, text, Excel/xlsx) with bilingual headers (Feb 25, 2026) |

### AI & Extraction
| File | Purpose |
|------|---------|
| `src/lib/ai/policy-extractor.ts` | Main AI extraction orchestrator |
| `src/lib/ai/config.ts` | AI provider configuration with dynamic SDK imports |
| `src/lib/ai/proxy-utils.ts` | **NEW** Lightweight proxy utilities (no SDK imports) |
| `src/lib/ai/pdf-parser.ts` | PDF text extraction with pdf.js |
| `src/lib/ai/prompts.ts` | AI prompts for extraction and OCR correction |
| `src/lib/ai/text-processor.ts` | Combined document processing pipeline |
| `src/lib/ai/document-normalizer.ts` | Clean-room deterministic document normalizer |
| `src/lib/ai/document-ocr.ts` | Document AI OCR with chunked extraction |
| `src/lib/ai/pdf-splitter.ts` | PDF splitting for >10 page documents (limit lowered from 15) |
| `src/lib/ai/validator.ts` | **NEW** (Phase 7) Cross-field consistency and rule validation checking |
| `src/lib/ai/extraction-normalizer.ts` | **NEW** Deterministic document normalization before validation |
| `src/lib/ai/relationship-resolver.ts` | **NEW** AI clause logic resolver |
| `src/lib/ai/strict-mode-validator.ts` | Re-exports `validateStrictCompliance()` from `shared/strict-mode-validator.ts` |
| `shared/extraction-schema.ts` | **Canonical** single source of truth for `EXTRACTION_JSON_SCHEMA` (unified Apr 9) |
| `shared/strict-mode-validator.ts` | **Canonical** `validateStrictCompliance()` for OpenAI strict-mode JSON schema validation |
| `src/lib/analysis/engine.ts` | **NEW** Orchestrator replacing direct LLM component consumption |
| `src/lib/analysis/benchmarks.ts`, `insights.ts`, `scoring.ts` | **NEW** Modularized logic for extraction analysis |
| `src/lib/analysis/display-interpreter.ts` | **NEW** Generates safe summaries, sanitizes forbidden LLM strings (e.g. 'sınırsız') |
| `src/lib/analysis/review-thresholds.ts` | **NEW** Evaluates parsed metrics and assigns modes (`full`, `restricted`, `human_review_required`) |
| `src/lib/analysis/kasko-pilot-gate.ts` | **NEW** Manages KASKO internal product pilot logic and reviewer allocation |
| `server/routes/ai.ts` | AI proxy routes with ANTHROPIC_SCHEMA_PROMPT |

### OCR Cleanup Pipeline (Added Jan 2026)
| File | Purpose |
|------|---------|
| `src/lib/pipeline/ocr-cleanup-pipeline.ts` | Main OCR cleanup orchestrator with chunking, sanitization, QA |
| `src/lib/pipeline/ocr-sanitizer.ts` | Deterministic OCR text sanitization with Unicode-safe Turkish matching |
| `src/utils/lazyRetry.ts` | **NEW** React lazy () chunk retry logic to prevent 'Failed to fetch dynamically imported module' (Added Mar 8) |
| `src/lib/pipeline/qa-gates.ts` | Quality validation gates with retry logic for failed chunks |
| `src/lib/pipeline/document-chunker.ts` | Document chunking by page markers or size |
| `src/lib/pipeline/turkish-ocr-normalizer.ts` | Turkish-specific OCR normalization rules |
| `src/lib/pipeline/pipeline-logger.ts` | Structured logging for pipeline stages |

### Reviewer Module (Added March 20, 2026)
| File | Purpose |
|------|---------|
| `src/lib/reviewer/policy-reviewer-summary.ts` | **NEW** Canonical reviewer summary builder — single source of truth for all export paths |
| `src/lib/reviewer/__tests__/policy-reviewer-summary.test.ts` | **NEW** 37 unit tests for reviewer summary builder |
| `src/lib/__tests__/export-cross-path-alignment.test.ts` | **NEW** 16 integration tests proving CSV/Excel/PDF export parity |
| `src/lib/ai/__tests__/reviewer-mode-specimen.test.ts` | **NEW** 43 specimen + provenance gate tests |
| `src/lib/ai/__tests__/reviewer-mode-upgrades.test.ts` | **NEW** 26 upgrade tests (Turkish normalization, deductible classification, evidence-softening) |
| `scripts/backfill_legacy_policies.ts` | **NEW** Legacy policy header hydration batch script with `--dry-run` safeguards |

### Evidence Linking Pipeline (Added March 2026)
| Concept | Explanation |
|------|---------|
| `EXTRACTION_JSON_SCHEMA` | Enforces LLMs to map `insights` & `exclusions` alongside explicit string arrays called `evidence` |
| `evidenceData` Lookup Dicts | Maps textual keys to quotes instantly rendering `EvidenceQuote` interactive components in the UI |
| `Supabase Serialization Gap (Fixed)` | `evidenceData` must be explicitly serialized via `RawPolicyData` typings throughout `src/lib/policy-context.tsx` and `PolicyUpload.tsx` to endure page refreshes. |

### OCR Decision Engine (Added Jan 26, 2026)
| File | Purpose |
|------|---------|
| `src/lib/ocr-decision/ocr-decision-engine.ts` | Main orchestrator with `analyzeDocument()` and `buildDocumentJourneyMetadata()` |
| `src/lib/ocr-decision/types.ts` | TypeScript types including `OCRDecision`, `DocumentJourneyMetadata` |
| `src/lib/ocr-decision/configuration-manager.ts` | Loads locale and policy configs from JSON files |
| `src/lib/ocr-decision/language-detector.ts` | Detects document language via term/character matching |
| `src/lib/ocr-decision/policy-classifier.ts` | Classifies policy type (kasko, traffic, health, etc.) |
| `src/lib/ocr-decision/text-quality-analyzer.ts` | Analyzes text quality, encoding issues, garbage patterns |
| `src/lib/ocr-decision/field-extractor.ts` | Tests field extraction patterns (policy number, insured, etc.) |
| `config/locales/*.json` | Language-specific configs (tr.json, en.json, de.json) |
| `config/policy_types/**/*.json` | Policy type configs (motor/motor_kasko.json, etc.) |
| `config/ocr-settings.json` | OCR thresholds, confidence weights, decision thresholds |

### Components
| File | Purpose |
|------|---------|
| `src/components/PolicyUpload.tsx` | Upload flow with AI extraction & conflict detection |
| `src/components/PolicyChat.tsx` | Multi-turn AI chat for policy questions |
| `src/components/PolicyDashboard.tsx` | Main dashboard with policy cards |
| `src/components/PolicyDetailView.tsx` | Detailed policy view with share/download |
| `src/components/PolicyDiffViewer.tsx` | Visual diff for policy changes |
| `src/components/ConflictResolutionDialog.tsx` | Duplicate/amendment resolution UI |
| `src/components/GlobalNavigation.tsx` | **UPDATED** Main nav with Globe language picker, auth state, direct upload |
| `src/components/actuarial/PolicyActuarialHistoryChart.tsx` | **NEW** Recharts-based actuarial score historical trend visualization |
| `src/components/admin/tabs/ActuarialAnalyticsTab.tsx` | **NEW** Dual-chart (Volume/Latency) Actuarial performance tracking dashboard |
| `src/components/ComparePolicies.tsx` | Side-by-side policy comparison |
| `src/components/TryAnalysis.tsx` | **UPDATED** Anonymous free trial analysis with ProcessingLogger (Feb 25, 2026) |
| `src/components/WelcomeOnboarding.tsx` | **NEW** First-time user onboarding with 3-step guide and drag-drop upload (Feb 25, 2026) |
| `src/components/AuthPage.tsx` | **UPDATED** Login/signup with full i18n (Feb 12, 2026) |
| `src/components/AllSamplesDemo.tsx` | **UPDATED** Sample policies grid with full i18n (Feb 12, 2026) |
| `src/components/HelpCenter.tsx` | **UPDATED** Help center with full i18n (Feb 12, 2026) |
| `src/components/SharedResult.tsx` | **UPDATED** Shared analysis viewer with full i18n (Feb 12, 2026) |
| `src/components/landing/UploadWidget.tsx` | **UPDATED** Landing page upload with file handoff |
| `src/components/landing/StickyMobileCTA.tsx` | **NEW** Floating mobile CTA with i18n (Feb 12, 2026) |

### Admin Components (Updated Jan 25, 2026)
| File | Purpose |
|------|---------|
| `src/components/admin/DocumentJourneyViewer.tsx` | **ENHANCED** Full pipeline visualization with content capture, decision context, and actuarial evaluation logging |
| `src/components/admin/AdminDashboard.tsx` | Main admin dashboard with tabbed interface |
| `src/components/admin/AdminLogin.tsx` | Admin login page |
| `src/components/admin/tabs/PromptsTab.tsx` | Manage AI prompt templates |
| `src/components/admin/tabs/ExtractionHealthTab.tsx` | **UPDATED** Live monitoring metrics and Historical Trend Charts |
| `src/components/admin/tabs/ProcessingLogsTab.tsx` | **UPDATED** Real-time system logs with CSV backend export functionality |

### Processing Logger (Updated Jan 25, 2026)
| File | Purpose |
|------|---------|
| `src/lib/processing-logger.ts` | **ENHANCED** Stage logging with full text capture and decision context |
| `src/types/processing-log.ts` | **ENHANCED** Types for `StageDecisionContext`, full content fields |

### Authentication & Database
| File | Purpose |
|------|---------|
| `src/lib/supabase/auth-context.tsx` | Authentication context provider |
| `src/lib/supabase/auth.ts` | Auth functions (signIn, signUp, signOut) |
| `src/lib/supabase/policies.ts` | Policy CRUD operations |
| `src/lib/supabase/client.ts` | Supabase client initialization |

### Server
| File | Purpose |
|------|---------|
| `server/index.ts` | Express server with graceful shutdown, HSTS, structured logging |
| `server/lib/logger.ts` | **NEW** Structured logging with level control (production: info) |
| `server/middleware/validation.ts` | Zod schemas for request validation |
| `server/middleware/rate-limit.ts` | Rate limiting for AI endpoints |
| `server/lib/sentry.ts` | Sentry error tracking setup |
| `server/services/extraction-metrics-service.ts` | **UPDATED** Extraction stats, hourly buckets, and historical daily trend aggregation |

### Push Notifications (Added Feb 20-21, 2026)
| File | Purpose |
|------|---------|
| `server/services/notification-service.ts` | **NEW** VAPID config, `sendPushNotification()` (auto-removes stale 410/404 subs), `sendExtractionCompleteNotification()`, `sendPolicyExpiryNotification()` |
| `server/routes/notifications.ts` | **NEW** 4 endpoints: GET public-key, GET status, POST subscribe, DELETE unsubscribe |
| `src/hooks/usePushNotifications.ts` | **NEW** React hook: `isSupported`, `permission`, `isSubscribed`, `subscribe()`, `unsubscribe()` |
| `src/components/notifications/PushNotificationPrompt.tsx` | **NEW** Soft banner with 7-day localStorage cooldown, permission denied state, i18n |
| `supabase/migrations/021_push_subscriptions.sql` | **NEW** `push_subscriptions` table with RLS (4 policies) + index |

### Admin Panel (Refactored Feb 7, 2026)
| File | Purpose |
|------|---------|
| `src/components/admin/AdminDashboard.tsx` | Main admin dashboard with tabbed interface |
| `src/components/admin/AdminLogin.tsx` | Admin login page |
| `src/components/admin/tabs/PromptsTab.tsx` | Manage AI prompt templates |
| `src/lib/admin/context.tsx` | Admin auth context provider (AdminAuthProvider) |
| `src/lib/admin/api.ts` | Admin API client functions (includes `adminFetch` wrapper) |
| `src/lib/admin/settings-templates.ts` | **NEW** Predefined configuration profile templates |
| `server/routes/admin/index.ts` | **REFACTORED** Admin router aggregator (was single 3,390-line file) |
| `server/routes/admin/auth.ts` | **NEW** Login, sessions, diagnostics routes |
| `server/routes/admin/users.ts` | **NEW** User management routes |
| `server/routes/admin/prompts.ts` | **NEW** Prompt template CRUD routes |
| `server/routes/admin/operations.ts` | **NEW** Audit logs, security events routes |
| `server/routes/admin/monitoring.ts` | **NEW** Health, metrics, notification routes (Actuarial 5% Spikes) |
| `server/routes/admin/fx-monitoring.ts` | **NEW** FX rate history and API health |
| `server/routes/admin/index.ts` | **REFACTORED** Added `/fx-monitoring` route aggregator |
| `server/routes/admin/content.ts` | **NEW** Content management routes |
| `server/routes/admin/actuarial.ts` | **NEW** Real-world Actuarial analytics evaluation metrics backend API |
| `server/routes/admin/cost.ts` | **NEW** Cost tracking routes |
| `server/routes/admin/shared.ts` | **NEW** Shared utilities (Supabase client, helpers) |
| `server/middleware/admin-auth.ts` | JWT auth middleware for admin routes |
| `server/services/admin-db.ts` | Admin database operations |
| `server/services/prompt-service.ts` | Centralized prompt management service |
| `server/services/drift-detection-service.ts` | **NEW** Config drift detection with baselines |
| `server/services/webhook-service.ts` | **NEW** Settings change webhook delivery |

### CI/CD Workflow & Security (Feb 2026)
| File | Purpose |
|------|---------|
| `.github/workflows/release-please.yml` | Validates Conventional Commits to automatically draft versioned GitHub Releases |
| `.github/workflows/staging.yml` | Full E2E & test pipeline block for staging pushes, containing TruffleHog secret scanning |
| `.github/workflows/production.yml` | Production E2E block, TruffleHog secret scanning + Railway rollback checks |
| `.github/dependabot.yml` | Automatic non-breaking dependency updates grouped weekly |
| `CONTRIBUTING.md` | Dev guide emphasizing strict Conventional Commits requirements |

### Admin Settings UI (Updated Feb 7, 2026)
| File | Purpose |
|------|---------|
| `src/components/admin/tabs/SettingsTab.tsx` | Settings tab with category navigation + export/import UI + **NEW** Cron Jobs Panel |
| `src/components/admin/tabs/settings/AISettingsPanel.tsx` | AI provider settings (models, temperature, timeouts) |
| `src/components/admin/tabs/settings/EvaluationSettingsPanel.tsx` | Policy evaluation settings (weights, thresholds) |
| `src/components/admin/tabs/settings/RateLimitsPanel.tsx` | API rate limit configuration |
| `src/components/admin/tabs/settings/OCRSettingsPanel.tsx` | OCR decision engine settings |
| `src/components/admin/tabs/settings/FeatureFlagsPanel.tsx` | Feature flag management |
| `src/components/admin/tabs/settings/SettingsHistoryPanel.tsx` | Settings audit log viewer with search/filter |
| `src/components/admin/tabs/settings/SettingsDiffViewer.tsx` | **NEW** Visual diff viewer for old vs new setting values |
| `src/components/admin/tabs/settings/SettingsTemplatesPanel.tsx` | **NEW** Predefined config profile management |
| `src/components/admin/tabs/settings/SettingsWebhooksPanel.tsx` | **NEW** Webhook configuration for external notifications |
| `src/components/admin/tabs/settings/ConfigPerformancePanel.tsx` | Config fetch latency dashboard with TTL recommendations |
| `src/components/admin/tabs/settings/ConfigDriftPanel.tsx` | **NEW** Config drift detection with baseline comparison |
| `src/components/admin/tabs/settings/MonitoringAlertsPanel.tsx` | **NEW** Extraction health alert threshold configuration |
| `src/components/admin/tabs/settings/RetentionSettingsPanel.tsx` | **NEW** Data retention period configuration with manual cleanup |
| `src/components/admin/tabs/settings/MarketBenchmarksPanel.tsx` | **NEW** Admin UI for Coverage Market Benchmarks |
| `src/components/admin/tabs/settings/CronJobsPanel.tsx` | **NEW** Admin UI for monitoring pg_cron background jobs |
| `src/components/admin/tabs/FXDashboardTab.tsx` | **NEW** Admin UI for monitoring FX rates and API health |
| `src/components/admin/tabs/settings/MarketBenchmarksPanel.test.tsx` | **NEW** Coverage Market Benchmarks unit tests |
| `src/components/admin/tabs/BenchmarksTab.test.tsx` | **NEW** Premium Benchmarks unit tests |
| `src/lib/admin/settings-validation.ts` | Client-side validation utilities for settings |
| `src/lib/admin/settings-templates.ts` | **NEW** Template definitions and management utilities |

### User Preferences (Added Feb 7, 2026)
| File | Purpose |
|------|---------|
| `src/components/UserPreferencesPanel.tsx` | **NEW** User-facing preferences UI panel |
| `src/hooks/useUserPreferences.ts` | **NEW** Hook for three-tier config override (system → admin → user) |
| `src/lib/config/user-overridable.ts` | **NEW** Defines which settings users can override |

### Configuration System (Updated Feb 7, 2026)
| File | Purpose |
|------|---------|
| `src/lib/config/configuration-service.ts` | Singleton ConfigurationService with caching + performance instrumentation |
| `src/lib/config/config-performance-monitor.ts` | Rolling-window latency tracker with TTL recommendations |
| `src/lib/config/user-overridable.ts` | **NEW** User-overridable settings definitions for three-tier config |
| `src/lib/config/types.ts` | TypeScript types, default values, and now `FX_CACHE_TTL_MS` |
| `src/lib/config/configuration-service.ts` | Singleton with caching (updated to support new FX keys) |
| `src/lib/config/index.ts` | Module exports |
| `server/routes/settings.ts` | Admin API routes for settings, export/import, performance, batch updates |
| `server/routes/drift.ts` | **NEW** Config drift detection API endpoints |
| `server/routes/webhooks.ts` | **NEW** Settings webhook management endpoints |
| `server/services/drift-detection-service.ts` | **NEW** Drift detection with baseline snapshots |
| `server/services/webhook-service.ts` | **NEW** Webhook delivery with retry logic |
| `supabase/migrations/012_configuration_system.sql` | Database schema for config tables |
| `supabase/migrations/013_seed_configuration_defaults.sql` | Seeds all hardcoded values |
| `supabase/migrations/014_settings_webhooks.sql` | **NEW** Webhook configuration tables |
| `supabase/migrations/015_config_drift_baselines.sql` | **NEW** Drift baseline snapshot tables |
| `supabase/migrations/017_translation_system.sql` | **NEW** Database-driven i18n tables |
| `supabase/migrations/018_seed_translations.sql` | **NEW** Seeds 685+ translation keys × 2 languages |
| `supabase/migrations/019_seed_coverage_insight_translations.sql` | **NEW** Coverage names + AI insight translations |
| `supabase/migrations/020_seed_unsubscribe_translations.sql` | **NEW** Unsubscribe page translations (22 keys × 2 locales) |
| `supabase/migrations/023_extraction_metrics.sql` | **NEW** Extraction metrics persistence table + pg_cron 30-day cleanup |
| `supabase/migrations/024_processing_log_cleanup_cron.sql` | **NEW** pg_cron job for 90-day processing log auto-cleanup |
| `supabase/migrations/025_monitoring_retention_config.sql` | **NEW** Monitoring/retention config seeds + configurable pg_cron cleanup functions |
| `supabase/migrations/026_cron_monitoring_views.sql` | **NEW** Secure views around pg_cron extensions for UI monitoring |
| `supabase/migrations/029_actuarial_worker_settings.sql` | **NEW** Actuarial Web Worker settings and historical confidence bounds |
| `supabase/migrations/031_fx_rate_history.sql` | **NEW** FX exchange rate history table for tracking conversion analytics |
| `supabase/migrations/033_seed_hardcoded_configs.sql` | **NEW** Seeds 29 hardcoded backend config keys across 8 categories into `app_settings` |
| `supabase/migrations/035_admin_users_schema_alignment.sql` | **NEW** Schema alignment for admin_users (`display_name`, `locked_until`) |
| `supabase/migrations/036_update_anthropic_haiku_model.sql` | **NEW** Updates `claude-3-5-haiku-20241022` to `claude-3-5-haiku-latest` |
| `supabase/migrations/038_extraction_redesign_schema.sql` | **NEW** Traceability columns (span_maps, clause_graph, validation) for High-Trust pipeline |
| `supabase/migrations/039_extraction_versioned_persistence.sql` | **NEW** Versioned persistence for tracking schema and text versions |
| `supabase/migrations/040_kasko_pilot_flag_and_segment.sql` | **NEW** KASKO pilot feature flag seed, `user_segments` table, `kasko_pilot_qa_records` table |
| `supabase/migrations/041_supabase_linter_security_fixes.sql` | **NEW** 20 Supabase database linter fixes — SECURITY INVOKER views, RLS on admin/system tables, service_role-only policies |

### Database-Driven i18n System (Added Feb 12, 2026)
| File | Purpose |
|------|---------|
| `server/services/translation-service.ts` | TranslationService with CRUD, caching, bulk operations |
| `server/routes/translations.ts` | Translation API endpoints (CRUD, export/import, AI-assisted bulk translate) |
| `src/lib/i18n/translation-service.ts` | Client-side translation loading (API fetch + localStorage cache) |
| `src/lib/i18n/i18n-context.tsx` | **UPDATED** React context with DB-backed translation loading pipeline |
| `src/lib/i18n/coverage-names.ts` | **NEW** Canonical EN→TR coverage name map (90+ entries) |
| `src/lib/i18n/exclusion-translations.ts` | **NEW** Turkish→English exclusion pattern fallback (60+ patterns) |
| `src/lib/i18n/translations.ts` | `TranslationDictionary` interface + `COMMON_LOCALES` + back-compat re-exports |
| `src/lib/i18n/translations-en.ts` | **NEW** EN_TRANSLATIONS (eager, initial React state) |
| `src/lib/i18n/translations-tr.ts` | **NEW** TR_TRANSLATIONS (lazy async Vite chunk, 39 KB / 14 KB gzip) |
| `src/components/admin/tabs/TranslationsTab.tsx` | **NEW** Admin UI for inline translation editing, coverage stats, import/export |

### Configuration
| File | Purpose |
|------|---------|
| `.env` | Environment configuration (not committed) |
| `.env.example` | Environment template |
| `vite.config.ts` | Vite config with proxy settings (recently updated for `/api/admin/fx-monitoring`) |
| `eslint.config.js` | **UPDATED** ESLint flat config — scripts dir includes `.mjs` glob + Node globals |
| `lighthouserc.js` | Lighthouse CI configuration |
| `playwright.config.ts` | E2E test configuration |

### Utilities
| File | Purpose |
|------|---------|
| `src/lib/utils.ts` | General helpers (now features native `Intl.NumberFormat` for `formatCurrencyCompact`) |
| `src/lib/utils.branches.test.ts` | **NEW** 100% test coverage suite for updated `utils.ts` functions |
| `src/types/admin.ts` | **UPDATED** Admin type definitions (added `fx_rates` to `AdminSection` union) |

---

## Commands

```bash
# Development
npm run dev           # Frontend only (port 5173)
npm run dev:server    # Backend only (port 4001)
npm run dev:all       # Both frontend + backend (recommended)
npm run dev:sync      # Pull latest + install + run all

# Build & Deploy
npm run build         # Production build (frontend)
npm run build:server  # Production build (backend)
npm run build:analyze # Build with bundle analysis
npm run preview       # Preview production build

# Testing
npm test              # Run all unit tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
npm run test:e2e      # Playwright E2E tests
npm run test:e2e:fast # E2E with Chromium only
npm run test:e2e:ui   # E2E with Playwright UI
npm run validate      # typecheck + lint + test (full validation)

# Code Quality
npm run lint          # ESLint check
npm run lint:fix      # Auto-fix lint issues
npm run typecheck     # TypeScript type check
npm run format        # Prettier formatting
npm run format:check  # Check formatting

# Load Testing
npm run loadtest:quick  # 5s quick load test
npm run loadtest:stress # 30s stress test

# Lighthouse
npm run lighthouse    # Full Lighthouse CI run
```

---

## Environment Variables

Create `.env` in project root (copy from `.env.example`):

```env
# Frontend (VITE_ prefix exposes to browser)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_PROXY_URL=http://localhost:4001
VITE_SENTRY_DSN=https://xxx@sentry.io/xxx

# Backend (server-side only, NEVER exposed to browser)
API_PORT=4001
FRONTEND_URL=http://localhost:5173
OPENAI_API_KEY=sk-proj-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
GOOGLE_CLOUD_API_KEY=AIza...
GCP_SERVICE_ACCOUNT_BASE64=eyJ...  # Base64 string of GCP Service Account JSON (for Document AI)
NODE_ENV=development
SENTRY_DSN=https://xxx@sentry.io/xxx

# Railway Deployment
NIXPACKS_NODE_VERSION=22

# Server-side Supabase — REQUIRED for admin panel and service-role operations
# (same URL as VITE_SUPABASE_URL, different key)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...   # Service role key (NOT anon key) — from Supabase Project Settings → API

# Admin auth — REQUIRED for admin login
# Generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
ADMIN_JWT_SECRET=your-random-64-char-hex-secret

# Push Notifications (Web Push / VAPID) — OPTIONAL for local dev, REQUIRED in production
# Generate once: node -e "const wp=require('web-push'); console.log(JSON.stringify(wp.generateVAPIDKeys(),null,2))"
VAPID_PUBLIC_KEY=your-vapid-public-key-here
VAPID_PRIVATE_KEY=your-vapid-private-key-here
VAPID_SUBJECT=mailto:contact@insurai.com

# FX Exchange Rates — OPTIONAL (free tier works without key, lower rate limits)
EXCHANGERATE_API_KEY=your-exchangerate-host-api-key

# Cron Job Auth — REQUIRED for cron endpoints
CRON_SECRET=your-random-cron-secret

# Pilot Reviewer User — REQUIRED for Phase B/C (Run `npx tsx scripts/get-uuid.ts` to get a valid UUID)
PILOT_REVIEWER_USER_ID=00000000-0000-0000-0000-000000000000
```

**CRITICAL RULES**:
1. API keys must NEVER have `VITE_` prefix - they stay server-side only
2. Server uses `.env` file (not `.env.local`)
3. In development, Vite proxy handles `/api/*` requests automatically
4. `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `ADMIN_JWT_SECRET` are required to use the admin panel locally; without them admin login returns 500 (diagnose at `/api/admin/diagnostics`)
5. `VAPID_*` keys are optional locally but required in production for push notifications; without them notifications silently degrade (no crash, `log.warn` emitted)

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                             │
│                         Port 5173 (Vite)                            │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌───────────┐ │
│  │ PolicyUpload│  │ PolicyChat   │  │ Dashboard   │  │ Landing   │ │
│  │ (PDF+AI)    │  │ (Multi-turn) │  │ (Analytics) │  │ (Marketing│ │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘  └───────────┘ │
│         │                │                  │                        │
│         └────────────────┼──────────────────┘                        │
│                          ▼                                           │
│              ┌─────────────────────┐                                │
│              │  PolicyContext      │ ← React Context for policies   │
│              │  AuthContext        │ ← Supabase auth state          │
│              └──────────┬──────────┘                                │
├─────────────────────────┼───────────────────────────────────────────┤
│                         │ Vite Dev Proxy (/api/* → :4001)           │
├─────────────────────────┼───────────────────────────────────────────┤
│                         ▼                                           │
│                   BACKEND (Express)                                 │
│                      Port 4001                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Middleware Stack                          │   │
│  │  ┌──────────┐  ┌─────────────┐  ┌──────────┐  ┌──────────┐  │   │
│  │  │ Helmet   │→ │ Rate Limit  │→ │ Validate │→ │ Sanitize │  │   │
│  │  │ (Security│  │ (per IP)    │  │ (Zod)    │  │ (XSS)    │  │   │
│  │  └──────────┘  └─────────────┘  └──────────┘  └──────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                      API Routes                                │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌─────────┐ ┌───────────┐  │ │
│  │  │/api/ai/chat  │ │/api/ai/extract│ │/api/ai/ │ │/api/health│  │ │
│  │  │(PolicyChat)  │ │/openai|claude │ │ocr      │ │(monitoring)│ │ │
│  │  │60 req/hr     │ │20 req/hr      │ │30 req/hr│ │60 req/min │  │ │
│  │  └──────┬───────┘ └──────┬────────┘ └────┬────┘ └───────────┘  │ │
│  └─────────┼────────────────┼───────────────┼────────────────────┘ │
│            │                │               │                       │
├────────────┼────────────────┼───────────────┼───────────────────────┤
│            ▼                ▼               ▼                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   External Services                          │   │
│  │  ┌──────────┐  ┌───────────┐  ┌─────────────┐  ┌──────────┐ │   │
│  │  │ OpenAI   │  │ Anthropic │  │Google Vision│  │ Supabase │ │   │
│  │  │ gpt-4o   │  │ claude-   │  │ OCR API     │  │ Auth+DB  │ │   │
│  │  │ gpt-4o-  │  │ 3-5-haiku │  │             │  │ Storage  │ │   │
│  │  │ mini     │  │           │  │             │  │          │ │   │
│  │  └──────────┘  └───────────┘  └─────────────┘  └──────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow: PDF Upload & Extraction
```
User drops PDF → PolicyUpload → pdf.js (browser) → Extract text
→ Check density: < 100 chars/page? → Google Vision OCR (/api/ai/ocr)
                  >= 100 chars/page? → Direct to AI
→ AI Extraction (/api/ai/extract) → Zod validation
→ Pre-upload duplicate check → Conflict resolution if needed
→ PolicyContext → Supabase (save policy + upload document)
```

### Data Flow: Duplicate Detection (NEW)
```
New Policy Extracted → checkPolicyBeforeUpload()
→ Find existing by identifier (policy number + provider + insured)
→ Fuzzy match with OCR tolerance (Levenshtein distance)
→ If match found:
   → Calculate diff (significance levels: critical/major/moderate/minor)
   → Show ConflictResolutionDialog
   → User chooses: Skip | Replace | Keep Both | Track Amendment
→ Handle resolution → Save to Supabase
```

### Data Flow: PolicyChat
```
User → PolicyChat → Build context → /api/ai/chat → Rate limit → Validate
→ Add system prompt + history → OpenAI/Anthropic → Response to UI
```

### Authentication Flow
```
User → Login form → Supabase Auth → JWT in localStorage → AuthContext
→ Protected routes (/dashboard, /upload, /chat) vs Public (/landing, /login)
```

### Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **Monolithic backend** | Simple deployment, single codebase, adequate for current scale |
| **API keys server-side only** | Security - never expose to browser |
| **Vite proxy in dev** | Seamless /api/* routing without CORS issues |
| **Lazy-loaded routes** | Smaller initial bundle, faster FCP |
| **React Context for state** | Simpler than Redux for current needs |
| **Supabase for auth+DB** | Managed PostgreSQL, built-in auth, RLS |
| **Multi-provider AI** | Fallback capability, cost optimization |
| **Rate limiting per IP** | Protect against abuse, control AI costs |
| **TEXT with CHECK vs ENUM** | More flexible, easier migrations |

---

## Duplicate Detection System (NEW)

### Overview
Pre-upload detection of duplicate policies with OCR-tolerant fuzzy matching.

### Core Files
- `src/lib/policy-utils.ts` - Comparison algorithms and fuzzy matching
- `src/lib/policy-upload-check.ts` - Pre-upload check service
- `src/components/PolicyDiffViewer.tsx` - Visual diff component
- `src/components/ConflictResolutionDialog.tsx` - Resolution UI

### Key Functions

```typescript
// Fuzzy matching for OCR errors
import { fuzzyMatchOCR, isPolicyIdentifierMatch, normalizeForOCR } from '@/lib/policy-utils'

// Check if two policy numbers match despite OCR errors
fuzzyMatchOCR('POL-001', 'P0L-OO1', 0.85) // true (O/0 confusion)

// Normalize for OCR comparison (handles Turkish chars, Cyrillic lookalikes)
normalizeForOCR('İstanbul POL-001') // 'istanbul poiooi'

// Full identifier match with fuzzy tolerance
isPolicyIdentifierMatch(policyA, policyB, true) // uses fuzzy matching

// Calculate differences between policies
const diff = calculatePolicyDiff(oldPolicy, newPolicy)
// Returns: { significantChanges, minorChanges, overallSignificance }
```

### OCR Substitution Map
```typescript
const OCR_SUBSTITUTIONS = {
  '0': 'o', 'O': 'o', 'О': 'o',  // Zero, Latin O, Cyrillic O
  '1': 'i', 'l': 'i', 'I': 'i',  // One, lowercase L, uppercase I
  'ı': 'i', 'İ': 'i',            // Turkish dotless i, Turkish I
  '5': 's', 'ş': 's', 'Ş': 's',  // Five, Turkish ş
  '8': 'b', 'B': 'b',            // Eight, B
  // ... more mappings
}
```

### Conflict Resolution Options
| Option | Behavior |
|--------|----------|
| `skip` | Don't save the new policy |
| `replace` | Replace existing with new |
| `keep_both` | Save both as separate policies |
| `track_amendment` | Save as version of existing policy |

### Diff Significance Levels
- `critical` - Core identifiers changed (policy number, provider)
- `major` - Coverage or premium changed significantly
- `moderate` - Dates or deductibles changed
- `minor` - Display-only changes (formatting, etc.)

---

## Landing Page Architecture

### Section Components (`src/components/landing/`)

| Component | Purpose |
|-----------|---------|
| `Hero.tsx` | Main hero with gradient bg, nav, upload widget, comparison mock |
| `Benefits.tsx` | Feature grid with icons (AI extraction, benchmarking, etc.) |
| `HowItWorks.tsx` | 3-step process (Upload → Analyze → Compare) |
| `Stats.tsx` | **UPDATED** Authentic capability metrics (7 types, TR/EN, 15+ checks, <60s) |
| `WhoItsFor.tsx` | Target audience cards (hidden on mobile — covered by Testimonials) |
| `WhyChooseUs.tsx` | **UPDATED** Authentic differentiators (KVKK, No Signup, Turkey-Focused) |
| `CompareSection.tsx` | Interactive policy comparison demo (hidden on mobile) |
| `ComparisonMock.tsx` | **UPDATED** Real provider names with disclaimer |
| `Testimonials.tsx` | **UPDATED** Domain-specific testimonials integrated directly via i18n placeholders for Risk Managers, Brokers, Policyholders |
| `FAQ.tsx` | Accordion with common questions |
| `Footer.tsx` | Links, legal, social |
| `LanguageToggle.tsx` | TR/EN language switcher |
| `UploadWidget.tsx` | Drag-drop upload in hero |

### Hero Component Structure (`src/components/landing/Hero.tsx`)

```tsx
<Hero>
  {/* Decorative gradient blobs */}
  <div className="bg-gradient-to-br from-blue-100/40 to-purple-100/40" />

  {/* Navigation */}
  <nav>
    {/* Top utility bar: Secure badge, phone, help link */}
    {/* Main nav: Logo, Dashboard, Compare, Upload, Profile */}
  </nav>

  {/* Hero content (2-column on desktop) */}
  <div className="grid lg:grid-cols-2">
    {/* Left: Headlines, value props, CTA buttons */}
    <StaggeredList>
      <h1>Türkiye'nin #1 Sigorta Analiz Platformu</h1>
      <UploadWidget />  {/* Drag-drop zone */}
    </StaggeredList>

    {/* Right: ComparisonMock visual */}
    <ComparisonMock />
  </div>
</Hero>
```

### Animation Components (`src/components/animations/`)

```tsx
// Staggered fade-in for lists
<StaggeredList delay={0.1}>
  {items.map(item => <div>{item}</div>)}
</StaggeredList>

// Scale on hover effect
<ScaleOnHover>
  <Button>Hover me</Button>
</ScaleOnHover>

// Animated number counter
<NumberCounter target={4500} duration={2000} />

// Animated button with loading state
<AnimatedButton loading={isLoading}>Submit</AnimatedButton>
```

### Design Tokens

```css
/* Colors (from Figma) */
--primary: #2563eb      /* blue-600 - main actions */
--secondary: #4f46e5    /* indigo-600 - accents */
--success: #10b981      /* green - positive states */
--warning: #f59e0b      /* amber - warnings */
--danger: #ef4444       /* red - errors, gaps */

/* Gradients */
Hero bg: from-slate-50 to-white
Decorative blobs: blue-100/40 to-purple-100/40

/* Typography */
Headings: font-bold text-gray-900
Body: text-gray-600

/* Shadows */
Card shadow: shadow-sm hover:shadow-md
Button shadow: shadow-md
```

### Responsive Breakpoints

```css
sm: 640px   /* Mobile landscape */
md: 768px   /* Tablet */
lg: 1024px  /* Desktop */
xl: 1280px  /* Large desktop */
2xl: 1536px /* Extra large */
```

### Figma Design Reference
- Source file: `MERGED_CODEBASE_FIGMA_DESIGN_DRAFTS.md`
- Contains 138 component designs from original Figma export
- Key components: AdminPanel, InsuranceComparison, CoverageDetails
- Design system: Tailwind-based with custom UI components in `src/components/ui/`

---

## API Endpoints

| Endpoint | Method | Purpose | Rate Limit |
|----------|--------|---------|------------|
| `/api/ai/extract/openai` | POST | Extract policy with GPT-4o | 20/hr |
| `/api/ai/extract/anthropic` | POST | Extract policy with Claude | 20/hr |
| `/api/ai/chat` | POST | Multi-turn policy chat | 60/hr |
| `/api/ai/ocr` | POST | Google Vision OCR for scanned PDFs | 30/hr |
| `/api/ai/providers` | GET | Check which AI providers are configured | - |
| `/api/ai/diagnose` | GET | Test API key validity | - |
| `/api/policy/save-anonymous` | POST | **NEW** Secure background persist for unauthenticated policy extractions | 60/hr |
| `/api/health` | GET | Server health check | 60/min |
| `/api/admin/monitoring/extraction-health` | GET | 24h extraction metrics snapshot (per-provider stats, hourly buckets, recent errors) | Admin |
| `/api/admin/monitoring/extraction-health/historical` | GET | **NEW** Fetch daily aggregated 30-day extraction health stats | Admin |
| `/api/admin/monitoring/alerts/status` | GET | Alert cooldown state (last fired timestamps per alert type) | Admin |
| `/api/admin/monitoring/cron-jobs` | GET | **NEW** List configured pg_cron jobs and recent run execution details | Admin |
| `/api/admin/monitoring/pilot-rollback-status` | GET | **NEW** KASKO pilot rollback trigger status (4 safety thresholds) | Admin |
| `/api/admin/notifications` | DELETE | Bulk delete notifications by IDs or filtered mass delete | Admin |
| `/api/admin/processing-logs` | GET | List processing logs with filters, search, pagination | Admin |
| `/api/admin/processing-logs/export` | GET | **NEW** Export complete filtered processing logs as CSV bypassing pagination | Admin |
| `/api/admin/fx-monitoring` | GET | **NEW** FX exchange rate history for charts | Admin |
| `/api/admin/processing-logs` | DELETE | Bulk delete by IDs or delete all (with optional status/date filters) | SuperAdmin |
| `/api/admin/processing-logs/cleanup` | POST | Trigger manual processing log cleanup (default 90 days) | SuperAdmin |
| `/api/fx/rates` | GET | FX exchange rates (base=TRY, 6h cache, exchangerate.host) | 30/min |
| `/api/fx/status` | GET | FX service health (source, cache age, supported currencies) | 30/min |

### Request/Response Examples

**Chat Endpoint:**
```typescript
// POST /api/ai/chat
// Request
{
  message: string,              // User's question (max 4KB)
  conversationHistory?: Array<{ role: 'user' | 'assistant', content: string }>,
  policyContext?: string,       // Policy details for context (max 50KB)
  provider?: 'openai' | 'anthropic'  // Default: openai
}

// Response
{
  success: boolean,
  response: string,             // AI response
  provider: 'openai' | 'anthropic',
  usage: { input_tokens: number, output_tokens: number }
}
```

**Extraction Endpoint:**
```typescript
// POST /api/ai/extract/openai
// Request
{
  document: string,  // Extracted PDF text
  prompt: string     // Extraction prompt
}

// Response
{
  success: boolean,
  data: ExtractedPolicy,
  usage: { input_tokens: number, output_tokens: number }
}
```

---

## Database Schema

### Tables

| Table | Purpose |
|-------|---------|
| `users` | User profiles (extends auth.users) |
| `policies` | Extracted policy data |
| `policy_documents` | Uploaded PDF file references |
| `chat_conversations` | PolicyChat conversation history |
| `app_settings` | **NEW** Admin-configurable application settings |
| `settings_audit_log` | **NEW** Audit trail for settings changes |
| `user_preferences` | **NEW** Per-user preference settings |
| `market_benchmarks` | **NEW** Insurance market benchmark data by policy type |
| `insurance_providers` | **NEW** Turkish insurance provider directory |
| `regional_factors` | **NEW** Regional risk adjustment factors |
| `feature_flags` | **NEW** Feature flag configuration for gradual rollouts |
| `translation_locales` | **NEW** Supported locale definitions (tr, en, etc.) |
| `translation_keys` | **NEW** Translation key registry with namespaces |
| `translations` | **NEW** Actual translation strings per locale per key |
| `translation_audit_log` | **NEW** Audit trail for translation changes |
| `translation_metadata` | **NEW** Translation system metadata (versions, stats) |
| `user_segments` | **NEW** User-to-segment assignments for feature gating (e.g., `kasko_pilot_reviewers`) |
| `kasko_pilot_qa_records` | **NEW** 34-column QA records for KASKO pilot extraction metrics |

### Policy Table Schema
```sql
CREATE TABLE public.policies (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  policy_number TEXT NOT NULL,
  provider TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business')),
  type_tr TEXT NOT NULL,
  coverage NUMERIC NOT NULL,
  premium NUMERIC NOT NULL,
  deductible NUMERIC DEFAULT 0,
  start_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired', 'pending')),
  insured_person TEXT NOT NULL,
  location TEXT,
  document_type TEXT DEFAULT 'policy',
  upload_date DATE DEFAULT CURRENT_DATE,
  logo TEXT,
  raw_data JSONB,  -- Stores AI extraction results, coverages, exclusions
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Migrations
Located in `supabase/migrations/`:
- `001_initial_schema.sql` - Base tables and indexes
- `002_storage_policies.sql` - Storage bucket RLS
- `003_security_fixes.sql` - Security hardening, handle_new_user trigger
- `004_chat_conversations.sql` - Chat history storage
- `005_admin_tables.sql` - Admin authentication tables (admin_users, admin_sessions, security_events, audit_logs, prompt_templates, prompt_versions)
- `006_seed_prompts.sql` - Seeds 16 AI prompts (extraction, chat, OCR, analysis)
- `012_configuration_system.sql` - **NEW** Configuration system tables (app_settings, user_preferences, market_benchmarks, insurance_providers, regional_factors, feature_flags)
- `013_seed_configuration_defaults.sql` - **NEW** Seeds all hardcoded values as database defaults
- `014_settings_webhooks.sql` - **NEW** Webhook configuration tables
- `015_config_drift_baselines.sql` - **NEW** Drift baseline snapshot tables
- `017_translation_system.sql` - **NEW** Database-driven i18n (5 tables: locales, keys, translations, audit, metadata)
- `018_seed_translations.sql` - **NEW** Seeds 685+ translation keys × 2 languages
- `019_seed_coverage_insight_translations.sql` - **NEW** Coverage names + AI insight translations

### Row Level Security (RLS)
```sql
-- Users can only access their own policies
CREATE POLICY "Users can view their own policies"
  ON public.policies FOR SELECT
  USING (auth.uid() = user_id);
```

---

## Insurance Knowledge Database

### Location: `src/data/`

The app includes a comprehensive Turkish insurance knowledge base:

| File | Contents | Lines |
|------|----------|-------|
| `regulations.ts` | Laws, general conditions (genel şartlar), clauses (klozlar) | 700+ |
| `insurance-lines.ts` | Official TSB/SEDDK branch classifications | 650+ |
| `coverage-limits.ts` | Official 2025-2026 coverage limits | 650+ |
| `sample-policies.ts` | Sample policies for testing | 150+ |

### Regulation Types (`src/data/regulations.ts`)
```typescript
type RegulationType =
  | 'law'              // Kanun
  | 'regulation'       // Yönetmelik
  | 'general_condition' // Genel Şartlar
  | 'clause'           // Kloz
  | 'tariff'           // Tarife
  | 'circular'         // Genelge
  | 'communique'       // Tebliğ
  | 'guideline'        // Rehber
```

### Insurance Branch Codes (`src/data/insurance-lines.ts`)
```typescript
// Hayat Dışı (Non-Life) Branch Codes
type InsuranceBranchCode =
  | 'kara_araclari'           // Kasko (Motor Own Damage)
  | 'kara_araclari_sorumluluk' // Traffic (Motor Liability)
  | 'yangin_dogal_afet'       // Fire & Natural Disasters
  | 'genel_zararlar'          // General Damages
  | 'kaza'                    // Accident
  | 'saglik'                  // Health
  | 'deniz_araclari'          // Marine Hull
  | 'hava_araclari'           // Aviation
  | 'nakliyat'                // Cargo/Transportation
  | 'genel_sorumluluk'        // General Liability
  | 'kredi'                   // Credit
  | 'hukuksal_koruma'         // Legal Protection
  | 'destek'                  // Assistance
  // ... and more
```

### Official Coverage Limits 2025 (`src/data/coverage-limits.ts`)

**Traffic Insurance (ZMSS) Limits:**
| Coverage Type | Per Person | Per Accident | Per Vehicle |
|--------------|------------|--------------|-------------|
| Bodily Injury | ₺2,700,000 | ₺13,500,000 | - |
| Material Damage | - | ₺600,000 | ₺300,000 |

**Source**: SEDDK official tariffs (updated annually)

---

## Market Benchmark Data

### Location: `src/data/market-data/`

| File | Purpose |
|------|---------|
| `benchmarks.ts` | Coverage benchmarks by policy type |
| `providers.ts` | Turkish insurer data (market share, ratings) |

### Major Turkish Insurance Providers
```typescript
// From src/data/market-data/providers.ts
const TOP_PROVIDERS = {
  allianz:   { marketShare: 12.8%, rating: 4.2, est: 1923 },
  axa:       { marketShare: 10.5%, rating: 4.0, est: 1893 },
  anadolu:   { marketShare: 9.2%,  rating: 4.3, est: 1925 },
  aksigorta: { marketShare: 8.7%,  rating: 4.1, est: 1960 },
  mapfre:    { marketShare: 7.4%,  rating: 3.9, est: 1992 },
  sompo:     { marketShare: 6.8%,  rating: 4.0, est: 1993 },
  zurich:    { marketShare: 5.2%,  rating: 4.1, est: 1986 },
  hdi:       { marketShare: 4.8%,  rating: 3.8, est: 2002 },
}
```

### Coverage Benchmarks (`src/data/market-data/benchmarks.ts`)

Each policy type has benchmark data for gap analysis:
```typescript
interface CoverageBenchmark {
  name: string           // e.g., "Collision Damage"
  nameTr: string         // e.g., "Çarpma/Çarpışma"
  typicalLimit: number   // e.g., 500000
  minLimit: number       // e.g., 100000
  maxLimit: number       // e.g., 2000000
  typicalDeductible: number
  inclusionRate: number  // % of policies that include this (e.g., 95)
}
```

**Kasko Coverage Benchmarks:**
| Coverage | Typical Limit | Inclusion Rate |
|----------|---------------|----------------|
| Collision | ₺500,000 | 100% |
| Theft | ₺500,000 | 100% |
| Natural Disasters | ₺500,000 | 95% |
| Fire | ₺500,000 | 100% |
| Glass Coverage | ₺25,000 | 85% |
| Personal Accident | ₺100,000 | 70% |

---

## Gap Detection System

### Architecture (`src/lib/gap-detection/`)

```
analyzeGapsComprehensive(policy, options)
├── analyzeCoverageGaps()    # Missing coverage types
├── analyzeLimitGaps()       # Under/over-insured limits
├── analyzeDeductibleGaps()  # Deductible analysis
├── analyzeExclusionGaps()   # Dangerous exclusions
├── analyzeTemporalGaps()    # Coverage period issues
└── analyzeComplianceGaps()  # Regulatory compliance
```

### Gap Analyzer Logic (`src/lib/market-data/gap-analyzer.ts`)

The gap analyzer compares policies against market benchmarks:

```typescript
function analyzeGaps(policy: AnalyzedPolicy, region: TurkishRegion): GapAnalysis {
  // 1. Find missing coverages (present in >50% of market policies)
  const missingCoverages = findMissingCoverages(policy.coverages, benchmark.commonCoverages)

  // 2. Find underinsured coverages (below market minimum)
  const underinsuredCoverages = findUnderinsuredCoverages(...)

  // 3. Find high deductibles (above market typical)
  const highDeductibles = findHighDeductibles(...)

  // 4. Analyze dangerous exclusions
  const exclusionWarnings = analyzeExclusions(policy.exclusions, policy.type)

  // 5. Calculate gap score (0-100, higher = more gaps)
  const gapScore = calculateGapScore(...)

  // 6. Estimate cost to close gaps
  const estimatedCostToClose = estimateGapClosureCost(...)

  return { missingCoverages, underinsuredCoverages, highDeductibles, exclusionWarnings, gapScore, estimatedCostToClose }
}
```

### Gap Importance Classification

Gaps are classified based on market inclusion rate:
- **Critical** (>=90% inclusion): Almost all policies have this - you need it
- **Recommended** (70-89% inclusion): Most policies have this - strongly suggested
- **Optional** (<70% inclusion): Nice to have but not essential

### Gap Severity Levels
```typescript
type GapSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
```

### Output Structure
```typescript
interface ComprehensiveGapAnalysis {
  gaps: DetectedGap[]
  gapCount: { total: number, critical: number, high: number, medium: number, low: number, info: number }
  overallScore: number  // 0-100
  financialSummary: { potentialExposure: number, recommendedIncrease: number }
  prioritizedGaps: PrioritizedGap[]
  recommendations: GapRecommendation[]
}
```

---

## Policy Evaluation Module

### Location: `src/lib/policy-evaluation/`

### Key Functions
```typescript
// Evaluate a single policy
const result = evaluatePolicy(policy, {
  weights: { premium: 20, coverage: 30, deductible: 15, compliance: 20, value: 15 }
})
// result.overallScore: 0-100
// result.grade: 'A' | 'B' | 'C' | 'D' | 'F'
// result.status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'

// Compare multiple policies
const comparison = comparePolicies([policy1, policy2, policy3])
// comparison.rankings: PolicyRanking[]
// comparison.recommendation: string
```

### Grading System
| Score | Grade | Status |
|-------|-------|--------|
| >= 90 | A | excellent |
| 75-89 | B | good |
| 60-74 | C | fair |
| 40-59 | D | poor |
| < 40 | F | critical |

### Actionable Recommendations (Updated Jan 14, 2026)

Recommendations now include specific amounts and actionable advice:

| Type | Before | After |
|------|--------|-------|
| Coverage | "Improve Coverage" | "Add Missing: Collision, Theft" with specific coverages |
| Deductible | "Reduce Deductible" | "Negotiate Lower Deductible (Currently ₺15,000)" with percentage |
| Premium | "Review Premium" | "Compare Alternative Quotes" with advice to get 3-5 quotes |
| Value | "Optimize Value" | "Improve Coverage-to-Premium Ratio" with 3 specific strategies |
| Positive | (none) | "Policy Well-Structured" when no issues found |

---

## Regional Benchmarking

### Turkish Regions (`src/lib/regional-benchmark/`)

| Region Code | Name | Risk Factor | Notes |
|-------------|------|-------------|-------|
| `marmara` | Marmara | 1.15x | Highest risk (İstanbul), earthquake zone 1 |
| `ege` | Aegean | 1.05x | Tourism, earthquake risk |
| `akdeniz` | Mediterranean | 1.08x | Tourism, flood risk |
| `ic_anadolu` | Central Anatolia | 0.95x | Lower risk, agricultural |
| `karadeniz` | Black Sea | 0.90x | Flood/landslide risk |
| `dogu_anadolu` | Eastern Anatolia | 0.85x | Lower premiums, rural |
| `guneydogu` | Southeastern | 0.88x | Mixed risk profile |

---

## Supported Policy Types

### Turkish Insurance Lines

| Type | Turkish Name | Database Value |
|------|--------------|----------------|
| Auto Comprehensive | Kasko | `kasko` |
| Traffic/MTPL | Trafik Sigortası | `traffic` |
| Property/Fire | Yangın | `home` |
| Earthquake | DASK | `dask` |
| Health | Sağlık | `health` |
| Life | Hayat | `life` |
| Business | İşyeri | `business` |

### Coverage Types & Categories (Added Jan 14, 2026)

Coverages now support special value types and categorization:

```typescript
// Coverage value types
interface Coverage {
  name: string
  nameTr: string
  limit: number
  deductible: number
  included: boolean
  isUnlimited?: boolean    // "Sınırsız" - display as unlimited
  isMarketValue?: boolean  // "Rayiç Değer" - market value coverage
  category?: CoverageCategory
  importance?: CoverageImportance
}

// Coverage categories for grouping
type CoverageCategory = 'main' | 'liability' | 'supplementary' | 'assistance' | 'legal' | 'other'

// Importance levels for visual styling
type CoverageImportance = 'critical' | 'standard' | 'minor'
```

**Display Logic:**
| Condition | Display |
|-----------|---------|
| `isUnlimited: true` | "Sınırsız" |
| `isMarketValue: true` | "Rayiç Değer" |
| `limit === 0 && included` | "Dahil" |
| `limit > 0` | Formatted currency |

**Kasko Implicit Coverages:**
These are automatically included in base kasko policies and should NOT be flagged as missing:
- Çarpma/Çarpışma (Collision)
- Hırsızlık (Theft)
- Yangın (Fire)
- Doğal Afetler (Natural Disasters)
- Sel/Su Baskını (Flood)

---

## Configuration System (Added Feb 2026)

### Overview

The configuration system provides a three-tier architecture for managing application settings:
1. **System Defaults** - Hardcoded values in `src/lib/config/types.ts`
2. **Admin Settings** - Database-stored overrides in `app_settings` table
3. **User Preferences** - Per-user customizations in `user_preferences` table

All 843+ previously hardcoded values are now configurable through the Admin Dashboard.

### Location: `src/lib/config/`

### Using the ConfigurationService

```typescript
import { configService, getAIConfig, isFeatureEnabled } from '@/lib/config'

// Get typed configuration
const aiConfig = await configService.getAIConfig()
console.log(aiConfig.openaiExtractionModel)  // 'gpt-4o'
console.log(aiConfig.temperature)            // 0.1

// Or use convenience functions
const config = await getAIConfig()

// Check feature flags
if (await isFeatureEnabled('new_evaluation_algorithm')) {
  // Use new algorithm
}

// Get individual values with defaults
const maxTokens = await configService.get('ai', 'max_tokens', 4096)

// Get regional risk factors
const factor = await configService.getRegionalFactor('marmara')  // 1.15

// Get market benchmarks
const benchmarks = await configService.getMarketBenchmarks('kasko')
```

### Configuration Categories

| Category | Purpose | Example Settings |
|----------|---------|------------------|
| `ai` | AI provider settings | Models, temperatures, timeouts |
| `evaluation` | Policy scoring | Weights, grade thresholds |
| `rate_limits` | API rate limiting | Requests per hour by endpoint |
| `ocr` | OCR processing | Confidence thresholds, density analysis |
| `fuzzy_matching` | Duplicate detection | Match thresholds, tolerances |
| `gap_analysis` | Gap detection | Importance weights, scoring |
| `ui` | User interface | Items per page, animation speed |
| `email` | Email settings | SMTP config, templates |
| `monitoring` | Extraction health alerts | Error rate thresholds, latency alerts, email config |
| `retention` | Data retention | Processing log and extraction metrics retention days |

### Typed Configuration Interfaces

```typescript
// AI Configuration
interface AIConfig {
  openaiExtractionModel: string      // 'gpt-4o'
  openaiBackupModel: string          // 'gpt-4o-mini'
  anthropicExtractionModel: string   // 'claude-sonnet-4-20250514'
  anthropicBackupModel: string       // 'claude-3-5-haiku-latest'
  maxTokens: number                  // 4096
  temperature: number                // 0.1
  chatTemperature: number            // 0.7
  minConfidence: number              // 0.7
  extractionTimeoutMs: number        // 90000
  preferredProvider: 'auto' | 'openai' | 'anthropic'
  enableFallback: boolean            // true
  consensusEnabled: boolean          // true
  consensusAgreementThreshold: number // 0.8
  consensusFields: string[]          // ['policyNumber', 'provider', ...]
}

// Evaluation Configuration
interface EvaluationConfig {
  weightPremium: number      // 20
  weightCoverage: number     // 30
  weightDeductible: number   // 15
  weightCompliance: number   // 20
  weightValue: number        // 15
  gradeAThreshold: number    // 90
  gradeBThreshold: number    // 80
  gradeCThreshold: number    // 70
  gradeDThreshold: number    // 60
  // ... more settings
}
```

### Admin API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/settings/:category` | GET | Get all settings for a category |
| `/api/admin/settings/:category/:key` | PUT | Update a specific setting |
| `/api/admin/settings/:category/:key/history` | GET | View audit history |
| `/api/admin/settings/feature-flags` | GET | List all feature flags |
| `/api/admin/settings/feature-flags/:key` | PUT | Update feature flag |
| `/api/admin/settings/regional-factors` | GET | List regional factors |
| `/api/admin/settings/regional-factors/:region` | PUT | Update regional factor |
| `/api/admin/settings/providers` | GET | List insurance providers |
| `/api/admin/settings/benchmarks/:policyType` | GET | Get market benchmarks |
| `/api/admin/settings/export` | GET | Export all settings as JSON backup |
| `/api/admin/settings/import` | POST | Import settings from JSON (supports `?dryRun=true`) |
| `/api/admin/settings/performance` | GET | Get server-side config fetch metrics |
| `/api/admin/settings/performance` | POST | Submit client-side metrics for logging |

### Feature Flags

```typescript
// Check if a feature is enabled
if (await configService.isFeatureEnabled('use_db_config')) {
  // Use database configuration
}

// Get all feature flags
const flags = await configService.getFeatureFlags()
// [{ key: 'use_db_config', enabled: false, rolloutPercentage: 0 }, ...]
```

### Caching

The ConfigurationService includes in-memory caching with a 5-minute TTL:

```typescript
// Create service with custom cache settings
const service = ConfigurationService.getInstance({
  cacheTtlMs: 300000,  // 5 minutes (default)
  enableCache: true     // Enable caching (default)
})

// Invalidate cache manually
service.invalidateCache()         // All categories
service.invalidateCache('ai')     // Specific category
```

### Database Schema

The configuration system uses 7 tables:

| Table | Purpose |
|-------|---------|
| `app_settings` | Key-value settings with validation schemas |
| `settings_audit_log` | Automatic audit trail for all changes |
| `user_preferences` | Per-user preference overrides |
| `market_benchmarks` | Versioned market benchmark data |
| `insurance_providers` | Turkish insurance provider directory |
| `regional_factors` | Regional risk adjustment factors |
| `feature_flags` | Feature flag configuration |

All tables have Row Level Security (RLS) enabled and automatic `updated_at` triggers.

---

## Actuarial Engine (Added Feb 28, 2026)

### Overview

A self-contained, 4-layer actuarial evaluation module at `src/lib/actuarial-engine/` (4,916 lines across 17 files). Provides Monte Carlo simulation, TOPSIS multi-criteria ranking, compliance gating, and semantic exclusion analysis for Turkish insurance policies. Controlled by feature flag `actuarial_engine_enabled` (default: false). See [ADR-0003](docs/adr/0003-modular-actuarial-engine.md) for the architectural decision.

**Supported types**: kasko, traffic, dask, zas. **P4 (future)**: Extend to health, life, business policy types with type-specific compliance gates and scenario sets.

### Architecture

```
src/lib/actuarial-engine/
├── types.ts                       # 498 lines — All core interfaces
├── engine.ts                      # 320 lines — Main orchestrator
├── index.ts                       # 144 lines — Public API exports
├── config/
│   └── defaults.ts                # 229 lines — Turkish market default parameters
├── layer-a/                       # Semantic Analysis
│   ├── semantic-exclusions.ts     # 341 lines — Exclusion pattern matching
│   └── evidence-tracker.ts        # 227 lines — Evidence pointer validation
├── layer-b/                       # Compliance Gates
│   ├── compliance-gate.ts         # 235 lines — Gate orchestrator
│   ├── seddk-rules.ts             # 226 lines — SEDDK 2025/2026 traffic limits
│   ├── dask-rules.ts              # 314 lines — DASK/ZAS deductible rules
│   └── product-rules.ts           # 187 lines — "Tam Kasko" product validation
├── layer-c/                       # Monte Carlo EOOP
│   ├── monte-carlo.ts             # 356 lines — EOOP simulation loop
│   ├── scenario-library.ts        # 262 lines — Turkish risk scenarios
│   ├── loss-model.ts              # 170 lines — Lognormal/Pareto distributions
│   └── rng.ts                     # 69 lines — Mulberry32 seeded PRNG
├── layer-d/                       # TOPSIS & XAI
│   ├── topsis.ts                  # 255 lines — MCDA ranking algorithm
│   └── sensitivity.ts             # 298 lines — Weight sensitivity + XAI
├── adapter.ts                     # 183 lines — AnalyzedPolicy → ActuarialPolicyInput
├── actuarial-events.ts            # 98 lines — Pub/sub event bus for eval results
└── __tests__/
    ├── golden-regression.test.ts  # ~1200 lines — 40 deterministic tests
    ├── engine-timings.test.ts     # 218 lines — 8 LayerTimings tests
    ├── actuarial-events.test.ts   # 153 lines — 8 event bus tests
    ├── adapter.test.ts            # 441 lines — Adapter unit tests
    └── adapter-integration.test.ts # 290 lines — 18 end-to-end pipeline tests
```

| Layer | Purpose | Key Functions |
|-------|---------|---------------|
| **A — Semantic Analysis** | Exclusion pattern matching, evidence pointer validation | `analyzeExclusions()`, `validateEvidence()`, `quickReviewCheck()` |
| **B — Compliance Gates** | Hard pass/fail: SEDDK limits, DASK 2% deductible, product name validation | `executeComplianceGate()`, `getSEDDKLimitsForDate()`, `checkDASKCompliance()` |
| **C — Monte Carlo EOOP** | Stochastic loss simulation (EOOP = P + Σ(ρⱼ × Eⱼ(Lⱼ, Dⱼ, Cⱼ))) | `calculateEOOP()`, `getScenariosForPolicyType()`, `sampleLognormal()` |
| **D — TOPSIS & XAI** | Multi-criteria decision ranking, weight sensitivity analysis | `rankPolicies()`, `analyzeSensitivity()`, `generateXAISummary()` |

### Key Functions

```typescript
import { runFullEvaluation, evaluateAndRankPolicies } from '@/lib/actuarial-engine'

// Single policy: runs all 4 layers
const result = runFullEvaluation(policy, options?)
// result.eligible, result.eoop, result.complianceResult, result.needsReview

// Multi-policy: runs all 4 layers + TOPSIS ranking
const results = evaluateAndRankPolicies([policyA, policyB])
// results[0].ranking.closeness, results[0].ranking.rank
```

### Policy Types Supported

`ActuarialPolicyType = 'kasko' | 'traffic' | 'dask' | 'zas'`

### Monte Carlo Configuration

```typescript
const DEFAULT_MONTE_CARLO_CONFIG = {
  numSimulations: 10_000,
  seed: 42,
  confidenceInterval: 0.95,
}
// Tests use TEST_MONTE_CARLO_CONFIG with 1,000 simulations for speed
```

### Risk Scenarios (Turkish Market Defaults)

| Code | Label | Frequency (ρ) | Distribution | Typical Loss |
|------|-------|---------------|-------------|-------------|
| `SCN_PARTIAL_COLLISION` | Partial collision | 0.06 | Lognormal(9.2, 0.8) | ~₺15K |
| `SCN_TOTAL_LOSS` | Total loss | 0.015 | Lognormal(11.5, 0.6) | ~₺120K |
| `SCN_THEFT` | Vehicle theft | 0.008 | Lognormal(11.0, 0.7) | ~₺80K |
| `SCN_FLOOD` | Flood damage | 0.012 | Lognormal(10.0, 1.0) | ~₺30K |
| `SCN_EARTHQUAKE` | Earthquake | 0.005 | Pareto(2.5, 50K) | Catastrophic tail |
| `SCN_FIRE` | Fire damage | 0.003 | Lognormal(10.5, 1.2) | ~₺50K |

### Database

Migration `028_actuarial_engine_schema.sql` creates 5 tables:
- `policy_extractions` — Normalized extraction run metadata + JSONB
- `extraction_evidence` — Field-level evidence pointers (page, snippet, confidence)
- `actuarial_config_sets` / `actuarial_config_set_versions` — Versioned config containers
- `actuarial_evaluation_runs` — Ties policy → extraction → config snapshot
- `evaluation_results` — Full evaluation JSONB output

Feature flag `actuarial_engine_enabled` seeded as `false` in `feature_flags` table.

### Tests

40 golden regression tests in `__tests__/golden-regression.test.ts` using deterministic seed (42):
1. Kasko Basic — core perils only, NOT penalized for missing flood/EQ
2. Tam Kasko Mismatch — "Tam Kasko" but missing flood/EQ → blocked
3. Semantic Exclusion — flood included but underground water exclusion → drops score
4. Rayiç Ambiguity — rayicMethod = "unspecified" → contract quality penalty
5. Indemnity Quality — equivalent parts + insurer network → lower vs OEM/choice
6. Expired Policy — Layer B gate → eligible = false
7. Traffic 2026 — below SEDDK 2026 minimums → eligible = false
8. DASK/ZAS — deductible ≠ 2% → critical blocking
9. Deductible Adequacy — high deductible → higher EOOP
10. Premium Percentiles — lower premium → lower EOOP
11. Sensitivity Flip — weight perturbation → winner can change
12. Evidence Enforcement — missing EvidencePointer → needsReview = true

---

## Testing Strategy

### Test Organization
```
Unit Tests (Vitest):        *.test.ts alongside source files
Integration Tests:          src/__tests__/integration/
Performance Tests:          src/__tests__/performance/
E2E Tests (Playwright):     e2e/
Server Tests:               server/__tests__/
```

### Test Counts (as of March 4, 2026)
- **Total**: 15,813 tests across 336 test files (18 skipped)
- **Passing**: 100% — 0 failures. 68 pre-existing failures fixed in Mar 4 session (commit `e827025`).
- **Coverage**: ~91.67% statements, ~85.91% branches, ~88.77% functions, ~92.5% lines
- **Note**: 1 test file (`usePolicyComparison.test.ts`) occasionally reports a fork worker timeout under heavy load — this is a Vitest infrastructure issue, not a test failure. The test passes when run individually.

### Key Test Files
| File | Tests | Purpose |
|------|-------|---------|
| `src/lib/policy-utils.test.ts` | 45 | Duplicate detection, fuzzy matching |
| `src/components/PolicyChat.test.tsx` | 29 | Chat component |
| `src/components/PolicyDetailView.test.tsx` | 44 | Policy detail view |
| `src/__tests__/performance/performance.test.ts` | 30 | Performance metrics |
| `server/__tests__/chat-routes.test.ts` | 18 | Chat API |
| `src/lib/admin/__tests__/settings-validation.test.ts` | 62 | Settings validation utilities |
| `src/components/admin/tabs/settings/SettingsHistoryPanel.test.tsx` | 27 | Settings history UI |
| `src/components/admin/tabs/settings/SettingsExportImport.test.tsx` | 15 | Settings export/import UI |
| `src/components/admin/tabs/settings/ConfigPerformancePanel.test.tsx` | 11 | Config performance dashboard |
| `src/lib/config/__tests__/config-performance-monitor.test.ts` | 21 | Performance monitor core |
| `server/__tests__/settings-routes.test.ts` | 43 | Settings API (includes export/import + performance) |
| `server/__tests__/admin-auth.test.ts` | 65 | JWT tokens, bcrypt, authenticateAdmin, requireRole, requirePermission |
| `server/__tests__/email-routes.test.ts` | 71 | Unsubscribe tokens (HMAC-SHA256), all 7 email endpoints |
| `server/__tests__/cost-control.test.ts` | 58 | Cost calculation, budgets, alerts, usage tracking, middleware |
| `src/lib/free-trial.test.ts` | 84 | All 15 exported functions, localStorage, expiry, share URLs |
| `src/lib/ai/pdf-splitter.test.ts` | 25 | PDF splitting: chunking, page ranges, edge cases |
| `src/lib/ai/document-ocr.test.ts` | 16 | Document OCR: hash, config, extraction, errors |
| `server/__tests__/pdf-routes.test.ts` | 23 | PDF quality analysis, Turkish OCR fixes |
| `server/__tests__/error-classification.test.ts` | 53 | AI provider error classification |
| `server/__tests__/ai-ocr-coverage.test.ts` | 1567 | AI OCR route coverage (all branches) |
| `src/components/PolicyUpload-coverage.test.tsx` | 1314 | PolicyUpload branch coverage |
| `server/__tests__/cost-control-coverage.test.ts` | 946 | Cost control all branches |
| `server/__tests__/admin-content-coverage.test.ts` | 985 | Admin content routes |
| `src/lib/pdf-export/generator-coverage.test.ts` | 753 | PDF export generator |
| `src/lib/pipeline/ocr-confidence-coverage.test.ts` | 630 | OCR confidence scoring |
| `src/lib/security/audit-logger-coverage.test.ts` | 679 | Security audit logging |
| `src/lib/privacy/consent-manager-coverage.test.ts` | 530 | KVKK consent management |
| `src/components/PolicyDetailView-branches.test.tsx` | 172 | PolicyDetailView branch coverage (helpers, sub-components, main) |
| `src/components/medium-coverage-branches.test.tsx` | 123 | Multi-component branch coverage (EmailPrefs, GlobalNav, ScoreBreakdown, etc.) |
| `src/components/PolicyDashboard-branches.test.tsx` | 102 | PolicyDashboard branch coverage (sort, filter, stats, compare) |
| `src/lib/library-branches.test.tsx` | 67 | Library module branch coverage (PolicyContext, Consensus, Config, Cache) |
| `src/lib/actuarial-engine/__tests__/golden-regression.test.ts` | 40 | Actuarial engine: Monte Carlo, TOPSIS, compliance, exclusions, extended scenarios |
| `src/lib/actuarial-engine/__tests__/engine-timings.test.ts` | 8 | LayerTimings instrumentation on single/multi-policy evaluations |
| `src/components/admin/tabs/settings/EvidenceCoveragePanel.test.tsx` | 12 | Evidence coverage dashboard: rates, fields, review status, confidence |
| `src/__tests__/evaluation-scoring-sample-data.test.ts` | 63 | Policy evaluation scoring against sample data |
| `src/__tests__/extraction-output-quality.test.ts` | 38 | AI extraction output quality validation |
| `src/__tests__/sample-policy-output-evaluation.test.ts` | 61 | End-to-end sample policy output evaluation |
| `src/lib/actuarial-engine/__tests__/actuarial-events.test.ts` | 8 | Event bus: subscribe/unsubscribe, emit, error isolation |
| `src/lib/actuarial-engine/__tests__/adapter-integration.test.ts` | 18 | Adapter→engine pipeline: kasko/traffic/DASK, TOPSIS, edge cases |
| `server/__tests__/config-migration-validation.test.ts` | 49 | Migration 033 SQL↔TypeScript drift detection, new config getters (FX, Server, Webhooks, Cost, Monitoring, Retention) |
| `shared/__tests__/extraction-schema.test.ts` | 12 | Shared schema validation (structure, strict-mode compliance, required fields, currency, nameTr, validator edge cases) |

### Running Tests
```bash
# All tests
npm test

# Specific file
npm test -- --run src/lib/policy-utils.test.ts

# With coverage
npm run test:coverage

# E2E tests
npm run test:e2e
npm run test:e2e:fast  # Chromium only
```

---

## Code Conventions

### File Naming
- `components/PolicyCard.tsx` - PascalCase for components
- `lib/policy-utils.ts` - kebab-case for utilities
- `hooks/usePolicyUpload.ts` - camelCase with 'use' prefix
- `types/policy.ts` - lowercase for type files

### Component Structure
```tsx
// 1. Imports (external → internal → types)
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { Policy } from '@/types/policy'

// 2. Types (component-specific)
interface PolicyCardProps {
  policy: Policy
  onSelect?: (id: string) => void
}

// 3. Component (hooks → derived → handlers → render)
export function PolicyCard({ policy, onSelect }: PolicyCardProps) {
  const [expanded, setExpanded] = useState(false)
  const hasGaps = policy.gaps.length > 0
  const handleClick = () => onSelect?.(policy.id)

  return <div>...</div>
}
```

### TypeScript Patterns
```typescript
// Prefer interfaces for objects
interface Policy { id: string; type: PolicyType }

// Use type for unions
type PolicyType = 'home' | 'auto' | 'life' | 'health' | 'business'

// Avoid enums - use const objects with CHECK constraints in DB
const VALID_POLICY_TYPES = ['kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business'] as const
type PolicyType = typeof VALID_POLICY_TYPES[number]
```

### Tailwind Conventions
```tsx
<div className={cn(
  "flex flex-col gap-4",     // Layout
  "w-full max-w-2xl",        // Sizing
  "rounded-lg border",       // Appearance
  "hover:shadow-md",         // States
  isActive && "border-blue-500"  // Conditional
)}>
```

---

## UI Component Library

### Location: `src/components/ui/`

Base components built with Tailwind CSS, following shadcn/ui patterns:

| Component | File | Purpose |
|-----------|------|---------|
| `Button` | `button.tsx` | Primary action buttons with variants |
| `Card` | `card.tsx` | Content containers with header/footer |
| `Badge` | `badge.tsx` | Status indicators, tags |
| `Input` | `input.tsx` | Form inputs with validation states |
| `Progress` | `progress.tsx` | Progress bars for uploads, loading |
| `Loading` | `loading.tsx` | Spinner and skeleton loaders |
| `ErrorBoundary` | `error-boundary.tsx` | React error boundary with fallback UI |
| `ConfirmationDialog` | `confirmation-dialog.tsx` | Modal for destructive actions |

### Button Variants
```tsx
<Button variant="default">Primary</Button>
<Button variant="outline">Secondary</Button>
<Button variant="ghost">Tertiary</Button>
<Button variant="destructive">Delete</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
<Button disabled>Disabled</Button>
<Button loading>Loading...</Button>
```

### Card Usage
```tsx
<Card>
  <CardHeader>
    <CardTitle>Policy Details</CardTitle>
    <CardDescription>View your policy information</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
  <CardFooter>
    <Button>Save</Button>
  </CardFooter>
</Card>
```

---

## Custom Hooks

### Location: `src/hooks/`

| Hook | Purpose | Returns |
|------|---------|---------|
| `useBackendHealth` | Check backend server availability | `{ isHealthy, isLoading, error, retry }` |
| `useFileUpload` | Handle PDF upload with progress | `{ upload, progress, isUploading, error }` |
| `usePolicyEvaluation` | Evaluate policy against benchmarks | `{ evaluation, isLoading }` |
| `usePolicyComparison` | Compare multiple policies | `{ comparison, compare }` |
| `useRegionalBenchmark` | Get regional risk data | `{ benchmarks, region }` |
| `usePdfExport` | Export policy to PDF | `{ exportPdf, isExporting }` |
| `useCostTracking` | Track AI API costs | `{ costs, addCost }` |
| `useUserPreferences` | Three-tier config override | `{ preferences, updatePreference }` |
| `useDisplayCurrency` | FX-aware currency formatting | `{ displayCurrency, convert, formatConverted, formatConvertedCompact, isReady }` |
| `usePushNotifications` | Browser push notification management | `{ isSupported, permission, isSubscribed, subscribe, unsubscribe }` |
| `usePilotGateOptions` | Loads pilot feature flags + user segments for gate evaluation | `{ featureFlags, userSegments, userId, isLoading }` |

> **Removed (Feb 8, 2026)**: `useAnalytics`, `usePrivacy`, `useMarketData`, `useIndustryRisk`, `usePolicyTemplates` — zero production imports, functionality served by other modules (see Known Issue #75).

### Hook Pattern
```tsx
// Standard hook structure
export function useBackendHealth() {
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const checkHealth = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`${API_URL}/api/health`)
      setIsHealthy(response.ok)
    } catch (err) {
      setError(err as Error)
      setIsHealthy(false)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    checkHealth()
  }, [checkHealth])

  return { isHealthy, isLoading, error, retry: checkHealth }
}
```

---

## Utility Functions

### Location: `src/lib/utils.ts`

```typescript
import { cn, formatCurrency, formatDate, formatNumber } from '@/lib/utils'

// Class name merging (Tailwind + clsx)
cn("base-class", isActive && "active-class", className)
// → Merges classes, handles conflicts

// Locale-aware currency formatting (defaults to 'tr' for backward compat)
formatCurrency(15000)              // "₺15.000" (Turkish default)
formatCurrency(15000, 'TRY', 'en') // "₺15,000" (English locale)
formatCurrency(15000, 'USD', 'en') // "$15,000" (USD in English)

// Locale-aware date formatting
formatDate('2026-01-15')           // "15.01.2026" (Turkish default)
formatDate('2026-01-15', 'en')     // "1/15/2026" (English locale)

// Locale-aware number formatting
formatNumber(1500000)              // "1.500.000" (Turkish default)
formatNumber(1500000, 'en')        // "1,500,000" (English locale)

// Locale mapping (extensible for future locales)
// INTL_LOCALE_MAP: { tr: 'tr-TR', en: 'en-US', de: 'de-DE', fr: 'fr-FR' }
```

### Policy Utilities (`src/lib/policy-utils.ts`)
```typescript
import {
  fuzzyMatchOCR,
  normalizeForOCR,
  isPolicyIdentifierMatch,
  calculatePolicyDiff,
  levenshteinDistance,
} from '@/lib/policy-utils'

// OCR-tolerant string comparison
fuzzyMatchOCR('POL-001', 'P0L-OO1', 0.85) // true

// Normalize for comparison
normalizeForOCR('İstanbul') // 'istanbul'

// Check if policies are duplicates
isPolicyIdentifierMatch(policyA, policyB, true) // fuzzy mode

// Calculate differences
const diff = calculatePolicyDiff(oldPolicy, newPolicy)
// { significantChanges, minorChanges, overallSignificance }
```

---

## KVKK/GDPR Privacy Compliance

### Location: `src/lib/privacy/`

InsurAI implements Turkish KVKK (Kişisel Verilerin Korunması Kanunu) compliance:

### Consent Management
```typescript
import { hasConsent, recordConsent, checkRequiredConsents } from '@/lib/privacy'

// Check if user has given consent
if (hasConsent(userId, 'analytics')) {
  trackEvent('page_view')
}

// Record new consent
await recordConsent(userId, 'marketing', true)

// Check all required consents before proceeding
const { allRequired, missing } = checkRequiredConsents(userId)
if (!allRequired) {
  showConsentDialog(missing)
}
```

### Data Subject Rights
```typescript
import {
  requestDataAccess,
  requestDataDeletion,
  exportUserData,
} from '@/lib/privacy'

// User requests their data (KVKK Article 11)
const userData = await exportUserData(userId)

// User requests deletion (Right to be forgotten)
await requestDataDeletion(userId)
```

### Personal Data Categories
| Category | Examples | Sensitivity |
|----------|----------|-------------|
| `identity` | Name, TC Kimlik No | High |
| `contact` | Email, phone, address | Medium |
| `financial` | Premium amounts, coverage | High |
| `insurance` | Policy details, claims | High |
| `technical` | IP address, device info | Low |

### KVKK Compliance Checklist
- ✅ Explicit consent collection before data processing
- ✅ Data minimization (only collect what's needed)
- ✅ Purpose limitation (use data only for stated purpose)
- ✅ Data subject access requests (DSAR)
- ✅ Right to deletion
- ✅ Data portability (JSON export)
- ✅ Breach notification procedures
- ✅ Retention policies (auto-delete after period)

---

## Error Handling Patterns

### API Error Handling
```typescript
// Server-side (server/routes/ai.ts)
try {
  const result = await openai.chat.completions.create(...)
  res.json({ success: true, data: result })
} catch (error) {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        retryAfter: error.headers?.['retry-after']
      })
    }
  }
  // Log to Sentry
  captureException(error)
  res.status(500).json({ success: false, error: 'Internal server error' })
}
```

### React Error Boundary
```tsx
// Wrap routes with ErrorBoundary
<ErrorBoundary
  fallback={<ErrorFallback />}
  onError={(error, info) => captureException(error, { extra: info })}
>
  <Routes>
    <Route path="/dashboard" element={<Dashboard />} />
  </Routes>
</ErrorBoundary>
```

### Form Validation with Zod
```typescript
// Server validation (server/middleware/validation.ts)
const chatSchema = z.object({
  message: z.string().min(1).max(4096),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
  })).optional(),
  policyContext: z.string().max(51200).optional(),
  provider: z.enum(['openai', 'anthropic']).optional()
})

// Usage in route
app.post('/api/ai/chat', validateBody(chatSchema), async (req, res) => {
  // req.body is typed and validated
})
```

---

## Policy Scoring Algorithm

### Evaluation Weights (Default)
```typescript
const DEFAULT_WEIGHTS = {
  premium: 20,      // Cost efficiency
  coverage: 30,     // Coverage comprehensiveness
  deductible: 15,   // Out-of-pocket exposure
  compliance: 20,   // Regulatory compliance
  value: 15,        // Value for money ratio
}
```

### Score Calculation
```typescript
// From src/lib/policy-evaluation/evaluator.ts
function calculateScore(policy: Policy, benchmarks: Benchmarks): number {
  // 1. Coverage Score (0-100)
  const coverageScore = calculateCoverageScore(
    policy.coverages,
    benchmarks.typicalCoverages
  )

  // 2. Premium Score (0-100) - lower is better
  const premiumScore = calculatePremiumScore(
    policy.premium,
    benchmarks.typicalPremium,
    policy.coverage
  )

  // 3. Deductible Score (0-100) - lower deductible = higher score
  const deductibleScore = calculateDeductibleScore(
    policy.deductible,
    benchmarks.typicalDeductible
  )

  // 4. Compliance Score (0-100)
  const complianceScore = checkComplianceScore(policy, regulations)

  // 5. Value Score (coverage per premium unit)
  const valueScore = (policy.coverage / policy.premium) * normalizationFactor

  // Weighted average
  return (
    coverageScore * weights.coverage +
    premiumScore * weights.premium +
    deductibleScore * weights.deductible +
    complianceScore * weights.compliance +
    valueScore * weights.value
  ) / 100
}
```

### Grade Thresholds
```typescript
function getGrade(score: number): Grade {
  if (score >= 90) return 'A'  // Excellent
  if (score >= 75) return 'B'  // Good
  if (score >= 60) return 'C'  // Fair
  if (score >= 40) return 'D'  // Poor
  return 'F'                    // Critical
}
```

---

## Common Code Patterns

### Async Data Fetching
```tsx
// Pattern used throughout the app
function PolicyList() {
  const [policies, setPolicies] = useState<Policy[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const fetchPolicies = async () => {
      try {
        setIsLoading(true)
        const data = await getPolicies()
        setPolicies(data)
      } catch (err) {
        setError(err as Error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchPolicies()
  }, [])

  if (isLoading) return <Loading />
  if (error) return <ErrorMessage error={error} />
  return <PolicyGrid policies={policies} />
}
```

### Optimistic Updates
```tsx
// For better UX on mutations
const handleDelete = async (policyId: string) => {
  // Optimistic: remove from UI immediately
  setPolicies(prev => prev.filter(p => p.id !== policyId))

  try {
    await deletePolicy(policyId)
    toast.success('Policy deleted')
  } catch (error) {
    // Rollback on failure
    setPolicies(prev => [...prev, policy])
    toast.error('Failed to delete policy')
  }
}
```

### Context Provider Pattern
```tsx
// Used for PolicyContext, AuthContext
const PolicyContext = createContext<PolicyContextType | null>(null)

export function PolicyProvider({ children }: { children: ReactNode }) {
  const [policies, setPolicies] = useState<Policy[]>([])
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null)

  const value = useMemo(() => ({
    policies,
    selectedPolicy,
    addPolicy: (policy: Policy) => setPolicies(prev => [...prev, policy]),
    removePolicy: (id: string) => setPolicies(prev => prev.filter(p => p.id !== id)),
    selectPolicy: setSelectedPolicy,
  }), [policies, selectedPolicy])

  return (
    <PolicyContext.Provider value={value}>
      {children}
    </PolicyContext.Provider>
  )
}

export function usePolicies() {
  const context = useContext(PolicyContext)
  if (!context) throw new Error('usePolicies must be used within PolicyProvider')
  return context
}
```

### Debounced Search
```tsx
// For search inputs
function PolicySearch({ onSearch }: { onSearch: (query: string) => void }) {
  const [query, setQuery] = useState('')

  const debouncedSearch = useMemo(
    () => debounce((q: string) => onSearch(q), 300),
    [onSearch]
  )

  useEffect(() => {
    debouncedSearch(query)
    return () => debouncedSearch.cancel()
  }, [query, debouncedSearch])

  return <Input value={query} onChange={e => setQuery(e.target.value)} />
}
```

---

## Known Issues & Solutions

> **Full archive**: See [`docs/KNOWN_ISSUES_ARCHIVE.md`](docs/KNOWN_ISSUES_ARCHIVE.md) for all 178 historical entries with detailed solutions.

The following are the most operationally relevant issues. For anything not listed here, search the archive.

### Key Active Patterns

| # | Topic | Key Rule |
|---|-------|----------|
| 1 | **Vitest Background Promises** | Background DB calls steal `mockReturnValueOnce` — disable with `process.env.NODE_ENV !== 'test'` |
| 2 | **Infinite Hook Renders** | Extract mock arrays to variables before `renderHook()` — inline `[createMock()]` creates new refs each render |
| 21 | **Admin Sub-Route Mock Path** | Mock `'../routes/admin/shared.js'` NOT `'../../middleware/admin-auth.js'` — sub-routers import via barrel |
| 22 | **Railway Proxy Push** | Sandbox `git push` doesn't trigger Railway webhook — use `mcp__github__push_files` for deploy |
| 32 | **`.single()` → `.maybeSingle()`** | Use `.maybeSingle()` for queries that may return 0 rows (avoids HTTP 406 PGRST116) |
| 35 | **Benchmark Mock `dataDate`** | All benchmark mocks MUST include `dataDate` or freshness system treats data as stale |
| 36 | **Module-Level Mock for Draft** | Use `let mockIsDraft = false` captured in `vi.mock()` closure for per-test variation |
| 71 | **Extraction Fallback** | NEVER use `useFallback: true` in production — masks real errors with sample data |
| 94 | **Stale HTML Cache** | Hashed assets: `immutable`. HTML/SW: `no-cache, must-revalidate` |
| 97 | **Express Route Ordering** | Specific routes (`/history`) MUST come before `/:category` catch-all |
| 120 | **framer-motion Removed** | DO NOT re-add to AnimatedComponents.tsx or App.tsx (+38KB gzip penalty) |
| 123-124 | **i18n Lazy Split** | EN/TR translations in separate async chunks — import from `translations-en.ts`/`translations-tr.ts` |
| 140 | **Actuarial Engine** | 4-layer engine (Semantic→Compliance→MonteCarlo→TOPSIS), flag `actuarial_engine_enabled` = true |
| 169 | **Hardcoded→DB Config** | 29 backend constants now in `app_settings` — use `get*Config()` getters with 5-min cache |
| 176-177 | **Reviewer Mode** | Benchmark provenance gating, conditional deductibles, canonical `buildPolicyReviewerSummary()` |

## Turkish Market Considerations

### Mandatory Insurance Types
- **Trafik Sigortası** (MTPL): Required for all vehicles
- **DASK**: Required for all buildings (earthquake)
- **Professional Liability**: Required for certain professions

### Key Regulators
- **SEDDK** - Insurance regulator
- **TSB** - Insurance association
- **DASK** - Earthquake insurance authority
- **TARSİM** - Agricultural insurance pool

### Turkish Insurance Terms
| Turkish | English |
|---------|---------|
| Kasko | Comprehensive auto |
| Trafik Sigortası | Traffic/liability |
| Teminat | Coverage |
| Muafiyet | Deductible |
| Prim | Premium |
| Sigortalı | Insured |
| Poliçe | Policy |

### Currency Handling
```typescript
// Use the locale-aware formatCurrency from src/lib/utils.ts (NOT raw Intl.NumberFormat)
import { formatCurrency } from '@/lib/utils'

formatCurrency(15000.50, 'TRY', 'tr')  // "₺15.001" (Turkish)
formatCurrency(15000.50, 'TRY', 'en')  // "₺15,001" (English)
formatCurrency(15000.50, 'USD', 'en')  // "$15,001" (USD)

// In React components: get locale from useI18n() hook
const { locale } = useI18n()
formatCurrency(amount, 'TRY', locale)

// In non-React files (export.ts, templates.ts): accept locale as function parameter
export function myExportFn(data: Data, locale: string = 'tr') { ... }
```

---

## Security Considerations

### API Key Protection
- All AI API keys stored server-side only
- Never use `VITE_` prefix for sensitive keys
- Vite proxy handles routing in development

### Rate Limiting
- Chat: 60 requests/hour per IP
- Extraction: 20 requests/hour per IP
- OCR: 30 requests/hour per IP
- Health: 60 requests/minute per IP

### Security Headers (Helmet)
- CSP configured for PDF.js CDN and Supabase
- XSS protection enabled
- Frame options set
- Content sniffing protection

### Row Level Security
- All Supabase tables have RLS enabled
- Users can only access their own data
- `handle_new_user` trigger creates user profile on signup

---

## Performance Optimizations

### Bundle Optimization
- Lazy-loaded routes in `App.tsx`
- Bundle analysis: `npm run build:analyze`
- Tree shaking via Vite/Rollup

### PWA & Caching
- Service worker: `public/sw.js`
- Cache strategies: cache-first (static), network-first (API)
- PWA manifest for installability

### Config Fetch Performance Monitoring (Added Feb 6, 2026)
- In-memory rolling window tracker (1000 events, 1 hour)
- Latency percentiles: p50, p95, p99 for cache misses (DB fetches)
- Cache hit rate analysis with per-category breakdown
- TTL recommendation engine based on observed patterns
- Admin dashboard: Settings → Performance tab
- Both client-side and server-side monitors with API endpoints

### Lighthouse Results (Feb 19, 2026)
- **Performance**: 99/100 (FCP 0.8s, LCP 0.9s, TBT 0ms, CLS 0.005, SI 0.8s)
- **Accessibility**: 100/100
- **Best Practices**: 93/100 (test-environment artifacts — missing icons, localhost CSP, hidden source maps)
- **SEO**: 100/100
- **CLS Fix**: App shell skeleton in `index.html`, opacity-only animations, eager LandingPage import, SW controllerchange guard

### Production Lighthouse Verification (Feb 19, 2026)
Verified production Railway deployment (`insurai-production.up.railway.app`) with Lighthouse 12.6:
- **CLS**: 0 (perfect score 100) — **confirmed, better than local 0.005**
- **Accessibility**: 100/100 (fixed mobile hamburger `aria-label` gap)
- **Best Practices**: 93/100
- **SEO**: 100/100
- **Performance (mobile)**: 71/100 — limited by sandbox CPU/throttling; FCP 4.0s, LCP 4.3s, TBT 260ms
  - Production Railway performance is significantly better (envoy edge, CDN caching, real hardware)
  - Key: no code-level performance regressions; throttled FCP/LCP are test-environment artifacts
- **Fixes Applied**:
  - Added `compression` middleware to Express (gzip: 67-87% reduction on all text responses)
  - Added `aria-label` + `aria-expanded` to mobile hamburger menu button in Hero.tsx
- **Production Deployment Verified**:
  - HTML: `Cache-Control: no-cache, no-store, must-revalidate` ✅
  - Hashed assets: `Cache-Control: max-age=31536000, immutable` ✅
  - Service worker: `no-cache` ✅ (CACHE_VERSION v20)
  - App shell skeleton in `<div id="root">` ✅
  - HSTS header: `max-age=31536000; includeSubDomains` ✅
  - Opacity-only animations (no y/x CLS-causing transforms) ✅
  - LandingPage eagerly imported (no Suspense CLS) ✅

---

## Deployment

### Local Development
```bash
npm install
cp .env.example .env
# Configure .env with your keys
npm run dev:all
```

### GitHub Codespaces (IMPORTANT)

GitHub Codespaces requires special configuration because the browser accesses the app through forwarded URLs (`https://*.app.github.dev`), not `localhost`.

**Step 1: Kill any existing processes on ports**
```bash
fuser -k 4001/tcp
fuser -k 5173/tcp
```

**Step 2: Create `.env` with Codespaces URLs**
```bash
cat > .env << 'EOF'
# Frontend - use YOUR Codespaces forwarded URLs
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_PROXY_URL=https://YOUR-CODESPACE-NAME-4001.app.github.dev
- The Edge Function lives at `supabase/functions/notify-expiring/index.ts` and is scheduled via `pg_cron` (migration `20260223191019_setup_pg_cron.sql`)
# Backend - CORS must allow Codespaces frontend URL
API_PORT=4001
FRONTEND_URL=https://YOUR-CODESPACE-NAME-5173.app.github.dev
NODE_ENV=development

# AI Keys
OPENAI_API_KEY=sk-proj-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
GOOGLE_CLOUD_API_KEY=xxx
EOF
```

**Step 3: Find your Codespaces URL**
- Look at the PORTS tab in VS Code
- Your URL will be like: `literate-invention-x9j77xxg5jrhppvp`
- Replace `YOUR-CODESPACE-NAME` in .env with this value

**Step 4: Start servers**
```bash
npm run dev:all
```

**Step 5: Open in browser**
- Use the forwarded URL from PORTS tab for port 5173
- Example: `https://literate-invention-x9j77xxg5jrhppvp-5173.app.github.dev`

### Common Codespaces Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Backend Server Unavailable" | VITE_API_PROXY_URL uses localhost | Use Codespaces forwarded URL |
| CSP violations | Mixed content (HTTPS→HTTP) | Use HTTPS Codespaces URLs |
| CORS errors | FRONTEND_URL mismatch | Set to Codespaces frontend URL |
| Port already in use | Previous processes still running | Run `fuser -k PORT/tcp` |

### CSP Configuration for Codespaces

The `index.html` includes CSP rules for Codespaces:
```html
connect-src 'self' http://localhost:* https://*.app.github.dev wss://*.app.github.dev;
manifest-src 'self' https://*.app.github.dev;
```

### Railway Production Deployment (Current)

**Live URL**: https://insurai-production.up.railway.app

Railway hosts both frontend and backend as a single service. The Express server serves the built React app as static files.

**Configuration Files:**
- `railway.json` - Build and deploy configuration
- `nixpacks.toml` - Nixpacks provider/phase configuration
- `server/index.ts` - Serves static files in production

**railway.json:**
```json
{
  "build": {
    "builder": "NIXPACKS",
    "installCommand": "npm ci --include=dev",
    "buildCommand": "npm run build && npm run build:server"
  },
  "deploy": {
    "startCommand": "NODE_ENV=production node dist-server/server/index.js",
    "healthcheckPath": "/api/health",
    "healthcheckTimeout": 60,
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**nixpacks.toml:**
```toml
providers = ["node"]    # Disable Caddy/Chromium auto-detection

[phases.setup]
nixPkgs = ["...", "openssl"]  # Extend defaults, add openssl only

[phases.install]
cmds = ["npm ci --include=dev"]

[phases.build]
cmds = ["npm run build && npm run build:server"]

[start]
cmd = "NODE_ENV=production node dist-server/server/index.js"
```

**Environment Variables on Railway:**
```bash
# Server-side only (never exposed to browser)
OPENAI_API_KEY=sk-proj-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
GOOGLE_CLOUD_API_KEY=xxx
GCP_SERVICE_ACCOUNT_BASE64=...   # Base64-encoded service account JSON for Document AI
NODE_ENV=production

# Server-side Supabase (REQUIRED for admin auth)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# Admin JWT (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
ADMIN_JWT_SECRET=your-random-secret

# Push Notifications (Web Push / VAPID) — REQUIRED for push notifications to work
# Generate once: node -e "const wp=require('web-push'); console.log(JSON.stringify(wp.generateVAPIDKeys(),null,2))"
# Without these, push notifications silently degrade (log.warn, return 0) — no crash
VAPID_PUBLIC_KEY=...      # base64url ECDH public key from generateVAPIDKeys()
VAPID_PRIVATE_KEY=...     # base64url ECDH private key (keep secret)
VAPID_SUBJECT=mailto:contact@insurai.com

# Build-time (embedded in JS bundle)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX  # Optional: GA4 analytics

# Optional overrides
# LOG_LEVEL=info          # Default in production; set to 'warn' to reduce noise
# UNSUBSCRIBE_SECRET=xxx  # Falls back to ADMIN_JWT_SECRET if not set
# EXCHANGERATE_API_KEY=xxx  # Optional: exchangerate.host API key for higher rate limits

# NOT needed - auto-detected from window.location.origin
# VITE_API_PROXY_URL is automatically set in production
```

**Key Architecture Points:**
1. `VITE_*` variables are baked into the JS bundle at **build time**
2. API proxy URL auto-detects in production via `src/lib/env.ts`
3. Express serves `/api/*` routes AND static files from same origin
4. No CORS issues because frontend and backend share the same domain

**Deployment Steps:**
1. Push to the deployment branch
2. Railway auto-detects changes and rebuilds
3. Nixpacks runs `npm run build && npm run build:server`
4. Server starts with `node dist-server/server/index.js`

**Supabase Configuration Required:**
- Go to Supabase Dashboard → Authentication → URL Configuration
- Add `https://insurai-production.up.railway.app/**` to Redirect URLs
- This allows OAuth and magic link flows to work

**Common Railway Issues:**

| Issue | Cause | Solution |
|-------|-------|----------|
| "No AI service configured" | VITE_API_PROXY_URL not set at build | Auto-fixed: uses window.location.origin |
| PDF.js worker blocked | CSP missing CDN domains | Fixed in server/index.ts Helmet config |
| CORS errors | Railway domain not in allowlist | Fixed: `*.up.railway.app` in CORS config |
| Env vars with quotes | Railway UI adds quotes | Don't add manual quotes |
| Build not using env vars | VITE_* need rebuild | Trigger new deploy, not just restart |
| Admin login 500 error | SUPABASE_URL not set | Add SUPABASE_URL (not VITE_SUPABASE_URL) |
| Admin login 500 error | ADMIN_JWT_SECRET not set | Visit `/api/admin/diagnostics` to check config |
| crypto not defined | Missing import in ESM | Fixed in server/routes/admin.ts |

### Other Production Options
- **Frontend only**: Vercel or Netlify (need separate backend)
- **Backend only**: Render, Fly.io
- **Database**: Supabase (managed)
- See `docs/DEPLOYMENT_GUIDE.md` for alternative setups

---

## Common Gotchas (Quick Reference)

**Environment Variables:**
- `VITE_*` vars are baked at **build time** — need rebuild, not just restart
- API keys must NOT have `VITE_` prefix — server-side only
- Server needs `SUPABASE_URL` (not `VITE_SUPABASE_URL`) for runtime DB access
- Admin auth needs `ADMIN_JWT_SECRET` — use `/api/admin/diagnostics` to check config
- Always `import crypto from 'crypto'` explicitly in server ESM code

**Railway Deployment:**
- Sandbox `git push` does NOT trigger Railway webhook — use `mcp__github__push_files`
- `mcp__github__push_files` requires file content as parameter — files >~100KB can't be loaded into context. Workaround: commit locally, push branch, create PR via `mcp__github__create_pull_request`, merge via `mcp__github__merge_pull_request`
- `nixpacks.toml` with `providers = ["node"]` prevents Caddy/Chromium auto-detection
- `nixpacks.toml` and `railway.json` must stay in sync — nixpacks takes precedence
- API proxy auto-detects in production via `window.location.origin` (no `VITE_API_PROXY_URL` needed)

**Express Patterns:**
- Express 5: `app.get('*')` → `app.get(/.*/)`, `req.query` returns `unknown`
- express-rate-limit v8: Add `validate: { keyGeneratorIpFallback: false }` on custom keyGenerators
- Route ordering: specific routes (`/history`, `/benchmarks`) BEFORE `/:category` catch-all
- Admin routes split into 9 modules under `server/routes/admin/` — import from `index.ts`

**Admin API:**
- Always use `adminFetch()` from `@/lib/admin/api` — raw `fetch()` lacks auth headers
- Admin settings API wraps responses: `response.data.settings`, not `response.settings`
- Adding admin tab: update `AdminTabId` type + `TABS` array + `renderTabContent()` switch

**Testing Patterns:**
- `vi.hoisted()` for mock variables in `vi.mock()` factories (avoids TDZ errors)
- `vi.resetModules()` + dynamic `import()` for fresh module instances
- Vitest 4: Arrow function mocks can't be constructors — use `function()` syntax
- React 19: `useRef<T>()` → `useRef<T | undefined>(undefined)`
- Mock `@supabase/supabase-js` to prevent memory leaks (`.cursorrules` constraint)
- Tests importing `server/routes/ai.ts` must mock `extraction-alert-service.js` and `config-service.js`
- Tests for `/api/ai/diagnose` must `vi.stubGlobal('fetch', mockFetch)` — Google Vision calls `fetch()` directly
- `PolicyDashboard-branches.test.tsx` needs `localStorage.setItem('insurai_onboarding_completed', 'true')` in `beforeEach`
- `useDisplayCurrency` mock: `{ displayCurrency: 'TRY', convert: (v) => v, formatConverted: (v) => '₺' + v, isReady: true }`
- Timer flush for async upload loops: `afterEach(async () => { await act(async () => { await new Promise(r => setTimeout(r, 700)) }) })`

**i18n Architecture:**
- EN/TR translations are lazy-loaded async Vite chunks — import from `translations-en.ts` / `translations-tr.ts`
- `translations.ts` only exports `TranslationDictionary` interface + `COMMON_LOCALES`
- `translations-skeleton.ts` must stay all-empty-string (zero bundle cost) — NEVER add content
- Coverage `nameTr` resolved at extraction time via `src/lib/i18n/coverage-names.ts` (90+ entries)
- AI insights translated at extraction time → `aiInsightsTr` array on `AnalyzedPolicy`
- Test mock: `vi.mock('@/lib/i18n/i18n-context', () => ({ useTranslation: () => ({ t: EN_TRANSLATIONS, locale: 'en', isLoading: false }) }))`
- Data-field ternaries (`item.nameTr` vs `item.name`) are correct to keep — only migrate hardcoded string ternaries

**CLS & Bundle Prevention:**
- App shell skeleton in `index.html` → NO spinners (caused CLS 0.506)
- All animations use **opacity-only** CSS `@keyframes fadeIn` — no `y`/`x` transforms
- `LandingPage` eagerly imported — no `React.lazy()` for entry point
- framer-motion removed from main bundle — DO NOT re-add to `AnimatedComponents.tsx` or `App.tsx`
- `manualChunks`: only split independent libraries (pdfjs, pdf-lib) — catch-all causes circular deps

**Extraction Pipeline:**
- `createFallbackResult()` masks errors with sample data — NEVER use `useFallback: true` in production
- Server extraction budget: 125s total, primary 50s, fallback 45s — client fetch 135s > server budget
- DB query timeout: 8s for config/prompt services — falls back to defaults on timeout
- `extractViaProxy` propagates `errorCode`, `requestId`, `serverPhaseTiming` for diagnostics
- Abort-on-unmount removed from TryAnalysis — extraction runs to completion, result persisted
- Mobile `visibilitychange` listener auto-retries extraction on tab resume (up to 2 times)

**KASKO Pilot (Code-Complete, NOT Live):**
- 3 manual SQL steps required: apply migration 040, assign reviewers, enable feature flag
- Triple-guard gate: branch === 'kasko' AND flag enabled AND user in segment
- All failure modes default to pilot inactive (safe-off design)
- Migration 040 must include `name` column in feature_flags INSERT (NOT NULL constraint)

**Safety Governance:**
- Benchmark provenance gate: omit `provenance` from `MARKET_BENCHMARKS` to keep gate closed
- Benchmark freshness: `dataDate` required — aging (181-365d), stale (>365d) thresholds admin-configurable
- Draft policies: `isDraft` check required on all export/share/comparison paths
- EOOP precision: `'full'`/`'partial'`/`'suppressed'` — partial shows `~` prefix and limitation warning
- User-facing language: always "estimate" / "model-based" — never unqualified "best" or "recommended"

**Server Logger:**
- Export is `logger` not `log` — `import { logger } from '../lib/logger.js'`
- `logger.child()` takes string: `logger.child('module-name')`, not object
- Fire-and-forget `.catch(() => {})` patterns replaced with `.catch(err => log.warn(...))`
- Production log level: `info` — override with `LOG_LEVEL=warn` if too noisy

**Database:**
- `.single()` → `.maybeSingle()` for queries that may return 0 rows
- All `app_settings` changes via admin API — 29 hardcoded configs now DB-driven
- pg_cron retention: extraction metrics 30d, processing logs 90d — admin-configurable
- Nested `$$` in pg_cron DO blocks causes parse errors — use single-quoted SQL with escaped quotes

**Non-Negotiable Rules (from SESSION_HANDOFF):**
1. Legacy arrays (`coverages`, `exclusions`, `insights`) NEVER overwritten
2. Full test suite not run without justification (>10 min)
3. Pilot evidence from real live data only
4. Never add `VITE_` prefix to API keys
5. All admin endpoints must have auth middleware
6. Market conclusions gated by `BenchmarkConfidence`
7. Draft policies: TASLAK/DRAFT labeling on export/share
8. Benchmark test mocks MUST include `dataDate`
9. User-facing comparison: "estimate" / "model-based" qualifiers
10. `auditLogs` array MUST have `MAX_ENTRIES` cap after `.push()`
11. `scripts/_simple-date-parser.ts` `parseExtractedDate()` and production `policy-extractor.ts` are now BOTH correct (production fixed in commit `ed487ef`, Apr 12). The pilot script can't import from `src/lib/` due to Vite env crash (gotcha #16), so both implementations must stay in sync manually. If updating date parsing in production, verify the pilot script still produces identical output.
12. `persistToPoliciesTable()` in `scripts/pilot-batch-ingest.ts` MUST write `raw_data.coverages` as an array — enforced contract with `scripts/backfill-evaluation-scores.ts:24` which `return { skipReason: 'raw_data.coverages is not an array' }` if the shape breaks. Any future changes to the batch writer MUST preserve this shape.

## Core AI Pipeline
1. `UnifiedPolicyAnalyzer`: Main entry point class handling strategy selection and execution.
2. **Document Admission Gating**: (`evaluatePilotAdmission`) Evaluates raw document attributes (length, density, provider) *before* processing to prevent hallucination on garbage inputs and stratify pilot metric calculations.
3. `AnalyzerStrategy`: Interface defining `analyze(document, context) -> Promise<AnalyzedPolicy>`.
4. `BaseLLMStrategy`: Abstract implementation providing structure, error handling, and confidence recalculation heuristics.
5. `OpenAIStrategy` / `ClaudeStrategy`: Concrete implementations.
6. `MockAnalyzerStrategy` / `KaskoMockAnalyzerStrategy`: For offline testing, UI styling, and controlled pilot batch simulations.

**Migration 033 — Hardcoded Config to DB (Added Mar 12, 2026):**
- All 29 seeded values use `ON CONFLICT DO NOTHING` — safe to re-run without overwriting admin changes
- **Config getter pattern**: Each getter loads a full category from DB, maps snake_case keys to camelCase via `*_KEY_MAP`, merges over `DEFAULT_*_CONFIG`, caches 5 minutes. If DB unavailable, returns defaults silently.
- **JSON fields** (`supported_currencies`, `fallback_rates`, `token_pricing`): Stored as JSON strings in `app_settings.value`. Getters parse with `JSON.parse()` inside try-catch — malformed JSON falls back to default.
- **Boolean coercion**: `getMonitoringConfig()` coerces `enableEmailAlerts` via `=== 'true'` — any other string value (including `'false'`, `'1'`, `'yes'`) is treated as `false`.
- **Cache invalidation subtlety**: `invalidateCache('fx')` clears `config:fx` and `fx:*` prefix keys, but `getCategorySettings()` caches under `category:fx` which requires `invalidateCache()` (no argument) to fully clear all caches. When changing a config value and re-reading, call `invalidateCache()` without arguments.
- **Adding new config keys**: (1) Add to `DEFAULT_*_CONFIG` in `config-service.ts`, (2) add to `*_KEY_MAP`, (3) add INSERT to migration 033, (4) add to `types.ts` if client-side access needed, (5) update `config-migration-validation.test.ts` count assertions.
- **GenericSettingsPanel.tsx**: Reusable admin settings panel — renders form for any category registered in `SETTINGS_CATEGORIES`. When adding a new admin-configurable category, register it in the `SETTINGS_CATEGORIES` object in `SettingsTab.tsx`.
- **Test mock requirements**: 5 AI route test files needed mock updates for the new `AIConfig` timeout fields (`requestBudgetMs`, `primaryProviderTimeoutMs`, `fallbackProviderTimeoutMs`, `clientFetchTimeoutMs`, `trialExtractionTimeoutMs`). If you add new fields to `AIConfig`, update all AI route test mocks.

**Admin API Response Shape — `data.settings` Not `settings` (Gotcha Mar 13, 2026):**
- Admin settings API wraps responses under `data`: `{ success: true, data: { category: "fx", settings: [...] } }`
- When scripting against the admin API (e.g., curl smoke tests), extract settings from `response.data.settings`, NOT `response.settings`
- Similarly, admin login returns token at `response.data.token`, NOT `response.token`
- This applies to all admin settings endpoints (`GET /api/admin/settings/:category`, etc.)

**Production Admin API Smoke Test Pattern (Added Mar 13, 2026):**
- Production smoke tests can be run without browser UI by curling admin API endpoints directly
- Login: `POST /api/admin/auth/login` with `{"email":"...","password":"..."}` → extract `data.token`
- Read configs: `GET /api/admin/settings/:category` with `Authorization: Bearer <token>` → check `data.settings`
- Write round-trip: `PUT /api/admin/settings/:category/:key` with `{"value":"..."}` → read back → restore original
- Unauthenticated health checks: `/api/health`, `/api/fx/status`, `/api/admin/diagnostics`

**Global Fetch Mock Required for `/api/ai/diagnose` Tests (Fixed Mar 14, 2026):**
- The `/api/ai/diagnose` endpoint calls `fetch()` directly (NOT through supertest) to check Google Vision API availability
- Tests for this endpoint MUST include `vi.stubGlobal('fetch', mockFetch)` in `setupDefaultMocks()` — without it, real HTTP requests to `vision.googleapis.com` cause timeouts
- This is distinct from mocking Supabase/OpenAI/Anthropic which are module-level mocks via `vi.mock()`
- Pattern: `const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ responses: [{}] }) }); vi.stubGlobal('fetch', mockFetch)`
- If adding new tests that exercise code paths calling `fetch()` directly (not through supertest or axios), always stub global fetch
- **Cleanup note**: `vi.stubGlobal()` is NOT undone by `vi.clearAllMocks()` or `vi.restoreAllMocks()`. To clean up, call `vi.unstubAllGlobals()` in `afterEach`. In `ai-routes-extended.test.ts` this is safe without explicit cleanup because Vitest v4 uses `pool: 'forks'` (process isolation per file) and `setupDefaultMocks()` re-stubs on every `beforeEach`

**Admin Password Reset (Documented Mar 14, 2026):**
- If admin login returns "Invalid email or password", the password hash in the `admin_users` table doesn't match
- Default credentials from migration `005b`: `admin@insurai.com` / `secure-password` — may have been changed after initial setup
- **Diagnosis**: `SELECT id, email, status, role FROM admin_users;` in Supabase SQL Editor
- **Fix**: Generate bcrypt hash locally (`node -e "require('bcryptjs').hash('NewPwd', 12, (e,h) => console.log(h))"`) and `UPDATE admin_users SET password_hash = '<hash>' WHERE email = 'your@email.com';`
- The production DB may have a different schema than `005b_admin_tables.sql` (e.g., missing `display_name` column) — this does NOT affect login, which only needs `id`, `email`, `password_hash`, `role`, `status`, `permissions`
- There are two admin users in production: `prekic@gmail.com` (super_admin) and `admin@insurai.com` (super_admin)

**`[ConfidenceDiag]` Diagnostic Logs in Production (Added Mar 14, 2026):**
- Commit `fdedfea` added `console.warn('[ConfidenceDiag] ...')` checkpoints across 5 files in the extraction confidence pipeline
- These are intentional diagnostic logs, NOT errors — they trace how confidence scores flow from AI provider → server → client → UI
- **Server-side** (`server/routes/ai.ts`): Logs raw AI confidence JSON at all 3 extraction success paths
- **Client-side** (`policy-extractor.ts`, `openai.ts`, `claude.ts`): Logs confidence recalculation, cache hits, default fallbacks
- **UI-level** (`TryAnalysis.tsx`): Logs tier decision (LOW_CONFIDENCE_WARNING vs FULL_CONFIDENCE)
- These logs will be noisy in Railway — consider removing or gating behind `LOG_LEVEL=debug` once confidence investigation is complete
- To find them: search Railway logs for `[ConfidenceDiag]`

**AnalyzedPolicy Type — No `rawData` Property (Fixed Mar 14, 2026):**
- `AnalyzedPolicy` in `src/types/policy.ts` has `aiConfidence: number` directly — there is NO `rawData` property
- If you need confidence data, use `policy.aiConfidence` not `policy.rawData?.confidence`
- The `rawData` JSONB field exists on the `policies` DB table (`raw_data JSONB`) but is NOT on the TypeScript `AnalyzedPolicy` type used in React components

**KASKO Pilot Activation — 3 Manual Steps Required (Added Mar 16, 2026):**
- The KASKO pilot is **code-complete and activation-ready** but NOT live — requires 3 manual admin SQL steps
- **Step 1**: Apply `supabase/migrations/040_kasko_pilot_flag_and_segment.sql` to production Supabase (creates `user_segments` + `kasko_pilot_qa_records` tables, seeds disabled feature flag)
- **Step 2**: Assign pilot reviewers: `INSERT INTO user_segments (user_id, segment_name, assigned_by) VALUES ('UUID', 'kasko_pilot_reviewers', 'admin')`
- **Step 3**: Enable flag: `UPDATE feature_flags SET enabled = true, rollout_percentage = 100 WHERE key = 'kasko_ai_extraction_pilot'`
- All 3 steps are documented with verification queries in `SESSION_HANDOFF.md`
- **Safe-off design**: All 7 failure modes (migration not applied, flag missing, user not in segment, non-KASKO branch, no options passed, QA persist fails, Supabase unreachable) default to pilot **inactive**
- **Triple-guard gate**: `evaluateKaskoPilotGate()` requires branch === 'kasko' AND flag enabled AND user in segment — all 3 must pass
- `usePilotGateOptions.ts` loads flags + segments; degrades gracefully (empty `{}` / `[]`) if migration not applied or Supabase unreachable
- QA records persist to `kasko_pilot_qa_records` table via `persistPilotQARecord()` (fire-and-forget) — NOT to `/tmp` JSONL
- Rollback monitoring: `GET /api/admin/monitoring/pilot-rollback-status` checks 4 safety thresholds (zero-coverage >20%, phrase leak, major correction >50%, 3+ consecutive deductible misses)
- **Migration 040 schema fix**: Original INSERT omitted `name` column (NOT NULL in `feature_flags` table from migration 012). Fixed in commit `71a5113` — always use the current version of the migration file
- Full audit report: `docs/KASKO_PILOT_OPERATIONAL_AUDIT_2026_03_16.md`

**KASKO Pilot Cross-Realm Dynamic Import Gotcha (Added Mar 16, 2026):**
- `server/routes/admin/monitoring.ts:640` uses `await import('../../src/lib/analysis/kasko-pilot-gate.js' as string)` — a server-side Express route dynamically importing a client-side `src/lib/` module
- This works because both server and client use the same TypeScript compilation target, but could break if server and client builds diverge (e.g., separate ESM/CJS targets or different bundling strategies)
- The `as string` cast suppresses TypeScript path resolution errors
- If you see `Cannot find module` errors on the pilot-rollback-status endpoint, check that the server build output includes the `kasko-pilot-gate.js` file at the expected relative path

**KASKO Pilot RLS Policy — Misleading Comment (Added Mar 16, 2026):**
- Migration 040 comments say "admin-only access via service role" on both `kasko_pilot_qa_records` and `user_segments` tables
- **Actual RLS policy**: `USING (true) WITH CHECK (true)` — open to ALL roles including `anon`
- Both `persistPilotQARecord()` (in `policy-extractor.ts`) and `usePilotGateOptions` (hook) use the **anon key** (`VITE_SUPABASE_ANON_KEY`), which works ONLY because the policy is open
- **Risk**: If someone tightens the RLS based on the misleading comment (e.g., restricts to `service_role`), both `persistPilotQARecord()` and `usePilotGateOptions` will silently fail — pilot QA records won't persist and the gate will always return inactive
- To properly restrict: update RLS to allow `anon` SELECT on `user_segments` and `anon` INSERT on `kasko_pilot_qa_records`, then restrict other operations to `service_role`

**Stale Local `main` Mismatches `origin/main` After Sandbox Merges (Added Apr 9, 2026):**
- The Claude Code sandbox does **not** automatically fast-forward local `main` after a PR is merged on GitHub. This means `git diff main...HEAD --name-status` can return a phantom list of files that look "unmerged" but are already on `origin/main`.
- **Concrete example from Apr 9 audit**: local `main` was at `4eb31494...` (pre-PR #334) while `origin/main` was at `62e95cd...` (post-PR #334). `git diff main...HEAD` returned **34 files**; `git diff origin/main...HEAD` returned **1 file**. An agent trusting the first command would have re-documented all 34 files as if they were new work.
- **Always use `origin/main` as the truth source** when auditing branch scope: `git fetch origin main && git diff origin/main...HEAD --name-status`. Never trust local `main` without an explicit `git fetch` first.
- **Detection commands**: `git rev-parse main && git rev-parse origin/main` — if SHAs differ, local main is stale.
- This is also why `git log main..HEAD --oneline` can be misleading post-merge — same root cause.

**Vitest Bundler Resolver Ignores `tsconfig.rootDir` (Added Apr 9, 2026; updated Apr 9 — schema unified):**
- Vitest uses esbuild with bundler-style module resolution and **does not enforce** `tsconfig.rootDir` constraints. This means a server test file at `server/__tests__/foo.test.ts` can `import` from `../../src/lib/...` and pass at test time, even though `tsc -p server/tsconfig.json` would reject the same import with TS6059.
- **Note**: The extraction schema parity test that originally motivated this gotcha has been deleted — schema unification into `shared/` eliminates the need. However, the general principle still applies to any future cross-rootDir test imports.
- **Critical safety constraint**: only safe inside `server/__tests__/**` because `server/tsconfig.json` excludes that directory from the production build (`exclude: ["__tests__/**/*"]`). If anyone loosens that exclude, the cross-rootDir import will break the prod build with TS6059.

---

## CI/CD

### GitHub Actions (Updated Feb 20, 2026)
- **`staging.yml`** - Runs on staging/develop branches and PRs to main
  - `validate`: typecheck + lint + unit tests, coverage uploaded to Codecov
  - `e2e-tests`: Playwright Chromium against production build (`serve` + `wait-on`) — runs in **parallel** with `validate`
  - `build`: gates on **both** `validate` and `e2e-tests` passing, then deploys
- **`production.yml`** - Runs on main branch push
  - Same `validate` + `e2e-tests` in parallel, then `build` deploys to Railway
  - Post-deploy health check with Railway CLI rollback on failure
- Both E2E jobs use `E2E_BASE_URL=http://localhost:3000` — `playwright.config.ts` reads this and skips its own dev server block

### Playwright E2E in CI — Key Pattern
```yaml
- name: Run E2E tests against production build
  run: |
    npx serve dist -l 3000 &
    npx wait-on http://localhost:3000 --timeout 30000
    npx playwright test --project=chromium
  env:
    CI: true
    E2E_BASE_URL: http://localhost:3000
```
- `serve` and `wait-on` are **devDependencies** (not `npx` cold downloads) for deterministic CI
- Playwright report uploaded as artifact (`playwright-report/`, 7 days) on failure
- Optional GitHub Secrets for real Supabase in E2E build: `STAGING_SUPABASE_URL`, `STAGING_SUPABASE_ANON_KEY`, `PROD_SUPABASE_URL`, `PROD_SUPABASE_ANON_KEY` — placeholders used if not set

### Pre-commit Checks
```bash
npm run validate  # typecheck + lint + test
```

---

## Resources

- **SEDDK**: seddk.gov.tr (Insurance regulator)
- **TSB**: tsb.org.tr (Insurance association)
- **Insurance Law**: 5684
- **Supabase Docs**: supabase.com/docs
- **OpenAI API**: platform.openai.com/docs

---

## Quick Reference

```bash
# Start development
npm run dev:all

# Run all tests
npm test

# Full validation before commit
npm run validate

# Build for production
npm run build

# Analyze bundle
npm run build:analyze
```

**Ports**: Frontend=5173, Backend=4001
**Branch**: Develop on feature branches, merge to main via PR
**Tests**: 15,844+ tests, 0 failures (337 files, 18 skipped), ~91.67% statements, ~85.91% branches coverage
**Lighthouse**: Performance 99, Accessibility 100, Best Practices 93, SEO 100
**Bundle**: ~214 KB gzip main chunk + ~50 KB gzip Supabase chunk + ~12 KB gzip EN chunk + ~13.7 KB gzip TR chunk (all async)
**FX Currencies**: TRY, USD, EUR, GBP, CHF, SAR, AED (7 supported, exchangerate.host live API)
**Last Updated**: March 28, 2026 (CLAUDE.md trimmed 404KB→151KB, ESLint .mjs fix, isDraft DB persistence, admin benchmark thresholds, PWA icons, ComparePolicies tests)

**PDF OCR Glyph Splitting boundaries (Added Apr 12, 2026):**
- The OCR engine frequently outputs spaced letters for Turkish words (e.g. `P O L İ Ç E`). Previously, our regex capped merging at 10 characters due to a hardcoded `(...)?` structure, which corrupted words like `GENİŞLETİLMİŞ` (13 chars) and aggressively merged distinct spaced words together unless overridden by hardcoded exclusions (`commonSplits`).
- **The fix**: We now use a robust lookbehind/lookahead regex: `/(?<=[^A-ZÇĞİÖŞÜa-zçğıöşü]|^)[A-ZÇĞİÖŞÜ](?:[ \t][A-ZÇĞİÖŞÜ]){2,}(?=[^A-ZÇĞİÖŞÜa-zçğıöşü]|$)/g`. This strictly enforces **exactly one** space (`[ \t]`) between letters, natively preserving multiple spaces between distinct words and removing the need for a 10-char upper limit or hard-coded exclusions.

**Vitest Mocking Mismatches causing terminal noise (Added Apr 12, 2026):**
- Manually tracking and spying on `console.error` and `console.warn` across multiple test hooks leads to terminal noise and test reporter pollution, especially when mocking external network responses like `vi.mock('./config')`.
- **The fix**: Do not use inline `vi.spyOn` assertions. Instead, wrap them in scoped `beforeEach` and `afterEach` hooks per `describe` block. Also, ensure `mockRestore()` is correctly enforced in `afterEach` to block spy bleed-over into the next describe block test suite.

**Sparse OCR Fallback (Added Apr 25, 2026):**
- **Gotcha #110**: When using `pdf-parse`, scanned or image-based PDFs will often parse successfully but return very sparse text (e.g., < 100 characters). This triggers silent failures in downstream extraction logic.
- **The fix**: Implement a fallback gate (e.g., `if (recovered.length < 100)`) to dynamically route these sparse documents to `extractWithDocumentAI` instead, ensuring resilient data extraction on image-heavy PDFs.

**Node.js Script Execution Polyfill (Added Apr 25, 2026):**
- **Gotcha #111**: When executing backend scripts (e.g., `ts-node` or `tsx`) that import files originally designed for Vite (`import.meta.env`), the script will crash because `import.meta.env` is `undefined` outside of a Vite context.
- **The fix**: Inject a polyfill at the top of shared environment/config files (like `env.ts`) that maps `process.env` to `import.meta.env` when `typeof process !== 'undefined'`. Use `env.config` uniformly instead of accessing `import.meta.env` directly.
