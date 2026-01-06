// Supabase client and utilities
export { supabase, isSupabaseConfigured } from './client'
export type { SupabaseClient } from './client'

// Database types
export type {
  // Enums
  PolicyType,
  PolicyStatus,
  VersionChangeType,
  // JSON types
  Json,
  Coverage,
  MarketComparison,
  RiskScore,
  GapAnalysis,
  RawPolicyData,
  // Table types - policies
  PolicyRow,
  PolicyInsert,
  PolicyUpdate,
  // Table types - policy_documents
  PolicyDocumentRow,
  PolicyDocumentInsert,
  PolicyDocumentUpdate,
  // Table types - policy_versions
  PolicyVersionRow,
  PolicyVersionInsert,
  PolicyVersionUpdate,
  // Table types - users
  UserRow,
  UserInsert,
  UserUpdate,
  // View types
  StorageStatsRow,
  // Function types
  SearchPoliciesResult,
  PolicyHistoryEntry,
  // Database interface
  Database,
  // Helper types
  PolicyWithUser,
  PolicyDocumentWithUrl,
  PolicySearchResult,
  PolicyStats,
  // Aliases
  NewPolicy,
  Policy,
  NewPolicyDocument,
  PolicyDocument,
  PolicyVersion,
  User,
} from './types'

// Type guards
export { isPolicyType, isPolicyStatus, isVersionChangeType } from './types'

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

// User profile operations
export {
  fetchUserProfile,
  updateUserProfile,
  fetchUserStats,
  deleteUserAccount,
} from './user-profile'
export type { UserProfile, UserProfileUpdate, UserStats } from './user-profile'

// Policy operations
export {
  fetchPolicies,
  fetchPolicy,
  createPolicy,
  updatePolicy,
  deletePolicy as deleteSupabasePolicy,
  // Document storage
  uploadPolicyDocument,
  getPolicyDocuments,
  getDocumentSignedUrl,
  getPolicyDocumentsWithUrls,
  deletePolicyDocument,
  // Search
  searchPolicies,
  // Versioning
  getPolicyHistory,
  getPolicyVersion,
  createPolicyVersion,
  restorePolicyVersion,
  // Statistics
  getPolicyStats,
} from './policies'
