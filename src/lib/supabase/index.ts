// Supabase client and utilities
export { supabase, isSupabaseConfigured } from './client'
export type { SupabaseClient } from './client'

// Database types
export type {
  Database,
  PolicyType,
  PolicyStatus,
  Coverage,
  RawPolicyData,
  PolicyWithUser,
  PolicyRow,
  PolicyInsert,
  PolicyUpdate,
  PolicyDocumentRow,
  PolicyDocumentInsert,
  UserRow,
  UserInsert,
  NewPolicy,
  Policy,
} from './types'

// Authentication
export {
  signUp,
  signIn,
  signInWithProvider,
  signOut,
  getSession,
  getUser,
  resetPassword,
  updatePassword,
  updateProfile,
  onAuthStateChange,
} from './auth'
export type { AuthState } from './auth'

// Policy operations
export {
  fetchPolicies,
  fetchPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy as deleteSupabasePolicy,
  uploadPolicyDocument,
  getPolicyDocuments,
  deletePolicyDocument,
} from './policies'
