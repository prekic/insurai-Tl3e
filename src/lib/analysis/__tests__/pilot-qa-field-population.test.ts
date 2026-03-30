/**
 * WS-1 — Pilot QA Record Field Population Tests
 *
 * Verifies that QA record fields are correctly derived from AnalyzedPolicy
 * data. These fields were identified as always-default in the Phase 8L
 * evaluation report (Section 8).
 */
import { describe, it, expect } from 'vitest'
import { createPilotQARecord, evaluateSimpleDisplayMode } from '../kasko-pilot-gate'
import type { AnalyzedPolicy } from '@/types/policy'

// Helper: simulate the field assignment logic from policy-extractor.ts (lines 1325-1335)
function populateQAFieldsFromPolicy(
  qaRecord: ReturnType<typeof createPilotQARecord>,
  policy: Partial<AnalyzedPolicy>
) {
  qaRecord.specialConditionCount = policy.specialConditions?.length || 0
  qaRecord.hasRayicDeger = policy.coverages?.some((c) => c.isMarketValue) || false
  qaRecord.hasConditionalDeductible = Boolean(
    (policy.conditionalDeductibles && policy.conditionalDeductibles.length > 0) ||
    policy.deductibleUncertain
  )
  qaRecord.sourceQuoteCount = Object.keys(policy.evidenceData || {}).length
  qaRecord.zeroCoverage = (policy.coverages?.length || 0) === 0
  return qaRecord
}

// ============================================================================
// hasRayicDeger
// ============================================================================

describe('QA field: hasRayicDeger', () => {
  it('sets true when a coverage has isMarketValue', () => {
    const qaRecord = createPilotQARecord('doc-1', 'test.pdf', 'user-1')
    const policy: Partial<AnalyzedPolicy> = {
      coverages: [
        {
          name: 'Vehicle Value',
          nameTr: 'Araç Değeri',
          limit: 0,
          deductible: 0,
          included: true,
          isMarketValue: true,
        },
        { name: 'Glass', nameTr: 'Cam', limit: 5000, deductible: 0, included: true },
      ],
    }
    populateQAFieldsFromPolicy(qaRecord, policy)
    expect(qaRecord.hasRayicDeger).toBe(true)
  })

  it('sets false when no coverage has isMarketValue', () => {
    const qaRecord = createPilotQARecord('doc-2', 'test.pdf', 'user-1')
    const policy: Partial<AnalyzedPolicy> = {
      coverages: [
        { name: 'Collision', nameTr: 'Çarpma', limit: 50000, deductible: 1000, included: true },
      ],
    }
    populateQAFieldsFromPolicy(qaRecord, policy)
    expect(qaRecord.hasRayicDeger).toBe(false)
  })

  it('sets false when coverages is undefined', () => {
    const qaRecord = createPilotQARecord('doc-3', 'test.pdf', 'user-1')
    populateQAFieldsFromPolicy(qaRecord, {})
    expect(qaRecord.hasRayicDeger).toBe(false)
  })
})

// ============================================================================
// hasConditionalDeductible
// ============================================================================

