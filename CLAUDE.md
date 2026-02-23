# CLAUDE.md

> Context file for Claude Code sessions on the insurai project

## Project Overview

**insurai** is an insurance policy analysis platform for Turkish market professionals. Upload PDF policies, extract structured data with AI, and benchmark coverage against market standards.

- **Owner**: Erdem (personal project)
- **Production URL**: https://insurai-production.up.railway.app
- **Production Readiness**: ~9.5/10
- **Last Updated**: February 23, 2026

---

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Frontend | React + TypeScript | 19.2 / 5.9.3 |
| Styling | Tailwind CSS | v4 |
| Routing | React Router | v7 |
| Build | Vite | v7 |
| Backend | Express + TypeScript | v5 |
| Database | Supabase (PostgreSQL) | - |
| Auth | Supabase Auth | - |
| AI | OpenAI, Anthropic, Google Vision | Multi-provider |
| PDF | pdf.js (browser), pdf-parse (server), pdf-lib (splitting) | v5.4 |
| Monitoring | Sentry | v10 |
| Testing | Vitest + Playwright | v4 / v1.58 |
| Push | Web Push API (VAPID) | web-push v3.6 |
| Node | Node.js | >=20 |

---

## Commands

```bash
# Development
npm run dev           # Frontend only (port 5173)
npm run dev:server    # Backend only (port 4001)
npm run dev:all       # Both frontend + backend (recommended)

# Build
npm run build         # Production frontend build (tsc + vite)
npm run build:server  # Production server build (tsc)
npm run build:analyze # Bundle analysis (generates stats.html)

# Testing
npm test              # Run all 15,427 unit tests (vitest)
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
npm run test:e2e      # Playwright E2E (all browsers)
npm run test:e2e:fast # Playwright Chromium only
npm run test:e2e:ui   # Playwright with visual inspector

# Quality
npm run lint          # ESLint (0 errors, 0 warnings)
npm run typecheck     # TypeScript type check
npm run validate      # typecheck + lint + test (full CI check)
npm run format        # Prettier formatting
```

**Ports**: Frontend = 5173, Backend = 4001

---

## Project Structure

```
insurai/
├── src/
│   ├── components/              # React components
│   │   ├── ui/                  # Base UI (Button, Card, Dialog, Badge, etc.)
│   │   ├── landing/             # Landing page sections (Hero, Benefits, FAQ, Stats, etc.)
│   │   ├── evaluation/          # Policy grading UI (GradeBadge, ScoreBreakdown)
│   │   ├── insurance-lines/     # Policy-type-specific detail components
│   │   ├── animations/          # CSS animation wrappers (no framer-motion in main bundle)
│   │   ├── admin/               # Admin dashboard + tabs
│   │   │   └── tabs/            # AdminDashboard tab panels
│   │   │       └── settings/    # Settings sub-panels (AI, OCR, Evaluation, etc.)
│   │   └── notifications/       # Push notification UI components
│   ├── lib/
│   │   ├── ai/                  # AI extraction pipeline
│   │   │   ├── providers/       # OpenAI, Anthropic (Claude) adapters
│   │   │   ├── cache/           # Response caching (IndexedDB)
│   │   │   └── cost-tracking/   # API usage tracking
│   │   ├── config/              # Three-tier configuration system
│   │   ├── i18n/                # Internationalization (TR/EN, lazy-loaded chunks)
│   │   ├── supabase/            # Auth, policies, database operations
│   │   ├── gap-detection/       # Coverage gap analysis engine
│   │   ├── regional-benchmark/  # Turkish regional risk factors
│   │   ├── policy-evaluation/   # Policy grading and comparison
│   │   ├── market-data/         # Market benchmarks (DB-first + static fallback)
│   │   ├── pipeline/            # OCR cleanup pipeline (sanitizer, QA gates, chunker)
│   │   ├── ocr-decision/        # Configuration-driven OCR decision engine
│   │   ├── knowledge/           # Turkish insurance knowledge base
│   │   ├── privacy/             # GDPR/KVKK compliance
│   │   ├── pdf-export/          # PDF report generation
│   │   ├── security/            # Audit logging, rate limiting, sanitization
│   │   ├── pwa/                 # Service worker, push notifications, offline sync
│   │   └── admin/               # Admin API client, settings validation, templates
│   ├── hooks/                   # Custom React hooks
│   ├── types/                   # TypeScript type definitions
│   ├── data/                    # Static data (regulations, coverage limits, sample policies)
│   └── __tests__/               # Integration & performance tests
├── server/
│   ├── index.ts                 # Express entry point (port 4001)
│   ├── routes/
│   │   ├── ai.ts                # AI extraction, chat, OCR endpoints
│   │   ├── admin/               # Admin API (9 modules)
│   │   │   ├── index.ts         # Router aggregator
│   │   │   ├── auth.ts          # Login, sessions, diagnostics
│   │   │   ├── users.ts         # User management
│   │   │   ├── prompts.ts       # AI prompt template CRUD
│   │   │   ├── operations.ts    # Audit logs, security events
│   │   │   ├── monitoring.ts    # Health, metrics, notifications
│   │   │   ├── content.ts       # Content management
│   │   │   ├── cost.ts          # Cost tracking
│   │   │   └── shared.ts        # Shared utilities (Supabase client)
│   │   ├── settings.ts          # Configuration API
│   │   ├── notifications.ts     # Push notification endpoints
│   │   ├── translations.ts      # Translation CRUD API
│   │   ├── internal.ts          # Cron endpoints (policy expiry notifications)
│   │   ├── drift.ts             # Config drift detection
│   │   ├── webhooks.ts          # Settings change webhooks
│   │   ├── email.ts             # Email endpoints
│   │   └── pdf.ts               # PDF quality analysis
│   ├── middleware/               # Auth, rate limiting, validation, cost control
│   ├── lib/                     # Server utilities (Sentry, structured logger)
│   ├── services/                # Business logic services
│   └── __tests__/               # Server API tests
├── e2e/                         # 9 Playwright E2E spec files
├── config/                      # OCR decision engine JSON configs
│   ├── locales/                 # Language configs (tr.json, en.json, de.json)
│   ├── policy_types/            # Policy type configs (motor, property, health)
│   └── ocr-settings.json        # OCR thresholds and weights
├── supabase/migrations/         # 21 database migrations
├── .github/workflows/           # CI/CD (staging, production, cron)
├── public/                      # Static assets, PWA manifest, service worker (sw.js)
├── docs/                        # Deployment guides
└── scripts/                     # Utility scripts (load-test, config perf baseline)
```

