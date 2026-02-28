/**
 * Admin Dashboard Types
 * Comprehensive type definitions for admin monitoring and control
 */

// ============================================================================
// SYSTEM HEALTH & METRICS
// ============================================================================

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy'
  uptime: number // seconds
  version: string
  environment: 'development' | 'staging' | 'production'
  lastChecked: string
  components: ComponentHealth[]
}

export interface ComponentHealth {
  name: string
  status: 'healthy' | 'degraded' | 'unhealthy'
  responseTime?: number // ms
  lastChecked: string
  details?: string
}

export interface ServerMetrics {
  cpu: {
    usage: number // percentage
    cores: number
  }
  memory: {
    used: number // bytes
    total: number
    percentage: number
  }
  disk: {
    used: number
    total: number
    percentage: number
  }
  network: {
    requestsPerMinute: number
    bytesIn: number
    bytesOut: number
  }
  process: {
    pid: number
    uptime: number
    heapUsed: number
    heapTotal: number
  }
}

// ============================================================================
// AI OPERATIONS
// ============================================================================

export type AIProvider = 'openai' | 'anthropic' | 'google'
export type AIOperation = 'extraction' | 'chat' | 'ocr' | 'embedding' | 'moderation'

export interface AIRequest {
  id: string
  timestamp: string
  provider: AIProvider
  operation: AIOperation
  model: string
  endpoint: string
  userId?: string
  sessionId?: string

  // Request details
  prompt: string
  systemPrompt?: string
  conversationHistory?: Array<{ role: string; content: string }>
  parameters: AIRequestParameters

  // Response details
  response?: string
  responseTime: number // ms
  status: 'pending' | 'success' | 'error' | 'timeout' | 'rate_limited'
  error?: string

  // Token usage
  tokens: {
    input: number
    output: number
    total: number
  }

  // Cost tracking
  cost: {
    input: number // USD
    output: number
    total: number
  }

  // Metadata
  policyId?: string
  documentId?: string
  clientIp?: string
  userAgent?: string
}

export interface AIRequestParameters {
  temperature?: number
  maxTokens?: number
  topP?: number
  frequencyPenalty?: number
  presencePenalty?: number
  stopSequences?: string[]
  responseFormat?: string
  [key: string]: unknown
}

export interface AIProviderConfig {
  provider: AIProvider
  enabled: boolean
  apiKeyConfigured: boolean
  apiKeyLastDigits?: string
  models: AIModelConfig[]
  rateLimits: {
    requestsPerMinute: number
    tokensPerMinute: number
    requestsPerDay: number
  }
  defaultModel: string
  fallbackProvider?: AIProvider
}

export interface AIModelConfig {
  id: string
  name: string
  enabled: boolean
  maxContextTokens: number
  costPerInputToken: number // USD
  costPerOutputToken: number
  capabilities: string[]
  recommended: boolean
}

export interface AIUsageStats {
  period: 'hour' | 'day' | 'week' | 'month'
  startDate: string
  endDate: string
  byProvider: Record<AIProvider, ProviderUsageStats>
  byOperation: Record<AIOperation, OperationUsageStats>
  totalRequests: number
  totalTokens: number
  totalCost: number
  averageResponseTime: number
  errorRate: number
}

export interface ProviderUsageStats {
  requests: number
  tokens: { input: number; output: number; total: number }
  cost: number
  averageResponseTime: number
  errorCount: number
  errorRate: number
}

export interface OperationUsageStats {
  requests: number
  successRate: number
  averageResponseTime: number
  averageTokens: number
  totalCost: number
}

// ============================================================================
// PROMPT MANAGEMENT
// ============================================================================

export interface PromptTemplate {
  id: string
  name: string
  description: string
  category: 'extraction' | 'chat' | 'ocr' | 'analysis' | 'other'
  version: number
  isActive: boolean

  // Template content
  systemPrompt: string
  userPromptTemplate: string
  variables: PromptVariable[]

  // Configuration
  defaultProvider: AIProvider
  defaultModel: string
  parameters: AIRequestParameters

  // Metadata
  createdAt: string
  updatedAt: string
  createdBy: string
  lastUsed?: string
  usageCount: number

  // A/B testing
  variants?: PromptVariant[]
  activeVariant?: string
}

export interface PromptVariable {
  name: string
  description: string
  type: 'string' | 'number' | 'boolean' | 'json'
  required: boolean
  defaultValue?: unknown
  validation?: string // regex pattern
}

