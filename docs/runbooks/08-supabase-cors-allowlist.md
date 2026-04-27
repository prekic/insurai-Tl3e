# Runbook 08 — Intermittent CORS Errors on Supabase REST Reads

> **Note**: an earlier version of this runbook claimed the issue was a Supabase
> CORS allowlist that needed configuring. That was wrong — confirmed Apr 27 2026
> in Run #5 of `e2e/real-policies-sample.spec.ts`. Supabase returns
> `Access-Control-Allow-Origin: *` for valid GET requests; there is no allowlist
> to configure. The real cause is documented below.

## When to use this runbook

You hit one of these symptoms:

- Browser DevTools console shows intermittent errors like:
  ```
  Access to fetch at 'https://<ref>.supabase.co/rest/v1/app_settings?...'
  from origin 'https://insurai-production.up.railway.app' has been blocked by CORS policy:
  No 'Access-Control-Allow-Origin' header is present on the requested resource.
  ```
- The errors come and go — sometimes the page works fine, sometimes it doesn't.
- Admin Settings UI changes intermittently fail to take effect on the live site.
- `e2e/real-policies-sample.spec.ts` "supabase cors allowlist includes production origin" check is flaky (passes on some runs, fails on others).

## What's actually happening

Supabase's REST API is fronted by Cloudflare. **Cloudflare's edge intermittently returns HTTP 503 with body `DNS cache overflow` on OPTIONS preflight requests** to the project domain. When the preflight 503s:

- The 503 response does not include an `Access-Control-Allow-Origin` header.
- The browser interprets the missing header as a CORS policy violation.
- The error message is misleading — it suggests an allowlist problem when the actual issue is a transient edge failure.

GET, POST, and PATCH requests don't trigger preflights for simple Content-Type, so they're unaffected. Only requests that include custom headers (like `apikey`, `authorization`) or non-simple methods trigger preflights — and those preflights are the ones that 503.

## Verify this is the issue you're seeing

Run the OPTIONS preflight 8 times from any terminal:

```bash
for i in 1 2 3 4 5 6 7 8; do
  curl -sS -o /dev/null -w "[$i] code=%{http_code}\n" -X OPTIONS \
    -H "Origin: https://insurai-production.up.railway.app" \
    -H "Access-Control-Request-Method: GET" \
    -H "Access-Control-Request-Headers: apikey,authorization,content-type" \
    "https://exykhfulkbwzatpesruv.supabase.co/rest/v1/app_settings?select=key&limit=1"
  sleep 3
done
```

**Expected output if you're affected**:
```
[1] code=200
[2] code=200
[3] code=503
[4] code=503
[5] code=200
[6] code=200
[7] code=503
[8] code=200
```
Mix of 200 and 503. ~30-40% failure rate observed in Apr 27 sampling.

**If all 8 return 200**: Cloudflare-edge is healthy in your region right now; the symptom won't reproduce. Try again from a different network or wait — the failure rate varies by edge POP.

**If all 8 return 503**: Cloudflare or Supabase is having a sustained outage. Check `https://status.supabase.com` and `https://www.cloudflarestatus.com`.

Compare with a GET (no preflight, should always succeed):
```bash
curl -i -X GET -H "Origin: https://insurai-production.up.railway.app" \
  "https://exykhfulkbwzatpesruv.supabase.co/rest/v1/app_settings?select=key&limit=1"
```
Expect `HTTP/2 401` (no API key) with `access-control-allow-origin: *` in the response headers. The 401 itself is fine — it confirms Supabase REST is reachable and CORS is wide open. **If you see `503 DNS cache overflow` here too**, Cloudflare is actually down for your edge POP, not just slow on preflights — escalate to Supabase support.

## What this means for the running app

The frontend's `ConfigurationService` (`src/lib/config/configuration-service.ts`) reads `app_settings` directly from Supabase REST using the **anon key**. When the preflight 503s, the service catches the failure silently and falls through to `DEFAULT_*_CONFIG` from `src/lib/config/types.ts` (gotcha #169).

