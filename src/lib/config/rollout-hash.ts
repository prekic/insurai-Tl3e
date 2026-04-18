/**
 * Deterministic rollout bucketing.
 *
 * Shared helper used by both `ConfigurationService.isFeatureEnabled()` and
 * `evaluateKaskoPilotGate()`. Keeps bucket assignment consistent across the
 * codebase — a user bucketed in at 50% by one caller will bucket in at 50%
 * by any caller, which matters because inconsistency would create a
 * "haunted" rollout where a user flips in/out at the same percentage.
 *
 * Historical note: the hash algorithm below is the pre-existing 32-bit
 * bitwise hash from configuration-service.ts (commit history) —
 * we extract it here unchanged to preserve every bucket assignment made
 * while the flag has been live.
 */

/**
 * 32-bit bitwise string hash. Kept stable; do NOT substitute a different
 * algorithm (e.g. djb2) without a migration plan for users already bucketed.
 */
export function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash
  }
  return Math.abs(hash)
}

/**
 * Compute the 0-99 rollout bucket for a given userId + flag key.
 *
 * Stable per (userId, flagKey) pair: calling twice returns the same number.
 * Callers compare against `rolloutPercentage`: `bucket < rolloutPercentage`
 * means the user is IN the rollout.
 *
 * Anonymous callers (userId missing/empty) get a random bucket — the caller
 * decides whether that's meaningful for their gate.
 */
export function computeRolloutBucket(userId: string | undefined, flagKey: string): number {
  if (!userId) {
    return Math.floor(Math.random() * 100)
  }
  return hashString(userId + flagKey) % 100
}