export interface PromptVariant {
  id: string
  name: string
  systemPrompt: string
  userPromptTemplate: string
  weight: number // percentage of traffic
  metrics: {
    usageCount: number
    successRate: number
    averageQuality?: number
    averageResponseTime: number
  }
}

// ============================================================================
// USER MANAGEMENT
// ============================================================================

export interface AdminUser {
  id: string
  email: string
  fullName?: string
  role: UserRole
  status: 'active' | 'inactive' | 'suspended'
  createdAt: string
  lastLoginAt?: string
  lastActivityAt?: string

  // Usage stats
  policiesUploaded: number
  chatMessages: number
  aiRequestsCount: number

  // Session info
  activeSessions: number
  currentSession?: UserSession

  // Preferences
  preferredLanguage: 'tr' | 'en'
  emailNotifications: boolean
}

export type UserRole = 'user' | 'premium' | 'admin' | 'super_admin'

export interface UserSession {
  id: string
  userId: string
  startedAt: string
  lastActivityAt: string
  ipAddress: string
  userAgent: string
  device: string
  location?: string
  isActive: boolean
}

export interface UserActivity {
  id: string
  userId: string
  timestamp: string
  action: UserAction
  details: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
  sessionId?: string
}

export type UserAction =
  | 'login'
  | 'logout'
  | 'signup'
  | 'password_reset'
  | 'policy_upload'
  | 'policy_view'
  | 'policy_delete'
  | 'policy_export'
  | 'chat_message'
  | 'ai_extraction'
  | 'settings_change'
  | 'profile_update'

// ============================================================================
// POLICY OPERATIONS
// ============================================================================

export interface PolicyOperation {
  id: string
  timestamp: string
  type: PolicyOperationType
  policyId?: string
  userId: string

  // Operation details
  status: 'pending' | 'processing' | 'success' | 'failed'
  duration?: number // ms

  // For uploads
  documentInfo?: {
    filename: string
    size: number
    mimeType: string
    pageCount: number
  }

  // For extraction
  extractionInfo?: {
    provider: AIProvider
    model: string
    confidence: number
    fieldsExtracted: number
    ocrUsed: boolean
    textLength: number
  }

  // Pipeline info
  pipelineStages?: PipelineStageResult[]

  // Errors
  error?: string
  errorCode?: string

  // Metadata
  clientIp?: string
  userAgent?: string
}

export type PolicyOperationType =
  | 'upload'
  | 'extraction'
  | 'ocr'
  | 'validation'
  | 'duplicate_check'
  | 'gap_analysis'
  | 'evaluation'
  | 'export'
  | 'delete'
  | 'share'

export interface PipelineStageResult {
  stage: string
  status: 'success' | 'failed' | 'skipped'
  duration: number
  details?: Record<string, unknown>
  error?: string
}

export interface PolicyStats {
  total: number
  byType: Record<string, number>
  byProvider: Record<string, number>
  byStatus: Record<string, number>
  uploadedToday: number
  uploadedThisWeek: number
  uploadedThisMonth: number
  averageExtractionTime: number
  extractionSuccessRate: number
  ocrUsageRate: number
}

// ============================================================================
// DOCUMENT PROCESSING PIPELINE
// ============================================================================

export interface PipelineExecution {
  id: string
  timestamp: string
  documentId: string
  userId: string

  // Pipeline type
  pipelineType: 'combined' | 'quick' | 'clean_room'

  // Stages
  stages: {
    cleanRoom?: CleanRoomStageResult
    aiProcessing?: AIProcessingStageResult
    validation?: ValidationStageResult
  }

  // Overall results
  totalDuration: number
  status: 'success' | 'partial' | 'failed'

  // PII handling
  piiDetected: PIIDetectionResult[]
  piiVaultId?: string
}

export interface CleanRoomStageResult {
  duration: number
  status: 'success' | 'failed'

  // Normalization stats
  normalizations: {
    spacingFixes: number
    characterReplacements: number
    lineNormalizations: number
  }

  // PII detection
  piiTokensGenerated: number

  // Outputs
  outputs: {
    cleanCopy: boolean
    redactedCopy: boolean
    piiVault: boolean
  }
}

export interface AIProcessingStageResult {
  duration: number
  status: 'success' | 'failed'
  provider: AIProvider
  model: string

  // OCR correction
  ocrCorrections: number
  confidenceScore: number

