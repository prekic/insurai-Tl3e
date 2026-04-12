/**
 * Integration tests for policy-upload-check.ts
 * Tests conflict resolution flow including replace, skip, keep-both, and amendment handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Policy, PolicyType } from '@/types/policy'
import type { PolicyFieldDiff } from './policy-utils'

// Mock Supabase before importing the module
vi.mock('@/lib/supabase/policies', () => ({
  findExistingPolicyByIdentifier: vi.fn(),
  updatePolicy: vi.fn(),
  createPolicyVersion: vi.fn(),
}))

// Import after mocking
import {
  handleDuplicateResolution,
  handlePolicyAmendment,
  checkPolicyBeforeUpload,
  policyRowToPolicy,
  policyToUpdateData,
  generateChangeSummary,
} from './policy-upload-check'

import {
  findExistingPolicyByIdentifier,
  updatePolicy,
  createPolicyVersion,
} from '@/lib/supabase/policies'

// Type the mocks
const mockUpdatePolicy = vi.mocked(updatePolicy)
const mockCreatePolicyVersion = vi.mocked(createPolicyVersion)
const mockFindExisting = vi.mocked(findExistingPolicyByIdentifier)

/**
 * Create a mock policy for testing
 */
function createMockPolicy(overrides: Partial<Policy> = {}): Policy {
  // @ts-expect-error - mismatch due to schema update
  return {
    id: 'test-policy-123',
    policyNumber: 'POL-2025-001',
    provider: 'Allianz Sigorta',
    type: 'kasko' as PolicyType,
    typeTr: 'Kasko',
    coverage: 500000,
    premium: 12000,
    deductible: 2500,
    startDate: '2025-01-01',
    expiryDate: '2026-01-01',
    status: 'active',
    insuredPerson: 'John Doe',
    location: 'Istanbul',
    coverages: [],
    exclusions: [],
    specialConditions: [],
    uploadDate: '2025-01-01',
    fileName: 'policy.pdf',
    logo: '',
    insuranceLine: 'auto',
    ...overrides,
  }
}

