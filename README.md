# insurai

**AI-powered insurance policy analysis platform for Turkish market professionals**

Upload PDF policies, extract structured data with AI, and benchmark coverage against market standards.

[![Tests](https://img.shields.io/badge/tests-5800%2B%20passing-brightgreen)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-blue)]()
[![React](https://img.shields.io/badge/React-18.3-61dafb)]()

**Live**: [insurai-production.up.railway.app](https://insurai-production.up.railway.app)

---

## Features

- **AI Policy Extraction** - Extract coverage limits, deductibles, exclusions from PDF policies using OpenAI, Anthropic, or Google Document AI
- **OCR Support** - Automatic OCR for scanned documents with Google Vision API
- **Market Benchmarking** - Compare policies against Turkish market standards
- **Gap Detection** - Identify missing coverages, under-insurance, and risky exclusions
- **Policy Scoring** - A-F grades based on coverage, value, and compliance
- **Multi-turn Chat** - Ask questions about your policies with AI assistant
- **Email Notifications** - Policy expiration reminders and alerts
- **PWA Support** - Install as app on mobile/desktop

### Supported Policy Types

| Type | Turkish | Status |
|------|---------|--------|
| Kasko | Kasko Sigortası | Full support |
| Traffic | Trafik Sigortası | Full support |
| Property | Konut/İşyeri | Full support |
| DASK | Deprem Sigortası | Full support |
| Health | Sağlık Sigortası | Full support |
| Life | Hayat Sigortası | Full support |

---

## Quick Start

For a detailed, foolproof guide to setting up your local environment (including Supabase local dev), see the **[Zero to Hero Local Setup Guide](docs/development/local-setup.md)**.

### Prerequisites

- Node.js 18+
- npm 9+
- Supabase account (for auth/database)
- AI API keys (OpenAI, Anthropic, or Google)

### Installation

```bash
# Clone repository
git clone https://github.com/prekic/insurai.git
cd insurai

# Install dependencies
npm install

# Copy environment template
cp .env.example .env
# Edit .env with your API keys (see Environment Variables below)

# Start development (frontend + backend)
npm run dev:all

# Open http://localhost:5173
```

---

## Environment Variables

Create `.env` in project root:

```env
# Frontend (VITE_ prefix - embedded in JS bundle at build time)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_PROXY_URL=http://localhost:4001

# Backend (server-side only - NEVER use VITE_ prefix for secrets)
API_PORT=4001
FRONTEND_URL=http://localhost:5173
NODE_ENV=development

# AI Providers (at least one required)
OPENAI_API_KEY=sk-proj-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
GOOGLE_CLOUD_API_KEY=AIza...

# Supabase (server-side)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Admin Dashboard
ADMIN_JWT_SECRET=your-random-secret-here

# Email (optional)
RESEND_API_KEY=re_xxx
```

---

## Tech Stack & Architecture

For a comprehensive diagram of our data flows, API boundaries, and system topology, see our **[System Architecture Guide](docs/ARCHITECTURE.md)**.


| Layer | Technology | Version |
|-------|------------|---------|
| Frontend | React + TypeScript | 18.3 / 5.6 |
| Styling | Tailwind CSS | v4 |
| Routing | React Router | v7 |
| Build | Vite | v6 |
| Backend | Express + TypeScript | v4.21 |
| Database | Supabase (PostgreSQL) | - |
| Auth | Supabase Auth | - |
| AI | OpenAI, Anthropic, Google | Multi-provider |
| PDF | pdf.js (browser), pdf-parse (server) | v5.4 |
| Email | Resend | - |
| Monitoring | Sentry | v10 |
| Testing | Vitest + Playwright | v2.1 / v1.57 |

---

## Project Structure

```
insurai/
├── src/
│   ├── components/           # React components
│   │   ├── ui/              # Base UI (Button, Card, Dialog)
│   │   ├── landing/         # Landing page sections
│   │   ├── evaluation/      # Policy scoring UI
│   │   └── admin/           # Admin dashboard
│   ├── lib/
│   │   ├── ai/              # AI extraction, OCR, prompts
│   │   ├── supabase/        # Auth, database operations
│   │   ├── gap-detection/   # Coverage gap analysis
│   │   ├── policy-evaluation/ # Policy scoring
│   │   └── pipeline/        # OCR cleanup pipeline
│   ├── hooks/               # Custom React hooks
│   ├── types/               # TypeScript definitions
│   └── data/                # Market data, regulations
├── server/
│   ├── index.ts             # Express server (port 4001)
│   ├── routes/              # API routes (ai, admin, email)
│   ├── middleware/          # Auth, rate limiting, validation
│   └── services/            # Email, admin, prompts
├── supabase/
│   └── migrations/          # Database schema
├── e2e/                     # Playwright E2E tests
├── public/                  # Static assets, PWA manifest
└── docs/                    # Deployment guides
```

---

## Scripts

```bash
# Development
npm run dev           # Frontend only (port 5173)
npm run dev:server    # Backend only (port 4001)
npm run dev:all       # Both frontend + backend

# Build
npm run build         # Production build (frontend)
npm run build:server  # Production build (backend)

# Testing
npm test              # Run all unit tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
npm run test:e2e      # Playwright E2E tests

# Code Quality
npm run lint          # ESLint check
npm run typecheck     # TypeScript check
npm run validate      # typecheck + lint + test
```

---

## API Endpoints

| Endpoint | Method | Purpose | Rate Limit |
|----------|--------|---------|------------|
| `/api/ai/extract/openai` | POST | Extract with GPT-4o | 20/hr |
| `/api/ai/extract/anthropic` | POST | Extract with Claude | 20/hr |
| `/api/ai/chat` | POST | Policy chat assistant | 60/hr |
| `/api/ai/ocr` | POST | Google Vision OCR | 30/hr |
| `/api/email/preferences` | GET/PUT | Email preferences | - |
| `/api/admin/login` | POST | Admin authentication | - |
| `/api/health` | GET | Server health check | 60/min |

---

## Deployment

### Railway (Current Production)

The app is deployed on Railway with both frontend and backend in a single service.

**Live URL**: https://insurai-production.up.railway.app

```bash
# Railway auto-deploys on push to main branch
git push origin main
```

Required Railway environment variables:
- `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_CLOUD_API_KEY`
- `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_JWT_SECRET`
- `NODE_ENV=production`

### Manual Deployment

```bash
# Build for production
npm run build && npm run build:server

# Start production server
NODE_ENV=production node dist-server/index.js
```

---

## Testing

> **Note**: For critical rules on mocked Supabase clients, i18n chunking, and Playwright gotchas, read the **[Core Development Playbook](docs/development/CORE_PLAYBOOK.md)**.

```bash
# Run all tests (5800+ tests)
npm test

# Run with coverage
npm run test:coverage

# E2E tests
npm run test:e2e

# Specific test file
npm test -- --run src/lib/policy-utils.test.ts
```

---

## Admin Dashboard

Access at `/admin` with credentials stored in `admin_users` table.

Features:
- AI prompt management
- User management
- System configuration
- Audit logs
- Document journey viewer

---

## Smoke Tests

A post-deploy smoke test verifies vehicle extraction quality on real kasko PDFs
without manual upload + SQL.

### Running locally

```bash
SUPABASE_URL=https://...supabase.co \
SUPABASE_SERVICE_KEY=<service-role-key> \
SMOKE_UPLOAD_URL=https://insurai-production.up.railway.app/api/policy/save-anonymous \
SMOKE_AUTH_TOKEN=<bearer-token> \
npm run smoke:kasko
```

For each PDF in `tests/fixtures/kasko/` the script POSTs the file to
`SMOKE_UPLOAD_URL`, polls Supabase for the resulting policy row (≤ 30s),
checks `raw_data.vehicleInfo.make` / `.model`, and asserts the make matches the
expected value declared in `tests/fixtures/kasko/fixtures.json`.

Pass criteria: ≥ 80% of fixtures must pass. Exit codes: 0 pass, 1 fail, 2 setup
error (missing env, no fixtures, unparseable manifest).

### Required env vars

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL — same value the server uses |
| `SUPABASE_SERVICE_KEY` | Service-role key (bypasses RLS for the poll) |
| `SMOKE_UPLOAD_URL` | Full URL of the upload endpoint |
| `SMOKE_AUTH_TOKEN` | Bearer token sent on the upload request |

### Adding a new fixture

1. Drop a PDF into `tests/fixtures/kasko/` named `<insurer>-<make>.pdf`.
2. Add an entry to `tests/fixtures/kasko/fixtures.json`:
   ```json
   {
     "file": "axa-peugeot.pdf",
     "expectedMake": "PEUGEOT",
     "expectedModel": "208",
     "insurer": "AXA Sigorta",
     "notes": "Inverted layout regression target"
   }
   ```
3. Run `npm run smoke:kasko` to verify it passes against current production.
4. If the PDF is safe to commit (redacted or synthesized), force-add it
   (`git add -f tests/fixtures/kasko/...pdf`). PDFs are gitignored by default
   to keep customer data out of the repo. See
   `tests/fixtures/kasko/README.md` for full conventions.

### CI integration

`.github/workflows/smoke-kasko.yml` runs the smoke on three triggers:

1. **`workflow_dispatch`** — manual button in the Actions UI
2. **`repository_dispatch` with type `railway-deploy-success`** — preferred:
   Railway pings GitHub after a successful deploy. Wire it once with:
   ```bash
   curl -X POST https://api.github.com/repos/<owner>/<repo>/dispatches \
     -H "Authorization: Bearer <github-pat-with-repo-scope>" \
     -H "Accept: application/vnd.github+json" \
     -d '{"event_type":"railway-deploy-success"}'
   ```
   Configure that as a Railway post-deploy webhook (Railway docs:
   <https://docs.railway.com/reference/webhooks>).
3. **`push` to `main`** — fallback trigger that sleeps 150s before running
   so Railway's autodeploy has time to finish. Use this until the
   `repository_dispatch` webhook is wired up; remove later if redundant.

On failure (push trigger only) the workflow auto-comments on the most
recent merged PR with the smoke output tail and a link to the run.

### GitHub Secrets required

The workflow reuses existing repo secrets where possible, so you only need to
**add 2 new secrets**:

| Secret | Purpose | Already exists? |
|---|---|---|
| `PROD_SUPABASE_URL` | Supabase project URL | ✅ already in repo |
| `PROD_SUPABASE_SERVICE_KEY` | Service-role key (NOT anon) — bypasses RLS for the poll | ❌ **must add** |
| `PRODUCTION_SERVER_URL` | Railway origin (e.g. `https://insurai-production.up.railway.app`) | ✅ already in repo |
| `SMOKE_AUTH_TOKEN` | Bearer token sent on the upload request | ❌ **must add** (any non-empty string for now — `/api/policy/save-anonymous` doesn't enforce it yet) |

The workflow constructs `SMOKE_UPLOAD_URL` automatically as
`${PRODUCTION_SERVER_URL}/api/policy/save-anonymous`. If you later add a
dedicated `/api/policy/upload-and-extract` endpoint, change the path in
`.github/workflows/smoke-kasko.yml`.

---

## Contributing

Personal project by Erdem. See `CLAUDE.md` for development conventions.

---

## License

All rights reserved. Contact for licensing inquiries.

---

*Last updated: January 2026*
