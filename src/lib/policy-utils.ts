import type { Policy, DuplicatePolicy } from '@/types/policy'

/**
 * Time threshold for considering a policy as "new" (in milliseconds)
 * Default: 24 hours
 */
const NEW_POLICY_THRESHOLD_MS = 24 * 60 * 60 * 1000

// ============================================================================
// NORMALIZATION FUNCTIONS - Handle variations in extracted data
// ============================================================================

/**
 * Normalize number for comparison (round to integer to handle float precision)
 */
export function normalizeNumber(value: number | string | undefined | null): number | null {
  if (value === undefined || value === null || value === '') return null
  const num = typeof value === 'string' ? parseFloat(value) : value
  if (isNaN(num)) return null
  return Math.round(num)
}

/**
 * Normalize date for comparison (parse to timestamp)
 * Handles: YYYY-MM-DD, DD.MM.YYYY, DD/MM/YYYY formats
 */
export function normalizeDate(value: string | Date | undefined | null): number | null {
  if (!value) return null

  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : value.getTime()
  }

  // Try ISO format first (YYYY-MM-DD)
  let date = new Date(value)
  if (!isNaN(date.getTime())) {
    return date.getTime()
  }

  // Try Turkish/European format (DD.MM.YYYY or DD/MM/YYYY)
  const parts = value.split(/[./]/)
  if (parts.length === 3) {
    const [day, month, year] = parts
    date = new Date(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`)
    if (!isNaN(date.getTime())) {
      return date.getTime()
    }
  }

  return null
}

/**
 * Normalize string for comparison (trim + lowercase)
 */
export function normalizeString(value: string | undefined | null): string {
  if (!value) return ''
  return value.trim().toLowerCase()
}

/**
 * Normalize policy number (case-insensitive, remove whitespace)
 */
export function normalizePolicyNumber(value: string | undefined | null): string {
  if (!value) return ''
  return value.trim().toLowerCase().replace(/\s+/g, '')
}

// ============================================================================
// TOLERANCE-BASED COMPARISON
// ============================================================================

/**
 * Compare two values with tolerance based on type
 */
function compareTolerant(
  a: unknown,
  b: unknown,
  type: 'number' | 'date' | 'string'
): boolean {
  if (type === 'number') {
    return normalizeNumber(a as number) === normalizeNumber(b as number)
  }
  if (type === 'date') {
    return normalizeDate(a as string) === normalizeDate(b as string)
  }
  return normalizeString(a as string) === normalizeString(b as string)
}

// ============================================================================
// POLICY IDENTIFIER MATCHING
// ============================================================================

/**
 * Check if policies have matching identifiers (tolerant comparison)
 * Uses: policyNumber + provider + insuredPerson (or location for property)
 */
export function isPolicyIdentifierMatch(a: Policy, b: Policy): boolean {
  // Must match policy number + provider
  const sameNumber = normalizePolicyNumber(a.policyNumber) === normalizePolicyNumber(b.policyNumber)
  const sameProvider = normalizeString(a.provider) === normalizeString(b.provider)

  if (!sameNumber || !sameProvider) {
    return false
  }

  // Also check insured person/item (if available)
  const aInsured = normalizeString(a.insuredPerson) || normalizeString(a.location)
  const bInsured = normalizeString(b.insuredPerson) || normalizeString(b.location)

  // If both have insured info, they must match
  // If neither has it, consider it a match (legacy data)
  if (aInsured && bInsured) {
    return aInsured === bInsured
  }

  return true
}

// ============================================================================
// POLICY DIFF CALCULATION
// ============================================================================

export interface PolicyFieldDiff {
  field: string
  fieldLabel: string
  fieldLabelTr: string
  oldValue: unknown
  newValue: unknown
  type: 'number' | 'date' | 'string' | 'array'
  significance: 'critical' | 'major' | 'moderate' | 'minor'
}

/**
 * Field configuration for diff comparison
 */
const DIFF_FIELD_CONFIG: Array<{
  field: keyof Policy
  label: string
  labelTr: string
  type: 'number' | 'date' | 'string' | 'array'
  significance: 'critical' | 'major' | 'moderate' | 'minor'
}> = [
  // Critical - core policy terms
  { field: 'coverage', label: 'Coverage', labelTr: 'Teminat', type: 'number', significance: 'critical' },
  { field: 'premium', label: 'Premium', labelTr: 'Prim', type: 'number', significance: 'critical' },
  { field: 'startDate', label: 'Start Date', labelTr: 'Başlangıç Tarihi', type: 'date', significance: 'critical' },
  { field: 'expiryDate', label: 'Expiry Date', labelTr: 'Bitiş Tarihi', type: 'date', significance: 'critical' },

  // Major - important financial/coverage terms
  { field: 'deductible', label: 'Deductible', labelTr: 'Muafiyet', type: 'number', significance: 'major' },
  { field: 'type', label: 'Policy Type', labelTr: 'Poliçe Türü', type: 'string', significance: 'major' },
  { field: 'monthlyPremium', label: 'Monthly Premium', labelTr: 'Aylık Prim', type: 'number', significance: 'major' },

  // Moderate - policyholder details
  { field: 'insuredPerson', label: 'Insured Person', labelTr: 'Sigortalı', type: 'string', significance: 'moderate' },
  { field: 'beneficiary', label: 'Beneficiary', labelTr: 'Lehdar', type: 'string', significance: 'moderate' },
  { field: 'location', label: 'Risk Address', labelTr: 'Riziko Adresi', type: 'string', significance: 'moderate' },

  // Minor - administrative
  { field: 'paymentFrequency', label: 'Payment Frequency', labelTr: 'Ödeme Sıklığı', type: 'string', significance: 'minor' },
  { field: 'agentName', label: 'Agent', labelTr: 'Acente', type: 'string', significance: 'minor' },
  { field: 'status', label: 'Status', labelTr: 'Durum', type: 'string', significance: 'minor' },
]

/**
 * Calculate field differences between two policies
 * Returns all fields that have changed
 */
export function calculatePolicyDiff(
  oldPolicy: Policy,
  newPolicy: Policy
): PolicyFieldDiff[] {
  const diffs: PolicyFieldDiff[] = []

  for (const config of DIFF_FIELD_CONFIG) {
    const oldVal = oldPolicy[config.field]
    const newVal = newPolicy[config.field]

    // Skip if both are null/undefined/empty
    const oldNormalized = config.type === 'number'
      ? normalizeNumber(oldVal as number)
      : config.type === 'date'
      ? normalizeDate(oldVal as string)
      : normalizeString(oldVal as string)

    const newNormalized = config.type === 'number'
      ? normalizeNumber(newVal as number)
      : config.type === 'date'
      ? normalizeDate(newVal as string)
      : normalizeString(newVal as string)

    if (oldNormalized === newNormalized) continue
    if (oldNormalized === null && newNormalized === null) continue
    if (oldNormalized === '' && newNormalized === '') continue

    diffs.push({
      field: config.field,
      fieldLabel: config.label,
      fieldLabelTr: config.labelTr,
      oldValue: oldVal,
      newValue: newVal,
      type: config.type,
      significance: config.significance,
    })
  }

  // Check coverages array (special handling)
  if (JSON.stringify(oldPolicy.coverages) !== JSON.stringify(newPolicy.coverages)) {
    diffs.push({
      field: 'coverages',
      fieldLabel: 'Coverage Details',
      fieldLabelTr: 'Teminat Detayları',
      oldValue: oldPolicy.coverages,
      newValue: newPolicy.coverages,
      type: 'array',
      significance: 'major',
    })
  }

  // Check exclusions array
  if (JSON.stringify(oldPolicy.exclusions) !== JSON.stringify(newPolicy.exclusions)) {
    diffs.push({
      field: 'exclusions',
      fieldLabel: 'Exclusions',
      fieldLabelTr: 'İstisnalar',
      oldValue: oldPolicy.exclusions,
      newValue: newPolicy.exclusions,
      type: 'array',
      significance: 'major',
    })
  }

  // Check special conditions array
  if (JSON.stringify(oldPolicy.specialConditions) !== JSON.stringify(newPolicy.specialConditions)) {
    diffs.push({
      field: 'specialConditions',
      fieldLabel: 'Special Conditions',
      fieldLabelTr: 'Özel Şartlar',
      oldValue: oldPolicy.specialConditions,
      newValue: newPolicy.specialConditions,
      type: 'array',
      significance: 'moderate',
    })
  }

  return diffs
}

// ============================================================================
// PRE-UPLOAD CHECK RESULT TYPES
// ============================================================================

export type PreUploadCheckResult =
  | { type: 'noConflict' }
  | { type: 'exactDuplicate'; existingPolicy: Policy }
  | { type: 'amendment'; existingPolicy: Policy; changes: PolicyFieldDiff[] }

/**
 * Compare policies and determine conflict type
 */
export function comparePoliciesAdvanced(
  newPolicy: Policy,
  existingPolicy: Policy
): PreUploadCheckResult {
  const isIdentifierMatch = isPolicyIdentifierMatch(newPolicy, existingPolicy)

  if (!isIdentifierMatch) {
    return { type: 'noConflict' }
  }

  // Same identifier - check for differences
  const changes = calculatePolicyDiff(existingPolicy, newPolicy)

  if (changes.length === 0) {
    return { type: 'exactDuplicate', existingPolicy }
  }

  return { type: 'amendment', existingPolicy, changes }
}

// ============================================================================
// LEGACY COMPARISON (for existing duplicate detection in Dashboard)
// ============================================================================

/**
 * Compare two policies to determine their similarity level (TOLERANT)
 */
function comparePolicies(a: Policy, b: Policy): { similarity: 'exact' | 'high' | 'medium' | null; matchedFields: string[] } {
  const matchedFields: string[] = []

  // Primary identifiers (tolerant)
  if (normalizePolicyNumber(a.policyNumber) === normalizePolicyNumber(b.policyNumber) && a.policyNumber) {
    matchedFields.push('policyNumber')
  }
  if (normalizeString(a.provider) === normalizeString(b.provider)) {
    matchedFields.push('provider')
  }

  // Financial fields (tolerant - round to integer)
  if (compareTolerant(a.coverage, b.coverage, 'number')) {
    matchedFields.push('coverage')
  }
  if (compareTolerant(a.premium, b.premium, 'number')) {
    matchedFields.push('premium')
  }
  if (compareTolerant(a.deductible, b.deductible, 'number')) {
    matchedFields.push('deductible')
  }

  // Date fields (tolerant - parse to timestamp)
  if (compareTolerant(a.startDate, b.startDate, 'date')) {
    matchedFields.push('startDate')
  }
  if (compareTolerant(a.expiryDate, b.expiryDate, 'date')) {
    matchedFields.push('expiryDate')
  }

  // Type and insured (tolerant)
  if (normalizeString(a.type) === normalizeString(b.type)) {
    matchedFields.push('type')
  }
  if (a.insuredPerson && b.insuredPerson &&
      normalizeString(a.insuredPerson) === normalizeString(b.insuredPerson)) {
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

  // High similarity: same policy number + provider + insuredPerson
  const hasHighSimilarity =
    matchedFields.includes('policyNumber') &&
    matchedFields.includes('provider') &&
    (matchedFields.includes('insuredPerson') || !a.insuredPerson || !b.insuredPerson)

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

// ============================================================================
// NEW POLICY DETECTION
// ============================================================================

/**
 * Check if a policy is considered "new" based on its createdAt timestamp
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
 */
export function isSessionNewPolicy(policy: Policy, sessionStartTime: string): boolean {
  if (!policy.createdAt) {
    return false
  }

  return new Date(policy.createdAt) > new Date(sessionStartTime)
}

// ============================================================================
// DUPLICATE DETECTION (for Dashboard)
// ============================================================================

/**
 * Find duplicate policies within a list
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

// ============================================================================
// LABELS
// ============================================================================

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

export function getSimilarityLabelTr(similarity: 'exact' | 'high' | 'medium'): string {
  switch (similarity) {
    case 'exact':
      return 'Birebir kopya'
    case 'high':
      return 'Çok benzer'
    case 'medium':
      return 'Muhtemel kopya'
  }
}

export function getSignificanceLabel(significance: PolicyFieldDiff['significance']): string {
  switch (significance) {
    case 'critical': return 'Critical Change'
    case 'major': return 'Major Change'
    case 'moderate': return 'Moderate Change'
    case 'minor': return 'Minor Change'
  }
}

export function getSignificanceLabelTr(significance: PolicyFieldDiff['significance']): string {
  switch (significance) {
    case 'critical': return 'Kritik Değişiklik'
    case 'major': return 'Önemli Değişiklik'
    case 'moderate': return 'Orta Değişiklik'
    case 'minor': return 'Küçük Değişiklik'
  }
}

// ============================================================================
// TIMESTAMPS
// ============================================================================

export function createPolicyTimestamp(): string {
  return new Date().toISOString()
}

export function ensurePolicyTimestamps<T extends Policy>(policies: T[]): T[] {
  const now = createPolicyTimestamp()
  return policies.map(p => ({
    ...p,
    createdAt: p.createdAt || now,
  }))
}