---

## Architecture Overview

### Data Flow: PDF Upload & Extraction

```
User drops PDF
  → PolicyUpload component
  → pdf.js (browser-side text extraction)
  → Check density: < 100 chars/page?
      YES → Google Vision OCR via /api/ai/ocr → Document AI (15-page chunk limit)
      NO  → Direct to AI
  → AI Extraction via /api/ai/extract (OpenAI or Anthropic)
      → Zod schema validation
      → Coverage nameTr resolution (canonical EN→TR map)
      → AI insights translated to Turkish (aiInsightsTr)
      → Gap detection + market comparison
  → Pre-upload duplicate check (fuzzy OCR-tolerant matching)
      → Conflict resolution if match found
  → Save to Supabase (policy + document)
  → Push notification sent (fire-and-forget)
```

### Three-Tier Configuration

```
System Defaults (src/lib/config/types.ts)
  ↓ overridden by
Admin Settings (app_settings DB table, managed via Admin Dashboard)
  ↓ overridden by
User Preferences (user_preferences DB table, per-user)
```

All 843+ previously hardcoded values are configurable. `ConfigurationService` has a 5-minute in-memory cache.

### Navigation Architecture (Dual Nav Systems)

- **Landing page** (`/`): Uses `Hero.tsx` built-in nav (logo, links, Globe language picker, Sign In)
- **App pages** (all other routes): Uses `GlobalNavigation.tsx` (logo, links, Globe picker, notifications, profile)
- `hideNavigation` in `App.tsx` controls which pages hide GlobalNavigation: `/`, `/auth`, `/admin/*`, `/unsubscribe`
- Pages with GlobalNavigation should NOT have their own back arrows

### i18n Architecture (Lazy-Loaded)

```
Main bundle (~259 KB gzip)
  └── translations-skeleton.ts (all empty strings — zero cost)

Async chunks (loaded on demand per locale):
  └── translations-en-*.js (~12 KB gzip)
  └── translations-tr-*.js (~14 KB gzip)
```

- Default locale: `'tr'` (Turkish market focus)
- Locale persisted in localStorage under `'insurai_locale'`
- Initial render uses empty skeleton, async loads real translations
- DB-driven translation system with admin management UI

### Authentication Flow

```
User → Login/Signup → Supabase Auth → JWT in localStorage → AuthContext
  → Protected routes: /dashboard, /upload, /chat, /compare, /settings, /account
  → Public routes: /, /auth, /try, /samples, /help, /shared/:id, /unsubscribe
  → Admin routes: /admin/* (separate JWT via ADMIN_JWT_SECRET)
```

### AI Provider Architecture

```
Server (port 4001)
  ├── /api/ai/extract/openai     → OpenAI GPT-4o (JSON response_format)
  ├── /api/ai/extract/anthropic  → Claude (ANTHROPIC_SCHEMA_PROMPT for JSON)
  ├── /api/ai/extract            → Unified endpoint (preferred provider + fallback)
  ├── /api/ai/chat               → Multi-turn policy chat
  ├── /api/ai/ocr                → Google Vision + Document AI OCR
  └── /api/ai/providers          → Check configured providers
```

