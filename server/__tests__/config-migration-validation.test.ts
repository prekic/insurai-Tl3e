/**
 * Migration 033 Validation & New Config Getter Tests
 *
 * Two critical test suites:
 * 1. Validates that migration 033 SQL values match TypeScript defaults (drift detection)
 * 2. Tests the 6 new config getters added in the migration: FX, Server, Webhooks, Cost,
 *    plus Monitoring buffer keys and extended OCR keys
 *
 * These tests catch silent drift between SQL seeds and TypeScript DEFAULT_*_CONFIG objects.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { mockCreateClient, mockEq } = vi.hoisted(() => {
  const mockEq = vi.fn()
  const mockSelect = vi.fn().mockReturnValue({ eq: mockEq })
  const mockFrom = vi.fn().mockReturnValue({ select: mockSelect })
  const mockCreateClient = vi.fn().mockReturnValue({ from: mockFrom })
  return { mockCreateClient, mockEq }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: mockCreateClient,
}))

// Mock settings route to avoid import side effects
vi.mock('../routes/settings.js', () => ({
  recordServerConfigFetch: vi.fn(),
}))

// Mock logger
const childLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
  child: vi.fn().mockReturnThis(),
}
vi.mock('../lib/logger.js', () => ({
  logger: childLogger,
  default: childLogger,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function freshImport() {
  vi.resetModules()
  return import('../services/config-service.js')
}

/**
 * Set up mock to return DB settings for a category
 */
function mockCategorySettings(settings: Array<{ key: string; value: string }>) {
  mockEq.mockResolvedValue({
    data: settings,
    error: null,
  })
}

function mockCategoryEmpty() {
  mockEq.mockResolvedValue({
    data: [],
    error: null,
  })
}

function mockCategoryError() {
  mockEq.mockResolvedValue({
    data: null,
    error: { message: 'DB error' },
  })
}

// ---------------------------------------------------------------------------
// Suite 1: Migration 033 SQL Values Match TypeScript Defaults
// ---------------------------------------------------------------------------

