import { supabase, isSupabaseConfigured } from './client'
import type { PolicyRow, PolicyInsert, PolicyUpdate, PolicyDocumentRow, PolicyDocumentInsert } from './types'

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