So the user-visible impact is:
- **~30-40% of page loads** can't read the latest admin-tunable values from the DB.
- Those pages run on hardcoded defaults (still functional, just stale).
- The remaining pages get the live values fine.
- Admin changes "take effect" only on the page loads where the preflight 200s.

The server-side `ConfigurationService` instance is **unaffected** — it uses `SUPABASE_SERVICE_ROLE_KEY` and a server-to-server fetch that doesn't go through the same Cloudflare edge path. So the **admin Settings UI itself works fine**; the breakage is purely the client-side frontend.

## Mitigations (in order of preference)

### 1. Client retry on config-fetch failure — ✅ IMPLEMENTED (Apr 27 2026)

Implemented in `src/lib/config/configuration-service.ts` as the `withRetry()` helper, wrapping both `get()` and `getCategory()` (the hot paths called by `getAIConfig()` / `getOCRConfig()` / etc).

```ts
async function withRetry<T>(fn: () => Promise<T>, attempts: number = 3): Promise<T> {
  let lastErr: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (e) {
      lastErr = e
      if (i === attempts - 1) break
      const delayMs = i === 0 ? 200 : 500
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw lastErr
}
```

Three attempts total, 200 ms / 500 ms backoff, total worst-case extra latency ~700 ms before the existing fallback-to-default catch fires. Probability math (37 % per-attempt failure rate from this runbook's diagnostic):
| Attempts | Probability of total failure |
|---:|---:|
| 1 | 37 % |
| 2 | 14 % |
| 3 | **5 %** |

**Important**: the helper retries only on **thrown exceptions** (network errors, CORS-blocked preflights — these manifest as `TypeError: Failed to fetch`). It does NOT retry on SDK error responses (e.g. RLS `401`, missing-table `404`) since those are real and won't recover. Tests in `src/lib/config/__tests__/configuration-service.test.ts` ("Cloudflare 503 retry on Supabase preflight failure" describe block) verify all four behaviors.

Other Supabase fetch sites in `ConfigurationService` (e.g. `getRegionalFactors`, `getMarketBenchmarks`, `getInsuranceProviders`) are called less frequently and aren't yet wrapped — easy follow-up if the same symptoms appear there.

### 2. Server-side config proxy through Express (~2 hours, cleanest fix)

Have the Express server fetch config from Supabase server-to-server, expose `GET /api/config/:category` to the client, and have the frontend hit Express instead of Supabase REST directly. Server-to-server calls don't trigger preflights, eliminating the issue entirely.

This is the preferred long-term fix — it removes the client's dependency on Supabase REST for runtime config and centralizes the failure handling.

### 3. File a Supabase support ticket

Send Supabase the curl probe output above with timestamps and the project ref. Ask them to investigate the Cloudflare-edge 503s on OPTIONS preflights for the project. They have visibility into why the edge is throwing `DNS cache overflow` that we don't.

## Don't do this

- **Don't** try to configure a CORS allowlist in the Supabase dashboard. There is no project-level allowlist — Supabase already returns `Access-Control-Allow-Origin: *` for valid responses. The earlier version of this runbook was wrong about that.
- **Don't** try to "fix" by widening CORS in our own app — the issue is on the Supabase side, not ours.
- **Don't** add a wildcard fallback in `ConfigurationService` that ignores errors and uses defaults silently as a "feature" — that's already the current behavior (gotcha #169) and it's the reason this issue stayed invisible for so long. Mitigation #1 makes the failure recover; mitigation #2 makes it not happen.

## Related

- Gotcha #169 in `CLAUDE.md` — silent fallback to `DEFAULT_*_CONFIG` (this is what masks the symptom in normal operation)
- Migration `033_seed_hardcoded_configs.sql` — the 29 admin-tunable keys that get filtered through this fragile path
- Migration `045_bump_extraction_timeouts.sql` — recently bumped because Allianz extraction kept hitting the 65 s primary timeout
- Findings file `e2e/findings/real-policies-findings-2026-04-27.md` (F2 in original audit, "Run #5 update" section for the corrected diagnosis)
- Cloudflare's "DNS cache overflow" is generally caused by the edge proxy hitting an internal connection-pool limit; it's transient and recovers in seconds
