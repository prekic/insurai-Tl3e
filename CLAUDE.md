# CLAUDE.md

> Context file for Claude Code sessions on the insurai project

---

## Project Overview

**insurai** is an insurance policy analysis platform for Turkish market professionals. Upload PDF policies, extract structured data with AI, and benchmark coverage against market standards.

- **Owner**: Erdem (personal project)
- **Current State**: Full-stack with AI extraction, multi-turn chat, policy evaluation, performance optimizations
- **Production Readiness**: ~9/10 (4600+ tests, 0 lint errors, PWA support, server hardening)
- **Last Updated**: January 7, 2026

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
│   │   ├── ui/              # Base UI components (Button, Card, etc.)
│   │   ├── landing/         # Landing page sections
│   │   └── animations/      # Framer Motion components
│   ├── lib/
│   │   ├── ai/              # AI extraction (providers, config, OCR)
│   │   │   ├── providers/   # OpenAI, Anthropic adapters
│   │   │   ├── cache/       # Response caching
│   │   │   └── cost-tracking/ # API usage tracking
│   │   ├── supabase/        # Auth, policies, database
│   │   ├── gap-detection/   # Coverage gap analysis
│   │   ├── regional-benchmark/ # Turkish regional data
│   │   ├── i18n/            # Internationalization (TR/EN)
│   │   └── security/        # Audit logging, sanitization
│   ├── hooks/               # Custom React hooks
│   ├── types/               # TypeScript definitions
│   ├── data/                # Sample policies, market data
│   └── __tests__/           # Integration tests
├── server/
│   ├── index.ts             # Express server entry
│   ├── routes/              # API routes
│   ├── middleware/          # Auth, rate limiting
│   └── lib/                 # Server utilities
├── e2e/                     # Playwright E2E tests
├── docs/                    # Deployment guides
└── supabase/                # Database migrations
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/types/policy.ts` | Core policy data structures |
| `src/lib/ai/policy-extractor.ts` | Main AI extraction orchestrator |
| `src/lib/ai/config.ts` | AI provider configuration |
| `src/lib/ai/pdf-parser.ts` | PDF text extraction with pdf.js |
| `src/lib/supabase/auth-context.tsx` | Authentication context |
| `src/lib/supabase/policies.ts` | Policy CRUD operations |
| `src/components/PolicyUpload.tsx` | Upload flow with extraction |
| `src/components/PolicyChat.tsx` | Multi-turn AI chat for policy questions |
| `src/components/GlobalNavigation.tsx` | Main nav with auth state |
| `server/index.ts` | Backend API server (port 4001) |
| `server/routes/ai.ts` | AI proxy routes (extraction, chat, OCR) |
| `server/middleware/validation.ts` | Zod schemas for request validation |
| `server/middleware/rate-limit.ts` | Rate limiting for AI endpoints |
| `.env` | Environment configuration |

---

## Commands

```bash
# Development
npm run dev           # Frontend only (port 5173)
npm run dev:server    # Backend only (port 4001)
npm run dev:all       # Both frontend + backend
npm run dev:sync      # Pull latest + install + run all

# Build & Deploy
npm run build         # Production build
npm run preview       # Preview production build

# Testing
npm test              # Run unit tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage report
npm run test:e2e      # Playwright E2E tests
npm run validate      # typecheck + lint + test

# Code Quality
npm run lint          # ESLint
npm run lint:fix      # Auto-fix
npm run typecheck     # TypeScript check
npm run format        # Prettier

# Load Testing
npm run loadtest:quick  # 5s load test
npm run loadtest:stress # 30s stress test
```

---

## Environment Variables

Create `.env` in project root:

```env
# Frontend (VITE_ prefix exposes to browser)
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_API_PROXY_URL=http://localhost:4001
VITE_SENTRY_DSN=https://xxx@sentry.io/xxx

