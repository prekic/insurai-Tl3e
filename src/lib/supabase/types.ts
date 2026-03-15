/**
 * Supabase Database Types for InsurAI
 *
 * These types define the structure of your Supabase database tables.
 * They are manually maintained to match the schema in:
 * - supabase/migrations/001_initial_schema.sql
 * - supabase/migrations/002_storage_policies.sql
 *
 * To auto-generate types from a live database:
 * npx supabase gen types typescript --project-id YOUR_PROJECT_ID > src/lib/supabase/generated.types.ts
 */

// =============================================================================
// ENUM TYPES
// =============================================================================

/** Policy types supported by the application */
export type PolicyType =
  | 'kasko'
  | 'traffic'
  | 'home'
  | 'health'
  | 'life'
  | 'dask'
  | 'business'
  | 'nakliyat'

/** Policy status values */
export type PolicyStatus = 'active' | 'expiring' | 'expired' | 'pending'

/** Types of changes tracked in policy version history */
export type VersionChangeType = 'created' | 'updated' | 'extracted' | 'manual_edit'

// =============================================================================
// JSON TYPES
// =============================================================================

/** Generic JSON type for Supabase JSONB columns */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

/** Coverage item structure stored in raw_data */
export interface Coverage {
  name: string
  nameTr: string
  limit: number
  deductible: number
  included: boolean
  description?: string
}

/** Market comparison data from AI analysis */
export interface MarketComparison {
  averagePremium: number
  averageCoverage: number
  percentile: number
}

/** Risk score assessment */
export interface RiskScore {
  overall: number
  level: 'very_low' | 'low' | 'moderate' | 'high' | 'very_high'
  topIssue: string | null
  confidence: number
}

/** Gap analysis results */
export interface GapAnalysis {
  overallScore: number
  criticalCount: number
  highCount: number
  totalCount: number
  topIssue: string | null
  topIssueTr: string | null
  financialExposure: number
  remediationCost: number
}

/** Raw policy data from AI extraction (stored in JSONB) */
export interface RawPolicyData {
  // Extraction metadata
  extractedText?: string
  /** AI-processed text with OCR corrections and improved readability */
  processedText?: string
  confidence?: number
  fields?: Record<string, unknown>

  // Coverage details
  coverages?: Coverage[]
  exclusions?: string[]
  exclusionsEn?: string[] | null
  specialConditions?: string[]
  insuranceLine?: string

  // AI analysis results
  aiConfidence?: number
  aiInsights?: string[]
  aiInsightsEn?: string[] | null
  evidenceData?: {
    insights: Record<string, string>
    exclusions: Record<string, string>
  }
  marketComparison?: MarketComparison
  riskScore?: RiskScore
  gapAnalysis?: GapAnalysis

  // Risk mitigation actions
  riskActions?: Array<{
    priority: 'critical' | 'high' | 'medium' | 'low'
    action: string
  }>

  // Gap action items
  gapActions?: Array<{
    priority: 'critical' | 'high' | 'medium' | 'low'
    action: string
    actionTr: string
    estimatedCost: number | null
  }>
}

// =============================================================================
// TABLE TYPES - policies
// =============================================================================

/** Row type for policies table (SELECT) */
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
  search_vector: unknown | null // tsvector type
  canonical_text: string | null
  span_maps: unknown | null
  clause_graph: unknown | null
  is_universal_schema: boolean
  validation_errors: unknown | null
  validation_warnings: unknown | null
  safety_score: number | null
  document_version: number
  canonical_text_version: number
  evidence_span_version: number
  clause_graph_version: number
  extraction_schema_version: string | null
  created_at: string
  updated_at: string
}

/** Insert type for policies table (INSERT) */
export interface PolicyInsert {
  id?: string
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
  canonical_text?: string | null
  span_maps?: unknown | null
  clause_graph?: unknown | null
  is_universal_schema?: boolean
  validation_errors?: unknown | null
  validation_warnings?: unknown | null
  safety_score?: number | null
  document_version?: number
  canonical_text_version?: number
  evidence_span_version?: number
  clause_graph_version?: number
  extraction_schema_version?: string | null
  // search_vector is auto-generated by trigger
  created_at?: string
  updated_at?: string
}

/** Update type for policies table (UPDATE) */
export interface PolicyUpdate {
  id?: string
  user_id?: string
  policy_number?: string
  provider?: string
  type?: PolicyType
  type_tr?: string
  coverage?: number
  premium?: number
  deductible?: number
  start_date?: string
  expiry_date?: string
  status?: PolicyStatus
  insured_person?: string
  location?: string | null
  document_type?: string
  upload_date?: string
  logo?: string | null
  raw_data?: RawPolicyData | null
  canonical_text?: string | null
  span_maps?: unknown | null
  clause_graph?: unknown | null
  is_universal_schema?: boolean
  validation_errors?: unknown | null
  validation_warnings?: unknown | null
  safety_score?: number | null
  document_version?: number
  canonical_text_version?: number
  evidence_span_version?: number
  clause_graph_version?: number
  extraction_schema_version?: string | null
  updated_at?: string
}

