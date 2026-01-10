import type { Policy, DuplicatePolicy } from '@/types/policy'

/**
 * Time threshold for considering a policy as "new" (in milliseconds)
 * Default: 24 hours
 */
const NEW_POLICY_THRESHOLD_MS = 24 * 60 * 60 * 1000

/**
 * Check if a policy is considered "new" based on its createdAt timestamp
 * @param policy - The policy to check
 * @param thresholdMs - Custom threshold in milliseconds (default: 24 hours)
 * @returns true if the policy was created within the threshold
 */
export function isNewPolicy(policy: Policy, thresholdMs: number = NEW_POLICY_THRESHOLD_MS): boolean {
  if (!policy.createdAt) {
    return false
  }

  const createdTime = new Date(policy.createdAt).getTime()
  const now = Date.now()

  return (now - createdTime) < thresholdMs
}

/**
 * Check if a policy was added in the current session
 * @param policy - The policy to check
 * @param sessionStartTime - ISO timestamp of when the session started
 * @returns true if the policy was created after the session started
 */
export function isSessionNewPolicy(policy: Policy, sessionStartTime: string): boolean {
  if (!policy.createdAt) {
    return false
  }

  return new Date(policy.createdAt) > new Date(sessionStartTime)
}

/**
 * Compare two policies to determine their similarity level
 * @returns 'exact' if all key fields match, 'high' if most match, 'medium' if some match
 */
function comparePolicies(a: Policy, b: Policy): { similarity: 'exact' | 'high' | 'medium' | null; matchedFields: string[] } {
  const matchedFields: string[] = []

  // Primary identifiers
  if (a.policyNumber === b.policyNumber && a.policyNumber) {
    matchedFields.push('policyNumber')
  }
  if (a.provider.toLowerCase() === b.provider.toLowerCase()) {
    matchedFields.push('provider')
  }

  // Financial fields
  if (a.coverage === b.coverage) {
    matchedFields.push('coverage')
  }
  if (a.premium === b.premium) {
    matchedFields.push('premium')
  }
  if (a.deductible === b.deductible) {
    matchedFields.push('deductible')
  }

  // Date fields
  if (a.startDate === b.startDate) {
    matchedFields.push('startDate')
  }
  if (a.expiryDate === b.expiryDate) {
    matchedFields.push('expiryDate')
  }

  // Type and insured
  if (a.type === b.type) {
    matchedFields.push('type')
  }
  if (a.insuredPerson && b.insuredPerson &&
      a.insuredPerson.toLowerCase() === b.insuredPerson.toLowerCase()) {
    matchedFields.push('insuredPerson')
  }

  // Determine similarity level
  const hasExactMatch =
    matchedFields.includes('policyNumber') &&
    matchedFields.includes('provider') &&
    matchedFields.includes('coverage') &&
    matchedFields.includes('premium') &&
    matchedFields.includes('startDate') &&
    matchedFields.includes('expiryDate')

  if (hasExactMatch) {
    return { similarity: 'exact', matchedFields }
  }

  // High similarity: same policy number + provider, or same provider + dates + coverage
  const hasHighSimilarity =
    (matchedFields.includes('policyNumber') && matchedFields.includes('provider')) ||
    (matchedFields.includes('provider') &&
     matchedFields.includes('startDate') &&
     matchedFields.includes('expiryDate') &&
     matchedFields.includes('coverage') &&
     matchedFields.includes('type'))

  if (hasHighSimilarity) {
    return { similarity: 'high', matchedFields }
  }

  // Medium similarity: provider + type + similar financial values
  const hasMediumSimilarity =
    matchedFields.includes('provider') &&
    matchedFields.includes('type') &&
    (matchedFields.includes('coverage') || matchedFields.includes('premium')) &&
    matchedFields.length >= 4

  if (hasMediumSimilarity) {
    return { similarity: 'medium', matchedFields }
  }

  return { similarity: null, matchedFields }
}

/**
 * Find duplicate policies within a list
 * @param policies - Array of policies to check for duplicates
 * @returns Array of duplicate policy pairs with similarity info
 */
export function findDuplicatePolicies(policies: Policy[]): DuplicatePolicy[] {
  const duplicates: DuplicatePolicy[] = []
  const processedPairs = new Set<string>()

  for (let i = 0; i < policies.length; i++) {
    for (let j = i + 1; j < policies.length; j++) {
      const pairKey = `${policies[i].id}-${policies[j].id}`
      if (processedPairs.has(pairKey)) continue
      processedPairs.add(pairKey)

      const { similarity, matchedFields } = comparePolicies(policies[i], policies[j])

      if (similarity) {
        duplicates.push({
          policy: policies[j],
          duplicateOf: policies[i],
          similarity,
          matchedFields,
        })
      }
    }
  }

  return duplicates
}

/**
 * Check if a new policy is a duplicate of any existing policies
 * @param newPolicy - The policy being added
 * @param existingPolicies - Array of existing policies to check against
 * @returns Duplicate info if found, null otherwise
 */
export function checkForDuplicate(
  newPolicy: Policy,
  existingPolicies: Policy[]
): DuplicatePolicy | null {
  for (const existing of existingPolicies) {
    if (existing.id === newPolicy.id) continue

    const { similarity, matchedFields } = comparePolicies(newPolicy, existing)

    if (similarity) {
      return {
        policy: newPolicy,
        duplicateOf: existing,
        similarity,
        matchedFields,
      }
    }
  }

  return null
}

/**
 * Group policies by their duplicate status
 * @param policies - All policies
 * @returns Object with unique policies and grouped duplicates
 */
export function groupDuplicatePolicies(policies: Policy[]): {
  uniquePolicies: Policy[]
  duplicateGroups: Map<string, Policy[]>
} {
  const duplicates = findDuplicatePolicies(policies)
  const duplicateIds = new Set<string>()
  const duplicateGroups = new Map<string, Policy[]>()

  // Build groups of duplicate policies
  for (const dup of duplicates) {
    const originalId = dup.duplicateOf.id
    duplicateIds.add(dup.policy.id)

    if (!duplicateGroups.has(originalId)) {
      duplicateGroups.set(originalId, [dup.duplicateOf])
    }
    const group = duplicateGroups.get(originalId)
    if (group) {
      group.push(dup.policy)
    }
  }

  // Get unique policies (not part of any duplicate group as secondary)
  const uniquePolicies = policies.filter(p => !duplicateIds.has(p.id))

  return { uniquePolicies, duplicateGroups }
}

/**
 * Get the similarity level label for display
 */
export function getSimilarityLabel(similarity: 'exact' | 'high' | 'medium'): string {
  switch (similarity) {
    case 'exact':
      return 'Exact duplicate'
    case 'high':
      return 'Very similar'
    case 'medium':
      return 'Possibly duplicate'
  }
}

/**
 * Get Turkish label for similarity level
 */
export function getSimilarityLabelTr(similarity: 'exact' | 'high' | 'medium'): string {
  switch (similarity) {
    case 'exact':
      return 'Birebir kopya'
    case 'high':
      return 'Cok benzer'
    case 'medium':
      return 'Muhtemel kopya'
  }
}

/**
 * Create a createdAt timestamp for a new policy
 */
export function createPolicyTimestamp(): string {
  return new Date().toISOString()
}

/**
 * Add createdAt timestamp to policies that don't have one
 */
export function ensurePolicyTimestamps<T extends Policy>(policies: T[]): T[] {
  const now = createPolicyTimestamp()
  return policies.map(p => ({
    ...p,
    createdAt: p.createdAt || now,
  }))
}
