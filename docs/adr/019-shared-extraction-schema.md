# ADR-019: Unified Extraction Schema via Shared Directory

## Status
Accepted

## Context
The `EXTRACTION_JSON_SCHEMA` — the JSON Schema definition that controls OpenAI structured output for insurance policy extraction — was maintained as two independent copies:

- **Client**: `src/lib/ai/extraction-schema.ts` (637 lines) — also exports TypeScript interfaces and the system prompt
- **Server**: `server/schemas/extraction-schema.ts` (387 lines) — exports only the JSON schema

This duplication existed because `server/tsconfig.json` set `rootDir: "."` (scoped to `server/`), which prevented TypeScript from importing files outside the server directory. The two copies used different nullable enum syntax (`type: ['string', 'null']` vs `anyOf`) and had minor description wording drift.

A cross-file parity test (`extraction-schema-parity.test.ts`, 10 tests) guarded against structural drift on property keys and required fields. However, it could not catch:
- Type representation divergence (enum format differences)
- Description wording drift
- Nested required field inconsistencies beyond coverage items

Any schema field addition required manual mirroring across both files, making it error-prone. The `validateStrictCompliance()` helper function was also byte-for-byte duplicated in both trees.

## Decision
We created a `shared/` directory at the project root as a single source of truth, containing:
- `shared/extraction-schema.ts` — canonical `EXTRACTION_JSON_SCHEMA`
- `shared/strict-mode-validator.ts` — canonical `validateStrictCompliance()`

To enable the server to import from `shared/`, we changed `server/tsconfig.json`:
- `rootDir: "."` → `rootDir: ".."`
- `include` expanded: `["./**/*.ts", "../shared/**/*.ts"]`

This shifts the compiled server output structure:
- **Before**: `dist-server/index.js`, `dist-server/routes/ai.js`
- **After**: `dist-server/server/index.js`, `dist-server/server/routes/ai.js`, `dist-server/shared/extraction-schema.js`

Client-side files (`src/lib/ai/extraction-schema.ts`, `src/lib/ai/strict-mode-validator.ts`) were refactored into thin re-export wrappers, preserving all existing import paths for the 15+ consumer files.

### Alternatives Considered
1. **Monorepo tooling (turborepo/nx)**: Too heavy for a single shared file. Would require restructuring the entire build pipeline.
2. **Build-time copy script**: Fragile — a pre-build step copying one schema to the other directory. Breaks if the script is skipped or fails silently.
3. **TypeScript project references**: Complex setup with separate `dist-shared/` output. Import resolution across composite projects with `NodeNext` module resolution is non-trivial.
4. **Plain JS shared file** (no TypeScript): Would work but loses `as const` type narrowing that consumers rely on.

## Consequences

### Positive
- **Single source of truth** — no more manual mirroring or drift risk
- **Parity test deleted** — redundant with single source; 10 tests removed, replaced by 12 shared schema validation tests
- **~550 lines of duplicated code eliminated**
- **Nullable enum format unified** — standardized on `type: ['string', 'null'], enum: [..., null]` (more concise)

### Negative / Risks
- **Server output path changed** — `dist-server/server/index.js` instead of `dist-server/index.js`. Required updates to:
  - `railway.json` startCommand
  - `nixpacks.toml` start cmd
  - `package.json` start:server and start:prod scripts
- **`__dirname` paths deeper by one level** — all `__dirname`-relative paths in server code needed an extra `..` traversal:
  - `server/index.ts` (static file serving): `path.join(__dirname, '..', 'dist')` → `path.join(__dirname, '..', '..', 'dist')`
  - `server/routes/ai.ts` (GCP credentials): similar depth adjustment
- **Future server `__dirname` usage** must account for the extra nesting — documented in CLAUDE.md gotcha #49 and SESSION_HANDOFF rule #14

### Testing
- 12 new shared schema tests (`shared/__tests__/extraction-schema.test.ts`)
- 16 moved server schema tests (from `server/schemas/` to `server/__tests__/`)
- 69 client schema tests (unchanged, re-export is transparent)
- 5 server route test files updated (mock paths)
- 6 pre-existing `/api/ai/diagnose` test timeouts fixed (missing global fetch stub)
- Zero type errors on both client and server tsconfigs
