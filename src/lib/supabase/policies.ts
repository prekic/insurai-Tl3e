import { supabase, isSupabaseConfigured } from './client'
import type {
  PolicyRow,
  PolicyInsert,
  PolicyUpdate,
  PolicyDocumentRow,
  PolicyDocumentInsert,
  PolicyVersionRow,
  VersionChangeType,
} from './types'

/**
 * Fetch all policies for the current user
 */
export async function fetchPolicies(): Promise<PolicyRow[]> {
  if (!isSupabaseConfigured()) {
    return []
  }

  const { data, error } = await supabase
    .from('policies')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as PolicyRow[]) || []
}

/**
 * Fetch a single policy by ID
 */
export async function fetchPolicy(id: string): Promise<PolicyRow | null> {
  if (!isSupabaseConfigured()) {
    return null
  }

  const { data, error } = await supabase
    .from('policies')
    .select('*')
    .eq('id', id)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null // Not found
    throw error
  }
  return data as PolicyRow
}

/**
 * Create a new policy
 */
export async function createPolicy(policy: PolicyInsert): Promise<PolicyRow> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await supabase
    .from('policies')
    .insert(policy)
    .select()
    .single()

  if (error) throw error
  return data as PolicyRow
}

/**
 * Update an existing policy
 */
export async function updatePolicy(id: string, updates: PolicyUpdate): Promise<PolicyRow> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  const { data, error } = await supabase
    .from('policies')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data as PolicyRow
}

/**
 * Delete a policy
 */
export async function deletePolicy(id: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  const { error } = await supabase
    .from('policies')
    .delete()
    .eq('id', id)

  if (error) throw error
}

/**
 * Upload a policy document to storage
 * Path format: policy-documents/{user_id}/{policy_id}/{timestamp}.{ext}
 */
export async function uploadPolicyDocument(
  policyId: string,
  file: File
): Promise<{ path: string; url: string }> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  // Get current user for user-scoped path
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    throw new Error('User must be authenticated to upload documents')
  }

  const fileExt = file.name.split('.').pop()?.toLowerCase() || 'pdf'
  // Path format: policy-documents/{user_id}/{policy_id}/{timestamp}.{ext}
  const filePath = `policy-documents/${user.id}/${policyId}/${Date.now()}.${fileExt}`

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (uploadError) throw uploadError

  // Get signed URL for private bucket (not public URL)
  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from('documents')
    .createSignedUrl(filePath, 3600) // 1 hour expiry

  if (signedUrlError) throw signedUrlError

  // Store reference in policy_documents table
  const docInsert: PolicyDocumentInsert = {
    policy_id: policyId,
    file_name: file.name,
    file_path: filePath,
    file_size: file.size,
    mime_type: file.type,
  }

  const { error: insertError } = await supabase
    .from('policy_documents')
    .insert(docInsert)

  if (insertError) throw insertError

  return {
    path: filePath,
    url: signedUrlData.signedUrl,
  }
}

/**
 * Get documents for a policy
 */
export async function getPolicyDocuments(policyId: string): Promise<PolicyDocumentRow[]> {
  if (!isSupabaseConfigured()) {
    return []
  }

  const { data, error } = await supabase
    .from('policy_documents')
    .select('*')
    .eq('policy_id', policyId)
    .order('uploaded_at', { ascending: false })

  if (error) throw error
  return (data as PolicyDocumentRow[]) || []
}

/**
 * Get a signed URL for a document (for private bucket access)
 */
export async function getDocumentSignedUrl(
  filePath: string,
  expiresIn: number = 3600
): Promise<string | null> {
  if (!isSupabaseConfigured()) {
    return null
  }

  const { data, error } = await supabase.storage
    .from('documents')
    .createSignedUrl(filePath, expiresIn)

  if (error) {
    console.error('Failed to create signed URL:', error.message)
    return null
  }

  return data.signedUrl
}

/**
 * Get documents with signed URLs for a policy
 */
export async function getPolicyDocumentsWithUrls(
  policyId: string
): Promise<Array<PolicyDocumentRow & { signedUrl: string | null }>> {
  const documents = await getPolicyDocuments(policyId)

  const docsWithUrls = await Promise.all(
    documents.map(async (doc) => ({
      ...doc,
      signedUrl: await getDocumentSignedUrl(doc.file_path),
    }))
  )

  return docsWithUrls
}

/**
 * Delete a policy document
 */
