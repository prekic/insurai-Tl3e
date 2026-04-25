/**
 * Free Trial Service
 *
 * Manages anonymous user's free trial analysis.
 * Uses localStorage to track usage and store temporary results.
 *
 * Allows N uploads per 24-hour window (configurable via admin settings).
 */

import type { AnalyzedPolicy } from '@/types/policy'

const STORAGE_KEYS = {
  TRIAL_USED: 'insurai_trial_used',
  TRIAL_RESULT: 'insurai_trial_result',
  TRIAL_TIMESTAMP: 'insurai_trial_timestamp',
  TRIAL_FILE_NAME: 'insurai_trial_filename',
  TRIAL_EMAIL: 'insurai_trial_email',
  TRIAL_SHARE_ID: 'insurai_trial_share_id',
  TRIAL_UPLOAD_COUNT: 'insurai_trial_upload_count',
  TRIAL_WINDOW_START: 'insurai_trial_window_start',
} as const

// Trial window: 24 hours — configurable via app_settings ui.trial_expiry_ms
let TRIAL_EXPIRY_MS = 24 * 60 * 60 * 1000

// Max uploads per window — configurable via app_settings ui.trial_max_uploads_per_day
const TRIAL_MAX_UPLOADS = Infinity

// Lazy-load config override (fire-and-forget, non-blocking)
let _trialConfigLoaded = false
async function _loadTrialConfig(): Promise<void> {
  if (_trialConfigLoaded) return
  _trialConfigLoaded = true
  try {
    const { configService } = await import('@/lib/config')
    const uiCfg = await configService.getUIConfig()
    TRIAL_EXPIRY_MS = uiCfg.trialExpiryMs
    // TRIAL_MAX_UPLOADS = uiCfg.trialMaxUploadsPerDay // Limit removed
  } catch {
    // Keep defaults
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
 * Get the current upload count and window start, resetting if the window expired.
 */
function getTrialUsage(): { count: number; windowStart: number } {
  try {
    const countStr = localStorage.getItem(STORAGE_KEYS.TRIAL_UPLOAD_COUNT)
    const windowStr = localStorage.getItem(STORAGE_KEYS.TRIAL_WINDOW_START)

    if (!countStr || !windowStr) {
      return { count: 0, windowStart: 0 }
    }

    const windowStart = parseInt(windowStr, 10)
    const now = Date.now()

    // Window expired — reset
    if (now - windowStart > TRIAL_EXPIRY_MS) {
      localStorage.removeItem(STORAGE_KEYS.TRIAL_UPLOAD_COUNT)
      localStorage.removeItem(STORAGE_KEYS.TRIAL_WINDOW_START)
      return { count: 0, windowStart: 0 }
    }

    return { count: parseInt(countStr, 10) || 0, windowStart }
  } catch {
    return { count: 0, windowStart: 0 }
  }
}

/**
 * Get number of remaining uploads in the current window.
 */
export function getTrialUploadsRemaining(): number {
  const { count } = getTrialUsage()
  return Math.max(0, TRIAL_MAX_UPLOADS - count)
}

/**
 * Get the max uploads per day setting.
 */
export function getTrialMaxUploads(): number {
  return TRIAL_MAX_UPLOADS
}

/**
 * Check if user has exhausted their daily trial uploads.
 */
export function hasUsedFreeTrial(): boolean {
  try {
    const { count } = getTrialUsage()
    return count >= TRIAL_MAX_UPLOADS
  } catch {
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
 * Increment the trial upload counter and save the result.
 */
export function saveTrialResult(policy: AnalyzedPolicy, fileName: string): void {
  try {
    const now = Date.now()
    const shareId = generateShareId()
    const { count, windowStart } = getTrialUsage()

    // Start a new window if none exists
    const newWindowStart = windowStart || now
    const newCount = count + 1

    localStorage.setItem(STORAGE_KEYS.TRIAL_UPLOAD_COUNT, newCount.toString())
    localStorage.setItem(STORAGE_KEYS.TRIAL_WINDOW_START, newWindowStart.toString())
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
    const now = Date.now()
    const { count, windowStart } = getTrialUsage()

    const newWindowStart = windowStart || now
    const newCount = count + 1

    localStorage.setItem(STORAGE_KEYS.TRIAL_UPLOAD_COUNT, newCount.toString())
    localStorage.setItem(STORAGE_KEYS.TRIAL_WINDOW_START, newWindowStart.toString())
    localStorage.setItem(STORAGE_KEYS.TRIAL_USED, 'true')
    localStorage.setItem(STORAGE_KEYS.TRIAL_TIMESTAMP, now.toString())
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
    localStorage.removeItem(STORAGE_KEYS.TRIAL_UPLOAD_COUNT)
    localStorage.removeItem(STORAGE_KEYS.TRIAL_WINDOW_START)
  } catch {
    // Ignore storage errors
  }
}

/**
 * Get time remaining until trial window resets (in milliseconds)
 */
export function getTrialTimeRemaining(): number {
  try {
    const windowStr = localStorage.getItem(STORAGE_KEYS.TRIAL_WINDOW_START)
    if (!windowStr) return 0

    const windowStart = parseInt(windowStr, 10)
    const expiresAt = windowStart + TRIAL_EXPIRY_MS
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
 * Check if user can perform a free trial.
 * Returns { canTry, reason, uploadsRemaining, maxUploads }
 */
export function canPerformFreeTrial(): {
  canTry: boolean
  reason?: string
  uploadsRemaining: number
  maxUploads: number
} {
  const remaining = getTrialUploadsRemaining()
  if (remaining <= 0) {
    const timeRemaining = getTrialTimeRemaining()
    return {
      canTry: false,
      reason: `You've used all ${TRIAL_MAX_UPLOADS} free analyses for today. Sign up for unlimited access, or try again in ${formatTimeRemaining(timeRemaining)}.`,
      uploadsRemaining: 0,
      maxUploads: TRIAL_MAX_UPLOADS,
    }
  }
  return { canTry: true, uploadsRemaining: remaining, maxUploads: TRIAL_MAX_UPLOADS }
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
