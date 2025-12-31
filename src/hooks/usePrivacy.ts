/**
 * Privacy and Consent Management Hooks
 * React hooks for KVKK/GDPR compliant consent and data subject rights
 */

import { useState, useEffect, useCallback } from 'react'
import type {
  ConsentType,
  ConsentRecord,
  UserConsentStatus,
  DataSubjectRight,
  DataSubjectRequest,
} from '@/types/privacy'
import {
  consentManager,
  CONSENT_REQUIREMENTS,
  checkRequiredConsents,
  getUserConsentStatus,
} from '@/lib/privacy/consent-manager'
import {
  dataSubjectRightsManager,
  getUserDataRequests,
  exportUserData,
} from '@/lib/privacy/data-subject-rights'

// =============================================================================
// Consent Management Hooks
// =============================================================================

/**
 * Hook for managing user consent
 */
export function useConsent(userId: string | undefined) {
  const [consentStatus, setConsentStatus] = useState<UserConsentStatus | null>(null)
  const [missingConsents, setMissingConsents] = useState<ConsentType[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Load consent status
  const loadConsentStatus = useCallback(async () => {
    if (!userId) {
      setConsentStatus(null)
      setMissingConsents([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      await consentManager.initialize()
      const [status, required] = await Promise.all([
        getUserConsentStatus(userId),
        checkRequiredConsents(userId),
      ])

      setConsentStatus(status)
      setMissingConsents(required.missing)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load consent status'))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadConsentStatus()
  }, [loadConsentStatus])

  // Grant consent
  const grantConsent = useCallback(async (
    type: ConsentType,
    options?: { source?: 'web' | 'mobile' | 'api'; metadata?: Record<string, unknown> }
  ): Promise<ConsentRecord | null> => {
    if (!userId) return null

    try {
      const record = await consentManager.recordConsent({
        userId,
        type,
        granted: true,
        source: options?.source ?? 'web',
        metadata: options?.metadata,
      })

      // Refresh status
      await loadConsentStatus()
      return record
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to grant consent'))
      return null
    }
  }, [userId, loadConsentStatus])

  // Revoke consent
  const withdrawConsent = useCallback(async (type: ConsentType): Promise<boolean> => {
    if (!userId) return false

    try {
      await consentManager.revokeConsent(userId, type)
      // Refresh status
      await loadConsentStatus()
      return true
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to revoke consent'))
      return false
    }
  }, [userId, loadConsentStatus])

  // Check specific consent
  const hasConsent = useCallback((type: ConsentType): boolean => {
    if (!consentStatus) return false
    return consentStatus.consents[type]?.granted ?? false
  }, [consentStatus])

  return {
    consentStatus,
    missingConsents,
    hasAllRequiredConsents: missingConsents.length === 0,
    loading,
    error,
    grantConsent,
    withdrawConsent,
    hasConsent,
    refresh: loadConsentStatus,
  }
}

/**
 * Hook for consent requirements
 */
export function useConsentRequirements() {
  const requiredConsents = CONSENT_REQUIREMENTS.filter(c => c.required)
  const optionalConsents = CONSENT_REQUIREMENTS.filter(c => !c.required)

  return {
    requirements: CONSENT_REQUIREMENTS,
    requiredConsents,
    optionalConsents,
  }
}

// =============================================================================
// Data Subject Rights Hooks
// =============================================================================

/**
 * Hook for managing data subject rights requests
 */
export function useDataSubjectRights(userId: string | undefined) {
  const [requests, setRequests] = useState<DataSubjectRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Load user's requests
  const loadRequests = useCallback(async () => {
    if (!userId) {
      setRequests([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      await dataSubjectRightsManager.initialize()
      const userRequests = await getUserDataRequests(userId)
      setRequests(userRequests)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to load requests'))
    } finally {
      setLoading(false)
    }
  }, [userId])

  useEffect(() => {
    loadRequests()
  }, [loadRequests])

  // Submit a new request
  const submitRequest = useCallback(async (
    email: string,
    type: DataSubjectRight,
    reason?: string
  ): Promise<DataSubjectRequest | null> => {
    if (!userId) return null

    try {
      const request = await dataSubjectRightsManager.submitRequest({
        userId,
        email,
        type,
        reason,
      })

      // Refresh requests
      await loadRequests()
      return request
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to submit request'))
      return null
    }
  }, [userId, loadRequests])

  // Get pending requests
  const pendingRequests = requests.filter(r =>
    r.status === 'pending' || r.status === 'in_progress'
  )

  // Get completed requests
  const completedRequests = requests.filter(r =>
    r.status === 'completed' || r.status === 'rejected'
  )

  return {
    requests,
    pendingRequests,
    completedRequests,
    loading,
    error,
    submitRequest,
    refresh: loadRequests,
  }
}

/**
 * Hook for data export functionality
 */
export function useDataExport(userId: string | undefined) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const exportData = useCallback(async (): Promise<Record<string, unknown> | null> => {
    if (!userId) return null

    try {
      setExporting(true)
      setError(null)

      const data = await exportUserData(userId)
      return data
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to export data'))
      return null
    } finally {
      setExporting(false)
    }
  }, [userId])

  const downloadExport = useCallback(async (): Promise<void> => {
    const data = await exportData()
    if (!data) return

    // Create downloadable JSON file
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `insurai-data-export-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, [exportData])

  return {
    exporting,
    error,
    exportData,
    downloadExport,
  }
}

// =============================================================================
// Combined Privacy Hook
// =============================================================================

/**
 * Combined hook for all privacy-related functionality
 */
export function usePrivacy(userId: string | undefined, email?: string) {
  const consent = useConsent(userId)
  const rights = useDataSubjectRights(userId)
  const dataExport = useDataExport(userId)
  const requirements = useConsentRequirements()

  // Request data access
  const requestAccess = useCallback(async () => {
    if (!email) return null
    return rights.submitRequest(email, 'access')
  }, [email, rights])

  // Request data deletion
  const requestDeletion = useCallback(async (reason?: string) => {
    if (!email) return null
    return rights.submitRequest(email, 'erasure', reason)
  }, [email, rights])

  // Request data portability
  const requestPortability = useCallback(async () => {
    if (!email) return null
    return rights.submitRequest(email, 'portability')
  }, [email, rights])

  return {
    // Consent
    consentStatus: consent.consentStatus,
    missingConsents: consent.missingConsents,
    hasAllRequiredConsents: consent.hasAllRequiredConsents,
    grantConsent: consent.grantConsent,
    withdrawConsent: consent.withdrawConsent,
    hasConsent: consent.hasConsent,

    // Requirements
    consentRequirements: requirements.requirements,
    requiredConsents: requirements.requiredConsents,
    optionalConsents: requirements.optionalConsents,

    // Data subject rights
    requests: rights.requests,
    pendingRequests: rights.pendingRequests,
    completedRequests: rights.completedRequests,
    submitRequest: rights.submitRequest,
    requestAccess,
    requestDeletion,
    requestPortability,

    // Data export
    exportData: dataExport.exportData,
    downloadExport: dataExport.downloadExport,
    exporting: dataExport.exporting,

    // Loading state
    loading: consent.loading || rights.loading,
    error: consent.error || rights.error || dataExport.error,

    // Refresh
    refresh: async () => {
      await Promise.all([consent.refresh(), rights.refresh()])
    },
  }
}
