/**
 * Phase 3 — audit-judge-service tests.
 *
 * Mocks Anthropic SDK + Supabase + prompt-service + config-service +
 * admin-notification-service. Exercises:
 *   - typology hash failure (unparseable startDate)
 *   - cache hit short-circuit
 *   - cache miss → Anthropic call → persist
 *   - daily budget circuit breaker
 *   - quote verification (hallucinated quote → severity downgrade)
 *   - first-of-typology critical → notification
 *   - judge_critical_notify_first_only=false → notification on every critical
 *   - missing ANTHROPIC_API_KEY → null
 *   - missing prompt template → null
 *   - non-JSON LLM response → null
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const {
  mockLogWarn,
  mockLogError,
  mockLogInfo,
  mockLogDebug,
  mockFrom,
  mockAnthropicCreate,
  mockGetRenderedPrompt,
  mockGetAuditConfig,
  mockNotifyAuditQuality,
  mockCalculateCost,
} = vi.hoisted(() => ({
  mockLogWarn: vi.fn(),
  mockLogError: vi.fn(),
  mockLogInfo: vi.fn(),
  mockLogDebug: vi.fn(),
  mockFrom: vi.fn(),
  mockAnthropicCreate: vi.fn(),
  mockGetRenderedPrompt: vi.fn(),
  mockGetAuditConfig: vi.fn(),
  mockNotifyAuditQuality: vi.fn().mockResolvedValue(undefined),
  mockCalculateCost: vi.fn().mockReturnValue({ totalCost: 0.012 }),
}))

vi.mock('../../lib/logger.js', () => {
  const child = {
    debug: mockLogDebug,
    info: mockLogInfo,
    warn: mockLogWarn,
    error: mockLogError,
    child: vi.fn().mockReturnThis(),
  }
  return {
    default: { ...child, child: vi.fn(() => child) },
    logger: { ...child, child: vi.fn(() => child) },
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: mockFrom })),
}))

// Vitest v4: arrow function mocks can't be constructors. Use function()
// syntax (CLAUDE.md gotcha). The Anthropic SDK is invoked via `new Anthropic()`.
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(function () {
    return { messages: { create: mockAnthropicCreate } }
  }),
}))

vi.mock('../prompt-service.js', () => ({
  getRenderedPrompt: mockGetRenderedPrompt,
}))

vi.mock('../config-service.js', () => ({
  getAuditConfig: mockGetAuditConfig,
}))

vi.mock('../admin-notification-service.js', () => ({
  notifyAuditQuality: mockNotifyAuditQuality,
}))

vi.mock('../../middleware/cost-control.js', () => ({
  calculateCost: mockCalculateCost,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface ChainResult {
  data: unknown
  error: unknown
  count?: number
}

/**
 * Build a chainable Supabase query mock. The final `then` resolves to
 * `finalResult` which mirrors the shape returned by `.select(...).eq(...)`.
 *
 * `nthCallResults` lets a single test sequence multiple `from(...)` calls
 * (for cache lookup + budget count + insert).
 */
function queueFromCalls(...resultsForEachFromCall: ChainResult[]): void {
  let i = 0
  mockFrom.mockImplementation(() => {
    const result = resultsForEachFromCall[i] ?? { data: null, error: null }
    i++
    const chain: Record<string, unknown> = {}
    chain.select = vi.fn().mockReturnValue(chain)
    chain.insert = vi.fn().mockReturnValue(chain)
    chain.eq = vi.fn().mockReturnValue(chain)
    chain.gt = vi.fn().mockReturnValue(chain)
    chain.gte = vi.fn().mockReturnValue(chain)
    chain.neq = vi.fn().mockReturnValue(chain)
    chain.order = vi.fn().mockReturnValue(chain)
    chain.limit = vi.fn().mockReturnValue(chain)
    chain.then = (resolve: (v: unknown) => void) => resolve(result)
    return chain
  })
}

const DEFAULT_AUDIT_CONFIG = {
  judgeMaxRunsPerDay: 50,
  judgeModel: 'claude-sonnet-4-6',
  judgeCriticalNotifyFirstOnly: true,
}

const DEFAULT_RENDERED_PROMPT = {
  systemPrompt: 'judge system',
  userPrompt: 'judge user',
  templateId: '11111111-1111-1111-1111-111111111111',
  templateName: 'Audit Judge - Kasko',
  version: 1,
}

const VALID_RAW_TEXT =
  'Pert araç muafiyeti %35 — ek olarak Anlaşmalı olmayan servis durumunda %35 oranında tenzili muafiyet uygulanır.'