# Backend (server-side only, never exposed)
API_PORT=4001
FRONTEND_URL=http://localhost:5173
OPENAI_API_KEY=sk-proj-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
GOOGLE_CLOUD_API_KEY=AIza...
NODE_ENV=development
```

**CRITICAL**: API keys must NEVER have `VITE_` prefix - they stay server-side only.

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
┌──────────┐    ┌───────────────┐    ┌──────────────┐    ┌──────────┐
│  User    │───▶│ PolicyUpload  │───▶│ pdf.js       │───▶│ Text     │
│  drops   │    │ component     │    │ (browser)    │    │ extracted│
│  PDF     │    │               │    │              │    │          │
└──────────┘    └───────────────┘    └──────────────┘    └────┬─────┘
                                                              │
                     ┌────────────────────────────────────────┘
                     ▼
            ┌─────────────────┐
            │ Check text      │
            │ density         │
            └────────┬────────┘
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
   ┌───────────┐          ┌───────────┐
   │ < 100     │          │ >= 100    │
   │ chars/page│          │ chars/page│
   │ (scanned) │          │ (digital) │
   └─────┬─────┘          └─────┬─────┘
         │                      │
         ▼                      │
   ┌───────────┐                │
   │ Google    │                │
   │ Vision OCR│                │
   │ /api/ai/  │                │
   │ ocr       │                │
   └─────┬─────┘                │
         │                      │
         └──────────┬───────────┘
                    ▼
            ┌─────────────────┐
            │ AI Extraction   │
            │ /api/ai/extract │
            │ OpenAI|Anthropic│
            └────────┬────────┘
                     │
                     ▼
            ┌─────────────────┐
            │ Zod Validation  │
            │ PolicySchema    │
            └────────┬────────┘
                     │
                     ▼
            ┌─────────────────┐    ┌──────────────┐
            │ PolicyContext   │───▶│ Supabase     │
            │ (React state)   │    │ policies     │
            │                 │    │ table        │
            └─────────────────┘    └──────────────┘
```

### Data Flow: PolicyChat Conversation

```
┌──────────┐    ┌───────────────┐    ┌──────────────┐
│  User    │───▶│ PolicyChat    │───▶│ Build        │
│  types   │    │ component     │    │ context from │
│  question│    │               │    │ policies     │
└──────────┘    └───────────────┘    └──────┬───────┘
                                            │
                     ┌──────────────────────┘
                     ▼
            ┌─────────────────────────────────────┐
            │ Request to /api/ai/chat             │
            │ {                                   │
            │   message: "What does my Kasko...", │
            │   conversationHistory: [...],       │
            │   policyContext: "Policy: POL-001", │
            │   provider: "openai"                │
            │ }                                   │
            └─────────────────┬───────────────────┘
                              │
                              ▼
                    ┌─────────────────┐
                    │ Rate Limiter    │
                    │ (60/hr per IP)  │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Zod Validation  │
                    │ chatSchema      │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ System Prompt + │
                    │ Policy Context  │
                    │ + History       │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
       ┌─────────────┐              ┌─────────────┐
       │ OpenAI      │              │ Anthropic   │
       │ gpt-4o-mini │              │ claude-3-5- │
       │             │              │ haiku       │
       └──────┬──────┘              └──────┬──────┘
              │                            │
              └──────────────┬─────────────┘
                             ▼
                    ┌─────────────────┐
                    │ Response to UI  │
                    │ {               │
                    │   response: "", │
                    │   provider: "", │
                    │   usage: {}     │
                    │ }               │
                    └─────────────────┘
```

### Authentication Flow

