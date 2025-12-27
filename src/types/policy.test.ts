import { describe, it, expect } from 'vitest'
import { POLICY_TYPES } from './policy'
import type { PolicyType, PolicyStatus, Coverage, Policy } from './policy'

describe('Policy Types', () => {
  it('has all required policy types', () => {
    const expectedTypes: PolicyType[] = ['kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business']

    expectedTypes.forEach(type => {
      expect(POLICY_TYPES[type]).toBeDefined()
      expect(POLICY_TYPES[type].label).toBeTruthy()
      expect(POLICY_TYPES[type].labelTr).toBeTruthy()
      expect(POLICY_TYPES[type].icon).toBeTruthy()
    })
  })

  it('has correct Turkish labels for policy types', () => {
    expect(POLICY_TYPES.kasko.labelTr).toBe('Kasko')
    expect(POLICY_TYPES.traffic.labelTr).toBe('Trafik Sigortası')
    expect(POLICY_TYPES.home.labelTr).toBe('Konut Sigortası')
    expect(POLICY_TYPES.health.labelTr).toBe('Sağlık Sigortası')
    expect(POLICY_TYPES.dask.labelTr).toBe('DASK')
  })

  it('has emoji icons for each type', () => {
    Object.values(POLICY_TYPES).forEach(type => {
      // Check that icon is a non-empty string (emoji)
      expect(type.icon.length).toBeGreaterThan(0)
    })
  })
})

describe('Policy Type Definitions', () => {
  it('PolicyStatus type includes expected values', () => {
    const validStatuses: PolicyStatus[] = ['active', 'expiring', 'expired', 'pending']
    validStatuses.forEach(status => {
      // TypeScript compilation validates these, but we can do a runtime check
      expect(['active', 'expiring', 'expired', 'pending']).toContain(status)
    })
  })

  it('Coverage interface has required fields', () => {
    const coverage: Coverage = {
      name: 'Test Coverage',
      nameTr: 'Test Teminat',
      limit: 100000,
      deductible: 1000,
      included: true,
    }

    expect(coverage.name).toBe('Test Coverage')
    expect(coverage.nameTr).toBe('Test Teminat')
    expect(coverage.limit).toBe(100000)
    expect(coverage.deductible).toBe(1000)
    expect(coverage.included).toBe(true)
  })
})