- SDK imports are dynamic (lazy-loaded) to keep bundle small
- `proxy-utils.ts` provides lightweight proxy checks without SDK imports
- Anthropic uses `ANTHROPIC_SCHEMA_PROMPT` (full JSON schema in prompt text) since it lacks `response_format`

### Extraction Pipeline (6 Stages)

```
extractPolicyFromDocument() pipeline:

Stage 1: PDF TEXT EXTRACTION
  ├─ Try Document AI (Google Vision) — 15-page chunk limit
  ├─ Fallback: pdf.js (native text extraction)
  └─ Density check: chars_per_page < 200 → scanned (OCR), >= 200 → digital

Stage 2: TEXT PRE-PROCESSING
  ├─ Deterministic: Turkish spacing fixes ("B İ RLE Şİ K" → "BİRLEŞİK")
  └─ AI-enhanced: Context-aware OCR error correction

Stage 3: FORM FIELD ENHANCEMENT (from Document AI metadata)
  └─ Refine policy number, insured name, dates, premium from structured fields

Stage 4: TURKISH PATTERN VALIDATION
  └─ Validate TC Kimlik, IBAN, phone, plate numbers, dates via regex

Stage 5: TABLE PARSING (coverage extraction from Document AI tables)
  └─ Merge table data with AI coverages using confidence scoring

Stage 6: AI EXTRACTION + CONVERSION
  ├─ extractWithConsensus() or single provider
  ├─ convertToAnalyzedPolicy() — coverage nameTr, AI insights TR, gap analysis
  └─ Result: ExtractionResult { success, policy, extractedData, consensus }
```

### Confidence Scoring

```typescript
// Per-field weights for overall confidence (0-1):
policyNumber: 0.20, provider: 0.15, dates: 0.20, premium: 0.20, coverages: 0.25

// Two thresholds:
< 0.4  → REJECTED (extraction fails)
0.4-0.7 → WARNING (show "Low Confidence" banner)
> 0.7  → PASS (normal extraction)
```

### Prompt Service (`server/services/prompt-service.ts`)

- DB-first with 5-minute TTL cache, hardcoded fallback if DB unavailable
- 16 seeded templates: 9 extraction, 1 chat, 3 OCR, 3 analysis
- Template variables: `{{var}}` and `{{#if var}}...{{/if}}` syntax
- Admin CRUD via Prompts tab in Admin Dashboard

### File Upload Handoff Patterns

Two different patterns exist for passing files between components:

**Pattern 1 — React Router State** (Hero.tsx → TryAnalysis/PolicyUpload):
```tsx
// Sender
navigate('/try', { state: { file: validFiles[0] } })
// Receiver — must clear state after processing
const fileFromState = (location.state as LocationState)?.file
if (fileFromState && !processedRef.current) {
  processedRef.current = true
  processFile(fileFromState)
  navigate(location.pathname, { replace: true, state: null })  // Clear
}
```

**Pattern 2 — CustomEvent + sessionStorage** (GlobalNavigation → PolicyUpload):
```tsx
// Sender — Files can't be serialized, so use CustomEvent for File objects
const event = new CustomEvent('filesSelected', { detail: validFiles })
window.dispatchEvent(event)
navigate('/upload', { state: { filesReady: true } })
// Receiver — PolicyUpload listens for 'filesSelected' event
```

Both patterns use a `useRef` boolean to prevent duplicate processing on remount.

---

## API Endpoints

| Endpoint | Method | Purpose | Rate Limit |
|----------|--------|---------|------------|
| `/api/ai/extract/openai` | POST | Extract policy with GPT-4o | 20/hr |
| `/api/ai/extract/anthropic` | POST | Extract policy with Claude | 20/hr |
| `/api/ai/extract` | POST | Unified extraction (auto-provider) | 20/hr |
| `/api/ai/chat` | POST | Multi-turn policy chat | 60/hr |
| `/api/ai/ocr` | POST | Google Vision OCR | 30/hr |
| `/api/ai/providers` | GET | Check configured AI providers | - |
| `/api/ai/diagnose` | GET | Test API key validity | - |
| `/api/health` | GET | Server health check | 60/min |
| `/api/notifications/*` | GET/POST/DELETE | Push notification management | 10/15min |
| `/api/admin/*` | Various | Admin dashboard API (9 modules) | varies |
| `/api/admin/settings/*` | Various | Configuration management | - |
| `/api/translations/*` | Various | Translation CRUD + AI bulk translate | - |
| `/api/email/*` | Various | Email capture, unsubscribe | 10/15min |
| `/api/pdf/extract` | POST | PDF text quality analysis | 20/hr |
| `/api/internal/cron/*` | POST | Cron jobs (CRON_SECRET auth) | - |

