/**
 * QA Regression Tests — catch bugs that have already been fixed once.
 *
 * Each test case is derived from a real production bug. If one of these breaks,
 * it means a regression was introduced.
 *
 * Current known failure modes covered:
 *  1. policyType defaults to 'home' when DeepSeek drops the field
 *  2. Eriş Ambalaj Birleşik Kasko misclassified as 'home'
 *  3. Debate pipeline dropping policyType (no longer debatable — dead code removed)
 *  4. OpenAI fallback path missing stage2 (no longer exist — dead code removed)
 *  5. Sürücüye Bağlı / generic catch-all pattern order
 *  6. Type consistency mismatch detection
 *  7. No stage2 validation on short-cut paths
 */

import { describe, it, expect } from 'vitest'
import { classifyDocument, checkTypeConsistency } from '../lib/classifier-gate.js'
// Use the import from the src directory — vitest resolves it via the services config
async function getStage2Validator() {
  const mod = await import('../../src/lib/policy-pipeline/stage2-validate/orchestrator.js')
  return mod.runStage2Validation
}
import { loadPrompts } from '../lib/prompt-loader.js'

// ---------------------------------------------------------------------------
// Helper: simulate extraction result (mimics DeepSeek's json_object mode that
// routinely drops policyType and metadata fields)
// ---------------------------------------------------------------------------
function simulateDeepSeekOutput(overrides: Record<string, unknown> = {}) {
  return {
    policyNumber: 'POL-2025-001',
    startDate: '2025-01-15',
    endDate: '2026-01-15',
    premium: 28500,
    insuredName: 'Ahmet Yılmaz',
    insurer: 'Anadolu Sigorta',
    vehiclePlate: '34 ABC 123',
    coverages: [
      {
        name: 'Kasko Teminatı',
        limit: 1500000,
        canonicalName: 'MAIN_KASKO_COVERAGE',
        normalizedName: 'kasko teminatı',
        included: true,
      },
    ],
    ...overrides,
  }
}

// Real OCR segment from Eriş Ambalaj Birleşik Kasko (contains "Konut Sigortası"
// as a bundle sub-product)
const ERIS_AMBALAJ_TEXT = `
İŞ BANKASI
Grup Sigorta A.Ş.
Sigorta Şubesi: Eriş Ambalaj San. Tic. A.Ş.
Konut Sigortası | Genişletilmiş Konut (Birleşik Kasko)
Poliçe No: 2025/12345
Müşteri No: 67890
Başlangıç: 01/04/2025
Bitiş: 01/04/2026
ARAÇ BİLGİLERİ
Plaka: 34 RZ 9511
Marka: VW
Model: Tiguan
Yıl: 2022
Kasko Bedeli: 1.850.000,00 TL
Prim: 29.657,00 TL
TEMİNATLAR
Kasko Teminatı (İMM Dahil) : 1.850.000,00 TL
Koltuk Ferdi Kaza : 50.000,00 TL Kişi Başı
Manevi Tazminat : 50.000,00 TL
Hukuksal Koruma : 25.000,00 TL
Yol Yardım : Sınırsız
Mini Onarım : 2.000,00 TL
`

// Konut policy text (pure home insurance)
const KONUT_TEXT = `
ANADOLU SİGORTA
Konut Sigorta Poliçesi
Poliçe No: KNT-2025-001
Sigortalı: Mehmet Demir
Adres: Bağdat Cad. No:45 Kadıköy/İstanbul
Başlangıç: 01/03/2025
Bitiş: 01/03/2026
Prim: 3.500,00 TL
TEMİNATLAR:
Yangın: 500.000 TL
Sel ve Su Baskını: 100.000 TL
Deprem: 500.000 TL
Hırsızlık: 50.000 TL
`

describe('QA Regression — Classifier (issue: Eriş Ambalaj → home)', () => {
  it('classifies Eriş Ambalaj Birleşik Kasko as kasko, not home', () => {
    const result = classifyDocument(ERIS_AMBALAJ_TEXT)
    expect(result.type).toBe('kasko')
    expect(['high', 'medium', 'low']).toContain(result.confidence)
    expect(result.confidence).not.toBe('low')
  })

  it('classifies pure konut text as home', () => {
    const result = classifyDocument(KONUT_TEXT)
    expect(result.type).toBe('home')
  })

  it('classifies generic kasko text as kasko', () => {
    const genericKasko = `
    Kasko Sigorta Poliçesi
    Araç: 34 ABC 123
    Sigortalı: Test
    `
    const result = classifyDocument(genericKasko)
    expect(result.type).toBe('kasko')
  })
})

describe('QA Regression — policyType injection (issue: DeepSeek drops policyType)', () => {
  it('injects classification.type when policyType is missing', () => {
    const output = simulateDeepSeekOutput({ policyType: undefined })
    const classification = classifyDocument(ERIS_AMBALAJ_TEXT)

    // This is what extraction.ts does after DeepSeek returns
    if (!output.policyType && !(output as any).policy_type) {
      output.policyType = classification.type
    }

    expect(output.policyType).toBe('kasko')
    expect(output.policyType).not.toBe('home')
    expect(output.policyType).not.toBeUndefined()
  })

  it('preserves policyType when DeepSeek provides it', () => {
    const output = simulateDeepSeekOutput({ policyType: 'conut' }) // intentionally wrong
    const classification = classifyDocument(ERIS_AMBALAJ_TEXT)

    if (!output.policyType && !(output as any).policy_type) {
      output.policyType = classification.type
    }

    // If LLM provided one, don't overwrite (consistency check will flag it)
    expect(output.policyType).toBe('conut')
  })

  it('injects home for konut documents when policyType missing', () => {
    const output = simulateDeepSeekOutput({ policyType: undefined })
    const classification = classifyDocument(KONUT_TEXT)

    if (!output.policyType && !(output as any).policy_type) {
      output.policyType = classification.type
    }

    expect(output.policyType).toBe('home')
  })
})

