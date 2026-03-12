/**
 * Free Trial Service
 *
 * Manages anonymous user's free trial analysis.
 * Uses localStorage to track usage and store temporary results.
 */

import type { AnalyzedPolicy } from '@/types/policy'

const STORAGE_KEYS = {
  TRIAL_USED: 'insurai_trial_used',
  TRIAL_RESULT: 'insurai_trial_result',
  TRIAL_TIMESTAMP: 'insurai_trial_timestamp',
  TRIAL_FILE_NAME: 'insurai_trial_filename',
  TRIAL_EMAIL: 'insurai_trial_email',
  TRIAL_SHARE_ID: 'insurai_trial_share_id',
} as const

// Trial expires after 24 hours (encourages signup)
// Default 86400000 — configurable via app_settings ui.trial_expiry_ms
let TRIAL_EXPIRY_MS = 24 * 60 * 60 * 1000

// Lazy-load config override (fire-and-forget, non-blocking)
let _trialConfigLoaded = false
async function _loadTrialConfig(): Promise<void> {
  if (_trialConfigLoaded) return
  _trialConfigLoaded = true
  try {
    const { configService } = await import('@/lib/config')
    const uiCfg = await configService.getUIConfig()
    TRIAL_EXPIRY_MS = uiCfg.trialExpiryMs
  } catch {
    // Keep default
  }
}
_loadTrialConfig()

export interface TrialResult {
  policy: AnalyzedPolicy
  fileName: string
  analyzedAt: string
  expiresAt: string
  email?: string
  shareId?: string
}

export interface TrialEmail {
  email: string
  capturedAt: string
}

/**
 * Check if user has already used their free trial
 */
export function hasUsedFreeTrial(): boolean {
  try {
    const trialUsed = localStorage.getItem(STORAGE_KEYS.TRIAL_USED)
    const timestamp = localStorage.getItem(STORAGE_KEYS.TRIAL_TIMESTAMP)

    if (!trialUsed || !timestamp) {
      return false
    }

    // Check if trial has expired (allow new trial after 24h)
    const trialTime = parseInt(timestamp, 10)
    const now = Date.now()
    if (now - trialTime > TRIAL_EXPIRY_MS) {
      // Trial expired, clear old data and allow new trial
      clearTrialData()
      return false
    }

    return trialUsed === 'true'
  } catch {
    // localStorage might be unavailable
    return false
  }
}

/**
 * Check if there's an existing trial result that hasn't expired
 */
export function hasValidTrialResult(): boolean {
  try {
    const result = localStorage.getItem(STORAGE_KEYS.TRIAL_RESULT)
    const timestamp = localStorage.getItem(STORAGE_KEYS.TRIAL_TIMESTAMP)

    if (!result || !timestamp) {
      return false
    }

    const trialTime = parseInt(timestamp, 10)
    const now = Date.now()
    return now - trialTime < TRIAL_EXPIRY_MS
  } catch {
    return false
  }
}

/**
 * Get the stored trial result
 */
export function getTrialResult(): TrialResult | null {
  try {
    const resultStr = localStorage.getItem(STORAGE_KEYS.TRIAL_RESULT)
    const timestamp = localStorage.getItem(STORAGE_KEYS.TRIAL_TIMESTAMP)
    const fileName = localStorage.getItem(STORAGE_KEYS.TRIAL_FILE_NAME)
    const email = localStorage.getItem(STORAGE_KEYS.TRIAL_EMAIL)
    const shareId = localStorage.getItem(STORAGE_KEYS.TRIAL_SHARE_ID)

    if (!resultStr || !timestamp) {
      return null
    }

    const trialTime = parseInt(timestamp, 10)
    const now = Date.now()

    // Check expiry
    if (now - trialTime > TRIAL_EXPIRY_MS) {
      clearTrialData()
      return null
    }

    const policy = JSON.parse(resultStr) as AnalyzedPolicy

    return {
      policy,
      fileName: fileName || 'policy.pdf',
      analyzedAt: new Date(trialTime).toISOString(),
      expiresAt: new Date(trialTime + TRIAL_EXPIRY_MS).toISOString(),
      email: email || undefined,
      shareId: shareId || undefined,
    }
  } catch {
    return null
  }
}

/**
 * Generate a short unique share ID
 */
function generateShareId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let result = ''
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(bytes[i] % chars.length)
  }
  return result
}

/**
 * Save trial result after successful analysis
 */