describe('Migration 033 SQL values match TypeScript defaults', () => {
  let migrationSQL: string

  beforeAll(() => {
    const sqlPath = join(__dirname, '../../supabase/migrations/033_seed_hardcoded_configs.sql')
    migrationSQL = readFileSync(sqlPath, 'utf-8')
  })

  /**
   * Parse INSERT VALUES from the SQL migration file.
   * Returns map of `category.key` → `value` for all seeded rows.
   */
  function parseMigrationValues(): Map<string, string> {
    const result = new Map<string, string>()
    // Match INSERT lines: ('category', 'key', 'value', ...
    // Handle both single-line and multi-line values (like token_pricing JSON)
    const insertPattern = /\('(\w+)',\s*'([^']+)',\s*'((?:[^']|'')*(?:\{[\s\S]*?\})?(?:[^']|'')*)'/g
    let match
    while ((match = insertPattern.exec(migrationSQL)) !== null) {
      const category = match[1]
      const key = match[2]
      const value = match[3]
      result.set(`${category}.${key}`, value)
    }
    return result
  }

  it('contains all expected AI timeout keys', () => {
    const values = parseMigrationValues()
    expect(values.has('ai.request_budget_ms')).toBe(true)
    expect(values.has('ai.primary_provider_timeout_ms')).toBe(true)
    expect(values.has('ai.fallback_provider_timeout_ms')).toBe(true)
    expect(values.has('ai.client_fetch_timeout_ms')).toBe(true)
    expect(values.has('ai.trial_extraction_timeout_ms')).toBe(true)
  })

  it('AI timeout values match TypeScript defaults', () => {
    // Bumped Apr 27 2026 in response to Run #5 finding (Allianz extraction
    // hit ALL_PROVIDERS_FAILED at the previous 65 s / 55 s ceilings). See
    // migration 045 for the corresponding UPDATE applied to existing
    // production deployments.
    const values = parseMigrationValues()
    expect(values.get('ai.request_budget_ms')).toBe('175000')
    expect(values.get('ai.primary_provider_timeout_ms')).toBe('90000')
    expect(values.get('ai.fallback_provider_timeout_ms')).toBe('75000')
    expect(values.get('ai.client_fetch_timeout_ms')).toBe('185000')
    expect(values.get('ai.trial_extraction_timeout_ms')).toBe('200000')
  })

  it('contains all expected FX keys', () => {
    const values = parseMigrationValues()
    expect(values.has('fx.server_cache_ttl_ms')).toBe(true)
    expect(values.has('fx.supported_currencies')).toBe(true)
    expect(values.has('fx.fallback_rates')).toBe(true)
    expect(values.has('fx.api_timeout_ms')).toBe(true)
    expect(values.has('fx.client_cache_ttl_ms')).toBe(true)
  })

  it('FX numeric values match TypeScript defaults', () => {
    const values = parseMigrationValues()
    expect(values.get('fx.server_cache_ttl_ms')).toBe('21600000')
    expect(values.get('fx.api_timeout_ms')).toBe('10000')
    expect(values.get('fx.client_cache_ttl_ms')).toBe('14400000')
  })

  it('FX supported_currencies SQL value is valid JSON array', () => {
    const values = parseMigrationValues()
    const raw = values.get('fx.supported_currencies')
    expect(raw).toBeDefined()
    const parsed = JSON.parse(raw!)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toContain('TRY')
    expect(parsed).toContain('USD')
    expect(parsed).toContain('EUR')
  })

  it('FX fallback_rates SQL value is valid JSON object with expected keys', () => {
    const values = parseMigrationValues()
    const raw = values.get('fx.fallback_rates')
    expect(raw).toBeDefined()
    const parsed = JSON.parse(raw!)
    expect(typeof parsed).toBe('object')
    expect(parsed).toHaveProperty('TRYUSD')
    expect(parsed).toHaveProperty('TRYEUR')
    expect(parsed).toHaveProperty('TRYGBP')
  })

  it('contains all expected server keys', () => {
    const values = parseMigrationValues()
    expect(values.has('server.db_query_timeout_ms')).toBe(true)
    expect(values.has('server.config_cache_ttl_ms')).toBe(true)
    expect(values.has('server.prompt_cache_ttl_ms')).toBe(true)
    expect(values.has('server.translation_cache_ttl_ms')).toBe(true)
    expect(values.has('server.rate_limit_config_cache_ttl_ms')).toBe(true)
  })

  it('server values match TypeScript defaults', () => {
    const values = parseMigrationValues()
    expect(values.get('server.db_query_timeout_ms')).toBe('8000')
    expect(values.get('server.config_cache_ttl_ms')).toBe('300000')
    expect(values.get('server.prompt_cache_ttl_ms')).toBe('300000')
    expect(values.get('server.translation_cache_ttl_ms')).toBe('300000')
    expect(values.get('server.rate_limit_config_cache_ttl_ms')).toBe('60000')
  })

  it('contains all expected webhooks keys', () => {
    const values = parseMigrationValues()
    expect(values.has('webhooks.max_delivery_attempts')).toBe(true)
    expect(values.has('webhooks.delivery_timeout_ms')).toBe(true)
    expect(values.has('webhooks.max_response_body_length')).toBe(true)
  })

  it('webhooks values match TypeScript defaults', () => {
    const values = parseMigrationValues()
    expect(values.get('webhooks.max_delivery_attempts')).toBe('3')
    expect(values.get('webhooks.delivery_timeout_ms')).toBe('10000')
    expect(values.get('webhooks.max_response_body_length')).toBe('1000')
  })

  it('contains all expected OCR pipeline keys', () => {
    const values = parseMigrationValues()
    expect(values.has('ocr.pdf_load_timeout_ms')).toBe(true)
    expect(values.has('ocr.max_worker_failures')).toBe(true)
    expect(values.has('ocr.ocr_cleanup_timeout_ms')).toBe(true)
  })

  it('OCR pipeline values match TypeScript defaults', () => {
    const values = parseMigrationValues()
    expect(values.get('ocr.pdf_load_timeout_ms')).toBe('30000')
    expect(values.get('ocr.max_worker_failures')).toBe('2')
    expect(values.get('ocr.ocr_cleanup_timeout_ms')).toBe('30000')
  })

  it('contains cost.token_pricing as valid JSON', () => {
    const values = parseMigrationValues()
    expect(values.has('cost.token_pricing')).toBe(true)
    const raw = values.get('cost.token_pricing')
    expect(raw).toBeDefined()
    // The SQL value contains the JSON blob — parse it
    // Trim any whitespace from multi-line SQL
    const cleaned = raw!.replace(/\n\s*/g, '')
    const parsed = JSON.parse(cleaned)
    expect(parsed).toHaveProperty('gpt-4o')
    expect(parsed).toHaveProperty('claude-opus-4-20250514')
    expect(parsed).toHaveProperty('default')
  })

  it('contains ui.trial_expiry_ms matching TypeScript default', () => {
    const values = parseMigrationValues()
    expect(values.get('ui.trial_expiry_ms')).toBe('86400000')
  })

  it('contains all expected monitoring buffer keys', () => {
    const values = parseMigrationValues()
    expect(values.has('monitoring.extraction_buffer_size')).toBe(true)
    expect(values.has('monitoring.max_metrics_buffer_size')).toBe(true)
    expect(values.has('monitoring.max_alert_history')).toBe(true)
    expect(values.has('monitoring.max_response_times')).toBe(true)
    expect(values.has('monitoring.server_perf_max_events')).toBe(true)
    expect(values.has('monitoring.server_perf_max_age_ms')).toBe(true)
  })

  it('monitoring buffer values match TypeScript defaults', () => {
    const values = parseMigrationValues()
    expect(values.get('monitoring.extraction_buffer_size')).toBe('200')
    expect(values.get('monitoring.max_metrics_buffer_size')).toBe('10000')
    expect(values.get('monitoring.max_alert_history')).toBe('1000')
    expect(values.get('monitoring.max_response_times')).toBe('1000')
    expect(values.get('monitoring.server_perf_max_events')).toBe('500')
    expect(values.get('monitoring.server_perf_max_age_ms')).toBe('3600000')
  })

  it('uses ON CONFLICT DO NOTHING for idempotent seeding', () => {
    const conflictCount = (migrationSQL.match(/ON CONFLICT.*DO NOTHING/gi) || []).length
    // Migration has 8 INSERT blocks, each with ON CONFLICT
    expect(conflictCount).toBeGreaterThanOrEqual(8)
  })

  it('seeds the correct total number of config keys', () => {
    const values = parseMigrationValues()
    // ai: 5, fx: 5, server: 5, webhooks: 3, ocr: 3, cost: 1, ui: 1, monitoring: 6 = 29
    expect(values.size).toBe(29)
  })
})

