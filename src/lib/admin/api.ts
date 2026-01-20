/**
 * Admin API Client
 * Handles all communication with the admin backend APIs
 */

import { env } from '../env'

function getApiUrl(): string {
  return env.proxyUrl || ''
}
import type {
  ApiResponse,
  LoginResponse,
  AdminUser,
  AIRequest,
  AIStats,
  CostBudget,
  CostAlert,
  CostSummary,
  UsageStats,
  PromptTemplate,
  PromptVersion,
  ABTest,
  SystemMetrics,
  HealthCheckResult,
  AlertRule,
  MonitoringAlert,
  EndpointStats,
  AnalyticsTrends,
  DashboardSummary,
  SecurityLog,
  AuditLog,
  RateLimitInfo,
  AppConfig,
  FeatureFlag,
} from './types'

const API_BASE = `${getApiUrl()}/api/admin`

// ============================================================================
// Token Management
// ============================================================================

let accessToken: string | null = null
let refreshToken: string | null = null

export function setTokens(access: string, refresh: string): void {
  accessToken = access
  refreshToken = refresh
  localStorage.setItem('admin_token', access)
  localStorage.setItem('admin_refresh_token', refresh)
}

export function getAccessToken(): string | null {
  if (!accessToken) {
    accessToken = localStorage.getItem('admin_token')
  }
  return accessToken
}

export function clearTokens(): void {
  accessToken = null
  refreshToken = null
  localStorage.removeItem('admin_token')
  localStorage.removeItem('admin_refresh_token')
}

// ============================================================================
// Base Request Helper
// ============================================================================

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const token = getAccessToken()

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  try {
    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    })

    const data = await response.json()

    if (!response.ok) {
      // Handle token expiration
      if (response.status === 401 && refreshToken) {
        const refreshed = await refreshAccessToken()
        if (refreshed) {
          // Retry the request with new token
          return request<T>(endpoint, options)
        }
      }
      return { success: false, error: data.error || 'Request failed', code: data.code }
    }

    return data
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Network error',
    }
  }
}

async function refreshAccessToken(): Promise<boolean> {
  const storedRefresh = refreshToken || localStorage.getItem('admin_refresh_token')
  if (!storedRefresh) return false

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: storedRefresh }),
    })

    if (!response.ok) {
      clearTokens()
      return false
    }

    const data = await response.json()
    if (data.success && data.data) {
      setTokens(data.data.token, data.data.refreshToken)
      return true
    }
    return false
  } catch {
    clearTokens()
    return false
  }
}

// ============================================================================
// Authentication API
// ============================================================================

export async function login(email: string, password: string): Promise<ApiResponse<LoginResponse>> {
  const result = await request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  })

  if (result.success && result.data) {
    setTokens(result.data.token, result.data.refreshToken)
  }

  return result
}

export async function logout(): Promise<ApiResponse<void>> {
  const result = await request<void>('/auth/logout', { method: 'POST' })
  clearTokens()
  return result
}

export async function getCurrentUser(): Promise<ApiResponse<AdminUser>> {
  return request<AdminUser>('/auth/me')
}

// ============================================================================
// Admin User Management API
// ============================================================================

export async function getAdminUsers(): Promise<ApiResponse<AdminUser[]>> {
  return request<AdminUser[]>('/users')
}

export async function createAdminUser(user: {
  email: string
  password: string
  role?: string
  displayName?: string
  permissions?: string[]
}): Promise<ApiResponse<AdminUser>> {
  return request<AdminUser>('/users', {
    method: 'POST',
    body: JSON.stringify(user),
  })
}

export async function updateAdminUser(
  id: string,
  updates: Partial<AdminUser & { password?: string }>
): Promise<ApiResponse<AdminUser>> {
  return request<AdminUser>(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

export async function deleteAdminUser(id: string): Promise<ApiResponse<void>> {
  return request<void>(`/users/${id}`, { method: 'DELETE' })
}

// ============================================================================
// AI Operations API
// ============================================================================

export async function getAIRequests(params?: {
  provider?: string
  operation?: string
  status?: string
  userId?: string
  startDate?: string
  endDate?: string
  limit?: number
}): Promise<ApiResponse<AIRequest[]>> {
  const query = new URLSearchParams()
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) query.append(key, String(value))
    })
  }
  return request<AIRequest[]>(`/ai/requests?${query}`)
}

