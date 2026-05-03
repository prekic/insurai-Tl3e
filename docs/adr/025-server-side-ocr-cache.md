# ADR-025: Server-Side OCR Cache for Document AI

**Date**: 2026-05-03
**Status**: Accepted
**Supersedes**: N/A (new decision)
**Related**: ADR-022 (post-deploy smoke and audit infrastructure), gotchas #128 (32K stream-token budget), #138 (manual SQL apply for migrations), #162 (pdf-lib non-determinism), #163 (OCR cache contract)

---

## Context

The May 3, 2026 cost-control session began with a measured ~$3-4/day burn on AI extraction + Document AI OCR APIs, dominated by:
- `smoke-kasko.yml` firing on every push to `main` (~$0.40/run × 4 PRs = $1.60 in one day)
- Local stability runs and ad-hoc probes ($1.20)
- The user reported **running out of OpenAI and Google Document AI quotas mid-session**, forcing a fallback cascade that muddied diagnosis on an unrelated stability test.

Document AI is **deterministic on identical input** — the same PDF chunk produces the same OCR text on every call. The smoke and stability test scripts re-OCR the same 4 fixtures repeatedly, and historical extractions re-OCR the same insurer-uploaded policies for re-analysis. Both workloads are obvious cache hits in waiting. There was no caching layer for OCR responses.

Two requirements drove the design:
1. **Cost reduction**: smoke and stability runs should pay $0 for OCR after the first run, dropping per-run cost from $0.40 → $0.04 (Haiku extraction with cached OCR).
2. **Quota protection**: shield against per-day Document AI quotas during high-CI-activity periods like today's session.

---

## Decision

Add a single-table Postgres cache (`public.ocr_cache`, migration 061) keyed on a SHA256 of a stable cache identifier, written to and read from at the `POST /api/ai/ocr/document-ai` route handler in `server/routes/ai/extraction.ts`.

### Storage choice — Postgres table over Supabase Storage