// ---------------------------------------------------------------------------
// Suite 2: New Config Getter Functions
// ---------------------------------------------------------------------------

describe('getFXConfig()', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns defaults when DB returns empty', async () => {
    mockCategoryEmpty()
    const mod = await freshImport()
    const config = await mod.getFXConfig()

    expect(config.serverCacheTtlMs).toBe(21600000)
    expect(config.apiTimeoutMs).toBe(10000)
    expect(config.supportedCurrencies).toContain('TRY')
    expect(config.supportedCurrencies).toContain('USD')
    expect(config.fallbackRates).toHaveProperty('TRY')
  })

  it('returns defaults when DB errors', async () => {
    mockCategoryError()
    const mod = await freshImport()
    const config = await mod.getFXConfig()

    expect(config.serverCacheTtlMs).toBe(21600000)
    expect(config.apiTimeoutMs).toBe(10000)
  })

  it('merges DB overrides over defaults', async () => {
    mockCategorySettings([
      { key: 'server_cache_ttl_ms', value: '3600000' },
      { key: 'api_timeout_ms', value: '5000' },
    ])
    const mod = await freshImport()
    const config = await mod.getFXConfig()

    expect(config.serverCacheTtlMs).toBe(3600000)
    expect(config.apiTimeoutMs).toBe(5000)
    // Non-overridden fields keep defaults
    expect(config.supportedCurrencies).toContain('TRY')
  })

  it('parses JSON string for supported_currencies', async () => {
    mockCategorySettings([{ key: 'supported_currencies', value: '["TRY","USD","EUR"]' }])
    const mod = await freshImport()
    const config = await mod.getFXConfig()

    expect(config.supportedCurrencies).toEqual(['TRY', 'USD', 'EUR'])
  })

  it('parses JSON string for fallback_rates', async () => {
    mockCategorySettings([{ key: 'fallback_rates', value: '{"TRYUSD":0.03,"TRYEUR":0.028}' }])
    const mod = await freshImport()
    const config = await mod.getFXConfig()

    expect(config.fallbackRates).toEqual({ TRYUSD: 0.03, TRYEUR: 0.028 })
  })

  it('keeps defaults on invalid JSON for supported_currencies', async () => {
    mockCategorySettings([{ key: 'supported_currencies', value: 'not-json' }])
    const mod = await freshImport()
    const config = await mod.getFXConfig()

    // Should keep default array
    expect(Array.isArray(config.supportedCurrencies)).toBe(true)
    expect(config.supportedCurrencies.length).toBeGreaterThan(0)
  })

  it('uses already-parsed object when value is not a string', async () => {
    mockCategorySettings([
      { key: 'supported_currencies', value: ['TRY', 'GBP'] as unknown as string },
    ])
    const mod = await freshImport()
    const config = await mod.getFXConfig()

    expect(config.supportedCurrencies).toEqual(['TRY', 'GBP'])
  })

  it('returns cached result on second call', async () => {
    mockCategorySettings([{ key: 'api_timeout_ms', value: '5000' }])
    const mod = await freshImport()

    const config1 = await mod.getFXConfig()
    // Change mock for second call — should be ignored due to cache
    mockCategorySettings([{ key: 'api_timeout_ms', value: '9999' }])
    const config2 = await mod.getFXConfig()

    expect(config1.apiTimeoutMs).toBe(5000)
    expect(config2.apiTimeoutMs).toBe(5000)
  })
})

