/**
 * Phase 8B — Remediation Tests
 *
 * These are TRUE assertion tests that FAIL until defects are fixed.
 * They are NOT logging-only.
 */
import { describe, it, expect } from 'vitest'
import {
  rdKas001,
  rdKas002,
  rdKas003,
  rdKas004,
  rdKas005,
  rdHom002,
  rdSag001,
  rdHom003,
  rdSag004,
  rdBiz002,
  rdBiz003,
  type PilotSample,
} from './pilot-samples'
import { validateExtractionSafety } from '@/lib/ai/validator'
import { generateAnalysisBundle } from '../engine'
import { generateDisplaySafeSummary } from '../display-interpreter'
import { evaluateDisplayMode } from '../review-thresholds'
import { normalizeBranchExtraction } from '@/lib/ai/extraction-normalizer'

// v4: "unlimited" and "sınırsız" were intentionally removed from the
// prohibited list. They're legitimate structural descriptors (IMM Sınırsız,
// Artan Mali Sorumluluk Sınırsız). Hedging them destroyed signals users
// needed; carve-outs now surface as separate caveat badges.
const PROHIBITED_PHRASES = [
  'no deductible',
  'fully covered',
  'tam kapsamlı',
  'guaranteed',
  'full protection',
  'total coverage',
  "your vehicle's full value will be paid",
  'aracınızın tam değeri ödenir',
  'free towing',
  'fully compliant',
  'muafiyetsiz',
  'tamamen kapsar',
]

function getDisplayOutput(sample: PilotSample) {
  const normalized = normalizeBranchExtraction(sample.data)
  const validation = validateExtractionSafety(normalized)
  const analysis = generateAnalysisBundle(sample.meta.id, normalized, validation)
  const displayResult = evaluateDisplayMode(normalized, validation, analysis)
  const summary = generateDisplaySafeSummary(normalized, validation, analysis)
  return { summary, displayResult, validation }
}

function findProhibitedPhrases(summary: any): string[] {
  const text = JSON.stringify(summary).toLowerCase()
  return PROHIBITED_PHRASES.filter((p) => text.includes(p.toLowerCase()))
}

// ============================================================================
// DEFECT A: PROHIBITED PHRASE LEAKAGE
// These MUST pass (no prohibited phrases in display-safe output)
// ============================================================================

describe('8B-REM: Prohibited Phrase Leakage', () => {
  const phraseSamples = [
    { label: 'RD-KAS-001', sample: rdKas001 },
    { label: 'RD-KAS-002', sample: rdKas002 },
    { label: 'RD-KAS-003', sample: rdKas003 },
    { label: 'RD-KAS-004', sample: rdKas004 },
    { label: 'RD-KAS-005', sample: rdKas005 },
    { label: 'RD-HOM-002', sample: rdHom002 },
    { label: 'RD-SAG-001', sample: rdSag001 },
  ]

  for (const { label, sample } of phraseSamples) {
    it(`${label}: no prohibited phrases in display-safe output`, () => {
      const { summary } = getDisplayOutput(sample)
      const found = findProhibitedPhrases(summary)
      expect(found, `Found prohibited phrases: ${found.join(', ')}`).toEqual([])
    })
  }
})

// ============================================================================
// DEFECT B: MODE UNDER-RESTRICTION
// These MUST pass (display mode is at least as restrictive as expected)
// ============================================================================

describe('8B-REM: Mode Under-Restriction', () => {
  const modeSamples = [
    { label: 'RD-KAS-005', sample: rdKas005, expectedMin: 'restricted' },
    { label: 'RD-HOM-003', sample: rdHom003, expectedMin: 'restricted' },
    { label: 'RD-SAG-004', sample: rdSag004, expectedMin: 'restricted' },
    { label: 'RD-BIZ-002', sample: rdBiz002, expectedMin: 'human_review_required' },
    { label: 'RD-BIZ-003', sample: rdBiz003, expectedMin: 'restricted' },
  ]

  for (const { label, sample, expectedMin } of modeSamples) {
    it(`${label}: mode should be at least '${expectedMin}'`, () => {
      const { displayResult } = getDisplayOutput(sample)
      const order = ['full', 'restricted', 'human_review_required']
      const actual = order.indexOf(displayResult.mode)
      const expected = order.indexOf(expectedMin)
      expect(
        actual,
        `Got '${displayResult.mode}' but expected at least '${expectedMin}'. Triggers: ${displayResult.triggers.map((t) => t.triggerRule).join(', ') || 'none'}`
      ).toBeGreaterThanOrEqual(expected)
    })
  }
})