---

## Database Schema

### Core Tables

| Table | Purpose |
|-------|---------|
| `users` | User profiles (extends auth.users) |
| `policies` | Extracted policy data (JSONB raw_data for coverages/exclusions) |
| `policy_documents` | Uploaded PDF file references |
| `chat_conversations` | PolicyChat conversation history |
| `app_settings` | Admin-configurable settings (key-value with JSON schemas) |
| `settings_audit_log` | Audit trail for settings changes |
| `user_preferences` | Per-user preference overrides |
| `market_benchmarks` | Insurance market benchmark data by policy type |
| `insurance_providers` | Turkish insurance provider directory (15 providers) |
| `regional_factors` | Regional risk adjustment factors (7 regions) |
| `feature_flags` | Feature flag configuration |
| `admin_users` / `admin_sessions` | Admin authentication |
| `prompt_templates` / `prompt_versions` | AI prompt management |
| `translation_locales` / `translation_keys` / `translations` | DB-driven i18n |
| `push_subscriptions` | Web Push subscription storage |

### Policy Table (Core)

```sql
policies (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  policy_number TEXT NOT NULL,
  provider TEXT NOT NULL,
  type TEXT CHECK (type IN ('kasko','traffic','home','health','life','dask','business')),
  coverage NUMERIC NOT NULL,
  premium NUMERIC NOT NULL,
  deductible NUMERIC DEFAULT 0,
  start_date DATE, expiry_date DATE,
  status TEXT CHECK (status IN ('active','expiring','expired','pending')),
  insured_person TEXT NOT NULL,
  raw_data JSONB,  -- Full AI extraction results, coverages, exclusions
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
```

### Migrations (21 files in `supabase/migrations/`)

Applied via Supabase Dashboard SQL Editor (not CLI). Key migrations:
- `001-003`: Initial schema, storage, security
- `005a-005b`: Admin schema and tables
- `006`: Seeds 16 AI prompts
- `012-013`: Configuration system + seed defaults
- `017-020`: Translation system + seeds (685+ keys x 2 languages)
- `021`: Push subscriptions table

---

## Environment Variables

```bash
# Frontend (VITE_ prefix — baked at build time)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX  # Optional

# Backend (server-side only — NEVER use VITE_ prefix for secrets)
API_PORT=4001
NODE_ENV=development
OPENAI_API_KEY=sk-proj-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
GOOGLE_CLOUD_API_KEY=AIza...
GCP_SERVICE_ACCOUNT_BASE64=...  # Base64-encoded service account JSON for Document AI

# Server-side Supabase (REQUIRED for admin panel)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# Admin auth (REQUIRED)
ADMIN_JWT_SECRET=<64-char-hex>  # Generate: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Push Notifications (REQUIRED in production)
VAPID_PUBLIC_KEY=...    # Generate: node -e "const wp=require('web-push');console.log(JSON.stringify(wp.generateVAPIDKeys(),null,2))"
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:contact@insurai.com

# Cron (for policy expiry notifications)
CRON_SECRET=<32-char-hex>  # Generate: openssl rand -hex 32
```

**Critical Rules**:
1. API keys must NEVER have `VITE_` prefix
2. `VITE_*` vars are baked at **build time** — need rebuild, not just restart
3. `VITE_API_PROXY_URL` is NOT needed in production — auto-detected from `window.location.origin`
4. Use `/api/admin/diagnostics` to debug missing env vars in production

---

## Testing

### Test Counts (as of Feb 23, 2026)
- **Unit/Integration**: 15,427 tests across 317 files (0 failures, 18 skipped)
- **E2E**: 186 Playwright tests (9 spec files)
- **Coverage**: ~91.67% statements, ~85.91% branches, ~92.5% lines
- **ESLint**: 0 errors, 0 warnings

### Test Organization
```
*.test.ts / *.test.tsx    — Unit tests (co-located with source)
src/__tests__/            — Integration & performance tests
server/__tests__/         — Server API tests (60+ files)
e2e/                      — Playwright E2E specs (9 files)
```

### Running Tests
```bash
npm test                                    # All unit tests
npm test -- --run src/lib/policy-utils.test.ts  # Single file
npm run test:coverage                       # With coverage report
npm run test:e2e:fast                       # E2E Chromium only
npm run validate                            # Full CI check (types + lint + tests)
```

### Test Patterns

**i18n mock** (required for most component tests):
```tsx
import { EN_TRANSLATIONS } from '@/lib/i18n/translations-en'
vi.mock('@/lib/i18n/i18n-context', () => ({
  useTranslation: () => ({ t: EN_TRANSLATIONS, locale: 'en', isLoading: false })
}))
```

**TR translations mock** (for policy-extractor tests):
```tsx
vi.mock('@/lib/i18n/translations-tr', () => ({
  TR_TRANSLATIONS: { /* minimal TR object */ }
}))
```