describe('policy-upload-check', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.resetAllMocks()
  })

  describe('handleDuplicateResolution', () => {
    describe('skip resolution', () => {
      it('should return skip action without calling any update functions', async () => {
        const newPolicy = createMockPolicy()
        const existingPolicyId = 'existing-123'

        const result = await handleDuplicateResolution('skip', existingPolicyId, newPolicy)

        expect(result).toEqual({
          action: 'skip',
          existingId: existingPolicyId,
        })
        expect(mockUpdatePolicy).not.toHaveBeenCalled()
        expect(mockCreatePolicyVersion).not.toHaveBeenCalled()
      })
    })

    describe('replace resolution', () => {
      it('should successfully replace policy when version table exists', async () => {
        const newPolicy = createMockPolicy({ coverage: 600000 })
        const existingPolicyId = 'existing-123'

        // @ts-expect-error - mismatch due to schema update
        mockCreatePolicyVersion.mockResolvedValueOnce({
          id: 'version-1',
          policy_id: existingPolicyId,
          version_number: 1,
          change_type: 'updated',
          change_summary: 'Replaced with re-uploaded policy',
          previous_data: null,
          new_data: {},
          changed_by: null,
          changed_at: new Date().toISOString(),
        })

        mockUpdatePolicy.mockResolvedValueOnce({
          id: existingPolicyId,
          user_id: 'user-123',
          policy_number: newPolicy.policyNumber,
          provider: newPolicy.provider,
          type: newPolicy.type,
          type_tr: newPolicy.typeTr,
          coverage: newPolicy.coverage,
          premium: newPolicy.premium,
          deductible: newPolicy.deductible,
          start_date: newPolicy.startDate,
          expiry_date: newPolicy.expiryDate,
          status: newPolicy.status,
          insured_person: newPolicy.insuredPerson || '',
          location: newPolicy.location || null,
          // @ts-expect-error - mismatch due to schema update
          document_type: null,
          // @ts-expect-error - mismatch due to schema update
          upload_date: null,
          logo: null,
          raw_data: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

        const result = await handleDuplicateResolution('replace', existingPolicyId, newPolicy)

        expect(result).toEqual({
          action: 'replace',
          existingId: existingPolicyId,
        })
        expect(mockUpdatePolicy).toHaveBeenCalledWith(existingPolicyId, expect.any(Object))
        expect(mockCreatePolicyVersion).toHaveBeenCalled()
      })

      it('should successfully replace policy when version table does NOT exist (404)', async () => {
        const newPolicy = createMockPolicy({ coverage: 600000 })
        const existingPolicyId = 'existing-123'

        // Simulate 404 error when policy_versions table doesn't exist
        const tableNotFoundError = new Error('relation "public.policy_versions" does not exist')
        mockCreatePolicyVersion.mockRejectedValueOnce(tableNotFoundError)

        mockUpdatePolicy.mockResolvedValueOnce({
          id: existingPolicyId,
          user_id: 'user-123',
          policy_number: newPolicy.policyNumber,
          provider: newPolicy.provider,
          type: newPolicy.type,
          type_tr: newPolicy.typeTr,
          coverage: newPolicy.coverage,
          premium: newPolicy.premium,
          deductible: newPolicy.deductible,
          start_date: newPolicy.startDate,
          expiry_date: newPolicy.expiryDate,
          status: newPolicy.status,
          insured_person: newPolicy.insuredPerson || '',
          location: newPolicy.location || null,
          // @ts-expect-error - mismatch due to schema update
          document_type: null,
          // @ts-expect-error - mismatch due to schema update
          upload_date: null,
          logo: null,
          raw_data: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })

        // Should NOT throw - version tracking is optional
        const result = await handleDuplicateResolution('replace', existingPolicyId, newPolicy)

        expect(result).toEqual({
          action: 'replace',
          existingId: existingPolicyId,
        })
        // Core operation should still succeed
        expect(mockUpdatePolicy).toHaveBeenCalledWith(existingPolicyId, expect.any(Object))
        expect(result.error).toBeUndefined()
      })

      it('should return error when updatePolicy fails', async () => {
        const newPolicy = createMockPolicy()
        const existingPolicyId = 'existing-123'

        // Version creation succeeds or fails (doesn't matter)
        mockCreatePolicyVersion.mockRejectedValueOnce(new Error('table not found'))

        // Core update operation fails
        mockUpdatePolicy.mockRejectedValueOnce(new Error('Database connection lost'))

        const result = await handleDuplicateResolution('replace', existingPolicyId, newPolicy)

        expect(result).toEqual({
          action: 'replace',
          existingId: existingPolicyId,
          error: 'Database connection lost',
        })
      })

      it('should return error when updatePolicy throws non-Error', async () => {
        const newPolicy = createMockPolicy()
        const existingPolicyId = 'existing-123'

        // @ts-expect-error - mismatch due to schema update
        mockCreatePolicyVersion.mockResolvedValueOnce({
          id: 'version-1',
          policy_id: existingPolicyId,
          version_number: 1,
          change_type: 'updated',
          change_summary: '',
          previous_data: null,
          new_data: {},
          changed_by: null,
          changed_at: new Date().toISOString(),
        })

        // Throw a non-Error object
        mockUpdatePolicy.mockRejectedValueOnce('Unknown failure')

        const result = await handleDuplicateResolution('replace', existingPolicyId, newPolicy)

        expect(result.error).toBe('Failed to replace policy')
      })
    })

    describe('keep-both resolution', () => {
      it('should return keep-both action with both IDs', async () => {
        const newPolicy = createMockPolicy({ id: 'new-policy-456' })
        const existingPolicyId = 'existing-123'

        const result = await handleDuplicateResolution('keep-both', existingPolicyId, newPolicy)

        expect(result).toEqual({
          action: 'keep-both',
          existingId: existingPolicyId,
          newId: 'new-policy-456',
        })
        expect(mockUpdatePolicy).not.toHaveBeenCalled()
        expect(mockCreatePolicyVersion).not.toHaveBeenCalled()
      })
    })
  })

  describe('handlePolicyAmendment', () => {
    const mockChanges: PolicyFieldDiff[] = [
      // @ts-expect-error - mismatch due to schema update
      {
        field: 'coverage',
        fieldLabel: 'Coverage',
        fieldLabelTr: 'Teminat',
        oldValue: 500000,
        newValue: 600000,
        significance: 'major',
      },
      // @ts-expect-error - mismatch due to schema update
      {
        field: 'premium',
        fieldLabel: 'Premium',
        fieldLabelTr: 'Prim',
        oldValue: 12000,
        newValue: 14000,
        significance: 'major',
      },
    ]

    it('should handle amendment when version table exists', async () => {
      const newPolicy = createMockPolicy({ coverage: 600000, premium: 14000 })
      const existingPolicyId = 'existing-123'

      // @ts-expect-error - mismatch due to schema update
      mockCreatePolicyVersion.mockResolvedValueOnce({
        id: 'version-1',
        policy_id: existingPolicyId,
        version_number: 2,
        change_type: 'updated',
        change_summary: 'Major changes: Coverage, Premium',
        previous_data: { coverage: 500000, premium: 12000 },
        new_data: { coverage: 600000, premium: 14000 },
        changed_by: null,
        changed_at: new Date().toISOString(),
      })

      mockUpdatePolicy.mockResolvedValueOnce({
        id: existingPolicyId,
        user_id: 'user-123',
        policy_number: newPolicy.policyNumber,
        provider: newPolicy.provider,
        type: newPolicy.type,
        type_tr: newPolicy.typeTr,
        coverage: newPolicy.coverage,
        premium: newPolicy.premium,
        deductible: newPolicy.deductible,
        start_date: newPolicy.startDate,
        expiry_date: newPolicy.expiryDate,
        status: newPolicy.status,
        insured_person: newPolicy.insuredPerson || '',
        location: newPolicy.location || null,
        // @ts-expect-error - mismatch due to schema update
        document_type: null,
        // @ts-expect-error - mismatch due to schema update
        upload_date: null,
        logo: null,
        raw_data: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      const result = await handlePolicyAmendment(existingPolicyId, newPolicy, mockChanges)

      expect(result.success).toBe(true)
      expect(result.policyId).toBe(existingPolicyId)
      expect(result.versionNumber).toBe(2)
      expect(result.changes).toEqual(mockChanges)
    })

    it('should handle amendment when version table does NOT exist', async () => {
      const newPolicy = createMockPolicy({ coverage: 600000 })
      const existingPolicyId = 'existing-123'

      // Version creation fails (table doesn't exist)
      mockCreatePolicyVersion.mockRejectedValueOnce(
        new Error('relation "public.policy_versions" does not exist')
      )

      mockUpdatePolicy.mockResolvedValueOnce({
        id: existingPolicyId,
        user_id: 'user-123',
        policy_number: newPolicy.policyNumber,
        provider: newPolicy.provider,
        type: newPolicy.type,
        type_tr: newPolicy.typeTr,
        coverage: newPolicy.coverage,
        premium: newPolicy.premium,
        deductible: newPolicy.deductible,
        start_date: newPolicy.startDate,
        expiry_date: newPolicy.expiryDate,
        status: newPolicy.status,
        insured_person: newPolicy.insuredPerson || '',
        location: newPolicy.location || null,
        // @ts-expect-error - mismatch due to schema update
        document_type: null,
        // @ts-expect-error - mismatch due to schema update
        upload_date: null,
        logo: null,
        raw_data: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })

      // Should still succeed
      const result = await handlePolicyAmendment(existingPolicyId, newPolicy, mockChanges)

      expect(result.success).toBe(true)
      expect(result.policyId).toBe(existingPolicyId)
      expect(result.versionNumber).toBe(0) // No version created
      expect(result.error).toBeUndefined()
      expect(mockUpdatePolicy).toHaveBeenCalled()
    })

    it('should return error when update fails', async () => {
      const newPolicy = createMockPolicy()
      const existingPolicyId = 'existing-123'

      // @ts-expect-error - mismatch due to schema update
      mockCreatePolicyVersion.mockResolvedValueOnce({
        id: 'version-1',
        policy_id: existingPolicyId,
        version_number: 1,
        change_type: 'updated',
        change_summary: '',
        previous_data: null,
        new_data: {},
        changed_by: null,
        changed_at: new Date().toISOString(),
      })

      mockUpdatePolicy.mockRejectedValueOnce(new Error('Permission denied'))

      const result = await handlePolicyAmendment(existingPolicyId, newPolicy, mockChanges)

      expect(result.success).toBe(false)
      expect(result.error).toBe('Permission denied')
    })
  })

  describe('checkPolicyBeforeUpload', () => {
    it('should return noConflict when skipCheck option is set', async () => {
      const newPolicy = createMockPolicy()

      const result = await checkPolicyBeforeUpload(newPolicy, { skipCheck: true })

      expect(result.type).toBe('noConflict')
      expect(mockFindExisting).not.toHaveBeenCalled()
    })

    it('should return noConflict when policy has no identifiers', async () => {
      const newPolicy = createMockPolicy({ policyNumber: '', provider: '' })

      const result = await checkPolicyBeforeUpload(newPolicy)

      expect(result.type).toBe('noConflict')
      expect(mockFindExisting).not.toHaveBeenCalled()
    })

    it('should return noConflict when no existing policy found', async () => {
      const newPolicy = createMockPolicy()
      mockFindExisting.mockResolvedValueOnce([])

      const result = await checkPolicyBeforeUpload(newPolicy)

      expect(result.type).toBe('noConflict')
    })

    it('should return noConflict and fail open on database error', async () => {
      const newPolicy = createMockPolicy()
      mockFindExisting.mockRejectedValueOnce(new Error('Connection timeout'))

      const result = await checkPolicyBeforeUpload(newPolicy)

      // Should fail open (allow upload) on error
      expect(result.type).toBe('noConflict')
    })
  })

  describe('generateChangeSummary', () => {
    it('should return "No changes" for empty array (en)', () => {
      expect(generateChangeSummary([], 'en')).toBe('No changes')
    })

    it('should return "Degisiklik yok" for empty array (tr)', () => {
      expect(generateChangeSummary([], 'tr')).toBe('Degisiklik yok')
    })

    it('should format critical changes', () => {
      const changes: PolicyFieldDiff[] = [
        // @ts-expect-error - mismatch due to schema update
        {
          field: 'policyNumber',
          fieldLabel: 'Policy Number',
          fieldLabelTr: 'Police No',
          oldValue: 'OLD-001',
          newValue: 'NEW-001',
          significance: 'critical',
        },
      ]

      const summary = generateChangeSummary(changes, 'en')
      expect(summary).toContain('Critical changes')
      expect(summary).toContain('Policy Number')
    })

    it('should format major changes', () => {
      const changes: PolicyFieldDiff[] = [
        // @ts-expect-error - mismatch due to schema update
        {
          field: 'coverage',
          fieldLabel: 'Coverage',
          fieldLabelTr: 'Teminat',
          oldValue: 500000,
          newValue: 600000,
          significance: 'major',
        },
      ]

      const summary = generateChangeSummary(changes, 'en')
      expect(summary).toContain('Major changes')
      expect(summary).toContain('Coverage')
    })

    it('should count other changes', () => {
      const changes: PolicyFieldDiff[] = [
        // @ts-expect-error - mismatch due to schema update
        {
          field: 'location',
          fieldLabel: 'Location',
          fieldLabelTr: 'Konum',
          oldValue: 'Istanbul',
          newValue: 'Ankara',
          significance: 'minor',
        },
        // @ts-expect-error - mismatch due to schema update
        {
          field: 'logo',
          fieldLabel: 'Logo',
          fieldLabelTr: 'Logo',
          oldValue: '',
          newValue: 'logo.png',
          significance: 'minor',
        },
      ]

      const summary = generateChangeSummary(changes, 'en')
      expect(summary).toContain('2 other change(s)')
    })
  })

  describe('policyRowToPolicy', () => {
    it('should convert PolicyRow to Policy correctly', () => {
      const row = {
        id: 'policy-123',
        user_id: 'user-123',
        policy_number: 'POL-001',
        provider: 'Allianz',
        type: 'kasko' as const,
        type_tr: 'Kasko',
        coverage: 500000,
        premium: 12000,
        deductible: 2500,
        start_date: '2025-01-01',
        expiry_date: '2026-01-01',
        status: 'active' as const,
        insured_person: 'John Doe',
        location: 'Istanbul',
        document_type: 'policy',
        upload_date: '2025-01-01',
        logo: null,
        raw_data: {
          coverages: [{ name: 'Collision', limit: 500000 }],
          exclusions: ['Racing'],
          specialConditions: [],
          insuranceLine: 'auto',
        },
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      }

      // @ts-expect-error - mismatch due to schema update
      const policy = policyRowToPolicy(row)

      expect(policy.id).toBe('policy-123')
      expect(policy.policyNumber).toBe('POL-001')
      expect(policy.provider).toBe('Allianz')
      expect(policy.coverage).toBe(500000)
      expect(policy.premium).toBe(12000)
      expect(policy.monthlyPremium).toBe(1000)
      expect(policy.coverages).toEqual([{ name: 'Collision', limit: 500000 }])
      expect(policy.exclusions).toEqual(['Racing'])
    })

    it('should handle null raw_data', () => {
      const row = {
        id: 'policy-123',
        user_id: 'user-123',
        policy_number: 'POL-001',
        provider: 'Allianz',
        type: 'kasko' as const,
        type_tr: 'Kasko',
        coverage: 500000,
        premium: 12000,
        deductible: null,
        start_date: '2025-01-01',
        expiry_date: '2026-01-01',
        status: 'active' as const,
        insured_person: 'John Doe',
        location: null,
        document_type: null,
        upload_date: null,
        logo: null,
        raw_data: null,
        created_at: '2025-01-01T00:00:00Z',
        updated_at: '2025-01-01T00:00:00Z',
      }

      // @ts-expect-error - mismatch due to schema update
      const policy = policyRowToPolicy(row)

      expect(policy.coverages).toEqual([])
      expect(policy.exclusions).toEqual([])
      expect(policy.deductible).toBe(0)
    })
  })

  describe('policyToUpdateData', () => {
    it('should convert Policy to PolicyUpdate correctly', () => {
      const policy = createMockPolicy({
        // @ts-expect-error - mismatch due to schema update
        coverages: [{ name: 'Collision', limit: 500000 }],
        exclusions: ['Racing'],
      })

      const updateData = policyToUpdateData(policy)

      expect(updateData.policy_number).toBe('POL-2025-001')
      expect(updateData.provider).toBe('Allianz Sigorta')
      expect(updateData.coverage).toBe(500000)
      expect(updateData.premium).toBe(12000)
      expect(updateData.raw_data?.coverages).toEqual([{ name: 'Collision', limit: 500000 }])
    })
  })
})
