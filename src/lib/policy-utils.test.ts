import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  isNewPolicy,
  isSessionNewPolicy,
  findDuplicatePolicies,
  checkForDuplicate,
  groupDuplicatePolicies,
  getSimilarityLabel,
  getSimilarityLabelTr,
  createPolicyTimestamp,
  ensurePolicyTimestamps,
} from './policy-utils'
import type { Policy } from '@/types/policy'

// Helper to create a mock policy
const createMockPolicy = (overrides: Partial<Policy> = {}): Policy => ({
  id: 'test-id',
  policyNumber: 'POL-001',
  provider: 'Test Provider',
  logo: '🏢',
  type: 'auto_kasko',
  typeTr: 'Kasko',
  coverage: 100000,
  premium: 5000,
  monthlyPremium: 417,
  deductible: 1000,
  startDate: '2024-01-01',
  expiryDate: '2025-01-01',
  status: 'active',
  uploadDate: '2024-01-01',
  fileName: 'test.pdf',
  documentType: 'policy',
  coverages: [],
  exclusions: [],
  specialConditions: [],
  insuranceLine: 'auto',
  ...overrides,
})

describe('policy-utils', () => {
  describe('isNewPolicy', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return true for policies created within 24 hours', () => {
      const now = new Date('2024-06-15T12:00:00Z')
      vi.setSystemTime(now)

      const policy = createMockPolicy({
        createdAt: '2024-06-15T10:00:00Z', // 2 hours ago
      })

      expect(isNewPolicy(policy)).toBe(true)
    })

    it('should return false for policies older than 24 hours', () => {
      const now = new Date('2024-06-15T12:00:00Z')
      vi.setSystemTime(now)

      const policy = createMockPolicy({
        createdAt: '2024-06-13T10:00:00Z', // 2 days ago
      })

      expect(isNewPolicy(policy)).toBe(false)
    })

    it('should return false for policies without createdAt', () => {
      const policy = createMockPolicy({
        createdAt: undefined,
      })

      expect(isNewPolicy(policy)).toBe(false)
    })

    it('should respect custom threshold', () => {
      const now = new Date('2024-06-15T12:00:00Z')
      vi.setSystemTime(now)

      const policy = createMockPolicy({
        createdAt: '2024-06-15T11:00:00Z', // 1 hour ago
      })

      // 30 minutes threshold
      expect(isNewPolicy(policy, 30 * 60 * 1000)).toBe(false)
      // 2 hours threshold
      expect(isNewPolicy(policy, 2 * 60 * 60 * 1000)).toBe(true)
    })
  })

  describe('isSessionNewPolicy', () => {
    it('should return true for policies created after session start', () => {
      const sessionStart = '2024-06-15T10:00:00Z'
      const policy = createMockPolicy({
        createdAt: '2024-06-15T11:00:00Z',
      })

      expect(isSessionNewPolicy(policy, sessionStart)).toBe(true)
    })

    it('should return false for policies created before session start', () => {
      const sessionStart = '2024-06-15T10:00:00Z'
      const policy = createMockPolicy({
        createdAt: '2024-06-15T09:00:00Z',
      })

      expect(isSessionNewPolicy(policy, sessionStart)).toBe(false)
    })

    it('should return false for policies without createdAt', () => {
      const sessionStart = '2024-06-15T10:00:00Z'
      const policy = createMockPolicy({
        createdAt: undefined,
      })

      expect(isSessionNewPolicy(policy, sessionStart)).toBe(false)
    })
  })

  describe('findDuplicatePolicies', () => {
    it('should find exact duplicates (same policyNumber, provider, coverage, premium, dates)', () => {
      const policy1 = createMockPolicy({ id: 'p1' })
      const policy2 = createMockPolicy({ id: 'p2' }) // Same everything except id

      const duplicates = findDuplicatePolicies([policy1, policy2])

      expect(duplicates).toHaveLength(1)
      expect(duplicates[0].similarity).toBe('exact')
      expect(duplicates[0].policy.id).toBe('p2')
      expect(duplicates[0].duplicateOf.id).toBe('p1')
    })

    it('should find high similarity duplicates (same policyNumber + provider)', () => {
      const policy1 = createMockPolicy({ id: 'p1', policyNumber: 'POL-001' })
      const policy2 = createMockPolicy({
        id: 'p2',
        policyNumber: 'POL-001',
        coverage: 200000, // Different coverage
        premium: 6000, // Different premium
      })

      const duplicates = findDuplicatePolicies([policy1, policy2])

      expect(duplicates).toHaveLength(1)
      expect(duplicates[0].similarity).toBe('high')
      expect(duplicates[0].matchedFields).toContain('policyNumber')
      expect(duplicates[0].matchedFields).toContain('provider')
    })

    it('should find medium similarity duplicates', () => {
      const policy1 = createMockPolicy({
        id: 'p1',
        policyNumber: 'POL-001',
        coverage: 100000,
      })
      const policy2 = createMockPolicy({
        id: 'p2',
        policyNumber: 'POL-002', // Different policy number
        coverage: 100000, // Same coverage
        premium: 5000, // Same premium
        startDate: '2024-02-01', // Different date
        expiryDate: '2025-02-01', // Different date
      })

      const duplicates = findDuplicatePolicies([policy1, policy2])

      expect(duplicates).toHaveLength(1)
      expect(duplicates[0].similarity).toBe('medium')
    })

    it('should not flag non-duplicate policies', () => {
      const policy1 = createMockPolicy({
        id: 'p1',
        policyNumber: 'POL-001',
        provider: 'Provider A',
        coverage: 100000,
      })
      const policy2 = createMockPolicy({
        id: 'p2',
        policyNumber: 'POL-002',
        provider: 'Provider B',
        coverage: 200000,
        premium: 8000,
        startDate: '2024-03-01',
        expiryDate: '2025-03-01',
      })

      const duplicates = findDuplicatePolicies([policy1, policy2])

      expect(duplicates).toHaveLength(0)
    })

    it('should return empty array for single policy', () => {
      const policy = createMockPolicy()

      const duplicates = findDuplicatePolicies([policy])

      expect(duplicates).toHaveLength(0)
    })

    it('should return empty array for empty list', () => {
      const duplicates = findDuplicatePolicies([])

      expect(duplicates).toHaveLength(0)
    })
  })

  describe('checkForDuplicate', () => {
    it('should return duplicate info when found', () => {
      const existingPolicies = [
        createMockPolicy({ id: 'existing-1', policyNumber: 'POL-001' }),
      ]
      const newPolicy = createMockPolicy({ id: 'new-1', policyNumber: 'POL-001' })

      const result = checkForDuplicate(newPolicy, existingPolicies)

      expect(result).not.toBeNull()
      expect(result?.policy.id).toBe('new-1')
      expect(result?.duplicateOf.id).toBe('existing-1')
    })

    it('should return null when no duplicate found', () => {
      const existingPolicies = [
        createMockPolicy({ id: 'existing-1', policyNumber: 'POL-001' }),
      ]
      const newPolicy = createMockPolicy({
        id: 'new-1',
        policyNumber: 'POL-999',
        provider: 'Different Provider',
        coverage: 999999,
      })

      const result = checkForDuplicate(newPolicy, existingPolicies)

      expect(result).toBeNull()
    })

    it('should not match policy with itself', () => {
      const policy = createMockPolicy({ id: 'same-id' })

      const result = checkForDuplicate(policy, [policy])

      expect(result).toBeNull()
    })
  })

  describe('groupDuplicatePolicies', () => {
    it('should group duplicates correctly', () => {
      const original = createMockPolicy({ id: 'original' })
      const dup1 = createMockPolicy({ id: 'dup1' })
      const unique = createMockPolicy({
        id: 'unique',
        policyNumber: 'POL-999',
        provider: 'Different Provider',
        coverage: 999999,
        premium: 9999,
        startDate: '2025-01-01',
        expiryDate: '2026-01-01',
      })

      const { uniquePolicies, duplicateGroups } = groupDuplicatePolicies([
        original,
        dup1,
        unique,
      ])

      // Original and unique should be in uniquePolicies (dup1 is filtered as duplicate)
      expect(uniquePolicies).toHaveLength(2)
      expect(uniquePolicies.map(p => p.id)).toContain('original')
      expect(uniquePolicies.map(p => p.id)).toContain('unique')

      // There should be one group with original + duplicate
      expect(duplicateGroups.size).toBe(1)
      const group = duplicateGroups.get('original')
      expect(group).toHaveLength(2) // original + 1 duplicate
    })

    it('should handle multiple independent duplicate pairs', () => {
      const policy1a = createMockPolicy({ id: 'p1a', policyNumber: 'POL-001' })
      const policy1b = createMockPolicy({ id: 'p1b', policyNumber: 'POL-001' }) // dup of p1a
      const policy2a = createMockPolicy({
        id: 'p2a',
        policyNumber: 'POL-002',
        provider: 'Other Provider',
        coverage: 200000,
      })
      const policy2b = createMockPolicy({
        id: 'p2b',
        policyNumber: 'POL-002',
        provider: 'Other Provider',
        coverage: 200000,
      }) // dup of p2a

      const { uniquePolicies, duplicateGroups } = groupDuplicatePolicies([
        policy1a,
        policy1b,
        policy2a,
        policy2b,
      ])

      // Both originals should be unique
      expect(uniquePolicies.map(p => p.id)).toContain('p1a')
      expect(uniquePolicies.map(p => p.id)).toContain('p2a')

      // Should have groups for both duplicate pairs
      expect(duplicateGroups.size).toBeGreaterThanOrEqual(2)
    })
  })

  describe('getSimilarityLabel', () => {
    it('should return correct English labels', () => {
      expect(getSimilarityLabel('exact')).toBe('Exact duplicate')
      expect(getSimilarityLabel('high')).toBe('Very similar')
      expect(getSimilarityLabel('medium')).toBe('Possibly duplicate')
    })
  })

  describe('getSimilarityLabelTr', () => {
    it('should return correct Turkish labels', () => {
      expect(getSimilarityLabelTr('exact')).toBe('Birebir kopya')
      expect(getSimilarityLabelTr('high')).toBe('Çok benzer')
      expect(getSimilarityLabelTr('medium')).toBe('Muhtemel kopya')
    })
  })

  describe('createPolicyTimestamp', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should return ISO timestamp string', () => {
      const now = new Date('2024-06-15T12:00:00Z')
      vi.setSystemTime(now)

      const timestamp = createPolicyTimestamp()

      expect(timestamp).toBe('2024-06-15T12:00:00.000Z')
    })
  })

  describe('ensurePolicyTimestamps', () => {
    beforeEach(() => {
      vi.useFakeTimers()
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    it('should add createdAt to policies without it', () => {
      const now = new Date('2024-06-15T12:00:00Z')
      vi.setSystemTime(now)

      const policy = createMockPolicy({ createdAt: undefined })

      const result = ensurePolicyTimestamps([policy])

      expect(result[0].createdAt).toBe('2024-06-15T12:00:00.000Z')
    })

    it('should preserve existing createdAt', () => {
      const now = new Date('2024-06-15T12:00:00Z')
      vi.setSystemTime(now)

      const existingTimestamp = '2024-01-01T00:00:00.000Z'
      const policy = createMockPolicy({ createdAt: existingTimestamp })

      const result = ensurePolicyTimestamps([policy])

      expect(result[0].createdAt).toBe(existingTimestamp)
    })
  })
})
