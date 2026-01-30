/**
 * Trial Transfer Hook
 *
 * Automatically transfers trial analysis data to the user's account
 * after they sign up. This ensures the user doesn't lose their
 * analysis when they create an account.
 */

import { useEffect, useRef } from 'react'
import { useAuth } from '@/lib/supabase/auth-context'
import { createPolicy } from '@/lib/supabase/policies'
import {
  getTrialDataForTransfer,
  hasPendingTrialTransfer,
  clearTrialData,
} from '@/lib/free-trial'
import {
  trackTrialPolicyTransferred,
  trackTrialSignupCompleted,
} from '@/lib/analytics'
import { toast } from 'sonner'

interface UseTrialTransferOptions {
  /** Called when transfer is successful */
  onTransferComplete?: (policyId: string) => void
  /** Called when transfer fails */
  onTransferError?: (error: Error) => void
}

/**
 * Hook that automatically transfers trial data when user signs up
 */
export function useTrialTransfer(options?: UseTrialTransferOptions) {
  const { user } = useAuth()
  const hasTransferred = useRef(false)
  const previousUserId = useRef<string | null>(null)

  useEffect(() => {
    // Only run when we have a new user (just signed up/logged in)
    if (!user) {
      previousUserId.current = null
      hasTransferred.current = false
      return
    }

    // Skip if already transferred for this user
    if (hasTransferred.current && previousUserId.current === user.id) {
      return
    }

    // Check if this is a new login (user ID changed)
    const isNewLogin = previousUserId.current !== user.id
    previousUserId.current = user.id

    // Only transfer on new login and if there's pending data
    if (!isNewLogin || !hasPendingTrialTransfer()) {
      return
    }

    // Check URL for fromTrial parameter (indicates signup from trial flow)
    const params = new URLSearchParams(window.location.search)
    const fromTrial = params.get('fromTrial') === 'true'

    // Transfer trial data
    const transferTrialData = async () => {
      const trialData = getTrialDataForTransfer()
      if (!trialData) return

      try {
        // Mark as transferred to prevent duplicate attempts
        hasTransferred.current = true

        // Track signup completion if from trial
        if (fromTrial) {
          trackTrialSignupCompleted()
        }

        // Create policy in user's account
        const policyData = {
          user_id: user.id,
          policy_number: trialData.policy.policyNumber,
          provider: trialData.policy.provider,
          type: trialData.policy.type,
          type_tr: trialData.policy.typeTr,
          coverage: trialData.policy.coverage,
          premium: trialData.policy.premium,
          deductible: trialData.policy.deductible || 0,
          start_date: trialData.policy.startDate,
          expiry_date: trialData.policy.expiryDate,
          status: trialData.policy.status || 'active',
          insured_person: trialData.policy.insuredPerson || 'N/A',
          location: trialData.policy.location || undefined,
          document_type: trialData.policy.documentType || 'policy',
          upload_date: new Date().toISOString().split('T')[0],
          logo: trialData.policy.logo || undefined,
          raw_data: {
            coverages: trialData.policy.coverages,
            exclusions: trialData.policy.exclusions,
            specialConditions: trialData.policy.specialConditions,
            aiInsights: trialData.policy.aiInsights,
            aiConfidence: trialData.policy.aiConfidence,
            vehicleInfo: trialData.policy.vehicleInfo,
            fromTrial: true,
            originalFileName: trialData.fileName,
          },
        }

        const savedPolicy = await createPolicy(policyData)

        // Track successful transfer
        trackTrialPolicyTransferred()

        // Clear trial data
        clearTrialData()

        // Show success message
        toast.success('Policy saved to your dashboard!', {
          description: 'Your trial analysis has been added to your account.',
        })

        // Call success callback
        options?.onTransferComplete?.(savedPolicy.id)

        // Clean up URL params
        if (fromTrial) {
          const url = new URL(window.location.href)
          url.searchParams.delete('fromTrial')
          window.history.replaceState({}, '', url.pathname + url.search)
        }
      } catch (error) {
        console.error('[TrialTransfer] Failed to transfer trial data:', error)
        hasTransferred.current = false // Allow retry

        // Don't show error toast - user can manually save later
        options?.onTransferError?.(error as Error)
      }
    }

    transferTrialData()
  }, [user, options])
}

/**
 * Check if user came from trial flow
 */
export function isFromTrialFlow(): boolean {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.get('fromTrial') === 'true'
}
