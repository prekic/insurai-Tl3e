# CLAUDE.md

> Context file for Claude Code sessions on the insurai project

---

## Project Overview

**insurai** is an insurance policy analysis platform for Turkish market professionals. Upload PDF policies, extract structured data with AI, and benchmark coverage against market standards.

- **Owner**: Erdem (personal project)
- **Current State**: Full-stack with AI extraction, multi-turn chat, policy evaluation, duplicate detection, performance optimizations, kasko coverage improvements, combined document processing pipeline, admin-managed AI prompts, OCR cleanup pipeline with Unicode-safe Turkish matching, enhanced Document Journey viewer with full content capture, **configuration-driven OCR Decision Engine with Document Journey metadata**
- **Production Readiness**: ~9.5/10 (5600+ tests, 0 lint errors, PWA support, server hardening)
- **Last Updated**: January 26, 2026

---

## Tech Stack

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
| Monitoring | Sentry | v10 |
| Testing | Vitest + Playwright | v2.1 / v1.57 |

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
│   ├── routes/              # API routes (ai.ts)
│   ├── middleware/          # Auth, rate limiting, validation
│   ├── lib/                 # Server utilities (Sentry)
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
| `src/lib/ai/config.ts` | AI provider configuration & proxy settings |
| `src/lib/ai/pdf-parser.ts` | PDF text extraction with pdf.js |
| `src/lib/ai/prompts.ts` | AI prompts for extraction and OCR correction |
| `src/lib/ai/text-processor.ts` | **NEW** Combined document processing pipeline |
| `src/lib/ai/document-normalizer.ts` | **NEW** Clean-room deterministic document normalizer |
| `server/routes/ai.ts` | AI proxy routes (extraction, chat, OCR) |

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
| `src/components/PolicyDiffViewer.tsx` | **NEW** Visual diff for policy changes |
| `src/components/ConflictResolutionDialog.tsx` | **NEW** Duplicate/amendment resolution UI |
| `src/components/GlobalNavigation.tsx` | Main nav with auth state |
| `src/components/ComparePolicies.tsx` | Side-by-side policy comparison |

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
| `server/index.ts` | Express server with graceful shutdown |
| `server/middleware/validation.ts` | Zod schemas for request validation |
| `server/middleware/rate-limit.ts` | Rate limiting for AI endpoints |
| `server/lib/sentry.ts` | Sentry error tracking setup |

### Admin Panel (Added Jan 2026)
| File | Purpose |
|------|---------|
| `src/components/admin/AdminDashboard.tsx` | Main admin dashboard with tabbed interface |
| `src/components/admin/AdminLogin.tsx` | Admin login page |
| `src/components/admin/tabs/PromptsTab.tsx` | Manage AI prompt templates |
| `src/lib/admin/context.tsx` | Admin auth context provider (AdminAuthProvider) |
| `src/lib/admin/api.ts` | Admin API client functions (includes `adminFetch` wrapper) |
| `server/routes/admin.ts` | Admin API routes (login, users, config, prompts) |
| `server/middleware/admin-auth.ts` | JWT auth middleware for admin routes |
| `server/services/admin-db.ts` | Admin database operations |
| `server/services/prompt-service.ts` | **NEW** Centralized prompt management service |

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
| `Stats.tsx` | Key metrics (policies analyzed, time saved, etc.) |
| `WhoItsFor.tsx` | Target audience cards (brokers, risk managers, etc.) |
| `WhyChooseUs.tsx` | Differentiators vs competitors |
| `CompareSection.tsx` | Interactive policy comparison demo |
| `ComparisonMock.tsx` | Visual comparison result mockup |
| `Testimonials.tsx` | Customer quotes carousel |
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

## Testing Strategy

### Test Organization
```
Unit Tests (Vitest):        *.test.ts alongside source files
Integration Tests:          src/__tests__/integration/
Performance Tests:          src/__tests__/performance/
E2E Tests (Playwright):     e2e/
Server Tests:               server/__tests__/
```

### Test Counts (as of Jan 11, 2026)
- **Total**: ~4500 tests across 130+ files
- **Passing**: 100%
- **Coverage Target**: 80%+

### Key Test Files
| File | Tests | Purpose |
|------|-------|---------|
| `src/lib/policy-utils.test.ts` | 45 | Duplicate detection, fuzzy matching |
| `src/components/PolicyChat.test.tsx` | 29 | Chat component |
| `src/components/PolicyDetailView.test.tsx` | 44 | Policy detail view |
| `src/__tests__/performance/performance.test.ts` | 30 | Performance metrics |
| `server/__tests__/chat-routes.test.ts` | 18 | Chat API |

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
| `useMarketData` | Fetch market provider data | `{ providers, benchmarks }` |
| `usePdfExport` | Export policy to PDF | `{ exportPdf, isExporting }` |
| `useAnalytics` | Track user actions | `{ track, identify }` |
| `useCostTracking` | Track AI API costs | `{ costs, addCost }` |
| `usePrivacy` | KVKK/GDPR consent management | `{ hasConsent, requestConsent }` |
| `useIndustryRisk` | Industry-specific risk factors | `{ riskFactor, industryData }` |
| `usePolicyTemplates` | Predefined policy templates | `{ templates, applyTemplate }` |

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
    "buildCommand": "npm run build && npm run build:server"
  },
  "deploy": {
    "startCommand": "NODE_ENV=production node dist-server/index.js"
  }
}
```

**Environment Variables on Railway:**
```bash
# Server-side only (never exposed to browser)
OPENAI_API_KEY=sk-proj-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
GOOGLE_CLOUD_API_KEY=xxx
NODE_ENV=production

# Server-side Supabase (REQUIRED for admin auth)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbG...

# Admin JWT (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
ADMIN_JWT_SECRET=your-random-secret

# Build-time (embedded in JS bundle)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...

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
- Always import `crypto` explicitly in server code (don't rely on global or `require()`)

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

**Admin API Authentication:**
- All admin tab components MUST use `adminFetch()` from `@/lib/admin/api`, not raw `fetch()`
- `adminFetch()` automatically adds `Authorization: Bearer <token>` header
- Prompt endpoints are at `/api/admin/prompts` (not `/api/admin/prompts/templates`)
- Express route ordering matters: specific routes like `/prompts/templates` must come before `/prompts/:id`

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
**Tests**: 4500+ tests, all passing
**Last Updated**: January 25, 2026
