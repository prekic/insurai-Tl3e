# Runbook: Railway Deployment Troubleshooting

This runbook outlines the steps to diagnose and resolve deployment failures or container crashes for the InsurAI application on Railway.app.

## Context
InsurAI is deployed as a consolidated frontend/backend monorepo service using Railway's default **Nixpacks** build provider. The build process runs `npm run build` (Vite frontend) and `npm run build:server` (TypeScript backend).

---

## 1. Nixpacks Build Failures

**Symptoms:**
- The Railway build step fails with `command not found` or `TS2307`.
- `npm run build` or `npm run build:server` fails during the build phase.

**Common Causes & Remediation:**
1.  **Missing `package.json` Scripts:** Ensure `build` and `build:server` exist and are tested locally.
2.  **Missing DevDependencies in Production Build:** Nixpacks defaults to production-only installs (`npm ci --production`). If `vite` or `tsc` are missing, Railway will fail.
    *   *Fix:* Define `NIXPACKS_INSTALL_CMD="npm ci"` in the Railway variables.
3.  **Vite Environment Variables:** Since Vite bundles frontend variables at build time, `VITE_SUPABASE_URL` and `KEY` must be configured in the Railway dashboard *before* the build step triggers. If missing, the app builds but fails to load the client.

## 2. Container Health Check Crashes (After Build)

**Symptoms:**
- Build succeeds, but the container loops in `Deploying -> Crash -> Restart`.
- Railway logs show `EADDRINUSE` or `process.exit(1)`.

**Common Causes & Remediation:**
1.  **Port Binding:** Ensure the Express backend binds to the dynamic `$PORT` supplied by Railway, not a hardcoded `4001`.
    *   *Check `server/index.ts`:* `const PORT = process.env.PORT || 4001;`
2.  **Missing Runtime Secrets:** If `SUPABASE_SERVICE_ROLE_KEY` or `OPENAI_API_KEY` are undefined, the backend validation might deliberately crash the server on startup to prevent insecure states.
    *   *Fix:* Review the Railway "Variables" tab against `.env.example`.
3.  **Out of Memory (OOM):** PDF parsing via `pdf-parse` can spike memory. If the container is under-provisioned, Railway kills it.
    *   *Fix:* Upgrade the service RAM limit in Railway settings (Settings -> Resources).

## 3. Deployment Log Diagnostic Commands

Use the Railway CLI for deeper introspection if dashboard logs are truncated:

```bash
# View live application logs
railway logs --tail

# View live build logs
railway logs --build

# Run an ephemeral shell inside the running container to inspect the bundle
railway shell
```
