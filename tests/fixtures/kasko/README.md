# Kasko Smoke Test Fixtures

PDFs in this directory are used by `npm run smoke:kasko` to verify that vehicle
extraction (`raw_data.vehicleInfo.make` / `.model`) is populated correctly on the
production deploy.

## Naming convention

```
<insurer>-<make>.pdf
```

Examples:

- `axa-peugeot.pdf` — AXA inverted-layout PDF where the value precedes the label
  (regression target for gotcha #103)
- `anadolu-renault.pdf` — Anadolu standard tabular layout
- `allianz-ford.pdf` — Allianz multi-page format

Lowercase, ASCII only, hyphens between words. The naming is **descriptive** —
the smoke runner picks fixtures up via `fixtures.json`, not via filename pattern.

## Manifest format — `fixtures.json`

Every fixture in this directory must be declared in `fixtures.json`:

```json
{
  "fixtures": [
    {
      "file": "axa-peugeot.pdf",
      "expectedMake": "PEUGEOT",
      "expectedModel": "208",
      "insurer": "AXA Sigorta",
      "notes": "Inverted layout — value precedes label on the same line"
    }
  ]
}
```

### Field reference

| Field | Required | Notes |
|---|---|---|
| `file` | yes | PDF filename relative to this directory |
| `expectedMake` | yes | Substring of expected `vehicleInfo.make` (case-insensitive) |
| `expectedModel` | no | Substring of expected `vehicleInfo.model` (case-insensitive). Omit to skip model assertion |
| `insurer` | yes | Display name shown in the per-fixture log line |
| `forbiddenPhrases` | no | Cross-insurer state-leak guard (Test A). Insurer-specific terminology that MUST NOT appear in this fixture's extraction output. The smoke runner JSON-serializes the extracted policy data and substring-checks each phrase. E.g. `"CASU"` (AXA's contracted glass network) on a non-AXA fixture, `"AS+ Yetkili Servis"` on a non-Anadolu fixture. Catches AI cross-insurer hallucination + hardcoded string regressions. |
| `notes` | no | Free-text reminder of why this fixture exists |

### Test A — Cross-Insurer State Leak coverage

Round-4 reviewer (May 2026) called for an explicit cross-insurer leak test
verifying no insurer-specific terminology carries between policies. This is
covered at three layers:

1. **Extraction layer**: `forbiddenPhrases[]` per fixture above. Runs on every
   push to main via `.github/workflows/smoke-kasko.yml` (gotcha #136).
2. **Rendering layer**: `src/lib/reviewer/__tests__/cross-insurer-leak.test.ts`
   exercises the canonical reviewer-summary builder with synthetic AXA /
   Anadolu / Allianz fixtures and asserts no marker leakage. Runs in the
   normal Vitest suite.
3. **(Future) UI layer**: Playwright spec at `e2e/cross-insurer-leak.spec.ts`
   (deferred — requires LLM mocking or live API budget). Adding only when a
   regression slips past layers 1 + 2.

Pass criteria for layers 1 + 2: zero violations. A single hit on any layer
fails the whole gate.

The smoke runner uses **case-insensitive substring** matching for both make and
model — so `expectedMake: "FORD"` matches `"Ford"`, `"FORD MOTOR"`, etc. Pick
the shortest unambiguous substring.

## Running

```bash
npm run smoke:kasko
```

Required env (the script fails fast with a friendly message if any is missing):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `SMOKE_UPLOAD_URL` — full URL of the upload endpoint
- `SMOKE_AUTH_TOKEN` — Bearer token for the upload request

Pass criteria: ≥ 80% of fixtures must pass. Exit code is 0 on pass, 1 on fail,
2 on setup error.

## Privacy note

Real customer policies often contain personal data (TC Kimlik, plate, address).
**Only commit fixtures that have been redacted** or that you've created/synthesized
yourself. The `.gitignore` in this directory ignores `*.pdf` by default to make
this safe — if a fixture is safe to commit, force-add it explicitly:

```bash
git add -f tests/fixtures/kasko/synthetic-fixture.pdf
```

`fixtures.json` and this README are always committed.

## Adding a new fixture

1. Drop the PDF into this directory using the naming convention above.
2. Add an entry to `fixtures.json` with the expected vehicle make.
3. Run `npm run smoke:kasko` locally with all four env vars set to verify the
   fixture passes against current production.
4. If the PDF is safe to commit (redacted or synthesized), force-add it.
   Otherwise leave it gitignored — anyone running the smoke locally must drop
   their own copy.
5. The CI job (`.github/workflows/smoke-kasko.yml`) only sees committed
   fixtures, so unsafe-to-commit PDFs will be skipped in CI with a warning.
