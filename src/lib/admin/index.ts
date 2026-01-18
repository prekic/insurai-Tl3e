/**
 * Admin Module Index
 * Re-exports all admin utilities for convenient importing
 */

// Operations Logger
export {
  startAIRequest,
  completeAIRequest,
  logAIRequest,
  getAIRequests,
  startPolicyOperation,
  updatePolicyOperation,
  completePolicyOperation,
  getPolicyOperations,
  logUserActivity,
  getUserActivities,
  logSecurityEvent,
  resolveSecurityEvent,
  getSecurityLogs,
  logAuditEvent,
  getAuditLogs,
  getAIUsageStatistics,
  getPolicyStatistics,
  clearAllLogs,
  exportLogs,
} from './operations-logger'

export type {
  LogAIRequestParams,
  AIRequestResult,
  LogPolicyOperationParams,
} from './operations-logger'

// System Metrics
export {
  getSystemHealth,
  getServerMetrics,
  setServerStartTime,
  getRateLimitStatus,
  recordRateLimitViolation,
  blockIP,
  unblockIP,
  isIPBlocked,
  createAlert,
  acknowledgeAlert,
  resolveAlert,
  getAlerts,
  getAlertRules,
  updateAlertRule,
  startHealthMonitoring,
  stopHealthMonitoring,
} from './system-metrics'

// Config Manager
export {
  getConfig,
  getConfigObject,
  getAllConfigs,
  setConfig,
  isFeatureEnabled,
  getFeatureFlags,
  getFeatureFlag,
  updateFeatureFlag,
  createFeatureFlag,
  getProviderConfig,
  getAllProviderConfigs,
  updateProviderConfig,
  setProviderApiKeyStatus,
  createPromptTemplate,
  updatePromptTemplate,
  getPromptTemplate,
  getPromptTemplates,
  getActivePromptTemplate,
  recordPromptUsage,
  deletePromptTemplate,
  calculateRequestCost,
} from './config-manager'
