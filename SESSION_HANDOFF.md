# Session Handoff — March 12, 2026 (Hardcoded Config → Admin-Configurable DB)

## Current Status

| Metric | Status |
|--------|--------|
| **Build** | ✅ Passing (typecheck clean, 0 errors) |
| **ESLint** | 0 errors |
| **Tests** | 49 new migration tests passing, 0 failures |
| **Branch** | `claude/load-project-context-LofLp` — 4 commits, pushed |

---

## This Session — New Features & Fixes

### 1. Migration 033: Hardcoded Backend Configs → app_settings

**Problem**: 29 critical backend constants (extraction timeouts, FX cache TTLs, token pricing, service cache durations, monitoring buffer sizes) were hardcoded across `server/routes/ai.ts`, `server/routes/fx.ts`, `server/middleware/*.ts`, `server/services/*.ts`, and client-side `src/lib/` files. Changing any value required a code change and redeployment.

**Fix** (commit `26c7524`):
- Created `supabase/migrations/033_seed_hardcoded_configs.sql` — seeds 29 keys across 8 categories with `ON CONFLICT DO NOTHING`
- Extended `server/services/config-service.ts` with 6 new typed getters: `getFXConfig()`, `getServerConfig()`, `getWebhooksConfig()`, `getCostConfig()`, extended `getMonitoringConfig()`, `getRetentionConfig()`
- All 30 consumer files updated to read from config service instead of constants
- Created `GenericSettingsPanel.tsx` — reusable admin UI panel for any config category
- Added new tabs in Admin Settings: FX, Server, Webhooks, Cost, Monitoring buffers

### 2. Test Mock Updates for AIConfig Extension

**Problem**: Adding 5 timeout fields to `AIConfig` interface broke 6 existing test files that mocked `getAIConfig()` without the new fields.

**Fix** (commit `2e61dfc`):
- Updated mocks in `ai-routes-extended`, `ai-ocr-coverage`, `ai-chat-ocr-diagnose-logs`, `ai-extraction-routes-branches`, `routes-branches`, `cost-control`, `webhook-service` test files
- Added `default: childLogger` to cost-control logger mock

### 3. Migration Validation Test Suite

**Problem**: No automated verification that migration SQL values match TypeScript defaults (drift detection), and no tests for the 6 new config getters.

**Fix** (commit `314f744`):
- Created `server/__tests__/config-migration-validation.test.ts` (716 lines, 49 tests)
- Suite 1: Parses migration SQL, validates all 29 seeded values match `DEFAULT_*_CONFIG` objects
- Suite 2: Tests all 6 new getters with DB data, empty DB fallback, error fallback, JSON parsing, boolean coercion
- Suite 3: Cache invalidation with new categories, barrel export completeness

### Commits (oldest → newest)

| Commit | Type | Summary |
|--------|------|---------|
| `26c7524` | feat(config) | migrate hardcoded backend configs to admin-configurable app_settings |
| `2e61dfc` | fix(tests) | update test mocks for hardcoded config migration |
| `314f744` | test(config) | add migration 033 validation and new config getter tests (49 tests) |
| `93c0007` | docs | update CLAUDE.md and SESSION_HANDOFF.md for config migration session |