export async function deletePolicyDocument(documentId: string, filePath: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  // Delete from storage
  const { error: storageError } = await supabase.storage
    .from('documents')
    .remove([filePath])

  if (storageError) throw storageError

  // Delete from database
  const { error: dbError } = await supabase
    .from('policy_documents')
    .delete()
    .eq('id', documentId)

  if (dbError) throw dbError
}

// =============================================================================
// DUPLICATE/AMENDMENT DETECTION
// =============================================================================

/**
 * Find existing policy by identifier (policy number + provider)
 * Used for pre-upload duplicate/amendment detection
 *
 * @param policyNumber - The policy number to search for
 * @param provider - The insurance provider name
 * @param insuredPerson - Optional insured person/item for additional matching
 * @returns Array of matching policies (may be multiple if partial match)
 */
export async function findExistingPolicyByIdentifier(
  policyNumber: string,
  provider: string,
  insuredPerson?: string
): Promise<PolicyRow[]> {
  if (!isSupabaseConfigured()) {
    return []
  }

  if (!policyNumber || !provider) {
    return []
  }

  // Normalize for case-insensitive search
  const normalizedPolicyNumber = policyNumber.trim().toLowerCase().replace(/\s+/g, '')
  const normalizedProvider = provider.trim().toLowerCase()

  // Build query - use ILIKE for case-insensitive matching
  // Note: We search for policy_number without spaces to match our normalization
  let query = supabase
    .from('policies')
    .select('*')
    .ilike('provider', `%${normalizedProvider}%`)

  // For policy number, we need to handle whitespace variations
  // Using ilike with the pattern to match regardless of internal spaces
  query = query.filter(
    'policy_number',
    'ilike',
    `%${normalizedPolicyNumber.replace(/(.)/g, '$1%').slice(0, -1)}%`
  )

  const { data, error } = await query.order('created_at', { ascending: false })

  if (error) {
    console.error('Error finding existing policy:', error)
    return []
  }

  // Further filter results in-memory for exact normalized match
  const results = (data as PolicyRow[]) || []

  return results.filter((policy) => {
    const policyNumMatch =
      policy.policy_number
        ?.trim()
        .toLowerCase()
        .replace(/\s+/g, '') === normalizedPolicyNumber

    const providerMatch = policy.provider?.trim().toLowerCase().includes(normalizedProvider)

    // If insuredPerson is provided, also check for match
    if (insuredPerson && policyNumMatch && providerMatch) {
      const normalizedInsured = insuredPerson.trim().toLowerCase()
      const policyInsured = policy.insured_person?.trim().toLowerCase() || ''
      const policyLocation = policy.location?.trim().toLowerCase() || ''

      // Match if insuredPerson matches either insured_person or location
      return (
        policyInsured.includes(normalizedInsured) ||
        policyLocation.includes(normalizedInsured) ||
        normalizedInsured.includes(policyInsured) ||
        normalizedInsured.includes(policyLocation)
      )
    }

    return policyNumMatch && providerMatch
  })
}

/**
 * Check if an exact policy already exists (by all key fields)
 * More strict than identifier match
 */
export async function findExactPolicy(
  policyNumber: string,
  provider: string,
  startDate: string,
  coverage: number
): Promise<PolicyRow | null> {
  if (!isSupabaseConfigured()) {
    return null
  }

  const candidates = await findExistingPolicyByIdentifier(policyNumber, provider)

  // Find exact match by also comparing start date and coverage
  const startTime = new Date(startDate).getTime()

  for (const policy of candidates) {
    const policyStartTime = new Date(policy.start_date).getTime()
    const policyCoverage = Math.round(Number(policy.coverage))
    const targetCoverage = Math.round(coverage)

    if (policyStartTime === startTime && policyCoverage === targetCoverage) {
      return policy
    }
  }

  return null
}

// =============================================================================
// SEARCH FUNCTIONS
// =============================================================================

/**
 * Search policies using full-text search
 */
export async function searchPolicies(query: string): Promise<PolicyRow[]> {
  if (!isSupabaseConfigured()) {
    return []
  }

  if (!query.trim()) {
    return fetchPolicies()
  }

  // Try the database function first
  const { data, error } = await supabase.rpc('search_policies', {
    search_query: query.trim(),
  })

  if (error) {
    // Fallback to simple ILIKE search if function doesn't exist
    console.warn('Full-text search failed, using fallback:', error.message)
    return searchPoliciesFallback(query)
  }

  return (data as PolicyRow[]) || []
}

/**
 * Fallback search using ILIKE (for when full-text search is not available)
 */
