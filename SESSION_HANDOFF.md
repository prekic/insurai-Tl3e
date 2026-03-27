# Session Handoff — March 27, 2026

## Branch

`claude/load-project-context-nqrry`

## What Was Done This Session

### 1. Migrations Applied to Production Supabase
- **Migration 040** (`040_kasko_pilot_flag_and_segment.sql`): Applied successfully. Creates `user_segments` table, `kasko_pilot_qa_records` table (34 columns), and seeds `kasko_ai_extraction_pilot` feature flag. Note: RLS policy "Service role manages segments" already existed from a previous partial run — resolved with `DROP POLICY IF EXISTS` + `CREATE POLICY`.
- **Migration 041** (`041_supabase_linter_security_fixes.sql`): Applied successfully. Recreates cron monitoring views as `SECURITY INVOKER`, enables RLS on 15+ admin/system tables, creates `service_role`-only policies.

### 2. KASKO Pilot Activated
- Feature flag `kasko_ai_extraction_pilot` enabled (`enabled=true`, `rollout_percentage=100`)
- `prekic@gmail.com` (UUID: `5c887095-61bd-488b-933f-f41786a3d527`) assigned to `kasko_pilot_reviewers` segment (was already assigned from Mar 18)
- `testadmin@insur.ai` (UUID: `c470bf79-db83-497f-a1de-da05e80e54e5`) assigned to `kasko_pilot_reviewers` segment (new, Mar 27)

### 3. Live Artifacts Collected
Uploaded real KASKO PDF (`eriş ambalaj 34 rz 9511 kasko pol.pdf`, 16 pages) as `prekic@gmail.com`.

**Extraction Results:**
- Provider: Anthropic (via unified proxy)
- OCR: Document AI (split 16 pages into 2 chunks: 1-10 + 11-16, 60,571 chars)
- Extraction time: ~53s total (Document AI: 29s + Anthropic: 53s server)
- Confidence: 0.9625 (policyNumber: 1.0, provider: 1.0, dates: 1.0, premium: 1.0, coverages: 0.85)

**Extracted Policy:**
- Policy #1680600025, Anadolu Sigorta, Kasko
- Insured: ERİŞ AMBALAJ SANAYİ VE TİCARET LİMİTED ŞİRKETİ
- Coverage: Vehicle Market Value, 9 coverages extracted
- Premium: TRY 31,140
- Period: 12/28/2025 → 12/28/2026
- Score: 80/100 (Grade B - Good)

**Pilot Gate Confirmation:**
- Admission: `pilot_eligible_clean` — "Document meets all criteria for clean admission"
- DRAFT banner visible: `⚠️ TASLAK — İnsan İncelemesi Gerekli / DRAFT — Requires Human Review`
- QA record persisted: `[PilotQA] QA record persisted for document: 3be474f1-45fc-4625-89f1-40a7fd2a9064`

**QA Record Evidence (from `kasko_pilot_qa_records`):**

| Field | Value |
|-------|-------|
| admission_status | `pilot_eligible_clean` |
| extraction_success | `true` |
| confidence_score | `0.9625` |
| phrase_clean | `true` |
| coverage_count_extracted | `9` |
| display_mode | `unknown` (see issues below) |

**Rollback Safety Thresholds (22 total records):**

| Threshold | Count | Limit |
|-----------|-------|-------|
| zero_coverage | **0** | >20% triggers rollback |
| major_correction | **0** | >50% triggers rollback |
| phrase_leak | **0** | Any triggers rollback |
| deductible_miss | **0** | 3+ consecutive triggers rollback |

**Verdict: ALL CLEAR — zero safety violations across 22 QA records.**

## Non-Critical Issues Observed

1. **Processing log PATCH 404** — `PATCH /api/ai/processing-log/:id` returns 404 repeatedly after initial CREATE succeeds. The `document_processing_logs` table likely has a primary key mismatch with what the client sends. Non-blocking — pilot QA records persist via separate path.

2. **`user_preferences` 406 error** — `GET /rest/v1/user_preferences?...category=eq.email` returns 406. Likely missing `Accept` header or schema mismatch. Pre-existing, non-pilot.

3. **Missing PWA icons** — `vite.svg` and `icons/icon-144x144.png` return 404. Cosmetic only.

4. **`display_mode` always "unknown"** — All 22 QA records have `display_mode: 'unknown'` instead of expected `'full'` or `'restricted'`. The pilot gate code path isn't populating this field from `review-thresholds.ts`. Low priority fix.

5. **Duplicate GoTrueClient warning** — "Multiple GoTrueClient instances detected in the same browser context." Occurs during pilot QA persistence which creates a new Supabase client. Non-blocking.

## Status

### Complete
- Migrations 040 + 041 applied to production
- KASKO pilot activated (flag + 2 reviewers)
- Live extraction successful with all pilot features working
- QA records persisting correctly
- DRAFT banner displaying
- Rollback thresholds all zero — pilot is healthy

### Ready for Next Session
- **Phase 8L evaluation** — 22 QA records with real data exist; evaluate live safety + quality metrics
- **Processing log 404 fix** — investigate `PATCH /api/ai/processing-log/:id` route mismatch
- **QA `display_mode` fix** — wire display mode from review-thresholds into QA record persistence
- **`user_preferences` 406** — investigate Accept header / schema issue

## Non-Negotiable Rules (carry forward)

1. Legacy arrays (`coverages`, `exclusions`, `insights`) are NEVER overwritten
2. Header hydration touches ONLY: `insured_person`, `start_date`, `expiry_date`
3. Full test suite not run without justification (>10 min)
4. Pilot evidence must be from real live data only
5. Never add `VITE_` prefix to API keys
6. `auditLogs` array MUST have `MAX_ENTRIES` cap after every `.push()` call
7. All admin endpoints under `/api/admin/` that aren't auth-related MUST have `authenticateAdmin` or `requireSuperAdmin()` middleware
8. Segment names must be in `VALID_SEGMENT_NAMES` allowlist

## Session-Specific Gotchas

1. **Railway Sandbox Proxy Push**: `git push` via Claude Code sandbox goes through `127.0.0.1` local proxy. This successfully pushes to GitHub but does NOT trigger Railway's GitHub webhook. To trigger Railway auto-deploy, use `mcp__github__push_files` which creates a real GitHub commit event.

2. **Migration 040 RLS Policy Conflict**: If migration 040 was partially applied before, the RLS policy "Service role manages segments" already exists. Fix: `DROP POLICY IF EXISTS "Service role manages segments" ON public.user_segments;` before CREATE POLICY.

3. **Admin Sub-Route Test Mock Path**: Tests for admin sub-routers must mock `'../routes/admin/shared.js'` — NOT `'../../middleware/admin-auth.js'`.
