import { describe, it, expect } from 'vitest'
import { reconstructPolicySafely } from '../backfill-evaluation-scores'

describe('backfill evaluation helper - reconstructPolicySafely', () => {
  it('skips row if raw_data is missing', () => {
    const row = { id: '1', premium: 100 }
    const result = reconstructPolicySafely(row)
    expect(result.policy).toBeUndefined()
    expect(result.skipReason).toBe('raw_data is null or missing')
  })

  it('skips row if premium is invalid', () => {
    const row = { id: '1', raw_data: { coverages: [] } }
    let result = reconstructPolicySafely(row)
    expect(result.policy).toBeUndefined()
    expect(result.skipReason).toBe('premium is invalid or missing')

    const row2 = { id: '1', premium: -10, raw_data: { coverages: [] } }
    result = reconstructPolicySafely(row2)
    expect(result.policy).toBeUndefined()
    expect(result.skipReason).toBe('premium is invalid or missing')
  })

  it('skips row if coverages is not an array', () => {
    const row = { id: '1', premium: 1000, raw_data: {} }
    const result = reconstructPolicySafely(row)
    expect(result.policy).toBeUndefined()
    expect(result.skipReason).toBe('raw_data.coverages is not an array')
  })

  it('successfully constructs Policy object for valid row', () => {
    const row = {
      id: 'mock-123',
      policy_number: 'P-123',
      provider: 'TestProvider',
      type: 'kasko',
      type_tr: 'Kasko',
      premium: 5000,
      coverage: 100000,
      deductible: 500,
      start_date: '2026-01-01',
      expiry_date: '2027-01-01',
      status: 'active',
      is_draft: false,
      raw_data: {
        coverages: [{ name: 'Test', nameTr: 'Test', limit: 1000, deductible: 0, included: true }],
        exclusions: ['Exc1'],
        premiumMissing: false,
        aiConfidence: 0.95,
      },
    }

    const { policy, skipReason } = reconstructPolicySafely(row)
    expect(skipReason).toBeUndefined()
    expect(policy).toBeDefined()
    expect(policy!.id).toBe('mock-123')
    expect(policy!.premium).toBe(5000)
    expect(policy!.monthlyPremium).toBe(417)
    expect(policy!.coverages.length).toBe(1)
    expect(policy!.exclusions.length).toBe(1)
    expect(policy!.premiumMissing).toBe(false)
    expect(policy!.aiConfidence).toBe(0.95)
    expect(policy!.isDraft).toBe(false)
  })
})