```
┌──────────┐    ┌───────────────┐    ┌──────────────┐
│  User    │───▶│ Login/Signup  │───▶│ Supabase     │
│  clicks  │    │ form          │    │ Auth         │
│  sign in │    │               │    │              │
└──────────┘    └───────────────┘    └──────┬───────┘
                                            │
                                            ▼
                                   ┌─────────────────┐
                                   │ JWT Session     │
                                   │ stored in       │
                                   │ localStorage    │
                                   └────────┬────────┘
                                            │
                     ┌──────────────────────┘
                     ▼
            ┌─────────────────┐
            │ AuthContext     │
            │ provides:       │
            │ - user object   │
            │ - isLoading     │
            │ - signIn()      │
            │ - signOut()     │
            └────────┬────────┘
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
   ┌───────────┐          ┌───────────┐
   │ Protected │          │ Public    │
   │ Routes    │          │ Routes    │
   │ /dashboard│          │ /landing  │
   │ /upload   │          │ /login    │
   │ /chat     │          │           │
   └───────────┘          └───────────┘
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

### File Organization by Layer

```
Frontend (src/)
├── components/         # UI components
│   ├── ui/            # Base components (Button, Card)
│   ├── landing/       # Marketing page sections
│   └── insurance-lines/ # Policy type specific UIs
├── lib/               # Business logic
│   ├── ai/           # AI extraction orchestration
│   ├── supabase/     # Auth, database operations
│   ├── gap-detection/ # Coverage analysis
│   └── pwa/          # Service worker utilities
├── hooks/            # Custom React hooks
├── types/            # TypeScript definitions
└── __tests__/        # Integration tests

Backend (server/)
├── index.ts          # Express app setup, graceful shutdown
├── routes/
│   └── ai.ts         # All AI endpoints (chat, extract, ocr)
├── middleware/
│   ├── validation.ts # Zod schemas, request validation
│   └── rate-limit.ts # Per-endpoint rate limiters
└── __tests__/        # API route tests
```

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
Decorative blobs: blue-100/40 to purple-100/40

/* Typography */
Headings: font-bold text-gray-900
Body: text-gray-600
```

### Figma Design Reference
- Source file: `MERGED_CODEBASE_FIGMA_DESIGN_DRAFTS.md`
- Contains 138 component designs from original Figma export
- Key components: AdminPanel, InsuranceComparison, CoverageDetails

---

## Benchmarking Logic

### Core Services (`src/lib/`)

| Module | Purpose |
|--------|---------|
| `market-data/service.ts` | MarketDataService - main benchmarking engine |
| `market-data/gap-analyzer.ts` | Identifies coverage gaps vs market |
| `regional-benchmark/` | Regional risk adjustments and comparisons |
| `industry-risk/` | Industry-specific risk profiles |
| `data-repository/` | Data validation and loading |

### Benchmarking Flow

```
User Policy → Extract Data → Detect Region → Get Market Benchmark
     ↓                            ↓                    ↓
Compare Premium → Compare Coverage → Calculate Value Score
     ↓                    ↓                    ↓
Premium Percentile   Coverage %ile      Value = Coverage/Premium
     ↓                    ↓                    ↓
Generate Insights → Gap Analysis → Recommendations
```

### Key Calculations

```typescript
// Premium percentile (where user stands vs market)
premiumPercentile = calculatePremiumPercentile(premium, policyType, region)

// Coverage percentile (coverage adequacy)
coveragePercentile = calculateCoveragePercentile(coverage, policyType)

// Value score (what you get per TRY spent)
valueScore = (userCoverage / userPremium) / (marketCoverage / marketPremium) * 50

// Regional adjustment
adjustedPremium = basePremium * REGIONAL_FACTORS[region].factor
```

### Insight Categories

| Category | Description |
|----------|-------------|
| `premium_high` | Premium > 75th percentile |
| `premium_low` | Premium < 25th percentile (check coverage) |
| `coverage_adequate` | Coverage >= market average |
| `coverage_insufficient` | Coverage < 50th percentile |
| `value_excellent` | Value score > 80 |
| `value_poor` | Value score < 40 |

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

### Gap Severity Levels
```typescript
type GapSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info'
```

### Gap Categories
- `coverage` - Missing protection types
- `limit` - Insufficient coverage amounts
- `deductible` - High out-of-pocket costs
- `exclusion` - Risky policy exclusions
- `temporal` - Gaps in coverage dates
- `compliance` - Regulatory issues (DASK, etc.)

### Output: ComprehensiveGapAnalysis
```typescript
{
  gaps: DetectedGap[]
  gapCount: { total, critical, high, medium, low, info }
  overallScore: number  // 0-100
  financialSummary: { potentialExposure, recommendedIncrease }
  prioritizedGaps: PrioritizedGap[]
  recommendations: GapRecommendation[]
}
```

