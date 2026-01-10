import type { Policy, AnalyzedPolicy } from '@/types/policy'
import type { PolicyRow, PolicyUpdate, RawPolicyData } from '@/lib/supabase/types'
import {
  findExistingPolicyByIdentifier,
  updatePolicy,
  createPolicyVersion,
} from '@/lib/supabase/policies'
import {
  comparePoliciesAdvanced,
  type PreUploadCheckResult,
  type PolicyFieldDiff,
} from './policy-utils'

// ============================================================================
// TYPE CONVERSION HELPERS
// ============================================================================

/**
 * Convert a Supabase PolicyRow to the frontend Policy type
 */
export function policyRowToPolicy(row: PolicyRow): Policy {
  const rawData = row.raw_data as RawPolicyData | null

  return {
    id: row.id,
    policyNumber: row.policy_number,
    provider: row.provider,
    logo: row.logo || '',
    type: row.type as Policy['type'],
    typeTr: row.type_tr || '',
    coverage: Number(row.coverage),
    premium: Number(row.premium),
    monthlyPremium: Math.round(Number(row.premium) / 12), // Calculate from annual
    deductible: row.deductible ? Number(row.deductible) : 0,
    startDate: row.start_date,
    expiryDate: row.expiry_date,
    status: row.status as Policy['status'],
    uploadDate: row.upload_date || row.created_at,
    fileName: '', // Stored in policy_documents table
    documentType: row.document_type || 'policy',
    coverages: rawData?.coverages || [],
    exclusions: rawData?.exclusions || [],
    specialConditions: rawData?.specialConditions || [],
    insuredPerson: row.insured_person || undefined,
    beneficiary: undefined, // Not in PolicyRow
    location: row.location || undefined,
    insuranceLine: rawData?.insuranceLine || 'auto',
    createdAt: row.created_at,
    paymentFrequency: undefined, // Not in PolicyRow
    agentName: undefined, // Not in PolicyRow
  }
}

/**
 * Convert frontend Policy/AnalyzedPolicy to Supabase PolicyUpdate format
 */
export function policyToUpdateData(policy: Policy | AnalyzedPolicy): PolicyUpdate {
  // Check if it's an AnalyzedPolicy with additional fields
  const analyzed = policy as AnalyzedPolicy

  return {
    policy_number: policy.policyNumber,
    provider: policy.provider,
    logo: policy.logo,
    type: policy.type as PolicyUpdate['type'],
    type_tr: policy.typeTr,
    coverage: policy.coverage,
    premium: policy.premium,
    deductible: policy.deductible,
    start_date: policy.startDate,
    expiry_date: policy.expiryDate,
    status: policy.status as PolicyUpdate['status'],
    insured_person: policy.insuredPerson || 'Unknown',
    location: policy.location,
    raw_data: {
      coverages: policy.coverages,
      exclusions: policy.exclusions,
      specialConditions: policy.specialConditions,
      insuranceLine: policy.insuranceLine,
      // Include AI data if present (from AnalyzedPolicy)
      aiConfidence: analyzed.aiConfidence,
      aiInsights: analyzed.aiInsights,
      marketComparison: analyzed.marketComparison,
      riskScore: analyzed.riskScore,
      gapAnalysis: analyzed.gapAnalysis,
      riskActions: analyzed.riskActions,
      gapActions: analyzed.gapActions,
    },
  }
}

// ============================================================================
// PRE-UPLOAD CHECK SERVICE
// ============================================================================

export interface PreUploadCheckOptions {
  /** Skip the check entirely */
  skipCheck?: boolean
}

/**
 * Check for conflicts before uploading a new policy
 *
 * @param newPolicy - The policy about to be uploaded
 * @param options - Optional configuration
 * @returns Check result indicating no conflict, exact duplicate, or amendment
 */
export async function checkPolicyBeforeUpload(
  newPolicy: Policy,
  options: PreUploadCheckOptions = {}
): Promise<PreUploadCheckResult> {
  if (options.skipCheck) {
    return { type: 'noConflict' }
  }

  if (!newPolicy.policyNumber || !newPolicy.provider) {
    // Can't check without identifiers
    return { type: 'noConflict' }
  }

  try {
    // Query for existing policies with matching identifiers
    const existingRows = await findExistingPolicyByIdentifier(
      newPolicy.policyNumber,
      newPolicy.provider,
      newPolicy.insuredPerson
    )

    if (existingRows.length === 0) {
      return { type: 'noConflict' }
    }

    // Convert to Policy type and compare with the most recent match
    const existingPolicy = policyRowToPolicy(existingRows[0])

    // Use advanced comparison to determine conflict type
    return comparePoliciesAdvanced(newPolicy, existingPolicy)
  } catch (error) {
    console.error('Error checking for policy conflicts:', error)
    // On error, allow the upload to proceed (fail open)
    return { type: 'noConflict' }
  }
}

// ============================================================================
// AMENDMENT HANDLING
// ============================================================================

export interface AmendmentResult {
  success: boolean
  policyId: string
  versionNumber: number
  changes: PolicyFieldDiff[]
  error?: string
}

/**
 * Generate a human-readable change summary
 */