**Supabase mock** (module-level):
```tsx
const { mockSelect, mockInsert } = vi.hoisted(() => ({
  mockSelect: vi.fn(), mockInsert: vi.fn()
}))
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn(() => ({ from: vi.fn() })) }))
```

### Known Test Quirk
When running the full test suite, Vitest may report "1 error" — an unhandled rejection `window is not defined` from `PolicyUpload.test.tsx`. This is a pre-existing React 19 + JSDOM teardown race condition. All 317 files pass; the error has zero impact on results.

---

## Code Conventions

### File Naming
- `components/PolicyCard.tsx` — PascalCase for components
- `lib/policy-utils.ts` — kebab-case for utilities
- `hooks/usePolicyUpload.ts` — camelCase with `use` prefix
- `types/policy.ts` — lowercase for type files

### Component Pattern
```tsx
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { useTranslation } from '@/lib/i18n/i18n-context'
import type { Policy } from '@/types/policy'

interface PolicyCardProps { policy: Policy; onSelect?: (id: string) => void }

export function PolicyCard({ policy, onSelect }: PolicyCardProps) {
  const { t, locale } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  // hooks first, then derived state, then handlers, then render
  return <div>...</div>
}
```

### TypeScript
- Prefer `interface` for objects, `type` for unions
- Avoid enums — use `const` arrays with `as const` + TEXT CHECK in DB
- `useRef<T | undefined>(undefined)` (React 19 requires initial value)

### Tailwind
```tsx
<div className={cn("flex flex-col gap-4", "rounded-lg border", isActive && "border-blue-500")}>
```

### Server Logging
```typescript
import { logger } from '../lib/logger.js'
const log = logger.child('ModuleName')
log.info('message', { data })  // Structured JSON in production
```

---

## Utility Functions

### Core Utilities (`src/lib/utils.ts`)

```typescript
import { cn, formatCurrency, formatCurrencyCompact, formatDate, formatNumber } from '@/lib/utils'

cn("base-class", isActive && "active-class")     // Tailwind class merging (clsx + twMerge)
formatCurrency(15000)           // "₺15.000"      (zero decimals for TRY)
formatCurrency(15000.50)        // "₺15.001"      (rounded — no decimals)
formatCurrencyCompact(1200000)  // "₺1.2M"        (mobile-friendly)
formatCurrencyCompact(50000)    // "₺50K"
formatDate('2026-01-15')        // "15.01.2026"    (Turkish date format)
formatNumber(1500000)           // "1.500.000"     (Turkish thousands)
```

**Currency validation**: `validateCurrencyRegion('USD', 'Istanbul')` — warns on foreign currency for Turkish addresses. Supports 70+ currency symbols.

### Insurance Display Helpers (`src/lib/insurance-display.ts`)

```typescript
// Company name normalization (40+ mappings)
getShortCompanyName('ALLIANZ SİGORTA A.Ş.')  // → 'Allianz'
getShortCompanyName('ANADOLU ANONİM TÜRK SİGORTA ŞİRKETİ')  // → 'Anadolu Sigorta'
// 3-tier: exact match → partial pattern → suffix removal + truncate to 20 chars

// Coverage type by policy (determines how to display main coverage value)
getCoverageType('kasko')    // → 'sumInsured'  (vehicle value)
getCoverageType('traffic')  // → 'limit'       (bodily injury limit)
getCoverageType('health')   // → 'benefit'     (benefit amount)

// Main coverage value extraction (type-aware)
getMainCoverageValue(kaskoPolicy)    // → policy.coverage (vehicle value)
getMainCoverageValue(trafficPolicy)  // → Math.max(...bodily injury limits)

// Insured subject extraction (type-specific fallback chains)
getInsuredSubject(kaskoPolicy)   // → plate number or vehicle model
getInsuredSubject(homePolicy)    // → property address (truncated to 30 chars)
getInsuredSubject(healthPolicy)  // → insured person name
```

### Coverage Display Logic (`PolicyDetailView.tsx:formatCoverageLimit`)

4-tier priority for displaying coverage limits:
1. **Explicit flags**: `isUnlimited` → "Sınırsız", `isMarketValue` → "Rayiç Değer"
2. **Kasko knowledge**: `shouldShowUnlimited()` / `shouldShowIncluded()` from kasko-knowledge.ts
3. **Legacy detection**: Zero limit + pattern matching ("sınırsız", "rayiç", "asistans")
4. **Currency format**: `formatCurrency(limit)` or "Dahil" (included) if zero + included flag

### Coverage Categories (`src/lib/knowledge/kasko-knowledge.ts`)

