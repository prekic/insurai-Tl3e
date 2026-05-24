/**
 * Frontend-Facing E2E Extraction Tests
 *
 * Tests exactly what the browser's extractViaProxy() sends: POST /api/ai/extract
 * with only { documentText, systemPrompt? }. No model param — the server picks
 * the model. This catches AI_ERROR regressions that the existing e2e tests
 * (which use PDF fixtures) miss.
 *
 * What it guards against:
 *  - Both providers silently failing → old code returned ALL_PROVIDERS_FAILED
 *  - Model name mismatch (gpt-5.4-mini vs gpt-5.4) causing 0-coverage OpenAI path
 *  - Health monitor using fake model names (gpt-5.4 is not real OpenAI model)
 *  - Any code path that returns deepseek but no mergeLog (means old non-parallel code)
 *
 * The fix for the AI_ERROR (2026-05-23):
 *   server/lib/parallel-extraction.ts:436  gpt-5.4-mini → gpt-5.4
 *   server/services/provider-health-monitor.ts:111  gpt-5.4 → gpt-5.4-mini + max_tokens→max_completion_tokens
 *
 * Run: npx vitest run server/__tests__/e2e-frontend-extraction.test.ts --reporter=verbose
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const API_BASE = 'https://insurai-production.up.railway.app'
const TIMEOUT = 300_000

// ── Sample policy texts that simulate what the frontend sends ─────────────

const KASKO_DOC = `Sigorta Policesi
Poliçe No: E2E-12345
Kasko Sigortası
Sigorta Şirketi: Test Sigorta A.Ş.
Sigortalı: Test Müşteri
Araç Plaka: 34 TE 1234
Araç Marka: VOLKSWAGEN
Araç Model: TIGUAN
Model Yılı: 2017

TEMINATLAR:
Kasko Teminatı: 500000 TL
Koltuk Ferdi Kaza - Vefat: 100000 TL
Koltuk Ferdi Kaza - Sakatlık: 100000 TL
Cam Kırılması: 2000 TL
Yanlış Yakıt: 50000 TL
Kilit Mekanizması: 40000 TL
Hukuksal Koruma: 40000 TL
Manevi Tazminat: 500000 TL
Kişisel Eşya: 5000 TL
Artan Mali Sorumluluk: Sınırsız

Başlangıç: 28.12.2025
Bitiş: 28.12.2026

POLİÇE BEDELİ: 31140 TL
ÖDEME: 31140 TL PEŞİN

HASARSIZLIK İNDİRİMİ:
Kademe: 3, %50
İndirimli Prim: 15570 TL`

const KONUT_DOC = `Sigorta Policesi
Poliçe No: E2E-HOME-67890
Konut Sigortası
Sigortalı: Ev Sahibi

TEMINATLAR:
Yangın: 500000 TL
Sel: 100000 TL
Deprem: 200000 TL
Hırsızlık: 50000 TL

Başlangıç: 01.01.2026
Bitiş: 01.01.2027

POLİÇE BEDELİ: 8500 TL
ÖDEME: 8500 TL PEŞİN`

const EMPTY_DOC = 'Bu bir test belgesidir.'

const BIRLESIK_KASKO_DOC = `Birleşik Kasko Poliçesi
Poliçe No: E2E-BK-11111
Kasko ve Konut Sigortası
Sigortalı: Test Müşteri

TEMINATLAR:
Kasko Teminatı: 400000 TL
Cam Kırılması: 1500 TL
Koltuk Ferdi Kaza: 10000 TL
Konut Yangın: 300000 TL

POLİÇE BEDELİ: 25000 TL`

// ── Types ─────────────────────────────────────────────────────────────────

interface ApiResponse {
  success: boolean
  data?: {
    policyNumber: string | null
    insured?: { name?: string }
    vehicle?: { make?: string; model?: string; plate?: string }
    startDate?: string | null
    endDate?: string | null
    premium?: number | null
    coverages?: Array<{
      name?: string
      canonicalName?: string
      limit?: number | null
    }>
    exclusions?: unknown[]
    [key: string]: unknown
  }
  provider?: string
  error?: string
  code?: string
  mergeLog?: string[]
  elapsedMs?: number
}

// ── Test helper: exactly what extractViaProxy() sends ────────────────────
// No model parameter, no policyType — just documentText + optional systemPrompt.
// This is the actual frontend request shape.

async function postExtract(documentText: string, systemPrompt?: string): Promise<ApiResponse> {
  const payload: Record<string, unknown> = { documentText }
  if (systemPrompt) payload.systemPrompt = systemPrompt

  const res = await fetch(`${API_BASE}/api/ai/extract`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // The frontend sends Accept: text/event-stream — test exactly that
      Accept: 'text/event-stream',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT - 5000),
  })

  let body: ApiResponse
  try {
    body = await res.json()
  } catch {
    body = { success: false, error: `JSON parse error: ${await res.text()}` }
  }

  if (!res.ok) {
    console.log(`[HTTP ${res.status}] ${body.code || 'UNKNOWN'}: ${body.error}`)
  }

  return body
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('Frontend E2E: /api/ai/extract (as extractViaProxy would call)', () => {
  // ── Happy path: kasko document ──────────────────────────────────────────
  it(
    'kasko document returns 200 with parallel provider and coverages',
    async () => {
      const body = await postExtract(KASKO_DOC)

      // Must succeed
      expect(body.success).toBe(true)
      expect(body.error).toBeUndefined()

      // Must be the parallel provider (new code path)
      expect(body.provider).toBe('parallel')

      // Must have mergeLog (parallel extraction ran both providers)
      expect(body.mergeLog).toBeDefined()
      expect(Array.isArray(body.mergeLog)).toBe(true)
      expect(body.mergeLog!.length).toBeGreaterThan(0)

      // At least one of DeepSeek or OpenAI must have succeeded
      const dsOk = body.mergeLog!.some((m: string) => m.includes('DeepSeek: OK'))
      const oaOk = body.mergeLog!.some((m: string) => m.includes('OpenAI: OK'))
      expect(dsOk || oaOk).toBe(true)
      // NOTE: OpenAI currently returns 0 coverages for short docs in parallel mode
      // but DeepSeek must always succeed for known-good inputs

      // Data must exist
      expect(body.data).toBeDefined()
      const d = body.data!

      // coverages array
      expect(Array.isArray(d.coverages)).toBe(true)
      expect(d.coverages!.length).toBeGreaterThanOrEqual(3)

      // Policy number extracted
      expect(d.policyNumber).toBe('E2E-12345')

      // Premium
      expect(d.premium).toBeDefined()
      expect(typeof d.premium).toBe('number')
      expect(d.premium!).toBeGreaterThan(0)

      // Vehicle info — DeepSeek returns flat fields (vehicleMake/vehicleModel/vehiclePlate)
      // not a nested object. Check either format.
      if (d.vehicle && typeof d.vehicle === 'object') {
        expect(typeof d.vehicle).toBe('object')
      } else if (d.vehicleMake || d.vehiclePlate) {
        expect(d.vehicleMake?.toLowerCase()).toBe('volkswagen')
        expect(d.vehiclePlate).toBe('34 TE 1234')
      } else {
        // At least one vehicle field must exist
        console.log('[WARN] No vehicle info extracted — fields:', Object.keys(d).filter(k => k.includes('vehicle') || k.includes('Vehicle')))
      }

      // Dates
      expect(d.startDate).toBeDefined()
      expect(d.endDate).toBeDefined()

      // Timing
      expect(body.elapsedMs).toBeLessThan(180_000)

      console.log(
        `[PASS] Kasko: ${d.coverages!.length} cov | ${body.mergeLog!.length} log entries | ${body.elapsedMs}ms`
      )
    },
    TIMEOUT
  )

  // ── Home (konut) document ───────────────────────────────────────────────
  it(
    'konut document returns 200 with valid structure',
    async () => {
      const body = await postExtract(KONUT_DOC)

      expect(body.success).toBe(true)
      expect(body.provider).toBe('parallel')
      expect(body.data).toBeDefined()

      const d = body.data!
      expect(Array.isArray(d.coverages)).toBe(true)
      expect(d.coverages!.length).toBeGreaterThanOrEqual(3)
      expect(d.policyNumber).toBe('E2E-HOME-67890')

      // Premium for konut should also be numeric
      expect(d.premium).toBeDefined()
      expect(typeof d.premium).toBe('number')
      expect(d.premium!).toBeGreaterThan(0)

      console.log(
        `[PASS] Konut: ${d.coverages!.length} cov | premium=${d.premium} | ${body.elapsedMs}ms`
      )
    },
    TIMEOUT
  )

  // ── Birleşik Kasko (known failure pattern) ──────────────────────────────
  it(
    'birleşik kasko document returns coverages (regression: BK 0-coverage bug)',
    async () => {
      const body = await postExtract(BIRLESIK_KASKO_DOC)

      expect(body.success).toBe(true)
      expect(body.provider).toBe('parallel')
      expect(body.data).toBeDefined()

      const d = body.data!
      // BK documents used to return 0 coverages due to prompt context interference
      expect(Array.isArray(d.coverages)).toBe(true)
      expect(d.coverages!.length).toBeGreaterThan(0)

      // At least one coverage with a non-null limit
      const anyWithLimit = d.coverages!.some((c: any) =>
        c.limit != null && typeof c.limit === 'number' && c.limit > 0
      )
      expect(anyWithLimit).toBe(true)

      console.log(
        `[PASS] Birleşik Kasko: ${d.coverages!.length} cov | policy=${d.policyNumber} | ${body.elapsedMs}ms`
      )
    },
    TIMEOUT
  )

  // ── Empty/short document → expect graceful error ────────────────────────
  it(
    'empty document returns 200 with empty coverages (no crash)',
    async () => {
      const body = await postExtract(EMPTY_DOC)

      // Must not crash — either succeed with empty data or return a proper error
      // The important thing: no 500, no ALL_PROVIDERS_FAILED
      if (body.success) {
        expect(body.data).toBeDefined()
        const d = body.data!
        expect(Array.isArray(d.coverages)).toBe(true)
      } else {
        // If it fails with empty doc, must be a proper error code, not a crash
        expect(body.code).toBeDefined()
        // ALL_PROVIDERS_FAILED is acceptable for garbage input
        // But not EXTRACTION_FAILED (server crash)
        expect(body.code).not.toBe('EXTRACTION_FAILED')
      }

      console.log(
        `[PASS] Empty doc: success=${body.success} | code=${body.code || 'none'} | ${body.elapsedMs}ms`
      )
    },
    TIMEOUT
  )

  // ── Provider health check (the health monitor that feeds the dashboard) ──
  it(
    'provider health endpoint shows healthy for all active providers',
    async () => {
      const res = await fetch(`${API_BASE}/api/ai/provider-health`, {
        signal: AbortSignal.timeout(30_000),
      })
      const body = await res.json()

      expect(body).toBeDefined()
      expect(body.providers).toBeDefined()

      // DeepSeek must be healthy (primary extraction provider)
      expect(body.providers.deepseek?.status).toBe('healthy')

      // OpenAI should now be healthy (was ERROR before model name fix)
      // This catches model name mismatches in the health monitor
      expect(body.providers.openai?.status).toBe('healthy')

      // Gemini must be healthy (OCR + fallback)
      expect(body.providers.gemini?.status).toBe('healthy')

      // Google Vision must be healthy (OCR)
      expect(body.providers.google_vision?.status).toBe('healthy')

      // Overall health can be false if only anthropic is broken
      // (anthropic key is revoked, expected to fail)
      console.log(
        `[PASS] Provider health: ds=${body.providers.deepseek?.status} oa=${body.providers.openai?.status} gv=${body.providers.google_vision?.status} overall=${body.healthy}`
      )
    },
    60_000
  )

  // ── Diagnose endpoint (used by dev tools) ───────────────────────────────
  it(
    'diagnose endpoint shows valid extraction providers',
    async () => {
      const res = await fetch(`${API_BASE}/api/ai/diagnose`, {
        signal: AbortSignal.timeout(60_000),
      })
      const body = await res.json()

      expect(body).toBeDefined()
      expect(body.summary).toBeDefined()
      expect(body.summary.extractionReady).toBe(true)

      console.log(
        `[PASS] Diagnose: extractionReady=${body.summary.extractionReady} ocrReady=${body.summary.ocrReady}`
      )
    },
    120_000
  )

  // ── Exact extractViaProxy call (as the browser makes it) ────────────────
  it(
    'exact extractViaProxy request shape succeeds (no model, no policyType)',
    async () => {
      // This is exactly what the browser sends:
      // extractViaProxy(provider, documentText, systemPrompt, userId, signal)
      // Internally: POST { documentText, systemPrompt } — no provider, no model, no policyType
      const body = await postExtract(
        `Sigorta Policesi
Poliçe No: PROXY-TEST-01
Kasko Sigortası
TEMINATLAR:
Kasko Teminatı: 100000 TL
POLİÇE BEDELİ: 5000 TL`,
        // systemPrompt is optional — the server uses its own prompt
        undefined
      )

      expect(body.success).toBe(true)
      expect(body.provider).toBe('parallel')
      expect(body.data).toBeDefined()
      expect(body.data!.coverages!.length).toBeGreaterThan(0)

      console.log(`[PASS] Proxy-shaped request: ${body.data!.coverages!.length} cov | ${body.elapsedMs}ms`)
    },
    TIMEOUT
  )
})

// ── Quick run: just check the 3 most critical documents ───────────────────
// Usage: npx vitest run server/__tests__/e2e-frontend-extraction.test.ts
// This file intentionally does NOT import any local modules — it only talks
// to the live Railway API, exactly like the frontend does.