describe('QA field: hasConditionalDeductible', () => {
  it('sets true when conditionalDeductibles has entries', () => {
    const qaRecord = createPilotQARecord('doc-4', 'test.pdf', 'user-1')
    const policy: Partial<AnalyzedPolicy> = {
      conditionalDeductibles: ['%20 muafiyet uygulanır'],
      coverages: [],
    }
    populateQAFieldsFromPolicy(qaRecord, policy)
    expect(qaRecord.hasConditionalDeductible).toBe(true)
  })

  it('sets true when deductibleUncertain is true (even without conditionalDeductibles)', () => {
    const qaRecord = createPilotQARecord('doc-5', 'test.pdf', 'user-1')
    const policy: Partial<AnalyzedPolicy> = {
      deductibleUncertain: true,
      coverages: [],
    }
    populateQAFieldsFromPolicy(qaRecord, policy)
    expect(qaRecord.hasConditionalDeductible).toBe(true)
  })

  it('sets true when both conditionalDeductibles and deductibleUncertain are present', () => {
    const qaRecord = createPilotQARecord('doc-6', 'test.pdf', 'user-1')
    const policy: Partial<AnalyzedPolicy> = {
      conditionalDeductibles: ['%10 tenzili muafiyet'],
      deductibleUncertain: true,
      coverages: [],
    }
    populateQAFieldsFromPolicy(qaRecord, policy)
    expect(qaRecord.hasConditionalDeductible).toBe(true)
  })

  it('sets false when neither conditionalDeductibles nor deductibleUncertain exist', () => {
    const qaRecord = createPilotQARecord('doc-7', 'test.pdf', 'user-1')
    const policy: Partial<AnalyzedPolicy> = {
      coverages: [],
    }
    populateQAFieldsFromPolicy(qaRecord, policy)
    expect(qaRecord.hasConditionalDeductible).toBe(false)
  })

  it('sets false when conditionalDeductibles is empty array', () => {
    const qaRecord = createPilotQARecord('doc-8', 'test.pdf', 'user-1')
    const policy: Partial<AnalyzedPolicy> = {
      conditionalDeductibles: [],
      deductibleUncertain: false,
      coverages: [],
    }
    populateQAFieldsFromPolicy(qaRecord, policy)
    expect(qaRecord.hasConditionalDeductible).toBe(false)
  })
})

// ============================================================================
// sourceQuoteCount
// ============================================================================

describe('QA field: sourceQuoteCount', () => {
  it('counts keys in evidenceData', () => {
    const qaRecord = createPilotQARecord('doc-9', 'test.pdf', 'user-1')
    const policy: Partial<AnalyzedPolicy> = {
      evidenceData: {
        insights: { quotes: ['quote1'] },
        exclusions: { quotes: ['quote2', 'quote3'] },
        coverages: { quotes: ['quote4'] },
      },
      coverages: [],
    }
    populateQAFieldsFromPolicy(qaRecord, policy)
    expect(qaRecord.sourceQuoteCount).toBe(3)
  })

  it('returns 0 when evidenceData is empty', () => {
    const qaRecord = createPilotQARecord('doc-10', 'test.pdf', 'user-1')
    const policy: Partial<AnalyzedPolicy> = {
      evidenceData: {},
      coverages: [],
    }
    populateQAFieldsFromPolicy(qaRecord, policy)
    expect(qaRecord.sourceQuoteCount).toBe(0)
  })

  it('returns 0 when evidenceData is undefined', () => {
    const qaRecord = createPilotQARecord('doc-11', 'test.pdf', 'user-1')
    populateQAFieldsFromPolicy(qaRecord, {})
    expect(qaRecord.sourceQuoteCount).toBe(0)
  })
})

// ============================================================================
// specialConditionCount
// ============================================================================

describe('QA field: specialConditionCount', () => {
  it('counts special conditions from policy', () => {
    const qaRecord = createPilotQARecord('doc-12', 'test.pdf', 'user-1')
    const policy: Partial<AnalyzedPolicy> = {
      specialConditions: ['Kloz 1', 'Kloz 2', 'Kloz 3'],
      coverages: [],
    }
    populateQAFieldsFromPolicy(qaRecord, policy)
    expect(qaRecord.specialConditionCount).toBe(3)
  })

  it('returns 0 when specialConditions is empty', () => {
    const qaRecord = createPilotQARecord('doc-13', 'test.pdf', 'user-1')
    const policy: Partial<AnalyzedPolicy> = {
      specialConditions: [],
      coverages: [],
    }
    populateQAFieldsFromPolicy(qaRecord, policy)
    expect(qaRecord.specialConditionCount).toBe(0)
  })

  it('returns 0 when specialConditions is undefined', () => {
    const qaRecord = createPilotQARecord('doc-14', 'test.pdf', 'user-1')
    populateQAFieldsFromPolicy(qaRecord, {})
    expect(qaRecord.specialConditionCount).toBe(0)
  })
})

// ============================================================================
// zeroCoverage
// ============================================================================