function buildLlmResponse(parsedJson: object): {
  content: { type: string; text: string }[]
  model: string
  usage: { input_tokens: number; output_tokens: number }
} {
  return {
    content: [{ type: 'text', text: '```json\n' + JSON.stringify(parsedJson) + '\n```' }],
    model: 'claude-sonnet-4-6',
    usage: { input_tokens: 1200, output_tokens: 240 },
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

const savedUrl = process.env.SUPABASE_URL
const savedKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const savedAnthropicKey = process.env.ANTHROPIC_API_KEY

beforeEach(() => {
  vi.clearAllMocks()
  mockGetAuditConfig.mockResolvedValue(DEFAULT_AUDIT_CONFIG)
  mockGetRenderedPrompt.mockResolvedValue(DEFAULT_RENDERED_PROMPT)
  // Re-set the resolved-promise default after vi.clearAllMocks() wipes it.
  mockNotifyAuditQuality.mockResolvedValue(undefined)
  process.env.SUPABASE_URL = 'http://test'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  process.env.ANTHROPIC_API_KEY = 'sk-test'
  process.env.NODE_ENV = 'test'
})

afterEach(() => {
  process.env.SUPABASE_URL = savedUrl
  process.env.SUPABASE_SERVICE_ROLE_KEY = savedKey
  process.env.ANTHROPIC_API_KEY = savedAnthropicKey
  vi.resetModules()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('runAuditJudge', () => {
  const STD_INPUT = {
    insuranceLine: 'kasko',
    country: 'TR',
    startDate: '01.01.2024',
    insurer: 'Anadolu Sigorta',
    rawText: VALID_RAW_TEXT,
    structuredExtraction: { policyNumber: 'P-1' },
    policyId: 'pol-1',
    fixtureId: null,
  }

  it('returns null when startDate is unparseable (typology hash undefined)', async () => {
    const { runAuditJudge } = await import('../audit-judge-service')
    const result = await runAuditJudge({ ...STD_INPUT, startDate: 'not-a-date' })
    expect(result).toBeNull()
    expect(mockAnthropicCreate).not.toHaveBeenCalled()
  })

  it('returns null when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY
    queueFromCalls(
      { data: [], error: null }, // cache lookup → empty
      { data: null, error: null, count: 0 } // budget check → 0
    )
    const { runAuditJudge } = await import('../audit-judge-service')
    const result = await runAuditJudge(STD_INPUT)
    expect(result).toBeNull()
  })

  it('returns null when prompt template is not found', async () => {
    mockGetRenderedPrompt.mockResolvedValueOnce(null)
    const { runAuditJudge } = await import('../audit-judge-service')
    const result = await runAuditJudge(STD_INPUT)
    expect(result).toBeNull()
    expect(mockAnthropicCreate).not.toHaveBeenCalled()
  })

  it('returns cacheHit:true when typology hash already has a row', async () => {
    queueFromCalls({
      data: [
        {
          id: 'existing-judgement',
          findings: [
            {
              kind: 'DUPLICATION',
              severity: 'warn',
              quote: 'q',
              message: 'm',
              quoteVerified: true,
            },
          ],
          critical_count: 0,
          cost_usd: 0.012,
        },
      ],
      error: null,
    })
    const { runAuditJudge } = await import('../audit-judge-service')
    const result = await runAuditJudge(STD_INPUT)
    expect(result).not.toBeNull()
    expect(result!.cacheHit).toBe(true)
    expect(result!.judgementId).toBe('existing-judgement')
    expect(mockAnthropicCreate).not.toHaveBeenCalled()
  })

  it('returns null when daily budget is exceeded', async () => {
    queueFromCalls(
      { data: [], error: null }, // cache lookup → empty
      { data: null, error: null, count: 50 } // budget check → at limit
    )
    const { runAuditJudge } = await import('../audit-judge-service')
    const result = await runAuditJudge(STD_INPUT)
    expect(result).toBeNull()
    expect(mockAnthropicCreate).not.toHaveBeenCalled()
  })

  it('runs the LLM, persists, and returns cacheHit:false on cache miss', async () => {
    mockAnthropicCreate.mockResolvedValueOnce(
      buildLlmResponse({
        summary: 'No issues found',
        findings: [],
      })
    )
    queueFromCalls(
      { data: [], error: null }, // cache lookup → empty
      { data: null, error: null, count: 0 }, // budget check
      { data: [{ id: 'new-judgement' }], error: null } // insert
    )
    const { runAuditJudge } = await import('../audit-judge-service')
    const result = await runAuditJudge(STD_INPUT)
    expect(result).not.toBeNull()
    expect(result!.cacheHit).toBe(false)
    expect(result!.findings).toEqual([])
    expect(result!.criticalCount).toBe(0)
    expect(mockAnthropicCreate).toHaveBeenCalledTimes(1)
  })

  it('downgrades severity when finding quote is not in raw text (hallucination guard)', async () => {
    mockAnthropicCreate.mockResolvedValueOnce(
      buildLlmResponse({
        summary: 'Found a hallucinated issue',
        findings: [
          {
            kind: 'FRAMING_INACCURACY',
            severity: 'critical',
            quote: 'this exact phrase does not appear in the raw text anywhere',
            message: 'hallucinated quote',
          },
        ],
      })
    )
    queueFromCalls(
      { data: [], error: null },
      { data: null, error: null, count: 0 },
      { data: [{ id: 'j-1' }], error: null }
    )
    const { runAuditJudge } = await import('../audit-judge-service')
    const result = await runAuditJudge(STD_INPUT)
    expect(result).not.toBeNull()
    expect(result!.findings).toHaveLength(1)
    expect(result!.findings[0].severity).toBe('warn')
    expect(result!.findings[0].quoteVerified).toBe(false)
    expect(result!.criticalCount).toBe(0)
  })

  it('preserves severity when finding quote IS in raw text', async () => {
    mockAnthropicCreate.mockResolvedValueOnce(
      buildLlmResponse({
        summary: 'Real finding',
        findings: [
          {
            kind: 'DUPLICATION',
            severity: 'critical',
            // Substring of VALID_RAW_TEXT
            quote: 'Pert araç muafiyeti %35',
            message: 'pert duplicated',
          },
        ],
      })
    )
    queueFromCalls(
      { data: [], error: null },
      { data: null, error: null, count: 0 },
      { data: [{ id: 'j-1' }], error: null },
      { data: null, error: null, count: 0 } // shouldNotifyCritical query
    )
    const { runAuditJudge } = await import('../audit-judge-service')
    const result = await runAuditJudge(STD_INPUT)
    expect(result).not.toBeNull()
    expect(result!.findings[0].severity).toBe('critical')
    expect(result!.findings[0].quoteVerified).toBe(true)
    expect(result!.criticalCount).toBe(1)
  })

  it('enqueues notifyAuditQuality on first-of-typology critical', async () => {
    mockAnthropicCreate.mockResolvedValueOnce(
      buildLlmResponse({
        summary: 'Critical finding',
        findings: [
          {
            kind: 'FRAMING_INACCURACY',
            severity: 'critical',
            quote: 'Pert araç muafiyeti %35',
            message: 'unlimited without qualifier',
          },
        ],
      })
    )
    queueFromCalls(
      { data: [], error: null },
      { data: null, error: null, count: 0 },
      { data: [{ id: 'j-1' }], error: null },
      { data: null, error: null, count: 0 } // shouldNotifyCritical → 0 prior rows = first
    )
    const { runAuditJudge } = await import('../audit-judge-service')
    await runAuditJudge(STD_INPUT)
    expect(mockNotifyAuditQuality).toHaveBeenCalledTimes(1)
  })

  it('does NOT enqueue notification when first_only=true and prior critical rows exist', async () => {
    mockAnthropicCreate.mockResolvedValueOnce(
      buildLlmResponse({
        summary: 'Repeat critical',
        findings: [
          {
            kind: 'FRAMING_INACCURACY',
            severity: 'critical',
            quote: 'Pert araç muafiyeti %35',
            message: 'second time',
          },
        ],
      })
    )
    queueFromCalls(
      { data: [], error: null },
      { data: null, error: null, count: 0 },
      { data: [{ id: 'j-2' }], error: null },
      { data: null, error: null, count: 1 } // shouldNotifyCritical → 1 prior row → skip
    )
    const { runAuditJudge } = await import('../audit-judge-service')
    await runAuditJudge(STD_INPUT)
    expect(mockNotifyAuditQuality).not.toHaveBeenCalled()
  })

  it('enqueues notification on EVERY critical when first_only=false', async () => {
    mockGetAuditConfig.mockResolvedValueOnce({
      ...DEFAULT_AUDIT_CONFIG,
      judgeCriticalNotifyFirstOnly: false,
    })
    mockAnthropicCreate.mockResolvedValueOnce(
      buildLlmResponse({
        summary: 'Critical',
        findings: [
          {
            kind: 'DUPLICATION',
            severity: 'critical',
            quote: 'Pert araç muafiyeti %35',
            message: 'dup',
          },
        ],
      })
    )
    queueFromCalls(
      { data: [], error: null },
      { data: null, error: null, count: 0 },
      { data: [{ id: 'j-3' }], error: null }
      // No 4th query — shouldNotifyCritical short-circuits when firstOnly=false
    )
    const { runAuditJudge } = await import('../audit-judge-service')
    await runAuditJudge(STD_INPUT)
    expect(mockNotifyAuditQuality).toHaveBeenCalledTimes(1)
  })

  it('returns null when LLM returns non-JSON content', async () => {
    mockAnthropicCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'I am sorry, I cannot help with that.' }],
      model: 'claude-sonnet-4-6',
      usage: { input_tokens: 10, output_tokens: 10 },
    })
    queueFromCalls({ data: [], error: null }, { data: null, error: null, count: 0 })
    const { runAuditJudge } = await import('../audit-judge-service')
    const result = await runAuditJudge(STD_INPUT)
    expect(result).toBeNull()
  })
})
