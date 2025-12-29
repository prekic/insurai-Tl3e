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
 */
export async function uploadPolicyDocument(
  policyId: string,
  file: File
): Promise<{ path: string; url: string }> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  const fileExt = file.name.split('.').pop()
  const fileName = `${policyId}/${Date.now()}.${fileExt}`
  const filePath = `policy-documents/${fileName}`

  const { error: uploadError } = await supabase.storage
    .from('documents')
    .upload(filePath, file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (uploadError) throw uploadError

  const { data } = supabase.storage
    .from('documents')
    .getPublicUrl(filePath)

  // Also store reference in policy_documents table
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
    url: data.publicUrl,
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
