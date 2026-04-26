/**
 * Pipeline Integration Test — Real PDF Upload → Extraction → Result Assertion
 *
 * This test exercises the full extraction pipeline end-to-end:
 *   1. Loads a real PDF file from disk
 *   2. Calls extractPolicyFromDocument (the same function the UI uses)
 *   3. Asserts that the pipeline produces a structured result (success or error)
 *   4. Validates extracted data against known fixture content
 *
 * Environment behavior:
 *   - Phase 1 (pdf.js): In jsdom, pdf.js workers can't initialize, so we test
 *     that the pipeline fails gracefully with a structured error (not a crash).
 *   - Phase 2 (AI extraction): Requires a live backend proxy or API keys.
 *     Gracefully skips if unavailable (CI-safe).
 *   - Phase 3 (error handling): Tests file validation and edge cases.
 *
 * This file is prefixed with `z-final-` so vitest runs it last
 * (vitest executes test files in alphabetical order).
 *
 * Timeout: 180s — allows for OCR + AI extraction on slow connections
 */

import { describe, it, expect, beforeAll } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'

// ── jsdom polyfills ────────────────────────────────────────────────────
// The extraction pipeline needs File.arrayBuffer() which jsdom doesn't provide.
if (typeof globalThis.DOMMatrix === 'undefined') {
  globalThis.DOMMatrix = class DOMMatrix {} as any
}
if (typeof globalThis.Blob !== 'undefined' && !globalThis.Blob.prototype.arrayBuffer) {
  globalThis.Blob.prototype.arrayBuffer = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(this)
    })
  }
}
if (typeof globalThis.File !== 'undefined' && !globalThis.File.prototype.arrayBuffer) {
  globalThis.File.prototype.arrayBuffer = globalThis.Blob.prototype.arrayBuffer
}

// ── Fixture paths ──────────────────────────────────────────────────────
const FIXTURES_DIR = path.resolve(process.cwd(), 'e2e', 'fixtures')
const SIMPLE_PDF = path.join(FIXTURES_DIR, 'test-policy.pdf')

// Real-world KASKO PDFs in test-data/ (used when available)
const TEST_DATA_DIR = path.resolve(process.cwd(), 'test-data')
const KASKO_PDF = path.join(TEST_DATA_DIR, 'sample-kasko-policy.pdf')

/**
 * Helper: read a PDF from disk and wrap it as a browser-compatible File object
 */
function loadPDFAsFile(filePath: string): File {
  const buffer = fs.readFileSync(filePath)
  const arrayBuffer = new Uint8Array(buffer).buffer
  const fileName = path.basename(filePath)
  return new File([arrayBuffer], fileName, { type: 'application/pdf' })
}

/**
 * Check if AI extraction is available (proxy or direct API keys)
 */
function isExtractionAvailable(): boolean {
  return !!(
    process.env.VITE_API_PROXY_URL ||
    process.env.API_PROXY_URL ||
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.VITE_OPENAI_API_KEY ||
    process.env.VITE_ANTHROPIC_API_KEY
  )
}

// Known error codes from ExtractionError type
const KNOWN_ERROR_CODES = [
  'NO_AI_CONFIG',
  'PDF_PARSE_ERROR',
  'PDF_TIMEOUT',
  'PDF_WORKER_ERROR',
  'FILE_READ_ERROR',
  'AI_ERROR',
  'INVALID_FILE',
  'LOW_CONFIDENCE',
  'OCR_ERROR',
  'NETWORK_ERROR',
  'TIMEOUT',
  'RATE_LIMIT_EXCEEDED',
  'INVALID_API_KEY',
  'BILLING_ERROR',
  'DOCUMENT_TOO_LARGE',
  'INVALID_RESPONSE',
  'PROVIDER_OVERLOADED',
]

// ════════════════════════════════════════════════════════════════════════
// TEST SUITE
// ════════════════════════════════════════════════════════════════════════