export function saveTrialResult(policy: AnalyzedPolicy, fileName: string): void {
  try {
    const now = Date.now()
    const shareId = generateShareId()
    localStorage.setItem(STORAGE_KEYS.TRIAL_USED, 'true')
    localStorage.setItem(STORAGE_KEYS.TRIAL_RESULT, JSON.stringify(policy))
    localStorage.setItem(STORAGE_KEYS.TRIAL_TIMESTAMP, now.toString())
    localStorage.setItem(STORAGE_KEYS.TRIAL_FILE_NAME, fileName)
    localStorage.setItem(STORAGE_KEYS.TRIAL_SHARE_ID, shareId)
  } catch (error) {
    console.warn('[FreeTrial] Failed to save trial result:', error)
  }
}

/**
 * Mark trial as used (without saving result - for failed analyses)
 */
export function markTrialUsed(): void {
  try {
    localStorage.setItem(STORAGE_KEYS.TRIAL_USED, 'true')
    localStorage.setItem(STORAGE_KEYS.TRIAL_TIMESTAMP, Date.now().toString())
  } catch {
    // Ignore storage errors
  }
}

/**
 * Clear all trial data (called after successful signup or expiry)
 */
export function clearTrialData(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.TRIAL_USED)
    localStorage.removeItem(STORAGE_KEYS.TRIAL_RESULT)
    localStorage.removeItem(STORAGE_KEYS.TRIAL_TIMESTAMP)
    localStorage.removeItem(STORAGE_KEYS.TRIAL_FILE_NAME)
    localStorage.removeItem(STORAGE_KEYS.TRIAL_EMAIL)
    localStorage.removeItem(STORAGE_KEYS.TRIAL_SHARE_ID)
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get time remaining until trial expires (in milliseconds)
 */
export function getTrialTimeRemaining(): number {
  try {
    const timestamp = localStorage.getItem(STORAGE_KEYS.TRIAL_TIMESTAMP)
    if (!timestamp) return 0

    const trialTime = parseInt(timestamp, 10)
    const expiresAt = trialTime + TRIAL_EXPIRY_MS
    const remaining = expiresAt - Date.now()

    return Math.max(0, remaining)
  } catch {
    return 0
  }
}

/**
 * Format time remaining as human-readable string
 */
export function formatTimeRemaining(ms: number): string {
  if (ms <= 0) return 'Expired'

  const hours = Math.floor(ms / (60 * 60 * 1000))
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000))

  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`
  }
  return `${minutes}m remaining`
}

/**
 * Check if user can perform a free trial
 * Returns { canTry: boolean, reason?: string }
 */
export function canPerformFreeTrial(): { canTry: boolean; reason?: string } {
  if (hasUsedFreeTrial()) {
    const timeRemaining = getTrialTimeRemaining()
    if (timeRemaining > 0) {
      return {
        canTry: false,
        reason: `You've already used your free analysis. Sign up to analyze more policies, or try again in ${formatTimeRemaining(timeRemaining)}.`,
      }
    }
  }
  return { canTry: true }
}

// ============================================================================
// Email Capture
// ============================================================================

/**
 * Save user's email for follow-up (optional, before analysis)
 */
export function saveTrialEmail(email: string): void {
  try {
    localStorage.setItem(STORAGE_KEYS.TRIAL_EMAIL, email)
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get stored trial email
 */
export function getTrialEmail(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEYS.TRIAL_EMAIL)
  } catch {
    return null
  }
}

// ============================================================================
// Shareable Results
// ============================================================================

/**
 * Get share ID for the current trial
 */
export function getShareId(): string | null {
  try {
    const shareId = localStorage.getItem(STORAGE_KEYS.TRIAL_SHARE_ID)
    if (!shareId) return null

    // Check if trial is still valid
    if (!hasValidTrialResult()) return null

    return shareId
  } catch {
    return null
  }
}

// ============================================================================
// Trial Data Transfer (for signup flow)
// ============================================================================

/**
 * Get trial data for transfer to user account after signup.
 * This includes all data needed to create a policy in the user's account.
 */
export function getTrialDataForTransfer(): {
  policy: AnalyzedPolicy
  fileName: string
  email?: string
} | null {
  const result = getTrialResult()
  if (!result) return null

  return {
    policy: result.policy,
    fileName: result.fileName,
    email: result.email,
  }
}

/**
 * Check if there's trial data that should be transferred after signup
 */
export function hasPendingTrialTransfer(): boolean {
  return hasValidTrialResult()
}