  // Token usage
  tokens: { input: number; output: number }
  cost: number
}

export interface ValidationStageResult {
  duration: number
  status: 'success' | 'failed'

  // Validation results
  fieldsValidated: number
  validationErrors: number
  warnings: number
}

export interface PIIDetectionResult {
  type: PIIType
  count: number
  redacted: boolean
  tokenFormat: string
}

export type PIIType =
  | 'tc_kimlik'
  | 'iban'
  | 'phone'
  | 'email'
  | 'plate_number'
  | 'address'
  | 'name'
  | 'date_of_birth'

// ============================================================================
// RATE LIMITING & SECURITY
// ============================================================================

export interface RateLimitConfig {
  endpoint: string
  windowMs: number
  maxRequests: number
  currentUsage: number
  blockedRequests: number
}

export interface RateLimitStatus {
  endpoints: RateLimitConfig[]
  blockedIPs: BlockedIP[]
  recentViolations: RateLimitViolation[]
}

export interface BlockedIP {
  ip: string
  reason: string
  blockedAt: string
  expiresAt?: string
  requestCount: number
  isManual: boolean
}

export interface RateLimitViolation {
  id: string
  timestamp: string
  ip: string
  endpoint: string
  userId?: string
  requestCount: number
  limit: number
  action: 'warned' | 'blocked' | 'rate_limited'
}

export interface SecurityAuditLog {
  id: string
  timestamp: string
  eventType: SecurityEventType
  severity: 'low' | 'medium' | 'high' | 'critical'
  userId?: string
  ipAddress: string
  userAgent?: string
  details: Record<string, unknown>
  resolved: boolean
  resolvedAt?: string
  resolvedBy?: string
}

export type SecurityEventType =
  | 'login_failure'
  | 'brute_force_attempt'
  | 'suspicious_activity'
  | 'rate_limit_exceeded'
  | 'invalid_token'
  | 'unauthorized_access'
  | 'data_access_violation'
  | 'admin_action'
  | 'config_change'
  | 'api_key_rotation'

// ============================================================================
// CONFIGURATION MANAGEMENT
// ============================================================================

export interface AppConfig {
  id: string
  category: ConfigCategory
  key: string
  value: unknown
  type: 'string' | 'number' | 'boolean' | 'json'
  description: string
  isSecret: boolean
  isEditable: boolean
  lastModified: string
  modifiedBy?: string
  history: ConfigChange[]
}

export type ConfigCategory =
  | 'ai'
  | 'rate_limits'
  | 'features'
  | 'security'
  | 'notifications'
  | 'integrations'
  | 'ui'
  | 'system'

export interface ConfigChange {
  timestamp: string
  previousValue: unknown
  newValue: unknown
  changedBy: string
  reason?: string
}

export interface FeatureFlag {
  id: string
  name: string
  description: string
  enabled: boolean
  enabledForUsers?: string[] // specific user IDs
  enabledForRoles?: UserRole[]
  enabledPercentage?: number // for gradual rollout
  createdAt: string
  updatedAt: string
  updatedBy?: string
}

// ============================================================================
// ANALYTICS & REPORTING
// ============================================================================

export interface AnalyticsDashboard {
  period: 'day' | 'week' | 'month' | 'quarter' | 'year'
  startDate: string
  endDate: string

  // Key metrics
  keyMetrics: {
    totalUsers: number
    activeUsers: number
    newUsers: number
    totalPolicies: number
    policiesUploaded: number
    aiRequests: number
    totalCost: number
  }

  // Trends
  trends: {
    userGrowth: TrendData[]
    policyUploads: TrendData[]
    aiUsage: TrendData[]
    costs: TrendData[]
    errors: TrendData[]
  }

  // Top items
  topUsers: Array<{ userId: string; email: string; activity: number }>
  topPolicyTypes: Array<{ type: string; count: number; percentage: number }>
  topProviders: Array<{ provider: string; count: number; avgRating: number }>
}

export interface TrendData {
  date: string
  value: number
  change?: number // percentage change from previous period
}

export interface CostReport {
  period: 'day' | 'week' | 'month'
  startDate: string
  endDate: string

  // Totals
  totalCost: number
  budgetLimit?: number
  budgetUsagePercent?: number

  // Breakdown
  byProvider: Record<AIProvider, number>
  byOperation: Record<AIOperation, number>
  byModel: Record<string, number>
  byUser: Array<{ userId: string; email: string; cost: number }>

