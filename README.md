# insurai

**Insurance policy analysis and benchmarking platform for Turkish market professionals**

A React/TypeScript application for uploading, analyzing, and comparing insurance policies with AI-powered document extraction.

---

## Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:5173
```

No environment variables required for the current frontend-only version.

---

## What This Is

insurai helps insurance professionals analyze policies by:

1. **Uploading policies** - Drag-and-drop PDF upload with batch processing
2. **Extracting data** - AI-powered extraction of coverage limits, deductibles, exclusions
3. **Benchmarking** - Compare coverage against market standards
4. **Identifying gaps** - Find under/over-insurance across policy portfolios

### Target Users

- Insurance professionals conducting portfolio reviews
- Corporate risk managers
- Brokers providing advisory services

### Supported Coverage Types

- Property & Business Interruption
- Auto (Kasko/Traffic)
- Life & Health
- Professional Liability, Cyber, D&O, Marine

---

## Current State

**Phase 1 (Current)**: Frontend-only with sample data

- ✅ UI/UX for policy upload and display
- ✅ Mock AI extraction and benchmarking
- ✅ 21 Turkish sample policies
- ✅ Interactive dashboard with Recharts

**Next**: AI integration (OpenAI, Claude, Gemini) for real document processing

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React 18 + TypeScript 5 |
| Styling | Tailwind CSS v4 |
| Animation | Framer Motion |
| Routing | React Router v7 |
| Charts | Recharts |
| Forms | React Hook Form + Zod |

---

## Project Structure

```
src/
├── components/
│   ├── ui/           # Base components (buttons, inputs, cards)
│   ├── dashboard/    # Dashboard widgets
│   ├── upload/       # Policy upload flow
│   └── analysis/     # Benchmarking views
├── lib/
│   ├── ai/           # AI provider integrations (future)
│   ├── parsers/      # Document parsing
│   └── benchmarking/ # Coverage comparison
├── hooks/            # Custom React hooks
├── types/            # TypeScript definitions
├── data/             # Sample policies and mock data
└── routes/           # Page components
```

---

## Key Files

| File | Purpose |
|------|---------|
| `src/types/policy.ts` | Core policy data structures |
| `src/lib/parsers/turkish-policy.ts` | Turkish document parser |
| `src/lib/benchmarking/coverage-analyzer.ts` | Coverage comparison engine |
| `src/data/sample-policies/` | Demo policy library |

---

## Scripts

```bash
npm run dev       # Start dev server
npm run build     # Production build
npm run preview   # Preview production build
npm run lint      # Run ESLint
npm run typecheck # TypeScript check
npm test          # Run tests
```

---

## Design Tokens

```css
/* Primary */
--color-primary: #2563eb;    /* blue-600 */
--color-secondary: #4f46e5;  /* indigo-600 */

/* Semantic */
--color-success: #10b981;
--color-warning: #f59e0b;
--color-danger: #ef4444;
```

**Typography**: Inter (UI), JetBrains Mono (data/code)

---

## Contributing

Personal project. See `CLAUDE.md` for development conventions when working with Claude Code.

---

© 2025 Erdem. All rights reserved.