describe('getServerConfig()', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns defaults when DB is empty', async () => {
    mockCategoryEmpty()
    const mod = await freshImport()
    const config = await mod.getServerConfig()

    expect(config.dbQueryTimeoutMs).toBe(8000)
    expect(config.configCacheTtlMs).toBe(300000)
    expect(config.promptCacheTtlMs).toBe(300000)
    expect(config.translationCacheTtlMs).toBe(300000)
    expect(config.rateLimitConfigCacheTtlMs).toBe(60000)
  })

  it('merges DB overrides over defaults', async () => {
    mockCategorySettings([
      { key: 'db_query_timeout_ms', value: '10000' },
      { key: 'config_cache_ttl_ms', value: '600000' },
    ])
    const mod = await freshImport()
    const config = await mod.getServerConfig()

    expect(config.dbQueryTimeoutMs).toBe(10000)
    expect(config.configCacheTtlMs).toBe(600000)
    // Non-overridden
    expect(config.promptCacheTtlMs).toBe(300000)
  })

  it('converts string values to numbers', async () => {
    mockCategorySettings([{ key: 'rate_limit_config_cache_ttl_ms', value: '120000' }])
    const mod = await freshImport()
    const config = await mod.getServerConfig()

    expect(config.rateLimitConfigCacheTtlMs).toBe(120000)
    expect(typeof config.rateLimitConfigCacheTtlMs).toBe('number')
  })

  it('returns defaults on DB error', async () => {
    mockCategoryError()
    const mod = await freshImport()
    const config = await mod.getServerConfig()

    expect(config.dbQueryTimeoutMs).toBe(8000)
  })
})

