/**
 * Admin Dashboard Types
 */

// ============================================================================
// Authentication Types
// ============================================================================

export interface AdminUser {
  id: string
  email: string
  role: 'admin' | 'super_admin'
  displayName?: string
  permissions?: string[]
}

export interface AdminSession {
  id: string
  userId: string
  ipAddress: string
  userAgent: string
  createdAt: string
  expiresAt: string
  lastActivity: string
}

export interface LoginResponse {
  token: string
  refreshToken: string
  expiresIn: string
  user: AdminUser
}

// ============================================================================
// AI Operations Types
// ============================================================================

export interface AIRequest {
  id: string
  timestamp: string
  provider: string
  operation: string
  model: string
  endpoint: string
  userId?: string
  prompt: string
  systemPrompt?: string
  response?: string
  responseTime: number
  status: string
  error?: string
  tokens: { input: number; output: number; total: number }
  cost: { input: number; output: number; total: number }
  clientIp?: string
}

export interface AIStats {
  totalRequests: number
  totalTokens: number
  totalCost: number
  errorRate: number
  averageResponseTime: number
  byProvider: Record<string, {
    requests: number
    tokens: { input: number; output: number; total: number }
    cost: number
    averageResponseTime: number
    errorCount: number
    errorRate: number
  }>
  byOperation: Record<string, {
    requests: number
    successRate: number
    averageResponseTime: number
    averageTokens: number
    totalCost: number
  }>
}

// ============================================================================
// Cost Management Types
// ============================================================================

export interface CostBudget {
  id: string
  name: string
  budgetType: 'daily' | 'weekly' | 'monthly' | 'total'
  limitAmount: number
  currentUsage: number
  alertThresholdPercent: number
  actionOnExceed: 'warn' | 'block' | 'notify'
  appliesTo: string
  isActive: boolean
  periodStart: string
  periodEnd: string
  createdAt: string
  updatedAt: string
}

export interface CostAlert {
  id: string
  budgetId: string
  budgetName: string
  alertType: 'threshold' | 'exceeded' | 'approaching'
  message: string
  percentUsed: number
  currentUsage: number
  limit: number
  timestamp: string
  acknowledged: boolean
  acknowledgedBy?: string
  acknowledgedAt?: string
}

export interface CostSummary {
  today: { cost: number; requests: number }
  thisMonth: { cost: number; requests: number }
  budgets: Array<{
    id: string
    name: string
    type: string
    limit: number
    used: number
    percentUsed: number
    status: 'healthy' | 'warning' | 'critical'
    action: string
  }>
  alerts: {
    total: number
    unacknowledged: number
    recent: CostAlert[]
  }
  byProvider: Record<string, { cost: number; requests: number }>
}

export interface UsageStats {
  totalRequests: number
  totalTokens: number
  totalCost: number
  byProvider: Record<string, { requests: number; tokens: number; cost: number }>
  byModel: Record<string, { requests: number; tokens: number; cost: number }>
  byDay: Array<{ date: string; requests: number; tokens: number; cost: number }>
}

// ============================================================================
// Prompt Management Types
// ============================================================================

export interface PromptTemplate {
  id: string
  name: string
  description: string
  category: 'extraction' | 'chat' | 'ocr' | 'analysis' | 'other'
  systemPrompt: string
  userPromptTemplate: string
  variables: string[]
  isActive: boolean
  isDefault: boolean
  version: number
  usageCount: number
  successCount: number
  errorCount: number
  avgResponseTime: number
  createdBy?: string
  createdAt: string
  updatedAt: string
}

export interface PromptVersion {
  id: string
  templateId: string
  version: number
  systemPrompt: string
  userPromptTemplate: string
  variables: string[]
  changeDescription: string
  createdBy?: string
  createdAt: string
  usageCount: number
  successCount: number
  errorCount: number
  avgResponseTime: number
}

export interface ABTest {
  id: string
  name: string
  description: string
  templateId: string
  status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled'
  controlVersionId: string
  treatmentVersionIds: string[]
  trafficAllocation: Record<string, number>
  primaryMetric: string
  minSampleSize: number
  startedAt?: string
  completedAt?: string
  results?: {
    winner?: string
    confidence: number
    sampleSize: number
    metrics: Record<string, {
      successRate: number
      avgResponseTime: number
      errorRate: number
      sampleSize: number
    }>
  }
  createdBy?: string
  createdAt: string
  updatedAt: string
}

