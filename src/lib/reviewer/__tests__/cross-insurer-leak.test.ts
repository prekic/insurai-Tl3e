/**
 * Sprint 1 PR-S1.5 — Test A from Round-4 reviewer.
 *
 * Goal: verify no insurer-specific terminology carries over between policies
 * uploaded in succession. The reviewer's concern is that a previous AXA
 * policy's terminology (CASU, AS+ glass network) might leak into a
 * subsequent Anadolu render — either via:
 *   - LLM hallucinating cross-insurer terms in extraction
 *   - Hardcoded strings re-introduced in the rendering pipeline
 *   - Component-level state leakage between session uploads
 *
 * Layered coverage:
 *   - **Extraction layer**: `scripts/smoke-kasko.ts` already runs the same
 *     `forbiddenPhrases[]` check against the JSON-serialized extraction
 *     output (gotcha #136), gated on every push to main via CI.
 *   - **Rendering layer (this file)**: builds 3 synthetic AnalyzedPolicy
 *     fixtures with insurer-specific markers, runs each through the
 *     canonical reviewer-summary builder, and asserts no cross-insurer
 *     leakage in the rendered output. Pure-function — no LLM, no DOM.
 */
import { describe, it, expect } from 'vitest'
import { buildPolicyReviewerSummary } from '../policy-reviewer-summary'
import type { AnalyzedPolicy } from '@/types/policy'

// ───────────────────────────────────────────────────────────────────────────
// Insurer-specific terminology markers — drawn from
// tests/fixtures/kasko/fixtures.json `forbiddenPhrases[]` arrays.
// ───────────────────────────────────────────────────────────────────────────

const AXA_MARKER = 'CASU' // AXA's contracted glass-network brand
const ANADOLU_MARKER = 'AS+ Yetkili Servis' // Anadolu network signature
const ANADOLU_HIZMET = 'Anadolu Hizmet Grup' // Anadolu assistance package
const ALLIANZ_MARKER = 'Genişletilmiş Mavi Servis' // Allianz-specific service tier (synthetic for this test)

// ───────────────────────────────────────────────────────────────────────────
// Fixture builders — synthetic AnalyzedPolicy objects with realistic
// insurer-specific content embedded in coverages, exclusions, and
// specialConditions.
// ───────────────────────────────────────────────────────────────────────────

const baseSkeleton = (id: string, provider: string): AnalyzedPolicy => ({
  id,
  policyNumber: `KAS-${id}`,
  provider,
  type: 'kasko',
  typeTr: 'Kasko',
  coverage: 500000,
  premium: 12500,
  deductible: 0,
  startDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
  expiryDate: new Date(Date.now() + 365 * 86400000).toISOString().split('T')[0],
  status: 'active',
  insuredPerson: 'Test Insured',
  documentType: 'policy',
  uploadDate: new Date().toISOString().split('T')[0],
  logo: '🚗',
  fileName: 'test.pdf',
  coverages: [],
  exclusions: [],
  specialConditions: [],
  insuranceLine: 'Motor',
  aiConfidence: 0.9,
  aiInsights: [],
})

function buildAxaPolicy(): AnalyzedPolicy {
  return {
    ...baseSkeleton('axa-1', 'AXA Sigorta'),
    coverages: [
      {
        name: `Glass Coverage (${AXA_MARKER} contracted network)`,
        nameTr: `Cam Teminatı (${AXA_MARKER} anlaşmalı ağ)`,
        limit: 25000,
        deductible: 0,
        included: true,
        category: 'supplementary',
      },
    ],
    specialConditions: [`${AXA_MARKER} ağı dışında onarımda %20 muafiyet uygulanır`],
    aiInsights: [`${AXA_MARKER} contracted glass network covers windshield repair without deductible`],
  }
}

function buildAnadoluPolicy(): AnalyzedPolicy {
  return {
    ...baseSkeleton('anadolu-1', 'Anadolu Sigorta'),
    coverages: [
      {
        name: `Service Network (${ANADOLU_MARKER})`,
        nameTr: `Servis Ağı (${ANADOLU_MARKER})`,
        limit: 0,
        deductible: 0,
        included: true,
        isUnlimited: true,
        category: 'assistance',
      },
      {
        name: ANADOLU_HIZMET,
        nameTr: ANADOLU_HIZMET,
        limit: 0,
        deductible: 0,
        included: true,
        category: 'assistance',
      },
    ],
    specialConditions: [`${ANADOLU_MARKER} kapsamında 5,000+ TL parça onarımı NCD'yi etkilemez`],
    aiInsights: [`${ANADOLU_MARKER} flagship: partial repairs at network shops do not affect NCD`],
  }
}