| Category | Icon | Turkish Label | Color |
|----------|------|---------------|-------|
| `main` | Car | Ana Teminatlar | green |
| `liability` | Scale | Mali Sorumluluk | blue |
| `personal_accident` | Users | Ferdi Kaza | purple |
| `supplementary` | Briefcase | Ek Teminatlar | indigo |
| `assistance` | LifeBuoy | Asistans Hizmetleri | teal |
| `legal` | Gavel | Hukuki Koruma | slate |
| `other` | Shield | Diğer | gray |

UI groups coverages by category on PolicyDetailView with collapsible sections.

---

## Insurance-Specific Logic

### Supported Policy Types
| Type | Turkish Name | DB Value |
|------|-------------|----------|
| Auto Comprehensive | Kasko | `kasko` |
| Traffic/MTPL | Trafik Sigortası | `traffic` |
| Property/Fire | Yangın | `home` |
| Earthquake | DASK | `dask` |
| Health | Sağlık | `health` |
| Life | Hayat | `life` |
| Business | İşyeri | `business` |

### Kasko Implicit Coverages (DO NOT flag as missing)
- Çarpma/Çarpışma (Collision), Hırsızlık (Theft), Yangın (Fire), Doğal Afetler (Natural Disasters), Sel/Su Baskını (Flood)

### Coverage Special Values
| Condition | Display |
|-----------|---------|
| `isUnlimited: true` | "Sınırsız" |
| `isMarketValue: true` | "Rayiç Değer" |
| `limit === 0 && included` | "Dahil" |

### Coverage Name Translation
- `src/lib/i18n/coverage-names.ts` — canonical EN→TR map (90+ entries, single source of truth)
- Resolved at extraction time in `policy-extractor.ts`
- `PolicyDetailView` uses `getLocalizedCoverageName()` for display with legacy fallback

### Total Coverage Calculation (Policy-Type Aware)

```typescript
// KASKO: Use vehicle value only — do NOT sum all coverage limits
totalCoverage = policy.coverage  // or isMarketValue flag

// TRAFFIC: Use highest bodily injury limit (not sum)
totalCoverage = Math.max(...bodilyInjuryLimits)

// HOME/DASK/BUSINESS: Sum main category coverages
totalCoverage = mainCoverages.reduce((sum, c) => sum + c.limit, 0)
```

### Pre-Upload Duplicate Detection (`src/lib/policy-upload-check.ts`)

```
checkPolicyBeforeUpload(newPolicy) flow:
  1. Query by: policyNumber + provider + insuredPerson
  2. If no match → { type: 'noConflict' }
  3. If match → comparePoliciesAdvanced() → classify diff:
     - 'critical': policy/provider number changed
     - 'major': coverage or premium significantly different
     - 'moderate': dates changed
     - 'minor': formatting only
  4. Resolution options: skip | replace | keep_both | track_amendment
```

OCR-tolerant fuzzy matching handles character confusion: `0↔O`, `1↔l↔I`, `ı↔i↔İ`, `5↔s↔ş`, `8↔b↔B`

### Traffic Insurance Mandatory Limits (2025 SEDDK)

| Coverage | Per Person | Per Accident | Per Vehicle |
|----------|-----------|-------------|-------------|
| Bodily Injury | ₺2,700,000 | ₺13,500,000 | - |
| Material Damage | - | ₺600,000 | ₺300,000 |

These limits are **updated annually by SEDDK**. Source: `src/data/coverage-limits.ts`

### Turkish Regulatory Framework (`src/data/regulations.ts`)

8 regulation types: `law` (Kanun), `regulation` (Yönetmelik), `general_condition` (Genel Şartlar), `clause` (Kloz), `tariff` (Tarife), `circular` (Genelge), `communique` (Tebliğ), `guideline` (Rehber)

Key regulators: **SEDDK** (insurance regulator), **TSB** (insurance association), **DASK** (earthquake insurance), **TARSİM** (agricultural insurance)

### Evaluation Weights (Configurable via Admin)

```typescript
premium: 20, coverage: 30, deductible: 15, compliance: 20, value: 15
// Total: 100. Stored in app_settings DB table, overridable per-user.
```

### Gap Detection
```
analyzeGapsComprehensive(policy, options)
├── analyzeCoverageGaps()    — Missing coverage types
├── analyzeLimitGaps()       — Under/over-insured limits
├── analyzeDeductibleGaps()  — Deductible analysis
├── analyzeExclusionGaps()   — Dangerous exclusions
├── analyzeTemporalGaps()    — Coverage period issues
└── analyzeComplianceGaps()  — Regulatory compliance
```

Gap severity: `critical` (>=90% market inclusion) → `recommended` (70-89%) → `optional` (<70%)

### Policy Grading
| Score | Grade | Status |
|-------|-------|--------|
| >= 90 | A | excellent |
| 75-89 | B | good |
| 60-74 | C | fair |
| 40-59 | D | poor |
| < 40 | F | critical |