---

## Policy Evaluation Module

### Location: `src/lib/policy-evaluation/`

New module for evaluating individual policies and comparing multiple policies.

### Core Files
- `types.ts` - Type definitions, grade/status helpers, config defaults
- `evaluator.ts` - Single policy evaluation against market benchmarks
- `comparator.ts` - Multi-policy comparison (2-4 policies)
- `index.ts` - Public API, service functions

### Key Functions
```typescript
// Evaluate a single policy
const result = evaluatePolicy(policy, { weights: { premium: 20, coverage: 30, ... } })
// result.overallScore: 0-100, result.grade: 'A'-'F', result.status: 'excellent'|'good'|...

// Compare multiple policies
const comparison = comparePolicies([policy1, policy2, policy3])
// comparison.rankings: PolicyRanking[], comparison.recommendation: string
```

### Grading System
| Score | Grade | Status |
|-------|-------|--------|
| >= 90 | A | excellent |
| 75-89 | B | good |
| 60-74 | C | fair |
| 40-59 | D | poor |
| < 40 | F | critical |

### Default Weights (sum to 100)
- Premium: 20%
- Coverage: 30%
- Deductible: 15%
- Compliance: 20%
- Value: 15%

---

## Regional Benchmarking

### Turkish Regions (`src/lib/regional-benchmark/`)

| Region Code | Name | Key Characteristics |
|-------------|------|---------------------|
| `marmara` | Marmara | Highest risk (İstanbul), earthquake zone 1 |
| `ege` | Aegean | Tourism, earthquake risk |
| `akdeniz` | Mediterranean | Tourism, flood risk |
| `ic_anadolu` | Central Anatolia | Lower risk, agricultural |
| `karadeniz` | Black Sea | Flood/landslide risk |
| `dogu_anadolu` | Eastern Anatolia | Lower premiums, rural |
| `guneydogu` | Southeastern | Mixed risk profile |

### Province Data
- 17 major provinces with full data
- Population, density, urban ratio
- Earthquake zone (1-5 scale)
- Risk profiles by insurance type

### Risk Factors (from AFAD data)
```typescript
RegionalRiskProfile {
  earthquake: { zone, level, historicalEvents, avgMagnitude }
  flood: { level, annualEvents }
  fire: { level, wildfireRisk }
  traffic: { level, accidentRate }
  crime: { level, theftRate }
}
```

### Premium Benchmarks
- Regional averages by policy type
- Comparison to national average
- Risk-adjusted premium recommendations

---

## Supported Policy Types

### Turkish Insurance Lines

| Type | Turkish Name | Key Coverages |
|------|--------------|---------------|
| `auto_kasko` | Kasko | Vehicle damage, theft, natural disasters |
| `auto_traffic` | Trafik Sigortası | Mandatory liability (MTPL) |
| `fire` | Yangın | Building, contents, business interruption |
| `earthquake` | DASK | Mandatory earthquake for buildings |
| `health` | Sağlık | Medical expenses, hospitalization |
| `life` | Hayat | Death benefit, savings component |
| `personal_accident` | Ferdi Kaza | Accident death/disability |
| `engineering` | İnşaat/Montaj | CAR/EAR for construction |
| `agricultural` | Tarım | Crop, livestock, equipment |
| `credit_life` | Kredi Hayat | Loan protection |

### Policy Type Components (`src/components/insurance-lines/`)
- `TurkishKaskoDetails.tsx` - Auto comprehensive details
- `TurkishTrafficDetails.tsx` - MTPL details
- `TurkishFireDetails.tsx` - Fire/property details
- `TurkishHealthDetails.tsx` - Health coverage details
- `TurkishEngineeringDetails.tsx` - Construction coverage

---

## Insurance Knowledge Database

### Data Files (`src/data/`)

