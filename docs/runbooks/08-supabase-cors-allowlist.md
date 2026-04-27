# Runbook 08 — Supabase CORS Allowlist

## When to use this runbook

You hit one of these symptoms:

- Browser DevTools console shows repeated errors like:
  ```
  Access to fetch at 'https://<ref>.supabase.co/rest/v1/app_settings?...'
  from origin 'https://insurai-production.up.railway.app' has been blocked by CORS policy:
  No 'Access-Control-Allow-Origin' header is present on the requested resource.
  ```
- Admin Settings UI changes aren't taking effect on the live site.
- `e2e/real-policies-sample.spec.ts` "supabase cors allowlist includes production origin" test fails.
- `npm run qa:extraction` shows config-driven thresholds at hardcoded defaults despite admin overrides.

## Why this matters

The frontend `ConfigurationService` (`src/lib/config/configuration-service.ts`) reads `app_settings` directly from Supabase REST using the **anon key**. When CORS blocks the preflight, the service catches the failure silently and falls through to `DEFAULT_*_CONFIG` from `src/lib/config/types.ts` — **production keeps running, but with stale defaults instead of the values seeded by migration 033 (29 admin-tunable keys: AI models, timeouts, OCR thresholds, FX cache TTL, monitoring/retention windows).**

The server-side `ConfigurationService` instance is unaffected — it uses `SUPABASE_SERVICE_ROLE_KEY` and a server-to-server fetch that bypasses CORS. So the **admin Settings UI itself works fine**; only the client extraction pipeline breaks.

This is the root cause of finding F2 in `e2e/findings/real-policies-findings-2026-04-27.md`.

## Fix (Supabase dashboard, no code change)

1. Open the Supabase project dashboard for the production project.
2. Navigate to **Project Settings → API → CORS allowed origins**.
3. Add the production origin(s):
   - `https://insurai-production.up.railway.app`
   - Any custom domain (e.g. `https://app.insurai.com`)
4. Save. The change takes effect immediately — no Railway redeploy needed.

## Verify the fix

### From the command line

```bash
curl -i -X OPTIONS \
  -H "Origin: https://insurai-production.up.railway.app" \
  -H "Access-Control-Request-Method: GET" \
  -H "Access-Control-Request-Headers: apikey,authorization,content-type" \
  "https://<your-project-ref>.supabase.co/rest/v1/app_settings?select=key,value&category=eq.ocr&order=display_order.asc"
```

Expected: response includes `Access-Control-Allow-Origin: https://insurai-production.up.railway.app` (or `*`).

### From the Playwright suite

```bash
npx playwright test e2e/real-policies-sample.spec.ts \
  -g "supabase cors allowlist" \
  --project=chromium --reporter=list
```

Expected: green. The test fails loudly if the allowlist regresses.

### From the live frontend

1. Hard-reload `https://insurai-production.up.railway.app/`.
2. Open DevTools → Network → filter for `app_settings`.
3. Confirm the requests return **200** with no CORS errors in the Console panel.
4. Optional: change a low-risk OCR threshold via Admin Settings → OCR, hard-reload the page, confirm the new value is observable in the extraction behavior.

## Related

- Gotcha #169 in `CLAUDE.md` — silent fallback to `DEFAULT_*_CONFIG`
- Migration `033_seed_hardcoded_configs.sql` — the 29 admin-tunable keys that depend on this allowlist
- Gotcha #98 — adding new i18n keys (unrelated, but the four-file rule is referenced from the same client config)
- Findings file `e2e/findings/real-policies-findings-2026-04-27.md` (F2)

## Why we don't auto-allow `*`

A wildcard would let any origin read `app_settings`. Even though the values are not strictly secret (they're operational config, not credentials), an explicit allowlist:
- Documents which deployments are live.
- Surfaces the "we deployed a new domain" event as a CORS failure (forcing a deliberate ack via this runbook), rather than silently exposing the new origin.
- Aligns with the Supabase RLS posture (RLS is per-row; CORS is per-origin; both should be tight).
