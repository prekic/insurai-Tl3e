import { describe, it, expect, vi } from 'vitest'
import { evaluatePolicy } from '../evaluator'
import * as benchmarkService from '../benchmark-service'
import type { AnalyzedPolicy } from '@/types/policy'

describe('Sprint 1: Trustworthiness Hardening Evaluator Tests', () => {
  const basePolicy: AnalyzedPolicy = {
    id: 'test-policy',
    policyNumber: 'TEST-123',
    provider: 'Test Insurance',
    type: 'kasko',
    status: 'active',
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    premium: 1000,
    coverageLimit: 1000000,
    coverage: 1000000,
    deductible: 0,
    coverages: [],
    exclusions: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  it('Sanctions clause creates a critical compliance issue and caps score at 60', () => {
    const policyWithSanction = {
      ...basePolicy,
      exclusions: ['Uluslararası Yaptırım Klozu (Sanctions Clause)']
    }
    const result = evaluatePolicy(policyWithSanction)
    
    // Proves: sanctions clause creates a critical compliance issue
    const hasCriticalSanction = result.compliance.issues.some(
      (issue) => issue.severity === 'critical' && issue.description.toLowerCase().includes('sanctions')
    )
    expect(hasCriticalSanction).toBe(true)

    // Proves: critical compliance issue caps score at 60
    expect(result.overallScore).toBeLessThanOrEqual(60)
  })

  it('Untrusted or fallback benchmark caps score at 60', () => {
    // Stub the benchmark response to be a fallback
    vi.spyOn(benchmarkService, 'getPremiumBenchmarkWithFallback').mockReturnValue({
      benchmarkStatus: 'untrusted',
      source: 'fallback',
      dataDate: '2023-01-01'
    } as any)
    
    const mockPolicy = { ...basePolicy }
    const result = evaluatePolicy(mockPolicy)
    
    // Proves: untrusted fallback benchmark caps score at 60
    expect(result.overallScore).toBeLessThanOrEqual(60)

    vi.restoreAllMocks()
  })

  it('Provisional boolean is true for draft policies and assigns standard grade fallback', () => {
    const draftPolicy = { ...basePolicy, isDraft: true } as unknown as AnalyzedPolicy
    const result = evaluatePolicy(draftPolicy)
    
    expect(result.isProvisional).toBe(true)
    // Grade should not explicitly be Provisional string, instead standard grade
    expect(['A', 'B', 'C', 'D', 'F']).toContain(result.grade)
  })

  it('ScenarioCard includes insurerPays/userPays/trigger/whyItMatters structure', () => {
    const result = evaluatePolicy(basePolicy)
    expect(result.scenarioCards?.length).toBeGreaterThan(0)
    
    const card = result.scenarioCards![0]
    expect(card).toHaveProperty('insurerPays')
    expect(card).toHaveProperty('userPays')
    expect(card).toHaveProperty('trigger')
    expect(card).toHaveProperty('whyItMatters')
  })
})