### Turkish Regions (7)
`marmara` (1.15x risk), `ege` (1.05x), `akdeniz` (1.08x), `ic_anadolu` (0.95x), `karadeniz` (0.90x), `dogu_anadolu` (0.85x), `guneydogu` (0.88x)

---

## Landing Page Architecture

### Section Order (`src/components/landing/`)

```
Hero              — Gradient bg, nav bar, UploadWidget, ComparisonMock
Benefits          — Feature grid (AI extraction, benchmarking, gap detection, etc.)
HowItWorks        — 3-step process (Upload → Analyze → Compare)
Stats             — 4 authentic metrics: 7 types, TR/EN, 15+ checks, <60s
Testimonials      — Use-case scenarios for 3 audience types (NOT fake quotes)
WhyChooseUs       — Authentic differentiators (KVKK, No Signup, Turkey-Focused)
CompareSection    — Interactive comparison demo (hidden on mobile)
FAQ               — Accordion with common questions
Footer            — Links, legal, social
StickyMobileCTA   — Floating mobile CTA button
```

**Mobile optimizations**: WhoItsFor, PolicyComparisonSection, and CompareSection hidden on mobile (covered by Testimonials). Stats use compact pill badges.

### ComparisonMock (Two Variants)

- **Desktop**: 3-column grid — Allianz Kasko A vs AXA Kasko B with feature rows (✓ / ✗ / ⚠)
- **Mobile**: Card layout with 3 summary items ("Best Coverage", "Lowest Premium", "AI Pick")
- Uses real provider names with disclaimer

### Stats — Authentic Metrics Only

```
7 Policy Types | TR/EN Languages | 15+ Coverage Checks | <60s Analysis
```

Each metric is verifiable from codebase. Replaced fabricated "4.9/5 rating", "15K+ users" in Feb 2026.

### Hero Component Structure

- Top utility bar (hidden on mobile): "Secure & Encrypted", "Licensed Advisors"
- Main nav: Logo, Dashboard, Compare, Upload button, Globe picker, Profile/Sign In
- Hero content (2-column desktop): headlines + UploadWidget | ComparisonMock
- Mobile hamburger menu with inline TR/EN language toggle
- File upload from nav: validates → branches on auth state → `/try` (anonymous) or `/upload` (logged in)

### Key Component Interfaces

```typescript
// PolicyUpload.tsx
type UploadState = 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error'
interface UploadedFile {
  id: string; file: File; status: UploadState; progress: number
  policy?: AnalyzedPolicy; error?: string
  extractionSource?: 'ai' | 'fallback' | 'ocr'
  lowConfidence?: boolean     // Between warningConfidence and minConfidence
  conflict?: PreUploadCheckResult
  awaitingResolution?: boolean
}

// TryAnalysis.tsx (free trial)
type AnalysisState = 'idle' | 'uploading' | 'analyzing' | 'complete' | 'error' | 'trial-used'
// Session-based: one analysis per anonymous user per 24h (localStorage)
// 90-second timeout with progress updates every 10 seconds

// ComparePolicies.tsx — URL-based state
// Format: /compare?ids=uuid1,uuid2,uuid3 (up to 4 policies, shareable)
```

---

## Deployment

### Railway (Production)

**Live**: https://insurai-production.up.railway.app

```json
// railway.json
{
  "build": {
    "builder": "NIXPACKS",
    "installCommand": "npm ci --include=dev",
    "buildCommand": "npm run build && npm run build:server"
  },
  "deploy": {
    "startCommand": "NODE_ENV=production node dist-server/index.js"
  }
}
```

Express serves both `/api/*` routes AND static files from the same origin — no CORS issues.

### CI/CD (GitHub Actions)

- **`staging.yml`**: Runs on staging branches + PRs to main. `validate` + `e2e-tests` in parallel → `build`
- **`production.yml`**: Runs on main push. Same parallel gates → deploy to Railway with health check + rollback
- **`notify-expiring.yml`**: Daily cron (08:00 UTC) — policy expiry push notifications

### Static Asset Caching
- `/assets/*` (hashed filenames): `max-age=31536000, immutable` (1 year)
- `index.html`, `sw.js`: `no-cache, must-revalidate` (always fresh)
- Service worker cache version: `v20` (bump in `public/sw.js` after deployments)

---

## Performance

### Lighthouse Scores (Production)
- Performance: 99, Accessibility: 100, Best Practices: 93, SEO: 100
- CLS: 0, FCP: 0.8s, LCP: 0.9s, TBT: 0ms

### Bundle Optimization
- Main chunk: ~259 KB gzip
- EN translations: ~12 KB gzip (async chunk)
- TR translations: ~14 KB gzip (async chunk)
- framer-motion removed from main bundle (CSS animations instead, -38 KB gzip)
- AI SDKs dynamically imported (only loaded when extraction runs)
- `proxy-utils.ts` avoids SDK bundling for status checks

