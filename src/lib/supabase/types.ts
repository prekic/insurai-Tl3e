/**
 * Database types for Supabase
 *
 * These types define the structure of your Supabase database tables.
 * Update these when you modify your database schema in Supabase Dashboard.
 *
 * You can auto-generate these types using:
 * npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/supabase/types.ts
 */

// Policy types (matching existing frontend types in src/types/policy.ts)
export type PolicyType = 'kasko' | 'traffic' | 'home' | 'health' | 'life' | 'dask' | 'business'

export type PolicyStatus = 'active' | 'expiring' | 'expired' | 'pending'

// Coverage interface (matching src/types/policy.ts)
export interface Coverage {
  name: string
  nameTr: string
  limit: number
  deductible: number
  included: boolean
  description?: string
}

// Raw policy data from AI extraction
export interface RawPolicyData {
  extractedText?: string
  confidence?: number
  fields?: Record<string, unknown>
  coverages?: Coverage[]
  aiConfidence?: number
  aiInsights?: string[]
  exclusions?: string[]
  specialConditions?: string[]
  insuranceLine?: string
  marketComparison?: {
    averagePremium: number
    averageCoverage: number
    percentile: number
  }
}

// Policy row type
export interface PolicyRow {
  id: string
  user_id: string
  policy_number: string
  provider: string
  type: PolicyType
  type_tr: string
  coverage: number
  premium: number
  deductible: number
  start_date: string
  expiry_date: string
  status: PolicyStatus
  insured_person: string
  location: string | null
  document_type: string
  upload_date: string
  logo: string | null
  raw_data: RawPolicyData | null
  created_at: string
  updated_at: string
}

// Policy insert type (omit auto-generated fields)
export interface PolicyInsert {
  user_id: string
  policy_number: string
  provider: string
  type: PolicyType
  type_tr: string
  coverage: number
  premium: number
  deductible?: number
  start_date: string
  expiry_date: string
  status?: PolicyStatus
  insured_person: string
  location?: string | null
  document_type?: string
  upload_date?: string
  logo?: string | null
  raw_data?: RawPolicyData | null
}

// Policy update type (all fields optional)
export type PolicyUpdate = Partial<PolicyInsert>

// Policy document row type
export interface PolicyDocumentRow {
  id: string
  policy_id: string
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
  uploaded_at: string
}

// Policy document insert type
export interface PolicyDocumentInsert {
  policy_id: string
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
}

// User row type
export interface UserRow {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  locale: string
  created_at: string
  updated_at: string
}

// User insert type
export interface UserInsert {
  id: string
  email: string
  full_name?: string | null
  avatar_url?: string | null
  locale?: string
}

// Database interface for Supabase client
export interface Database {
  public: {
    Tables: {
      policies: {
        Row: PolicyRow
        Insert: PolicyInsert
        Update: PolicyUpdate
      }
      policy_documents: {
        Row: PolicyDocumentRow
        Insert: PolicyDocumentInsert
        Update: Partial<PolicyDocumentInsert>
      }
      users: {
        Row: UserRow
        Insert: UserInsert
        Update: Partial<UserInsert>
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      policy_type: PolicyType
      policy_status: PolicyStatus
    }
  }
}

// Helper type for policy with user info
export type PolicyWithUser = PolicyRow & {
  user?: UserRow
}

// Aliases for convenience
export type NewPolicy = PolicyInsert
export type Policy = PolicyRow
