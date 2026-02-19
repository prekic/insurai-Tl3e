# CLAUDE.md

> Context file for Claude Code sessions on the insurai project

---

## Project Overview

**insurai** is an insurance policy analysis platform for Turkish market professionals. Upload PDF policies, extract structured data with AI, and benchmark coverage against market standards.

- **Owner**: Erdem (personal project)
- **Current State**: Full-stack with AI extraction, multi-turn chat, policy evaluation, duplicate detection, performance optimizations, kasko coverage improvements, combined document processing pipeline, admin-managed AI prompts, OCR cleanup pipeline with Unicode-safe Turkish matching, enhanced Document Journey viewer with full content capture, configuration-driven OCR Decision Engine with Document Journey metadata, PDF splitting for Document AI 15-page limit, session-based free trial for anonymous users with 90s extraction timeout, bundle optimization with dynamic SDK imports, GA4 analytics with KVKK consent, comprehensive configuration system with 843+ configurable settings, Admin Settings UI with validation and audit history, settings export/import for backup/restore, config fetch performance monitoring with TTL recommendations, **modular admin route architecture (9 modules)**, **structured server logging**, **user preferences with three-tier config override**, **config drift detection**, **settings webhooks/templates/batch updates**, **production extraction pipeline fully operational**, **dead code cleanup (~17,800 lines removed)**, **production hardening phases 1-3 complete**, **comprehensive audit hardening (JSON.parse guards, structured logging, rate limiting)**, **critical module test coverage (admin-auth, email, cost-control, free-trial)**, **market data DB migration**, **major dependency upgrades (React 19, Express 5, Vite 7, Vitest 4)**, **tiered confidence system**, **mobile landing page UX overhaul**, **comprehensive i18n for all user-facing components**, **nav bar consistency overhaul with Globe language picker**, **i18n for auth, help, shared result, sample policies pages**, **database-driven i18n translation system with admin management**, **stale HTML cache fix (immutable hashed assets)**, **sample policy cards with expandable detail view**, **admin settings route ordering fix**, **coverage nameTr extraction-time resolution**, **i18n for MyAccount/Settings/ComparePolicies**, **nav ArrowLeft cleanup complete**, **UnsubscribePage i18n**, **AI insights translated at extraction time (aiInsightsTr)**, **massive branch/coverage test push (14,484 tests across 299 files, 0 ESLint errors)**
- **Production Readiness**: ~9.5/10 (14,400+ tests, 0 lint errors, 47 warnings, PWA support, server hardening, HSTS)
- **Last Updated**: February 19, 2026

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
| AI | OpenAI, Anthropic, Google | Multi-provider |
| PDF | pdf.js (browser), pdf-parse (server) | v5.4 |
| Monitoring | Sentry | v10 |
| Testing | Vitest + Playwright | v4 / v1.58 |

---

## Project Structure

```
insurai/
├── src/
│   ├── components/           # React components
│   │   ├── ui/              # Base UI components (Button, Card, Dialog, etc.)
│   │   ├── landing/         # Landing page sections (Hero, Benefits, FAQ, etc.)
│   │   ├── evaluation/      # Policy evaluation UI (GradeBadge, ScoreBreakdown)
│   │   ├── insurance-lines/ # Policy type specific details components
│   │   └── animations/      # Framer Motion components
│   ├── lib/
│   │   ├── ai/              # AI extraction (providers, config, OCR, caching)
│   │   │   ├── providers/   # OpenAI, Anthropic adapters
│   │   │   ├── cache/       # Response caching
│   │   │   └── cost-tracking/ # API usage tracking
│   │   ├── supabase/        # Auth, policies, database operations
│   │   ├── gap-detection/   # Coverage gap analysis engine
│   │   ├── regional-benchmark/ # Turkish regional data & risk factors
│   │   ├── policy-evaluation/ # Policy grading and comparison
│   │   ├── market-data/     # Market benchmarks and gap analyzer
│   │   ├── i18n/            # Internationalization (TR/EN)
│   │   ├── privacy/         # GDPR/KVKK compliance utilities
│   │   ├── pdf-export/      # PDF generation for reports
│   │   ├── ml/              # Machine learning utilities
│   │   └── security/        # Audit logging, sanitization
│   ├── hooks/               # Custom React hooks
│   ├── types/               # TypeScript definitions
│   ├── data/                # Sample policies, market data, regulations
│   └── __tests__/           # Integration & performance tests
├── server/
│   ├── index.ts             # Express server entry (port 4001)
│   ├── routes/              # API routes
│   │   ├── ai.ts            # AI extraction, chat, OCR endpoints
│   │   ├── admin/           # Admin API (split into 9 modules)
│   │   │   ├── index.ts     # Router aggregator
│   │   │   ├── auth.ts      # Login, sessions, diagnostics
│   │   │   ├── users.ts     # User management
│   │   │   ├── prompts.ts   # Prompt template CRUD
│   │   │   ├── operations.ts # Audit logs, security events
│   │   │   ├── monitoring.ts # Health, metrics, notifications
│   │   │   ├── content.ts   # Content management
│   │   │   ├── cost.ts      # Cost tracking
│   │   │   └── shared.ts    # Shared utilities
│   │   ├── settings.ts      # Configuration API
│   │   ├── drift.ts         # Config drift detection
│   │   ├── webhooks.ts      # Settings change webhooks
│   │   └── email.ts         # Email endpoints
│   ├── middleware/          # Auth, rate limiting, validation
│   ├── lib/                 # Server utilities (Sentry, logger)
│   ├── services/            # Business logic services
│   │   ├── drift-detection-service.ts  # Config drift detection
│   │   ├── webhook-service.ts          # Webhook delivery
│   │   └── ...              # Admin DB, email, prompts
│   └── __tests__/           # API route tests
├── e2e/                     # Playwright E2E tests
├── docs/                    # Deployment guides
├── supabase/                # Database schema & migrations
├── scripts/                 # Utility scripts (load-test, ai-extraction)
└── public/                  # Static assets, PWA manifest, service worker
```

---

## Key Files

### Core Application
| File | Purpose |
|------|---------|
| `src/App.tsx` | Main app with routing and lazy-loaded components |
| `src/types/policy.ts` | Core policy data structures and types |
| `src/lib/policy-context.tsx` | React Context for policy state management |
| `src/lib/policy-utils.ts` | **NEW** Duplicate detection, fuzzy matching, policy comparison |
| `src/lib/policy-upload-check.ts` | **NEW** Pre-upload conflict detection service |

### AI & Extraction
| File | Purpose |
|------|---------|
| `src/lib/ai/policy-extractor.ts` | Main AI extraction orchestrator |
| `src/lib/ai/config.ts` | AI provider configuration with dynamic SDK imports |
| `src/lib/ai/proxy-utils.ts` | **NEW** Lightweight proxy utilities (no SDK imports) |
| `src/lib/ai/pdf-parser.ts` | PDF text extraction with pdf.js |
| `src/lib/ai/prompts.ts` | AI prompts for extraction and OCR correction |
| `src/lib/ai/text-processor.ts` | Combined document processing pipeline |
| `src/lib/ai/document-normalizer.ts` | Clean-room deterministic document normalizer |
| `src/lib/ai/document-ocr.ts` | Document AI OCR with chunked extraction |
| `src/lib/ai/pdf-splitter.ts` | PDF splitting for >15 page documents |
| `server/routes/ai.ts` | AI proxy routes with ANTHROPIC_SCHEMA_PROMPT |

### OCR Cleanup Pipeline (Added Jan 2026)
| File | Purpose |
|------|---------|
| `src/lib/pipeline/ocr-cleanup-pipeline.ts` | Main OCR cleanup orchestrator with chunking, sanitization, QA |
| `src/lib/pipeline/ocr-sanitizer.ts` | Deterministic OCR text sanitization with Unicode-safe Turkish matching |
| `src/lib/pipeline/qa-gates.ts` | Quality validation gates with retry logic for failed chunks |
| `src/lib/pipeline/document-chunker.ts` | Document chunking by page markers or size |
| `src/lib/pipeline/turkish-ocr-normalizer.ts` | Turkish-specific OCR normalization rules |
| `src/lib/pipeline/pipeline-logger.ts` | Structured logging for pipeline stages |

### OCR Decision Engine (Added Jan 26, 2026)
| File | Purpose |
|------|---------|
| `src/lib/ocr-decision/ocr-decision-engine.ts` | Main orchestrator with `analyzeDocument()` and `buildDocumentJourneyMetadata()` |
| `src/lib/ocr-decision/types.ts` | TypeScript types including `OCRDecision`, `DocumentJourneyMetadata` |
| `src/lib/ocr-decision/configuration-manager.ts` | Loads locale and policy configs from JSON files |
| `src/lib/ocr-decision/language-detector.ts` | Detects document language via term/character matching |
| `src/lib/ocr-decision/policy-classifier.ts` | Classifies policy type (kasko, traffic, health, etc.) |
| `src/lib/ocr-decision/text-quality-analyzer.ts` | Analyzes text quality, encoding issues, garbage patterns |
| `src/lib/ocr-decision/field-extractor.ts` | Tests field extraction patterns (policy number, insured, etc.) |
| `config/locales/*.json` | Language-specific configs (tr.json, en.json, de.json) |
| `config/policy_types/**/*.json` | Policy type configs (motor/motor_kasko.json, etc.) |
| `config/ocr-settings.json` | OCR thresholds, confidence weights, decision thresholds |

### Components
| File | Purpose |
|------|---------|
| `src/components/PolicyUpload.tsx` | Upload flow with AI extraction & conflict detection |
| `src/components/PolicyChat.tsx` | Multi-turn AI chat for policy questions |
| `src/components/PolicyDashboard.tsx` | Main dashboard with policy cards |
| `src/components/PolicyDetailView.tsx` | Detailed policy view with share/download |
| `src/components/PolicyDiffViewer.tsx` | Visual diff for policy changes |
| `src/components/ConflictResolutionDialog.tsx` | Duplicate/amendment resolution UI |
| `src/components/GlobalNavigation.tsx` | **UPDATED** Main nav with Globe language picker, auth state, direct upload |
| `src/components/ComparePolicies.tsx` | Side-by-side policy comparison |
| `src/components/TryAnalysis.tsx` | **NEW** Anonymous free trial analysis (Jan 30, 2026) |
| `src/components/AuthPage.tsx` | **UPDATED** Login/signup with full i18n (Feb 12, 2026) |
| `src/components/AllSamplesDemo.tsx` | **UPDATED** Sample policies grid with full i18n (Feb 12, 2026) |
| `src/components/HelpCenter.tsx` | **UPDATED** Help center with full i18n (Feb 12, 2026) |
| `src/components/SharedResult.tsx` | **UPDATED** Shared analysis viewer with full i18n (Feb 12, 2026) |
| `src/components/landing/UploadWidget.tsx` | **UPDATED** Landing page upload with file handoff |
| `src/components/landing/StickyMobileCTA.tsx` | **NEW** Floating mobile CTA with i18n (Feb 12, 2026) |

### Admin Components (Updated Jan 25, 2026)
| File | Purpose |
|------|---------|
| `src/components/admin/DocumentJourneyViewer.tsx` | **ENHANCED** Full pipeline visualization with content capture and decision context |
| `src/components/admin/AdminDashboard.tsx` | Main admin dashboard with tabbed interface |
| `src/components/admin/AdminLogin.tsx` | Admin login page |
| `src/components/admin/tabs/PromptsTab.tsx` | Manage AI prompt templates |

### Processing Logger (Updated Jan 25, 2026)
| File | Purpose |
|------|---------|
| `src/lib/processing-logger.ts` | **ENHANCED** Stage logging with full text capture and decision context |
| `src/types/processing-log.ts` | **ENHANCED** Types for `StageDecisionContext`, full content fields |

### Authentication & Database
| File | Purpose |
|------|---------|
| `src/lib/supabase/auth-context.tsx` | Authentication context provider |
| `src/lib/supabase/auth.ts` | Auth functions (signIn, signUp, signOut) |
| `src/lib/supabase/policies.ts` | Policy CRUD operations |
| `src/lib/supabase/client.ts` | Supabase client initialization |

### Server
| File | Purpose |
|------|---------|
| `server/index.ts` | Express server with graceful shutdown, HSTS, structured logging |
| `server/lib/logger.ts` | **NEW** Structured logging with level control (production: info) |
| `server/middleware/validation.ts` | Zod schemas for request validation |
| `server/middleware/rate-limit.ts` | Rate limiting for AI endpoints |
| `server/lib/sentry.ts` | Sentry error tracking setup |

### Admin Panel (Refactored Feb 7, 2026)
| File | Purpose |
|------|---------|
| `src/components/admin/AdminDashboard.tsx` | Main admin dashboard with tabbed interface |
| `src/components/admin/AdminLogin.tsx` | Admin login page |
| `src/components/admin/tabs/PromptsTab.tsx` | Manage AI prompt templates |
| `src/lib/admin/context.tsx` | Admin auth context provider (AdminAuthProvider) |
| `src/lib/admin/api.ts` | Admin API client functions (includes `adminFetch` wrapper) |
| `src/lib/admin/settings-templates.ts` | **NEW** Predefined configuration profile templates |
| `server/routes/admin/index.ts` | **REFACTORED** Admin router aggregator (was single 3,390-line file) |
| `server/routes/admin/auth.ts` | **NEW** Login, sessions, diagnostics routes |
| `server/routes/admin/users.ts` | **NEW** User management routes |
| `server/routes/admin/prompts.ts` | **NEW** Prompt template CRUD routes |
| `server/routes/admin/operations.ts` | **NEW** Audit logs, security events routes |
| `server/routes/admin/monitoring.ts` | **NEW** Health, metrics, notification routes |
| `server/routes/admin/content.ts` | **NEW** Content management routes |
| `server/routes/admin/cost.ts` | **NEW** Cost tracking routes |
| `server/routes/admin/shared.ts` | **NEW** Shared utilities (Supabase client, helpers) |
| `server/middleware/admin-auth.ts` | JWT auth middleware for admin routes |
| `server/services/admin-db.ts` | Admin database operations |
| `server/services/prompt-service.ts` | Centralized prompt management service |
| `server/services/drift-detection-service.ts` | **NEW** Config drift detection with baselines |
| `server/services/webhook-service.ts` | **NEW** Settings change webhook delivery |

### Admin Settings UI (Updated Feb 7, 2026)
| File | Purpose |
|------|---------|
| `src/components/admin/tabs/SettingsTab.tsx` | Settings tab with category navigation + export/import UI |
| `src/components/admin/tabs/settings/AISettingsPanel.tsx` | AI provider settings (models, temperature, timeouts) |
| `src/components/admin/tabs/settings/EvaluationSettingsPanel.tsx` | Policy evaluation settings (weights, thresholds) |
| `src/components/admin/tabs/settings/RateLimitsPanel.tsx` | API rate limit configuration |
| `src/components/admin/tabs/settings/OCRSettingsPanel.tsx` | OCR decision engine settings |
| `src/components/admin/tabs/settings/FeatureFlagsPanel.tsx` | Feature flag management |
| `src/components/admin/tabs/settings/SettingsHistoryPanel.tsx` | Settings audit log viewer with search/filter |
| `src/components/admin/tabs/settings/SettingsDiffViewer.tsx` | **NEW** Visual diff viewer for old vs new setting values |
| `src/components/admin/tabs/settings/SettingsTemplatesPanel.tsx` | **NEW** Predefined config profile management |
| `src/components/admin/tabs/settings/SettingsWebhooksPanel.tsx` | **NEW** Webhook configuration for external notifications |
| `src/components/admin/tabs/settings/ConfigPerformancePanel.tsx` | Config fetch latency dashboard with TTL recommendations |
| `src/components/admin/tabs/settings/ConfigDriftPanel.tsx` | **NEW** Config drift detection with baseline comparison |
| `src/lib/admin/settings-validation.ts` | Client-side validation utilities for settings |
| `src/lib/admin/settings-templates.ts` | **NEW** Template definitions and management utilities |

### User Preferences (Added Feb 7, 2026)
| File | Purpose |
|------|---------|
| `src/components/UserPreferencesPanel.tsx` | **NEW** User-facing preferences UI panel |
| `src/hooks/useUserPreferences.ts` | **NEW** Hook for three-tier config override (system → admin → user) |
| `src/lib/config/user-overridable.ts` | **NEW** Defines which settings users can override |

### Configuration System (Updated Feb 7, 2026)
| File | Purpose |
|------|---------|
| `src/lib/config/configuration-service.ts` | Singleton ConfigurationService with caching + performance instrumentation |
| `src/lib/config/config-performance-monitor.ts` | Rolling-window latency tracker with TTL recommendations |
| `src/lib/config/user-overridable.ts` | **NEW** User-overridable settings definitions for three-tier config |
| `src/lib/config/types.ts` | TypeScript types and default values |
| `src/lib/config/index.ts` | Module exports |
| `server/routes/settings.ts` | Admin API routes for settings, export/import, performance, batch updates |
| `server/routes/drift.ts` | **NEW** Config drift detection API endpoints |
| `server/routes/webhooks.ts` | **NEW** Settings webhook management endpoints |
| `server/services/drift-detection-service.ts` | **NEW** Drift detection with baseline snapshots |
| `server/services/webhook-service.ts` | **NEW** Webhook delivery with retry logic |
| `supabase/migrations/012_configuration_system.sql` | Database schema for config tables |
| `supabase/migrations/013_seed_configuration_defaults.sql` | Seeds all hardcoded values |
| `supabase/migrations/014_settings_webhooks.sql` | **NEW** Webhook configuration tables |
| `supabase/migrations/015_config_drift_baselines.sql` | **NEW** Drift baseline snapshot tables |
| `supabase/migrations/017_translation_system.sql` | **NEW** Database-driven i18n tables |
| `supabase/migrations/018_seed_translations.sql` | **NEW** Seeds 685+ translation keys × 2 languages |
| `supabase/migrations/019_seed_coverage_insight_translations.sql` | **NEW** Coverage names + AI insight translations |

### Database-Driven i18n System (Added Feb 12, 2026)
| File | Purpose |
|------|---------|
| `server/services/translation-service.ts` | TranslationService with CRUD, caching, bulk operations |
| `server/routes/translations.ts` | Translation API endpoints (CRUD, export/import, AI-assisted bulk translate) |
| `src/lib/i18n/translation-service.ts` | Client-side translation loading (API fetch + localStorage cache) |
| `src/lib/i18n/i18n-context.tsx` | **UPDATED** React context with DB-backed translation loading pipeline |
| `src/lib/i18n/coverage-names.ts` | **NEW** Canonical EN→TR coverage name map (90+ entries) |
| `src/lib/i18n/translations.ts` | Preloaded fallback translations (EN/TR) |
| `src/components/admin/tabs/TranslationsTab.tsx` | **NEW** Admin UI for inline translation editing, coverage stats, import/export |

### Configuration
| File | Purpose |
|------|---------|
| `.env` | Environment configuration (not committed) |
| `.env.example` | Environment template |
| `vite.config.ts` | Vite config with proxy settings |
| `lighthouserc.js` | Lighthouse CI configuration |
| `playwright.config.ts` | E2E test configuration |

---

## Commands

```bash
# Development
npm run dev           # Frontend only (port 5173)
npm run dev:server    # Backend only (port 4001)
npm run dev:all       # Both frontend + backend (recommended)
npm run dev:sync      # Pull latest + install + run all

# Build & Deploy
npm run build         # Production build (frontend)
npm run build:server  # Production build (backend)
npm run build:analyze # Build with bundle analysis
npm run preview       # Preview production build

# Testing
npm test              # Run all unit tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
npm run test:e2e      # Playwright E2E tests
npm run test:e2e:fast # E2E with Chromium only
npm run test:e2e:ui   # E2E with Playwright UI
npm run validate      # typecheck + lint + test (full validation)

# Code Quality
npm run lint          # ESLint check
npm run lint:fix      # Auto-fix lint issues
npm run typecheck     # TypeScript type check
npm run format        # Prettier formatting
npm run format:check  # Check formatting

# Load Testing
npm run loadtest:quick  # 5s quick load test
npm run loadtest:stress # 30s stress test

# Lighthouse
npm run lighthouse    # Full Lighthouse CI run
```

---

## Environment Variables

Create `.env` in project root (copy from `.env.example`):

```env
# Frontend (VITE_ prefix exposes to browser)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_PROXY_URL=http://localhost:4001
VITE_SENTRY_DSN=https://xxx@sentry.io/xxx

# Backend (server-side only, NEVER exposed to browser)
API_PORT=4001
FRONTEND_URL=http://localhost:5173
OPENAI_API_KEY=sk-proj-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
GOOGLE_CLOUD_API_KEY=AIza...
NODE_ENV=development
SENTRY_DSN=https://xxx@sentry.io/xxx
```

**CRITICAL RULES**:
1. API keys must NEVER have `VITE_` prefix - they stay server-side only
2. Server uses `.env` file (not `.env.local`)
3. In development, Vite proxy handles `/api/*` requests automatically

---

## Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         FRONTEND (React)                             │
│                         Port 5173 (Vite)                            │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────┐  ┌───────────┐ │
│  │ PolicyUpload│  │ PolicyChat   │  │ Dashboard   │  │ Landing   │ │
│  │ (PDF+AI)    │  │ (Multi-turn) │  │ (Analytics) │  │ (Marketing│ │
│  └──────┬──────┘  └──────┬───────┘  └──────┬──────┘  └───────────┘ │
│         │                │                  │                        │
│         └────────────────┼──────────────────┘                        │
│                          ▼                                           │
│              ┌─────────────────────┐                                │
│              │  PolicyContext      │ ← React Context for policies   │
│              │  AuthContext        │ ← Supabase auth state          │
│              └──────────┬──────────┘                                │
├─────────────────────────┼───────────────────────────────────────────┤
│                         │ Vite Dev Proxy (/api/* → :4001)           │
├─────────────────────────┼───────────────────────────────────────────┤
│                         ▼                                           │
│                   BACKEND (Express)                                 │
│                      Port 4001                                      │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                    Middleware Stack                          │   │
│  │  ┌──────────┐  ┌─────────────┐  ┌──────────┐  ┌──────────┐  │   │
│  │  │ Helmet   │→ │ Rate Limit  │→ │ Validate │→ │ Sanitize │  │   │
│  │  │ (Security│  │ (per IP)    │  │ (Zod)    │  │ (XSS)    │  │   │
│  │  └──────────┘  └─────────────┘  └──────────┘  └──────────┘  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌───────────────────────────────────────────────────────────────┐ │
│  │                      API Routes                                │ │
│  │  ┌──────────────┐ ┌──────────────┐ ┌─────────┐ ┌───────────┐  │ │
│  │  │/api/ai/chat  │ │/api/ai/extract│ │/api/ai/ │ │/api/health│  │ │
│  │  │(PolicyChat)  │ │/openai|claude │ │ocr      │ │(monitoring)│ │ │
│  │  │60 req/hr     │ │20 req/hr      │ │30 req/hr│ │60 req/min │  │ │
│  │  └──────┬───────┘ └──────┬────────┘ └────┬────┘ └───────────┘  │ │
│  └─────────┼────────────────┼───────────────┼────────────────────┘ │
│            │                │               │                       │
├────────────┼────────────────┼───────────────┼───────────────────────┤
│            ▼                ▼               ▼                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │                   External Services                          │   │
│  │  ┌──────────┐  ┌───────────┐  ┌─────────────┐  ┌──────────┐ │   │
│  │  │ OpenAI   │  │ Anthropic │  │Google Vision│  │ Supabase │ │   │
│  │  │ gpt-4o   │  │ claude-   │  │ OCR API     │  │ Auth+DB  │ │   │
│  │  │ gpt-4o-  │  │ 3-5-haiku │  │             │  │ Storage  │ │   │
│  │  │ mini     │  │           │  │             │  │          │ │   │
│  │  └──────────┘  └───────────┘  └─────────────┘  └──────────┘ │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Data Flow: PDF Upload & Extraction
```
User drops PDF → PolicyUpload → pdf.js (browser) → Extract text
→ Check density: < 100 chars/page? → Google Vision OCR (/api/ai/ocr)
                  >= 100 chars/page? → Direct to AI
→ AI Extraction (/api/ai/extract) → Zod validation
→ Pre-upload duplicate check → Conflict resolution if needed
→ PolicyContext → Supabase (save policy + upload document)
```

### Data Flow: Duplicate Detection (NEW)
```
New Policy Extracted → checkPolicyBeforeUpload()
→ Find existing by identifier (policy number + provider + insured)
→ Fuzzy match with OCR tolerance (Levenshtein distance)
→ If match found:
   → Calculate diff (significance levels: critical/major/moderate/minor)
   → Show ConflictResolutionDialog
   → User chooses: Skip | Replace | Keep Both | Track Amendment
→ Handle resolution → Save to Supabase
```

### Data Flow: PolicyChat
```
User → PolicyChat → Build context → /api/ai/chat → Rate limit → Validate
→ Add system prompt + history → OpenAI/Anthropic → Response to UI
```

### Authentication Flow
```
User → Login form → Supabase Auth → JWT in localStorage → AuthContext
→ Protected routes (/dashboard, /upload, /chat) vs Public (/landing, /login)
```

### Key Architecture Decisions

| Decision | Rationale |
|----------|-----------|
| **Monolithic backend** | Simple deployment, single codebase, adequate for current scale |
| **API keys server-side only** | Security - never expose to browser |
| **Vite proxy in dev** | Seamless /api/* routing without CORS issues |
| **Lazy-loaded routes** | Smaller initial bundle, faster FCP |
| **React Context for state** | Simpler than Redux for current needs |
| **Supabase for auth+DB** | Managed PostgreSQL, built-in auth, RLS |
| **Multi-provider AI** | Fallback capability, cost optimization |
| **Rate limiting per IP** | Protect against abuse, control AI costs |
| **TEXT with CHECK vs ENUM** | More flexible, easier migrations |

---

## Duplicate Detection System (NEW)

### Overview
Pre-upload detection of duplicate policies with OCR-tolerant fuzzy matching.

### Core Files
- `src/lib/policy-utils.ts` - Comparison algorithms and fuzzy matching
- `src/lib/policy-upload-check.ts` - Pre-upload check service
- `src/components/PolicyDiffViewer.tsx` - Visual diff component
- `src/components/ConflictResolutionDialog.tsx` - Resolution UI

### Key Functions

```typescript
// Fuzzy matching for OCR errors
import { fuzzyMatchOCR, isPolicyIdentifierMatch, normalizeForOCR } from '@/lib/policy-utils'

// Check if two policy numbers match despite OCR errors
fuzzyMatchOCR('POL-001', 'P0L-OO1', 0.85) // true (O/0 confusion)

// Normalize for OCR comparison (handles Turkish chars, Cyrillic lookalikes)
normalizeForOCR('İstanbul POL-001') // 'istanbul poiooi'

// Full identifier match with fuzzy tolerance
isPolicyIdentifierMatch(policyA, policyB, true) // uses fuzzy matching

// Calculate differences between policies
const diff = calculatePolicyDiff(oldPolicy, newPolicy)
// Returns: { significantChanges, minorChanges, overallSignificance }
```

### OCR Substitution Map
```typescript
const OCR_SUBSTITUTIONS = {
  '0': 'o', 'O': 'o', 'О': 'o',  // Zero, Latin O, Cyrillic O
  '1': 'i', 'l': 'i', 'I': 'i',  // One, lowercase L, uppercase I
  'ı': 'i', 'İ': 'i',            // Turkish dotless i, Turkish I
  '5': 's', 'ş': 's', 'Ş': 's',  // Five, Turkish ş
  '8': 'b', 'B': 'b',            // Eight, B
  // ... more mappings
}
```

### Conflict Resolution Options
| Option | Behavior |
|--------|----------|
| `skip` | Don't save the new policy |
| `replace` | Replace existing with new |
| `keep_both` | Save both as separate policies |
| `track_amendment` | Save as version of existing policy |

### Diff Significance Levels
- `critical` - Core identifiers changed (policy number, provider)
- `major` - Coverage or premium changed significantly
- `moderate` - Dates or deductibles changed
- `minor` - Display-only changes (formatting, etc.)

---

## Landing Page Architecture

### Section Components (`src/components/landing/`)

| Component | Purpose |
|-----------|---------|
| `Hero.tsx` | Main hero with gradient bg, nav, upload widget, comparison mock |
| `Benefits.tsx` | Feature grid with icons (AI extraction, benchmarking, etc.) |
| `HowItWorks.tsx` | 3-step process (Upload → Analyze → Compare) |
| `Stats.tsx` | **UPDATED** Authentic capability metrics (7 types, TR/EN, 15+ checks, <60s) |
| `WhoItsFor.tsx` | Target audience cards (hidden on mobile — covered by Testimonials) |
| `WhyChooseUs.tsx` | **UPDATED** Authentic differentiators (KVKK, No Signup, Turkey-Focused) |
| `CompareSection.tsx` | Interactive policy comparison demo (hidden on mobile) |
| `ComparisonMock.tsx` | **UPDATED** Real provider names with disclaimer |
| `Testimonials.tsx` | **UPDATED** Use-case scenarios for 3 audience types (replaces fake testimonials) |
| `FAQ.tsx` | Accordion with common questions |
| `Footer.tsx` | Links, legal, social |
| `LanguageToggle.tsx` | TR/EN language switcher |
| `UploadWidget.tsx` | Drag-drop upload in hero |

### Hero Component Structure (`src/components/landing/Hero.tsx`)

```tsx
<Hero>
  {/* Decorative gradient blobs */}
  <div className="bg-gradient-to-br from-blue-100/40 to-purple-100/40" />

  {/* Navigation */}
  <nav>
    {/* Top utility bar: Secure badge, phone, help link */}
    {/* Main nav: Logo, Dashboard, Compare, Upload, Profile */}
  </nav>

  {/* Hero content (2-column on desktop) */}
  <div className="grid lg:grid-cols-2">
    {/* Left: Headlines, value props, CTA buttons */}
    <StaggeredList>
      <h1>Türkiye'nin #1 Sigorta Analiz Platformu</h1>
      <UploadWidget />  {/* Drag-drop zone */}
    </StaggeredList>

    {/* Right: ComparisonMock visual */}
    <ComparisonMock />
  </div>
</Hero>
```

### Animation Components (`src/components/animations/`)

```tsx
// Staggered fade-in for lists
<StaggeredList delay={0.1}>
  {items.map(item => <div>{item}</div>)}
</StaggeredList>

// Scale on hover effect
<ScaleOnHover>
  <Button>Hover me</Button>
</ScaleOnHover>

// Animated number counter
<NumberCounter target={4500} duration={2000} />

// Animated button with loading state
<AnimatedButton loading={isLoading}>Submit</AnimatedButton>
```

### Design Tokens

```css
/* Colors (from Figma) */
--primary: #2563eb      /* blue-600 - main actions */
--secondary: #4f46e5    /* indigo-600 - accents */
--success: #10b981      /* green - positive states */
--warning: #f59e0b      /* amber - warnings */
--danger: #ef4444       /* red - errors, gaps */

/* Gradients */
Hero bg: from-slate-50 to-white
Decorative blobs: blue-100/40 to-purple-100/40

/* Typography */
Headings: font-bold text-gray-900
Body: text-gray-600

/* Shadows */
Card shadow: shadow-sm hover:shadow-md
Button shadow: shadow-md
```

### Responsive Breakpoints

```css
sm: 640px   /* Mobile landscape */
md: 768px   /* Tablet */
lg: 1024px  /* Desktop */
xl: 1280px  /* Large desktop */
2xl: 1536px /* Extra large */
```

### Figma Design Reference
- Source file: `MERGED_CODEBASE_FIGMA_DESIGN_DRAFTS.md`
- Contains 138 component designs from original Figma export
- Key components: AdminPanel, InsuranceComparison, CoverageDetails
- Design system: Tailwind-based with custom UI components in `src/components/ui/`

---

## API Endpoints

| Endpoint | Method | Purpose | Rate Limit |
|----------|--------|---------|------------|
| `/api/ai/extract/openai` | POST | Extract policy with GPT-4o | 20/hr |
| `/api/ai/extract/anthropic` | POST | Extract policy with Claude | 20/hr |
| `/api/ai/chat` | POST | Multi-turn policy chat | 60/hr |
| `/api/ai/ocr` | POST | Google Vision OCR for scanned PDFs | 30/hr |
| `/api/ai/providers` | GET | Check which AI providers are configured | - |
| `/api/ai/diagnose` | GET | Test API key validity | - |
| `/api/health` | GET | Server health check | 60/min |

### Request/Response Examples

**Chat Endpoint:**
```typescript
// POST /api/ai/chat
// Request
{
  message: string,              // User's question (max 4KB)
  conversationHistory?: Array<{ role: 'user' | 'assistant', content: string }>,
  policyContext?: string,       // Policy details for context (max 50KB)
  provider?: 'openai' | 'anthropic'  // Default: openai
}

// Response
{
  success: boolean,
  response: string,             // AI response
  provider: 'openai' | 'anthropic',
  usage: { input_tokens: number, output_tokens: number }
}
```

**Extraction Endpoint:**
```typescript
// POST /api/ai/extract/openai
// Request
{
  document: string,  // Extracted PDF text
  prompt: string     // Extraction prompt
}

// Response
{
  success: boolean,
  data: ExtractedPolicy,
  usage: { input_tokens: number, output_tokens: number }
}
```

---

## Database Schema

### Tables

| Table | Purpose |
|-------|---------|
| `users` | User profiles (extends auth.users) |
| `policies` | Extracted policy data |
| `policy_documents` | Uploaded PDF file references |
| `chat_conversations` | PolicyChat conversation history |
| `app_settings` | **NEW** Admin-configurable application settings |
| `settings_audit_log` | **NEW** Audit trail for settings changes |
| `user_preferences` | **NEW** Per-user preference settings |
| `market_benchmarks` | **NEW** Insurance market benchmark data by policy type |
| `insurance_providers` | **NEW** Turkish insurance provider directory |
| `regional_factors` | **NEW** Regional risk adjustment factors |
| `feature_flags` | **NEW** Feature flag configuration for gradual rollouts |
| `translation_locales` | **NEW** Supported locale definitions (tr, en, etc.) |
| `translation_keys` | **NEW** Translation key registry with namespaces |
| `translations` | **NEW** Actual translation strings per locale per key |
| `translation_audit_log` | **NEW** Audit trail for translation changes |
| `translation_metadata` | **NEW** Translation system metadata (versions, stats) |

### Policy Table Schema
```sql
CREATE TABLE public.policies (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  policy_number TEXT NOT NULL,
  provider TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business')),
  type_tr TEXT NOT NULL,
  coverage NUMERIC NOT NULL,
  premium NUMERIC NOT NULL,
  deductible NUMERIC DEFAULT 0,
  start_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired', 'pending')),
  insured_person TEXT NOT NULL,
  location TEXT,
  document_type TEXT DEFAULT 'policy',
  upload_date DATE DEFAULT CURRENT_DATE,
  logo TEXT,
  raw_data JSONB,  -- Stores AI extraction results, coverages, exclusions
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Migrations
Located in `supabase/migrations/`:
- `001_initial_schema.sql` - Base tables and indexes
- `002_storage_policies.sql` - Storage bucket RLS
- `003_security_fixes.sql` - Security hardening, handle_new_user trigger
- `004_chat_conversations.sql` - Chat history storage
- `005_admin_tables.sql` - Admin authentication tables (admin_users, admin_sessions, security_events, audit_logs, prompt_templates, prompt_versions)
- `006_seed_prompts.sql` - Seeds 16 AI prompts (extraction, chat, OCR, analysis)
- `012_configuration_system.sql` - **NEW** Configuration system tables (app_settings, user_preferences, market_benchmarks, insurance_providers, regional_factors, feature_flags)
- `013_seed_configuration_defaults.sql` - **NEW** Seeds all hardcoded values as database defaults
- `014_settings_webhooks.sql` - **NEW** Webhook configuration tables
- `015_config_drift_baselines.sql` - **NEW** Drift baseline snapshot tables
- `017_translation_system.sql` - **NEW** Database-driven i18n (5 tables: locales, keys, translations, audit, metadata)
- `018_seed_translations.sql` - **NEW** Seeds 685+ translation keys × 2 languages
- `019_seed_coverage_insight_translations.sql` - **NEW** Coverage names + AI insight translations

### Row Level Security (RLS)
```sql
-- Users can only access their own policies
CREATE POLICY "Users can view their own policies"
  ON public.policies FOR SELECT
  USING (auth.uid() = user_id);
```

---

## Insurance Knowledge Database

### Location: `src/data/`

The app includes a comprehensive Turkish insurance knowledge base:

| File | Contents | Lines |
|------|----------|-------|
| `regulations.ts` | Laws, general conditions (genel şartlar), clauses (klozlar) | 700+ |
| `insurance-lines.ts` | Official TSB/SEDDK branch classifications | 650+ |
| `coverage-limits.ts` | Official 2025-2026 coverage limits | 650+ |
| `sample-policies.ts` | Sample policies for testing | 150+ |

### Regulation Types (`src/data/regulations.ts`)
```typescript
type RegulationType =
  | 'law'              // Kanun
  | 'regulation'       // Yönetmelik
  | 'general_condition' // Genel Şartlar
  | 'clause'           // Kloz
  | 'tariff'           // Tarife
  | 'circular'         // Genelge
  | 'communique'       // Tebliğ
  | 'guideline'        // Rehber
```

### Insurance Branch Codes (`src/data/insurance-lines.ts`)
```typescript
// Hayat Dışı (Non-Life) Branch Codes
type InsuranceBranchCode =
  | 'kara_araclari'           // Kasko (Motor Own Damage)
  | 'kara_araclari_sorumluluk' // Traffic (Motor Liability)
  | 'yangin_dogal_afet'       // Fire & Natural Disasters
  | 'genel_zararlar'          // General Damages
  | 'kaza'                    // Accident
  | 'saglik'                  // Health
  | 'deniz_araclari'          // Marine Hull
  | 'hava_araclari'           // Aviation
  | 'nakliyat'                // Cargo/Transportation
  | 'genel_sorumluluk'        // General Liability
  | 'kredi'                   // Credit
  | 'hukuksal_koruma'         // Legal Protection
  | 'destek'                  // Assistance
  // ... and more
```

### Official Coverage Limits 2025 (`src/data/coverage-limits.ts`)

**Traffic Insurance (ZMSS) Limits:**
| Coverage Type | Per Person | Per Accident | Per Vehicle |
|--------------|------------|--------------|-------------|
| Bodily Injury | ₺2,700,000 | ₺13,500,000 | - |
| Material Damage | - | ₺600,000 | ₺300,000 |

**Source**: SEDDK official tariffs (updated annually)

---

## Market Benchmark Data

### Location: `src/data/market-data/`

| File | Purpose |
|------|---------|
| `benchmarks.ts` | Coverage benchmarks by policy type |
| `providers.ts` | Turkish insurer data (market share, ratings) |

### Major Turkish Insurance Providers
```typescript
// From src/data/market-data/providers.ts
const TOP_PROVIDERS = {
  allianz:   { marketShare: 12.8%, rating: 4.2, est: 1923 },
  axa:       { marketShare: 10.5%, rating: 4.0, est: 1893 },
  anadolu:   { marketShare: 9.2%,  rating: 4.3, est: 1925 },
  aksigorta: { marketShare: 8.7%,  rating: 4.1, est: 1960 },
  mapfre:    { marketShare: 7.4%,  rating: 3.9, est: 1992 },
  sompo:     { marketShare: 6.8%,  rating: 4.0, est: 1993 },
  zurich:    { marketShare: 5.2%,  rating: 4.1, est: 1986 },
  hdi:       { marketShare: 4.8%,  rating: 3.8, est: 2002 },
}
```

### Coverage Benchmarks (`src/data/market-data/benchmarks.ts`)

Each policy type has benchmark data for gap analysis:
```typescript
interface CoverageBenchmark {
  name: string           // e.g., "Collision Damage"
  nameTr: string         // e.g., "Çarpma/Çarpışma"
  typicalLimit: number   // e.g., 500000
  minLimit: number       // e.g., 100000
  maxLimit: number       // e.g., 2000000
  typicalDeductible: number
  inclusionRate: number  // % of policies that include this (e.g., 95)
}
```

**Kasko Coverage Benchmarks:**
| Coverage | Typical Limit | Inclusion Rate |
|----------|---------------|----------------|
| Collision | ₺500,000 | 100% |
| Theft | ₺500,000 | 100% |
| Natural Disasters | ₺500,000 | 95% |
| Fire | ₺500,000 | 100% |
| Glass Coverage | ₺25,000 | 85% |
| Personal Accident | ₺100,000 | 70% |

---

## Gap Detection System

### Architecture (`src/lib/gap-detection/`)

```
analyzeGapsComprehensive(policy, options)
├── analyzeCoverageGaps()    # Missing coverage types
├── analyzeLimitGaps()       # Under/over-insured limits
├── analyzeDeductibleGaps()  # Deductible analysis
├── analyzeExclusionGaps()   # Dangerous exclusions
├── analyzeTemporalGaps()    # Coverage period issues
└── analyzeComplianceGaps()  # Regulatory compliance
```

### Gap Analyzer Logic (`src/lib/market-data/gap-analyzer.ts`)

The gap analyzer compares policies against market benchmarks:

```typescript
function analyzeGaps(policy: AnalyzedPolicy, region: TurkishRegion): GapAnalysis {
  // 1. Find missing coverages (present in >50% of market policies)
  const missingCoverages = findMissingCoverages(policy.coverages, benchmark.commonCoverages)

  // 2. Find underinsured coverages (below market minimum)
  const underinsuredCoverages = findUnderinsuredCoverages(...)

  // 3. Find high deductibles (above market typical)
  const highDeductibles = findHighDeductibles(...)

  // 4. Analyze dangerous exclusions
  const exclusionWarnings = analyzeExclusions(policy.exclusions, policy.type)

  // 5. Calculate gap score (0-100, higher = more gaps)
  const gapScore = calculateGapScore(...)

  // 6. Estimate cost to close gaps
  const estimatedCostToClose = estimateGapClosureCost(...)

  return { missingCoverages, underinsuredCoverages, highDeductibles, exclusionWarnings, gapScore, estimatedCostToClose }
}
```

### Gap Importance Classification

Gaps are classified based on market inclusion rate:
- **Critical** (>=90% inclusion): Almost all policies have this - you need it
- **Recommended** (70-89% inclusion): Most policies have this - strongly suggested
- **Optional** (<70% inclusion): Nice to have but not essential

### Gap Severity Levels
```typescript
type GapSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
```

### Output Structure
```typescript
interface ComprehensiveGapAnalysis {
  gaps: DetectedGap[]
  gapCount: { total: number, critical: number, high: number, medium: number, low: number, info: number }
  overallScore: number  // 0-100
  financialSummary: { potentialExposure: number, recommendedIncrease: number }
  prioritizedGaps: PrioritizedGap[]
  recommendations: GapRecommendation[]
}
```

---

## Policy Evaluation Module

### Location: `src/lib/policy-evaluation/`

### Key Functions
```typescript
// Evaluate a single policy
const result = evaluatePolicy(policy, {
  weights: { premium: 20, coverage: 30, deductible: 15, compliance: 20, value: 15 }
})
// result.overallScore: 0-100
// result.grade: 'A' | 'B' | 'C' | 'D' | 'F'
// result.status: 'excellent' | 'good' | 'fair' | 'poor' | 'critical'

// Compare multiple policies
const comparison = comparePolicies([policy1, policy2, policy3])
// comparison.rankings: PolicyRanking[]
// comparison.recommendation: string
```

### Grading System
| Score | Grade | Status |
|-------|-------|--------|
| >= 90 | A | excellent |
| 75-89 | B | good |
| 60-74 | C | fair |
| 40-59 | D | poor |
| < 40 | F | critical |

### Actionable Recommendations (Updated Jan 14, 2026)

Recommendations now include specific amounts and actionable advice:

| Type | Before | After |
|------|--------|-------|
| Coverage | "Improve Coverage" | "Add Missing: Collision, Theft" with specific coverages |
| Deductible | "Reduce Deductible" | "Negotiate Lower Deductible (Currently ₺15,000)" with percentage |
| Premium | "Review Premium" | "Compare Alternative Quotes" with advice to get 3-5 quotes |
| Value | "Optimize Value" | "Improve Coverage-to-Premium Ratio" with 3 specific strategies |
| Positive | (none) | "Policy Well-Structured" when no issues found |

---

## Regional Benchmarking

### Turkish Regions (`src/lib/regional-benchmark/`)

| Region Code | Name | Risk Factor | Notes |
|-------------|------|-------------|-------|
| `marmara` | Marmara | 1.15x | Highest risk (İstanbul), earthquake zone 1 |
| `ege` | Aegean | 1.05x | Tourism, earthquake risk |
| `akdeniz` | Mediterranean | 1.08x | Tourism, flood risk |
| `ic_anadolu` | Central Anatolia | 0.95x | Lower risk, agricultural |
| `karadeniz` | Black Sea | 0.90x | Flood/landslide risk |
| `dogu_anadolu` | Eastern Anatolia | 0.85x | Lower premiums, rural |
| `guneydogu` | Southeastern | 0.88x | Mixed risk profile |

---

## Supported Policy Types

### Turkish Insurance Lines

| Type | Turkish Name | Database Value |
|------|--------------|----------------|
| Auto Comprehensive | Kasko | `kasko` |
| Traffic/MTPL | Trafik Sigortası | `traffic` |
| Property/Fire | Yangın | `home` |
| Earthquake | DASK | `dask` |
| Health | Sağlık | `health` |
| Life | Hayat | `life` |
| Business | İşyeri | `business` |

### Coverage Types & Categories (Added Jan 14, 2026)

Coverages now support special value types and categorization:

```typescript
// Coverage value types
interface Coverage {
  name: string
  nameTr: string
  limit: number
  deductible: number
  included: boolean
  isUnlimited?: boolean    // "Sınırsız" - display as unlimited
  isMarketValue?: boolean  // "Rayiç Değer" - market value coverage
  category?: CoverageCategory
  importance?: CoverageImportance
}

// Coverage categories for grouping
type CoverageCategory = 'main' | 'liability' | 'supplementary' | 'assistance' | 'legal' | 'other'

// Importance levels for visual styling
type CoverageImportance = 'critical' | 'standard' | 'minor'
```

**Display Logic:**
| Condition | Display |
|-----------|---------|
| `isUnlimited: true` | "Sınırsız" |
| `isMarketValue: true` | "Rayiç Değer" |
| `limit === 0 && included` | "Dahil" |
| `limit > 0` | Formatted currency |

**Kasko Implicit Coverages:**
These are automatically included in base kasko policies and should NOT be flagged as missing:
- Çarpma/Çarpışma (Collision)
- Hırsızlık (Theft)
- Yangın (Fire)
- Doğal Afetler (Natural Disasters)
- Sel/Su Baskını (Flood)

---

## Configuration System (Added Feb 2026)

### Overview

The configuration system provides a three-tier architecture for managing application settings:
1. **System Defaults** - Hardcoded values in `src/lib/config/types.ts`
2. **Admin Settings** - Database-stored overrides in `app_settings` table
3. **User Preferences** - Per-user customizations in `user_preferences` table

All 843+ previously hardcoded values are now configurable through the Admin Dashboard.

### Location: `src/lib/config/`

### Using the ConfigurationService

```typescript
import { configService, getAIConfig, isFeatureEnabled } from '@/lib/config'

// Get typed configuration
const aiConfig = await configService.getAIConfig()
console.log(aiConfig.openaiExtractionModel)  // 'gpt-4o'
console.log(aiConfig.temperature)            // 0.1

// Or use convenience functions
const config = await getAIConfig()

// Check feature flags
if (await isFeatureEnabled('new_evaluation_algorithm')) {
  // Use new algorithm
}

// Get individual values with defaults
const maxTokens = await configService.get('ai', 'max_tokens', 4096)

// Get regional risk factors
const factor = await configService.getRegionalFactor('marmara')  // 1.15

// Get market benchmarks
const benchmarks = await configService.getMarketBenchmarks('kasko')
```

### Configuration Categories

| Category | Purpose | Example Settings |
|----------|---------|------------------|
| `ai` | AI provider settings | Models, temperatures, timeouts |
| `evaluation` | Policy scoring | Weights, grade thresholds |
| `rate_limits` | API rate limiting | Requests per hour by endpoint |
| `ocr` | OCR processing | Confidence thresholds, density analysis |
| `fuzzy_matching` | Duplicate detection | Match thresholds, tolerances |
| `gap_analysis` | Gap detection | Importance weights, scoring |
| `ui` | User interface | Items per page, animation speed |
| `email` | Email settings | SMTP config, templates |

### Typed Configuration Interfaces

```typescript
// AI Configuration
interface AIConfig {
  openaiExtractionModel: string      // 'gpt-4o'
  openaiBackupModel: string          // 'gpt-4o-mini'
  anthropicExtractionModel: string   // 'claude-sonnet-4-20250514'
  anthropicBackupModel: string       // 'claude-3-5-haiku-20241022'
  maxTokens: number                  // 4096
  temperature: number                // 0.1
  chatTemperature: number            // 0.7
  minConfidence: number              // 0.7
  extractionTimeoutMs: number        // 90000
  preferredProvider: 'auto' | 'openai' | 'anthropic'
  enableFallback: boolean            // true
  consensusEnabled: boolean          // true
  consensusAgreementThreshold: number // 0.8
  consensusFields: string[]          // ['policyNumber', 'provider', ...]
}

// Evaluation Configuration
interface EvaluationConfig {
  weightPremium: number      // 20
  weightCoverage: number     // 30
  weightDeductible: number   // 15
  weightCompliance: number   // 20
  weightValue: number        // 15
  gradeAThreshold: number    // 90
  gradeBThreshold: number    // 80
  gradeCThreshold: number    // 70
  gradeDThreshold: number    // 60
  // ... more settings
}
```

### Admin API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/admin/settings/:category` | GET | Get all settings for a category |
| `/api/admin/settings/:category/:key` | PUT | Update a specific setting |
| `/api/admin/settings/:category/:key/history` | GET | View audit history |
| `/api/admin/settings/feature-flags` | GET | List all feature flags |
| `/api/admin/settings/feature-flags/:key` | PUT | Update feature flag |
| `/api/admin/settings/regional-factors` | GET | List regional factors |
| `/api/admin/settings/regional-factors/:region` | PUT | Update regional factor |
| `/api/admin/settings/providers` | GET | List insurance providers |
| `/api/admin/settings/benchmarks/:policyType` | GET | Get market benchmarks |
| `/api/admin/settings/export` | GET | Export all settings as JSON backup |
| `/api/admin/settings/import` | POST | Import settings from JSON (supports `?dryRun=true`) |
| `/api/admin/settings/performance` | GET | Get server-side config fetch metrics |
| `/api/admin/settings/performance` | POST | Submit client-side metrics for logging |

### Feature Flags

```typescript
// Check if a feature is enabled
if (await configService.isFeatureEnabled('use_db_config')) {
  // Use database configuration
}

// Get all feature flags
const flags = await configService.getFeatureFlags()
// [{ key: 'use_db_config', enabled: false, rolloutPercentage: 0 }, ...]
```

### Caching

The ConfigurationService includes in-memory caching with a 5-minute TTL:

```typescript
// Create service with custom cache settings
const service = ConfigurationService.getInstance({
  cacheTtlMs: 300000,  // 5 minutes (default)
  enableCache: true     // Enable caching (default)
})

// Invalidate cache manually
service.invalidateCache()         // All categories
service.invalidateCache('ai')     // Specific category
```

### Database Schema

The configuration system uses 7 tables:

| Table | Purpose |
|-------|---------|
| `app_settings` | Key-value settings with validation schemas |
| `settings_audit_log` | Automatic audit trail for all changes |
| `user_preferences` | Per-user preference overrides |
| `market_benchmarks` | Versioned market benchmark data |
| `insurance_providers` | Turkish insurance provider directory |
| `regional_factors` | Regional risk adjustment factors |
| `feature_flags` | Feature flag configuration |

All tables have Row Level Security (RLS) enabled and automatic `updated_at` triggers.

---

## Testing Strategy

### Test Organization
```
Unit Tests (Vitest):        *.test.ts alongside source files
Integration Tests:          src/__tests__/integration/
Performance Tests:          src/__tests__/performance/
E2E Tests (Playwright):     e2e/
Server Tests:               server/__tests__/
```

### Test Counts (as of Feb 19, 2026)
- **Total**: 14,484 tests across 299 test files (18 skipped)
- **Passing**: 100% (0 failures)
- **Coverage**: ~85% statements, ~77% branches, ~83% functions, ~86% lines
- **Note**: Massive coverage push across Feb 18-19 sessions added ~8,200 tests across 109 new test files. Includes comprehensive coverage for AI routes (112 tests), policy extractor, text processor, gap detection, privacy modules, regional benchmarking, market data, admin services, OCR pipeline, PDF export, security modules, landing components, and all major React components

### Key Test Files
| File | Tests | Purpose |
|------|-------|---------|
| `src/lib/policy-utils.test.ts` | 45 | Duplicate detection, fuzzy matching |
| `src/components/PolicyChat.test.tsx` | 29 | Chat component |
| `src/components/PolicyDetailView.test.tsx` | 44 | Policy detail view |
| `src/__tests__/performance/performance.test.ts` | 30 | Performance metrics |
| `server/__tests__/chat-routes.test.ts` | 18 | Chat API |
| `src/lib/admin/__tests__/settings-validation.test.ts` | 62 | Settings validation utilities |
| `src/components/admin/tabs/settings/SettingsHistoryPanel.test.tsx` | 27 | Settings history UI |
| `src/components/admin/tabs/settings/SettingsExportImport.test.tsx` | 15 | Settings export/import UI |
| `src/components/admin/tabs/settings/ConfigPerformancePanel.test.tsx` | 11 | Config performance dashboard |
| `src/lib/config/__tests__/config-performance-monitor.test.ts` | 21 | Performance monitor core |
| `server/__tests__/settings-routes.test.ts` | 43 | Settings API (includes export/import + performance) |
| `server/__tests__/admin-auth.test.ts` | 65 | JWT tokens, bcrypt, authenticateAdmin, requireRole, requirePermission |
| `server/__tests__/email-routes.test.ts` | 71 | Unsubscribe tokens (HMAC-SHA256), all 7 email endpoints |
| `server/__tests__/cost-control.test.ts` | 58 | Cost calculation, budgets, alerts, usage tracking, middleware |
| `src/lib/free-trial.test.ts` | 84 | All 15 exported functions, localStorage, expiry, share URLs |
| `src/lib/ai/pdf-splitter.test.ts` | 25 | PDF splitting: chunking, page ranges, edge cases |
| `src/lib/ai/document-ocr.test.ts` | 16 | Document OCR: hash, config, extraction, errors |
| `server/__tests__/pdf-routes.test.ts` | 23 | PDF quality analysis, Turkish OCR fixes |
| `server/__tests__/error-classification.test.ts` | 53 | AI provider error classification |
| `server/__tests__/ai-ocr-coverage.test.ts` | 1567 | AI OCR route coverage (all branches) |
| `src/components/PolicyUpload-coverage.test.tsx` | 1314 | PolicyUpload branch coverage |
| `server/__tests__/cost-control-coverage.test.ts` | 946 | Cost control all branches |
| `server/__tests__/admin-content-coverage.test.ts` | 985 | Admin content routes |
| `src/lib/pdf-export/generator-coverage.test.ts` | 753 | PDF export generator |
| `src/lib/pipeline/ocr-confidence-coverage.test.ts` | 630 | OCR confidence scoring |
| `src/lib/security/audit-logger-coverage.test.ts` | 679 | Security audit logging |
| `src/lib/privacy/consent-manager-coverage.test.ts` | 530 | KVKK consent management |

### Running Tests
```bash
# All tests
npm test

# Specific file
npm test -- --run src/lib/policy-utils.test.ts

# With coverage
npm run test:coverage

# E2E tests
npm run test:e2e
npm run test:e2e:fast  # Chromium only
```

---

## Code Conventions

### File Naming
- `components/PolicyCard.tsx` - PascalCase for components
- `lib/policy-utils.ts` - kebab-case for utilities
- `hooks/usePolicyUpload.ts` - camelCase with 'use' prefix
- `types/policy.ts` - lowercase for type files

### Component Structure
```tsx
// 1. Imports (external → internal → types)
import { useState } from 'react'
import { Button } from '@/components/ui/Button'
import type { Policy } from '@/types/policy'

// 2. Types (component-specific)
interface PolicyCardProps {
  policy: Policy
  onSelect?: (id: string) => void
}

// 3. Component (hooks → derived → handlers → render)
export function PolicyCard({ policy, onSelect }: PolicyCardProps) {
  const [expanded, setExpanded] = useState(false)
  const hasGaps = policy.gaps.length > 0
  const handleClick = () => onSelect?.(policy.id)

  return <div>...</div>
}
```

### TypeScript Patterns
```typescript
// Prefer interfaces for objects
interface Policy { id: string; type: PolicyType }

// Use type for unions
type PolicyType = 'home' | 'auto' | 'life' | 'health' | 'business'

// Avoid enums - use const objects with CHECK constraints in DB
const VALID_POLICY_TYPES = ['kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business'] as const
type PolicyType = typeof VALID_POLICY_TYPES[number]
```

### Tailwind Conventions
```tsx
<div className={cn(
  "flex flex-col gap-4",     // Layout
  "w-full max-w-2xl",        // Sizing
  "rounded-lg border",       // Appearance
  "hover:shadow-md",         // States
  isActive && "border-blue-500"  // Conditional
)}>
```

---

## UI Component Library

### Location: `src/components/ui/`

Base components built with Tailwind CSS, following shadcn/ui patterns:

| Component | File | Purpose |
|-----------|------|---------|
| `Button` | `button.tsx` | Primary action buttons with variants |
| `Card` | `card.tsx` | Content containers with header/footer |
| `Badge` | `badge.tsx` | Status indicators, tags |
| `Input` | `input.tsx` | Form inputs with validation states |
| `Progress` | `progress.tsx` | Progress bars for uploads, loading |
| `Loading` | `loading.tsx` | Spinner and skeleton loaders |
| `ErrorBoundary` | `error-boundary.tsx` | React error boundary with fallback UI |
| `ConfirmationDialog` | `confirmation-dialog.tsx` | Modal for destructive actions |

### Button Variants
```tsx
<Button variant="default">Primary</Button>
<Button variant="outline">Secondary</Button>
<Button variant="ghost">Tertiary</Button>
<Button variant="destructive">Delete</Button>
<Button size="sm">Small</Button>
<Button size="lg">Large</Button>
<Button disabled>Disabled</Button>
<Button loading>Loading...</Button>
```

### Card Usage
```tsx
<Card>
  <CardHeader>
    <CardTitle>Policy Details</CardTitle>
    <CardDescription>View your policy information</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Content */}
  </CardContent>
  <CardFooter>
    <Button>Save</Button>
  </CardFooter>
</Card>
```

---

## Custom Hooks

### Location: `src/hooks/`

| Hook | Purpose | Returns |
|------|---------|---------|
| `useBackendHealth` | Check backend server availability | `{ isHealthy, isLoading, error, retry }` |
| `useFileUpload` | Handle PDF upload with progress | `{ upload, progress, isUploading, error }` |
| `usePolicyEvaluation` | Evaluate policy against benchmarks | `{ evaluation, isLoading }` |
| `usePolicyComparison` | Compare multiple policies | `{ comparison, compare }` |
| `useRegionalBenchmark` | Get regional risk data | `{ benchmarks, region }` |
| `usePdfExport` | Export policy to PDF | `{ exportPdf, isExporting }` |
| `useCostTracking` | Track AI API costs | `{ costs, addCost }` |
| `useUserPreferences` | Three-tier config override | `{ preferences, updatePreference }` |

> **Removed (Feb 8, 2026)**: `useAnalytics`, `usePrivacy`, `useMarketData`, `useIndustryRisk`, `usePolicyTemplates` — zero production imports, functionality served by other modules (see Known Issue #75).

### Hook Pattern
```tsx
// Standard hook structure
export function useBackendHealth() {
  const [isHealthy, setIsHealthy] = useState<boolean | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  const checkHealth = useCallback(async () => {
    try {
      setIsLoading(true)
      const response = await fetch(`${API_URL}/api/health`)
      setIsHealthy(response.ok)
    } catch (err) {
      setError(err as Error)
      setIsHealthy(false)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    checkHealth()
  }, [checkHealth])

  return { isHealthy, isLoading, error, retry: checkHealth }
}
```

---

## Utility Functions

### Location: `src/lib/utils.ts`

```typescript
import { cn, formatCurrency, formatDate, formatNumber } from '@/lib/utils'

// Class name merging (Tailwind + clsx)
cn("base-class", isActive && "active-class", className)
// → Merges classes, handles conflicts

// Turkish currency formatting
formatCurrency(15000)      // "₺15.000"
formatCurrency(15000.50)   // "₺15.001" (rounded)

// Turkish date formatting
formatDate('2026-01-15')   // "15.01.2026"
formatDate(new Date())     // "11.01.2026"

// Turkish number formatting
formatNumber(1500000)      // "1.500.000"
```

### Policy Utilities (`src/lib/policy-utils.ts`)
```typescript
import {
  fuzzyMatchOCR,
  normalizeForOCR,
  isPolicyIdentifierMatch,
  calculatePolicyDiff,
  levenshteinDistance,
} from '@/lib/policy-utils'

// OCR-tolerant string comparison
fuzzyMatchOCR('POL-001', 'P0L-OO1', 0.85) // true

// Normalize for comparison
normalizeForOCR('İstanbul') // 'istanbul'

// Check if policies are duplicates
isPolicyIdentifierMatch(policyA, policyB, true) // fuzzy mode

// Calculate differences
const diff = calculatePolicyDiff(oldPolicy, newPolicy)
// { significantChanges, minorChanges, overallSignificance }
```

---

## KVKK/GDPR Privacy Compliance

### Location: `src/lib/privacy/`

InsurAI implements Turkish KVKK (Kişisel Verilerin Korunması Kanunu) compliance:

### Consent Management
```typescript
import { hasConsent, recordConsent, checkRequiredConsents } from '@/lib/privacy'

// Check if user has given consent
if (hasConsent(userId, 'analytics')) {
  trackEvent('page_view')
}

// Record new consent
await recordConsent(userId, 'marketing', true)

// Check all required consents before proceeding
const { allRequired, missing } = checkRequiredConsents(userId)
if (!allRequired) {
  showConsentDialog(missing)
}
```

### Data Subject Rights
```typescript
import {
  requestDataAccess,
  requestDataDeletion,
  exportUserData,
} from '@/lib/privacy'

// User requests their data (KVKK Article 11)
const userData = await exportUserData(userId)

// User requests deletion (Right to be forgotten)
await requestDataDeletion(userId)
```

### Personal Data Categories
| Category | Examples | Sensitivity |
|----------|----------|-------------|
| `identity` | Name, TC Kimlik No | High |
| `contact` | Email, phone, address | Medium |
| `financial` | Premium amounts, coverage | High |
| `insurance` | Policy details, claims | High |
| `technical` | IP address, device info | Low |

### KVKK Compliance Checklist
- ✅ Explicit consent collection before data processing
- ✅ Data minimization (only collect what's needed)
- ✅ Purpose limitation (use data only for stated purpose)
- ✅ Data subject access requests (DSAR)
- ✅ Right to deletion
- ✅ Data portability (JSON export)
- ✅ Breach notification procedures
- ✅ Retention policies (auto-delete after period)

---

## Error Handling Patterns

### API Error Handling
```typescript
// Server-side (server/routes/ai.ts)
try {
  const result = await openai.chat.completions.create(...)
  res.json({ success: true, data: result })
} catch (error) {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 429) {
      return res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        retryAfter: error.headers?.['retry-after']
      })
    }
  }
  // Log to Sentry
  captureException(error)
  res.status(500).json({ success: false, error: 'Internal server error' })
}
```

### React Error Boundary
```tsx
// Wrap routes with ErrorBoundary
<ErrorBoundary
  fallback={<ErrorFallback />}
  onError={(error, info) => captureException(error, { extra: info })}
>
  <Routes>
    <Route path="/dashboard" element={<Dashboard />} />
  </Routes>
</ErrorBoundary>
```

### Form Validation with Zod
```typescript
// Server validation (server/middleware/validation.ts)
const chatSchema = z.object({
  message: z.string().min(1).max(4096),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string()
  })).optional(),
  policyContext: z.string().max(51200).optional(),
  provider: z.enum(['openai', 'anthropic']).optional()
})

// Usage in route
app.post('/api/ai/chat', validateBody(chatSchema), async (req, res) => {
  // req.body is typed and validated
})
```

---

## Policy Scoring Algorithm

### Evaluation Weights (Default)
```typescript
const DEFAULT_WEIGHTS = {
  premium: 20,      // Cost efficiency
  coverage: 30,     // Coverage comprehensiveness
  deductible: 15,   // Out-of-pocket exposure
  compliance: 20,   // Regulatory compliance
  value: 15,        // Value for money ratio
}
```

### Score Calculation
```typescript
// From src/lib/policy-evaluation/evaluator.ts
function calculateScore(policy: Policy, benchmarks: Benchmarks): number {
  // 1. Coverage Score (0-100)
  const coverageScore = calculateCoverageScore(
    policy.coverages,
    benchmarks.typicalCoverages
  )

  // 2. Premium Score (0-100) - lower is better
  const premiumScore = calculatePremiumScore(
    policy.premium,
    benchmarks.typicalPremium,
    policy.coverage
  )

  // 3. Deductible Score (0-100) - lower deductible = higher score
  const deductibleScore = calculateDeductibleScore(
    policy.deductible,
    benchmarks.typicalDeductible
  )

  // 4. Compliance Score (0-100)
  const complianceScore = checkComplianceScore(policy, regulations)

  // 5. Value Score (coverage per premium unit)
  const valueScore = (policy.coverage / policy.premium) * normalizationFactor

  // Weighted average
  return (
    coverageScore * weights.coverage +
    premiumScore * weights.premium +
    deductibleScore * weights.deductible +
    complianceScore * weights.compliance +
    valueScore * weights.value
  ) / 100
}
```

### Grade Thresholds
```typescript
function getGrade(score: number): Grade {
  if (score >= 90) return 'A'  // Excellent
  if (score >= 75) return 'B'  // Good
  if (score >= 60) return 'C'  // Fair
  if (score >= 40) return 'D'  // Poor
  return 'F'                    // Critical
}
```

---

## Common Code Patterns

### Async Data Fetching
```tsx
// Pattern used throughout the app
function PolicyList() {
  const [policies, setPolicies] = useState<Policy[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    const fetchPolicies = async () => {
      try {
        setIsLoading(true)
        const data = await getPolicies()
        setPolicies(data)
      } catch (err) {
        setError(err as Error)
      } finally {
        setIsLoading(false)
      }
    }
    fetchPolicies()
  }, [])

  if (isLoading) return <Loading />
  if (error) return <ErrorMessage error={error} />
  return <PolicyGrid policies={policies} />
}
```

### Optimistic Updates
```tsx
// For better UX on mutations
const handleDelete = async (policyId: string) => {
  // Optimistic: remove from UI immediately
  setPolicies(prev => prev.filter(p => p.id !== policyId))

  try {
    await deletePolicy(policyId)
    toast.success('Policy deleted')
  } catch (error) {
    // Rollback on failure
    setPolicies(prev => [...prev, policy])
    toast.error('Failed to delete policy')
  }
}
```

### Context Provider Pattern
```tsx
// Used for PolicyContext, AuthContext
const PolicyContext = createContext<PolicyContextType | null>(null)

export function PolicyProvider({ children }: { children: ReactNode }) {
  const [policies, setPolicies] = useState<Policy[]>([])
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null)

  const value = useMemo(() => ({
    policies,
    selectedPolicy,
    addPolicy: (policy: Policy) => setPolicies(prev => [...prev, policy]),
    removePolicy: (id: string) => setPolicies(prev => prev.filter(p => p.id !== id)),
    selectPolicy: setSelectedPolicy,
  }), [policies, selectedPolicy])

  return (
    <PolicyContext.Provider value={value}>
      {children}
    </PolicyContext.Provider>
  )
}

export function usePolicies() {
  const context = useContext(PolicyContext)
  if (!context) throw new Error('usePolicies must be used within PolicyProvider')
  return context
}
```

### Debounced Search
```tsx
// For search inputs
function PolicySearch({ onSearch }: { onSearch: (query: string) => void }) {
  const [query, setQuery] = useState('')

  const debouncedSearch = useMemo(
    () => debounce((q: string) => onSearch(q), 300),
    [onSearch]
  )

  useEffect(() => {
    debouncedSearch(query)
    return () => debouncedSearch.cancel()
  }, [query, debouncedSearch])

  return <Input value={query} onChange={e => setQuery(e.target.value)} />
}
```

---

## Known Issues & Solutions

### 1. Port 3001 Conflicts
- **Problem**: Port 3001 often in use
- **Solution**: All ports changed to 4001
- **Files**: `server/index.ts`, `.env`, `vite.config.ts`

### 2. PDF.js Worker 404
- **Problem**: cdnjs.cloudflare.com doesn't have pdfjs-dist@5.4.530
- **Solution**: Use unpkg.com as primary CDN
- **File**: `src/lib/ai/pdf-parser.ts`

### 3. Schema ENUM vs TEXT
- **Problem**: PostgreSQL ENUM types are inflexible for Turkish policy types
- **Solution**: Use TEXT with CHECK constraints instead
- **File**: `supabase/schema.sql` - uses TEXT CHECK (type IN ('kasko', 'traffic', ...))

### 4. Multiple Elements in Tests
- **Problem**: `getByText()` fails when multiple elements match
- **Solution**: Use `getAllByText()` or more specific queries
- **Example**: `PolicyDetailView.test.tsx` - "Deductible" appears multiple times

### 5. UUID Format for Supabase
- **Problem**: Custom IDs like `policy-123-abc` rejected
- **Solution**: Use `crypto.randomUUID()`
- **File**: `src/lib/ai/policy-extractor.ts`

### 6. Turkish Character Encoding
- **Problem**: İ, Ş, Ğ, Ü, Ö, Ç display issues
- **Solution**: Always use UTF-8, test with Turkish chars
- **Fuzzy matching**: `normalizeForOCR()` handles Turkish characters

### 7. Cached Supabase Sessions
- **Problem**: Old auth state persists
- **Solution**: `localStorage.clear(); location.reload();`

### 8. OCR Character Confusion
- **Problem**: OCR confuses 0/O, 1/l/I, etc.
- **Solution**: Fuzzy matching with Levenshtein distance (0.85 threshold)
- **File**: `src/lib/policy-utils.ts`

### 9. Duplicate Detection False Positives (Fixed Jan 2026)
- **Problem**: Identical policies flagged as amendments due to minor formatting differences
- **Example**: "NO: 25 /1A" vs "NO: 25/1A" incorrectly flagged as different
- **Solution**: Added tolerant string comparison in `src/lib/policy-utils.ts`
- **Functions**: `normalizeStringTolerant()`, `arraysEqualTolerant()`
- **Behavior**: Collapses whitespace, normalizes punctuation around `:`, `/`, `,`, `.`

### 10. API Proxy Not Detected in Production (Fixed Jan 2026)
- **Problem**: "No AI service configured" error on Railway/Vercel deployments
- **Cause**: `VITE_API_PROXY_URL` baked at build time, not available in production
- **Solution**: Auto-detect from `window.location.origin` in production
- **Files**: `src/lib/env.ts`, `src/lib/ai/config.ts`

### 11. PDF.js Worker Blocked by CSP (Fixed Jan 2026)
- **Problem**: PDF parsing fails with "Setting up fake worker" warning
- **Cause**: CSP blocking `unpkg.com` where PDF.js worker is hosted
- **Solution**: Added CDN domains to CSP in `server/index.ts`
- **Domains**: `unpkg.com`, `cdn.jsdelivr.net`, `cdnjs.cloudflare.com`

### 12. ESM Module Resolution in Production
- **Problem**: `Cannot find module './routes/ai'` error on Railway
- **Cause**: Node.js ESM requires `.js` extensions in imports
- **Solution**: Changed `server/tsconfig.json` to `"module": "NodeNext"` and added `.js` extensions
- **Files**: `server/tsconfig.json`, `server/index.ts`, `server/routes/*.ts`

### 13. Kasko Coverage Display Issues (Fixed Jan 14, 2026)
- **Problem**: Multiple display issues with kasko policies:
  - Coverage limit incorrectly summed all limits instead of showing "Rayiç Değer" (market value)
  - "Artan Mali Sorumluluk" showed ₺0 instead of "Sınırsız" (unlimited)
  - "İkame Araç" showed ₺0 instead of "Dahil" (included)
  - False missing coverage alerts for implicit kasko coverages (Çarpma/Çarpışma, Hırsızlık, etc.)
  - Generic recommendations like "Improve Coverage" not actionable
- **Solution**:
  - Added `isUnlimited`, `isMarketValue` flags to Coverage type
  - Added `CoverageCategory` and `CoverageImportance` types
  - Created `KASKO_IMPLICIT_COVERAGES` list to skip false alerts
  - Updated `generateRecommendations()` with specific amounts and actionable advice
  - Added color coding: green (good), yellow (moderate), red (critical exclusions)
- **Files**: `src/types/policy.ts`, `src/lib/ai/policy-extractor.ts`, `src/components/PolicyDetailView.tsx`, `src/lib/policy-evaluation/evaluator.ts`

### 14. Mobile UX Improvements (Jan 16-17, 2026)
- **Problem**: PolicyDetailView and PolicyDashboard not optimized for mobile
  - Information hierarchy unclear on small screens
  - Coverages section too verbose
  - Score breakdown labels truncated ("Complia...")
  - Double checkmarks appearing in AI Insights
  - Grid/filter overflow on mobile

- **Solution (PolicyDetailView)**:
  - Reorganized header: Insurance type (Kasko) as title, provider as subtitle, plate number as third line
  - Removed redundant "Tür: Kasko" from Policy Overview
  - Made sections collapsible/expandable:
    - Score Breakdown: click to toggle mini/full view
    - AI Insights: show first 3, "+X more insights" button
    - Recommendations: show first 2, expand for all
    - Coverage Details: collapsible categories with preview (first 2 items + "+X more")
    - Exclusions: collapsed by default
  - Fixed double checkmarks by stripping existing "✓" from AI insight text
  - Created `CollapsibleCoverageCategory` component for mobile-friendly coverage display
  - Fixed ScoreBreakdown mini variant truncation

- **Solution (PolicyDashboard)**:
  - Fixed grid column overflow on mobile
  - Fixed filter row overflow
  - Redesigned stats cards with compact pill badges for mobile
  - Replaced full stats cards with horizontal scrollable badges on small screens

- **Files**:
  - `src/components/PolicyDetailView.tsx` - Major restructure
  - `src/components/evaluation/ScoreBreakdown.tsx` - Mini variant fix
  - `src/components/PolicyDashboard.tsx` - Mobile overflow fixes
  - `public/sw.js` - Cache version bumped to v6

### 15. Combined Document Processing Pipeline (Jan 18, 2026)
- **Feature**: Two-stage document processing combining deterministic and AI processing
- **Stage 1 - Clean-Room Processing** (`document-normalizer.ts`):
  - Deterministic Turkish OCR spacing fixes (B İ RLE Şİ K → BİRLEŞİK)
  - PII detection and redaction with standardized tokens
  - TC Kimlik, IBAN, phone, email, plate number validation
  - Produces audit-friendly, legally defensible output
  - Three outputs: CLEAN_COPY, REDACTED_COPY, PII_VAULT
- **Stage 2 - AI-Enhanced Processing** (`prompts.ts`):
  - Context-aware OCR correction using AI
  - Structured extraction with universal insurance schema
  - Validation against known Turkish insurance terms
- **New Functions** (`text-processor.ts`):
  - `processDocumentCombined()` - Full two-stage pipeline
  - `processDocumentQuick()` - Lightweight version for simple OCR
  - `processDocumentCleanRoom()` - Deterministic-only processing
- **Benefits**:
  - Deterministic processing handles mechanical fixes reliably
  - AI processing handles context-dependent corrections
  - PII vault preserves sensitive data for authorized access
  - Full audit trail with normalization logs
- **Files**:
  - `src/lib/ai/text-processor.ts` - Combined pipeline functions
  - `src/lib/ai/document-normalizer.ts` - Clean-room normalizer (870+ lines)
  - `src/lib/ai/prompts.ts` - AI prompts for OCR and extraction
  - Tests: 55 text-processor + 49 document-normalizer + 23 prompts = 127 new tests

### 16. Admin Auth 500 Error - Environment Variable Priority (Fixed Jan 20, 2026)
- **Problem**: Admin login returned 500 Internal Server Error on Railway
- **Root Cause**: Server code read `VITE_SUPABASE_URL` first (line 56 in `admin-auth.ts`), but `VITE_*` vars are only available at build time, not runtime on Railway
- **Solution**: Changed env var priority to `SUPABASE_URL` first, `VITE_SUPABASE_URL` as fallback
- **Additional Fix**: Added `getSupabaseWithError()` function for explicit error handling with fail-fast behavior
- **Files**:
  - `server/middleware/admin-auth.ts` - Fixed env var priority, added error-aware functions
  - `server/services/admin-db.ts` - Same fix applied
  - `server/routes/admin.ts` - Returns 503 `DB_NOT_CONFIGURED` when Supabase unavailable

### 17. crypto.randomUUID() Not Available in Production (Fixed Jan 20, 2026)
- **Problem**: `ReferenceError: crypto is not defined` on Railway
- **Root Cause**: `crypto.randomUUID()` was used without importing `crypto` module
- **Solution**: Added `import crypto from 'crypto'` to `server/routes/admin.ts`
- **Note**: While Node.js 19+ has global `crypto`, Railway environments may not expose it

### 18. require('crypto') in ESM Module (Fixed Jan 20, 2026)
- **Problem**: `hashToken()` function used `require('crypto')` which fails in ESM
- **Root Cause**: Server uses `"module": "NodeNext"` (ESM), but `require()` is CommonJS-only
- **Solution**: Changed to proper ES import: `import crypto from 'crypto'`
- **File**: `server/middleware/admin-auth.ts`

### 19. React Hooks Error #310 in AdminDashboard (Fixed Jan 20, 2026)
- **Problem**: `Minified React error #310` when loading admin dashboard
- **Root Cause**: `useCallback` and `useEffect` hooks were placed AFTER conditional returns (`if (authLoading)` and `if (!isAuthenticated)`), violating React Rules of Hooks
- **Solution**: Moved all hooks to top of component, before any conditional returns
- **Pattern**:
  ```tsx
  // WRONG: hooks after early return
  if (loading) return <Spinner />
  const data = useCallback(() => {...}, [])  // ERROR!

  // CORRECT: all hooks first, then conditional returns
  const data = useCallback(() => {...}, [])
  if (loading) return <Spinner />
  ```
- **File**: `src/components/admin/AdminDashboard.tsx`

### 20. Admin Prompts Tab Empty / 401 Errors (Fixed Jan 20, 2026)
- **Problem**: Admin Dashboard Prompts tab showed "No prompt templates found" even though prompts were in database
- **Root Causes**:
  1. Admin components used direct `fetch()` without Authorization headers
  2. API endpoint mismatch: client called `/prompts/templates` but server had routes at `/prompts`
  3. Express route ordering: `/prompts/:id` caught `/prompts/templates` before specific route
- **Solution**:
  1. Added `adminFetch()` wrapper function in `src/lib/admin/api.ts` that auto-includes auth token
  2. Changed API client to use `/prompts` endpoints instead of `/prompts/templates`
  3. Updated all admin tab components to use `adminFetch` instead of raw `fetch`
- **Files Changed**:
  - `src/lib/admin/api.ts` - Added `adminFetch()`, fixed endpoint paths
  - `src/components/admin/AdminDashboard.tsx` - Use adminFetch
  - `src/components/admin/tabs/*.tsx` - All tabs updated to use adminFetch
- **New Files**:
  - `server/services/prompt-service.ts` - Centralized prompt management
  - `supabase/migrations/006_seed_prompts.sql` - Seeds 16 AI prompts

### 21. Admin-Managed AI Prompts System (Added Jan 20, 2026)
- **Feature**: All AI prompts now managed through Admin Dashboard → Prompts tab
- **Database Tables**: `prompt_templates`, `prompt_versions` (created in migration 005)
- **Seeded Prompts** (16 total):
  - Extraction: Master, Type Detection, Kasko, Traffic, Home, Health, Life, DASK, Business, Nakliyat
  - Chat: Policy Chat Assistant
  - OCR: Lightweight Correction, Document Preprocessing, Document Normalization Full
  - Analysis: Coverage Gap Analysis, Extraction Quality Scoring
- **Architecture**:
  - `server/services/prompt-service.ts` - Fetches prompts from DB with in-memory cache (5-min TTL)
  - `server/routes/ai.ts` - Uses prompt-service for extraction/chat prompts with hardcoded fallback
  - Template variables: `{{var}}` and `{{#if var}}...{{/if}}` syntax

### 22. OCR Cleanup Pipeline Unicode Improvements (Fixed Jan 22, 2026)
- **Problem**: OCR pipeline had issues with:
  - Turkish uppercase chars like `İ` (U+0130) and `Ş` (U+015E) not matching in regex character classes
  - Garbage patterns like `a!!!!!a` with embedded control characters persisting
  - QA gates missing remnant detection for control characters
  - Spaced Turkish fragment merging incomplete for mixed-length patterns
- **Root Cause**: Regex character classes `[A-ZÇĞİÖŞÜ]` have encoding issues with Turkish Unicode chars
- **Solution**:
  - Added Unicode-safe `isTurkishUpperChar()` using explicit codepoint checking + `\p{Lu}` fallback
  - Added `isAllTurkishUpper()` function with NFC normalization
  - Added `stripControlChars()` for C0/C1 control character removal
  - New QA gate `no_control_chars` for remnant detection
  - Enhanced LLM cleanup prompt (v5) with detailed issue-specific instructions
  - Lowered high-ASCII detection threshold from 5+ to 3+ characters
- **Files Changed**:
  - `src/lib/pipeline/ocr-sanitizer.ts` - Unicode-safe matching, control char stripping
  - `src/lib/pipeline/qa-gates.ts` - New gate, improved detection, v5 LLM prompt
- **Key Functions**:
  ```typescript
  // Unicode-safe Turkish uppercase check
  function isTurkishUpperChar(char: string): boolean {
    const codepoint = char.codePointAt(0)
    if (TURKISH_UPPER_CODEPOINTS.has(codepoint)) return true
    return /^\p{Lu}$/u.test(char) // Fallback to Unicode property
  }

  // NFC normalization before matching
  const normalizedText = text.normalize('NFC')
  ```

### 23. Turkish Word Boundary Handling in OCR Patterns (Fixed Jan 22, 2026)
- **Problem**: OCR cleanup patterns had multiple issues:
  - TC Kimlik numbers with repeated digits (e.g., `10000000146` with 7 zeros) removed as "repetitive noise"
  - Turkish characters (`ı`,`ş`,`ğ`,`ü`,`ö`,`ç`) are NOT word characters in JS regex, causing `\b` to fail
  - `despaceLeadingSplits` matched lowercase letters, merging "e sigorta" → "esigorta"
  - Words without spacing changed case (e.g., "Anadolu" → "ANADOLU")
  - General Turkish char patterns crossed word boundaries
- **Root Causes**:
  - `/(.)\1{6,}/` pattern caught valid identifier numbers
  - `\b` (word boundary) doesn't work after Turkish chars because `\w` only matches `[A-Za-z0-9_]`
  - Pattern `[TR_ALL]` included both upper and lowercase letters
  - `fixOCRSpacing` replaced matches even without whitespace
- **Solution**:
  - Added exceptions for TC Kimlik/IBAN patterns and 10+ digit numbers in repetitive char detection
  - Use `(?=\s|$)` instead of `\b` at end of patterns containing Turkish chars
  - Changed `despaceLeadingSplits` to only match `[TR_UPPER]` (uppercase letters)
  - Added whitespace check in `fixOCRSpacing` - only replace when `\s` exists in match
  - Removed overly aggressive general Turkish char patterns
- **Files Changed**:
  - `src/lib/pipeline/deterministic-preclean.ts` - TC Kimlik exception, uppercase-only matching
  - `src/lib/ai/document-normalizer.ts` - Word boundary fixes, whitespace check
- **Key Patterns Fixed**:
  ```typescript
  // BEFORE (broken): Turkish chars not at word boundary
  [/\bsigorta\s+l\s*ı\b/gi, 'sigortalı']  // \b after ı fails!

  // AFTER (working): Use lookahead instead
  [/\bsigorta\s+l\s*ı(?=\s|$)/gi, 'sigortalı']  // (?=\s|$) works

  // TC Kimlik preservation
  const hasIdentifierPattern = /\b(?:TC|Kimlik|IBAN|No|Poliçe)\b/i.test(line) ||
                               /\b\d{10,26}\b/.test(line)
  if (!hasIdentifierPattern && /(.)\1{6,}/.test(line)) {
    return { isNoise: true }  // Only remove if NOT an identifier
  }
  ```

### 24. Document Journey Full Content Capture (Added Jan 25, 2026)
- **Feature**: Admin Document Journey viewer now shows actual text content at each stage, not just metadata
- **Problem**: Admins could only see summaries like `text_length: 62459` but not the actual content
- **Solution**:
  - Added `full_input_text`, `full_output_text`, `full_extracted_json` fields to `ProcessingStageRecord`
  - Added `diff_summary` with characters added/removed and sample changes
  - Created `TextContentViewer` component with expandable sections and copy-to-clipboard
  - Created `DiffSummaryViewer` component with side-by-side comparison
  - Updated policy-extractor to log full text at key stages
- **Files Changed**:
  - `src/types/processing-log.ts` - New fields for full content
  - `src/lib/processing-logger.ts` - Updated `CompleteStageOptions` interface
  - `src/lib/ai/policy-extractor.ts` - Log full text at pdf_extraction, text_preprocessing, ai_extraction, validation
  - `src/components/admin/DocumentJourneyViewer.tsx` - New viewer components
- **Stages with Full Content**:
  - `pdf_extraction`: Full extracted PDF text
  - `text_preprocessing`: Before/after text with diff summary
  - `ai_extraction`: Input text and full extracted JSON
  - `validation`: Final validated policy JSON

### 25. Document Journey Decision Context for Skipped Stages (Added Jan 25, 2026)
- **Feature**: When pipeline stages are skipped, admins now see detailed explanation of WHY
- **Problem**: Skipped stages only showed "Text density sufficient" without context
- **Solution**:
  - Added `StageDecisionContext` interface with threshold, actual_values, decision_logic, alternatives
  - Updated `skipStage()` to accept detailed options
  - Added `DecisionContextViewer` component showing:
    - Assessment performed (what was checked)
    - Decision threshold (e.g., chars_per_page < 200)
    - Actual measured values (formatted table)
    - Decision logic explanation
    - What would trigger the stage
- **Files Changed**:
  - `src/types/processing-log.ts` - Added `StageDecisionContext` interface
  - `src/lib/processing-logger.ts` - Updated `skipStage()` method
  - `src/lib/ai/policy-extractor.ts` - Detailed context for ocr_processing, form_field_enhancement, table_parsing skips
  - `src/components/admin/DocumentJourneyViewer.tsx` - `DecisionContextViewer` component
- **Example Decision Context** (for skipped OCR):
  ```typescript
  {
    assessment_performed: 'Text density analysis',
    threshold: { name: 'chars_per_page', value: 200, comparison: 'less_than' },
    actual_values: { chars_per_page: 12492, is_likely_scanned: false },
    decision_logic: 'Text density sufficient (12492 >= 200 threshold)',
    alternatives: ['OCR triggered if chars_per_page < 200']
  }
  ```

### 26. Coverage Name Null Safety (Fixed Jan 25, 2026)
- **Problem**: Validation stage failed with `Cannot read property 'toLowerCase' of undefined` on coverage.name
- **Root Cause**: AI extraction could return coverages with `description` but no `name` field
- **Solution**:
  - Added `getCoverageName()` helper function for null-safe access
  - Updated `convertToAnalyzedPolicy` to fallback name to description
  - Fixed 12+ locations using `.name.toLowerCase()` to use `getCoverageName()`
- **File**: `src/lib/ai/policy-extractor.ts`

### 27. Configuration-Driven OCR Decision Engine (Added Jan 26, 2026)
- **Feature**: Full-featured OCR decision system with JSON configuration and Document Journey metadata
- **Components**:
  - `OCRDecisionEngine` - Main orchestrator with 5-component weighted confidence calculation
  - `LanguageDetector` - Detects Turkish, English, German via term + character matching
  - `PolicyTypeClassifier` - Classifies kasko, traffic, health, fire, life with exclusion terms
  - `TextQualityAnalyzer` - Checks encoding issues, garbage patterns, insurance term density
  - `FieldExtractor` - Tests extraction of policy number, insured name, dates, premium
  - `ConfigurationManager` - Loads JSON configs for locales and policy types
- **Confidence Calculation** (5 weighted components):
  ```typescript
  weights: {
    char_density: 0.25,      // Character density score
    text_quality: 0.30,      // Insurance term matching
    page_variance: 0.15,     // Page-to-page consistency
    encoding_check: 0.15,    // Encoding quality
    field_extraction: 0.15   // Required fields found
  }
  ```
- **Decision Thresholds**:
  - `skip_ocr`: confidence >= 0.70 (good digital PDF)
  - `selective_ocr`: confidence >= 0.40 (OCR specific pages)
  - `full_ocr`: confidence < 0.40 (OCR entire document)
- **Document Journey Metadata**: `buildDocumentJourneyMetadata()` provides full diagnostic output:
  ```typescript
  {
    ocr_decision: {
      action: 'skip_ocr',
      confidence: 0.89,
      confidence_breakdown: { char_density: {...}, text_quality: {...}, ... },
      language_detection: { detected: 'tr', matched_terms: [...], runner_up: {...} },
      policy_classification: { detected: 'motor_kasko', matched_terms: [...], config_used: '...' },
      text_quality: { quality_score: 0.85, garbage_patterns_checked: [...] },
      field_extraction: { extraction_rate: 0.6, fields: { policy_number: {...} } },
      page_analysis: { flagged_pages: [...] },
      reasoning: ['Language detected as TR (85%)', '...']
    }
  }
  ```
- **Files**:
  - `src/lib/ocr-decision/*.ts` - All engine components (7 files)
  - `config/locales/*.json` - Language configs (tr, en, de, _universal)
  - `config/policy_types/**/*.json` - Policy type configs (motor, property, health, _generic)
  - `config/ocr-settings.json` - Thresholds and weights
- **Tests**: 145 tests (81 unit + 64 regression)

### 28. Document AI 15-Page Limit and PDF Splitting (Updated Jan 28, 2026)
- **Problem**: Document AI failing with "Document pages in non-imageless mode exceed the limit: 15 got 16"
- **Root Cause**: Standard Document AI OCR processor (`c2741b178ab61433`) has 15-page limit per request
- **Initial Attempt (Failed)**: Tried `enableImagelessMode: true` but this option does NOT exist on standard OCR processors
- **Error from API**: `"Invalid JSON payload received. Unknown name enableImagelessMode at process_options.ocr_config: Cannot find field."`
- **Final Solution**: Client-side PDF splitting for documents >15 pages
- **Files Changed**:
  - `src/lib/ai/pdf-splitter.ts` - **NEW** Splits PDFs using pdf-lib
  - `src/lib/ai/document-ocr.ts` - Chunked extraction with result combining
  - `server/routes/ai.ts` - Removed unsupported options (v5)
- **How It Works**:
  ```
  16-page PDF uploaded
        ↓
  Check page count (16 > 15)
        ↓
  Split into chunks:
    - Chunk 1: pages 1-15
    - Chunk 2: page 16
        ↓
  Process each chunk with Document AI
        ↓
  Combine results with correct page numbers
        ↓
  Return unified result
  ```
- **Key Functions**:
  - `splitPdf()` - Splits PDF into chunks of max 15 pages
  - `getPdfPageCount()` - Quick page count check
  - `extractWithDocumentAIChunked()` - Orchestrates chunk processing
  - `combineChunkResults()` - Merges all chunk results
- **Version Markers in Logs**:
  - `v4`: Attempted `enableImagelessMode: true` (FAILED - not supported)
  - `v5`: Removed unsupported options, use PDF splitting instead
- **Note**: `enableImagelessMode` only works on Enterprise Document OCR processors, not standard ones

### 29. Service Worker Cache Busting for New Deployments (Updated Jan 28, 2026)
- **Problem**: Browser loading old JavaScript bundles after Railway deployment
- **Root Cause**: Service worker cache-first strategy serving stale assets
- **Solution**:
  - Bumped service worker cache version (currently `v9`)
  - Enabled automatic page reload on `controllerchange` event
- **Files Changed**:
  - `public/sw.js` - Cache version `v9`
  - `src/lib/pwa/index.ts` - Added `window.location.reload()` on controller change
- **Pattern**:
  ```typescript
  // In src/lib/pwa/index.ts
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    console.log('[PWA] New service worker activated, reloading page')
    window.location.reload()
  })
  ```

### 30. GCP Service Account Credentials via Base64 Environment Variable (Added Jan 27, 2026)
- **Problem**: Railway doesn't support file mounts for GCP service account JSON
- **Solution**: Support base64-encoded credentials via environment variable
- **Environment Variables Supported**:
  - `GCP_SERVICE_ACCOUNT_BASE64` (preferred)
  - `GCP_CREDENTIALS_BASE64` (fallback)
  - `GOOGLE_APPLICATION_CREDENTIALS` (file path, for local dev)
- **File Changed**: `server/routes/ai.ts`
- **How It Works**:
  1. Server decodes base64 credentials on startup
  2. Writes to temporary file `.gcp-credentials-temp.json`
  3. Uses file path for GoogleAuth initialization
- **To Set Up**:
  ```bash
  # Encode your service account JSON file:
  base64 -w 0 service-account.json
  # Set the output as GCP_SERVICE_ACCOUNT_BASE64 in Railway
  ```

### 31. Admin Diagnostics Endpoint and Improved Error Handling (Added Jan 28, 2026)
- **Problem**: Admin login returned 500 error with no clear indication of what's misconfigured
- **Solution**: Added diagnostic endpoint and improved error handling
- **New Endpoint**: `GET /api/admin/diagnostics` - Returns configuration status without exposing secrets
  ```json
  {
    "success": false,
    "status": "misconfigured",
    "config": {
      "hasJwtSecret": false,
      "jwtSecretLength": "not set",
      "hasSupabaseUrl": true,
      "hasServiceKey": true,
      "supabaseClientInitialized": true
    },
    "issues": ["ADMIN_JWT_SECRET not configured"]
  }
  ```
- **Improved Login Errors**:
  - `JWT_NOT_CONFIGURED` (503) - ADMIN_JWT_SECRET missing
  - `DB_NOT_CONFIGURED` (503) - SUPABASE_URL or SERVICE_ROLE_KEY missing
  - `TOKEN_GENERATION_ERROR` (500) - Token creation failed with details
- **File Changed**: `server/routes/admin.ts`
- **Usage**: Visit `https://insurai-production.up.railway.app/api/admin/diagnostics` to debug deployment issues

### 32. ESLint Cleanup and React Hooks Exhaustive-Deps Fixes (Fixed Jan 29, 2026)
- **Problem**: Multiple code quality issues:
  - 153 ESLint errors (reduced to 0)
  - 161 ESLint warnings (reduced to 48)
  - 4 `react-hooks/exhaustive-deps` warnings with potential stale closure bugs
  - Railway build failure from linter auto-renaming catch block variables
- **Root Causes**:
  - Unused variables, imports, and eslint-disable directives
  - `console.log` usage where `console.warn` expected
  - useEffect dependencies missing complex callback functions
  - Linter renamed `error` to `_error` in catch blocks but code still referenced `error`
- **Solutions**:
  1. **ESLint Errors (153 → 0)**:
     - Removed unused imports/variables or prefixed with `_`
     - Added eslint-disable for intentional patterns (control regex)
     - Fixed useless escapes in character classes
  2. **ESLint Warnings (161 → 48)**:
     - Changed `console.log` to `console.warn` across many files
     - Removed unused eslint-disable directives
     - Remaining 45 are `no-non-null-assertion` (deferred - requires refactoring)
  3. **React Hooks Exhaustive-Deps**:
     - `PolicyUpload.tsx`: Used ref pattern for complex callback chain
     - `AuditTab.tsx`: Used useCallback for fetchLogs
     - `ConfigTab.tsx`: Used useCallback + fixed stale closure bug
  4. **Catch Block Variables**:
     - Changed all 71 `} catch (_error) {` back to `} catch (error) {`
- **Files Changed**:
  - `src/components/PolicyUpload.tsx` - Ref pattern for addFiles
  - `src/components/admin/tabs/AuditTab.tsx` - useCallback for fetchLogs
  - `src/components/admin/tabs/ConfigTab.tsx` - useCallback + stale closure fix
  - `server/routes/admin.ts` - 71 catch block fixes
  - Multiple files in `src/lib/ai/` and `services/` for console.warn changes
- **Patterns for useEffect Dependencies**:
  ```tsx
  // Pattern 1: Ref pattern for complex callback chains
  const addFilesRef = useRef<(files: File[]) => Promise<void>>()
  addFilesRef.current = addFiles  // Keep ref updated
  useEffect(() => {
    addFilesRef.current?.(selectedFiles)
  }, [location, navigate])  // Only stable dependencies

  // Pattern 2: useCallback for simple dependencies
  const fetchData = useCallback(async () => {
    // ... fetch logic
  }, [filter1, filter2])
  useEffect(() => {
    fetchData()
  }, [fetchData])
  ```
- **Stale Closure Bug Fixed**:
  ```tsx
  // BEFORE (bug): error state was stale
  const fetchData = async () => {
    if (!error) {  // Always reads initial error value!
      setError(msg)
    }
  }

  // AFTER (fixed): use local variable
  const fetchData = useCallback(async () => {
    let hasError = false
    // ... fetch and set hasError = true on error
    if (!hasError) {
      setError(msg)
    }
  }, [])
  ```

### 33. Free Trial Upload Flow and Extraction Timeout Fixes (Fixed Jan 30, 2026)
- **Problem**: Multiple issues with anonymous user free trial flow:
  - Files uploaded on landing page returned users to upload page instead of showing results
  - Analysis got stuck at 40% "Extracting text from PDF..." with no timeout
  - No progress feedback during long extractions (Document AI + AI provider can take 60+ seconds)
- **Root Causes**:
  - `UploadWidget.tsx` navigated to `/try` but didn't pass the file to `TryAnalysis.tsx`
  - No timeout mechanism for extraction promises
  - No progress updates during the extraction process
- **Solutions**:
  1. **File Handoff via Router State**:
     ```tsx
     // UploadWidget.tsx - Pass file via state
     navigate('/try', { state: { file: valid[0] } })

     // TryAnalysis.tsx - Receive file from state
     const location = useLocation()
     const state = location.state as LocationState | null
     if (state?.file) {
       processFileFromState(state.file)
     }
     ```
  2. **90-Second Timeout with Promise.race**:
     ```tsx
     const EXTRACTION_TIMEOUT_MS = 90000
     const timeoutPromise = new Promise<never>((_, reject) => {
       setTimeout(() => reject(new Error('Analysis timed out...')), EXTRACTION_TIMEOUT_MS)
     })
     const result = await Promise.race([extractionPromise, timeoutPromise])
     ```
  3. **Progress Updates Every 10 Seconds**:
     ```tsx
     progressInterval = setInterval(() => {
       setProgress((prev) => prev < 85 ? prev + 5 : prev)
       setProgressMessage((prev) => {
         const messages = ['Extracting text...', 'Analyzing structure...', 'Processing with AI...', 'Almost there...']
         const currentIndex = messages.indexOf(prev)
         return currentIndex < messages.length - 1 ? messages[currentIndex + 1] : prev
       })
     }, 10000)
     ```
- **Files Changed**:
  - `src/components/landing/UploadWidget.tsx` - Pass file via router state
  - `src/components/TryAnalysis.tsx` - Accept file from state, add timeout, progress updates
  - `src/components/TryAnalysis.test.tsx` - **NEW** 19 tests for timeout and file handling
  - `src/components/landing/UploadWidget.test.tsx` - **NEW** 13 tests for file handoff
- **Note**: Anthropic API billing issue previously caused fallback to OpenAI, adding latency. **Resolved as of Feb 17, 2026** — `/api/ai/diagnose` confirms `anthropic: { valid: true }`. The 90-second timeout accommodates Document AI OCR (~50s) + AI extraction.

### 34. Session-Based Free Trial for Anonymous Users (Added Jan 30, 2026)
- **Feature**: Anonymous users can now analyze one policy per session without signup
- **Implementation**:
  - `TryAnalysis.tsx` - New component for anonymous trial analysis
  - Session storage tracks trial usage (`insurai_trial_used`)
  - Full analysis results shown (not truncated)
  - Email capture modal after viewing results
  - Share link generation for analysis results
- **User Flow**:
  1. User uploads PDF on landing page (UploadWidget)
  2. File passed via router state to `/try` route
  3. TryAnalysis extracts and analyzes the policy
  4. Full results displayed with score, coverages, gaps
  5. Email capture prompt with "Continue without email" option
  6. Share link available for results
- **Files**:
  - `src/components/TryAnalysis.tsx` - Main trial analysis component
  - `src/components/landing/UploadWidget.tsx` - Updated for anonymous flow
  - `src/App.tsx` - Added `/try` route
- **Commits**: `051db44`, `a434068`, `71df32e`, `6d7923b`

### 35. Simulated Network Error Removed from UploadWidget (Fixed Jan 30, 2026)
- **Problem**: 5% of uploads randomly failed with "Network error" - development code left in production
- **Root Cause**: `UploadWidget.tsx` had `if (Math.random() < 0.05) reject(new Error('Network error'))`
- **Solution**: Removed simulated error, replaced with simple 500ms delay for UX
- **File Changed**: `src/components/landing/UploadWidget.tsx`
- **Commit**: `9887e8d`

### 36. Secure Email Unsubscribe Tokens (Added Jan 30, 2026)
- **Feature**: All marketing emails now include secure unsubscribe links with HMAC-SHA256 tokens
- **Implementation**:
  - `server/routes/email.ts` - Added `generateUnsubscribeToken()` and `verifyUnsubscribeToken()`
  - `server/services/email-service.ts` - Updated `wrapTemplate()` to include unsubscribe links
  - Token is HMAC-SHA256 of email + secret, truncated to 32 chars
  - Timing-safe comparison prevents timing attacks
- **Endpoints**:
  - `POST /api/email/unsubscribe` - Requires valid token
  - `GET /api/email/unsubscribe-token` - Admin endpoint for testing
- **Environment Variable**: `UNSUBSCRIBE_SECRET` (falls back to `ADMIN_JWT_SECRET`)
- **Commits**: `60bd2ba`

### 37. ESLint Warnings Reduced to 45 (Jan 30, 2026)
- **Status**: All 45 remaining warnings are `@typescript-eslint/no-non-null-assertion`
- **Fixed This Session**:
  - Unescaped entities in `TryAnalysis.tsx` (2 occurrences)
  - Unescaped entity in `Hero.tsx` (1 occurrence)
  - `ZodError.errors` → `ZodError.issues` in email routes
- **Remaining Warnings by File**:
  - `services/workflow/.../ocr-pipeline.ts` (18)
  - `src/lib/admin/operations-logger.ts` (10)
  - `services/validate-svc/src/index.ts` (6)
  - Others (11 across 10 files)
- **Note**: These non-null assertions are intentional in guarded code paths
- **Commits**: `858b0cd`, `60bd2ba`

### 38. Migration Files Renamed with Sequential Suffixes (Jan 30, 2026)
- **Problem**: Multiple migration files had same number prefix causing conflicts
- **Solution**: Renamed to use a, b, c suffixes for ordering:
  - `005_admin_schema.sql` → `005a_admin_schema.sql`
  - `005_admin_tables.sql` → `005b_admin_tables.sql`
  - `007_document_processing_logs.sql` → `007a_document_processing_logs.sql`
  - `007_extraction_pipeline.sql` → `007b_extraction_pipeline.sql`
  - `007_email_system.sql` → `007c_email_system.sql`
  - `008_admin_notifications.sql` → `008a_admin_notifications.sql`
  - `008_seed_kasko_benchmark.sql` → `008b_seed_kasko_benchmark.sql`
- **Commit**: `6b72aed`

### 39. Debug Flags Disabled in OCR Decision Engine (Jan 30, 2026)
- **Files Changed**:
  - `src/lib/ocr-decision/language-detector.ts`: `DEBUG_LANGUAGE_DETECTION = false`
  - `src/lib/ocr-decision/policy-classifier.ts`: `DEBUG_POLICY_CLASSIFICATION = false`
  - `src/lib/ocr-decision/ocr-decision-engine.ts`: `DEBUG_CONFIDENCE_CALCULATION = false`
- **Commit**: `6b72aed`

### 40. Google Vision OCR Service Error (Fixed Feb 7, 2026)
- **Status**: Fixed
- **Symptom**: `/api/ai/diagnose` returns `"google": {"valid": false, "error": "Service error"}`
- **Root Causes** (two issues):
  1. **Code**: Diagnostic endpoint sanitized all errors to "Service error" with no error codes, no server logging. Vision OCR auth attempted OAuth even when no service account existed.
  2. **Config**: Google Cloud API key was restricted to "Generative Language API" only — Cloud Vision API and Cloud Document AI API not enabled.
- **Code Fixes**:
  - Added `classifyDiagnosticError()` returning actionable codes: `API_NOT_ENABLED`, `BILLING_ERROR`, `INVALID_CREDENTIALS`, `QUOTA_EXCEEDED`, `NETWORK_ERROR`, `PERMISSION_DENIED`, `SERVICE_ERROR`
  - Added `errorCode` field to `ProviderDiagnostic` interface
  - Added `log.warn()` for all provider diagnostic failures (visible in Railway)
  - Skip unnecessary OAuth call when no service account exists
  - Fixed `/api/ai/providers` to report `google: true` when OAuth credentials available
  - Added AI provider config checks to admin diagnostics endpoint
- **Config Fix**: Added Cloud Vision API and Cloud Document AI API to the API key restrictions in Google Cloud Console
- **Verification**: All 3 providers now report `valid: true` on `/api/ai/diagnose`
- **Files Changed**: `server/routes/ai.ts`, `server/routes/admin/auth.ts`, `src/hooks/useBackendHealth.ts`
- **Commits**: `1cbe80e`, `a81dcba`

### 41. ANTHROPIC_SCHEMA_PROMPT for Reliable Claude JSON Extraction (Added Feb 4, 2026)
- **Problem**: Claude doesn't support OpenAI's `response_format: { type: 'json_object' }` parameter
- **Root Cause**: Anthropic API has no equivalent structured output mode
- **Solution**: Added `ANTHROPIC_SCHEMA_PROMPT` constant in `server/routes/ai.ts` that includes full JSON schema in prompt text
- **Implementation**:
  ```typescript
  const ANTHROPIC_SCHEMA_PROMPT = `
  You are an expert insurance policy analyzer. Extract all policy information and return it as valid JSON.

  ## CRITICAL: Output Format
  You MUST respond with ONLY valid JSON matching this exact schema. Do not include any text before or after the JSON.

  {
    "policyNumber": string | null,
    "provider": string | null,
    "policyType": "kasko" | "traffic" | "home" | "health" | "life" | "dask" | "business" | "nakliyat" | null,
    // ... full schema
    "confidence": { "overall": number, ... }
  }

  ## Important Notes:
  - Dates must be in YYYY-MM-DD format
  - Confidence scores must be between 0 and 1
  - For Turkish policies, include both English (name) and Turkish (nameTr) coverage names

  Now analyze the following policy document:
  `
  ```
- **Endpoints Updated**: `/api/ai/extract/anthropic`, `/api/ai/extract` (unified endpoint)
- **File Changed**: `server/routes/ai.ts`

### 42. proxy-utils.ts for Bundle Optimization (Added Feb 4, 2026)
- **Problem**: Components that only needed proxy URL/status checks were importing the full AI SDK (~400KB)
- **Root Cause**: `isAIConfigured()` and `getProxyUrl()` lived in `config.ts` which imports OpenAI and Anthropic SDKs
- **Solution**: Created `src/lib/ai/proxy-utils.ts` with lightweight versions of these utilities
- **New File** (`src/lib/ai/proxy-utils.ts`):
  ```typescript
  export type AIProvider = 'openai' | 'anthropic'
  export function isProxyConfigured(): boolean { return env.hasProxy }
  export function getProxyUrl(): string | null { return env.proxyUrl }
  export function isAIConfigured(): boolean { /* checks proxy or localStorage keys */ }
  export function isOCRConfigured(): boolean { return isProxyConfigured() }
  export async function checkProxyProviders(): Promise<{openai: boolean; anthropic: boolean; google: boolean}>
  ```
- **Updated Exports** (`src/lib/ai/index.ts`):
  ```typescript
  // Lightweight utilities from proxy-utils (no SDK imports)
  export { isAIConfigured, isOCRConfigured, isProxyConfigured, getProxyUrl, checkProxyProviders, type AIProvider } from './proxy-utils'
  // Heavy utilities that need SDK imports
  export { isProviderConfigured, getConfiguredProviders, AI_CONFIG } from './config'
  ```
- **Files Changed**:
  - `src/lib/ai/proxy-utils.ts` - **NEW** (89 lines)
  - `src/lib/ai/index.ts` - Split exports
  - `src/hooks/useBackendHealth.ts` - Import from proxy-utils

### 43. Dynamic SDK Imports in config.ts (Added Feb 4, 2026)
- **Problem**: AI SDKs were imported at module load time, increasing initial bundle size
- **Solution**: Changed to dynamic imports with caching for lazy loading
- **Implementation**:
  ```typescript
  // Lazy-loaded SDK instances (only imported when needed)
  let cachedOpenAI: InstanceType<typeof import('openai').default> | null = null
  let cachedAnthropic: InstanceType<typeof import('@anthropic-ai/sdk').default> | null = null

  export async function getOpenAIClient(): Promise<...> {
    if (cachedOpenAI) return cachedOpenAI
    // Dynamic import to avoid bundling when not needed
    const { default: OpenAI } = await import('openai')
    cachedOpenAI = new OpenAI({ apiKey, dangerouslyAllowBrowser: true })
    return cachedOpenAI
  }

  export async function getAnthropicClient(): Promise<...> {
    // Similar pattern with dynamic import
  }
  ```
- **Benefits**:
  - SDKs only loaded when AI extraction actually needed
  - Reduced initial bundle size
  - Cached instances prevent repeated imports
- **File Changed**: `src/lib/ai/config.ts`

### 44. GA4 Analytics with KVKK Consent Management (Added Feb 4, 2026)
- **Feature**: Google Analytics 4 integration with Turkish KVKK/GDPR consent compliance
- **Implementation** (`src/lib/analytics.ts`):
  ```typescript
  declare global {
    interface Window {
      gtag?: (...args: unknown[]) => void
      dataLayer?: unknown[]
    }
  }

  interface AnalyticsConfig {
    enabled: boolean
    debug: boolean
    gaMeasurementId: string | null
    consentGiven: boolean
  }

  function initGA4(): void {
    if (!config.gaMeasurementId || typeof window === 'undefined') return
    if (window.gtag) return // Already initialized
    // Load gtag.js script and initialize
  }

  export function setAnalyticsConsent(consent: boolean): void {
    config.consentGiven = consent
    if (consent) initGA4()
  }

  export function hasGivenAnalyticsConsent(): boolean { return config.consentGiven }
  ```
- **Consent Flow**:
  1. User sees consent banner on first visit
  2. User accepts/rejects analytics
  3. If accepted, GA4 script loads and tracking begins
  4. Consent stored in localStorage for persistence
- **Environment Variable**: `VITE_GA_MEASUREMENT_ID` (optional)
- **File Changed**: `src/lib/analytics.ts`

### 45. i18n Translation Extensions for Policy UI (Added Feb 4, 2026)
- **Feature**: Added comprehensive translation sections for policy analysis UI
- **New Sections** in `TranslationDictionary`:
  ```typescript
  insights: { title: string; aiInsights: string; showMore: string; showLess: string; noInsights: string }
  evaluation: { title: string; overallScore: string; grade: string; premium: string; coverage: string; ... }
  comparison: { title: string; compareWith: string; differences: string; noPolicies: string; ... }
  insurance: { kasko: string; traffic: string; home: string; health: string; life: string; dask: string; ... }
  coverageCategories: { main: string; liability: string; supplementary: string; assistance: string; legal: string; other: string }
  ```
- **Languages**: Both Turkish (tr) and English (en) translations provided
- **File Changed**: `src/lib/i18n/translations.ts`

### 46. DecisionContextViewer Enabled in Document Journey (Added Feb 4, 2026)
- **Feature**: Admin Document Journey viewer now shows detailed decision context for skipped pipeline stages
- **Problem**: DecisionContextViewer component was implemented but commented out
- **Solution**: Enabled the component and added `formatValue()` helper for proper value display
- **Implementation**:
  ```typescript
  function formatValue(value: unknown): string {
    if (value === null || value === undefined) return 'N/A'
    if (typeof value === 'string') return value
    if (typeof value === 'number') return String(value)
    if (typeof value === 'boolean') return value ? 'Yes' : 'No'
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }
  ```
- **Information Displayed**:
  - Assessment performed (what was checked)
  - Decision threshold (e.g., `chars_per_page < 200`)
  - Actual measured values (formatted table)
  - Decision logic explanation
  - What would trigger the stage
- **File Changed**: `src/components/admin/DocumentJourneyViewer.tsx`

### 47. English Translations for Kasko Knowledge Base (Added Feb 4, 2026)
- **Feature**: Added `questionEn` and `detailsEn` fields to Turkish kasko knowledge patterns
- **Purpose**: Support bilingual UI and future English-language policy analysis
- **File Changed**: `src/lib/knowledge/kasko-knowledge.ts`
- **Pattern**:
  ```typescript
  {
    id: 'deprem_teminati',
    question: 'Deprem hasarları teminat kapsamında mı?',
    questionEn: 'Is earthquake damage covered?',
    details: '...',
    detailsEn: '...',
    category: 'coverage'
  }
  ```

### 48. Railway Build Configuration Update (Added Feb 4, 2026)
- **Change**: Added explicit `installCommand` to Railway configuration
- **Purpose**: Ensure consistent dependency installation on Railway deployments
- **File Changed**: `railway.json`
  ```json
  {
    "build": {
      "builder": "NIXPACKS",
      "installCommand": "npm ci",
      "buildCommand": "npm run build && npm run build:server"
    }
  }
  ```
- **Note**: `npm ci` ensures clean install from package-lock.json

### 49. Service Worker Cache Version v12 (Updated Feb 4, 2026)
- **Change**: Bumped service worker cache version from v11 to v12
- **Purpose**: Force cache invalidation after new deployment with bundle changes
- **File Changed**: `public/sw.js`
- **Note**: Users may need hard refresh (Ctrl+Shift+R) or clear site data if seeing stale content

### 50. Bundle Analysis Output Ignored (Added Feb 4, 2026)
- **Change**: Added `stats.html` to `.gitignore`
- **Purpose**: Prevent bundle analysis report from being committed
- **File Changed**: `.gitignore`
- **Usage**: Run `npm run build:analyze` to generate stats.html for bundle inspection

### 51. Bundle Chunking Optimization Attempt (Feb 4, 2026)
- **Problem**: `useBackendHealth` chunk was 676KB due to AI SDK imports
- **Initial Attempt**: Aggressive manual chunking with separate vendor chunks for React, Supabase, OpenAI, Anthropic, etc.
- **Result**: Reduced chunk sizes but caused circular dependency issues
- **Error**: `Cannot access 'na' before initialization` in `vendor-common` chunk
- **Root Cause**: Separating modules that have initialization order dependencies
- **Learning**: Aggressive `manualChunks` can break module initialization order in Rollup/Vite
- **Commits**: `b5f525a` (optimization), `05627d4` (fix)

### 52. Circular Dependency Fix in Bundle Chunking (Fixed Feb 4, 2026)
- **Problem**: Page wouldn't load after deployment - JavaScript initialization error
- **Error**: `Uncaught ReferenceError: Cannot access 'na' before initialization` at `vendor-common-H-RuQgAK.js`
- **Root Cause**: Aggressive `manualChunks` in `vite.config.ts` created circular dependencies
- **Solution**: Simplified chunking to only split truly independent large libraries (pdfjs, pdf-lib)
- **File Changed**: `vite.config.ts`
- **Before**:
  ```typescript
  manualChunks(id) {
    if (id.includes('react')) return 'vendor-react'
    if (id.includes('@supabase')) return 'vendor-supabase'
    if (id.includes('openai')) return 'vendor-openai'
    if (id.includes('@anthropic-ai')) return 'vendor-anthropic'
    if (id.includes('node_modules')) return 'vendor-common'  // PROBLEMATIC
  }
  ```
- **After**:
  ```typescript
  manualChunks(id) {
    // Only split large, truly independent libraries
    if (id.includes('pdfjs-dist')) return 'vendor-pdfjs'
    if (id.includes('pdf-lib')) return 'vendor-pdflib'
    // Let Vite handle the rest to avoid initialization errors
  }
  ```
- **Key Insight**: The catch-all `vendor-common` chunk combined modules with hidden interdependencies
- **Commit**: `05627d4`

### 53. File Upload Flow Fix for Logged-In Users (Fixed Feb 4, 2026)
- **Problem**: When logged-in users clicked "Analyze Your Policy Free" on landing page, selected a file, they were redirected to `/upload` but the file was lost
- **Root Cause**: `TryAnalysis.tsx` detected logged-in user and redirected to `/upload` without passing the file
- **Solution**: Pass file via React Router state when redirecting
- **Files Changed**:
  - `src/components/TryAnalysis.tsx` - Pass file in redirect: `navigate('/upload', { state: { files: [file], autoProcess: true } })`
  - `src/components/PolicyUpload.tsx` - Handle files from location state
- **Pattern Used**:
  ```typescript
  // TryAnalysis.tsx - Pass file when redirecting logged-in user
  useEffect(() => {
    if (user) {
      const locationState = location.state as { file?: File } | null
      const fileFromState = locationState?.file
      if (fileFromState) {
        navigate('/upload', { state: { files: [fileFromState], autoProcess: true }, replace: true })
      } else {
        navigate('/upload', { replace: true })
      }
    }
  }, [user, navigate, location.state])

  // PolicyUpload.tsx - Receive and process file from state
  useEffect(() => {
    const state = location.state as { files?: File[]; autoProcess?: boolean } | null
    if (state?.files && state.files.length > 0 && !filesReceivedRef.current) {
      filesReceivedRef.current = true
      addFilesRef.current?.(state.files)
      navigate(location.pathname, { replace: true, state: null })
    }
  }, [location, navigate])
  ```
- **Commit**: `37ef119`

### 54. Comprehensive Configuration System (Added Feb 5, 2026)
- **Feature**: Three-tier configuration system making 843+ hardcoded values configurable
- **Architecture**:
  - **Tier 1**: System defaults in `src/lib/config/types.ts` (always available)
  - **Tier 2**: Admin settings in `app_settings` database table
  - **Tier 3**: User preferences in `user_preferences` table
- **Database Tables Created**:
  - `app_settings` - Key-value configuration with JSON schemas
  - `settings_audit_log` - Automatic audit trail for all changes
  - `user_preferences` - Per-user preference overrides
  - `market_benchmarks` - Versioned market benchmark data
  - `insurance_providers` - 15 Turkish insurance providers
  - `regional_factors` - 7 Turkish regions with risk factors
  - `feature_flags` - Feature flag management
- **Key Files**:
  - `src/lib/config/configuration-service.ts` - Singleton with 5-minute cache
  - `src/lib/config/types.ts` - TypeScript types and default values
  - `server/routes/settings.ts` - Admin API endpoints
  - `supabase/migrations/012_configuration_system.sql` - Database schema
  - `supabase/migrations/013_seed_configuration_defaults.sql` - Seeds all hardcoded values
- **Usage**:
  ```typescript
  import { configService, getAIConfig, isFeatureEnabled } from '@/lib/config'

  // Get typed configuration
  const aiConfig = await configService.getAIConfig()
  console.log(aiConfig.temperature)  // 0.1

  // Check feature flags
  if (await isFeatureEnabled('new_evaluation_algorithm')) {
    // Use new algorithm
  }
  ```
- **Categories**: ai, evaluation, rate_limits, ocr, fuzzy_matching, gap_analysis, ui, email
- **Tests**: 46 unit tests for ConfigurationService

### 55. Railway Build: TypeScript Not Found (Fixed Feb 5, 2026)
- **Problem**: Railway build failed with `sh: 1: tsc: not found`
- **Root Cause**: `npm ci` in production mode doesn't install devDependencies, but TypeScript is required for the build step
- **Solution**: Changed `installCommand` in `railway.json` from `npm ci` to `npm ci --include=dev`
- **File Changed**: `railway.json`
- **Commit**: `d8687be`

### 56. Connect Admin Settings to Application Functionality (Added Feb 5, 2026)
- **Feature**: Database-stored admin settings now actively control application behavior
- **Components Connected**:
  1. **AI Settings** → Extraction endpoints (model selection, temperature, timeouts)
  2. **Evaluation Settings** → Policy scoring (weights, grade thresholds)
  3. **Rate Limits** → API middleware (requests per hour by endpoint)
  4. **OCR Settings** → OCR Decision Engine (thresholds, confidence weights)
- **OCR Decision Engine Integration**:
  - Added `updateFromDatabaseConfig()` method to ConfigurationManager
  - Added `isDatabaseConfigApplied()` and `resetToBaseSettings()` methods
  - Added `refreshSettings()` and `getConfigurationManager()` to OCRDecisionEngine
  - New exports: `initializeOCREngineWithConfig()`, `resetOCRDecisionEngine()`
- **Pattern** (deep copy with database overrides):
  ```typescript
  // ConfigurationManager stores base JSON settings
  private baseOcrSettings: OCRSettings  // Original from JSON
  private ocrSettings: OCRSettings      // Active settings (base + DB overrides)

  updateFromDatabaseConfig(dbConfig: OCRConfig): void {
    // Start with deep copy of base, apply DB overrides
    this.ocrSettings = this.applyDatabaseConfig(dbConfig)
    this.databaseConfigApplied = true
  }

  resetToBaseSettings(): void {
    this.ocrSettings = this.baseOcrSettings
    this.databaseConfigApplied = false
  }
  ```
- **Feature Flag**: `use_db_config` enabled by default (100% rollout)
- **Files Changed**:
  - `src/lib/ocr-decision/configuration-manager.ts` - DB config integration
  - `src/lib/ocr-decision/ocr-decision-engine.ts` - Refresh and getter methods
  - `src/lib/ocr-decision/index.ts` - New exports
  - `src/lib/admin/config-manager.ts` - Feature flag default
  - `supabase/migrations/013_seed_configuration_defaults.sql` - Enable flag
- **New Tests** (49 tests):
  - `configuration-manager-db.test.ts` - 17 tests for DB config merging
  - `ocr-engine-db-init.test.ts` - 13 tests for engine initialization
  - `configurable-thresholds.test.ts` - 19 tests for grade/status thresholds
- **Commits**: `e7acaf7`, `0cc16f4`

### 57. Admin Settings UI with Validation and History (Added Feb 5, 2026)
- **Feature**: Complete Admin Dashboard Settings UI with client-side validation and audit history
- **Components Created**:
  - `SettingsTab.tsx` - Main tab container with category navigation (AI, Evaluation, Rate Limits, OCR, Feature Flags, History)
  - `AISettingsPanel.tsx` - Configure AI models, temperatures, timeouts
  - `EvaluationSettingsPanel.tsx` - Configure policy evaluation weights and grade thresholds
  - `RateLimitsPanel.tsx` - Configure API rate limits per endpoint
  - `OCRSettingsPanel.tsx` - Configure OCR decision engine thresholds and weights
  - `FeatureFlagsPanel.tsx` - Manage feature flags with rollout percentages
  - `SettingsHistoryPanel.tsx` - View audit log with search, category filter, pagination
- **Validation System** (`src/lib/admin/settings-validation.ts`):
  - Validators: `numberRange`, `percentage`, `ratio`, `positiveInteger`, `required`, `oneOf`, `milliseconds`
  - Composite validators: `validateWeightsSum`, `validateGradeThresholds`, `validateOCRConfidenceOrder`
  - Helper functions: `getValidationClass`, `shouldDisableSave`, `getValidationDescription`
- **Settings History API** (`server/routes/settings.ts`):
  - `GET /api/admin/settings/history` - Paginated audit log with category filter
  - Resolves admin user emails for `changed_by` UUIDs
  - Returns transformed entries with camelCase properties
- **New Tests** (108 tests):
  - `settings-validation.test.ts` - 62 tests for validators and composite validators
  - `SettingsHistoryPanel.test.tsx` - 27 tests for component states and interactions
  - `settings-routes.test.ts` - 19 tests for API data transformation and pagination
- **Files Changed**:
  - `src/components/admin/tabs/SettingsTab.tsx` - Added History tab to navigation
  - `server/routes/settings.ts` - Added `/history` endpoint
  - `server/middleware/rate-limit.ts` - Fixed unused variable lint error
- **Commits**: `ae66160`, `b2a5c0a`, `a9547f0`, `dee49a9`

### 58. Fix Pre-Existing Test Failures (Fixed Feb 6, 2026)
- **Problem**: 8 test files had 9 pre-existing failures across component and settings tests
- **Root Causes**: Missing AuthProvider wrappers, incorrect mock patterns, stale assertions
- **Solution**: Fixed all 9 failures across 8 test files
- **Result**: Full test suite now passes: 192 files, 6338 tests, 0 failures
- **Commit**: `d4292cb`

### 59. Settings Export/Import for Admin Configuration (Added Feb 6, 2026)
- **Feature**: Admin dashboard can now export all settings as JSON and import them for backup/restore
- **Export** (`GET /api/admin/settings/export`):
  - Exports all categories of settings as structured JSON
  - Includes metadata: `exportedAt`, `version`, `settingsCount`
  - Downloads as `insurai-settings-YYYY-MM-DDTHH-MM-SS.json`
- **Import** (`POST /api/admin/settings/import`):
  - Validates JSON structure and setting values before applying
  - Preview mode: shows changes that would be made before committing
  - Dry-run validation: `?dryRun=true` returns preview without applying
  - Reports skipped/failed/applied counts
- **Admin UI** (integrated in `SettingsTab.tsx`):
  - Export button in settings header
  - Import dialog with file selection and preview
  - Shows settings count, categories, and per-setting changes before applying
  - Success/error feedback with detailed results
- **New Tests**:
  - `SettingsExportImport.test.tsx` - 15 UI tests
  - `settings-routes.test.ts` - 18 new API tests (export validation, import dry-run, etc.)
- **Commit**: `303316a`

### 60. Config Fetch Performance Monitoring with TTL Recommendations (Added Feb 6, 2026)
- **Feature**: Tracks ConfigurationService fetch latency to validate the 5-minute cache TTL
- **Client-Side Monitor** (`src/lib/config/config-performance-monitor.ts`):
  - Rolling window: 1000 events, 1 hour max retention
  - Tracks: category, method, latencyMs, cacheHit, success, errorMessage
  - Computes: latency percentiles (p50, p95, p99), cache hit rates, per-category breakdown
  - TTL recommendation engine:
    - Suggests lower TTL if hit rate >90% and DB latency <50ms
    - Suggests higher TTL if hit rate <50% or DB latency >200ms
    - Reports confidence level (high/medium/low) based on sample size
- **ConfigurationService Instrumentation** (`configuration-service.ts`):
  - `get()`, `getCategory()`, `isFeatureEnabled()` methods now record timing with `performance.now()`
  - Tracks cache hits, misses, errors, and latency to performance monitor
  - Added `getPerformanceSnapshot()` public method
- **Server-Side** (`server/routes/settings.ts`):
  - In-memory server-side performance monitor (parallel to client)
  - `GET /api/admin/settings/performance` - Returns server metrics snapshot
  - `POST /api/admin/settings/performance` - Accepts client-side metrics for logging
- **Admin UI Panel** (`ConfigPerformancePanel.tsx`):
  - Client/Server source toggle with auto-refresh (5s interval)
  - Summary cards: Total Fetches, Cache Hit Rate, DB Avg Latency, Error Rate
  - DB Fetch Latency Distribution: Min/Avg/P50/P95/P99/Max with color-coded thresholds
  - Per-Category Breakdown table with fetch count, avg latency, hit rate, errors
  - Cache TTL Recommendation section with confidence level
  - Recent Events log (last 20 events in reverse chronological)
- **SettingsTab Updated**: Added Performance tab (Activity icon) to category navigation
- **New Tests** (39 total):
  - `config-performance-monitor.test.ts` - 21 unit tests
  - `settings-routes.test.ts` - 7 new server tests
  - `ConfigPerformancePanel.test.tsx` - 11 UI tests
- **Key Pattern** (performance instrumentation):
  ```typescript
  async get<T>(category: string, key: string, defaultValue: T): Promise<T> {
    const start = performance.now()
    const cached = this.cache.get(cacheKey)
    if (cached) {
      configPerformanceMonitor.record({
        category, method: 'get', latencyMs: performance.now() - start,
        cacheHit: true, success: true
      })
      return cached
    }
    // ... fetch from DB, record miss
  }
  ```
- **Commit**: `9093818`

### 61. Admin Routes Modularization (Refactored Feb 7, 2026)
- **Problem**: `server/routes/admin.ts` was 3,390 lines — difficult to navigate, review, and maintain
- **Solution**: Split into 9 focused modules under `server/routes/admin/`
- **Modules Created**:
  - `auth.ts` - Login, session management, diagnostics (410 lines)
  - `users.ts` - User management (164 lines)
  - `prompts.ts` - Prompt template CRUD (701 lines)
  - `operations.ts` - Audit logs, security events (780 lines)
  - `monitoring.ts` - Health, metrics, notifications (321 lines)
  - `content.ts` - Content management (678 lines)
  - `cost.ts` - Cost tracking (352 lines)
  - `shared.ts` - Shared utilities, Supabase client (141 lines)
  - `index.ts` - Router aggregator (31 lines)
- **Migration**: No API changes — all endpoints preserved, just reorganized internally
- **Commit**: `038d2cd`

### 62. Structured Server Logging (Added Feb 7, 2026)
- **Feature**: Centralized logging module with configurable levels for server-side code
- **File**: `server/lib/logger.ts` (95 lines)
- **Levels**: `debug` (dev), `info` (production default), `warn`, `error`
- **Production level**: Changed from `warn` to `info` to make extraction timing and AI provider diagnostics visible in Railway logs
- **Override**: Set `LOG_LEVEL=warn` env var to suppress info if needed
- **Commit**: `c7f3d4a`

### 63. Security Hardening - HSTS and Crypto (Added Feb 7, 2026)
- **HSTS**: Added `Strict-Transport-Security` header via Helmet in production
  - `maxAge: 31536000` (1 year), `includeSubDomains: true`
  - File: `server/index.ts`
- **Crypto**: Replaced `Math.random()` with `crypto.getRandomValues()` for share link IDs
  - `Math.random()` is not cryptographically secure; share links should be unpredictable
  - File: `src/lib/free-trial.ts`
- **Commits**: `542333a`, `4819bc0`

### 64. User Preferences with Three-Tier Config Override (Added Feb 7, 2026)
- **Feature**: Users can override select admin settings with personal preferences
- **Three-tier resolution**: System defaults → Admin settings → User preferences
- **Components**:
  - `src/lib/config/user-overridable.ts` - Defines which settings are user-overridable
  - `src/hooks/useUserPreferences.ts` - React hook for reading/writing user preferences
  - `src/components/UserPreferencesPanel.tsx` - UI panel for preference management
- **Tests**: 201 (UserPreferencesPanel) + 251 (useUserPreferences) + 201 (user-overridable) = 653 new tests
- **Commit**: `cc4e584`

### 65. Config Drift Detection (Added Feb 7, 2026)
- **Feature**: Detects when runtime configuration differs from a saved baseline snapshot
- **Components**:
  - `server/services/drift-detection-service.ts` - Core drift detection logic with baseline snapshots
  - `server/routes/drift.ts` - API endpoints for drift management
  - `src/components/admin/tabs/settings/ConfigDriftPanel.tsx` - Admin UI for drift monitoring
  - `supabase/migrations/015_config_drift_baselines.sql` - Baseline storage table
- **Tests**: 212 (drift detection service) + 191 (ConfigDriftPanel)
- **Commit**: `765abaf`

### 66. Settings Webhooks (Added Feb 7, 2026)
- **Feature**: Notify external systems when admin settings change
- **Components**:
  - `server/services/webhook-service.ts` - Webhook delivery with retry logic (585 lines)
  - `server/routes/webhooks.ts` - Webhook CRUD and test endpoints
  - `src/components/admin/tabs/settings/SettingsWebhooksPanel.tsx` - Admin webhook management UI
  - `supabase/migrations/014_settings_webhooks.sql` - Webhook configuration tables
- **Tests**: 51 (webhook service) + 284 (SettingsWebhooksPanel)
- **Commit**: `5f11bed`

### 67. Settings Templates (Added Feb 7, 2026)
- **Feature**: Predefined configuration profiles (e.g., "High Performance", "Cost Optimized")
- **Components**:
  - `src/lib/admin/settings-templates.ts` - Template definitions and management
  - `src/components/admin/tabs/settings/SettingsTemplatesPanel.tsx` - Template browser and apply UI
- **Tests**: 206 (settings-templates) + 301 (SettingsTemplatesPanel)
- **Commit**: `516fab9`

### 68. Batch Settings Update and Visual Diff (Added Feb 7, 2026)
- **Batch Update**: Update multiple settings in a single API call
  - Endpoint: `PUT /api/admin/settings/batch`
  - Validates all settings before applying any (atomic operation)
- **Visual Diff**: Side-by-side comparison of old vs new values in settings history
  - Component: `src/components/admin/tabs/settings/SettingsDiffViewer.tsx`
- **Tests**: 410 (SettingsDiffViewer)
- **Commits**: `71096d9`, `8f5fd4d`

### 69. Performance Monitoring Alerts (Added Feb 7, 2026)
- **Feature**: Auto-alert when config performance metrics exceed thresholds
- **Triggers**: Cache hit rate drops below threshold, DB latency exceeds threshold, error rate spikes
- **Commit**: `bec8ac1`

### 70. Document AI Server-Side Timeout (Added Feb 7, 2026)
- **Problem**: Document AI OCR requests could hang indefinitely, blocking the extraction pipeline
- **Solution**: Added 60-second `AbortSignal.timeout()` on server-side Document AI fetch, increased client-side timeout to 120 seconds
- **File**: `server/routes/ai.ts`
- **Commit**: `ed7ac1d`

### 71. Extraction Fallback Returning Mock Data in Production (Fixed Feb 7, 2026)
- **Problem**: "Try Policy Analysis" page showed mock/sample policy data instead of real AI results
- **Root Cause**: `extractPolicyFromDocument()` called with default `useFallback: true`, so when any extraction error occurred, `createFallbackResult()` returned `success: true` with random sample data from `samplePolicies[]` — completely masking real errors
- **Solution (4 commits)**:
  1. Disabled fallback in TryAnalysis: both extraction paths now pass `{ useFallback: false }`
  2. Added fallback source detection: reject results with `source === 'fallback'`
  3. Added diagnostic `console.error` at all 5 `createFallbackResult` call sites
  4. Fixed invisible server logs (production log level `warn` → `info`)
  5. Fixed sanitized error messages (server was returning "Unable to process document" in production)
  6. Fixed `extractViaProxy` to propagate server `details` field to client
  7. Bumped SW cache to v13 to clear stale ErrorBoundary crash
  8. Made ErrorBoundary show error details in production (was gated behind `import.meta.env.DEV`)
- **Key Insight**: The fallback mechanism is useful for development/demos but must be disabled in production extraction paths where users expect real AI results
- **Files Changed**:
  - `src/components/TryAnalysis.tsx` - `{ useFallback: false }`, fallback source detection
  - `src/lib/ai/policy-extractor.ts` - Diagnostic logging at all fallback sites, error details in messages
  - `src/lib/ai/config.ts` - `extractViaProxy` propagates server error `details`
  - `server/routes/ai.ts` - Always include error details in responses, timing instrumentation
  - `server/lib/logger.ts` - Production log level `warn` → `info`
  - `public/sw.js` - CACHE_VERSION v12 → v13
  - `src/components/ErrorBoundary.tsx` - Show error details in production
- **Commits**: `0e62fe1`, `37cac0c`, `1954792`, `dfbc443`

### 72. Dependency Upgrade Plan (Added Feb 7, 2026)
- **Feature**: Documented 5-stage risk-tiered dependency upgrade plan
- **File**: `docs/DEPENDENCY_UPGRADE_PLAN.md` (171 lines)
- **Stages**: Stage 1 (safe patches) → Stage 2 (low-risk minor) → Stage 3 (moderate breaking) → Stage 4 (high-risk major) → Stage 5 (framework major)
- **Commit**: `b77db22`

### 73. Production Hardening: JSON Parse, Startup Validation, Rate Limits, Logging (Added Feb 7, 2026)
- **Problem**: Four production resilience gaps identified during comprehensive audit:
  1. Unguarded `JSON.parse()` in extract endpoints — Anthropic/OpenAI invalid JSON crashes server
  2. No startup environment variable validation — missing config discovered only at request time
  3. Processing log endpoints (`/api/ai/processing-logs/*`) had no rate limiting
  4. 20+ `console.log` calls in server code instead of structured logger
- **Solutions**:
  1. Wrapped `JSON.parse` in try-catch with structured error logging and descriptive error messages
  2. Added startup env var check in `server/index.ts` — warns on missing `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `ADMIN_JWT_SECRET`
  3. Added `generalLimiter` (60 req/min) to all 4 processing log endpoints
  4. Replaced 20+ `console.log`/`console.error` with `log.info()`/`log.warn()`/`log.error()` across 4 files
- **Files Changed**:
  - `server/routes/ai.ts` — JSON parse guards, rate limiting
  - `server/index.ts` — Startup env var validation
  - `server/routes/admin/auth.ts` — Structured logging (20 replacements)
  - `server/services/prompt-service.ts` — Structured logging
  - `server/services/processing-log-service.ts` — Structured logging
  - `server/middleware/rate-limit.ts` — Structured logging
- **Commit**: `1696480`

### 74. Silent .catch(() => {}) Error Swallowing (Fixed Feb 7, 2026)
- **Problem**: 10 fire-and-forget `.catch(() => {})` patterns across server code silently swallowed errors on cost tracking, admin notifications, security event logging, and alert persistence
- **Impact**: Failures in these non-critical paths were completely invisible in Railway logs, making debugging impossible
- **Solution**: Replaced all 10 with `.catch((err) => log.warn('description', { context, error: err instanceof Error ? err.message : String(err) }))` so failures appear in logs
- **Occurrences Fixed**:
  - `server/routes/ai.ts` (6): Cost recording (Anthropic + OpenAI) + admin notifications (billing, rate limit, auth errors)
  - `server/routes/admin/auth.ts` (3): Security event logging for failed login attempts (user not found, inactive account, wrong password)
  - `server/middleware/monitoring.ts` (1): Alert persistence + added logger import
- **Pattern**:
  ```typescript
  // BEFORE: Silently swallowed
  recordUsage({ ... }).catch(() => {})

  // AFTER: Logged with context
  recordUsage({ ... }).catch((err) => log.warn('Failed to record usage', {
    requestId, error: err instanceof Error ? err.message : String(err)
  }))
  ```
- **Commit**: `6e5263f`

### 75. Dead Code Cleanup — ~17,800 Lines Removed (Feb 8, 2026)
- **Problem**: Coverage audit revealed significant dead code: 5 unused hooks, 3 orphaned library modules, 3 dead type files, 1 dead utility module, and 8 dead exports in active files
- **Dead Hooks Removed**: `useAnalytics` (→ `src/lib/analytics.ts`), `usePrivacy` (→ `src/lib/privacy/`), `useMarketData` (→ `src/data/market-data/`), `useIndustryRisk` (→ `src/lib/regional-benchmark/`), `usePolicyTemplates` (→ `server/services/prompt-service.ts`)
- **Dead Libraries Removed**: `src/lib/data-repository/` (7 files), `src/lib/industry-risk/` (5 files), `src/lib/policy-templates/` (7 files)
- **Dead Types Removed**: `src/types/data-repository.ts`, `src/types/industry-risk.ts`, `src/types/policy-template.ts`
- **Dead Utility Removed**: `src/lib/preflight-check.ts`
- **Dead Exports Removed from Active Files**:
  - `src/lib/free-trial.ts`: `getShareUrl()`
  - `src/lib/policy-utils.ts`: `getSimilarityLabelTr()`, `getSignificanceLabel()`, `getSignificanceLabelTr()`
  - `src/lib/policy-upload-check.ts`: `ConflictSummary`, `getConflictSummary()`
  - `src/lib/insurance-display.ts`: `getCoverageLabel()`
- **Verification**: All exports confirmed 0 production imports via `grep -r` (excluding test files)
- **Impact**: Tests reduced from 6,338 (192 files) → 5,801 (181 files) — no production functionality lost
- **Commit**: `de83f8d`

### 76. Production Hardening Phase 3 (Feb 8, 2026)
- **Feature**: Medium/low priority hardening and comprehensive test coverage additions
- **Changes**:
  - PDF magic byte validation (`%PDF-` header check) in `server/routes/pdf.ts`
  - Hidden source maps for Sentry error tracking in `vite.config.ts`
  - Fix 4 silent `.catch(() => {})` in IndexedDB cache with debug-mode logging
  - Railway CLI rollback in GitHub Actions production workflow
  - Service worker background sync with IndexedDB pending queue
  - npm audit overrides for transitive vulnerabilities in `@lhci/cli`
  - Node.js version updated to 22 in CI workflows (matches `.nvmrc`)
- **New Tests**: 111 tests across 5 files (admin-auth, pdf-splitter, document-ocr, pdf-routes, admin-flows E2E)
- **Commit**: `acfa3ad`

### 77. Missing requestId in Anthropic Extraction Endpoint (Fixed Feb 8, 2026)
- **Problem**: Railway build failed with `TS2552: Cannot find name 'requestId'` at `server/routes/ai.ts:603`
- **Root Cause**: Standalone `/api/ai/extract/anthropic` endpoint referenced `requestId` in `log.error()` but never defined it (the OpenAI and unified endpoints both had it)
- **Fix**: Added `const requestId = 'ext-ant-${Date.now()}'` at the top of the handler
- **Commit**: `41782f7`

### 78. Flaky duration_ms Assertion in OCR Regression Test (Fixed Feb 8, 2026)
- **Problem**: `ocr-decision-engine.regression.test.ts` intermittently failed on `expect(decision.duration_ms).toBeGreaterThan(0)`
- **Root Cause**: `performance.now()` granularity varies by environment — operation can complete in 0ms
- **Fix**: Changed to `toBeGreaterThanOrEqual(0)`
- **Commit**: `de83f8d`

### 79. Comprehensive Audit Hardening (Feb 8, 2026)
- **Scope**: App-wide audit identified 5 issue categories; all resolved
- **JSON.parse Crash Prevention** (3 files):
  - `server/lib/sentry.ts` — Wrapped `JSON.parse(event.request.data)` in try-catch
  - `server/services/webhook-service.ts` — Eliminated re-parse by threading `webhookEvent` parameter through `attemptDelivery()`
  - `server/services/admin-db.ts` — Wrapped `JSON.parse(row.value)` in `mapConfig()` with fallback logging
- **Structured Logging** (5 files, 21 calls replaced):
  - `server/middleware/cost-control.ts` — Added logger import + child
  - `server/middleware/validation.ts` — Added logger import + child, changed to `log.debug`
  - `server/routes/pdf.ts` — Added logger import + child
  - `server/services/processing-log-service.ts` — 8 `console.error` → `log.error`
  - `server/services/prompt-service.ts` — 13 `console.warn/error` → `log.warn/error`
- **Admin Route Logging** (9 modules, 69 calls replaced):
  - All 9 admin route modules under `server/routes/admin/` — `console.error` → structured logger
  - Commit: `1d2ca31`
- **Rate Limiting** (3 endpoints):
  - `POST /api/email/capture` → `authLimiter` (10 req/15min)
  - `POST /api/email/unsubscribe` → `authLimiter` (10 req/15min)
  - `POST /api/pdf/extract` → `aiExtractionLimiter` (20 req/hr)
  - Note: All routes already had global `generalLimiter` (100/15min) via `server/index.ts`
- **Commit**: `ce16af0`

### 80. Critical Module Test Coverage (Added Feb 8, 2026)
- **Problem**: 4 critical server modules had 0 test coverage totaling 2,088 lines
- **Solution**: Added 275 comprehensive tests across 4 new test files
- **Test Files Created**:
  - `server/__tests__/admin-auth.test.ts` — 65 tests: JWT token gen/verify, bcrypt password hashing, `authenticateAdmin` middleware, `requireRole`, `requirePermission`, integration flows
  - `server/__tests__/email-routes.test.ts` — 71 tests: HMAC-SHA256 unsubscribe token gen/verify, all 7 email endpoints via supertest, secret fallback chain, capture-unsubscribe roundtrip
  - `server/__tests__/cost-control.test.ts` — 58 tests: Cost calculation for all providers, budget CRUD, budget checking with block/warn/notify, alert system, usage tracking aggregation, Express middleware
  - `src/lib/free-trial.test.ts` — 84 tests: All 15 exported functions, mocked localStorage, 24h expiry logic, share URLs, lifecycle integration
- **Key Testing Patterns Used**:
  - `vi.hoisted()` for mock variables referenced in `vi.mock()` factories (avoids TDZ errors)
  - `vi.resetModules()` + dynamic `import()` for testing module-level initialization (JWT secret, env vars)
  - In-memory state isolation: cost-control budgets persist across tests; deactivate blocking budgets in subsequent tests
  - `supertest` for Express route testing with mocked middleware
- **Commit**: `1f81423`

### 81. TryAnalysis Refactor (Feb 8, 2026)
- **Problem**: `TryAnalysis.tsx` had duplicated extraction logic between proxy and direct paths (156 lines)
- **Solution**: Extracted shared `runExtraction()` helper, consolidated both code paths
- **Result**: 154 net lines removed, single code path for extraction with timeout and progress
- **Commit**: `a06e850`

### 82. Tier 1 Dependency Upgrades (Feb 8, 2026)
- **Upgraded**: Safe patch/minor dependencies per `docs/DEPENDENCY_UPGRADE_PLAN.md` Stage 1
- **TypeScript 5.9 fixes**: Resolved new type errors from stricter checking
- **Commit**: `2c23c2b`

### 83. E2E Extraction Flow Tests (Added Feb 8, 2026)
- **File**: `e2e/extraction-flow.spec.ts` — 14 Playwright tests covering upload → extract → display pipeline
- **Commit**: `a2bcd52`

### 84. Vision OCR Server-Side Timeout (Added Feb 8, 2026)
- **Problem**: Vision OCR fetch had no timeout, could hang indefinitely
- **Solution**: Added 60s `AbortSignal.timeout()` on server-side fetch, timeout detection on both OCR routes
- **Commit**: `a91c833`

### 85. Market Data DB Migration (Added Feb 9, 2026)
- **Feature**: Core business logic (gap analyzers, evaluator, extractor, comparison) now uses `ConfigurationService` DB instead of static files
- **Previously**: Static files in `src/data/market-data/` were the only source — DB tables were seeded but not consumed
- **Now**: `MarketDataService` provides DB-first access with static file fallback
- **Files Changed**:
  - `src/lib/market-data/service.ts` — New `MarketDataService` with async DB-backed methods
  - `src/lib/ai/comparison.ts` — Switched from static imports to async `MarketDataService`
  - `src/lib/ai/multi-ai-analysis.ts` — Switched to async market data access
  - `src/lib/ai/policy-extractor.ts` — Updated to use async benchmarks
- **Commit**: `4e8711a`

### 86. User Profile Functional Tests (Added Feb 9, 2026)
- **Feature**: 21 new functional tests for `src/lib/supabase/user-profile.ts`
- **File**: `src/lib/supabase/user-profile.functional.test.ts`
- **Coverage**: Profile CRUD, preferences, avatar handling, validation
- **Commit**: `c901281`

### 87. Major Dependency Upgrades (Feb 9, 2026)
- **Express 4 → 5** (`379c2a0`): Universal wildcard `app.get('*')` → `app.get(/.*/)`, `req.query` returns `unknown`, async errors auto-forwarded
- **Vite 6 → 7** (`01a5e42`): With `@vitejs/plugin-react` 4 → 5
- **React 18 → 19** (`eb0d66f`): `useRef()` requires initial value — `useRef<T>()` → `useRef<T | undefined>(undefined)`
- **Vitest 2 → 4** (`23ef73d`): Arrow function mocks can't be constructors — must use `function()` syntax for `new`
- **lucide-react + tailwind-merge** (`e1eae25`): Minor version bumps
- **globals + jsdom** (`fcd9593`): Tooling updates
- **express-rate-limit 7 → 8** (`759a2f9`): Requires `validate: { keyGeneratorIpFallback: false }` on custom keyGenerators
- All upgrades follow `docs/DEPENDENCY_UPGRADE_PLAN.md` tiers

### 88. Tiered Confidence System for AI Extraction (Added Feb 9, 2026)
- **Feature**: Two-tier confidence thresholds for extraction results
  - `minConfidence` (0.4): Hard rejection — extraction fails below this
  - `warningConfidence` (0.7): Warning — results shown with caution banner
- **Components Updated**:
  - `src/lib/ai/policy-extractor.ts` — Checks both thresholds, adds `confidenceWarning` flag
  - `src/components/PolicyUpload.tsx` — Shows warning banner for low-confidence extractions
  - `src/components/TryAnalysis.tsx` — Warning banner in free trial flow
  - `src/components/PolicyDetailView.tsx` — Persistent warning on policy detail page
  - `src/lib/config/types.ts` — New `warningConfidence` setting in AIConfig
  - `src/components/admin/tabs/settings/AISettingsPanel.tsx` — Admin UI for warning threshold
- **Commit**: `7e1729e`

### 89. Mobile Landing Page UX Overhaul (Feb 9, 2026)
- **Problem**: Multiple UX issues on mobile anonymous user landing page:
  - CTA not visible above the fold (buried below 9 staggered items)
  - Brand name hidden on mobile
  - Fabricated stats throughout (4.9/5, 15K+, 50+, 2300+, 24/7)
  - Fake testimonials with invented names
  - Page too long on mobile (redundant sections)
- **Fixes across 4 commits** (`203784f`, `b195fd8`, `a35a6c1`, `e0cbaf4`):
  1. **Hero restructured**: CTA moved to 3rd position in StaggeredList, brand always visible, utility bar hidden on mobile, sub-headline shortened, headline `text-3xl` on smallest screens
  2. **CTA tightened**: Grouped CTA + "Free, no signup required" micro-copy + trust badges (KVKK, SSL) into single block, shadow on CTA button, secondary CTA demoted to text link
  3. **Stats replaced**: Fabricated counters (2300+, 15K+, 98%, 24/7) → authentic capabilities (7 policy types, TR/EN, 15+ checks, <60s)
  4. **ComparisonMock**: "Kasko A/B" → real provider names (Allianz/AXA) with disclaimer
  5. **TrustedProviders**: "50+ Turkish Insurers" → "Works with major Turkish insurers"
  6. **SampleReportPreview**: Expanded compact version with 3-line bulleted deliverables
  7. **WhyChooseUs**: Fabricated stats (4.9/5, 15K+, 50+) → authentic differentiators (KVKK Compliant, No Signup Required, Turkey-Focused)
  8. **Testimonials**: Fake names/quotes → honest use-case scenarios for 3 audience types
  9. **Mobile page length**: Hidden WhoItsFor, PolicyComparisonSection, CompareSection on mobile
- **Files Changed**: Hero.tsx, Hero.test.tsx, UploadWidget.tsx, Stats.tsx, Stats.test.tsx, ComparisonMock.tsx, TrustedProviders.tsx, SampleReportPreview.tsx, WhyChooseUs.tsx, WhyChooseUs.test.tsx, Testimonials.tsx, Testimonials.test.tsx, LandingPage.tsx

### 90. Comprehensive i18n for All User-Facing Components (Feb 11, 2026)
- **Feature**: Complete internationalization (TR/EN) for all user-facing components using `useTranslation` hook
- **Scope**: 20+ components across landing page, navigation, policy detail, upload, and preferences
- **Phases**:
  1. **Landing page + Navigation** (`0e14e55`): Hero, Benefits, HowItWorks, Stats, FAQ, Footer, ComparisonMock, SampleReportPreview, TrustedProviders, Testimonials, WhyChooseUs, GlobalNavigation
  2. **CTA + Comparison** (`6694321`): CompareSection, StickyMobileCTA, PolicyComparisonSection, WhoItsFor + 64 language consistency tests
  3. **Core components** (`a10f57e`): TryAnalysis, PolicyDetailView, UserPreferencesPanel
  4. **Coverage names + AI insights** (`9c5b910`, `97b0660`): Locale-aware coverage name display, AI insight translation
  5. **Auth-gated components** (`c4779bb`, `523b136`): PolicyChat, PolicyUpload — full i18n with test mock updates
- **Translation Architecture**:
  - `src/lib/i18n/translations.ts` — Central `TranslationDictionary` with `EN_TRANSLATIONS` and `TR_TRANSLATIONS`
  - `src/lib/i18n/i18n-context.tsx` — React context with `useTranslation()` hook returning `{ t, locale, isLoading }`
  - Default locale: `'tr'` (Turkish market focus)
  - Locale persisted in localStorage under key `'insurai_locale'`
- **Coverage Name Translation**:
  - **Problem**: AI extraction sets both `name` and `nameTr` to the same English value (line 1242 in `policy-extractor.ts`)
  - **Solution**: 90+ entry `COVERAGE_NAME_TR` fallback map in `PolicyDetailView.tsx`
  - `getLocalizedCoverageName()` checks: (1) `nameTr` differs from `name`? Use it. (2) Exact match in map? Use translation. (3) Case-insensitive match? Use it. (4) Fall back to `nameTr || name`
- **AI Insight Translation**:
  - **Problem**: `generateAIInsightsAsync()` produces English-only strings (strengths, gaps, recommendations)
  - **Solution**: `translateInsight()` function with 12 exact translations + 3 dynamic pattern matchers
  - Handles prefixes (✓ ⚠ 💡 ❌): strips, translates text, re-adds prefix
  - Dynamic patterns: "Missing common coverage: X", "Invalid TC Kimlik: X", "Market premiums increased N% YoY"
- **Test Coverage**:
  - 64 language consistency tests (key parity, non-empty values, EN/TR difference, CTA regression)
  - Updated test files for TryAnalysis (18 tests), PolicyDetailView (44 tests)
  - i18n mock pattern: `vi.mock('@/lib/i18n/i18n-context', () => ({ useTranslation: () => ({ t: EN_TRANSLATIONS, locale: 'en', isLoading: false }) }))`
- **Key Files Changed**:
  - `src/lib/i18n/translations.ts` — Added `tryAnalysis` (35 keys), `preferences` (18 keys), 30+ landing keys, CTA/comparison/WhoItsFor keys
  - `src/components/PolicyDetailView.tsx` — `getLocalizedCoverageName()`, `translateInsight()`, `COVERAGE_NAME_TR` map
  - `src/components/TryAnalysis.tsx` — All ~25 hardcoded strings → `t.tryAnalysis.*`
  - `src/components/UserPreferencesPanel.tsx` — All ~15 strings → `t.preferences.*`
  - 14 landing components — All strings → `t.landing.*`
  - `src/components/GlobalNavigation.tsx` — All nav strings → `t.nav.*`, `t.landing.*`
  - `src/lib/i18n/__tests__/language-consistency.test.ts` — 64 tests for translation parity
- **Commits**: `0e14e55`, `da6744e`, `6694321`, `a10f57e`, `9c5b910`, `97b0660`, `c4779bb`, `523b136`

### 91. Navigation Bar Overhaul — Globe Language Picker & Consistency (Feb 12, 2026)
- **Feature**: Unified navigation experience across all pages with Globe-icon language switcher
- **Changes**:
  1. **Globe Language Picker**: Added to both GlobalNavigation (app pages) and Hero (landing page) — TR/EN radio buttons with flag labels
  2. **Landing Page Nav**: Upload button opens file picker directly instead of navigating to `/upload`; Sign In link for anonymous users; mobile hamburger menu with inline TR/EN toggle
  3. **Nav Bar Consistency**: Removed redundant ArrowLeft back buttons from AllSamplesDemo and HelpCenter — GlobalNavigation provides navigation above all non-landing pages
  4. **Dead Button Cleanup**: Removed non-functional Settings/Bell/QuestionMark buttons from Hero nav
- **Navigation Architecture**:
  - `Hero.tsx` nav: Landing page only (`/`) — includes logo, nav links, Globe picker, user menu/Sign In
  - `GlobalNavigation.tsx`: All app pages (controlled by `hideNavigation` in App.tsx) — includes logo, nav links, Globe picker, notifications, profile dropdown
  - `hideNavigation` excludes: `/`, `/auth`, `/admin/*`, `/unsubscribe`
  - Pages showing GlobalNavigation should NOT have their own back arrows (PolicyDashboard pattern = title only)
- **Files Changed**:
  - `src/components/GlobalNavigation.tsx` — Added Globe language picker, direct file upload from nav
  - `src/components/landing/Hero.tsx` — Added Globe picker, Sign In link, mobile language toggle, dead button removal
  - `src/components/landing/StickyMobileCTA.tsx` — i18n integration
  - `src/components/AllSamplesDemo.tsx` — Removed ArrowLeft, added i18n
  - `src/components/HelpCenter.tsx` — Removed ArrowLeft, full i18n rewrite
- **Commits**: `679b448`, `7819465`, `7d7f062`, `ec91a9d`, `33acfc2`, `3dabff7`, `d892f95`, `fe457f7`

### 92. i18n for Auth, Help, Shared Result, and Sample Policies Pages (Feb 12, 2026)
- **Feature**: Full i18n integration for 4 additional pages that had hardcoded English strings
- **Pages Updated**:
  1. **AuthPage.tsx** — Login/signup form: name placeholder ("John Doe" → `t.auth.namePlaceholder`), email placeholder ("you@example.com" → `t.auth.emailPlaceholder` / "siz@ornek.com"), error messages, OAuth buttons
  2. **AllSamplesDemo.tsx** — Sample policies grid: title, description, coverage/premium labels, status badges, "View Details" button
  3. **HelpCenter.tsx** — Full rewrite: 4 help categories with descriptions, 5 popular articles, search placeholder, contact support section (24 translation keys)
  4. **SharedResult.tsx** — All states (not found, expired, found): policy summary labels, coverage display, exclusions, AI insights, CTA section (26 translation keys)
- **New Translation Sections Added**:
  - `auth`: Added `emailPlaceholder`, `namePlaceholder`, `authNotConfigured`, `authNotConfiguredDesc`, `continueToDemo`
  - `help`: Expanded from 7 → 24 keys (added `searchPlaceholder`, `gettingStartedDesc`, `policyAnalysis`, `policyAnalysisDesc`, `faqDesc`, `troubleshooting`, `troubleshootingDesc`, `articlesCount`, `popularArticles`, `article1-5`, `stillNeedHelp`, `stillNeedHelpDesc`, `chatWithAI`)
  - `shared`: New section with 26 keys for shared analysis viewer
  - `policy`: Added `viewDetails`, `perYear`
- **Dynamic String Pattern**: `t.help.articlesCount.replace('{count}', String(count))`
- **Files Changed**: `translations.ts` (+644 lines across all sessions), `AuthPage.tsx`, `AllSamplesDemo.tsx`, `HelpCenter.tsx`, `SharedResult.tsx`
- **Commits**: `71c7b10`, `9c26d69`, `f12b95f`

### 93. Database-Driven i18n Translation System (Added Feb 12, 2026)
- **Feature**: Transforms hardcoded i18n system (685+ keys × 2 languages) into a database-driven, admin-managed translation system
- **Architecture** (7 phases):
  1. **Database schema**: 5 tables (`translation_locales`, `translation_keys`, `translations`, `translation_audit_log`, `translation_metadata`)
  2. **Server API**: `TranslationService` with CRUD, caching, Zod validation (`server/services/translation-service.ts`)
  3. **Client pipeline**: API fetch → version-aware localStorage cache → preloaded fallback (`src/lib/i18n/translation-service.ts`)
  4. **Admin UI**: TranslationsTab with inline editing, coverage stats, import/export (`src/components/admin/tabs/TranslationsTab.tsx`)
  5. **Dynamic languages**: `useLanguageSelector` hook for Globe pickers to show DB-defined locales
  6. **AI-assisted bulk translation**: Batched OpenAI processing endpoint for translating missing keys
  7. **Migration**: Coverage names (90 entries) and AI insight translations (15 entries) moved from `PolicyDetailView` into i18n system
- **Database Migrations**: `017_translation_system.sql`, `018_seed_translations.sql`, `019_seed_coverage_insight_translations.sql`
- **Tests**: 363 translation-specific tests
- **New Files**: 9 (service, routes, tests, migrations, admin UI)
- **Modified Files**: 18 (i18n context, translations, components, tests)
- **Commits**: `08bcfef`, `716f2e0`

### 94. Stale HTML Cache Causing 404 on Hashed Assets (Fixed Feb 12, 2026)
- **Problem**: After Railway deployment, browsers loaded cached `index.html` referencing old chunk filenames (Vite generates new content hashes), causing 404 errors on JS/CSS assets
- **Root Cause**: `express.static` served `index.html` with `maxAge='1d'`, so browsers cached HTML for 24 hours
- **Solution**: Split static serving into two layers:
  - `/assets/*` (hashed filenames): `Cache-Control: max-age=31536000, immutable` (1 year, safe because filenames change on content change)
  - Everything else (`index.html`, `sw.js`): `Cache-Control: no-cache, must-revalidate` (always fetch fresh)
- **File Changed**: `server/index.ts`
- **Commit**: `2c4b057`

### 95. Service Worker Cache v19 (Feb 12, 2026)
- **Change**: Bumped service worker cache version from v18 to v19
- **Purpose**: Force cache invalidation after translation system deployment
- **File Changed**: `public/sw.js`
- **Commit**: `7277e9c`

### 96. Sample Policy Cards Expandable Detail View (Feb 16, 2026)
- **Problem**: Sample policy cards on `/samples` page had non-functional "View Details" button, AI insights not translated to Turkish, no way to see full policy details
- **Solution**:
  - Added expandable detail view showing coverages (with limits/deductibles), exclusions, special conditions, AI confidence bar, insured person, location, period
  - Added `translateInsight()` function using `t.insightTranslations` map for AI insight translation
  - Coverage names display locale-aware (`nameTr` for Turkish, `name` for English)
  - Toggle button switches between "View Details"/"Hide Details" with icons
  - Added 10 new Turkish translations for sample-specific AI insights
  - Added 9 new `policy` translation keys: `hideDetails`, `coverageDetails`, `exclusions`, `specialConditions`, `included`, `notIncluded`, `insuredPerson`, `location`, `period`, `confidence`
- **Files Changed**: `src/components/AllSamplesDemo.tsx`, `src/lib/i18n/translations.ts`
- **Commit**: `6b8b691`

### 97. Admin Settings Routes Unreachable — Express Route Ordering Bug (Fixed Feb 16, 2026)
- **Problem**: Admin Settings History panel showed "No history records found" despite records existing in database. Also affected `/regional-factors`, `/providers`, and `/benchmarks` endpoints.
- **Root Cause**: Classic Express route ordering bug — `/history`, `/regional-factors`, `/providers`, `/benchmarks` routes were defined AFTER `/:category` catch-all in `server/routes/settings.ts`. Express matched `history` as a `:category` parameter, queried `app_settings WHERE category = 'history'`, and returned empty results.
- **Solution**: Moved all specific named routes (`/history`, `/regional-factors*`, `/providers*`, `/benchmarks*`) before the `/:category` and `/:category/:key` catch-all routes
- **Route Order (Correct)**:
  ```
  /                          (list all settings)
  /performance               (metrics)
  /export, /import           (backup/restore)
  /batch                     (batch update)
  /feature-flags             (feature flag management)
  /history                   ← MOVED before catch-all
  /regional-factors          ← MOVED before catch-all
  /providers                 ← MOVED before catch-all
  /benchmarks                ← MOVED before catch-all
  /:category                 (catch-all — LAST)
  /:category/:key            (catch-all — LAST)
  ```
- **File Changed**: `server/routes/settings.ts`
- **Commit**: `4a58731`

### 98. i18n for MyAccount, Settings, and ComparePolicies (Feb 17, 2026)
- **Feature**: Full i18n integration for 3 remaining app pages with hardcoded English strings
- **Pages Updated**:
  - `MyAccount.tsx` — Profile fields, subscription info, account actions
  - `Settings.tsx` — All setting categories (appearance, notifications, AI config, export, security)
  - `ComparePolicies.tsx` — Comparison table headers, empty states, metric labels
- **Redundant ArrowLeft buttons removed** from all 3 pages (GlobalNavigation provides nav)
- **~100 new TR/EN translation entries** added to `translations.ts`
- **Test updates**: Settings.test.tsx updated for i18n mock pattern
- **Files Changed**: `MyAccount.tsx`, `Settings.tsx`, `ComparePolicies.tsx`, `translations.ts`, `Settings.test.tsx`
- **Commits**: `3af8b77`, `581b060`, `74c544f`

### 99. Coverage nameTr Fixed at Extraction Time (Feb 17, 2026)
- **Problem**: AI extraction set both `name` and `nameTr` to the same English value, requiring a 90+ entry display-time fallback map in `PolicyDetailView.tsx`
- **Root Cause**: `convertToAnalyzedPolicy()` in `policy-extractor.ts` copied English name to `nameTr` without translation
- **Solution**: Created canonical `src/lib/i18n/coverage-names.ts` as single source of truth for EN→TR coverage name mapping (167 lines, 90+ entries)
  - `convertToAnalyzedPolicy()` now resolves `nameTr` at extraction: AI-provided → canonical map lookup → English fallback
  - `PolicyDetailView.getLocalizedCoverageName()` simplified to field selection with legacy fallback
  - Duplicate coverage maps removed from `translations.ts` (replaced with shared import)
  - `ExtractedCoverage` interface updated with `nameTr` field
  - OpenAI JSON schema updated to request `nameTr` from AI
- **Key File**: `src/lib/i18n/coverage-names.ts` — canonical EN→TR coverage name map
- **Files Changed**: `coverage-names.ts` (new), `policy-extractor.ts`, `PolicyDetailView.tsx`, `extraction-schema.ts`, `translations.ts`
- **Commit**: `fc1fe9e`

### 100. Redundant ArrowLeft Back Button Removed from PolicyUpload (Feb 17, 2026)
- **Problem**: PolicyUpload had its own back arrow, conflicting with GlobalNavigation
- **Solution**: Removed ArrowLeft button and 2 associated tests, following PolicyDashboard pattern (title only)
- **Files Changed**: `PolicyUpload.tsx`, `PolicyUpload.test.tsx`
- **Commit**: `90b11df`

### 101. JSONB Version Increment Fix in Translation Trigger (Feb 17, 2026)
- **Problem**: Translation system DB trigger failed to increment version counter
- **Root Cause**: `value::text` produces quoted string `"1"` which fails integer cast
- **Solution**: Use `value #>> '{}'` to extract plain text without JSON quotes
- **File Changed**: `supabase/migrations/017_translation_system.sql`
- **Commit**: `05f0f9c`

### 102. ESLint Errors in Test Files (Fixed Feb 17, 2026)
- **Problem**: 2 ESLint errors introduced in recent test changes
  - `server/__tests__/translation-routes.test.ts:535` — constant binary expression (`'true' === 'true'`)
  - `src/components/Settings.test.tsx:574` — unused `toast` variable
- **Solution**: Used typed variables for dryRun comparison; prefixed unused import with `_`
- **Result**: ESLint now at 0 errors, 20 warnings (down from 46 warnings)
- **Commit**: `b9e498d`

### 103. UnsubscribePage i18n (Added Feb 18, 2026)
- **Feature**: Last page with hardcoded Turkish strings now uses the i18n translation system
- **Problem**: UnsubscribePage.tsx had 22 hardcoded Turkish strings without locale support
- **Solution**: Added `unsubscribe` section to `TranslationDictionary` with 22 TR/EN keys; component now uses `useTranslation()` hook
- **Translations Added**: title, titleSuccess, titleError, invalidLink, areYouSure, willNotReceive, marketingEmails, specialOffers, productUpdates, willContinue, confirmButton, processing, successMessage, changeYourMind, retry, connectionError, connectionErrorDetails, unsubscribeFailed, pleaseTryLater, backToHome, footer
- **Files Changed**: `src/components/UnsubscribePage.tsx`, `src/lib/i18n/translations.ts`
- **Commit**: `525bd52`

### 104. AI Insights Translated at Extraction Time — aiInsightsTr (Added Feb 18, 2026)
- **Feature**: AI insights are now translated to Turkish at extraction time, persisted as `aiInsightsTr` array
- **Problem**: AI insights (`policy.aiInsights`) were always English strings, requiring display-time translation with `translateInsight()` — brittle, couldn't handle new patterns, ran on every render
- **Solution**:
  - Added `aiInsightsTr?: string[]` field to `AnalyzedPolicy` interface in `src/types/policy.ts`
  - Created `translateInsightToTr()` and `translateInsightsToTr()` in `policy-extractor.ts` — mirrors display-time logic but runs once at extraction
  - Called at 3 points: `convertToAnalyzedPolicy()`, after validation insight prepend, and `comprehensiveToAnalyzedPolicy()`
  - `PolicyDetailView` updated with `getLocalizedInsight()` that prefers `aiInsightsTr[i]` when locale is Turkish, falling back to legacy `translateInsightLegacy()` for old extractions
  - Original `translateInsight()` renamed to `translateInsightLegacy()` for clarity
- **Benefits**: Single translation at extraction → persisted with policy → no per-render cost, consistent across views
- **Backward Compatible**: Policies extracted before this change still work via legacy fallback
- **Files Changed**: `src/types/policy.ts`, `src/lib/ai/policy-extractor.ts`, `src/components/PolicyDetailView.tsx`
- **Commit**: `b6f3d16`

### 105. Massive Test Coverage Push — 49.6% → 81.6% Lines (Feb 18, 2026)
- **Feature**: Comprehensive test coverage expansion adding ~3,300 tests across 50+ test files
- **Before**: 6,252 tests (190 files), 49.6% statements, 77.2% branches
- **After**: 9,541 tests (222 files), 80.4% statements, 70.2% branches, 81.6% lines
- **Key New Test Files** (selected highlights):
  - `server/__tests__/ai-routes-extended.test.ts` — 112 tests for all AI extraction/chat routes
  - `server/__tests__/prompt-versioning.test.ts` — Prompt template versioning
  - `server/__tests__/admin-db.test.ts` — Admin database operations
  - `server/__tests__/admin-content-routes.test.ts` — Content management routes
  - `server/__tests__/admin-cost-routes.test.ts` — Cost tracking routes
  - `server/__tests__/admin-monitoring-routes.test.ts` — Monitoring routes
  - `src/lib/ai/policy-extractor.test.ts` — Policy extraction logic
  - `src/lib/ai/text-processor.test.ts` — Combined document processing pipeline
  - `src/lib/ai/openai.test.ts` — OpenAI integration
  - `src/lib/gap-detection/gap-detection-branches.test.ts` — Gap detection branches
  - `src/lib/security/security-branches.test.ts` — Security module branches
  - `src/lib/privacy/data-subject-rights.test.ts` — KVKK data subject rights
  - `src/lib/knowledge/kasko-knowledge.test.ts` — Kasko knowledge base
  - `src/lib/regional-benchmark/*.test.ts` — Regional benchmark branches
  - `src/hooks/usePolicyEvaluation.test.ts` — Policy evaluation hook
  - `src/hooks/usePolicyComparison.test.ts` — Policy comparison hook
  - `src/components/PolicyCard.test.tsx` — Policy card component
  - `src/components/ConflictResolutionDialog.test.tsx` — Conflict resolution UI
- **ESLint Impact**: 33 ESLint errors initially introduced (all in test files — unused mock variables); **all resolved in Feb 19 session** (`0856102`)
- **Commits**: `478fe4d`, `542f593`

### 106. Branch Coverage Test Push — 76 New Test Files, 14,484 Total Tests (Feb 19, 2026)
- **Feature**: Massive branch coverage expansion adding 76 new test files with ~4,900 additional tests
- **Before**: 9,541 tests (222 files), 70.2% branches
- **After**: 14,484 tests (299 files), ~77% branches
- **Scope**: Targeted branch coverage gaps across all major subsystems:
  - **Server**: admin-auth, admin-content, admin-monitoring, admin-users, ai-ocr, cost-control, logger, rate-limit, config-service, drift-detection, monitoring, processing-log, prompt-service, email-service, webhook-service, translation-service, routes
  - **Components**: AuthPage, MyAccount, PolicyChat, PolicyUpload, TryAnalysis, GradeBadge, WinnerBadge, Hero
  - **Libraries**: AI (comparison, extraction-validator, document-ocr, OCR, claude provider, turkish-utils), analytics, env, gap-detection, i18n-context, insurance-display, market-data, OCR decision engine (language-detector, policy-classifier), pdf-export, pipeline (ai-ocr-cleaner, contradiction-detector, data-requests, document-chunker, ocr-confidence, ocr-sanitizer, ocr-stats, pattern-store, pipeline-logger, qa-gates, qa-scoring, turkish-ocr-normalizer, version), policy-evaluation, policy-utils, privacy (consent-manager), processing-logger, security (audit-logger, rate-limiter, security-monitor), sentry, supabase (client, policies), utils
  - **Types**: pdf-report coverage
- **ESLint Resolution**: 33+47+29 ESLint errors from test files fixed across three commits (`3172796`, `b31547b`, `0856102`); total ESLint now 0 errors, 47 warnings
- **Test Failures Fixed**: 7 test failures in coverage files (session ID property name, iPad UA detection, flaky timing assertion)
- **Translation Migration Script**: `scripts/run-translation-migrations.ts` added (`290cadb`)
- **Commits**: `3172796`, `290cadb`, `f544b8f`, `b31547b`, `e32131a`, `0856102`

---

## Turkish Market Considerations

### Mandatory Insurance Types
- **Trafik Sigortası** (MTPL): Required for all vehicles
- **DASK**: Required for all buildings (earthquake)
- **Professional Liability**: Required for certain professions

### Key Regulators
- **SEDDK** - Insurance regulator
- **TSB** - Insurance association
- **DASK** - Earthquake insurance authority
- **TARSİM** - Agricultural insurance pool

### Turkish Insurance Terms
| Turkish | English |
|---------|---------|
| Kasko | Comprehensive auto |
| Trafik Sigortası | Traffic/liability |
| Teminat | Coverage |
| Muafiyet | Deductible |
| Prim | Premium |
| Sigortalı | Insured |
| Poliçe | Policy |

### Currency Handling
```typescript
new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 2
}).format(15000.50)  // ₺15.000,50
```

---

## Security Considerations

### API Key Protection
- All AI API keys stored server-side only
- Never use `VITE_` prefix for sensitive keys
- Vite proxy handles routing in development

### Rate Limiting
- Chat: 60 requests/hour per IP
- Extraction: 20 requests/hour per IP
- OCR: 30 requests/hour per IP
- Health: 60 requests/minute per IP

### Security Headers (Helmet)
- CSP configured for PDF.js CDN and Supabase
- XSS protection enabled
- Frame options set
- Content sniffing protection

### Row Level Security
- All Supabase tables have RLS enabled
- Users can only access their own data
- `handle_new_user` trigger creates user profile on signup

---

## Performance Optimizations

### Bundle Optimization
- Lazy-loaded routes in `App.tsx`
- Bundle analysis: `npm run build:analyze`
- Tree shaking via Vite/Rollup

### PWA & Caching
- Service worker: `public/sw.js`
- Cache strategies: cache-first (static), network-first (API)
- PWA manifest for installability

### Config Fetch Performance Monitoring (Added Feb 6, 2026)
- In-memory rolling window tracker (1000 events, 1 hour)
- Latency percentiles: p50, p95, p99 for cache misses (DB fetches)
- Cache hit rate analysis with per-category breakdown
- TTL recommendation engine based on observed patterns
- Admin dashboard: Settings → Performance tab
- Both client-side and server-side monitors with API endpoints

### Lighthouse Targets
- FCP: < 2000ms
- LCP: < 2500ms
- CLS: < 0.1
- Performance score: > 0.8

---

## Deployment

### Local Development
```bash
npm install
cp .env.example .env
# Configure .env with your keys
npm run dev:all
```

### GitHub Codespaces (IMPORTANT)

GitHub Codespaces requires special configuration because the browser accesses the app through forwarded URLs (`https://*.app.github.dev`), not `localhost`.

**Step 1: Kill any existing processes on ports**
```bash
fuser -k 4001/tcp
fuser -k 5173/tcp
```

**Step 2: Create `.env` with Codespaces URLs**
```bash
cat > .env << 'EOF'
# Frontend - use YOUR Codespaces forwarded URLs
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_PROXY_URL=https://YOUR-CODESPACE-NAME-4001.app.github.dev

# Backend - CORS must allow Codespaces frontend URL
API_PORT=4001
FRONTEND_URL=https://YOUR-CODESPACE-NAME-5173.app.github.dev
NODE_ENV=development

# AI Keys
OPENAI_API_KEY=sk-proj-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
GOOGLE_CLOUD_API_KEY=xxx
EOF
```

**Step 3: Find your Codespaces URL**
- Look at the PORTS tab in VS Code
- Your URL will be like: `literate-invention-x9j77xxg5jrhppvp`
- Replace `YOUR-CODESPACE-NAME` in .env with this value

**Step 4: Start servers**
```bash
npm run dev:all
```

**Step 5: Open in browser**
- Use the forwarded URL from PORTS tab for port 5173
- Example: `https://literate-invention-x9j77xxg5jrhppvp-5173.app.github.dev`

### Common Codespaces Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Backend Server Unavailable" | VITE_API_PROXY_URL uses localhost | Use Codespaces forwarded URL |
| CSP violations | Mixed content (HTTPS→HTTP) | Use HTTPS Codespaces URLs |
| CORS errors | FRONTEND_URL mismatch | Set to Codespaces frontend URL |
| Port already in use | Previous processes still running | Run `fuser -k PORT/tcp` |

### CSP Configuration for Codespaces

The `index.html` includes CSP rules for Codespaces:
```html
connect-src 'self' http://localhost:* https://*.app.github.dev wss://*.app.github.dev;
manifest-src 'self' https://*.app.github.dev;
```

### Railway Production Deployment (Current)

**Live URL**: https://insurai-production.up.railway.app

Railway hosts both frontend and backend as a single service. The Express server serves the built React app as static files.

**Configuration Files:**
- `railway.json` - Build and deploy configuration
- `server/index.ts` - Serves static files in production

**railway.json:**
```json
{
  "build": {
    "builder": "NIXPACKS",
    "installCommand": "npm ci --include=dev",
    "buildCommand": "npm run build && npm run build:server"
  },
  "deploy": {
    "startCommand": "NODE_ENV=production node dist-server/index.js",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

**Environment Variables on Railway:**
```bash
# Server-side only (never exposed to browser)
OPENAI_API_KEY=sk-proj-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
GOOGLE_CLOUD_API_KEY=xxx
GCP_SERVICE_ACCOUNT_BASE64=...   # Base64-encoded service account JSON for Document AI
NODE_ENV=production

# Server-side Supabase (REQUIRED for admin auth)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# Admin JWT (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
ADMIN_JWT_SECRET=your-random-secret

# Build-time (embedded in JS bundle)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX  # Optional: GA4 analytics

# Optional overrides
# LOG_LEVEL=info          # Default in production; set to 'warn' to reduce noise
# UNSUBSCRIBE_SECRET=xxx  # Falls back to ADMIN_JWT_SECRET if not set

# NOT needed - auto-detected from window.location.origin
# VITE_API_PROXY_URL is automatically set in production
```

**Key Architecture Points:**
1. `VITE_*` variables are baked into the JS bundle at **build time**
2. API proxy URL auto-detects in production via `src/lib/env.ts`
3. Express serves `/api/*` routes AND static files from same origin
4. No CORS issues because frontend and backend share the same domain

**Deployment Steps:**
1. Push to the deployment branch
2. Railway auto-detects changes and rebuilds
3. Nixpacks runs `npm run build && npm run build:server`
4. Server starts with `node dist-server/index.js`

**Supabase Configuration Required:**
- Go to Supabase Dashboard → Authentication → URL Configuration
- Add `https://insurai-production.up.railway.app/**` to Redirect URLs
- This allows OAuth and magic link flows to work

**Common Railway Issues:**

| Issue | Cause | Solution |
|-------|-------|----------|
| "No AI service configured" | VITE_API_PROXY_URL not set at build | Auto-fixed: uses window.location.origin |
| PDF.js worker blocked | CSP missing CDN domains | Fixed in server/index.ts Helmet config |
| CORS errors | Railway domain not in allowlist | Fixed: `*.up.railway.app` in CORS config |
| Env vars with quotes | Railway UI adds quotes | Don't add manual quotes |
| Build not using env vars | VITE_* need rebuild | Trigger new deploy, not just restart |
| Admin login 500 error | SUPABASE_URL not set | Add SUPABASE_URL (not VITE_SUPABASE_URL) |
| Admin login 500 error | ADMIN_JWT_SECRET not set | Visit `/api/admin/diagnostics` to check config |
| crypto not defined | Missing import in ESM | Fixed in server/routes/admin.ts |

### Other Production Options
- **Frontend only**: Vercel or Netlify (need separate backend)
- **Backend only**: Render, Fly.io
- **Database**: Supabase (managed)
- See `docs/DEPLOYMENT_GUIDE.md` for alternative setups

---

## Common Gotchas (Quick Reference)

**Environment Variables:**
- `VITE_*` vars are baked at **build time** - need rebuild, not just restart
- API keys must NOT have `VITE_` prefix - they stay server-side only
- Railway env vars shouldn't have manual quotes (Railway adds them automatically)
- **Server needs `SUPABASE_URL`** (not `VITE_SUPABASE_URL`) for runtime database access
- **Admin auth needs `ADMIN_JWT_SECRET`** - generate with `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- Always import `crypto` explicitly in server code (don't rely on global or `require()`)
- Use `/api/admin/diagnostics` endpoint to check which env vars are configured

**API Proxy Auto-Detection (`src/lib/env.ts`):**
```typescript
// In production, if VITE_API_PROXY_URL not set, auto-detect:
if (import.meta.env.PROD && typeof window !== 'undefined') {
  return window.location.origin  // Same origin when co-hosted
}
```

**CSP for PDF.js Worker (`server/index.ts`):**
```typescript
// Required in Helmet CSP config (exact domains):
scriptSrc: [
  "'self'", 'blob:',
  'https://unpkg.com', 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com',
  'https://*.sentry.io', 'https://*.sentry-cdn.com'  // Error tracking
]
workerSrc: ["'self'", 'blob:', 'https://unpkg.com', 'https://cdn.jsdelivr.net']
connectSrc: [
  "'self'",
  'https://*.supabase.co', 'wss://*.supabase.co',  // Supabase
  'https://unpkg.com', 'https://cdn.jsdelivr.net', 'https://cdnjs.cloudflare.com',  // PDF.js
  'https://*.sentry.io', 'https://*.ingest.sentry.io'  // Sentry
]
```

**Supabase Auth Redirect URLs:**
- Must add production URL to Supabase Dashboard → Authentication → URL Configuration
- Format: `https://insurai-production.up.railway.app/**`
- Required for OAuth and magic link flows

**Kasko Implicit Coverages:**
- Don't flag Çarpma/Çarpışma, Hırsızlık, Yangın, Doğal Afetler as missing
- These are automatically included in base kasko
- Check `KASKO_IMPLICIT_COVERAGES` in `src/lib/ai/policy-extractor.ts`

**React Hooks (Rules of Hooks):**
- All hooks must be called unconditionally, in the same order every render
- Place ALL `useState`, `useCallback`, `useEffect` BEFORE any conditional returns
- Wrong: `if (loading) return <Spinner />` then `const x = useCallback(...)`
- Right: `const x = useCallback(...)` then `if (loading) return <Spinner />`

**React Hooks Exhaustive-Deps Patterns:**
- **Simple case**: Use `useCallback` and include callback in useEffect deps
- **Complex case**: Use ref pattern when callback has deep dependency chains
- **Stale closure gotcha**: Don't check state variables inside async callbacks - use local variables instead
- See Known Issue #32 for detailed patterns and examples

**Admin API Authentication:**
- All admin tab components MUST use `adminFetch()` from `@/lib/admin/api`, not raw `fetch()`
- `adminFetch()` automatically adds `Authorization: Bearer <token>` header
- Prompt endpoints are at `/api/admin/prompts` (not `/api/admin/prompts/templates`)
- Express route ordering matters: specific routes like `/prompts/templates` must come before `/prompts/:id`

**Document AI Configuration:**
- Standard OCR processor (`c2741b178ab61433`) has **15-page limit** per request
- `enableImagelessMode` is **NOT supported** on standard OCR processors (Enterprise only)
- PDFs >15 pages are automatically split into chunks via `pdf-splitter.ts`
- Check logs for version marker: `[Document AI] OCR route v5 invoked (standard processor, 15-page limit)`
- GCP credentials can be passed via `GCP_SERVICE_ACCOUNT_BASE64` (base64-encoded JSON)
- For documents >15 pages, chunks are processed separately and results combined

**Google Cloud API Key Restrictions:**
- The `GOOGLE_CLOUD_API_KEY` must have **Cloud Vision API** and **Cloud Document AI API** enabled in API restrictions
- If restricted to only "Generative Language API", Vision OCR will fail with `google: { valid: false }`
- Use `/api/ai/diagnose` to check — now returns `errorCode` (e.g., `API_NOT_ENABLED`, `PERMISSION_DENIED`)
- Vision OCR uses API key auth; Document AI uses OAuth service account — both need correct permissions
- Admin diagnostics (`/api/admin/diagnostics`) now shows AI provider configuration status

**Fire-and-Forget Patterns in Server Code:**
- All `.catch(() => {})` patterns have been replaced with `.catch((err) => log.warn(...))`
- If you add new fire-and-forget calls (cost tracking, notifications, security events), always log the catch
- These are non-blocking on purpose but failures must be visible in Railway logs for debugging

**Service Worker Cache Issues:**
- After deployment, browser may load old bundles due to service worker cache
- Fix: Bump `CACHE_VERSION` in `public/sw.js` (currently v19)
- Users may need to hard refresh (Ctrl+Shift+R) or clear site data
- Page auto-reloads on `controllerchange` event (see `src/lib/pwa/index.ts`)

**Static Asset Caching (server/index.ts):**
- Hashed assets (`/assets/*`): served with `max-age=31536000, immutable` — safe because Vite changes filenames on content change
- Non-hashed files (`index.html`, `sw.js`): served with `no-cache, must-revalidate` — always fresh
- This two-layer approach prevents stale HTML from referencing old chunk filenames after deployment
- See Known Issue #94 for the original bug and fix

**Vite Bundle Chunking (manualChunks):**
- **DO NOT** use aggressive catch-all chunking like `if (id.includes('node_modules')) return 'vendor-common'`
- This creates circular dependency errors: `Cannot access 'X' before initialization`
- Only split truly **independent** large libraries (pdfjs-dist, pdf-lib)
- Let Vite/Rollup handle interdependent modules automatically
- See Known Issue #51-52 for details on the failed optimization attempt

**AI Provider Fallback and Billing (Resolved Feb 17, 2026):**
- Anthropic billing issue previously caused fallback to OpenAI — **now resolved**, all 3 providers healthy
- The fallback mechanism still exists and works correctly if billing issues recur
- If Anthropic fails for any reason (billing, rate limit, overloaded), system auto-falls back to OpenAI
- Admin notifications created for billing/rate-limit issues
- Verify provider health: `curl /api/ai/diagnose` — check `anthropic.valid` and `anthropic.errorCode`
- 90-second timeout in TryAnalysis.tsx accommodates Document AI OCR (~50s) + AI extraction

**Free Trial File Handoff:**
- Files uploaded on landing page must be passed via React Router state
- Pattern: `navigate('/try', { state: { file: valid[0] } })`
- TryAnalysis reads from `location.state` and auto-processes
- Use `useRef` to prevent duplicate processing on re-renders

**Extraction Fallback (createFallbackResult) in Production:**
- `createFallbackResult()` returns `success: true` with random sample data from `samplePolicies[]`
- **NEVER** use `useFallback: true` in production extraction paths where users expect real AI results
- TryAnalysis now passes `{ useFallback: false }` and checks for `source === 'fallback'`
- Fallback is useful for dev/demos only — it completely masks real extraction errors
- See Known Issue #71 for the full investigation chain

**Server Error Message Sanitization:**
- Server should include actual error details in API responses, not just "Unable to process document"
- Client (`extractViaProxy`) must propagate the `details` field from server error responses
- Check `server/routes/ai.ts` unified extract endpoint for response format

**Production Logging Visibility:**
- Server production log level is `info` (changed from `warn` in Feb 7 session)
- If extraction timing or AI provider logs are invisible in Railway, check `LOG_LEVEL` env var
- Override with `LOG_LEVEL=warn` to suppress info-level output if too noisy

**Admin Routes Modularization:**
- Admin routes are now split into 9 modules under `server/routes/admin/`
- The old monolithic `server/routes/admin.ts` no longer exists
- Import from `server/routes/admin/index.ts` which aggregates all sub-routers
- Shared utilities (Supabase client, helpers) live in `server/routes/admin/shared.ts`

**Cost-Control In-Memory State in Tests:**
- `server/middleware/cost-control.ts` uses module-level `Map`/`Array` for in-memory budgets, alerts, usage
- These persist across tests since `vi.mock('@supabase/supabase-js')` forces in-memory mode
- If a test creates a blocking budget (`actionOnExceed: 'block'`), subsequent tests may fail
- Fix: Deactivate blocking budgets from prior tests with `upsertBudget({ id: '...', isActive: false })`

**Testing Module-Level Initialization (JWT Secret, env vars):**
- Use `vi.resetModules()` + dynamic `import()` to get a fresh module with cleared caches
- Use `vi.hoisted()` for mock variables referenced inside `vi.mock()` factories (avoids TDZ errors)
- Pattern: `const { mockFn } = vi.hoisted(() => ({ mockFn: vi.fn() }))` then reference in `vi.mock()`

**Market Data: DB-First with Static Fallback (Migration Complete):**
- `MarketDataService` in `src/lib/market-data/service.ts` provides DB-first access with static file fallback
- Core consumers (comparison engine, multi-AI analysis, extractor) now use async `MarketDataService` methods
- Static files in `src/data/market-data/` remain as fallback if DB unavailable
- Admins can now update benchmark data via Settings UI without code changes

**Express 5 Migration Gotchas:**
- `app.get('*')` no longer works as universal wildcard — use `app.get(/.*/)` regex
- `req.query` returns `unknown` instead of `any` — add type assertions
- Async errors in route handlers are automatically forwarded to error middleware (no need for try-catch wrappers for next())
- `res.send(status)` removed — use `res.sendStatus(status)`

**express-rate-limit v7 → v8 Migration:**
- v8 throws fatal `ValidationError` (ERR_ERL_KEY_GEN_IPV6) when custom `keyGenerator` uses `req.ip` without `ipKeyGenerator` helper
- Fix: Add `validate: { keyGeneratorIpFallback: false }` to every `rateLimit()` call with a custom keyGenerator
- This crashes the server on startup in production environments

**Vitest 2 → 4 Migration:**
- Arrow functions in `vi.fn().mockImplementation(() => ...)` CANNOT be used as constructors
- If code calls `new Something()`, mock must use `function() { return ... }` instead of `() => ...`
- Vitest 4 prints warning: "The vi.fn() mock did not use 'function' or 'class' in its implementation"

**React 18 → 19 Migration:**
- `useRef()` requires initial value — change `useRef<T>()` to `useRef<T | undefined>(undefined)`

**Landing Page: No Fabricated Data:**
- Never use fake stats, testimonials, or social proof (4.9/5 ratings, "15K+ users", invented names)
- Use authentic capability metrics or honest use-case scenarios instead
- If the product doesn't have real user data yet, show what it can do rather than inventing numbers

**Dead Code Verification Pattern:**
- Before deleting any export, verify 0 production imports with: `grep -r "functionName" src/ server/ --include="*.ts" --include="*.tsx" | grep -v ".test." | grep -v "__tests__"`
- Check for orphaned dependency chains: a dead hook may be the only consumer of an entire library directory
- Test files referencing deleted exports will cause import errors — update test files when removing exports

**i18n and Coverage Name Translation:**
- Coverage `nameTr` is now resolved at extraction time in `policy-extractor.ts` (Feb 17, 2026 fix)
- Canonical EN→TR coverage name map lives in `src/lib/i18n/coverage-names.ts` (90+ entries, single source of truth)
- For new coverage names from AI, add entries to `COVERAGE_NAME_MAP` in `coverage-names.ts`
- `PolicyDetailView.getLocalizedCoverageName()` now just picks the right field (name vs nameTr by locale) with legacy fallback for old extractions
- AI-generated insights (aiInsights array) are always in English — `translateInsight()` provides runtime Turkish translation
- When adding new insight strings in `generateStrengths()`, `generateGapsAsync()`, or `generateRecommendationsAsync()`, also add the translation to `translateInsight()` in PolicyDetailView.tsx
- The i18n mock pattern for tests: `vi.mock('@/lib/i18n/i18n-context', () => ({ useTranslation: () => ({ t: EN_TRANSLATIONS, locale: 'en', isLoading: false }) }))`
- Test assertions should use `EN_TRANSLATIONS.section.key` instead of hardcoded strings to stay in sync with translation changes
- When adding new translation sections to `translations.ts`, check for existing sections with the same key — duplicates cause `TS2300: Duplicate identifier` errors. Merge into the existing section instead.
- Dynamic translation strings use `{placeholder}` syntax: `t.help.articlesCount.replace('{count}', String(count))`

**Navigation Architecture (Dual Nav Systems):**
- **Landing page** (`/`): Uses Hero.tsx's built-in nav bar (logo, nav links, Globe picker, Sign In/user menu)
- **App pages** (all other routes): Uses GlobalNavigation.tsx (logo, nav links, Globe picker, notifications, profile dropdown)
- `hideNavigation` in `App.tsx` controls which pages hide GlobalNavigation: `/`, `/auth`, `/admin/*`, `/unsubscribe`
- Pages rendered with GlobalNavigation should NOT have their own ArrowLeft back button or redundant nav — use title only (PolicyDashboard pattern)
- Both nav bars have their own Globe language picker — changes persist via `localStorage('insurai_locale')`
- Upload button in nav opens file picker directly (no navigation to `/upload`) — validated file is passed via React Router state
- Redundant ArrowLeft buttons have been removed from MyAccount, Settings, ComparePolicies, and PolicyUpload (Feb 17, 2026)

**Express Route Ordering in `server/routes/settings.ts`:**
- All specific named routes (e.g., `/history`, `/regional-factors`, `/providers`, `/benchmarks`) MUST be defined BEFORE `/:category` catch-all route
- Express matches routes in order — if `/:category` comes first, it will match `history` as a category name and return empty results
- When adding new settings sub-routes, always place them before the `// CATEGORY-BASED SETTINGS ROUTES (catch-all — MUST be last)` comment
- This was the root cause of the admin Settings History panel showing "No history records found" (Fixed Feb 16, 2026)

**AI Insight Translation Architecture (Feb 18, 2026):**
- AI insights are now translated to Turkish at extraction time and persisted as `aiInsightsTr` on the `AnalyzedPolicy`
- `getLocalizedInsight()` in PolicyDetailView prefers `aiInsightsTr[i]` for Turkish locale, with `translateInsightLegacy()` fallback for old policies
- When adding new insight patterns in `generateStrengths()` / `generateGapsAsync()` / `generateRecommendationsAsync()`, also add the Turkish translation in `translateInsightToTr()` in `policy-extractor.ts`
- The display-time translation in `PolicyDetailView.tsx` is now legacy-only — new insights should be covered by the extractor

**ESLint in Test Files After Coverage Push (Resolved Feb 19, 2026):**
- The Feb 18-19 coverage push introduced 33+47=80 ESLint errors — all in test files (unused mock variables like `mockSelect`, `mockInsert`, etc.)
- **All 80 errors resolved** in commits `3172796`, `b31547b`, `0856102` — prefixed unused mocks with `_`
- Current ESLint status: **0 errors, 47 warnings** (all `no-non-null-assertion` in production code)

**Unhandled Rejection Warning in Full Test Suite:**
- When running the full test suite (`npm test`), Vitest may report "1 error" — an unhandled rejection: `ReferenceError: window is not defined` from `PolicyUpload.test.tsx`
- This is a **pre-existing race condition** between JSDOM teardown and async React setState when tests run in parallel
- All 299 test files pass; `PolicyUpload.test.tsx` passes when run individually
- The error has **zero impact on test results** — Vitest explicitly says "This might cause false positive tests"
- Not introduced by any session; it's a known React 19 + Vitest concurrency issue

---

## CI/CD

### GitHub Actions
- `staging.yml` - Runs on staging/develop branches and PRs to main
- Validates: typecheck, lint, tests
- Uploads coverage to Codecov

### Pre-commit Checks
```bash
npm run validate  # typecheck + lint + test
```

---

## Resources

- **SEDDK**: seddk.gov.tr (Insurance regulator)
- **TSB**: tsb.org.tr (Insurance association)
- **Insurance Law**: 5684
- **Supabase Docs**: supabase.com/docs
- **OpenAI API**: platform.openai.com/docs

---

## Quick Reference

```bash
# Start development
npm run dev:all

# Run all tests
npm test

# Full validation before commit
npm run validate

# Build for production
npm run build

# Analyze bundle
npm run build:analyze
```

**Ports**: Frontend=5173, Backend=4001
**Branch**: Develop on feature branches, merge to main via PR
**Tests**: 14,484 tests, all passing (299 test files), ~86% line coverage
**Last Updated**: February 19, 2026
