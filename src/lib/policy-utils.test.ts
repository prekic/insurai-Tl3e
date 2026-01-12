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
  normalizeForOCR,
  levenshteinDistance,
  stringSimilarity,
  fuzzyMatchOCR,
  isPolicyIdentifierMatch,
  getPolicyIdentifierSimilarity,
  normalizeStringTolerant,
  arraysEqualTolerant,
  calculatePolicyDiff,
  numbersEqualWithTolerance,
  hasAmendmentMarkers,
  comparePoliciesAdvanced,
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

  // ========================================================================
  // FUZZY MATCHING TESTS FOR OCR TOLERANCE
  // ========================================================================

  describe('normalizeForOCR', () => {
    it('should normalize common OCR substitutions', () => {
      // 0 vs O
      expect(normalizeForOCR('P0L-001')).toBe(normalizeForOCR('POL-OO1'))

      // 1 vs I vs l
      expect(normalizeForOCR('POL-111')).toBe(normalizeForOCR('POL-lll'))
      expect(normalizeForOCR('POL-111')).toBe(normalizeForOCR('POL-III'))
    })

    it('should handle Turkish characters', () => {
      expect(normalizeForOCR('Şekerbank')).toBe('sekerbank')
      expect(normalizeForOCR('Güneş Sigorta')).toBe('gunessigorta')
      // İ (Turkish capital I with dot) maps to 'i', Ö maps to 'o'
      expect(normalizeForOCR('ÖZEL SİGORTA')).toBe('ozeisigorta')
    })

    it('should remove special characters', () => {
      // Note: 0 normalizes to 'o' (OCR confusion), so POL-001 becomes 'poiooi'
      expect(normalizeForOCR('POL-001/2024')).toBe('poiooi2o24')
      expect(normalizeForOCR('POL.001.2024')).toBe('poiooi2o24')
    })
  })

  describe('levenshteinDistance', () => {
    it('should return 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0)
    })

    it('should calculate correct distance for single edits', () => {
      expect(levenshteinDistance('hello', 'hallo')).toBe(1) // substitution
      expect(levenshteinDistance('hello', 'hell')).toBe(1) // deletion
      expect(levenshteinDistance('hello', 'helloo')).toBe(1) // insertion
    })

    it('should handle empty strings', () => {
      expect(levenshteinDistance('', 'hello')).toBe(5)
      expect(levenshteinDistance('hello', '')).toBe(5)
      expect(levenshteinDistance('', '')).toBe(0)
    })
  })

  describe('stringSimilarity', () => {
    it('should return 1 for identical strings', () => {
      expect(stringSimilarity('hello', 'hello')).toBe(1)
    })

    it('should return 0 when one string is empty', () => {
      expect(stringSimilarity('hello', '')).toBe(0)
      expect(stringSimilarity('', 'hello')).toBe(0)
    })

    it('should return high similarity for similar strings', () => {
      const similarity = stringSimilarity('hello', 'hallo')
      expect(similarity).toBeGreaterThan(0.7)
    })
  })

  describe('fuzzyMatchOCR', () => {
    it('should match identical strings', () => {
      expect(fuzzyMatchOCR('POL-001', 'POL-001')).toBe(true)
    })

    it('should match with common OCR errors', () => {
      // 0 vs O confusion
      expect(fuzzyMatchOCR('POL-001', 'POL-OO1')).toBe(true)

      // 1 vs I confusion
      expect(fuzzyMatchOCR('POL-111', 'POL-lll')).toBe(true)
    })

    it('should match Turkish character variations', () => {
      expect(fuzzyMatchOCR('Şekerbank Sigorta', 'Sekerbank Sigorta')).toBe(true)
      expect(fuzzyMatchOCR('Güneş', 'Gunes')).toBe(true)
    })

    it('should not match completely different strings', () => {
      expect(fuzzyMatchOCR('POL-001', 'XYZ-999')).toBe(false)
      expect(fuzzyMatchOCR('Allianz', 'AXA')).toBe(false)
    })

    it('should handle empty strings', () => {
      expect(fuzzyMatchOCR('', '')).toBe(true)
      expect(fuzzyMatchOCR('hello', '')).toBe(false)
    })
  })

  describe('isPolicyIdentifierMatch with fuzzy matching', () => {
    it('should match policies with OCR errors in policy number', () => {
      const policy1 = createMockPolicy({ policyNumber: 'POL-001', provider: 'Allianz' })
      const policy2 = createMockPolicy({ policyNumber: 'POL-OO1', provider: 'Allianz' })

      expect(isPolicyIdentifierMatch(policy1, policy2, true)).toBe(true)
    })

    it('should match policies with Turkish character variations in provider', () => {
      const policy1 = createMockPolicy({ policyNumber: 'POL-001', provider: 'Güneş Sigorta' })
      const policy2 = createMockPolicy({ policyNumber: 'POL-001', provider: 'Gunes Sigorta' })

      expect(isPolicyIdentifierMatch(policy1, policy2, true)).toBe(true)
    })

    it('should match policies with OCR errors in insured person', () => {
      const policy1 = createMockPolicy({
        policyNumber: 'POL-001',
        provider: 'Allianz',
        insuredPerson: 'AHMET YILMAZ'
      })
      const policy2 = createMockPolicy({
        policyNumber: 'POL-001',
        provider: 'Allianz',
        insuredPerson: 'AHМET YILМAZ' // with Cyrillic characters
      })

      expect(isPolicyIdentifierMatch(policy1, policy2, true)).toBe(true)
    })

    it('should not match completely different policies', () => {
      const policy1 = createMockPolicy({ policyNumber: 'POL-001', provider: 'Allianz' })
      const policy2 = createMockPolicy({ policyNumber: 'XYZ-999', provider: 'AXA' })

      expect(isPolicyIdentifierMatch(policy1, policy2, true)).toBe(false)
    })

    it('should use exact matching when fuzzy is disabled', () => {
      const policy1 = createMockPolicy({ policyNumber: 'POL-001', provider: 'Allianz' })
      const policy2 = createMockPolicy({ policyNumber: 'POL-OO1', provider: 'Allianz' })

      expect(isPolicyIdentifierMatch(policy1, policy2, false)).toBe(false)
    })
  })

  describe('getPolicyIdentifierSimilarity', () => {
    it('should return 1 for identical policies', () => {
      const policy1 = createMockPolicy({ policyNumber: 'POL-001', provider: 'Allianz' })
      const policy2 = createMockPolicy({ policyNumber: 'POL-001', provider: 'Allianz' })

      expect(getPolicyIdentifierSimilarity(policy1, policy2)).toBe(1)
    })

    it('should return high similarity for policies with minor OCR errors', () => {
      const policy1 = createMockPolicy({ policyNumber: 'POL-001', provider: 'Allianz' })
      const policy2 = createMockPolicy({ policyNumber: 'POL-OO1', provider: 'Allianz' })

      const similarity = getPolicyIdentifierSimilarity(policy1, policy2)
      expect(similarity).toBeGreaterThan(0.9)
    })

    it('should return low similarity for completely different policies', () => {
      const policy1 = createMockPolicy({ policyNumber: 'POL-001', provider: 'Allianz' })
      const policy2 = createMockPolicy({ policyNumber: 'XYZ-999', provider: 'AXA' })

      const similarity = getPolicyIdentifierSimilarity(policy1, policy2)
      expect(similarity).toBeLessThan(0.5)
    })
  })

  // ========================================================================
  // TOLERANT STRING NORMALIZATION TESTS
  // ========================================================================

  describe('normalizeStringTolerant', () => {
    it('should collapse multiple spaces to single space', () => {
      expect(normalizeStringTolerant('hello    world')).toBe('hello world')
      expect(normalizeStringTolerant('a  b  c')).toBe('a b c')
    })

    it('should normalize colon spacing', () => {
      expect(normalizeStringTolerant('NO: 25')).toBe('no:25')
      expect(normalizeStringTolerant('NO : 25')).toBe('no:25')
      expect(normalizeStringTolerant('NO :25')).toBe('no:25')
    })

    it('should normalize slash spacing', () => {
      expect(normalizeStringTolerant('25 /1A')).toBe('25/1a')
      expect(normalizeStringTolerant('25/ 1A')).toBe('25/1a')
      expect(normalizeStringTolerant('25 / 1A')).toBe('25/1a')
    })

    it('should normalize comma spacing', () => {
      expect(normalizeStringTolerant('Istanbul , Turkey')).toBe('istanbul,turkey')
      expect(normalizeStringTolerant('Istanbul, Turkey')).toBe('istanbul,turkey')
    })

    it('should handle address variations that are effectively the same', () => {
      const addr1 = 'İSTANBUL, ATAŞEHİR, ATAŞEHİR BELEDİYESİ, MUSTAFA KEMAL CAD., NO: 25 /1A'
      const addr2 = 'İSTANBUL, ATAŞEHİR, ATAŞEHİR BELEDİYESİ, MUSTAFA KEMAL CAD., NO: 25/1A'
      expect(normalizeStringTolerant(addr1)).toBe(normalizeStringTolerant(addr2))
    })

    it('should handle empty and null values', () => {
      expect(normalizeStringTolerant('')).toBe('')
      expect(normalizeStringTolerant(null)).toBe('')
      expect(normalizeStringTolerant(undefined)).toBe('')
    })
  })

  // ========================================================================
  // TOLERANT ARRAY COMPARISON TESTS
  // ========================================================================

  describe('arraysEqualTolerant', () => {
    it('should return true for identical arrays', () => {
      expect(arraysEqualTolerant(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(true)
    })

    it('should return true for arrays with same items in different order', () => {
      expect(arraysEqualTolerant(['a', 'b', 'c'], ['c', 'a', 'b'])).toBe(true)
    })

    it('should return true for arrays with whitespace differences', () => {
      expect(arraysEqualTolerant(
        ['hello  world', 'foo   bar'],
        ['hello world', 'foo bar']
      )).toBe(true)
    })

    it('should return false for arrays with different lengths', () => {
      expect(arraysEqualTolerant(['a', 'b'], ['a', 'b', 'c'])).toBe(false)
    })

    it('should return false for arrays with different content', () => {
      expect(arraysEqualTolerant(['a', 'b'], ['x', 'y'])).toBe(false)
    })

    it('should handle empty arrays', () => {
      expect(arraysEqualTolerant([], [])).toBe(true)
      expect(arraysEqualTolerant(null, null)).toBe(true)
      expect(arraysEqualTolerant(undefined, undefined)).toBe(true)
    })

    it('should handle object arrays with name/description', () => {
      const arr1 = [{ name: 'Coverage A', description: 'Full coverage' }]
      const arr2 = [{ name: 'Coverage A', description: 'Full  coverage' }] // extra space
      expect(arraysEqualTolerant(arr1, arr2)).toBe(true)
    })

    it('should handle arrays with OCR-like errors', () => {
      expect(arraysEqualTolerant(
        ['POL-001', 'Coverage'],
        ['POL-OO1', 'Coverage'] // O vs 0
      )).toBe(true)
    })
  })

  // ========================================================================
  // POLICY DIFF CALCULATION TESTS WITH TOLERANCE
  // ========================================================================

  describe('calculatePolicyDiff with tolerance', () => {
    it('should not flag identical policies as different', () => {
      const policy1 = createMockPolicy()
      const policy2 = createMockPolicy()

      const diff = calculatePolicyDiff(policy1, policy2)
      expect(diff).toHaveLength(0)
    })

    it('should not flag address differences that are just whitespace/punctuation', () => {
      const policy1 = createMockPolicy({
        location: 'İSTANBUL, ATAŞEHİR, MUSTAFA KEMAL CAD., NO: 25 /1A'
      })
      const policy2 = createMockPolicy({
        location: 'İSTANBUL, ATAŞEHİR, MUSTAFA KEMAL CAD., NO: 25/1A'
      })

      const diff = calculatePolicyDiff(policy1, policy2)
      const locationDiff = diff.find(d => d.field === 'location')
      expect(locationDiff).toBeUndefined()
    })

    it('should not flag coverage arrays with only whitespace differences', () => {
      const policy1 = createMockPolicy({
        coverages: [
          { name: 'Collision', limit: 100000, description: 'Full collision  coverage' }
        ]
      })
      const policy2 = createMockPolicy({
        coverages: [
          { name: 'Collision', limit: 100000, description: 'Full collision coverage' }
        ]
      })

      const diff = calculatePolicyDiff(policy1, policy2)
      const coveragesDiff = diff.find(d => d.field === 'coverages')
      expect(coveragesDiff).toBeUndefined()
    })

    it('should detect real changes in coverage amount', () => {
      const policy1 = createMockPolicy({ coverage: 100000 })
      const policy2 = createMockPolicy({ coverage: 200000 })

      const diff = calculatePolicyDiff(policy1, policy2)
      const coverageDiff = diff.find(d => d.field === 'coverage')
      expect(coverageDiff).toBeDefined()
      expect(coverageDiff?.significance).toBe('critical')
    })

    it('should detect real changes in exclusion count', () => {
      const policy1 = createMockPolicy({
        exclusions: ['Flood damage']
      })
      const policy2 = createMockPolicy({
        exclusions: ['Flood damage', 'Earthquake damage']
      })

      const diff = calculatePolicyDiff(policy1, policy2)
      const exclusionsDiff = diff.find(d => d.field === 'exclusions')
      expect(exclusionsDiff).toBeDefined()
    })

    it('should handle insured person name with minor OCR variations', () => {
      const policy1 = createMockPolicy({ insuredPerson: 'AHMET YILMAZ' })
      const policy2 = createMockPolicy({ insuredPerson: 'AHMET YlLMAZ' }) // l vs I

      const diff = calculatePolicyDiff(policy1, policy2)
      const insuredDiff = diff.find(d => d.field === 'insuredPerson')
      // Should not flag this as a difference due to OCR tolerance
      expect(insuredDiff).toBeUndefined()
    })
  })

  // ============================================================================
  // NEW TESTS: Numeric Tolerance for AI Extraction Variance
  // ============================================================================
  describe('numbersEqualWithTolerance', () => {
    it('should consider numbers within 2% tolerance as equal', () => {
      // ₺5,153,000 vs ₺5,203,000 = 0.97% difference < 2%
      expect(numbersEqualWithTolerance(5153000, 5203000)).toBe(true)
    })

    it('should consider numbers beyond 2% tolerance as different', () => {
      // ₺100,000 vs ₺200,000 = 100% difference > 2%
      expect(numbersEqualWithTolerance(100000, 200000)).toBe(false)
    })

    it('should handle null values', () => {
      expect(numbersEqualWithTolerance(null, null)).toBe(true)
      expect(numbersEqualWithTolerance(null, 100)).toBe(false)
      expect(numbersEqualWithTolerance(100, null)).toBe(false)
    })

    it('should handle zero values', () => {
      expect(numbersEqualWithTolerance(0, 0)).toBe(true)
      expect(numbersEqualWithTolerance(0, 1)).toBe(false)
    })

    it('should accept custom tolerance', () => {
      // 10% difference with 5% tolerance = not equal
      expect(numbersEqualWithTolerance(100, 110, 0.05)).toBe(false)
      // 10% difference with 15% tolerance = equal
      expect(numbersEqualWithTolerance(100, 110, 0.15)).toBe(true)
    })

    it('should handle the exact case from the user report', () => {
      // User reported: ₺5.153.000 vs ₺5.203.000
      expect(numbersEqualWithTolerance(5153000, 5203000)).toBe(true)
    })
  })

  // ============================================================================
  // NEW TESTS: Amendment Marker Detection
  // ============================================================================
  describe('hasAmendmentMarkers', () => {
    it('should return false for policy without amendmentInfo', () => {
      const policy = createMockPolicy()
      expect(hasAmendmentMarkers(policy)).toBe(false)
    })

    it('should return true for policy with isAmendment flag', () => {
      const policy = createMockPolicy({
        amendmentInfo: {
          isAmendment: true,
          amendmentNumber: '1/2024',
          amendmentDate: '2024-06-01',
          basePolicyNumber: 'POL-001',
          amendmentReason: 'Sigortalı Talebi',
          premiumDifference: 300,
        },
      })
      expect(hasAmendmentMarkers(policy)).toBe(true)
    })

    it('should return true for policy with amendment number even if isAmendment is false', () => {
      const policy = createMockPolicy({
        amendmentInfo: {
          isAmendment: false,
          amendmentNumber: '1/2024',
          amendmentDate: null,
          basePolicyNumber: null,
          amendmentReason: null,
          premiumDifference: null,
        },
      })
      expect(hasAmendmentMarkers(policy)).toBe(true)
    })

    it('should return false for policy with empty amendmentInfo', () => {
      const policy = createMockPolicy({
        amendmentInfo: {
          isAmendment: false,
          amendmentNumber: null,
          amendmentDate: null,
          basePolicyNumber: null,
          amendmentReason: null,
          premiumDifference: null,
        },
      })
      expect(hasAmendmentMarkers(policy)).toBe(false)
    })
  })

  // ============================================================================
  // NEW TESTS: Advanced Policy Comparison (Amendment vs Extraction Variance)
  // ============================================================================
  describe('comparePoliciesAdvanced', () => {
    it('should return noConflict for different policies', () => {
      const policy1 = createMockPolicy({ policyNumber: 'POL-001', provider: 'Provider A' })
      const policy2 = createMockPolicy({ policyNumber: 'POL-002', provider: 'Provider B' })

      const result = comparePoliciesAdvanced(policy2, policy1)
      expect(result.type).toBe('noConflict')
    })

    it('should return exactDuplicate for identical policies', () => {
      const policy1 = createMockPolicy()
      const policy2 = createMockPolicy()

      const result = comparePoliciesAdvanced(policy2, policy1)
      expect(result.type).toBe('exactDuplicate')
    })

    it('should return extractionVariance for same policy with minor numeric differences', () => {
      const policy1 = createMockPolicy({ coverage: 5153000, premium: 10000 })
      const policy2 = createMockPolicy({ coverage: 5203000, premium: 10100 }) // ~1% diff

      const result = comparePoliciesAdvanced(policy2, policy1)
      // Should be exactDuplicate or extractionVariance since diff is within tolerance
      expect(['exactDuplicate', 'extractionVariance'].includes(result.type)).toBe(true)
    })

    it('should return verified amendment for policy with amendment markers', () => {
      const policy1 = createMockPolicy({ coverage: 500000, premium: 5000 })
      const policy2 = createMockPolicy({
        coverage: 600000,
        premium: 5500,
        amendmentInfo: {
          isAmendment: true,
          amendmentNumber: '1/2024',
          amendmentDate: '2024-06-01',
          basePolicyNumber: 'POL-001',
          amendmentReason: 'Teminat Eklenmesi',
          premiumDifference: 500,
        },
      })

      const result = comparePoliciesAdvanced(policy2, policy1)
      expect(result.type).toBe('amendment')
      if (result.type === 'amendment') {
        expect(result.isVerifiedAmendment).toBe(true)
        expect(result.changes.length).toBeGreaterThan(0)
      }
    })

    it('should return unverified amendment for major differences without markers', () => {
      const policy1 = createMockPolicy({ coverage: 100000, premium: 5000 })
      const policy2 = createMockPolicy({ coverage: 200000, premium: 10000 }) // 100% diff

      const result = comparePoliciesAdvanced(policy2, policy1)
      expect(result.type).toBe('amendment')
      if (result.type === 'amendment') {
        expect(result.isVerifiedAmendment).toBe(false)
      }
    })
  })

  // ============================================================================
  // NEW TESTS: calculatePolicyDiff with tolerantMode option
  // ============================================================================
  describe('calculatePolicyDiff with tolerantMode', () => {
    it('should ignore small numeric differences in tolerant mode', () => {
      const policy1 = createMockPolicy({ coverage: 5153000 })
      const policy2 = createMockPolicy({ coverage: 5203000 }) // ~1% diff

      const tolerantDiff = calculatePolicyDiff(policy1, policy2, { tolerantMode: true })
      const strictDiff = calculatePolicyDiff(policy1, policy2, { tolerantMode: false })

      // Tolerant mode should not flag the coverage difference
      expect(tolerantDiff.find(d => d.field === 'coverage')).toBeUndefined()
      // Strict mode should flag the coverage difference
      expect(strictDiff.find(d => d.field === 'coverage')).toBeDefined()
    })

    it('should flag large numeric differences even in tolerant mode', () => {
      const policy1 = createMockPolicy({ coverage: 100000 })
      const policy2 = createMockPolicy({ coverage: 200000 }) // 100% diff

      const tolerantDiff = calculatePolicyDiff(policy1, policy2, { tolerantMode: true })
      expect(tolerantDiff.find(d => d.field === 'coverage')).toBeDefined()
    })

    it('should use tolerant mode by default', () => {
      const policy1 = createMockPolicy({ coverage: 5153000 })
      const policy2 = createMockPolicy({ coverage: 5203000 })

      const defaultDiff = calculatePolicyDiff(policy1, policy2)
      expect(defaultDiff.find(d => d.field === 'coverage')).toBeUndefined()
    })
  })
})