export function generateChangeSummary(
  changes: PolicyFieldDiff[],
  locale: 'en' | 'tr' = 'en'
): string {
  if (changes.length === 0) {
    return locale === 'tr' ? 'Degisiklik yok' : 'No changes'
  }

  const criticalChanges = changes.filter((c) => c.significance === 'critical')
  const majorChanges = changes.filter((c) => c.significance === 'major')
  const otherChanges = changes.filter(
    (c) => c.significance !== 'critical' && c.significance !== 'major'
  )

  const parts: string[] = []

  if (criticalChanges.length > 0) {
    const fields = criticalChanges
      .map((c) => (locale === 'tr' ? c.fieldLabelTr : c.fieldLabel))
      .join(', ')
    parts.push(
      locale === 'tr' ? `Kritik degisiklikler: ${fields}` : `Critical changes: ${fields}`
    )
  }

  if (majorChanges.length > 0) {
    const fields = majorChanges
      .map((c) => (locale === 'tr' ? c.fieldLabelTr : c.fieldLabel))
      .join(', ')
    parts.push(
      locale === 'tr' ? `Onemli degisiklikler: ${fields}` : `Major changes: ${fields}`
    )
  }

  if (otherChanges.length > 0) {
    parts.push(
      locale === 'tr'
        ? `${otherChanges.length} diger degisiklik`
        : `${otherChanges.length} other change(s)`
    )
  }

  return parts.join('; ')
}

/**
 * Handle policy amendment: update existing policy and create version entry
 *
 * @param existingPolicyId - ID of the existing policy to amend
 * @param newPolicyData - The new policy data to apply
 * @param changes - The field differences (for version tracking)
 * @returns Result of the amendment operation
 */
export async function handlePolicyAmendment(
  existingPolicyId: string,
  newPolicyData: Policy,
  changes: PolicyFieldDiff[]
): Promise<AmendmentResult> {
  try {
    // Convert new policy to update format
    const updateData = policyToUpdateData(newPolicyData)

    // Prepare version tracking data
    const changeSummary = generateChangeSummary(changes)
    const previousData: Record<string, unknown> = {}
    const newData: Record<string, unknown> = {}

    for (const change of changes) {
      previousData[change.field] = change.oldValue
      newData[change.field] = change.newValue
    }

    // Create version entry first (to track history)
    const version = await createPolicyVersion(
      existingPolicyId,
      'updated',
      changeSummary,
      previousData,
      { ...updateData, ...newData }
    )

    // Update the policy with new values
    await updatePolicy(existingPolicyId, updateData)

    return {
      success: true,
      policyId: existingPolicyId,
      versionNumber: version.version_number,
      changes,
    }
  } catch (error) {
    console.error('Error handling policy amendment:', error)
    return {
      success: false,
      policyId: existingPolicyId,
      versionNumber: 0,
      changes,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

// ============================================================================
// DUPLICATE RESOLUTION
// ============================================================================

export type DuplicateResolution = 'skip' | 'replace' | 'keep-both'

/**
 * Handle exact duplicate resolution based on user choice
 *
 * @param resolution - User's choice for handling the duplicate
 * @param existingPolicyId - ID of the existing policy
 * @param newPolicyData - The new policy data
 * @returns Object with action taken and any relevant IDs
 */
export async function handleDuplicateResolution(
  resolution: DuplicateResolution,
  existingPolicyId: string,
  newPolicyData: Policy
): Promise<{
  action: DuplicateResolution
  existingId?: string
  newId?: string
  error?: string
}> {
  switch (resolution) {
    case 'skip':
      // Don't save the new policy
      return { action: 'skip', existingId: existingPolicyId }

    case 'replace':
      // Update the existing policy with new data
      try {
        const updateData = policyToUpdateData(newPolicyData)

        // Create version entry for the replacement
        await createPolicyVersion(existingPolicyId, 'updated', 'Replaced with re-uploaded policy', null, {
          ...updateData,
        })

        await updatePolicy(existingPolicyId, updateData)

        return { action: 'replace', existingId: existingPolicyId }
      } catch (error) {
        return {
          action: 'replace',
          existingId: existingPolicyId,
          error: error instanceof Error ? error.message : 'Failed to replace policy',
        }
      }

    case 'keep-both':
      // Allow the new policy to be saved (handled by caller)
      return { action: 'keep-both', existingId: existingPolicyId, newId: newPolicyData.id }
  }
}

// ============================================================================
// CONFLICT SUMMARY FOR UI
// ============================================================================

export interface ConflictSummary {
  type: 'none' | 'exact-duplicate' | 'amendment'
  existingPolicy?: Policy
  changes?: PolicyFieldDiff[]
  criticalChangeCount: number
  majorChangeCount: number
  totalChangeCount: number
  summaryText: string
  summaryTextTr: string
}

/**
 * Generate a UI-friendly conflict summary
 */
export function getConflictSummary(result: PreUploadCheckResult): ConflictSummary {
  if (result.type === 'noConflict') {
    return {
      type: 'none',
      criticalChangeCount: 0,
      majorChangeCount: 0,
      totalChangeCount: 0,
      summaryText: '',
      summaryTextTr: '',
    }
  }

  if (result.type === 'exactDuplicate') {
    return {
      type: 'exact-duplicate',
      existingPolicy: result.existingPolicy,
      criticalChangeCount: 0,
      majorChangeCount: 0,
      totalChangeCount: 0,
      summaryText: 'This policy already exists in your database.',
      summaryTextTr: 'Bu police veritabaninizda zaten mevcut.',
    }
  }

  // Amendment
  const { existingPolicy, changes } = result
  const criticalChangeCount = changes.filter((c) => c.significance === 'critical').length
  const majorChangeCount = changes.filter((c) => c.significance === 'major').length

  return {
    type: 'amendment',
    existingPolicy,
    changes,
    criticalChangeCount,
    majorChangeCount,
    totalChangeCount: changes.length,
    summaryText: `Found ${changes.length} difference(s) from the existing policy: ${criticalChangeCount} critical, ${majorChangeCount} major.`,
    summaryTextTr: `Mevcut policeden ${changes.length} fark bulundu: ${criticalChangeCount} kritik, ${majorChangeCount} onemli.`,
  }
}
