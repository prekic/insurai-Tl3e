import { describe, it, expect } from 'vitest'
import { evaluatePilotAdmission } from '../kasko-pilot-gate'

describe('evaluatePilotAdmission', () => {
  it('admits a regular clean document', () => {
    const data = {
      policyNumber: 'KSK-1234',
      provider: 'Allianz',
      coverages: [{}, {}, {}],
    }
    const meta = {
      textCharCount: 2500,
    }

    const { status, countedInPilotMetrics } = evaluatePilotAdmission(data, meta)
    expect(status).toBe('pilot_eligible_clean')
    expect(countedInPilotMetrics).toBe(true)
  })

  it('rejects noisy documents below 100 characters', () => {
    const data = {
      policyNumber: '???',
      provider: '',
    }
    const meta = {
      textCharCount: 50,
    }
    const { status, countedInPilotMetrics } = evaluatePilotAdmission(data, meta)
    expect(status).toBe('pilot_ineligible_noisy')
    expect(countedInPilotMetrics).toBe(false)
  })

  it('rejects mostly empty documents (100 - 500 characters)', () => {
    const data = { policyNumber: '123' }
    const meta = { textCharCount: 300 }
    const { status, countedInPilotMetrics } = evaluatePilotAdmission(data, meta)
    expect(status).toBe('pilot_ineligible_incomplete')
    expect(countedInPilotMetrics).toBe(false)
  })

  it('rejects documents with missing or generic provider', () => {
    const data = {
      policyNumber: '123',
      provider: 'Sigorta A.Ş.',
    }
    const meta = { textCharCount: 1500 }
    const { status, countedInPilotMetrics } = evaluatePilotAdmission(data, meta)
    expect(status).toBe('pilot_ineligible_incomplete')
    expect(countedInPilotMetrics).toBe(false)
  })

  it('rejects explicitly noisy or partial documents even if text length passes', () => {
    const data = {
      policyNumber: 'KSK-1234',
      provider: 'Allianz',
      coverages: [{}, {}],
    }
    const meta = {
      textCharCount: 1500,
      documentQuality: 'noisy',
    }
    const { status, countedInPilotMetrics } = evaluatePilotAdmission(data, meta)
    expect(status).toBe('pilot_ineligible_incomplete')
    expect(countedInPilotMetrics).toBe(false)
  })

  it('downgrades to moderate eligibility', () => {
    const data = {
      policyNumber: 'KSK-1234',
      provider: 'Allianz',
      coverages: [{}, {}],
    }
    const meta = {
      textCharCount: 1500,
      documentQuality: 'moderate',
    }
    const { status, countedInPilotMetrics } = evaluatePilotAdmission(data, meta)
    expect(status).toBe('pilot_eligible_moderate')
    expect(countedInPilotMetrics).toBe(true)
  })
})
