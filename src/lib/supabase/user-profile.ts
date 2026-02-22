/**
 * User Profile Service
 *
 * Handles fetching and updating user profile data in Supabase.
 * Profile data is stored in both auth.users (user_metadata) and public.users table.
 */

import { supabase } from './client'
import { isSupabaseConfigured } from './config'
import type { UserRow, UserUpdate } from './types'

/**
 * User profile data structure
 */
export interface UserProfile {
  id: string
  email: string
  fullName: string | null
  avatarUrl: string | null
  phone: string | null
  location: string | null
  company: string | null
  locale: string
  createdAt: string
}

/**
 * User profile update data
 */
export interface UserProfileUpdate {
  fullName?: string
  phone?: string
  location?: string
  company?: string
  locale?: string
}

/**
 * User statistics
 */
export interface UserStats {
  policiesAnalyzed: number
  comparisons: number
  savedReports: number
}

/**
 * Fetch the current user's profile from the users table
 */
export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  if (!isSupabaseConfigured()) {
    return null
  }

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single()

  if (error) {
    // If user doesn't exist in users table, return null (will be created on first update)
    if (error.code === 'PGRST116') {
      return null
    }
    throw error
  }

  // Also get user_metadata from auth for additional fields
  const { data: authData } = await supabase.auth.getUser()
  const userMetadata = authData?.user?.user_metadata || {}

  return {
    id: data.id,
    email: data.email,
    fullName: data.full_name || userMetadata.full_name || null,
    avatarUrl: data.avatar_url || userMetadata.avatar_url || null,
    phone: userMetadata.phone || null,
    location: userMetadata.location || null,
    company: userMetadata.company || null,
    locale: data.locale || 'en',
    createdAt: data.created_at,
  }
}

/**
 * Update the current user's profile
 * Updates both the users table and auth user_metadata
 */
export async function updateUserProfile(
  userId: string,
  updates: UserProfileUpdate
): Promise<UserProfile> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  // Update auth user_metadata (for phone, location, company)
  const { error: authError } = await supabase.auth.updateUser({
    data: {
      full_name: updates.fullName,
      phone: updates.phone,
      location: updates.location,
      company: updates.company,
    },
  })

  if (authError) {
    throw authError
  }

  // Check if user exists in users table
  const { data: existingUser } = await supabase
    .from('users')
    .select('id')
    .eq('id', userId)
    .single()

  if (existingUser) {
    // Update existing user record
    const userUpdate: UserUpdate = {
      full_name: updates.fullName,
      locale: updates.locale,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = await supabase
      .from('users')
      .update(userUpdate)
      .eq('id', userId)
      .select()
      .single()

    if (error) throw error

    return transformUserRow(data, updates)
  } else {
    // Create user record if it doesn't exist
    const { data: authUser } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('users')
      .insert({
        id: userId,
        email: authUser?.user?.email || '',
        full_name: updates.fullName,
        locale: updates.locale || 'en',
      })
      .select()
      .single()

    if (error) throw error

    return transformUserRow(data, updates)
  }
}

/**
 * Get user statistics (policies analyzed, etc.)
 */
export async function fetchUserStats(userId: string): Promise<UserStats> {
  if (!isSupabaseConfigured()) {
    return { policiesAnalyzed: 0, comparisons: 0, savedReports: 0 }
  }

  // Count policies for this user
  const { count: policiesCount, error } = await supabase
    .from('policies')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)

  if (error) {
    console.warn('Failed to fetch user stats:', error)
    return { policiesAnalyzed: 0, comparisons: 0, savedReports: 0 }
  }

  // For now, comparisons and reports are derived from policies
  // In future, these could be tracked separately
  return {
    policiesAnalyzed: policiesCount || 0,
    comparisons: Math.floor((policiesCount || 0) / 2), // Approximation
    savedReports: Math.floor((policiesCount || 0) / 3), // Approximation
  }
}

/**
 * Transform UserRow to UserProfile
 */
function transformUserRow(row: UserRow, additionalData?: UserProfileUpdate): UserProfile {
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    avatarUrl: row.avatar_url,
    phone: additionalData?.phone || null,
    location: additionalData?.location || null,
    company: additionalData?.company || null,
    locale: row.locale,
    createdAt: row.created_at,
  }
}

/**
 * Delete user account and all associated data
 * DANGER: This is irreversible!
 */
export async function deleteUserAccount(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error('Supabase is not configured')
  }

  // Delete all user policies first (RLS will ensure only user's policies are deleted)
  const { error: policiesError } = await supabase
    .from('policies')
    .delete()
    .eq('user_id', userId)

  if (policiesError) {
    throw new Error(`Failed to delete policies: ${policiesError.message}`)
  }

  // Delete user from users table
  const { error: userError } = await supabase
    .from('users')
    .delete()
    .eq('id', userId)

  if (userError) {
    throw new Error(`Failed to delete user record: ${userError.message}`)
  }

  // Note: Actual auth user deletion requires admin privileges
  // In production, this would be handled by a server-side function
}
