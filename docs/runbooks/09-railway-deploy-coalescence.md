# Runbook 09 — Railway Build Coalescence & Stuck Deploys

## When to use this runbook

You merged a PR to `main` and Railway shows "deployed", but production behaves as if the change never landed. Specifically:

- An endpoint added in your PR returns 404
- A new feature flag, env var, or config key isn't honored
- Inspecting the deployed JS bundle for new code markers (e.g. via `grep`) finds nothing
- Server-side, the response shape is the old one
- `/api/health` returns 200 (so the server itself is healthy, just running old code)

## What's actually happening

When two PRs to `main` merge in close succession (typically within ~60 seconds), Railway's build coalescence sometimes drops the second push event. The first build runs to completion, marks itself as the active deployment, and the second push is silently abandoned. There's no visible "build failed" or "build cancelled" notification — Railway just acts as if only one merge happened.

This was confirmed in the Apr 27 2026 incident:

- PR #390 (Plan A — localStorage cache) merged at ~20:07
- PR #389 (Plan B — Express config proxy) merged at ~20:08
- Railway built only #390. The build log timestamps (20:08:03 → 20:09:34) covered exactly that one merge.
- Inspection of the deployed `configuration-service-CybWAv83.js` chunk found Plan A's markers (`insurai_config_`) but not Plan B's (`fetchProxyKey`, `/api/config/`).
- Server-side, `GET /api/config/ai` returned `404 {"error":"Not found"}` — the new route from Plan B was not mounted.

## Detection — confirm whether your code is actually live

### Step 1 — server-side endpoint probe

Hit any endpoint that's NEW in your PR. For routes:

```bash
curl -sS -o /dev/null -w "HTTP %{http_code}\n" https://insurai-production.up.railway.app/api/<your-new-path>
```

If the endpoint returns 404 with body `{"error":"Not found"}` (the Express catch-all), the new route is not mounted → the build didn't include your changes.

### Step 2 — bundle marker grep

Pick a unique string from your PR's TS source — a function name, log message, or storage-key prefix. Then:

```bash
# Identify the relevant chunk via the index page
curl -sS https://insurai-production.up.railway.app/ | grep -oE '/assets/[^"]+\.js'

# Download the main bundle to find lazy chunk references
curl -sS https://insurai-production.up.railway.app/assets/index-<hash>.js -o /tmp/main.js
grep -oE 'assets/[a-zA-Z0-9_-]+-[a-zA-Z0-9_-]+\.js' /tmp/main.js | sort -u

# Download the suspect chunk and grep
curl -sS https://insurai-production.up.railway.app/<chunk-path> -o /tmp/chunk.js
grep -c "<your-unique-marker>" /tmp/chunk.js
```

If the marker count is `0`, your code didn't make it into the deployed bundle.

### Step 3 — Railway dashboard check

Open Railway dashboard → your project → **Deployments** tab. Compare the deployment timestamps to your merge timestamps:

- If the most recent deployment is **older than your most recent merge**, Railway missed the webhook. Proceed to recovery.
- If there's a **deployment in progress** (status: "Building" / "Deploying"), wait for it. Builds typically take 90-180 seconds.
- If you see a **"Failed" or "Crashed" deployment**, inspect its build logs for the failure reason (separate problem — see runbook 01).

## Recovery — force a fresh deploy

### Option A — manual redeploy via Railway dashboard

In the Railway service page, top-right has a three-dot menu → **"Redeploy latest"** or **"Deploy"**. This rebuilds the current `origin/main` regardless of webhook history. Fastest path; no code change required.

### Option B — fresh commit+merge cycle via GitHub MCP

The Claude Code sandbox `git push` goes through `127.0.0.1` and does NOT fire Railway's webhook (gotcha #22). To fire a real webhook event from the sandbox:

```
mcp__github__create_branch         (off main)
mcp__github__create_or_update_file (any small change)
mcp__github__create_pull_request
mcp__github__merge_pull_request
```

The merge commit fires a real GitHub `push` event Railway will pick up. Useful when you can't reach the Railway dashboard.

This runbook itself was created via that exact flow as the recovery for the original incident.

## Prevention

When you have multiple PRs ready to land:

- **Stagger merges by 60+ seconds**. Watch the Railway dashboard's "Deployments" tab; only merge the next PR once the previous build has at least *started*.
- **Or squash multiple changes into a single PR**. Two coordinated changes that depend on each other (e.g. our Plan A + Plan B) are often easier to ship as one PR with two commits.
- **Don't merge during a previous deploy's build window** (~3 min). If a build is "Building", wait for it to reach "Active" or "Failed" before merging the next PR.

## Related

- Gotcha #22 in `CLAUDE.md` — Sandbox `git push` doesn't fire Railway webhook
- Runbook 01 — Railway deployment troubleshooting (covers genuine build failures, not coalescence)
- Runbook 08 — Supabase CORS allowlist (this runbook's incident is part of the same Apr 27 2026 hardening pass)
