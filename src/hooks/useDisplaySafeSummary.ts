import { useMemo } from 'react'
import type { AnalyzedPolicy } from '@/types/policy'
import type { DisplaySafePolicySummary } from '@/types/display'
import { generateDisplaySafeSummary } from '@/lib/analysis/display-interpreter'
import { generateAnalysisBundle } from '@/lib/analysis/engine'

/**
 * Hook that converts an AnalyzedPolicy into a DisplaySafePolicySummary.
 *
 * ALL consumer-facing components MUST use this hook (or receive the output
 * from a parent that uses it) instead of reading raw AnalyzedPolicy fields
 * for end-user display text.
 *
 * The hook synthesizes the required inputs from the AnalyzedPolicy:
 * - ExtractedPolicyData — reconstructed from AnalyzedPolicy fields
 * - ValidationResult — from policy.safetyFlags
 * - AnalysisBundle — from policy.analysisBundle or generated fresh
 */
export function useDisplaySafeSummary(
  policy: AnalyzedPolicy | undefined | null
): DisplaySafePolicySummary | null {
  return useMemo(() => {
    if (!policy) return null

    // Reconstruct extraction data shape from AnalyzedPolicy
    const extractedData = {
      policyType: policy.type,
      policyNumber: policy.policyNumber || null,
      provider: policy.provider || null,
      insuredName: policy.insuredPerson || null,
      insuredAddress: null,
      startDate: policy.startDate || null,
      endDate: policy.expiryDate || null,
      premium: policy.premium || null,
      currency: policy.currency || 'TRY',
      paymentFrequency: null,
      coverages: policy.coverages || [],
      specialConditions: [],
      exclusions: policy.exclusions || [],
      amendmentInfo: {
        isAmendment: false,
        amendmentNumber: null,
        amendmentDate: null,
        basePolicyNumber: null,
        amendmentReason: null,
        premiumDifference: null,
      },
      evidence: (policy as any).evidence || undefined,
      clauseGraph: undefined,
      confidence: {
        overall: policy.aiConfidence || 0.85,
        policyNumber: 0.9,
        provider: 0.9,
        dates: 0.9,
        premium: 0.9,
        coverages: policy.aiConfidence || 0.85,
      },
    } as any

    // Reconstruct validation from safetyFlags
    const validation = {
      isValid: !policy.safetyBlockReason,
      flags: (policy.safetyFlags || []).map((f) => ({
        level: f.level as 'Safe' | 'Warning' | 'Error',
        message: f.message,
        ruleId: f.field || 'unknown',
        field: f.field,
      })),
    }

    // Use existing analysis bundle or generate fresh
    const analysis =
      policy.analysisBundle || generateAnalysisBundle(policy.id, extractedData, validation)

    return generateDisplaySafeSummary(extractedData, validation, analysis)
  }, [policy])
}
