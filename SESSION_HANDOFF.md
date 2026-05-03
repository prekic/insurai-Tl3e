# Session Handoff — May 3, 2026 — Cost Controls + OCR Cache Operational (8 PRs, #456-#463)

> **Session type**: Continuation of May 2 Round-4 work — opened with Option-A unverified-gate relaxation (#456), pivoted to fixing the Output Stability gate after empirical proof that the May-2 PASS verdict was a false-positive (#457), shipped 4 cost controls including a server-side OCR cache (#461), then tracked down and fixed a `pdf-lib` non-determinism bug that was defeating the cache (#462). Cost burn projected to drop ~70-80% steady-state. Cache verified working in production: `total_rows=7, hit_rows=7` after two smoke runs.

---

## 🎯 Immediate Next Steps for the Next Agent

### Priority 1 — Restore production AI temperature (operator manual SQL)

**Status**: STILL BLOCKED on the same single SQL update from the May-2 handoff. Today's session never restored it.

```sql
UPDATE public.app_settings
SET value = '0.1', updated_at = NOW()
WHERE category = 'ai' AND key = 'temperature';
```

Run via Supabase SQL Editor. Cache TTL is 5 min (gotcha #159) — wait, or trigger a Railway redeploy to flush. Once done, this priority is closed.

### Priority 2 — Round 5 reviewer hand-off when they respond

**Status**: Round 4 closed end-to-end (May 2). Round 5 starts when the reviewer pushes back. The infrastructure is in place:

1. Re-upload `tests/fixtures/kasko/anadolu-volkswagen-tiguan.pdf` (new canonical fixture per PR #457 — same Eriş Ambalaj fleet policy the reviewer originally scored against).
2. Screenshot the panels: hero deductible, Critical Financial Risks, Excess Liability scenario card, exclusions, Ask Your Insurer, AI Insights, Discounts (with `previousInsurer` text), coverages list including Hatalı Akaryakıt, Anadolu Hizmet, AS+ Yetkili Servis Ağı.
3. Send change-log of all session-2 PRs (#456-#463) to the reviewer.
4. Whatever they push back on becomes Round 5.

### Priority 3 — Path-filter audit / smoke-kasko savings observation

**Status**: PR #461 added a `paths:` filter to `smoke-kasko.yml`. Watch the next ~10 PRs to confirm docs-only / unrelated-test PRs no longer fire smoke. Realistic skip rate: 30-50% of PRs.

### Priority 4 — Daily observability sunset (deferred from May 2)

**Status**: same as May 2 — `audit-observability-daily.yml` can be disabled once issue #419 has 7 consecutive green daily comments confirming `audit_judgements.cost_usd > 0`. Not urgent.

```bash
gh workflow disable audit-observability-daily.yml
```

---

## 📦 What Shipped This Session (8 PRs)

| # | Type | Topic |
|---|---|---|
| #456 | feat | Always allow share + download (Option A unverified-gate relaxation) |
| #457 | fix | Output Stability gate — fixture / shape / regex breadth (3 bugs) |
| #458 | docs | Correct May-2 Test B verdict — was false-positive |
| #459 | feat | Migration 058 — surface AS+ Yetkili Servis Ağı (BLOATED VERSION) |
| #460 | fix | Migration 059 rollback + 060 compact form |
| #461 | feat | Cost controls × 4 (path filter, stability cap, OCR cache, Haiku smoke) |
| #462 | fix | OCR cache key — source-file SHA + chunk index (pdf-lib non-determinism) |
| #463 | chore | smoke-kasko timeout 10 → 15 min |

The session arc was instructive: #459 → #460 was a same-session rollback when the bloated AS+ section caused token-budget overruns; #461 → #462 was a same-day cache-invalidation diagnosis where the cache populated but never hit because of `pdf-lib` non-determinism across processes.

---

## 🚨 Configuration State at Hand-Off

### Migrations applied to production Supabase
- ✅ Migration 058 (AS+ extraction, bloated form) — applied + later rolled back via 059
- ✅ Migration 059 (rollback of 058) — applied + verified
- ✅ Migration 060 (AS+ compact form) — applied + verified
- ✅ Migration 061 (`ocr_cache` table) — applied + verified (cache populated to 7 rows)
- ✅ `DELETE FROM public.ocr_cache;` — applied between PR #461 and #462 to clear stale rows

### `app_settings` state
- ⚠️ `ai.temperature` = `0` — STILL TEMPORARY from May 2 Test B. **Restore to `0.1`** (Priority 1 above).
- ✅ All other keys at standard defaults.

### Workflows enabled
- ✅ `smoke-kasko.yml` — every push to main MATCHING the new path filter (PR #461) + 15-min timeout (PR #463)
- ✅ `audit-judge-trends.yml` — Mondays 06:00 UTC
- ✅ `audit-observability-daily.yml` — daily 08:00 UTC (sunset candidate per Priority 4)
- ✅ `output-stability.yml` — manual `workflow_dispatch`, default 3 runs (was 5), default fixture `anadolu-volkswagen-tiguan.pdf` (was the Golf-aliased `anadolu-birlesik-kasko.pdf`)

### Required env vars — no changes this session
No new env vars introduced. The new `cacheKey` field on `/api/ai/ocr/document-ai` is a request-body addition, not a config addition.

---

## 🛠️ OCR Cache Operational Snapshot

After PR #462's cache-key fix landed and was verified end-to-end:

```
total_rows         = 7    ← one per unique chunk × 4 fixtures
hit_rows           = 7    ← every chunk hit on the 2nd smoke run
earliest           = 09:39:13   (Run 1 — cold, populated)
most_recent_hit    = 10:38:48   (Run 2 — warm, hit)
```

**Cost-projection**: smoke-kasko per push ~$0.40 → ~$0.04 (Haiku + cached OCR on warm cache). Path filter eliminates 30-50% of fires. `output-stability` per fire ~$0.61 → ~$0.32. Steady-state target: $0.50-1.00/day vs the May 3 measured $3-4.

---

## 🚧 Known Issues / Caveats

### `pdf-lib` is non-deterministic across Node processes — gotcha #162
`PDFDocument.save()` produces different bytes per process for the same source PDF (per-process date / object-ID randomness). This bit us via PR #461's OCR cache: 13 stale rows piled up, 0 hits, before PR #462 fixed the cache key to use `sha256(sourceFileBytes):chunkIdx/totalChunks` instead.

### Migration 058 prompt-bloat regression — gotcha #161
Adding a ~3KB AS+ section to `prompt_templates.user_prompt` shrunk Tiguan extraction's coverage list from 26-29 → 12 rows AND triggered "All AI providers failed" cascades. Combined system prompt + 60K-char Tiguan input was tipping the LLM's output-token budget. Fixed via 059 rollback + 060 compact (~500 byte) form. **Lesson**: prompt additions should be terse; worked examples and redundant trigger lists are bytes that compete with the document for output budget.

### `ai.temperature` still pinned to 0
Inherited from May 2. Production behavior is fine at T=0 but the post-processing layer is calibrated to absorb T=0.1 variance. Restore is Priority 1 above.

### Anthropic billing dipped twice today
Ran out mid-session (around 11:00 UTC and again ~14:00 UTC). User refilled both times. Worth monitoring if billing instability continues — may need higher credit floor or auto-top-up.

---

## 📚 Documentation Sync (this PR)

- **CLAUDE.md** updated:
  - Next-Session Instructions block rewritten to reflect today's state
  - 5 new gotchas appended: #161 (migration prompt-bloat regression), #162 (pdf-lib non-determinism cross-process), #163 (OCR cache contract — cacheKey field), #164 (extraction model allowlist), #165 (Option-A unverified-gate relaxation)
  - "Last Updated" line refreshed to May 3, 2026
- **ADR-025** drafted: server-side OCR cache infrastructure (rationale + design decisions) — first persistent server-side cache for deterministic AI/OCR responses; pattern is extensible to extraction / sense-check / audit-judge if cost-warranted.
- **No code changes in this PR** — pure docs + ADR.

---

## 🔭 Where the next agent picks up

If the reviewer responds in the next 24-48 hours:
- Use the Round 5 path under Priority 2.
- The Tiguan fixture at `tests/fixtures/kasko/anadolu-volkswagen-tiguan.pdf` is the canonical reference; smoke and stability both default to it now.

If no reviewer activity:
- Restore `ai.temperature` (Priority 1).
- Watch the cost-control savings land over the next ~10 PRs to confirm the 70-80% reduction projection.
- Consider sunsetting `audit-observability-daily.yml` (Priority 4).

If new feature work begins:
- The OCR cache infrastructure (PR #461 + #462, ADR-025) is ready to be reused for other expensive deterministic operations. Check ADR-025 for the contract.
- The model allowlist on `/api/ai/extract` (PR #461) prevents arbitrary callers from picking expensive frontier models — use the helper `assertExtractionModelAllowed()` when adding new endpoints that take a `model` field.