describe('getWebhooksConfig()', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns defaults when DB is empty', async () => {
    mockCategoryEmpty()
    const mod = await freshImport()
    const config = await mod.getWebhooksConfig()

    expect(config.maxDeliveryAttempts).toBe(3)
    expect(config.deliveryTimeoutMs).toBe(10000)
    expect(config.maxResponseBodyLength).toBe(1000)
  })

  it('merges DB overrides', async () => {
    mockCategorySettings([
      { key: 'max_delivery_attempts', value: '5' },
      { key: 'delivery_timeout_ms', value: '15000' },
    ])
    const mod = await freshImport()
    const config = await mod.getWebhooksConfig()

    expect(config.maxDeliveryAttempts).toBe(5)
    expect(config.deliveryTimeoutMs).toBe(15000)
    expect(config.maxResponseBodyLength).toBe(1000) // default
  })

  it('returns defaults on DB error', async () => {
    mockCategoryError()
    const mod = await freshImport()
    const config = await mod.getWebhooksConfig()

    expect(config.maxDeliveryAttempts).toBe(3)
  })

  it('caches results on second call', async () => {
    mockCategorySettings([{ key: 'max_delivery_attempts', value: '7' }])
    const mod = await freshImport()

    const first = await mod.getWebhooksConfig()
    mockCategorySettings([{ key: 'max_delivery_attempts', value: '99' }])
    const second = await mod.getWebhooksConfig()

    expect(first.maxDeliveryAttempts).toBe(7)
    expect(second.maxDeliveryAttempts).toBe(7) // cached
  })
})

describe('getCostConfig()', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns defaults when DB is empty', async () => {
    mockCategoryEmpty()
    const mod = await freshImport()
    const config = await mod.getCostConfig()

    expect(config.tokenPricing).toHaveProperty('gpt-4o')
    expect(config.tokenPricing['gpt-4o']).toHaveProperty('input')
    expect(config.tokenPricing['gpt-4o']).toHaveProperty('output')
  })

  it('parses JSON string for token_pricing', async () => {
    const pricing = { 'gpt-4o': 0.005, default: 0.001 }
    mockCategorySettings([{ key: 'token_pricing', value: JSON.stringify(pricing) }])
    const mod = await freshImport()
    const config = await mod.getCostConfig()

    expect(config.tokenPricing).toEqual(pricing)
  })

  it('uses already-parsed object when value is not string', async () => {
    const pricing = { 'gpt-4o': { input: 0.003, output: 0.012 } }
    mockCategorySettings([{ key: 'token_pricing', value: pricing as unknown as string }])
    const mod = await freshImport()
    const config = await mod.getCostConfig()

    expect(config.tokenPricing).toEqual(pricing)
  })

  it('keeps defaults on invalid JSON', async () => {
    mockCategorySettings([{ key: 'token_pricing', value: 'not-valid-json{' }])
    const mod = await freshImport()
    const config = await mod.getCostConfig()

    // Should keep default pricing
    expect(config.tokenPricing).toHaveProperty('gpt-4o')
  })

  it('returns defaults on DB error', async () => {
    mockCategoryError()
    const mod = await freshImport()
    const config = await mod.getCostConfig()

    expect(config.tokenPricing).toHaveProperty('default')
  })
})

describe('getMonitoringConfig() — buffer keys from migration 033', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns default buffer sizes when DB is empty', async () => {
    mockCategoryEmpty()
    const mod = await freshImport()
    const config = await mod.getMonitoringConfig()

    expect(config.extractionBufferSize).toBe(200)
    expect(config.maxMetricsBufferSize).toBe(10000)
    expect(config.maxAlertHistory).toBe(1000)
    expect(config.maxResponseTimes).toBe(1000)
    expect(config.serverPerfMaxEvents).toBe(500)
    expect(config.serverPerfMaxAgeMs).toBe(3600000)
  })

  it('merges buffer key overrides from DB', async () => {
    mockCategorySettings([
      { key: 'extraction_buffer_size', value: '500' },
      { key: 'max_metrics_buffer_size', value: '20000' },
      { key: 'server_perf_max_events', value: '1000' },
    ])
    const mod = await freshImport()
    const config = await mod.getMonitoringConfig()

    expect(config.extractionBufferSize).toBe(500)
    expect(config.maxMetricsBufferSize).toBe(20000)
    expect(config.serverPerfMaxEvents).toBe(1000)
    // Non-overridden keep defaults
    expect(config.maxAlertHistory).toBe(1000)
    expect(config.maxResponseTimes).toBe(1000)
    expect(config.serverPerfMaxAgeMs).toBe(3600000)
  })

  it('also merges alert threshold keys from MONITORING_KEY_MAP', async () => {
    mockCategorySettings([
      { key: 'error_rate_warning_threshold', value: '0.10' },
      { key: 'extraction_buffer_size', value: '300' },
    ])
    const mod = await freshImport()
    const config = await mod.getMonitoringConfig()

    expect(config.errorRateWarningThreshold).toBe(0.1)
    expect(config.extractionBufferSize).toBe(300)
  })

  it('handles enableEmailAlerts boolean coercion', async () => {
    mockCategorySettings([{ key: 'enable_email_alerts', value: 'true' }])
    const mod = await freshImport()
    const config = await mod.getMonitoringConfig()

    expect(config.enableEmailAlerts).toBe(true)
  })

  it('handles alertEmailAddresses as string', async () => {
    mockCategorySettings([{ key: 'alert_email_addresses', value: 'admin@test.com,ops@test.com' }])
    const mod = await freshImport()
    const config = await mod.getMonitoringConfig()

    expect(config.alertEmailAddresses).toBe('admin@test.com,ops@test.com')
  })
})