  // Daily breakdown
  dailyCosts: Array<{ date: string; cost: number }>

  // Projections
  projectedMonthlyCost: number
  costTrend: 'increasing' | 'stable' | 'decreasing'
}

// ============================================================================
// AUDIT TRAIL
// ============================================================================

export interface AuditLog {
  id: string
  timestamp: string
  actorId: string
  actorEmail: string
  actorRole: UserRole

  action: AuditAction
  resourceType: AuditResourceType
  resourceId?: string

  // Change details
  previousState?: unknown
  newState?: unknown
  changes?: Array<{
    field: string
    oldValue: unknown
    newValue: unknown
  }>

  // Context
  ipAddress: string
  userAgent?: string
  sessionId?: string

  // Additional metadata
  reason?: string
  approved?: boolean
  approvedBy?: string
}

export type AuditAction =
  | 'create'
  | 'read'
  | 'update'
  | 'delete'
  | 'enable'
  | 'disable'
  | 'approve'
  | 'reject'
  | 'export'
  | 'import'
  | 'login'
  | 'logout'

export type AuditResourceType =
  | 'user'
  | 'policy'
  | 'config'
  | 'feature_flag'
  | 'prompt_template'
  | 'rate_limit'
  | 'api_key'
  | 'role'
  | 'system'

// ============================================================================
// NOTIFICATIONS & ALERTS
// ============================================================================

export interface AdminAlert {
  id: string
  timestamp: string
  type: AlertType
  severity: 'info' | 'warning' | 'error' | 'critical'
  title: string
  message: string

  // Status
  acknowledged: boolean
  acknowledgedAt?: string
  acknowledgedBy?: string
  resolved: boolean
  resolvedAt?: string
  resolvedBy?: string

  // Related data
  resourceType?: string
  resourceId?: string
  metadata?: Record<string, unknown>

  // Actions
  actions?: AlertAction[]
}

export type AlertType =
  | 'system_health'
  | 'high_error_rate'
  | 'cost_threshold'
  | 'rate_limit_exceeded'
  | 'security_incident'
  | 'api_key_expiring'
  | 'storage_limit'
  | 'performance_degradation'
  | 'new_user_signup'
  | 'unusual_activity'

export interface AlertAction {
  label: string
  type: 'link' | 'action' | 'dismiss'
  target?: string // URL or action ID
}

export interface AlertRule {
  id: string
  name: string
  description: string
  enabled: boolean

  // Trigger conditions
  metric: string
  operator: 'gt' | 'lt' | 'eq' | 'gte' | 'lte'
  threshold: number
  window: number // seconds

  // Actions
  severity: 'info' | 'warning' | 'error' | 'critical'
  notifyEmails?: string[]
  notifySlack?: boolean
  autoResolve?: boolean

  // Cooldown
  cooldownMinutes: number
  lastTriggered?: string
}

// ============================================================================
// ADMIN DASHBOARD STATE
// ============================================================================

export interface AdminDashboardState {
  // Current view
  activeSection: AdminSection

  // Data
  systemHealth?: SystemHealth
  serverMetrics?: ServerMetrics
  aiUsageStats?: AIUsageStats
  policyStats?: PolicyStats
  rateLimitStatus?: RateLimitStatus
  analytics?: AnalyticsDashboard

  // Lists
  users: AdminUser[]
  aiRequests: AIRequest[]
  policyOperations: PolicyOperation[]
  auditLogs: AuditLog[]
  alerts: AdminAlert[]

  // Config
  providerConfigs: AIProviderConfig[]
  promptTemplates: PromptTemplate[]
  featureFlags: FeatureFlag[]
  configs: AppConfig[]

  // Filters
  filters: AdminFilters

  // UI state
  isLoading: boolean
  error?: string
  lastRefresh?: string
}

export type AdminSection =
  | 'overview'
  | 'ai_operations'
  | 'prompts'
  | 'users'
  | 'policies'
  | 'pipeline'
  | 'processing_logs'
  | 'ocr_dashboard'
  | 'security'
  | 'config'
  | 'translations'
  | 'benchmarks'
  | 'analytics'
  | 'audit'
  | 'alerts'
  | 'notifications'
  | 'extraction_health'
  | 'actuarial'

export interface AdminFilters {
  dateRange: {
    start: string
    end: string
  }
  provider?: AIProvider
  operation?: AIOperation
  userId?: string
  status?: string
  severity?: string
  search?: string
}