// =============================================================================
// TABLE TYPES - policy_documents
// =============================================================================

/** Row type for policy_documents table (SELECT) */
export interface PolicyDocumentRow {
  id: string
  policy_id: string
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
  uploaded_at: string
}

/** Insert type for policy_documents table (INSERT) */
export interface PolicyDocumentInsert {
  id?: string
  policy_id: string
  file_name: string
  file_path: string
  file_size: number
  mime_type: string
  uploaded_at?: string
}

/** Update type for policy_documents table (UPDATE) */
export interface PolicyDocumentUpdate {
  id?: string
  policy_id?: string
  file_name?: string
  file_path?: string
  file_size?: number
  mime_type?: string
  uploaded_at?: string
}

// =============================================================================
// TABLE TYPES - policy_versions
// =============================================================================

/** Row type for policy_versions table (SELECT) */
export interface PolicyVersionRow {
  id: string
  policy_id: string
  version_number: number
  change_type: VersionChangeType
  change_summary: string | null
  previous_data: Record<string, unknown> | null
  new_data: Record<string, unknown>
  changed_by: string | null
  extraction_schema_version: string | null
  changed_at: string
}

/** Insert type for policy_versions table (INSERT) */
export interface PolicyVersionInsert {
  id?: string
  policy_id: string
  version_number: number
  change_type: VersionChangeType
  change_summary?: string | null
  previous_data?: Record<string, unknown> | null
  new_data: Record<string, unknown>
  changed_by?: string | null
  extraction_schema_version?: string | null
  changed_at?: string
}

/** Update type for policy_versions table (UPDATE) */
export interface PolicyVersionUpdate {
  id?: string
  policy_id?: string
  version_number?: number
  change_type?: VersionChangeType
  change_summary?: string | null
  previous_data?: Record<string, unknown> | null
  new_data?: Record<string, unknown>
  changed_by?: string | null
  extraction_schema_version?: string | null
  changed_at?: string
}

// =============================================================================
// TABLE TYPES - users (extends auth.users)
// =============================================================================

/** Row type for users table (SELECT) */
export interface UserRow {
  id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  locale: string
  created_at: string
  updated_at: string
}

/** Insert type for users table (INSERT) */
export interface UserInsert {
  id: string
  email: string
  full_name?: string | null
  avatar_url?: string | null
  locale?: string
  created_at?: string
  updated_at?: string
}

/** Update type for users table (UPDATE) */
export interface UserUpdate {
  id?: string
  email?: string
  full_name?: string | null
  avatar_url?: string | null
  locale?: string
  updated_at?: string
}

// =============================================================================
// VIEW TYPES - storage_stats
// =============================================================================

/** Row type for storage_stats view */
export interface StorageStatsRow {
  user_id: string
  document_count: number
  total_size_bytes: number
  total_size_mb: number
}

// =============================================================================
// FUNCTION TYPES
// =============================================================================

/** Return type for search_policies function */
export type SearchPoliciesResult = PolicyRow[]

/** Return type for get_policy_history function */
export interface PolicyHistoryEntry {
  version_number: number
  change_type: VersionChangeType
  change_summary: string | null
  changed_at: string
  new_data: Record<string, unknown>
}

// =============================================================================
// DATABASE INTERFACE (Supabase client type)
// =============================================================================