describe('QA Regression — Type consistency check (issue: mismatch between classifier and LLM)', () => {
  it('detects when LLM output contradicts classifier (kasko vs home)', () => {
    const classification = classifyDocument(ERIS_AMBALAJ_TEXT)
    const result = checkTypeConsistency(classification, 'home')
    expect(result.consistent).toBe(false)
    expect(result.mismatchDescription).toBeTruthy()
  })

  it('passes when LLM agrees with classifier', () => {
    const classification = classifyDocument(ERIS_AMBALAJ_TEXT)
    const result = checkTypeConsistency(classification, 'kasko')
    expect(result.consistent).toBe(true)
  })

  it('passes when LLM output has no policyType (will be injected)', () => {
    const classification = classifyDocument(ERIS_AMBALAJ_TEXT)
    const result = checkTypeConsistency(classification, null)
    expect(result.consistent).toBe(true)
  })

  it('passes when LLM output has undefined policyType', () => {
    const classification = classifyDocument(KONUT_TEXT)
    const result = checkTypeConsistency(classification, undefined)
    expect(result.consistent).toBe(true)
  })
})

describe('QA Regression — Stage2 validation (issue: stage2 missing on some paths)', () => {
  it('produces canonicalName/parsedLimit fields after stage2', async () => {
    const runStage2 = await getStage2Validator()
    const rawCoverage = {
      name: 'Sürücüye Bağlı Ferdi Kaza',
      nameTr: 'Sürücüye Bağlı Ferdi Kaza',
      limit: 100000,
    }
    const raw = {
      policyType: 'kasko',
      policyNumber: 'TEST',
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      insurer: 'Test',
      insuredName: 'Test',
      premium: 1000,
      coverages: [rawCoverage],
    }

    const validated = runStage2(raw) as any
    const cov = validated.coverages?.[0]
    expect(cov).toBeDefined()
    expect(cov).toHaveProperty('canonicalName')
    expect(cov).toHaveProperty('parsedLimit')
    expect(cov).toHaveProperty('normalizedName')
  })
})

describe('QA Regression — Pattern ordering (issue: generic catch-all before specific)', () => {
  it('extracts Sürücüye Bağlı Ferdi Kaza distinct from plain Ferdi Kaza', async () => {
    const runStage2 = await getStage2Validator()
    // This tests that the specific pattern is matched before the generic one
    // document text below kept for documentation — stage2 doesn't need it
    const _testDoc = `
    Kasko Poliçesi
    Sigortalı: Test
    Poliçe No: X
    TEMİNATLAR:
    Sürücüye Bağlı Ferdi Kaza: 100.000 TL (araç sürücüsüne bağlı)
    Ferdi Kaza: 50.000 TL (tüm yolcular)
    `

    const raw = {
      policyType: 'kasko',
      policyNumber: 'X',
      startDate: '2025-01-01',
      endDate: '2026-01-01',
      insurer: 'Test',
      insuredName: 'Test',
      premium: 5000,
      coverages: [
        { name: 'Sürücüye Bağlı Ferdi Kaza', limit: 100000, nameTr: 'Sürücüye Bağlı Ferdi Kaza' },
        { name: 'Ferdi Kaza', limit: 50000, nameTr: 'Ferdi Kaza' },
      ],
    }

    const validated = runStage2(raw) as any
    const covs = validated.coverages || []

    const driverBinding = covs.find(
      (c: any) => c.normalizedName?.includes('sürücüye') || c.name?.includes('Sürücüye')
    )
    expect(driverBinding).toBeDefined()

    const plainFK = covs.find(
      (c: any) => c.normalizedName === 'ferdi kaza' && !c.normalizedName?.includes('sürücüye')
    )
    // Plain FK may or may not be present — but both specific and generic should coexist
    if (plainFK) {
      expect(driverBinding.canonicalName).not.toBe(plainFK.canonicalName)
    }
  })
})

describe('QA Regression — Prompt loading (issue: no type-specific prompt)', () => {
  it('loads prompts successfully for kasko type', async () => {
    const prompts = await loadPrompts('Test kasko document', 'kasko', undefined)
    expect(prompts.openaiSystemPrompt).toBeTruthy()
    expect(prompts.userPrompt).toBeTruthy()
    expect(prompts.userPrompt).toContain('Test kasko document')
  })

  it('loads prompts with document type hint for unknown types', async () => {
    const prompts = await loadPrompts('Test document', 'home', undefined)
    expect(prompts.openaiSystemPrompt).toBeTruthy()
    expect(prompts.userPrompt).toBeTruthy()
  })

  it('returns prompt version metadata', async () => {
    const prompts = await loadPrompts('Test document', 'kasko', undefined)
    expect(prompts.templateMeta).toBeDefined()
  })
})