function buildAllianzPolicy(): AnalyzedPolicy {
  return {
    ...baseSkeleton('allianz-1', 'Allianz Sigorta'),
    coverages: [
      {
        name: ALLIANZ_MARKER,
        nameTr: ALLIANZ_MARKER,
        limit: 50000,
        deductible: 0,
        included: true,
        category: 'supplementary',
      },
    ],
    specialConditions: [`${ALLIANZ_MARKER} kapsamında onarım önceliklendirilir`],
    aiInsights: [`${ALLIANZ_MARKER} provides expedited claims handling`],
  }
}

/** Serialize all reviewer-summary outputs to a single string for substring scanning. */
function serializeForScan(summary: ReturnType<typeof buildPolicyReviewerSummary>): string {
  return JSON.stringify(summary)
}

// ───────────────────────────────────────────────────────────────────────────
// Tests
// ───────────────────────────────────────────────────────────────────────────

describe('Cross-insurer leak guard (Test A) — rendering layer', () => {
  it('AXA policy renders CASU but does NOT leak Anadolu/Allianz markers', () => {
    const summary = buildPolicyReviewerSummary(buildAxaPolicy(), { locale: 'en' })
    const serialized = serializeForScan(summary)

    // Sanity: the AXA-specific marker IS present in the rendered output
    expect(serialized).toContain(AXA_MARKER)

    // Forbidden: no Anadolu or Allianz markers should appear
    expect(serialized).not.toContain(ANADOLU_MARKER)
    expect(serialized).not.toContain(ANADOLU_HIZMET)
    expect(serialized).not.toContain(ALLIANZ_MARKER)
  })

  it('Anadolu policy renders AS+/Hizmet Grup but does NOT leak AXA/Allianz markers', () => {
    const summary = buildPolicyReviewerSummary(buildAnadoluPolicy(), { locale: 'tr' })
    const serialized = serializeForScan(summary)

    expect(serialized).toContain(ANADOLU_MARKER)
    expect(serialized).toContain(ANADOLU_HIZMET)

    expect(serialized).not.toContain(AXA_MARKER)
    expect(serialized).not.toContain(ALLIANZ_MARKER)
  })

  it('Allianz policy renders its marker but does NOT leak AXA/Anadolu markers', () => {
    const summary = buildPolicyReviewerSummary(buildAllianzPolicy(), { locale: 'tr' })
    const serialized = serializeForScan(summary)

    expect(serialized).toContain(ALLIANZ_MARKER)

    expect(serialized).not.toContain(AXA_MARKER)
    expect(serialized).not.toContain(ANADOLU_MARKER)
    expect(serialized).not.toContain(ANADOLU_HIZMET)
  })

  it('three policies built in succession do not share state via shared module-level variables', () => {
    // Sanity check: build all three in one test, render all three, and
    // confirm each one's output is isolated. If any rendering helper held
    // module-level state that accumulated across calls, the second/third
    // policy's output would contain prior policies' markers.
    const axa = buildPolicyReviewerSummary(buildAxaPolicy(), { locale: 'en' })
    const anadolu = buildPolicyReviewerSummary(buildAnadoluPolicy(), { locale: 'tr' })
    const allianz = buildPolicyReviewerSummary(buildAllianzPolicy(), { locale: 'tr' })

    const axaSerialized = serializeForScan(axa)
    const anadoluSerialized = serializeForScan(anadolu)
    const allianzSerialized = serializeForScan(allianz)

    // AXA output isolated
    expect(axaSerialized).toContain(AXA_MARKER)
    expect(axaSerialized).not.toContain(ANADOLU_MARKER)
    expect(axaSerialized).not.toContain(ALLIANZ_MARKER)

    // Anadolu output isolated
    expect(anadoluSerialized).toContain(ANADOLU_MARKER)
    expect(anadoluSerialized).not.toContain(AXA_MARKER)
    expect(anadoluSerialized).not.toContain(ALLIANZ_MARKER)

    // Allianz output isolated
    expect(allianzSerialized).toContain(ALLIANZ_MARKER)
    expect(allianzSerialized).not.toContain(AXA_MARKER)
    expect(allianzSerialized).not.toContain(ANADOLU_MARKER)
  })

  it('reverse-order build (Allianz → Anadolu → AXA) maintains isolation', () => {
    // Same as above but built in reverse — guards against accumulator
    // patterns that build up state in registration order.
    const allianz = buildPolicyReviewerSummary(buildAllianzPolicy(), { locale: 'tr' })
    const anadolu = buildPolicyReviewerSummary(buildAnadoluPolicy(), { locale: 'tr' })
    const axa = buildPolicyReviewerSummary(buildAxaPolicy(), { locale: 'en' })

    expect(serializeForScan(allianz)).not.toContain(AXA_MARKER)
    expect(serializeForScan(anadolu)).not.toContain(ALLIANZ_MARKER)
    expect(serializeForScan(axa)).not.toContain(ANADOLU_MARKER)
  })
})