| File | Purpose |
|------|---------|
| `market-data/benchmarks.ts` | Premium benchmarks, coverage limits by policy type |
| `market-data/providers.ts` | 12 Turkish insurance companies with market share |
| `insurance-lines.ts` | Official TSB/SEDDK insurance branch classifications |
| `regulations.ts` | Laws, general conditions (genel şartlar), circulars |
| `coverage-limits.ts` | Official SEDDK/DASK minimum coverage limits |
| `sample-policies.ts` | 21 sample Turkish policies for testing |

### Turkish Insurance Providers (2024 Market Share)

| Provider | Turkish Name | Market Share |
|----------|--------------|--------------|
| Allianz | Allianz Sigorta | 12.8% |
| AXA | AXA Sigorta | 10.5% |
| Anadolu | Anadolu Sigorta | 9.2% |
| Aksigorta | Aksigorta | 8.7% |
| Mapfre | Mapfre Sigorta | 7.4% |
| Sompo | Sompo Sigorta | 6.8% |
| Zurich | Zurich Sigorta | 5.2% |
| HDI | HDI Sigorta | 4.8% |
| Türkiye | Türkiye Sigorta | 4.5% |
| Groupama | Groupama Sigorta | 4.2% |

### Regulatory Framework

| Regulation Type | Turkish | Purpose |
|-----------------|---------|---------|
| Kanun | Law | Primary legislation (e.g., Insurance Law 5684) |
| Yönetmelik | Regulation | Detailed implementation rules |
| Genel Şartlar | General Conditions | Standard policy terms by type |
| Kloz | Clause | Optional coverage extensions |
| Tarife | Tariff | Official premium tables |
| Genelge | Circular | Administrative guidance |
| Tebliğ | Communique | Official announcements |

### Official Coverage Limits (2025)

**Traffic Insurance (ZMMS) - Per Vehicle:**
- Material Damage: 300,000 TRY per vehicle
- Material Damage: 600,000 TRY per accident
- Bodily Injury: 1,500,000 TRY per person
- Bodily Injury: 7,500,000 TRY per accident

**DASK (Earthquake) Limits:**
- Maximum coverage: 1,040,000 TRY (2025)
- Minimum premium varies by earthquake zone (1-5)
- Zone 1 (Istanbul): Highest risk, highest premium

### Regional Premium Factors

| Region | Factor | Reason |
|--------|--------|--------|
| Marmara | 1.15x | High risk (Istanbul), earthquake zone 1 |
| Akdeniz | 1.08x | Tourism, flood risk |
| Ege | 1.05x | Tourism, earthquake risk |
| İç Anadolu | 0.95x | Lower risk, agricultural |
| Karadeniz | 0.90x | Flood/landslide risk |
| Güneydoğu | 0.88x | Mixed risk profile |
| Doğu Anadolu | 0.85x | Rural, lower premiums |

---

## Domain Knowledge

### Turkish Insurance Terms

| Turkish | English | Notes |
|---------|---------|-------|
| Kasko | Comprehensive auto | Covers own vehicle damage |
| Trafik Sigortası | Traffic/liability | Mandatory third-party |
| Yangın | Fire | Often bundled with property |
| DASK | Earthquake | Mandatory for buildings |
| Ferdi Kaza | Personal accident | Individual coverage |
| Teminat | Coverage/guarantee | The protection provided |
| Muafiyet | Deductible | Amount policyholder pays |
| Prim | Premium | Cost of insurance |
| Sigortalı | Insured | Who is covered |
| Sigorta Ettiren | Policyholder | Who pays |
| Riziko Adresi | Risk Address | Location covered |
| Lehdar | Beneficiary | Who receives payout |
| Hasar | Claim/Damage | When something goes wrong |
| Poliçe Süresi | Policy Period | Coverage duration |
| Rücu | Subrogation | Insurer's right to recover |
| Eksik Sigorta | Underinsurance | Sum insured < actual value |
| Aşkın Sigorta | Overinsurance | Sum insured > actual value |
| Acente | Agent | Insurance intermediary |
| Broker | Broker | Independent intermediary |
| Aktüer | Actuary | Risk/pricing specialist |
| Hasar/Prim Oranı | Loss Ratio | Claims / Premiums |

### Key Regulators