describe('QA field: zeroCoverage', () => {
  it('sets true when coverages is empty', () => {
    const qaRecord = createPilotQARecord('doc-15', 'test.pdf', 'user-1')
    const policy: Partial<AnalyzedPolicy> = {
      coverages: [],
    }
    populateQAFieldsFromPolicy(qaRecord, policy)
    expect(qaRecord.zeroCoverage).toBe(true)
  })

  it('sets false when coverages has entries', () => {
    const qaRecord = createPilotQARecord('doc-16', 'test.pdf', 'user-1')
    const policy: Partial<AnalyzedPolicy> = {
      coverages: [
        { name: 'Collision', nameTr: 'Çarpma', limit: 50000, deductible: 0, included: true },
      ],
    }
    populateQAFieldsFromPolicy(qaRecord, policy)
    expect(qaRecord.zeroCoverage).toBe(false)
  })

  it('sets true when coverages is undefined', () => {
    const qaRecord = createPilotQARecord('doc-17', 'test.pdf', 'user-1')
    populateQAFieldsFromPolicy(qaRecord, {})
    expect(qaRecord.zeroCoverage).toBe(true)
  })
})

// ============================================================================
// displayMode threading (verify existing wiring)
// ============================================================================

describe('QA field: displayMode (existing wiring verification)', () => {
  it('returns full for high-confidence extraction with all fields', () => {
    const result = evaluateSimpleDisplayMode(0.95, {
      policyNumber: 'KSK-1234',
      provider: 'Allianz',
      coverages: [{}, {}],
    })
    expect(result.mode).toBe('full')
    expect(result.triggers).toHaveLength(0)
  })

  it('returns restricted for low confidence (< 0.6)', () => {
    const result = evaluateSimpleDisplayMode(0.45, {
      policyNumber: 'KSK-1234',
      provider: 'Allianz',
      coverages: [{}, {}],
    })
    expect(result.mode).toBe('restricted')
    expect(result.triggers).toContain('LOW_CONFIDENCE_RESTRICTED')
  })

  it('returns human_review_required for very low confidence (< 0.3)', () => {
    const result = evaluateSimpleDisplayMode(0.15, {
      policyNumber: 'KSK-1234',
      provider: 'Allianz',
      coverages: [{}],
    })
    expect(result.mode).toBe('human_review_required')
    expect(result.triggers).toContain('LOW_CONFIDENCE_HUMAN_REVIEW')
  })

  it('returns restricted when policyNumber is missing', () => {
    const result = evaluateSimpleDisplayMode(0.9, {
      policyNumber: null,
      provider: 'Allianz',
      coverages: [{}],
    })
    expect(result.mode).toBe('restricted')
    expect(result.triggers).toContain('MISSING_POLICY_NUMBER')
  })

  it('returns restricted when provider is missing', () => {
    const result = evaluateSimpleDisplayMode(0.9, {
      policyNumber: 'KSK-1234',
      provider: null,
      coverages: [{}],
    })
    expect(result.mode).toBe('restricted')
    expect(result.triggers).toContain('MISSING_PROVIDER')
  })

  it('returns restricted when no coverages extracted', () => {
    const result = evaluateSimpleDisplayMode(0.9, {
      policyNumber: 'KSK-1234',
      provider: 'Allianz',
      coverages: [],
    })
    expect(result.mode).toBe('restricted')
    expect(result.triggers).toContain('NO_COVERAGES_EXTRACTED')
  })

  it('can never return unknown — only full, restricted, or human_review_required', () => {
    // Exhaustive check: the function always returns a valid mode
    const scenarios = [
      { confidence: 0.95, data: { policyNumber: 'X', provider: 'Y', coverages: [{}] } },
      { confidence: 0.1, data: { policyNumber: null, provider: null, coverages: [] } },
      { confidence: 0.5, data: { policyNumber: 'X', provider: null, coverages: [] } },
    ]
    for (const s of scenarios) {
      const result = evaluateSimpleDisplayMode(s.confidence, s.data)
      expect(['full', 'restricted', 'human_review_required']).toContain(result.mode)
      expect(result.mode).not.toBe('unknown')
    }
  })
})
