# CLAUDE.md

> Context file for Claude Code sessions on the insurai project

---

## Project Overview

**insurai** is an insurance policy analysis platform for Turkish market professionals. Upload PDF policies, extract structured data with AI, and benchmark coverage against market standards.

- **Owner**: Erdem (personal project)
- **Current State**: Full-stack with AI extraction working via backend proxy
- **Production Readiness**: ~8.2/10 (test coverage 80%+, monitoring configured)

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
| `src/components/GlobalNavigation.tsx` | Main nav with auth state |
| `server/index.ts` | Backend API server (port 4001) |
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

### Frontend-Backend Communication

```
Browser (5173)  →  Vite Proxy  →  Express (4001)  →  AI APIs
                                        ↓
                                   Supabase
```

- Frontend calls `/api/*` endpoints
- Vite proxies to Express backend
- Backend holds API keys, makes AI calls
- Supabase handles auth and data persistence

### AI Extraction Flow

```
PDF Upload → pdf.js (text extraction)
           → Check if scanned (low text density)
           → If scanned: Google Vision OCR
           → OpenAI/Claude extraction
           → Zod schema validation
           → Store in Supabase
```

### Authentication Flow

```
User → Supabase Auth → Session stored in localStorage
     → AuthContext provides user state
     → Protected routes check auth
     → Backend validates JWT for API calls
```

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

### Key Regulators

- **SEDDK** - Insurance regulator (like state insurance dept)
- **TSB** - Insurance association (industry body)
- **Hazine** - Treasury, oversees insurance sector

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
- `src/lib/ai/policy-extractor.test.ts` - AI extraction
- `src/__tests__/integration/dependencies.test.ts` - CDN checks
- `src/__tests__/integration/environment-validation.test.ts` - Config checks

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

---

## Gotchas & Critical Notes

1. **API Keys**: Never prefix with `VITE_` - they must stay server-side
2. **dotenv**: Server uses `.env` file (not `.env.local`)
3. **Ports**: Frontend=5173, Backend=4001 (not 3000/3001)
4. **PDF Worker**: Loaded from CDN, check CSP in `index.html`
5. **Supabase RLS**: Row Level Security enabled - policies are user-scoped
6. **Turkish Dates**: DD.MM.YYYY format, parse carefully
7. **Currency**: Use `tr-TR` locale, TRY symbol varies
8. **Tests Mock Everything**: Integration tests added to catch real config issues

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