// ============================================================================
// Monitoring Types
// ============================================================================

export interface SystemMetrics {
  timestamp: string
  cpu: {
    usage: number
    loadAverage: number[]
  }
  memory: {
    used: number
    total: number
    percentage: number
  }
  requests: {
    total: number
    perMinute: number
    perHour: number
  }
  errors: {
    total: number
    perMinute: number
    rate: number
  }
  latency: {
    p50: number
    p95: number
    p99: number
    avg: number
  }
  uptime: number
}

export interface ComponentHealth {
  name: string
  status: 'healthy' | 'degraded' | 'unhealthy' | 'unknown'
  lastCheck: string
  responseTime?: number
  message?: string
  details?: Record<string, unknown>
}

export interface HealthCheckResult {
  overall: 'healthy' | 'degraded' | 'unhealthy'
  timestamp: string
  components: ComponentHealth[]
  uptime: number
}

export interface AlertRule {
  id: string
  name: string
  description: string
  metric: string
  condition: 'gt' | 'lt' | 'eq' | 'gte' | 'lte'
  threshold: number
  severity: 'info' | 'warning' | 'critical'
  enabled: boolean
  cooldownMinutes: number
  notificationChannels: string[]
  createdAt: string
  updatedAt: string
  lastTriggered?: string
}

export interface MonitoringAlert {
  id: string
  ruleId: string
  ruleName: string
  metric: string
  value: number
  threshold: number
  severity: 'info' | 'warning' | 'critical'
  message: string
  timestamp: string
  acknowledged: boolean
  acknowledgedBy?: string
  acknowledgedAt?: string
  resolved: boolean
  resolvedAt?: string
}

export interface EndpointStats {
  endpoint: string
  method: string
  totalRequests: number
  successCount: number
  errorCount: number
  avgResponseTime: number
  p95ResponseTime: number
  errorRate: number
}

export interface TrendData {
  timestamp: string
  value: number
}

export interface AnalyticsTrends {
  period: string
  requests: TrendData[]
  errors: TrendData[]
  latency: TrendData[]
  aiUsage: TrendData[]
}

export interface DashboardSummary {
  metrics: SystemMetrics
  health: HealthCheckResult
  activeAlerts: MonitoringAlert[]
  recentActivity: RequestMetric[]
  topEndpoints: EndpointStats[]
  trends: AnalyticsTrends
}

export interface RequestMetric {
  endpoint: string
  method: string
  statusCode: number
  responseTime: number
  timestamp: string
  userId?: string
  provider?: string
  error?: string
}

// ============================================================================
// Security & Audit Types
// ============================================================================

export interface SecurityLog {
  id: string
  timestamp: string
  eventType: string
  severity: string
  userId?: string
  ipAddress: string
  details: Record<string, unknown>
  resolved: boolean
}

export interface AuditLog {
  id: string
  timestamp: string
  actorId: string
  actorEmail: string
  action: string
  resourceType: string
  resourceId?: string
  changes?: Array<{ field: string; oldValue: unknown; newValue: unknown }>
  ipAddress: string
}

export interface RateLimitInfo {
  endpoints: Array<{
    endpoint: string
    windowMs: number
    maxRequests: number
    currentUsage: number
    blockedRequests: number
  }>
  blockedIPs: Array<{
    ip: string
    reason: string
    blockedAt: string
    expiresAt?: string
    requestCount: number
    isManual: boolean
  }>
  recentViolations: Array<{
    ip: string
    endpoint: string
    timestamp: string
  }>
}

// ============================================================================
// Configuration Types
// ============================================================================

export interface AppConfig {
  id: string
  category: string
  key: string
  value: unknown
  type: string
  description: string
}

export interface FeatureFlag {
  id: string
  name: string
  description: string
  enabled: boolean
  enabledPercentage?: number
  createdAt: string
  updatedAt: string
}

// ============================================================================
// API Response Types
// ============================================================================

export interface ApiResponse<T> {
  success: boolean
  data?: T
  error?: string
  code?: string
  total?: number
}
