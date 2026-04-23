# Session Handoff — April 23, 2026 (D-Grade Inflation Fix, 70-Policy Ingestion & Actuarial Calibration)

> **Session type**: Bug fix + data remediation + calibration. Resolved systemic D-grade inflation in the evaluator, ingested 70 policies, calibrated actuarial grade thresholds from real data.

## 🎯 Immediate Next Steps for the Next Agent

### Priority 1: Merge PR #362
- **Branch**: `insuraigemini20260423` → `main`
- **PR**: [`fix(evaluator): resolve D-grade inflation and harden extraction robustness`](https://github.com/prekic/insurai/pull/362)
- **Status**: Ready to merge. Contains all evaluator fixes (4 commits).
- **Action**: Review and merge.

### Priority 2: Fix Pre-Existing Test Failure
- **File**: `src/lib/ai/pdf-parser.test.ts`
- **Issue**: Length threshold assertion mismatch (unrelated to evaluator changes)
- **Impact**: Does not block production but should be fixed before next major PR

### Priority 3: Resume UI Decomposition
- **File**: `src/components/PolicyDetailView.tsx` (originally 2,881 lines)
- **Status**: Partially extracted into `src/components/PolicyDetailView/` (MarketComparisonCard, PolicyOverviewCard, SidebarStatusCard, DesktopInsightsCard)
- **Action**: Continue decomposing remaining monolithic sections

### Priority 4: Phase E Production Monitoring
- Grade thresholds are now calibrated: A ≥ 89, B ≥ 85, C ≥ 39, D ≥ 2
- Monitor for threshold drift as new policy batches enter
- Thresholds stored in `app_settings[evaluation/grade_*_threshold]`, 5-min TTL cache

## Current State

**Branch**: `insuraigemini20260423` (5 commits ahead of `main`)
**Working tree**: Clean (only untracked PDFs in `policies/` + utility `scripts/count-policies.ts`)
**Database**: 70 policies from 10 unique providers
**Grade thresholds**: Calibrated from 64-policy real-data sample
**PR**: #362 open, targeting `main`

### Commits on this branch:
```
2da7479 fix(evaluator): resolve D-grade inflation from isIncluded + benchmark cap
7aa5c36 fix: guard NaN in value evaluator + add 16 crash-resistance edge-case tests
436dc67 fix: resolve 169 test failures and harden all toLocaleString calls
252da85 fix(evaluator): guard toLocaleString against undefined coverage limits
9028600 refactor(ui): decompose PolicyDetailView into modular subcomponents
```

## What This Session Produced

### 1. Evaluator D-Grade Inflation Fix
- **Root cause**: `included: undefined` was treated as `false`, causing ~21 policies to have all coverages excluded → zero coverage score → D/F grade
- **Fix**: Added `isIncluded(coverage)` helper that treats `undefined` as `true` (industry standard)
- **Files**: `src/lib/policy-evaluation/evaluator.ts` (lines 44-64, 388-403)

### 2. Coverage Total Inference
- **Root cause**: Policies with valid per-coverage limits but missing top-level `policy.coverage` scored as zero
- **Fix**: Added `inferTotalCoverage(policy)` that sums individual coverage limits as fallback
- **Files**: `src/lib/policy-evaluation/evaluator.ts` (lines 44-64)

### 3. Untrusted Benchmark Cap Relaxation
- **Change**: Softened from hard 60-point cap to 85 to prevent double-penalization
- **Rationale**: Policies already self-correcting via `inferTotalCoverage()` were being capped again
- **Files**: `src/lib/policy-evaluation/evaluator.ts` (line 1849)

### 4. Crash-Resistance Hardening
- Guarded `toLocaleString` calls against `undefined` coverage limits (4 sites)
- Guarded `NaN` propagation in value evaluator
- Added division-by-zero protection
- 16 new edge-case tests in `evaluator-edge-cases.test.ts`

### 5. Data Integrity
- Cleaned ~7 duplicate "UNKNOWN" provider entries from Supabase
- Established pristine 19-policy baseline before bulk ingestion

### 6. Batch Ingestion
- Ingested 51 new ERDEMİR/Ereğli KASKO policies via `pilot-batch-ingest.ts`
- All AXA Sigorta PDFs with font encoding corruption successfully handled by Document AI OCR fallback
- Final database count: **70 policies, 10 unique providers**

### 7. Grade Threshold Calibration
- Ran `calibrate-grade-thresholds.ts --apply` on 64-policy sample
- New thresholds: A ≥ 89, B ≥ 85, C ≥ 39, D ≥ 2, F < 2
- Previous thresholds: A ≥ 93, B ≥ 85, C ≥ 60, D ≥ 60

## Environment / Configuration

| Variable | Value | Notes |
|----------|-------|-------|
| `PILOT_REVIEWER_USER_ID` | `5c887095-61bd-488b-933f-f41786a3d527` | In `.env` |
| `SUPABASE_URL` | Set in `.env` | `exykhfulkbwzatpesruv.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Set in `.env` | Required for batch scripts |
| Grade A threshold | 89 | `app_settings[evaluation/grade_a_threshold]` |
| Grade B threshold | 85 | `app_settings[evaluation/grade_b_threshold]` |
| Grade C threshold | 39 | `app_settings[evaluation/grade_c_threshold]` |
| Grade D threshold | 2 | `app_settings[evaluation/grade_d_threshold]` |

## Discovered Quirks & Issues

1. **`NEXT_PUBLIC_SUPABASE_URL` vs `SUPABASE_URL`**: The `.env` file uses `SUPABASE_URL` (not `NEXT_PUBLIC_SUPABASE_URL`). Standalone scripts must reference `process.env.SUPABASE_URL`.
2. **Top-level `await` in `tsx -e`**: The `tsx` CLI does not support top-level await in eval mode. Wrap in `async function main() {} main();` pattern.
3. **AXA Sigorta font corruption**: All ERDEMİR KASKO AXA policies fail `pdfjs` extraction with garbled text. The pipeline correctly falls back to GCP Document AI OCR for these.

## Architecture Check

**No new technologies introduced.** No deployment strategy changes. The evaluator changes are internal algorithm fixes within the existing evaluation framework. No ADR required.

## Non-Negotiable Rules (Carry Forward)

1. Legacy arrays NEVER overwritten
2. Full test suite NEVER run without explicit user permission (>10 min)
3. Pilot evidence from real live data only
4. All new AI extraction routes MUST follow the `/api/ai/extract/:provider` pattern in `server/routes/ai/`
5. The use of `as unknown as` is a code smell. Ensure explicit typing and safe fallbacks instead.
6. Market conclusions gated by `BenchmarkConfidence`.
7. Extraction schema changes go in `shared/extraction-schema.ts` only.
8. Turkish regex patterns must handle Turkish İ (U+0130) via `[iİ]`.
9. `auditLogs` array MUST have `MAX_ENTRIES` cap after `.push()`.
10. `isIncluded()` treats `undefined` as included (industry standard).
11. Grade recalibrations require n ≥ 50 sample size.