export async function getAIRequest(id: string): Promise<ApiResponse<AIRequest>> {
  return request<AIRequest>(`/ai/requests/${id}`)
}

export async function getAIStats(params?: {
  startDate?: string
  endDate?: string
}): Promise<ApiResponse<AIStats>> {
  const query = new URLSearchParams()
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) query.append(key, value)
    })
  }
  return request<AIStats>(`/ai/stats?${query}`)
}

// ============================================================================
// Cost Management API
// ============================================================================

export async function getBudgets(): Promise<ApiResponse<CostBudget[]>> {
  return request<CostBudget[]>('/budgets')
}

export async function getBudget(id: string): Promise<ApiResponse<CostBudget>> {
  return request<CostBudget>(`/budgets/${id}`)
}

export async function createBudget(budget: {
  name: string
  budgetType: string
  limitAmount: number
  alertThresholdPercent?: number
  actionOnExceed?: string
  appliesTo?: string
}): Promise<ApiResponse<CostBudget>> {
  return request<CostBudget>('/budgets', {
    method: 'POST',
    body: JSON.stringify(budget),
  })
}

export async function updateBudget(
  id: string,
  updates: Partial<CostBudget>
): Promise<ApiResponse<CostBudget>> {
  return request<CostBudget>(`/budgets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

export async function deleteBudget(id: string): Promise<ApiResponse<void>> {
  return request<void>(`/budgets/${id}`, { method: 'DELETE' })
}

export async function resetBudget(id: string): Promise<ApiResponse<void>> {
  return request<void>(`/budgets/${id}/reset`, { method: 'POST' })
}

export async function getCostAlerts(limit?: number): Promise<ApiResponse<CostAlert[]>> {
  const query = limit ? `?limit=${limit}` : ''
  return request<CostAlert[]>(`/cost/alerts${query}`)
}

export async function acknowledgeCostAlert(id: string): Promise<ApiResponse<void>> {
  return request<void>(`/cost/alerts/${id}/acknowledge`, { method: 'POST' })
}

export async function getCostSummary(): Promise<ApiResponse<CostSummary>> {
  return request<CostSummary>('/cost/summary')
}

export async function getUsageStats(params?: {
  startDate?: string
  endDate?: string
}): Promise<ApiResponse<UsageStats>> {
  const query = new URLSearchParams()
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) query.append(key, value)
    })
  }
  return request<UsageStats>(`/cost/usage?${query}`)
}

// ============================================================================
// Prompt Management API
// ============================================================================

export async function getPromptTemplates(category?: string): Promise<ApiResponse<PromptTemplate[]>> {
  const query = category ? `?category=${category}` : ''
  return request<PromptTemplate[]>(`/prompts${query}`)
}

export async function getPromptTemplate(id: string): Promise<ApiResponse<PromptTemplate & { versions: PromptVersion[] }>> {
  return request<PromptTemplate & { versions: PromptVersion[] }>(`/prompts/${id}`)
}

export async function createPromptTemplate(template: {
  name: string
  description?: string
  category: string
  systemPrompt: string
  userPromptTemplate: string
  isDefault?: boolean
}): Promise<ApiResponse<PromptTemplate>> {
  return request<PromptTemplate>('/prompts', {
    method: 'POST',
    body: JSON.stringify(template),
  })
}

export async function updatePromptTemplate(
  id: string,
  updates: Partial<PromptTemplate> & { changeDescription?: string }
): Promise<ApiResponse<PromptTemplate>> {
  return request<PromptTemplate>(`/prompts/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

export async function deletePromptTemplate(id: string): Promise<ApiResponse<void>> {
  return request<void>(`/prompts/${id}`, { method: 'DELETE' })
}

export async function getPromptVersions(templateId: string): Promise<ApiResponse<PromptVersion[]>> {
  return request<PromptVersion[]>(`/prompts/templates/${templateId}/versions`)
}

export async function rollbackPromptVersion(templateId: string, versionId: string): Promise<ApiResponse<PromptTemplate>> {
  return request<PromptTemplate>(`/prompts/templates/${templateId}/rollback/${versionId}`, {
    method: 'POST',
  })
}

export async function previewPrompt(params: {
  templateId?: string
  versionId?: string
  variables?: Record<string, string>
}): Promise<ApiResponse<{
  systemPrompt: string
  userPrompt: string
  variables: string[]
  missingVariables: string[]
}>> {
  return request(`/prompts/preview`, {
    method: 'POST',
    body: JSON.stringify(params),
  })
}

// ============================================================================
// A/B Testing API
// ============================================================================

export async function getABTests(status?: string): Promise<ApiResponse<ABTest[]>> {
  const query = status ? `?status=${status}` : ''
  return request<ABTest[]>(`/prompts/ab-tests${query}`)
}

export async function getABTest(id: string): Promise<ApiResponse<ABTest>> {
  return request<ABTest>(`/prompts/ab-tests/${id}`)
}

export async function createABTest(test: {
  name: string
  description?: string
  templateId: string
  controlVersionId: string
  treatmentVersionIds: string[]
  trafficAllocation: Record<string, number>
  primaryMetric?: string
  minSampleSize?: number
}): Promise<ApiResponse<ABTest>> {
  return request<ABTest>('/prompts/ab-tests', {
    method: 'POST',
    body: JSON.stringify(test),
  })
}

export async function updateABTestStatus(
  id: string,
  status: 'draft' | 'running' | 'paused' | 'completed' | 'cancelled'
): Promise<ApiResponse<ABTest>> {
  return request<ABTest>(`/prompts/ab-tests/${id}/status`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  })
}

export async function getABTestResults(id: string): Promise<ApiResponse<ABTest['results']>> {
  return request(`/prompts/ab-tests/${id}/results`)
}

export async function applyABTestWinner(id: string): Promise<ApiResponse<PromptTemplate>> {
  return request<PromptTemplate>(`/prompts/ab-tests/${id}/apply-winner`, {
    method: 'POST',
  })
}

// ============================================================================
// Monitoring API
// ============================================================================

export async function getSystemMetrics(): Promise<ApiResponse<SystemMetrics>> {
  return request<SystemMetrics>('/monitoring/metrics')
}

export async function getHealthCheck(): Promise<ApiResponse<HealthCheckResult>> {
  return request<HealthCheckResult>('/monitoring/health')
}

export async function getDashboardSummary(): Promise<ApiResponse<DashboardSummary>> {
  return request<DashboardSummary>('/monitoring/dashboard')
}

export async function getEndpointStats(): Promise<ApiResponse<EndpointStats[]>> {
  return request<EndpointStats[]>('/monitoring/endpoints')
}

export async function getTrends(params?: {
  period?: number
  interval?: number
}): Promise<ApiResponse<AnalyticsTrends>> {
  const query = new URLSearchParams()
  if (params?.period) query.append('period', String(params.period))
  if (params?.interval) query.append('interval', String(params.interval))
  return request<AnalyticsTrends>(`/monitoring/trends?${query}`)
}

export async function getRecentActivity(limit?: number): Promise<ApiResponse<DashboardSummary['recentActivity']>> {
  const query = limit ? `?limit=${limit}` : ''
  return request(`/monitoring/activity${query}`)
}

// ============================================================================
// Alert Rules API
// ============================================================================

export async function getAlertRules(): Promise<ApiResponse<AlertRule[]>> {
  return request<AlertRule[]>('/monitoring/alert-rules')
}

export async function getAlertRule(id: string): Promise<ApiResponse<AlertRule>> {
  return request<AlertRule>(`/monitoring/alert-rules/${id}`)
}

export async function createAlertRule(rule: {
  name: string
  description?: string
  metric: string
  condition: string
  threshold: number
  severity?: string
  enabled?: boolean
  cooldownMinutes?: number
  notificationChannels?: string[]
}): Promise<ApiResponse<AlertRule>> {
  return request<AlertRule>('/monitoring/alert-rules', {
    method: 'POST',
    body: JSON.stringify(rule),
  })
}

export async function updateAlertRule(
  id: string,
  updates: Partial<AlertRule>
): Promise<ApiResponse<AlertRule>> {
  return request<AlertRule>(`/monitoring/alert-rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

export async function deleteAlertRule(id: string): Promise<ApiResponse<void>> {
  return request<void>(`/monitoring/alert-rules/${id}`, { method: 'DELETE' })
}

// ============================================================================
// Alerts API
// ============================================================================

export async function getActiveAlerts(): Promise<ApiResponse<MonitoringAlert[]>> {
  return request<MonitoringAlert[]>('/monitoring/alerts')
}

export async function getAlertHistory(limit?: number): Promise<ApiResponse<MonitoringAlert[]>> {
  const query = limit ? `?limit=${limit}` : ''
  return request<MonitoringAlert[]>(`/monitoring/alerts/history${query}`)
}

export async function acknowledgeAlert(id: string): Promise<ApiResponse<MonitoringAlert>> {
  return request<MonitoringAlert>(`/monitoring/alerts/${id}/acknowledge`, {
    method: 'POST',
  })
}

export async function resolveAlert(id: string): Promise<ApiResponse<MonitoringAlert>> {
  return request<MonitoringAlert>(`/monitoring/alerts/${id}/resolve`, {
    method: 'POST',
  })
}

// ============================================================================
// Security API
// ============================================================================

export async function getSecurityLogs(params?: {
  eventType?: string
  severity?: string
  resolved?: boolean
  startDate?: string
  endDate?: string
  limit?: number
}): Promise<ApiResponse<SecurityLog[]>> {
  const query = new URLSearchParams()
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) query.append(key, String(value))
    })
  }
  return request<SecurityLog[]>(`/security/logs?${query}`)
}

export async function resolveSecurityLog(id: string): Promise<ApiResponse<SecurityLog>> {
  return request<SecurityLog>(`/security/logs/${id}/resolve`, { method: 'POST' })
}

export async function getRateLimits(): Promise<ApiResponse<RateLimitInfo>> {
  return request<RateLimitInfo>('/security/rate-limits')
}

export async function blockIP(ip: string, reason: string, expiresIn?: number): Promise<ApiResponse<void>> {
  return request<void>('/security/block-ip', {
    method: 'POST',
    body: JSON.stringify({ ip, reason, expiresIn }),
  })
}

export async function unblockIP(ip: string): Promise<ApiResponse<void>> {
  return request<void>(`/security/block-ip/${ip}`, { method: 'DELETE' })
}

// ============================================================================
// Audit API
// ============================================================================

export async function getAuditLogs(params?: {
  actorId?: string
  action?: string
  resourceType?: string
  resourceId?: string
  startDate?: string
  endDate?: string
  limit?: number
}): Promise<ApiResponse<AuditLog[]>> {
  const query = new URLSearchParams()
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined) query.append(key, String(value))
    })
  }
  return request<AuditLog[]>(`/audit/logs?${query}`)
}

// ============================================================================
// Configuration API
// ============================================================================

export async function getConfigs(category?: string): Promise<ApiResponse<AppConfig[]>> {
  const query = category ? `?category=${category}` : ''
  return request<AppConfig[]>(`/config${query}`)
}

export async function updateConfig(id: string, value: unknown): Promise<ApiResponse<AppConfig>> {
  return request<AppConfig>(`/config/${id}`, {
    method: 'PUT',
    body: JSON.stringify({ value }),
  })
}

export async function getFeatureFlags(): Promise<ApiResponse<FeatureFlag[]>> {
  return request<FeatureFlag[]>('/feature-flags')
}

export async function updateFeatureFlag(
  id: string,
  updates: Partial<FeatureFlag>
): Promise<ApiResponse<FeatureFlag>> {
  return request<FeatureFlag>(`/feature-flags/${id}`, {
    method: 'PUT',
    body: JSON.stringify(updates),
  })
}

// ============================================================================
// Export API
// ============================================================================

export async function exportData(): Promise<ApiResponse<{
  aiRequests: AIRequest[]
  policyOperations: unknown[]
  securityLogs: SecurityLog[]
  auditLogs: AuditLog[]
  exportedAt: string
  exportedBy?: string
}>> {
  return request('/export')
}