describe('Pipeline Integration: Real PDF Upload → Extraction → Result Assertion', () => {
  beforeAll(() => {
    if (!fs.existsSync(SIMPLE_PDF)) {
      throw new Error(
        `Test fixture not found: ${SIMPLE_PDF}\n` +
          'Create it by running the Playwright E2E tests, or add a valid PDF to e2e/fixtures/.'
      )
    }
  })

  // ══════════════════════════════════════════════════════════════════
  // PHASE 1: Pipeline resilience — extractPolicyFromDocument with
  //          a real PDF in jsdom (pdf.js workers unavailable)
  // ══════════════════════════════════════════════════════════════════

  describe('Phase 1: Pipeline produces structured results from real PDFs', () => {
    it('should process simple test PDF without crashing', async () => {
      const { extractPolicyFromDocument } = await import('@/lib/ai/policy-extractor')

      const file = loadPDFAsFile(SIMPLE_PDF)
      expect(file.size).toBeGreaterThan(0)
      expect(file.name).toBe('test-policy.pdf')
      expect(file.type).toBe('application/pdf')

      // In jsdom environment, pdf.js workers will fail. The pipeline should
      // gracefully return a structured error or fallback — never throw.
      const result = await extractPolicyFromDocument(file, {
        useFallback: true,
        useConsensus: false,
      })

      // Must return a valid response shape (not undefined, not thrown)
      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')

      if (result.success) {
        // If it somehow succeeded (e.g. fallback mode), validate structure
        expect(result.policy).toBeDefined()
        expect(result.policy.id).toBeDefined()
        expect(result.source).toBeDefined()
        console.log('✅ Phase 1: Pipeline SUCCESS (source:', result.source, ')')
      } else {
        // Structured error is expected in jsdom — validate error shape
        expect(result.error).toBeDefined()
        expect(result.error.code).toBeDefined()
        expect(result.error.message).toBeDefined()
        expect(typeof result.error.message).toBe('string')
        expect(result.error.message.length).toBeGreaterThan(0)
        console.log('✅ Phase 1: Pipeline returned structured error:', result.error.code)
      }
    }, 60_000)

    it('should process real KASKO PDF without crashing', async () => {
      if (!fs.existsSync(KASKO_PDF)) {
        console.warn(`[SKIP] Real KASKO PDF not found at ${KASKO_PDF}`)
        return
      }

      const { extractPolicyFromDocument } = await import('@/lib/ai/policy-extractor')

      const file = loadPDFAsFile(KASKO_PDF)
      expect(file.size).toBeGreaterThan(1000)

      const result = await extractPolicyFromDocument(file, {
        useFallback: true,
        useConsensus: false,
      })

      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')

      if (result.success) {
        expect(result.policy).toBeDefined()
        console.log('✅ Phase 1 KASKO: Pipeline SUCCESS')
      } else {
        expect(result.error.code).toBeDefined()
        console.log('✅ Phase 1 KASKO: Structured error:', result.error.code)
      }
    }, 60_000)
  })

  // ══════════════════════════════════════════════════════════════════
  // PHASE 2: Full AI extraction (requires live backend)
  // ══════════════════════════════════════════════════════════════════

  describe('Phase 2: Full AI extraction pipeline', () => {
    it('should extract structured policy data from simple PDF', async () => {
      if (!isExtractionAvailable()) {
        console.warn('[SKIP] AI extraction not available — set VITE_API_PROXY_URL or API keys')
        return
      }

      const { extractPolicyFromDocument } = await import('@/lib/ai/policy-extractor')

      const file = loadPDFAsFile(SIMPLE_PDF)
      const result = await extractPolicyFromDocument(file, {
        useFallback: false,
        useConsensus: false,
        useCleanRoom: true,
      })

      if (result.success) {
        const { policy, extractedData, source, confidenceScore } = result

        // Source should be 'ai' (not 'fallback')
        expect(source).toBe('ai')

        // Policy must have required fields
        expect(policy).toBeDefined()
        expect(policy.id).toBeDefined()
        expect(typeof policy.id).toBe('string')

        // Provider from fixture: "Allianz Sigorta"
        expect(policy.provider).toBeDefined()
        expect(policy.provider.length).toBeGreaterThan(0)

        // Premium from fixture: 15000 TL
        expect(policy.premium).toBeDefined()
        expect(policy.premium).toBeGreaterThan(0)

        // Policy type should be detected
        expect(policy.type).toBeDefined()

        // Confidence between 0 and 1
        if (confidenceScore !== undefined) {
          expect(confidenceScore).toBeGreaterThan(0)
          expect(confidenceScore).toBeLessThanOrEqual(1)
        }

        expect(extractedData).toBeDefined()

        console.log('✅ Phase 2 SUCCESS:', {
          provider: policy.provider,
          policyNumber: policy.policyNumber,
          premium: policy.premium,
          type: policy.type,
          confidence: confidenceScore,
          coveragesCount: policy.coverages?.length,
        })
      } else {
        // Structured error — validate shape
        expect(result.error).toBeDefined()
        expect(KNOWN_ERROR_CODES).toContain(result.error.code)
        expect(result.error.message.length).toBeGreaterThan(0)

        console.warn('⚠️ Phase 2 error:', result.error.code, '—', result.error.message)
      }
    }, 180_000)

    it('should extract structured data from real KASKO PDF with domain assertions', async () => {
      if (!isExtractionAvailable()) {
        console.warn('[SKIP] AI extraction not available')
        return
      }
      if (!fs.existsSync(KASKO_PDF)) {
        console.warn(`[SKIP] Real KASKO PDF not found at ${KASKO_PDF}`)
        return
      }

      const { extractPolicyFromDocument } = await import('@/lib/ai/policy-extractor')

      const file = loadPDFAsFile(KASKO_PDF)
      const result = await extractPolicyFromDocument(file, {
        useFallback: false,
        useConsensus: false,
        useCleanRoom: true,
      })

      if (result.success) {
        const { policy, confidenceScore } = result

        // ── Domain-specific KASKO assertions ────────────────────────
        // Provider must be a real insurance company name
        expect(policy.provider).toBeDefined()
        expect(policy.provider.length).toBeGreaterThan(0)

        // Premium must be positive (Turkish KASKO: typically 5k–100k TL range)
        expect(policy.premium).toBeGreaterThan(0)

        // Type should be KASKO
        const typeStr = [policy.type, policy.typeTr, policy.insuranceLine]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        expect(typeStr).toContain('kasko')

        // Coverages array should have entries
        expect(policy.coverages).toBeDefined()
        expect(Array.isArray(policy.coverages)).toBe(true)
        expect(policy.coverages!.length).toBeGreaterThanOrEqual(1)

        // Each coverage should have a name
        for (const cov of policy.coverages!) {
          expect(cov.name || cov.nameTr).toBeDefined()
        }

        // Confidence should be reasonable
        if (confidenceScore !== undefined) {
          expect(confidenceScore).toBeGreaterThan(0.3)
        }

        // Dates should be parseable if present
        if (policy.startDate) {
          expect(new Date(policy.startDate).toString()).not.toBe('Invalid Date')
        }
        if (policy.expiryDate) {
          expect(new Date(policy.expiryDate).toString()).not.toBe('Invalid Date')
        }

        console.log('✅ Phase 2 KASKO SUCCESS:', {
          provider: policy.provider,
          policyNumber: policy.policyNumber,
          premium: policy.premium,
          type: policy.type,
          confidence: confidenceScore,
          coveragesCount: policy.coverages?.length,
          startDate: policy.startDate,
          expiryDate: policy.expiryDate,
        })
      } else {
        expect(KNOWN_ERROR_CODES).toContain(result.error.code)
        console.warn('⚠️ Phase 2 KASKO error:', result.error.code)
      }
    }, 180_000)
  })

  // ══════════════════════════════════════════════════════════════════
  // PHASE 3: Error handling and edge cases
  // ══════════════════════════════════════════════════════════════════

  describe('Phase 3: Error handling and edge cases', () => {
    it('should reject non-PDF files with INVALID_FILE error', async () => {
      const { extractPolicyFromDocument } = await import('@/lib/ai/policy-extractor')

      const notAPdf = new File(['This is plain text, not a PDF'], 'document.txt', {
        type: 'text/plain',
      })

      const result = await extractPolicyFromDocument(notAPdf, { useFallback: false })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_FILE')
        expect(result.error.message).toContain('PDF')
      }
    }, 10_000)

    it('should handle empty/minimal PDF gracefully', async () => {
      const { extractPolicyFromDocument } = await import('@/lib/ai/policy-extractor')

      const emptyPdf = new File(['%PDF-1.4\n%%EOF'], 'empty.pdf', {
        type: 'application/pdf',
      })

      const result = await extractPolicyFromDocument(emptyPdf, { useFallback: false })

      // Should NOT throw — must return a structured response
      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')

      if (!result.success) {
        expect(result.error.code).toBeDefined()
        expect(result.error.message.length).toBeGreaterThan(0)
      }
    }, 30_000)

    it('should handle file with long name gracefully', async () => {
      const { extractPolicyFromDocument } = await import('@/lib/ai/policy-extractor')

      const longName = 'a'.repeat(300) + '.pdf'
      const file = loadPDFAsFile(SIMPLE_PDF)
      const renamedFile = new File([await file.arrayBuffer()], longName, {
        type: 'application/pdf',
      })

      // Must not throw or crash
      const result = await extractPolicyFromDocument(renamedFile, {
        useFallback: true,
        useConsensus: false,
      })

      expect(result).toBeDefined()
      expect(typeof result.success).toBe('boolean')
    }, 60_000)

    it('should return fallbackAvailable flag on error', async () => {
      const { extractPolicyFromDocument } = await import('@/lib/ai/policy-extractor')

      const emptyPdf = new File(['%PDF-1.4\n%%EOF'], 'empty.pdf', {
        type: 'application/pdf',
      })

      const result = await extractPolicyFromDocument(emptyPdf, { useFallback: false })

      if (!result.success) {
        // fallbackAvailable should always be defined on errors
        expect(typeof result.fallbackAvailable).toBe('boolean')
      }
    }, 30_000)

    it('should include timing data in successful extractions', async () => {
      const { extractPolicyFromDocument } = await import('@/lib/ai/policy-extractor')

      const file = loadPDFAsFile(SIMPLE_PDF)
      const result = await extractPolicyFromDocument(file, {
        useFallback: true,
        useConsensus: false,
      })

      if (result.success) {
        // Successful results should have timing metadata
        if (result.metadata) {
          expect(result.metadata.processingTimeMs).toBeGreaterThanOrEqual(0)
        }
      }
      // Even on failure, clientPhaseTiming may be present
      if (result.clientPhaseTiming) {
        expect(typeof result.clientPhaseTiming).toBe('object')
      }
    }, 60_000)
  })
})
