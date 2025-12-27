# CLAUDE.md

> Context file for Claude Code sessions on the insurai project

---

## Project Overview

**insurai** is an insurance policy analysis platform for Turkish market professionals. It processes PDF policies, extracts structured data, and benchmarks coverage against market standards.

**Current state**: Frontend-only with mock data. Building toward AI-powered document extraction.

**Owner**: Erdem (personal project)

---

## Architecture Decisions

### Why React + TypeScript + Vite

- Type safety for complex policy data structures
- Fast HMR for iterative UI development
- Vite over CRA for modern tooling

### Why Tailwind v4

- Design tokens defined in CSS, not config files
- Smaller bundle, faster builds
- Native cascade layers

### Component Philosophy

- **Composition over configuration** - Small, focused components
- **Colocation** - Keep related files together (component + styles + tests)
- **Progressive enhancement** - Works without JS where possible

### State Management

- **Local state first** - useState/useReducer for component state
- **URL state** - React Router for shareable state (filters, views)
- **Context** - Only for truly global concerns (theme, auth)
- **No Redux** - Complexity not justified for current scope

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

### Key Regulators

- **SEDDK** - Insurance regulator (like state insurance dept)
- **TSB** - Insurance association (industry body)
- **Hazine** - Treasury, oversees insurance sector

### Policy Structure (Turkish)

```
Poliçe (Policy)
├── Sigortalı (Insured) - Who is covered
├── Sigorta Ettiren (Policyholder) - Who pays
├── Riziko Adresi (Risk Address) - Location covered
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

```
components/PolicyCard.tsx      # PascalCase for components
lib/parse-policy.ts            # kebab-case for utilities
hooks/usePolicyUpload.ts       # camelCase with 'use' prefix
types/policy.ts                # lowercase for type files
```

### Component Structure

```tsx
// 1. Imports (external, then internal, then types)
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import type { Policy } from '@/types/policy';

// 2. Types (if component-specific)
interface PolicyCardProps {
  policy: Policy;
  onSelect?: (id: string) => void;
}

// 3. Component
export function PolicyCard({ policy, onSelect }: PolicyCardProps) {
  // hooks first
  const [expanded, setExpanded] = useState(false);
  
  // derived state
  const hasGaps = policy.gaps.length > 0;
  
  // handlers
  const handleClick = () => onSelect?.(policy.id);
  
  // render
  return (
    <div className="rounded-lg border p-4">
      {/* ... */}
    </div>
  );
}
```

### TypeScript Patterns

```typescript
// Prefer interfaces for objects
interface Policy {
  id: string;
  type: PolicyType;
  coverages: Coverage[];
}

// Use type for unions/primitives
type PolicyType = 'home' | 'auto' | 'life' | 'health' | 'business';

// Avoid enums - use const objects
const POLICY_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  PENDING: 'pending',
} as const;

type PolicyStatus = typeof POLICY_STATUS[keyof typeof POLICY_STATUS];
```

### Tailwind Conventions

```tsx
// Use semantic class grouping
<div className={cn(
  // Layout
  "flex flex-col gap-4",
  // Sizing
  "w-full max-w-2xl",
  // Appearance
  "rounded-lg border bg-white shadow-sm",
  // States
  "hover:shadow-md transition-shadow",
  // Conditional
  isActive && "border-primary-500"
)}>
```

---

## Common Tasks

### Adding a New Policy Type

1. Add type to `src/types/policy.ts`:
   ```typescript
   type PolicyType = '...' | 'new-type';
   ```

2. Create parser in `src/lib/parsers/new-type-policy.ts`

3. Add benchmark data in `src/data/benchmarks/new-type.ts`

4. Add sample policy in `src/data/sample-policies/new-type/`

5. Update UI components to handle new type

### Adding a New Dashboard Widget

1. Create component in `src/components/dashboard/`
2. Add to dashboard layout in `src/routes/Dashboard.tsx`
3. Connect to policy data via props or context

### Testing AI Extraction (Future)

```typescript
// Pattern for multi-provider AI calls
const result = await orchestrator.extract(document, {
  providers: ['openai', 'claude'],
  consensus: 'majority', // or 'all-agree'
  fallback: 'openai',
});
```

---

## AI Integration Plan

### Provider Priority

1. **OpenAI GPT-4** - Primary document understanding
2. **Claude 3.5 Sonnet** - Complex policy analysis, Turkish language
3. **Google Document AI** - OCR for scanned documents

### Extraction Pipeline

```
PDF Upload
    ↓
OCR (if scanned) → Google Document AI
    ↓
Text Extraction → pdf.js
    ↓
Field Extraction → GPT-4 / Claude
    ↓
Validation → Cross-check with second model
    ↓
Structured Output → PolicyData type
```

### Prompt Strategy

- Use Turkish-specific prompts for Turkish documents
- Include policy type context in system prompt
- Request JSON output matching TypeScript types
- Include confidence scores for extracted fields

---

## Testing Strategy

### Unit Tests

- Pure functions in `lib/` - parsers, calculators
- Custom hooks with `@testing-library/react-hooks`

### Component Tests

- Render tests with `@testing-library/react`
- User interaction flows
- Accessibility checks

### Integration Tests

- Full upload → extract → display flows
- Mock AI responses for deterministic tests

---

## Known Issues & Gotchas

1. **Turkish character encoding** - Always use UTF-8, test with İ, Ş, Ğ, Ü, Ö, Ç

2. **PDF parsing** - Some Turkish insurers use non-standard PDF structures

3. **Currency formatting** - Use `tr-TR` locale, TRY symbol placement varies

4. **Date formats** - Turkish uses DD.MM.YYYY, parse carefully

---

## Useful Commands

```bash
# Quick iteration
npm run dev

# Type checking (run before commits)
npm run typecheck

# Full validation
npm run lint && npm run typecheck && npm test

# Analyze bundle size
npm run build && npx vite-bundle-visualizer
```

---

## Resources

- [SEDDK Regulations](https://www.seddk.gov.tr/)
- [TSB Statistics](https://www.tsb.org.tr/)
- [Turkish Insurance Law](https://www.mevzuat.gov.tr/MevzuatMetin/1.5.5684.pdf)

---

## Questions?

Personal project by Erdem. See the codebase and this file for context.