- **SEDDK** - Sigortacılık ve Özel Emeklilik Düzenleme ve Denetleme Kurumu (Insurance regulator)
- **TSB** - Türkiye Sigorta Birliği (Insurance association, industry body)
- **Hazine** - Hazine ve Maliye Bakanlığı (Treasury, oversees insurance sector)
- **DASK** - Doğal Afet Sigortaları Kurumu (Earthquake insurance authority)
- **TARSİM** - Tarım Sigortaları Havuzu (Agricultural insurance pool)
- **Güvence Hesabı** - Guarantee Fund (covers uninsured drivers)

### Policy Structure

```
Poliçe (Policy)
├── Sigortalı (Insured)
├── Sigorta Ettiren (Policyholder)
├── Riziko Adresi (Risk Address)
├── Teminatlar (Coverages)
│   ├── Teminat Türü (Type)
│   ├── Sigorta Bedeli (Sum insured)
│   └── Muafiyet (Deductible)
├── Özel Şartlar (Special conditions)
└── İstisnalar (Exclusions)
```

---

## Code Conventions

### File Naming
- `components/PolicyCard.tsx` - PascalCase for components
- `lib/parse-policy.ts` - kebab-case for utilities
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

// Avoid enums - use const objects
const POLICY_STATUS = { ACTIVE: 'active', EXPIRED: 'expired' } as const
type PolicyStatus = typeof POLICY_STATUS[keyof typeof POLICY_STATUS]
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

## Testing Strategy

### Unit Tests (Vitest)
- Location: `*.test.ts` alongside source files
- Focus: Pure functions, hooks, utilities
- Coverage target: 80%+

### Integration Tests
- Location: `src/__tests__/integration/`
- Focus: Environment validation, API connectivity, CDN availability

### E2E Tests (Playwright)
- Location: `e2e/`
- Focus: User flows (upload, auth, navigation)

### Key Test Files
- `src/components/GlobalNavigation.test.tsx` - Nav and auth UI
- `src/components/PolicyChat.test.tsx` - Chat component (29 tests)
- `src/lib/ai/policy-extractor.test.ts` - AI extraction
- `src/__tests__/integration/dependencies.test.ts` - CDN checks
- `src/__tests__/integration/environment-validation.test.ts` - Config checks
- `src/__tests__/performance/performance.test.ts` - Performance tests (30 tests)
- `server/__tests__/chat-routes.test.ts` - Chat API tests (18 tests)

### Test Counts (as of Jan 7, 2026)
- **Total**: 4593 tests across 136 files
- **Passing**: 4593 (100%)
- **Expected Skips**: Environment/integration tests skip gracefully when env vars not configured

### Test Fix Patterns
When tests fail, check these common patterns:
- **Missing mocks**: Components using `useAuth()` need mock in test file
- **Async loading**: Use `waitFor` for components with loading states
- **Stale dist files**: Delete `dist-server/*.test.js` if compiled test files cause issues
- **Proxy not configured**: AI config tests handle this gracefully with early return

---

## PolicyChat System

### Backend Endpoint (`POST /api/ai/chat`)

Multi-turn conversation endpoint for policy-related questions:

```typescript
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
  usage: { input_tokens, output_tokens }
}
```

### Rate Limits
- Chat: 60 requests/hour per IP
- Extraction: 20 requests/hour
- OCR: 30 requests/hour

### Frontend Integration (`src/components/PolicyChat.tsx`)
- Builds policy context from uploaded policies
- Maintains conversation history for multi-turn context
- Calls `/api/ai/chat` endpoint
- Supports retry on failure

### System Prompt
Expert Turkish insurance assistant with knowledge of:
- Kasko, DASK, Trafik Sigortası terminology
- Coverage limits, deductibles, exclusions
- TRY currency formatting

---

## Performance Optimizations

### Bundle Analysis
```bash
npm run build:analyze  # Opens stats.html with bundle visualization
```
Uses `rollup-plugin-visualizer` with treemap view.