### Key Optimizations
- App shell skeleton in `index.html` (prevents CLS from spinner→content shift)
- Opacity-only CSS animations (no y/x transforms that cause layout shifts)
- LandingPage eagerly imported (not lazy — it's the entry point)
- `compression` middleware (gzip: 67-87% reduction on text responses)
- HSTS header in production (`max-age=31536000; includeSubDomains`)
- `useLazySection` with `minHeight` to reserve space before content loads

---

## Security

- API keys server-side only (never `VITE_` prefix)
- Helmet security headers (CSP, XSS, HSTS)
- Rate limiting per IP (tiered by endpoint cost)
- Row Level Security on all Supabase tables
- HMAC-SHA256 unsubscribe tokens with timing-safe comparison
- `crypto.getRandomValues()` for share link IDs (not `Math.random()`)
- Admin JWT auth with bcrypt password hashing + role-based access
- PDF magic byte validation (`%PDF-` header check)
- Zod validation on all API request bodies
- KVKK/GDPR consent management
- JSON.parse guarded everywhere (no unhandled parse crashes)

---

## Critical Gotchas

### Environment & Config
- `VITE_*` vars need **rebuild**, not just restart
- Server needs `SUPABASE_URL` (not `VITE_SUPABASE_URL`) for runtime DB access
- Always import `crypto` explicitly in server code (don't rely on global)
- Use `/api/admin/diagnostics` to debug deployment config issues
- `CRON_SECRET` must be set in both Railway Variables AND GitHub Secrets

### Express & Routing
- **Express 5**: `app.get('*')` → `app.get(/.*/)` for universal wildcard
- **Route ordering**: Named routes (`/history`, `/regional-factors`) MUST come before `/:category` catch-all in `server/routes/settings.ts`
- **express-rate-limit v8**: Requires `validate: { keyGeneratorIpFallback: false }` on custom keyGenerators

### React
- **React 19**: `useRef<T>()` → `useRef<T | undefined>(undefined)` (requires initial value)
- **Rules of Hooks**: ALL hooks before ANY conditional returns
- **Exhaustive deps**: Use `useCallback` for simple cases, ref pattern for complex callback chains
- **Stale closures**: Don't check state inside async callbacks — use local variables

### AI Extraction
- **Never use `useFallback: true` in production** — `createFallbackResult()` returns random sample data, completely masking real errors
- Anthropic uses `ANTHROPIC_SCHEMA_PROMPT` (full JSON schema in prompt) since it lacks `response_format`
- Document AI has 15-page limit — PDFs >15 pages auto-split via `pdf-splitter.ts`
- `GCP_SERVICE_ACCOUNT_BASE64` for Railway (no file mounts)
- Google Cloud API key must have Cloud Vision API AND Cloud Document AI API enabled

### Bundle & Build
- **DO NOT** use aggressive catch-all `manualChunks` — causes `Cannot access 'X' before initialization`
- Only split truly independent large libraries (pdfjs-dist, pdf-lib)
- framer-motion is a dependency but NOT in the main chunk — don't re-add eager imports

### i18n
- `EN_TRANSLATIONS` → import from `translations-en.ts` (not `translations.ts`)
- `TR_TRANSLATIONS` → import from `translations-tr.ts` (not `translations.ts`)
- `translations.ts` only exports the `TranslationDictionary` interface + `COMMON_LOCALES`
- `translations-skeleton.ts` must stay all-empty-string (zero bundle cost)
- Component tests need `vi.mock('@/lib/i18n/i18n-context')` since context defaults to empty skeleton

### Service Worker
- Bump `CACHE_VERSION` in `public/sw.js` after deployments (currently v20)
- Page auto-reloads on SW `controllerchange` (with guard to skip initial install)
- `controllerchange` handler tracks `hadControllerOnLoad` — only reloads when existing SW replaced

### Admin
- All admin tab components MUST use `adminFetch()` from `@/lib/admin/api`, not raw `fetch()`
- Prompt endpoints: `/api/admin/prompts` (not `/api/admin/prompts/templates`)

### Server Logging
- Production level: `info` (override with `LOG_LEVEL=warn` to reduce noise)
- All `.catch(() => {})` have been replaced with `.catch((err) => log.warn(...))` — maintain this pattern
- Fire-and-forget calls (cost tracking, notifications) must always log their catch

### Landing Page
- Never use fake stats, testimonials, or social proof — use authentic capability metrics
- No fabricated user counts, ratings, or invented names

### TypeScript Closure Patterns
- **`let x!: T`** (definite assignment) for variables assigned inside async callbacks — not flagged by ESLint
- **`const x = filters.startDate`** before closures — TypeScript doesn't narrow optional properties inside `.filter()` callbacks