describe('getRetentionConfig()', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('returns defaults when DB is empty', async () => {
    mockCategoryEmpty()
    const mod = await freshImport()
    const config = await mod.getRetentionConfig()

    expect(config.processingLogRetentionDays).toBe(90)
    expect(config.extractionMetricsRetentionDays).toBe(30)
  })

  it('merges DB overrides', async () => {
    mockCategorySettings([{ key: 'processing_log_retention_days', value: '60' }])
    const mod = await freshImport()
    const config = await mod.getRetentionConfig()

    expect(config.processingLogRetentionDays).toBe(60)
    expect(config.extractionMetricsRetentionDays).toBe(30) // default
  })
})

describe('invalidateCache() with new config categories', () => {
  const originalEnv = { ...process.env }

  beforeEach(() => {
    vi.clearAllMocks()
    process.env.SUPABASE_URL = 'https://test.supabase.co'
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('invalidating fx category causes re-fetch', async () => {
    mockCategorySettings([{ key: 'api_timeout_ms', value: '5000' }])
    const mod = await freshImport()

    const first = await mod.getFXConfig()
    expect(first.apiTimeoutMs).toBe(5000)

    // Invalidate ALL caches (config:fx AND category:fx) and change mock
    mod.invalidateCache()
    mockCategorySettings([{ key: 'api_timeout_ms', value: '8000' }])
    const second = await mod.getFXConfig()
    expect(second.apiTimeoutMs).toBe(8000)
  })

  it('invalidating all categories clears FX, Server, Webhooks, Cost caches', async () => {
    mockCategoryEmpty()
    const mod = await freshImport()

    // Populate caches
    await mod.getFXConfig()
    await mod.getServerConfig()
    await mod.getWebhooksConfig()
    await mod.getCostConfig()

    // Change mock values
    mockCategorySettings([{ key: 'max_delivery_attempts', value: '10' }])

    // Without invalidation, cached values would be returned
    const beforeInvalidate = await mod.getWebhooksConfig()
    expect(beforeInvalidate.maxDeliveryAttempts).toBe(3) // cached default

    // After full invalidation, re-fetches from DB
    mod.invalidateCache()
    const afterInvalidate = await mod.getWebhooksConfig()
    expect(afterInvalidate.maxDeliveryAttempts).toBe(10)
  })
})

describe('configService barrel export includes new getters', () => {
  it('exports all 9 config getters plus utility functions', async () => {
    const mod = await freshImport()
    const svc = mod.configService

    expect(typeof svc.getAIConfig).toBe('function')
    expect(typeof svc.getRateLimitsConfig).toBe('function')
    expect(typeof svc.getOCRConfig).toBe('function')
    expect(typeof svc.getMonitoringConfig).toBe('function')
    expect(typeof svc.getRetentionConfig).toBe('function')
    expect(typeof svc.getFXConfig).toBe('function')
    expect(typeof svc.getServerConfig).toBe('function')
    expect(typeof svc.getWebhooksConfig).toBe('function')
    expect(typeof svc.getCostConfig).toBe('function')
    expect(typeof svc.isFeatureEnabled).toBe('function')
    expect(typeof svc.invalidateCache).toBe('function')
  })
})