/** Complete database schema interface for Supabase client */
export interface Database {
  public: {
    Tables: {
      policies: {
        Row: PolicyRow
        Insert: PolicyInsert
        Update: PolicyUpdate
        Relationships: [
          {
            foreignKeyName: 'policies_user_id_fkey'
            columns: ['user_id']
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      policy_documents: {
        Row: PolicyDocumentRow
        Insert: PolicyDocumentInsert
        Update: PolicyDocumentUpdate
        Relationships: [
          {
            foreignKeyName: 'policy_documents_policy_id_fkey'
            columns: ['policy_id']
            referencedRelation: 'policies'
            referencedColumns: ['id']
          },
        ]
      }
      policy_versions: {
        Row: PolicyVersionRow
        Insert: PolicyVersionInsert
        Update: PolicyVersionUpdate
        Relationships: [
          {
            foreignKeyName: 'policy_versions_policy_id_fkey'
            columns: ['policy_id']
            referencedRelation: 'policies'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'policy_versions_changed_by_fkey'
            columns: ['changed_by']
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      users: {
        Row: UserRow
        Insert: UserInsert
        Update: UserUpdate
        Relationships: [
          {
            foreignKeyName: 'users_id_fkey'
            columns: ['id']
            referencedRelation: 'auth.users'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      storage_stats: {
        Row: StorageStatsRow
      }
    }
    Functions: {
      search_policies: {
        Args: { search_query: string }
        Returns: PolicyRow[]
      }
      get_policy_history: {
        Args: { p_policy_id: string }
        Returns: PolicyHistoryEntry[]
      }
      get_policy_document_path: {
        Args: {
          p_user_id: string
          p_policy_id: string
          p_filename: string
        }
        Returns: string
      }
    }
    Enums: {
      policy_type: PolicyType
      policy_status: PolicyStatus
      version_change_type: VersionChangeType
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// =============================================================================
// HELPER TYPES
// =============================================================================

/** Policy with joined user info */
export type PolicyWithUser = PolicyRow & {
  user?: UserRow
}

/** Policy document with signed URL */
export type PolicyDocumentWithUrl = PolicyDocumentRow & {
  signedUrl: string | null
}

/** Search result with relevance score */
export interface PolicySearchResult extends PolicyRow {
  relevance?: number
}

/** Policy statistics summary */
export interface PolicyStats {
  total: number
  active: number
  expiring: number
  expired: number
  pending: number
  byType: Record<PolicyType, number>
  totalCoverage: number
  totalPremium: number
}

// =============================================================================
// TYPE ALIASES (for convenience)
// =============================================================================

/** Alias for PolicyInsert */
export type NewPolicy = PolicyInsert

/** Alias for PolicyRow */
export type Policy = PolicyRow

/** Alias for PolicyDocumentInsert */
export type NewPolicyDocument = PolicyDocumentInsert

/** Alias for PolicyDocumentRow */
export type PolicyDocument = PolicyDocumentRow

/** Alias for PolicyVersionRow */
export type PolicyVersion = PolicyVersionRow

/** Alias for UserRow */
export type User = UserRow

// =============================================================================
// TABLE TYPES - chat_conversations
// =============================================================================

/** AI provider type for chat */
export type ChatProvider = 'openai' | 'anthropic'

/** Chat message role */
export type ChatMessageRole = 'user' | 'assistant' | 'system'

/** Token usage for AI responses */
export interface TokenUsage {
  input_tokens?: number
  output_tokens?: number
  total_tokens?: number
  prompt_tokens?: number
  completion_tokens?: number
}

/** Row type for chat_conversations table (SELECT) */
export interface ChatConversationRow {
  id: string
  user_id: string
  title: string
  provider: ChatProvider
  policy_ids: string[]
  message_count: number
  last_message_at: string
  created_at: string
  updated_at: string
}

/** Insert type for chat_conversations table (INSERT) */
export interface ChatConversationInsert {
  id?: string
  user_id: string
  title?: string
  provider?: ChatProvider
  policy_ids?: string[]
  message_count?: number
  last_message_at?: string
  created_at?: string
  updated_at?: string
}

/** Update type for chat_conversations table (UPDATE) */
export interface ChatConversationUpdate {
  id?: string
  user_id?: string
  title?: string
  provider?: ChatProvider
  policy_ids?: string[]
  message_count?: number
  last_message_at?: string
  updated_at?: string
}

/** Row type for chat_messages table (SELECT) */
export interface ChatMessageRow {
  id: string
  conversation_id: string
  role: ChatMessageRole
  content: string
  provider: string | null
  token_usage: TokenUsage | null
  created_at: string
}

/** Insert type for chat_messages table (INSERT) */
export interface ChatMessageInsert {
  id?: string
  conversation_id: string
  role: ChatMessageRole
  content: string
  provider?: string | null
  token_usage?: TokenUsage | null
  created_at?: string
}

/** Alias for ChatConversationRow */
export type ChatConversation = ChatConversationRow

/** Alias for ChatMessageRow */
export type ChatMessage = ChatMessageRow

/** Check if a value is a valid ChatProvider */
export function isChatProvider(value: unknown): value is ChatProvider {
  return typeof value === 'string' && ['openai', 'anthropic'].includes(value)
}

/** Check if a value is a valid ChatMessageRole */
export function isChatMessageRole(value: unknown): value is ChatMessageRole {
  return typeof value === 'string' && ['user', 'assistant', 'system'].includes(value)
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/** Check if a value is a valid PolicyType */
export function isPolicyType(value: unknown): value is PolicyType {
  return (
    typeof value === 'string' &&
    ['kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business', 'nakliyat'].includes(value)
  )
}

/** Check if a value is a valid PolicyStatus */
export function isPolicyStatus(value: unknown): value is PolicyStatus {
  return typeof value === 'string' && ['active', 'expiring', 'expired', 'pending'].includes(value)
}

/** Check if a value is a valid VersionChangeType */
export function isVersionChangeType(value: unknown): value is VersionChangeType {
  return (
    typeof value === 'string' && ['created', 'updated', 'extracted', 'manual_edit'].includes(value)
  )
}