### Lazy Loading
All route components lazy-loaded in `App.tsx`:
```typescript
const Dashboard = lazy(() => import('./pages/Dashboard'))
const PolicyUpload = lazy(() => import('./pages/PolicyUpload'))
// etc.
```

### PWA & Service Worker
- Service worker: `public/sw.js`
- PWA utilities: `src/lib/pwa/index.ts`
- Initialized in production via `main.tsx`
- Caching strategies: cache-first (static), network-first (API), stale-while-revalidate (images)

### Resource Hints (`index.html`)
```html
<link rel="dns-prefetch" href="https://supabase.co">
<link rel="dns-prefetch" href="https://unpkg.com">
<link rel="dns-prefetch" href="https://cdn.jsdelivr.net">
```

### Lighthouse Targets (`lighthouserc.js`)
- FCP: < 2000ms
- LCP: < 2500ms
- CLS: < 0.1
- Performance score: > 0.8

---

## Server Hardening

### Graceful Shutdown (`server/index.ts`)
- Catches SIGTERM/SIGINT signals
- Stops accepting new connections
- Waits for in-flight requests (30s timeout)
- Closes database connections cleanly

### Request Timeouts
- Body parsing: 10MB limit
- Request timeout: 30 seconds
- Rate limiting on all AI endpoints

### Security Headers (Helmet)
- CSP configured for PDF.js CDN
- XSS protection
- Frame options
- Content sniffing protection

---

## API Endpoints

| Endpoint | Method | Purpose | Rate Limit |
|----------|--------|---------|------------|
| `/api/ai/extract/openai` | POST | Extract policy with GPT-4o | 20/hr |
| `/api/ai/extract/anthropic` | POST | Extract policy with Claude | 20/hr |
| `/api/ai/chat` | POST | Multi-turn policy chat | 60/hr |
| `/api/ai/ocr` | POST | Google Vision OCR | 30/hr |
| `/api/ai/providers` | GET | Check configured providers | - |
| `/api/ai/diagnose` | GET | Test API key validity | - |
| `/api/health` | GET | Server health check | 60/min |

---

## Known Issues & Solutions

### 1. Port 3001 Conflicts
- **Problem**: Port 3001 often in use
- **Solution**: Changed all ports to 4001
- **Files**: `server/index.ts`, `.env`, `vite.config.ts`

### 2. PDF.js Worker 404
- **Problem**: cdnjs.cloudflare.com doesn't have pdfjs-dist@5.4.530
- **Solution**: Use unpkg.com as primary CDN
- **File**: `src/lib/ai/pdf-parser.ts`

### 3. Silent Demo Fallback
- **Problem**: App showed fake demo data instead of real errors
- **Solution**: Set `useFallback: false` in PolicyUpload, fixed `isAIConfigured()`
- **Files**: `src/components/PolicyUpload.tsx`, `src/lib/ai/config.ts`

### 4. UUID Format for Supabase
- **Problem**: Custom IDs like `policy-123-abc` rejected by Supabase
- **Solution**: Use `crypto.randomUUID()`
- **File**: `src/lib/ai/policy-extractor.ts`

### 5. Guest User Display
- **Problem**: Showed "User" when not logged in
- **Solution**: Show "Guest" + "Not signed in", hide "My Account" for guests
- **File**: `src/components/GlobalNavigation.tsx`

### 6. Turkish Character Encoding
- **Problem**: İ, Ş, Ğ, Ü, Ö, Ç display issues
- **Solution**: Always use UTF-8, test with Turkish chars

### 7. Cached Supabase Sessions
- **Problem**: Old auth state persists
- **Solution**: `localStorage.clear(); location.reload();`

### 8. MyAccount Tests Failing
- **Problem**: `useAuth must be used within an AuthProvider`
- **Solution**: Mock `useAuth` in test file:
```typescript
vi.mock('@/lib/supabase/auth-context', () => ({
  useAuth: () => ({ user: { id: 'test', email: 'test@example.com' }, isLoading: false })
}))
```
- **File**: `src/components/MyAccount.test.tsx`