We considered three options:

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| Postgres table | Single SELECT + INSERT, easy to inspect, queryable for eviction | 30-60KB rows in TEXT/JSONB OK at this scale | ✅ Chosen |
| Supabase Storage bucket | Cheap object storage; familiar pattern | Bucket setup, signed URL handling, less queryable | ❌ Overkill for ≤10K rows |
| In-memory LRU on the Express server | Cheapest read | Lost on every Railway redeploy (gotcha #19); no cross-process sharing | ❌ Wasteful for cache invalidation patterns |

A Postgres table also lets us add TTL eviction or hit-count-based pruning later via `pg_cron` if rows grow unbounded — same pattern as the rest of the project's data-retention policies (gotcha #19, ADR-022).

### Cache key — `cacheKey` request field, NOT `sha256(documentBase64)`

The first iteration (PR #461) hashed `documentBase64` directly. Production verification revealed this never produced cache hits across runs because `pdf-lib`'s `PDFDocument.save()` is **non-deterministic across Node processes** (gotcha #162) — every fresh `node` process produces different chunk bytes for the same source PDF. `sha256(documentBase64)` therefore changed every run, defeating the cache.

PR #462 fixed it by introducing an optional `cacheKey?: string` field on the OCR request body. When supplied, the server hashes the `cacheKey` string instead of `documentBase64`. Stable form for chunked PDFs:

```ts
cacheKey = `${sha256(sourceFileBytes)}:${chunkIdx}/${totalChunks}`
```

The source file bytes are intrinsically stable across processes; pdf-lib's output isn't. The fallback to `sha256(documentBase64)` remains for backward compatibility (browser-side user uploads where the source-file hash isn't readily available).

### Cached fields — `text`, `page_count`, `confidence` only

The live Document AI response also returns `formFields[]` and `tables[]` (admin-debug tooling). These are NOT cached — the cache hit response sets `formFields: undefined, tables: undefined`. Smoke / stability / standard production callers consume only `text` and `pageCount`, which is why this trade-off is acceptable. If a future caller needs the structured fields and we want them cached, expand the cached schema.

### RLS — service-role-only

Service-role-only RLS following the migration 041 pattern (gotcha #9): the table is INSERT/SELECT/UPDATE/DELETE-able only via the Express server using `SUPABASE_SERVICE_ROLE_KEY`. PostgREST `anon` and `authenticated` roles cannot read or write directly. This matches the ownership model — the OCR cache is server-internal infrastructure, not user-facing.

### Operational characteristics

- **Cache miss path**: lookup returns null → live Document AI call → fire-and-forget store. Store failure does not invalidate the live OCR result returned to the caller.
- **Cache hit path**: lookup returns row → respond with `cached: true` and `processingTimeMs: <cache-lookup-time>` → fire-and-forget update of `last_hit_at` for cold-row eviction analysis.
- **Cache failures NEVER block the live OCR path**: `lookupOcrCache()` returns null on Supabase error; `storeOcrCache()` is `void`-awaited.
- **Logs include `via: 'cacheKey' | 'documentBase64'`** so cache-effectiveness can be measured from Railway logs.

---

## Verification

End-to-end verification ran on May 3, 2026 in production after PR #462 merged + manual `DELETE FROM public.ocr_cache;` to clear PR #461's stale rows + Railway redeploy. Two consecutive smoke runs against `https://insurai-production.up.railway.app`:

```sql
SELECT
  count(*)                                            AS total_rows,
  count(*) FILTER (WHERE last_hit_at IS NOT NULL)     AS hit_rows,
  min(created_at)                                     AS earliest,
  max(last_hit_at)                                    AS most_recent_hit
FROM public.ocr_cache;

-- Result:
-- total_rows         = 7   ← one per unique chunk × 4 fixtures (exact prediction)
-- hit_rows           = 7   ← every chunk hit on the 2nd run
-- earliest           = 2026-05-03 09:39:13   (Run 1 — cold, populated)
-- most_recent_hit    = 2026-05-03 10:38:48   (Run 2 — warm, hit)
```

Compare to the pre-fix state (PR #461 only): 13 rows, 0 hits across two smoke runs. The PR #462 fix moved the cache from "broken" to "100% hit on the canonical workload".

---

## Consequences

### Positive

- Smoke-kasko per push: $0.40 → ~$0.04 (90% reduction) when cache is warm.
- Document AI free-tier-quota pressure relieved on repeated CI fires.
- The pattern is **directly extensible** to other expensive deterministic operations: extraction caching (sha of OCR text + prompt version → extraction JSON), sense-check caching, audit-judge caching. Future PRs can adopt the same `(sha256_key, payload, hit_count, last_hit_at)` table shape.

### Negative / risks

- One more table to maintain. RLS + service-role pattern keeps the access surface small but adds to migration drift risk.
- `formFields[]` / `tables[]` are not cached. If a future caller needs them on cache hits, the schema needs widening.
- Stale rows accumulate without eviction. Manual `DELETE FROM public.ocr_cache WHERE last_hit_at < now() - interval '90 days'` is the v1 cleanup; can be promoted to `pg_cron` if it grows.
- Document AI behavior could theoretically drift over time, making stale rows incorrect. In practice this is rare; manual purge is the v1 mitigation.

### Operational requirements

- **Manual SQL apply** of migration 061 (gotcha #138) — same pattern as all other prompt / config migrations.
- **No new env vars** — uses existing `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- **Cache-key contract for new callers** (gotcha #163): pass `cacheKey` from a stable identifier (e.g. source-file SHA + chunk index) when invoking `POST /api/ai/ocr/document-ai`. Without it, cache hit ratio stays at ~0% across processes (gotcha #162).

---

## Future work (not in scope for this ADR)

- **Extraction cache** — same pattern keyed on `sha256(ocrText + extractionPromptVersion + model + temperature)` → extraction JSON. Bigger savings than OCR (extraction is the dominant cost) but invalidates on every prompt-template change (migrations 048+) so eviction strategy needs design.
- **Audit-judge cache** — already typology-cached (gotcha #142) but the typology key is loose; tightening it (gotcha #143) is a separate workstream.
- **Cache-hit metrics dashboard** — the `hit_count` column is populated but no admin UI surfaces it. Worth adding once the cache stabilizes.

---

## References

- PR #461 — original OCR cache (introduced the bug)
- PR #462 — cache-key fix (resolved the bug; 7/7 hits verified)
- migration 061 — `ocr_cache` table schema
- `server/services/ocr-cache.ts` — `hashOcrInput()`, `lookupOcrCache()`, `storeOcrCache()`
- `server/routes/ai/extraction.ts:~1971-2010` — route handler integration point
- `scripts/smoke-kasko.ts` — first canonical caller passing `cacheKey`
- `scripts/output-stability-check.ts` — second canonical caller passing `cacheKey`
- gotcha #9 — service-role-only RLS pattern
- gotcha #128 — 32K stream-token budget for massive policies
- gotcha #138 — manual SQL apply for migrations
- gotcha #162 — pdf-lib non-determinism cross-process
- gotcha #163 — OCR cache contract