async function searchPoliciesFallback(query: string): Promise<PolicyRow[]> {
  const searchTerm = `%${query.trim()}%`

  const { data, error } = await supabase
    .from('policies')
    .select('*')
    .or(
      `policy_number.ilike.${searchTerm},` +
        `provider.ilike.${searchTerm},` +
        `insured_person.ilike.${searchTerm},` +
        `type_tr.ilike.${searchTerm},` +
        `location.ilike.${searchTerm}`
    )
    .order('created_at', { ascending: false })

  if (error) throw error
  return (data as PolicyRow[]) || []
}

// =============================================================================
// VERSIONING FUNCTIONS
// =============================================================================

/**
 * Get version history for a policy
 */
export async function getPolicyHistory(policyId: string): Promise<PolicyVersionRow[]> {
  if (!isSupabaseConfigured()) {
    return []
  }

  const { data, error } = await supabase
    .from('policy_versions')
    .select('*')
    .eq('policy_id', policyId)
    .order('version_number', { ascending: false })

  if (error) throw error
  return (data as PolicyVersionRow[]) || []
}

/**
 * Get a specific version of a policy
 */
export async function getPolicyVersion(
  policyId: string,
  versionNumber: number
): Promise<PolicyVersionRow | null> {
  if (!isSupabaseConfigured()) {
    return null
  }

  const { data, error } = await supabase
    .from('policy_versions')
    .select('*')
    .eq('policy_id', policyId)
    .eq('version_number', versionNumber)
    .single()

  if (error) {
    if (error.code === 'PGRST116') return null
    throw error
  }
  return data as PolicyVersionRow
}

/**
 * Create a manual version entry (for manual edits)
 */
export async function createPolicyVersion(
  policyId: string,
  changeType: VersionChangeType,
  changeSummary: string,
  previousData: Record<string, unknown> | null,
  newData: Record<string, unknown>
): Promise<PolicyVersionRow> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  // Get next version number
  const { data: versions } = await supabase
    .from('policy_versions')
    .select('version_number')
    .eq('policy_id', policyId)
    .order('version_number', { ascending: false })
    .limit(1)

  const nextVersion = versions && versions.length > 0 ? versions[0].version_number + 1 : 1

  const { data, error } = await supabase
    .from('policy_versions')
    .insert({
      policy_id: policyId,
      version_number: nextVersion,
      change_type: changeType,
      change_summary: changeSummary,
      previous_data: previousData,
      new_data: newData,
    })
    .select()
    .single()

  if (error) throw error
  return data as PolicyVersionRow
}

/**
 * Restore a policy to a previous version
 */
export async function restorePolicyVersion(
  policyId: string,
  versionNumber: number
): Promise<PolicyRow> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  // Get the version to restore
  const version = await getPolicyVersion(policyId, versionNumber)
  if (!version) {
    throw new Error(`Version ${versionNumber} not found for policy ${policyId}`)
  }

  // Extract policy data from version
  const versionData = version.new_data as unknown as PolicyRow

  // Update the current policy with version data
  const updateData: PolicyUpdate = {
    policy_number: versionData.policy_number,
    provider: versionData.provider,
    type: versionData.type,
    type_tr: versionData.type_tr,
    coverage: versionData.coverage,
    premium: versionData.premium,
    deductible: versionData.deductible,
    start_date: versionData.start_date,
    expiry_date: versionData.expiry_date,
    status: versionData.status,
    insured_person: versionData.insured_person,
    location: versionData.location,
    raw_data: versionData.raw_data,
  }

  return updatePolicy(policyId, updateData)
}

// =============================================================================
// POLICY STATISTICS
// =============================================================================

/**
 * Get policy statistics for the current user
 */
export async function getPolicyStats(): Promise<{
  total: number
  active: number
  expiring: number
  expired: number
  byType: Record<string, number>
  totalCoverage: number
  totalPremium: number
}> {
  if (!isSupabaseConfigured()) {
    return {
      total: 0,
      active: 0,
      expiring: 0,
      expired: 0,
      byType: {},
      totalCoverage: 0,
      totalPremium: 0,
    }
  }

  const policies = await fetchPolicies()

  const stats = {
    total: policies.length,
    active: policies.filter((p) => p.status === 'active').length,
    expiring: policies.filter((p) => p.status === 'expiring').length,
    expired: policies.filter((p) => p.status === 'expired').length,
    byType: {} as Record<string, number>,
    totalCoverage: policies.reduce((sum, p) => sum + Number(p.coverage), 0),
    totalPremium: policies.reduce((sum, p) => sum + Number(p.premium), 0),
  }

  // Count by type
  for (const policy of policies) {
    stats.byType[policy.type] = (stats.byType[policy.type] || 0) + 1
  }

  return stats
}
