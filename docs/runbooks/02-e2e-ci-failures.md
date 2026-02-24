# Runbook: E2E CI Failures (Playwright vs. Live Supabase)

This runbook helps diagnose situations where Playwright End-to-End (E2E) tests pass locally but fail in the GitHub Actions pipeline (`staging.yml` or `production.yml`).

## Context
InsurAI E2E tests target a live instance of the application and heavily rely on an integrated Supabase database to assert auth states, policy uploads, and AI extractions. CI runs do not use a mocked database; they use the deployed database or an isolated test database.

---

## 1. Most Likely Cause: Environment Secret Injection

**Symptom:** Tests fail instantly indicating "Invalid login credentials", "Network Timeout", or `supabase.auth.signIn` throws.
**Diagnosis:** The GitHub Actions runner does not have access to the `.env` file. It relies on GitHub Secrets being mapped into the `env:` block.
**Resolution:**
1.  Check the Actions tab for the specific run.
2.  Verify the workflow YAML (`.github/workflows/staging.yml`) explicitly maps `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and backend credentials to `env`.
3.  Verify the secrets are populated correctly in the repository's Settings > Secrets and Variables > Actions.

## 2. Timing, Network Latency, and PDF Timeouts

**Symptom:** `locator.click()` timeouts. "Timeout 30000ms exceeded." Tests pass locally 10/10 times but randomly fail on GitHub.
**Diagnosis:** The standard GitHub Ubuntu runners are significantly slower than a developer's M-series Mac. PDF parsing via the backend proxy (`extractViaProxy`) and the OpenAI API call can take 8-15 seconds under CI load instead of 2-3 locally.
**Resolution:**
1.  Instead of `page.waitForTimeout(5000)`, always use explicit visibility assertions: `await expect(page.locator('.processing-done')).toBeVisible({ timeout: 15000 })`.
2.  In `playwright.config.ts`, increase the global action timeout if required for specific known-slow routes like upload components.

## 3. Data Pollution & Collisions

**Symptom:** "Policy already exists" errors or "Count expected 5, got 6".
**Diagnosis:** E2E tests are running concurrently against the same Supabase database. If Test A uploads a policy and Test B asserts the total policy count on the dashboard simultaneously, race conditions occur.
**Resolution:**
1.  **Isolated Users:** Ensure each `test.describe` block creates a completely unique, randomized user account via the service role key, and executes tests isolated to that user UID.
2.  **Teardown Hooks:** Implement an `afterAll` hook that aggressively deletes the test user using the Supabase Admin API, which cascades and cleans up `policies` and `policy_documents`.

## 4. Debugging Artifacts in CI

When a test fails in GitHub Actions, Playwright automatically records traces and DOM snapshots.

1. Go to the GitHub Actions run summary.
2. Scroll to the **Artifacts** section at the bottom.
3. Download `playwright-report`.
4. Run locally:
   ```bash
   npx playwright show-report path/to/extracted/folder
   ```
5. Click **Trace** next to the failed test to see a full chronological timeline, network traffic, and DOM snapshots leading to the failure.