### Key Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/033_seed_hardcoded_configs.sql` | **NEW** Seeds 29 config keys across 8 categories |
| `server/services/config-service.ts` | **EXTENDED** 6 new typed getters with DEFAULT_*_CONFIG and *_KEY_MAP |
| `server/__tests__/config-migration-validation.test.ts` | **NEW** 49 tests: SQL↔TS drift detection + getter coverage |
| `src/components/admin/tabs/settings/GenericSettingsPanel.tsx` | **NEW** Reusable admin settings panel for any category |
| `src/components/admin/tabs/SettingsTab.tsx` | **EXTENDED** 5 new category tabs (FX, Server, Webhooks, Cost, Monitoring) |
| `src/lib/config/types.ts` | **EXTENDED** FXConfig, ServerConfig, WebhooksConfig, CostConfig interfaces |
| `src/lib/config/configuration-service.ts` | **EXTENDED** Client-side mirrors for all new config types |
| `server/routes/ai.ts` | Extraction timeouts from getAIConfig() |
| `server/routes/fx.ts` | FX cache/currencies from getFXConfig() |
| `server/middleware/cost-control.ts` | Token pricing from getCostConfig() |
| `server/middleware/rate-limit.ts` | Config cache TTL from getServerConfig() |
| `server/middleware/monitoring.ts` | Buffer sizes from getMonitoringConfig() |
| `server/services/webhook-service.ts` | Delivery config from getWebhooksConfig() |
| `server/services/prompt-service.ts` | Cache TTL from getServerConfig() |
| `server/services/translation-service.ts` | Cache TTL from getServerConfig() |
| `src/lib/ai/config.ts` | Client fetch timeout from config |
| `src/lib/ai/pdf-parser.ts` | PDF load timeout, worker failures from config |
| `src/lib/free-trial.ts` | Trial expiry from config |
| `src/components/TryAnalysis.tsx` | Umbrella timeout from config |
| `server/routes/settings.ts` | **EXTENDED** Lazy-loads monitoring config for perf buffer limits; Zod schema reformatting |
| `src/components/admin/tabs/settings/AISettingsPanel.tsx` | **EXTENDED** 5 new timeout keys added to SETTING_GROUPS.timeouts |
| `src/components/admin/tabs/settings/OCRSettingsPanel.tsx` | Minor reformatting |
| `src/lib/admin/settings-validation.ts` | **EXTENDED** Validation rules for all 29 new config keys (ranges, ms bounds) |
| `server/__tests__/ai-chat-ocr-diagnose-logs.test.ts` | Mock updated: +5 AIConfig timeout fields |
| `server/__tests__/ai-extraction-routes-branches.test.ts` | Mock updated: +5 AIConfig timeout fields |
| `server/__tests__/ai-ocr-coverage.test.ts` | Mock updated: +5 AIConfig timeout fields, restructured |
| `server/__tests__/ai-routes-extended.test.ts` | Mock updated: +5 AIConfig timeout fields |
| `server/__tests__/cost-control.test.ts` | Mock updated: +`default: childLogger` for logger |
| `server/__tests__/routes-branches.test.ts` | Mock updated: +5 AIConfig timeout fields, restructured |
| `server/__tests__/webhook-service.test.ts` | Formatting fixes (indentation, line wrapping) |

---

## ⚠️ Gotchas for Next Session

1. **Migration 033 not yet applied to production**: Must be run via Supabase SQL Editor before admin-configurable values take effect. Until then, code uses hardcoded defaults (no behavioral change).
2. **Cache invalidation subtlety**: `invalidateCache('fx')` does NOT clear `category:fx` cache used by `getCategorySettings()`. Use `invalidateCache()` (no argument) to fully clear all caches when testing config changes.
3. **JSON config fields**: `supported_currencies`, `fallback_rates`, and `token_pricing` are stored as JSON strings. If an admin enters malformed JSON via the UI, the getter silently falls back to the hardcoded default. No error is surfaced to the admin.
4. **Boolean coercion**: `enableEmailAlerts` in monitoring config uses strict `=== 'true'` comparison. Values like `'1'`, `'yes'`, `'TRUE'` (uppercase) are all treated as `false`.
5. **AIConfig test mock requirement**: All AI route test files must include the 5 new timeout fields in their `getAIConfig()` mock. Omitting them causes test failures.
6. **10 pre-existing failures in `ai-routes-extended.test.ts`**: These are `/api/ai/diagnose` timeout failures — NOT caused by this migration and not requested to be fixed.
7. **Lazy-load config at module scope in `settings.ts`**: `server/routes/settings.ts` uses a module-level `_loadPerfConfig()` fire-and-forget async call to read monitoring buffer sizes from DB. If config-service is not yet initialized when settings.ts loads, this silently falls back to defaults. This is intentional — the config refreshes on next call.
8. **Validation rules added for all 29 keys**: `src/lib/admin/settings-validation.ts` now has explicit `validators.milliseconds()` and `validators.positiveInteger()` bounds for every new config key. When adding more config keys in the future, add matching validation rules here too.
9. **AISettingsPanel SETTING_GROUPS**: The 5 new timeout keys were added to the `timeouts` group in `AISettingsPanel.tsx`. If new AI-category keys are added to migration 033, they must also be added to the appropriate `SETTING_GROUPS` object for them to appear in the admin UI.

---

## Configuration Requirements

### Environment Variables (No New Ones)
This migration adds zero new environment variables. All 29 config keys have hardcoded defaults that match previous behavior exactly.

### Database Migration Required
```bash
# Apply in Supabase SQL Editor (idempotent — safe to re-run):
supabase/migrations/033_seed_hardcoded_configs.sql
```

---

## Priority Next Steps

1. **Apply Migration 033** — Run SQL in Supabase SQL Editor. Verify via `/admin/settings` that new categories (FX, Server, Webhooks, Cost) appear with correct defaults.
2. **Production Smoke Test** — After applying migration, change one value (e.g., `fx.server_cache_ttl_ms` from 21600000 to 10800000), trigger an FX rate fetch, and verify the new TTL is used.
3. **JSON Validation for Admin UI** — `GenericSettingsPanel.tsx` accepts freeform text for JSON fields. Consider adding JSON syntax validation before save to prevent malformed values.
4. **Merge & Deploy** — Branch `claude/load-project-context-LofLp` is ready to merge after migration verification.
