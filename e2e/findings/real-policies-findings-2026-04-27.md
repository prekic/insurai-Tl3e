# Real-World Policy Sample — Findings

**Run date**: 2026-04-27 (UTC)
**Target**: `https://insurai-production.up.railway.app` (Railway production)
**Local commit**: `2890dd9c6573ce7b48a7373aa51ba84d2b7774a6` (matches `origin/main`)
**Spec**: `e2e/real-policies-sample.spec.ts`
**Browser**: Playwright Chromium (headless), v1.56.1
**Heal scope**: investigation only — **no production code edits**.

---

## Post-Merge Verification Run (Run #4 — added 2026-04-27 12:50 UTC)

After the user merged `claude/load-project-context-9weNz` into `main`, Railway redeployed. During the deploy window, **production returned HTTP 503 "DNS cache overflow" for ~30 seconds** at the edge proxy (verified by `curl /api/health` polling — first 503 at 12:50:07, recovered to 200 at 12:50:23). Real users hitting the site during that window would have seen a generic 503 page.

After recovery, ran the full sample spec (with the SUCCESS-locator tightened — see F6) against the freshly deployed version:

| PDF | Run #4 outcome | Wall time | Notable |
|---|---|---|---|
| `ANADOLU.PDF` | inconclusive (test-side false-positive on `Coverages` locator; backend healthy) | 22.4 s | Doc AI 200, 12pp split into chunk 1/2, in-flight OCR when test bailed |
| `allianz-police-0001021024147152-TR.pdf` | **EXTRACTION_BROKEN_END_TO_END** | 67.7 s | Doc AI returned **500 OCR_FAILED "Request timed out"** at 61 s; pdf.js fallback then **also failed** because the unpkg worker URL was CORS-blocked. User stays on "PDF Extraction…" indefinitely. |
| `KASKO_ERDEMİR_Ereğli_462660767_67TY932_2024.12-2025.12.pdf` | **NAVIGATION_TIMEOUT** (3rd consecutive run) | 34.6 s | Confirmed bug: file selected, no navigation, no API call |

### F0 — Allianz extraction is fully broken post-deploy  *(severity: CRITICAL — NEW)*

