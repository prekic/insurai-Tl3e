# Dependency Upgrade Plan

**Created**: 2026-02-07
**Current State**: All builds passing, 6122+ tests green

## Upgrade Tiers

Upgrades are organized by risk level. Each tier should be completed and tested before moving to the next.

---

### Tier 1: Safe Minor/Patch Upgrades (Low Risk) — COMPLETED Feb 8, 2026

These stay within their major version and should be drop-in replacements.

| Package | Before | After | Notes |
|---------|--------|-------|-------|
| `@anthropic-ai/sdk` | 0.71.2 | 0.74.0 | Pre-1.0, no breaking changes |
| `@playwright/test` | 1.58.1 | 1.58.2 | Patch |
| `@supabase/supabase-js` | 2.94.1 | 2.95.3 | Minor |
| `dotenv` | 17.2.3 | 17.2.4 | Patch |
| `openai` | 6.17.0 | 6.18.0 | Minor |
| `typescript` | 5.6.3 | 5.9.3 | Minor - 2 type fixes needed (Uint8Array) |

**TypeScript 5.9 Fixes Required**:
- `pdf-splitter.ts`: `Uint8Array<ArrayBufferLike>` not assignable to `BlobPart` → copy to new `ArrayBuffer`
- `pwa/index.ts`: Return `Uint8Array<ArrayBuffer>` from `urlBase64ToUint8Array` for `applicationServerKey`

**Result**: All 6,338 tests pass. 0 lint errors. Both builds clean.

---

### Tier 2: Major Framework Upgrades (Medium Risk)

These require migration steps but have well-documented upgrade paths.

#### Express 4 → 5
| Package | Current | Target |
|---------|---------|--------|
| `express` | 4.22.1 | 5.2.1 |
| `express-rate-limit` | 7.5.1 | 8.2.1 |

**Key Changes**:
- `req.query` returns `unknown` instead of `any` (already handled via `qstr()`)
- `res.send(status)` removed - use `res.sendStatus(status)`
- Path route matching stricter
- Async error handling built-in (no more `express-async-errors`)
- `app.del()` removed (use `app.delete()`)

**Steps**:
1. Read Express 5 migration guide
2. `npm install express@5 express-rate-limit@8`
3. Update `@types/express` if needed
4. Fix any breaking changes in route handlers
5. Run all server tests: `npx vitest run server/__tests__/`

#### Vite 6 → 7
| Package | Current | Target |
|---------|---------|--------|
| `vite` | 6.4.1 | 7.3.1 |
| `@vitejs/plugin-react` | 4.7.0 | 5.1.3 |

**Key Changes**:
- Check vite.config.ts for deprecated options
- Plugin API changes may affect `@vitejs/plugin-react`

**Steps**:
1. Read Vite 7 migration guide
2. `npm install vite@7 @vitejs/plugin-react@5`
3. Run `npm run build` and fix config issues
4. Test dev server: `npm run dev`
5. Run full test suite

---

### Tier 3: Major UI/Testing Upgrades (Higher Risk)

These have larger API surface changes and need careful testing.

#### React 18 → 19
| Package | Current | Target |
|---------|---------|--------|
| `react` | 18.3.1 | 19.2.4 |
| `react-dom` | 18.3.1 | 19.2.4 |
| `@types/react` | 18.3.28 | 19.2.13 |
| `@types/react-dom` | 18.3.7 | 19.2.3 |

**Key Changes**:
- `forwardRef` no longer needed (ref is a regular prop)
- `useContext` → `use(Context)` (optional migration)
- `<Context.Provider>` → `<Context>` (optional)
- Ref cleanup functions supported
- Actions (useActionState, useFormStatus, useOptimistic)
- Server Components support (not applicable for this SPA)

**Steps**:
1. Read React 19 upgrade guide and run codemods
2. `npm install react@19 react-dom@19 @types/react@19 @types/react-dom@19`
3. Fix type errors (ref types changed significantly)
4. Update test utilities if needed
5. Run full test suite - expect some test updates needed
6. Test all major user flows manually

#### Vitest 2 → 4
| Package | Current | Target |
|---------|---------|--------|
| `vitest` | 2.1.9 | 4.0.18 |
| `@vitest/coverage-v8` | 2.1.9 | 4.0.18 |

**Key Changes**:
- Check for config file format changes
- Some assertion API changes possible
- Coverage reporter changes

**Steps**:
1. Read Vitest 4 migration guide
2. `npm install vitest@4 @vitest/coverage-v8@4`
3. Update vitest.config.ts if needed
4. Run all tests and fix failures

---

### Tier 4: UI Library Upgrades (Optional)

Lower priority - upgrade when convenient.

| Package | Current | Target | Risk |
|---------|---------|--------|------|
| `framer-motion` | 11.18.2 | 12.33.0 | Medium - API changes |
| `recharts` | 2.15.4 | 3.7.0 | Medium - chart API changes |
| `lucide-react` | 0.468.0 | 0.563.0 | Low - icon additions |
| `sonner` | 1.7.4 | 2.0.7 | Medium - toast API changes |
| `tailwind-merge` | 2.6.1 | 3.4.0 | Low-Medium |

---

### Tier 5: Tooling Upgrades (Optional)

| Package | Current | Target | Risk |
|---------|---------|--------|------|
| `eslint` | 9.39.2 | 10.0.0 | Medium - config format |
| `@eslint/js` | 9.39.2 | 10.0.1 | Medium |
| `eslint-plugin-react-hooks` | 5.2.0 | 7.0.1 | Medium |
| `globals` | 15.15.0 | 17.3.0 | Low |
| `jsdom` | 25.0.1 | 28.0.0 | Low - test environment |

---

## Recommended Order

1. **Tier 1** first - safe patches, build confidence
2. **Express 5** - well-documented, our `qstr()` pattern already handles key change
3. **Vite 7** - build tool, easy to test
4. **React 19** - largest impact, needs most testing time
5. **Vitest 4** - test framework, do after React to avoid conflating failures
6. Tiers 4-5 as time permits

## Pre-Upgrade Checklist

Before each tier:
- [ ] All tests passing (`npm run validate`)
- [ ] Clean git state (no uncommitted changes)
- [ ] Create a dedicated branch for the upgrade
- [ ] Read the migration guide for each package
- [ ] Back up `package-lock.json`

After each tier:
- [ ] `npm run validate` passes
- [ ] Manual smoke test of key user flows
- [ ] Check bundle size hasn't regressed: `npm run build:analyze`
