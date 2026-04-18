import { useMemo } from 'react'
import type { AnalyzedPolicy } from '@/types/policy'
import type { DisplaySafePolicySummary } from '@/types/display'
import type { ExtractedPolicyData } from '@/lib/ai/extraction-schema'
import { generateDisplaySafeSummary } from '@/lib/analysis/display-interpreter'
import { generateAnalysisBundle } from '@/lib/analysis/engine'
import { evaluateKaskoPilotGate, type PilotFeatureFlagValue } from '@/lib/analysis/kasko-pilot-gate'

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
 *
 * When the KASKO pilot is active, additional pilot metadata is attached
 * to the result including review status, draft labeling, and banner text.
 */
export function useDisplaySafeSummary(
  policy: AnalyzedPolicy | undefined | null,
  options?: {
    /**
     * Feature-flag map. Legacy `Record<string, boolean>` and the Phase E
     * `Record<string, { enabled, rolloutPercentage }>` forms are both
     * accepted — `evaluateKaskoPilotGate` normalizes internally.
     */
    featureFlags?: Record<string, PilotFeatureFlagValue>
    userSegments?: string[]
    userId?: string
  }
): DisplaySafePolicySummary | null {
  return useMemo(() => {
    if (!policy) return null

    try {
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
        evidence: (policy as unknown as Record<string, unknown>).evidence as
          | Record<string, unknown>[]
          | undefined,
        clauseGraph: undefined,
        confidence: {
          overall: policy.aiConfidence || 0.85,
          policyNumber: 0.9,
          provider: 0.9,
          dates: 0.9,
          premium: 0.9,
          coverages: policy.aiConfidence || 0.85,
        },
      } as ExtractedPolicyData

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

      const summary = generateDisplaySafeSummary(extractedData, validation, analysis)

      // --- PILOT GATE INTEGRATION ---
      // Check if the KASKO pilot is active for this extraction
      const branch = policy.type || 'unknown'
      const pilotGate = evaluateKaskoPilotGate(
        branch,
        options?.userId,
        options?.featureFlags || {},
        options?.userSegments || []
      )

      if (pilotGate.isPilotActive) {
        summary.isPilotResult = true
        summary.requiresHumanReview = pilotGate.requiresHumanReview
        summary.pilotReviewStatus = pilotGate.reviewStatus
        summary.pilotFlagName = 'kasko_ai_extraction_pilot'
        summary.pilotReviewerSegment = 'kasko_pilot_reviewers'
        summary.pilotReviewBanner = pilotGate.reviewBannerText
        summary.isDraft = policy.isDraft ?? pilotGate.isDraft
      }

      return summary
    } catch (err) {
      console.warn(
        '[useDisplaySafeSummary] Failed to generate summary:',
        err instanceof Error ? err.message : String(err)
      )
      return null
    }
  }, [policy, options?.featureFlags, options?.userSegments, options?.userId])
}