Sequence from `e2e/proof/real-policies/allianz-peugeot.log` (run #4):

```
[PolicyExtractor] Attempting Document AI extraction...
[Document AI] PDF has 9 pages (limit: 10)
[error] Failed to load resource: the server responded with a status of 500
[PolicyExtractor] Document AI result success: false (61456ms)
[PolicyExtractor] Document AI FAILED: Request timed out, please try again
[PolicyExtractor] Document AI error code: OCR_FAILED
[PolicyExtractor] Will try pdf.js fallback...
[PolicyExtractor] Starting pdf.js fallback extraction...
[error] Access to script at 'https://unpkg.com/pdfjs-dist@5.4.624/build/pdf.worker.min.mjs' ... blocked by CORS policy
[PDF.js] Worker error detected (failure count: 1): Setting up fake worker failed
[PDF.js] Attempt 1/3 failed with WORKER_ERROR
```

**Both extraction paths failed**:
1. **Primary (Document AI)** returned 500 with `OCR_FAILED` after 61 seconds (server-side `Request timed out`). This is new — Allianz returned 200 in 21 s during pre-merge runs.
2. **Fallback (pdf.js client-side)** failed because the worker URL `https://unpkg.com/pdfjs-dist@5.4.624/build/pdf.worker.min.mjs` was CORS-blocked. Unlike the resolver path (which has a `unpkg → jsdelivr` cascade), the **runtime worker setup path doesn't cascade** — it just retries the same URL up to 3 times. CORS doesn't get better on retry.

**End-user impact**: an anonymous user uploading an Allianz KASKO PDF post-merge sees the page sit at "PDF Extraction…" forever (no error toast, no retry button, no navigation away).

**Possible root causes (need server-log correlation)**:
- Document AI quota or auth regression after the redeploy. The merge didn't change the GCP service account, but it could have shifted env-var loading order. Check `GCP_SERVICE_ACCOUNT_BASE64` decoding in the `getDocumentAIClient()` factory.
- Document AI cold-start: the first OCR call after a deploy can be much slower than steady-state. The 61 s timeout is right at Railway's 30 s gateway timeout doubled — could be a streaming/SSE issue (gotcha #130).
- Real GCP-side outage during the deploy window. Check the GCP status page for `2026-04-27T12:51 UTC ± 5 min` for `us-central1` Document AI.

**Where to look in code**:
- `server/routes/ai/extraction.ts` — Document AI invocation, error mapping to `OCR_FAILED`
- `src/lib/ai/pdf-parser.ts` — pdf.js fallback path; the worker resolver does cascade (gotcha #50, "PDF.js Worker error detected") but the actual `getDocument()` call uses whatever worker URL was set globally and re-uses it on retry without re-resolving.
- Server logs around `2026-04-27T12:51:15Z` (Allianz request start) for the Document AI call's actual exception.

### F0a — Erdemir landing-page upload bug confirmed reproducible  *(now 3/3 runs)*

Run #4 makes it three consecutive failures (run #2, #3, #4) of the Erdemir 289 KB multi-vehicle KASKO upload to navigate from `/` to `/try`. The bug from F1 below is **not flaky — it is persistent**.

### F0b — Railway 503 "DNS cache overflow" during deploy window  *(severity: MEDIUM — informational)*

When the user merged the branch and Railway deployed, the edge proxy returned HTTP 503 with body `DNS cache overflow` for at least 16 seconds (12:50:07 → 12:50:23 UTC). This is a Railway-side phenomenon, likely the edge proxy struggling to resolve the new build's container — but it surfaces to real users as a generic 503. Worth flagging to Railway support if it persists across future deploys.

---

## Per-PDF Outcome (4 runs against production)

| PDF | Bytes | Pages | Run #2 (post-cert-fix) | Run #3 (final) |
|---|---|---|---|---|
| `ANADOLU.PDF` | 90 KB | 12 | inconclusive (test bailed mid-OCR; locator false-positive). OCR `/api/ai/ocr/document-ai` returned 200; chunk 1/2 in flight. | Same — UI_CRASH with `extractStatus: 200`, body shows `OCR Processing… Elapsed 0:12`. |
| `allianz-police-0001021024147152-TR.pdf` | 161 KB | 9 | inconclusive (same as Anadolu — bailed at OCR-in-progress with status 200). | **NEW: 503 from server** — `Failed to load resource: 503`, file input never rendered, test bailed at 15 s waiting for `input[type="file"]`. |
| `KASKO_ERDEMİR_Ereğli_462660767_67TY932_2024.12-2025.12.pdf` | 289 KB | many | **NAVIGATION_TIMEOUT** — page loaded fine, file uploaded, but URL never advanced from `/` to `/try`. No console errors except the standard CORS noise. | **NEW: 503 from server** — same pattern as Allianz, file input never rendered, blocked at page load. |

Three distinct failure modes observed across two runs. The Erdemir navigation-failure was confirmed in run #2; the 503 on run #3 was a new transient signal that affected Allianz and Erdemir but not Anadolu (likely because Anadolu ran first and used a warm worker).

---

## Headline Findings (Production-Level)

### F1 — Erdemir multi-vehicle KASKO upload silently fails on the landing page  *(severity: HIGH)*

**Symptom**: dropping `KASKO_ERDEMİR_Ereğli_462660767_67TY932_2024.12-2025.12.pdf` (289 KB) on the landing-page upload widget causes no visible reaction. The URL stays at `/`, no error banner appears, and no `/api/ai/*` request is made (`extractStatus: n/a` in `e2e/proof/real-policies/erdemir-fleet.log`). The body-text dump (`erdemir-fleet.txt`) at the 33-second mark still shows the hero / `Analyze Your Policy Free` button — the user is stuck on the landing page.

**Reproduced**: 2× in this session (logs at the same path, both runs `outcome: NAVIGATION_TIMEOUT`).

**Likely causes (need investigation, not fixed here)**:
- A client-side PDF.js parse exception during the landing-widget pre-validation step, swallowed without surfacing an error to the user. Erdemir's PDF is a multi-vehicle fleet layout — its complex page structure may trigger an exception path the widget doesn't catch.
- An undocumented size or page-count gate inside `UploadWidget.tsx` / `PolicyUpload.tsx` that bails before navigation but doesn't render an error.
- A handoff race: the widget hands the file to a context that hasn't mounted yet on slower mobile-emulation viewports (sandbox is desktop, but the same race could differ in production).

**Where to look**:
- `src/components/landing/UploadWidget.tsx`
- `src/components/PolicyUpload.tsx`
- `src/components/TryAnalysis.tsx` (the `/try` route consumer; if the file handoff dies here it won't surface either)

**User impact**: any corporate fleet KASKO upload silently dead-ends. Anonymous users have no way to retry or understand the failure.

---

### F2 — Production frontend cannot read `app_settings` from Supabase (CORS blocked)  *(severity: HIGH — operational)*

**Symptom**: every config category fetch from the production frontend is rejected by Supabase REST with:

```
Access to fetch at 'https://exykhfulkbwzatpesruv.supabase.co/rest/v1/app_settings?select=key,value&category=eq.{ocr|ui|ai}'
from origin 'https://insurai-production.up.railway.app' has been blocked by CORS policy:
Response to preflight request doesn't pass access control check:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
```

Observed for `category=eq.ocr`, `category=eq.ui`, `category=eq.ai` (logs of all 3 PDFs in `e2e/proof/real-policies/*.log`).

**Why this is invisible to users**: gotcha #169 in `CLAUDE.md` — *"If DB unavailable, returns defaults silently."* `ConfigurationService` swallows the fetch failure and falls through to the hardcoded `DEFAULT_*_CONFIG` objects in `src/lib/config/types.ts`.

**Operational consequence**: the production deployment is **not actually consuming any of the 29 admin-tunable values** seeded by migration `033_seed_hardcoded_configs.sql` (see CLAUDE.md "Migration 033"). This includes:
- AI provider models (`openai_extraction_model`, `anthropic_extraction_model`, etc.)
- Extraction timeouts (`extraction_timeout_ms`, `request_budget_ms`, `client_fetch_timeout_ms`, `trial_extraction_timeout_ms`)
- OCR decision thresholds (`category=ocr`)
- UI display settings (`category=ui`)
- FX cache TTL, monitoring thresholds, retention windows

Any admin who has been changing values in the **Settings → AI / OCR / UI / FX** panels has been changing nothing the running app sees on the client.

**Suggested fix (not applied)**: Supabase Project Settings → API → **CORS allowed origins** → add `https://insurai-production.up.railway.app` (and any custom domain). This is a Supabase dashboard change, not a code change.

**Cross-check**: the *server-side* `ConfigurationService` (called from `server/routes/admin/settings.ts` etc.) uses `SUPABASE_SERVICE_ROLE_KEY` and a server-to-server fetch, which bypasses CORS — so the admin Settings UI itself works fine. The breakage is purely the client-side ConfigurationService instance imported by frontend modules like the OCR decision engine and FX hook.

---

### F3 — PDF.js worker CDN cascade is fragile  *(severity: MEDIUM)*

**Symptom**: in run #1, `https://unpkg.com/pdfjs-dist@5.4.624/build/pdf.worker.min.mjs` was rejected by CORS, and the app fell back to `https://cdn.jsdelivr.net/npm/pdfjs-dist@5.4.624/build/pdf.worker.min.mjs`. In run #2, unpkg succeeded. Both CDNs are external dependencies of every page load that needs PDF parsing.

**Logs**: `[PDF.js] Testing worker URL: https://unpkg.com/...` followed by `[PDF.js] Found working worker: https://cdn.jsdelivr.net/...` (run #1).

**Risk**: if both CDNs fail simultaneously (CORS regression, regional outage, package republish), all client-side PDF parsing breaks. The current cascade implies we know this is fragile.

**Suggested fix (not applied)**: bundle `pdf.worker.min.mjs` into `public/` or `dist/` at build time and reference it from same-origin (`/pdfjs/pdf.worker.min.mjs`). Removes the CORS dependency entirely. The version is pinned to 5.4.624 (matches `pdfjs-dist` in `package.json`), so a build-time copy step is straightforward.

---

### F3a — Intermittent 503 from Railway during page load  *(severity: HIGH)*

**Symptom**: in run #3, both the Allianz and Erdemir tests failed at `locator.waitFor` for the file `<input>` — the input never attached because some asset on the page returned **HTTP 503**. The console error is terse: `Failed to load resource: the server responded with a status of 503`. No URL is given by the browser API for the failed resource; need server-side correlation.

**Logs**: `e2e/proof/real-policies/allianz-peugeot.log` and `erdemir-fleet.log` from the third run (run #3 timestamps `2026-04-27T11:54:07Z` and `11:54:23Z`).

**Why Anadolu wasn't affected**: it ran first in run #3 and was already on a warmed connection. Allianz and Erdemir hit the 503 within ~15 s of each other — consistent with a single backend hiccup or rate-limit window.

**Suggested correlation work (not done here)**:
- Pull Railway service logs for `2026-04-27T11:54:00Z` ± 60 s, look for 503 spikes and which endpoint(s) returned them.
- Check whether Express's `compression` middleware or the static file handler is the source — production sometimes 503s on hashed asset misses if the build cache is being invalidated.
- Re-run with the spec rotated (run Erdemir → Allianz → Anadolu) — if 503 follows the **second** test regardless of fixture, it's a session-level race; if it follows specifically large-file uploads, it's payload-related.

---

### F4 — Anadolu OCR triggered the 10-page split, as designed  *(informational)*

**Observation**: `[Document AI] PDF has 12 pages (limit: 10)` → `[PDF Splitter] Splitting 12 pages into 2 chunks of max 10 pages` → `Processing chunk 1/2 (pages 1-10)`. Matches `pdf-splitter.ts`'s contract (gotcha #55). No evidence of a regression.

The test bailed before chunk 2 completed (see F6 below), so end-to-end extraction wasn't verified — but the OCR layer itself behaved correctly up to that point.

---

### F5 — `[ConfidenceDiag]` logs are NOT firing in production  *(informational)*

The diagnostic logs added by commit `fdedfea` (gotcha #74, "VITE_DEBUG_LOGS environment variable gates diagnostic console output") did not appear in any of the 3 runs. This confirms `VITE_DEBUG_LOGS=true` is **not set** in the Railway environment. That's the intended production posture — but it also means the only confidence-pipeline diagnostics we'd have during a real-user issue are server-side `[ConfidenceDiag]` lines (`server/routes/ai.ts`), which aren't visible from the browser.

---

### F6 — Test infrastructure caveat: SUCCESS locator was too loose  *(internal — not a production issue)*

For Anadolu and Allianz, the test exited at ~19–21 s with `winner=success` but the body-text dump showed only the in-flight `AnalysisProgressCard` ("OCR Processing…", "Elapsed 0:12"). My locator regex included `Sigortalı` / `Insured Person`, which evidently matched some hidden/header element while the actual policy detail UI hadn't rendered.

So **for these two PDFs, the production extraction may well succeed end-to-end** — we just didn't wait long enough to confirm. Server response was `200` for `POST /api/ai/ocr/document-ai`, no error UI was shown, no failed network requests.

**Not fixed in this run** (heal scope = investigation only). A follow-up tightening would: (a) replace the `Sigortalı | Insured Person` SUCCESS hint with a strict `\d{1,3}\s*\/\s*100` score-rendered match, (b) extend `waitFor` to 180+ s, (c) explicitly wait for the second `/api/ai/extract/:provider` call (post-OCR), not just the OCR call.

---

### F7 — Sandbox-only artifacts (informational)

These appeared in the logs but are **not** production issues:
- `An SSL certificate error occurred when fetching the script` and `Service worker registration failed` — the sandbox's headless Chromium ships with a stripped CA bundle. Curl from the same host hits the same URL with no problem (verified during this session). The spec uses `ignoreHTTPSErrors: true` to bypass page-load TLS checks, but service worker registration goes through a separate code path that doesn't honor that flag. Real users on real browsers don't see this.

---

## Suggested Fixes (NOT Applied — Scope Was Investigate-Only)

| # | Finding | Where | Action |
|---|---|---|---|
| 1 | Erdemir landing-page upload silently dies (run #2) | `src/components/landing/UploadWidget.tsx`, `src/components/PolicyUpload.tsx` | Add error boundary + user-visible toast around the file-handoff path; reproduce locally with the Erdemir fixture; check for a swallowed PDF.js parse exception. |
| 2 | Supabase CORS blocks all `app_settings` fetches from prod frontend | Supabase dashboard (no code change) | Project Settings → API → CORS allowed origins → add `https://insurai-production.up.railway.app`. Verify by reloading and watching for `[ConfigPerf] cache miss` console lines (or by toggling an OCR threshold and confirming it takes effect). |
| 3 | Intermittent 503 during page load (run #3) | Railway service logs + Express static handler | Pull logs around `2026-04-27T11:54:00Z`. Check static-asset 503s, compression middleware errors, and post-deploy cold-start failures. Consider adding a 503-aware retry on the client. |
| 4 | PDF.js worker depends on third-party CDN at runtime | `vite.config.ts`, `public/`, code that resolves the worker URL | Add a Vite build step that copies `node_modules/pdfjs-dist/build/pdf.worker.min.mjs` into `public/pdfjs/`. Update the worker resolver to prefer `/pdfjs/pdf.worker.min.mjs` (same-origin) and only cascade to CDNs as a backstop. |
| 5 | Test infrastructure: SUCCESS locator over-matches | `e2e/real-policies-sample.spec.ts:155-160` | Tighten to `\d{1,3}\s*\/\s*100` only; require the locator to match `>=2` distinct success tokens; extend wait to 180 s; explicitly wait on post-OCR `/api/ai/extract/*` response. |

---

## Verification Proof Locations

- Playwright HTML report: `playwright-report/index.html` (generated automatically by `--reporter=list,html` — note: only `--reporter=list` was passed in the final run; HTML report is always produced because it is the default in `playwright.config.ts:18`)
- Per-PDF artifacts: `e2e/proof/real-policies/`
  - `anadolu-single.png` / `.txt` / `.log`
  - `allianz-peugeot.png` / `.txt` / `.log`
  - `erdemir-fleet.png` / `.txt` / `.log`
- Spec: `e2e/real-policies-sample.spec.ts` (new, not yet committed; sandbox-side test infrastructure only)
- This findings file: `e2e/findings/real-policies-findings-2026-04-27.md`

## What Was NOT Touched

Confirmed by `git status` after the run: only `e2e/real-policies-sample.spec.ts`, `e2e/proof/real-policies/*`, and this findings file. No production code, no DB migration, no shared schema, no dependency was modified.