### 9. Sentry Tests Using Wrong Functions
- **Problem**: Tests calling `sentryErrorHandler()` which doesn't exist
- **Solution**: Use `setupSentryErrorHandler(app)` - takes Express app, not middleware
- **File**: `server/lib/sentry.test.ts`

### 10. Stale Compiled Test Files
- **Problem**: `dist-server/*.test.js` contains old test code causing failures
- **Solution**: `rm dist-server/lib/*.test.*`
- **Prevention**: Add `*.test.*` to `.gitignore` for dist directories

### 11. Anthropic SDK Browser Error
- **Problem**: SDK throws in browser-like test environments
- **Solution**: Wrap in try-catch, expect `browser-like environment` error message
- **File**: `src/lib/ai/config.test.ts`

---

## Gotchas & Critical Notes

1. **API Keys**: Never prefix with `VITE_` - they must stay server-side
2. **dotenv**: Server uses `.env` file (not `.env.local`)
3. **Ports**: Frontend=5173, Backend=4001 (not 3000/3001)
4. **PDF Worker**: Loaded from CDN, check CSP in `index.html`
5. **Supabase RLS**: Row Level Security enabled - policies are user-scoped
6. **Turkish Dates**: DD.MM.YYYY format, parse carefully
7. **Currency**: Use `tr-TR` locale, TRY symbol varies (₺ or TL)
8. **Tests Mock Everything**: Integration tests added to catch real config issues

---

## Turkish Market Considerations

### Mandatory Insurance Types
- **Trafik Sigortası** (MTPL): Required for all vehicles
- **DASK**: Required for all buildings (earthquake)
- **Professional Liability**: Required for certain professions (doctors, lawyers, etc.)

### Premium Calculation Factors
- Vehicle: Age, brand, engine size, driver age/experience
- Property: Location (earthquake zone), construction type, usage
- Health: Age, pre-existing conditions, coverage scope

### Common Policy Exclusions (Watch for these)
- War and terrorism (unless covered by pool)
- Nuclear events
- Intentional acts
- Wear and tear (depreciation)
- Pre-existing conditions (health)

### Important Dates
- Policy renewals: Usually 1 year
- DASK: Must be renewed before property transactions
- Traffic insurance: Must show valid policy for vehicle registration

### Currency Handling
```typescript
// Format TRY amounts correctly
new Intl.NumberFormat('tr-TR', {
  style: 'currency',
  currency: 'TRY',
  minimumFractionDigits: 2
}).format(amount)

// Common patterns
// Input: 15000.50
// Output: ₺15.000,50 or 15.000,50 TL
```

### Regional Considerations
- Istanbul (Marmara): Highest traffic accident rates, Zone 1 earthquake
- Coastal areas: Flood risk, tourism-related claims
- Eastern regions: Lower premiums, fewer providers

---

## Supabase Setup

### Tables
- `policies` - User policies with extracted data
- `policy_documents` - Uploaded PDF storage references

### Security (RLS)
```sql
-- Users can only access their own policies
CREATE POLICY "Users can view own policies"
ON policies FOR SELECT
USING (auth.uid() = user_id);
```

### Auth Providers
- Email/password (enabled)
- Google OAuth (configured)
- GitHub OAuth (configured)

---

## Deployment

### Local Development
```bash
npm install
cp .env.example .env  # Add your keys
npm run dev:all
```

### GitHub Codespaces
1. Open repo in Codespaces
2. `git checkout claude/build-app-from-design-GBWjx`
3. Create `.env` with API keys
4. `npm run dev:all`
5. Open port 5173 from Ports tab

### Production (Vercel/Netlify)
- Frontend deploys from `dist/`
- Backend needs separate hosting (Railway, Render)
- See `docs/DEPLOYMENT_GUIDE.md`

---

## Resources

- [SEDDK Regulations](https://www.seddk.gov.tr/)
- [TSB Statistics](https://www.tsb.org.tr/)
- [Turkish Insurance Law](https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5684.pdf)
- [Supabase Docs](https://supabase.com/docs)
- [OpenAI API](https://platform.openai.com/docs)

---

## Questions?

Personal project by Erdem. See this file and codebase for context.
