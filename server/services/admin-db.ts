/**
 * Admin Database Service
 * Handles all database operations for admin functionality
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import logger from '../lib/logger.js'

const log = logger.child('AdminDB')

// ============================================================================
// TYPES
// ============================================================================

export interface AppConfig {
  id: string
  category: string
  key: string
  value: unknown
  valueType: string
  description?: string
  isSecret: boolean
  isEditable: boolean
  modifiedBy?: string
  modifiedAt: string
  createdAt: string
}

export interface FeatureFlag {
  id: string
  name: string
  description?: string
  enabled: boolean
  enabledPercentage?: number
  enabledForRoles: string[]
  enabledForUsers: string[]
  metadata: Record<string, unknown>
  createdAt: string
  createdBy?: string
  updatedAt: string
  updatedBy?: string
}

export interface AuditLog {
  id: string
  timestamp: string
  actorId?: string
  actorEmail?: string
  actorRole?: string
  action: string
  resourceType: string
  resourceId?: string
  previousState?: unknown
  newState?: unknown
  changes?: Array<{ field: string; oldValue: unknown; newValue: unknown }>
  ipAddress?: string
  userAgent?: string
  sessionId?: string
  reason?: string
}

export interface SecurityEvent {
  id: string
  timestamp: string
  eventType: string
  severity: string
  userId?: string
  ipAddress?: string
  userAgent?: string
  details: Record<string, unknown>
  resolved: boolean
  resolvedAt?: string
  resolvedBy?: string
  resolutionNotes?: string
}

export interface BlockedIP {
  ip: string
  reason: string
  blockedAt: string
  expiresAt?: string
  isPermanent: boolean
  blockCount: number
  createdBy?: string
  lastAttemptAt?: string
}

export interface PromptTemplate {
  id: string
  name: string
  description?: string
  category: string
  version: number
  isActive: boolean
  systemPrompt: string
  userPromptTemplate: string
  variables: Array<{ name: string; description: string; type: string; required: boolean }>
  defaultProvider?: string
  defaultModel?: string
  parameters: Record<string, unknown>
  usageCount: number
  lastUsedAt?: string
  createdAt: string
  createdBy?: string
  updatedAt: string
  updatedBy?: string
}

export interface AIRequestLog {
  id: string
  timestamp: string
  userId?: string
  sessionId?: string
  provider: string
  model: string
  operation: string
  endpoint?: string
  policyId?: string
  documentId?: string
  promptTemplateId?: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  inputCost: number
  outputCost: number
  totalCost: number
  responseTimeMs?: number
  status: string
  errorMessage?: string
  errorCode?: string
  clientIp?: string
  userAgent?: string
}

export interface CostBudget {
  id: string
  name: string
  budgetType: string
  limitAmount: number
  currentUsage: number
  alertThresholdPercent: number
  actionOnExceed?: string
  appliesTo?: string
  resetAt?: string
  isActive: boolean
  createdAt: string
  createdBy?: string
  updatedAt: string
}

// ============================================================================
// DATABASE CLIENT
// ============================================================================

let supabase: SupabaseClient | null = null
let initError: string | null = null

/**
 * Get Supabase client with explicit error handling
 */
export function getClientWithError(): { client: SupabaseClient | null; error: string | null } {
  if (initError) {
    return { client: null, error: initError }
  }

  if (supabase) {
    return { client: supabase, error: null }
  }

  // IMPORTANT: Use SUPABASE_URL first (server-side), VITE_SUPABASE_URL as fallback (dev only)
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url) {
    initError = 'SUPABASE_URL is not configured'
    log.error(initError)
    return { client: null, error: initError }
  }

  if (!serviceKey) {
    initError = 'SUPABASE_SERVICE_ROLE_KEY is not configured'
    log.error(initError)
    return { client: null, error: initError }
  }

  try {
    supabase = createClient(url, serviceKey)
    return { client: supabase, error: null }
  } catch (err) {
    initError = `Failed to create Supabase client: ${err instanceof Error ? err.message : String(err)}`
    log.error('Failed to create Supabase client', { error: err instanceof Error ? err.message : String(err) })
    return { client: null, error: initError }
  }
}

function getClient(): SupabaseClient | null {
  const { client } = getClientWithError()
  return client
}

// ============================================================================
// ADMIN USER MANAGEMENT
// ============================================================================

export interface AdminUserRecord {
  id: string
  email: string
  role: string
  status: string
  displayName?: string
  permissions: string[]
  lastLoginAt?: string
  lastLoginIp?: string
  loginCount: number
  createdAt: string
  updatedAt: string
}

export async function getAdminUsers(): Promise<AdminUserRecord[]> {
  const db = getClient()
  if (!db) return []

  const { data, error } = await db
    .from('admin_users')
    .select('id, email, role, status, display_name, permissions, last_login_at, last_login_ip, login_count, created_at, updated_at')
    .order('email')

  if (error) {
    log.error('Failed to fetch admin users', { error })
    return []
  }

  return data.map((row) => ({
    id: row.id,
    email: row.email,
    role: row.role,
    status: row.status,
    displayName: row.display_name,
    permissions: row.permissions || [],
    lastLoginAt: row.last_login_at,
    lastLoginIp: row.last_login_ip,
    loginCount: row.login_count || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }))
}

export async function createAdminUser(user: {
  email: string
  passwordHash: string
  role: string
  displayName?: string
  permissions?: string[]
}): Promise<AdminUserRecord | null> {
  const db = getClient()
  if (!db) return null

  const { data, error } = await db
    .from('admin_users')
    .insert({
      email: user.email.toLowerCase(),
      password_hash: user.passwordHash,
      role: user.role,
      status: 'active',
      display_name: user.displayName,
      permissions: user.permissions || [],
    })
    .select('id, email, role, status, display_name, permissions, created_at, updated_at')
    .single()

  if (error) {
    log.error('Failed to create admin user', { error })
    return null
  }

  return {
    id: data.id,
    email: data.email,
    role: data.role,
    status: data.status,
    displayName: data.display_name,
    permissions: data.permissions || [],
    loginCount: 0,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

export async function updateAdminUser(
  id: string,
  updates: Record<string, unknown>
): Promise<AdminUserRecord | null> {
  const db = getClient()
  if (!db) return null

  const { data, error } = await db
    .from('admin_users')
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('id, email, role, status, display_name, permissions, last_login_at, last_login_ip, login_count, created_at, updated_at')
    .single()

  if (error) {
    log.error('Failed to update admin user', { error })
    return null
  }

  return {
    id: data.id,
    email: data.email,
    role: data.role,
    status: data.status,
    displayName: data.display_name,
    permissions: data.permissions || [],
    lastLoginAt: data.last_login_at,
    lastLoginIp: data.last_login_ip,
    loginCount: data.login_count || 0,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  }
}

export async function deleteAdminUser(id: string): Promise<boolean> {
  const db = getClient()
  if (!db) return false

  const { error } = await db
    .from('admin_users')
    .delete()
    .eq('id', id)

  if (error) {
    log.error('Failed to delete admin user', { error })
    return false
  }

  return true
}

// Alias for createSecurityEvent to match route usage
export const logSecurityEvent = async (event: {
  eventType: string
  severity: string
  userId?: string
  ipAddress?: string
  userAgent?: string
  details: Record<string, unknown>
}): Promise<string | null> => {
  return createSecurityEvent(event)
}

// ============================================================================
// APP CONFIGURATION
// ============================================================================

export async function getConfigs(category?: string): Promise<AppConfig[]> {
  const db = getClient()
  if (!db) return []

  let query = db.from('app_configs').select('*')
  if (category) {
    query = query.eq('category', category)
  }

  const { data, error } = await query.order('category').order('key')
  if (error) {
    log.error('Failed to fetch configs', { error })
    return []
  }

  return data.map(mapConfig)
}

export async function getConfig(category: string, key: string): Promise<AppConfig | null> {
  const db = getClient()
  if (!db) return null

  const { data, error } = await db
    .from('app_configs')
    .select('*')
    .eq('category', category)
    .eq('key', key)
    .single()

  if (error) return null
  return mapConfig(data)
}

export async function setConfig(
  category: string,
  key: string,
  value: unknown,
  modifiedBy: string,
  reason?: string
): Promise<boolean> {
  const db = getClient()
  if (!db) return false

  // Get current value for history
  const current = await getConfig(category, key)
  if (!current || !current.isEditable) return false

  // Update config
  const { error: updateError } = await db
    .from('app_configs')
    .update({
      value: JSON.stringify(value),
      modified_by: modifiedBy,
      modified_at: new Date().toISOString(),
    })
    .eq('category', category)
    .eq('key', key)

  if (updateError) {
    log.error('Failed to update config', { error: updateError })
    return false
  }

  // Log change history
  await db.from('config_history').insert({
    config_id: current.id,
    previous_value: current.value,
    new_value: value,
    changed_by: modifiedBy,
    reason,
  })

  return true
}

function mapConfig(row: Record<string, unknown>): AppConfig {
  return {
    id: row.id as string,
    category: row.category as string,
    key: row.key as string,
    value: JSON.parse(row.value as string),
    valueType: row.value_type as string,
    description: row.description as string | undefined,
    isSecret: row.is_secret as boolean,
    isEditable: row.is_editable as boolean,
    modifiedBy: row.modified_by as string | undefined,
    modifiedAt: row.modified_at as string,
    createdAt: row.created_at as string,
  }
}

// ============================================================================
// FEATURE FLAGS
// ============================================================================

export async function getFeatureFlags(): Promise<FeatureFlag[]> {
  const db = getClient()
  if (!db) return []

  const { data, error } = await db
    .from('feature_flags')
    .select('*')
    .order('name')

  if (error) {
    log.error('Failed to fetch feature flags', { error })
    return []
  }

  return data.map(mapFeatureFlag)
}

export async function getFeatureFlag(id: string): Promise<FeatureFlag | null> {
  const db = getClient()
  if (!db) return null

  const { data, error } = await db
    .from('feature_flags')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return mapFeatureFlag(data)
}

export async function updateFeatureFlag(
  id: string,
  updates: Partial<FeatureFlag>,
  updatedBy: string
): Promise<boolean> {
  const db = getClient()
  if (!db) return false

  const { error } = await db
    .from('feature_flags')
    .update({
      ...updates,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    log.error('Failed to update feature flag', { error })
    return false
  }

  return true
}

export async function createFeatureFlag(
  flag: Omit<FeatureFlag, 'createdAt' | 'updatedAt'>,
  createdBy: string
): Promise<string | null> {
  const db = getClient()
  if (!db) return null

  const { data, error } = await db
    .from('feature_flags')
    .insert({
      id: flag.id,
      name: flag.name,
      description: flag.description,
      enabled: flag.enabled,
      enabled_percentage: flag.enabledPercentage,
      enabled_for_roles: flag.enabledForRoles,
      enabled_for_users: flag.enabledForUsers,
      metadata: flag.metadata,
      created_by: createdBy,
    })
    .select('id')
    .single()

  if (error) {
    log.error('Failed to create feature flag', { error })
    return null
  }

  return data.id
}

function mapFeatureFlag(row: Record<string, unknown>): FeatureFlag {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    enabled: row.enabled as boolean,
    enabledPercentage: row.enabled_percentage as number | undefined,
    enabledForRoles: (row.enabled_for_roles as string[]) || [],
    enabledForUsers: (row.enabled_for_users as string[]) || [],
    metadata: (row.metadata as Record<string, unknown>) || {},
    createdAt: row.created_at as string,
    createdBy: row.created_by as string | undefined,
    updatedAt: row.updated_at as string,
    updatedBy: row.updated_by as string | undefined,
  }
}

// ============================================================================
// AUDIT LOGS
// ============================================================================

export async function getAuditLogs(filters?: {
  actorId?: string
  resourceType?: string
  action?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}): Promise<AuditLog[]> {
  const db = getClient()
  if (!db) return []

  let query = db.from('audit_logs').select('*')

  if (filters?.actorId) {
    query = query.eq('actor_id', filters.actorId)
  }
  if (filters?.resourceType) {
    query = query.eq('resource_type', filters.resourceType)
  }
  if (filters?.action) {
    query = query.eq('action', filters.action)
  }
  if (filters?.startDate) {
    query = query.gte('timestamp', filters.startDate)
  }
  if (filters?.endDate) {
    query = query.lte('timestamp', filters.endDate)
  }

  query = query.order('timestamp', { ascending: false })

  if (filters?.limit) {
    query = query.limit(filters.limit)
  }
  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1)
  }

  const { data, error } = await query

  if (error) {
    log.error('Failed to fetch audit logs', { error })
    return []
  }

  return data.map(mapAuditLog)
}

export async function createAuditLog(entry: Omit<AuditLog, 'id' | 'timestamp'>): Promise<string | null> {
  const db = getClient()
  if (!db) return null

  const { data, error } = await db
    .from('audit_logs')
    .insert({
      actor_id: entry.actorId,
      actor_email: entry.actorEmail,
      actor_role: entry.actorRole,
      action: entry.action,
      resource_type: entry.resourceType,
      resource_id: entry.resourceId,
      previous_state: entry.previousState,
      new_state: entry.newState,
      changes: entry.changes,
      ip_address: entry.ipAddress,
      user_agent: entry.userAgent,
      session_id: entry.sessionId,
      reason: entry.reason,
    })
    .select('id')
    .single()

  if (error) {
    log.error('Failed to create audit log', { error })
    return null
  }

  return data.id
}

function mapAuditLog(row: Record<string, unknown>): AuditLog {
  return {
    id: row.id as string,
    timestamp: row.timestamp as string,
    actorId: row.actor_id as string | undefined,
    actorEmail: row.actor_email as string | undefined,
    actorRole: row.actor_role as string | undefined,
    action: row.action as string,
    resourceType: row.resource_type as string,
    resourceId: row.resource_id as string | undefined,
    previousState: row.previous_state,
    newState: row.new_state,
    changes: row.changes as Array<{ field: string; oldValue: unknown; newValue: unknown }> | undefined,
    ipAddress: row.ip_address as string | undefined,
    userAgent: row.user_agent as string | undefined,
    sessionId: row.session_id as string | undefined,
    reason: row.reason as string | undefined,
  }
}

// ============================================================================
// SECURITY EVENTS
// ============================================================================

export async function getSecurityEvents(filters?: {
  eventType?: string
  severity?: string
  resolved?: boolean
  startDate?: string
  endDate?: string
  limit?: number
}): Promise<SecurityEvent[]> {
  const db = getClient()
  if (!db) return []

  let query = db.from('security_events').select('*')

  if (filters?.eventType) {
    query = query.eq('event_type', filters.eventType)
  }
  if (filters?.severity) {
    query = query.eq('severity', filters.severity)
  }
  if (filters?.resolved !== undefined) {
    query = query.eq('resolved', filters.resolved)
  }
  if (filters?.startDate) {
    query = query.gte('timestamp', filters.startDate)
  }
  if (filters?.endDate) {
    query = query.lte('timestamp', filters.endDate)
  }

  query = query.order('timestamp', { ascending: false })

  if (filters?.limit) {
    query = query.limit(filters.limit)
  }

  const { data, error } = await query

  if (error) {
    log.error('Failed to fetch security events', { error })
    return []
  }

  return data.map(mapSecurityEvent)
}

export async function createSecurityEvent(
  event: Omit<SecurityEvent, 'id' | 'timestamp' | 'resolved' | 'resolvedAt' | 'resolvedBy' | 'resolutionNotes'>
): Promise<string | null> {
  const db = getClient()
  if (!db) return null

  const { data, error } = await db
    .from('security_events')
    .insert({
      event_type: event.eventType,
      severity: event.severity,
      user_id: event.userId,
      ip_address: event.ipAddress,
      user_agent: event.userAgent,
      details: event.details,
    })
    .select('id')
    .single()

  if (error) {
    log.error('Failed to create security event', { error })
    return null
  }

  return data.id
}

export async function resolveSecurityEvent(
  id: string,
  resolvedBy: string,
  resolutionNotes?: string
): Promise<boolean> {
  const db = getClient()
  if (!db) return false

  const { error } = await db
    .from('security_events')
    .update({
      resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
      resolution_notes: resolutionNotes,
    })
    .eq('id', id)

  if (error) {
    log.error('Failed to resolve security event', { error })
    return false
  }

  return true
}

function mapSecurityEvent(row: Record<string, unknown>): SecurityEvent {
  return {
    id: row.id as string,
    timestamp: row.timestamp as string,
    eventType: row.event_type as string,
    severity: row.severity as string,
    userId: row.user_id as string | undefined,
    ipAddress: row.ip_address as string | undefined,
    userAgent: row.user_agent as string | undefined,
    details: (row.details as Record<string, unknown>) || {},
    resolved: row.resolved as boolean,
    resolvedAt: row.resolved_at as string | undefined,
    resolvedBy: row.resolved_by as string | undefined,
    resolutionNotes: row.resolution_notes as string | undefined,
  }
}

// ============================================================================
// BLOCKED IPS
// ============================================================================

export async function getBlockedIPs(): Promise<BlockedIP[]> {
  const db = getClient()
  if (!db) return []

  const { data, error } = await db
    .from('blocked_ips')
    .select('*')
    .order('blocked_at', { ascending: false })

  if (error) {
    log.error('Failed to fetch blocked IPs', { error })
    return []
  }

  return data.map(mapBlockedIP)
}

export async function blockIP(
  ip: string,
  reason: string,
  createdBy: string,
  expiresIn?: number
): Promise<boolean> {
  const db = getClient()
  if (!db) return false

  const expiresAt = expiresIn ? new Date(Date.now() + expiresIn).toISOString() : null

  const { error } = await db
    .from('blocked_ips')
    .upsert({
      ip,
      reason,
      blocked_at: new Date().toISOString(),
      expires_at: expiresAt,
      is_permanent: !expiresIn,
      created_by: createdBy,
    })

  if (error) {
    log.error('Failed to block IP', { error })
    return false
  }

  return true
}

export async function unblockIP(ip: string): Promise<boolean> {
  const db = getClient()
  if (!db) return false

  const { error } = await db
    .from('blocked_ips')
    .delete()
    .eq('ip', ip)

  if (error) {
    log.error('Failed to unblock IP', { error })
    return false
  }

  return true
}

export async function isIPBlocked(ip: string): Promise<boolean> {
  const db = getClient()
  if (!db) return false

  const { data, error } = await db
    .from('blocked_ips')
    .select('ip, expires_at')
    .eq('ip', ip)
    .single()

  if (error || !data) return false

  // Check if block has expired
  if (data.expires_at && new Date(data.expires_at) < new Date()) {
    // Remove expired block
    await unblockIP(ip)
    return false
  }

  return true
}

function mapBlockedIP(row: Record<string, unknown>): BlockedIP {
  return {
    ip: row.ip as string,
    reason: row.reason as string,
    blockedAt: row.blocked_at as string,
    expiresAt: row.expires_at as string | undefined,
    isPermanent: row.is_permanent as boolean,
    blockCount: row.block_count as number,
    createdBy: row.created_by as string | undefined,
    lastAttemptAt: row.last_attempt_at as string | undefined,
  }
}

// ============================================================================
// PROMPT TEMPLATES
// ============================================================================

export async function getPromptTemplates(category?: string): Promise<PromptTemplate[]> {
  const db = getClient()
  if (!db) return []

  let query = db.from('prompt_templates').select('*')

  if (category) {
    query = query.eq('category', category)
  }

  const { data, error } = await query.order('name')

  if (error) {
    log.error('Failed to fetch prompt templates', { error })
    return []
  }

  return data.map(mapPromptTemplate)
}

export async function getPromptTemplate(id: string): Promise<PromptTemplate | null> {
  const db = getClient()
  if (!db) return null

  const { data, error } = await db
    .from('prompt_templates')
    .select('*')
    .eq('id', id)
    .single()

  if (error) return null
  return mapPromptTemplate(data)
}

export async function getActivePromptTemplate(category: string): Promise<PromptTemplate | null> {
  const db = getClient()
  if (!db) return null

  const { data, error } = await db
    .from('prompt_templates')
    .select('*')
    .eq('category', category)
    .eq('is_active', true)
    .single()

  if (error) return null
  return mapPromptTemplate(data)
}

export async function updatePromptTemplate(
  id: string,
  updates: Partial<PromptTemplate>,
  updatedBy: string
): Promise<boolean> {
  const db = getClient()
  if (!db) return false

  // Get current template for version history
  const current = await getPromptTemplate(id)
  if (!current) return false

  // Save current version to history
  await db.from('prompt_versions').insert({
    template_id: id,
    version: current.version,
    system_prompt: current.systemPrompt,
    user_prompt_template: current.userPromptTemplate,
    variables: current.variables,
    parameters: current.parameters,
    created_by: updatedBy,
  })

  // Update template
  const { error } = await db
    .from('prompt_templates')
    .update({
      ...updates,
      version: current.version + 1,
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) {
    log.error('Failed to update prompt template', { error })
    return false
  }

  return true
}

export async function createPromptTemplate(
  template: Omit<PromptTemplate, 'id' | 'version' | 'usageCount' | 'createdAt' | 'updatedAt'>,
  createdBy: string
): Promise<string | null> {
  const db = getClient()
  if (!db) return null

  const { data, error } = await db
    .from('prompt_templates')
    .insert({
      name: template.name,
      description: template.description,
      category: template.category,
      version: 1,
      is_active: template.isActive,
      system_prompt: template.systemPrompt,
      user_prompt_template: template.userPromptTemplate,
      variables: template.variables,
      default_provider: template.defaultProvider,
      default_model: template.defaultModel,
      parameters: template.parameters,
      created_by: createdBy,
    })
    .select('id')
    .single()

  if (error) {
    log.error('Failed to create prompt template', { error })
    return null
  }

  return data.id
}

export async function deletePromptTemplate(id: string): Promise<boolean> {
  const db = getClient()
  if (!db) return false

  const { error } = await db
    .from('prompt_templates')
    .delete()
    .eq('id', id)

  if (error) {
    log.error('Failed to delete prompt template', { error })
    return false
  }

  return true
}

export async function recordPromptUsage(id: string): Promise<void> {
  const db = getClient()
  if (!db) return

  await db.rpc('increment_prompt_usage', { template_id: id })
}

function mapPromptTemplate(row: Record<string, unknown>): PromptTemplate {
  return {
    id: row.id as string,
    name: row.name as string,
    description: row.description as string | undefined,
    category: row.category as string,
    version: row.version as number,
    isActive: row.is_active as boolean,
    systemPrompt: row.system_prompt as string,
    userPromptTemplate: row.user_prompt_template as string,
    variables: (row.variables as Array<{ name: string; description: string; type: string; required: boolean }>) || [],
    defaultProvider: row.default_provider as string | undefined,
    defaultModel: row.default_model as string | undefined,
    parameters: (row.parameters as Record<string, unknown>) || {},
    usageCount: row.usage_count as number,
    lastUsedAt: row.last_used_at as string | undefined,
    createdAt: row.created_at as string,
    createdBy: row.created_by as string | undefined,
    updatedAt: row.updated_at as string,
    updatedBy: row.updated_by as string | undefined,
  }
}

// ============================================================================
// AI REQUEST LOGS
// ============================================================================

export async function getAIRequestLogs(filters?: {
  userId?: string
  provider?: string
  operation?: string
  status?: string
  startDate?: string
  endDate?: string
  limit?: number
  offset?: number
}): Promise<AIRequestLog[]> {
  const db = getClient()
  if (!db) return []

  let query = db.from('ai_request_logs').select('*')

  if (filters?.userId) {
    query = query.eq('user_id', filters.userId)
  }
  if (filters?.provider) {
    query = query.eq('provider', filters.provider)
  }
  if (filters?.operation) {
    query = query.eq('operation', filters.operation)
  }
  if (filters?.status) {
    query = query.eq('status', filters.status)
  }
  if (filters?.startDate) {
    query = query.gte('timestamp', filters.startDate)
  }
  if (filters?.endDate) {
    query = query.lte('timestamp', filters.endDate)
  }

  query = query.order('timestamp', { ascending: false })

  if (filters?.limit) {
    query = query.limit(filters.limit)
  }
  if (filters?.offset) {
    query = query.range(filters.offset, filters.offset + (filters.limit || 50) - 1)
  }

  const { data, error } = await query

  if (error) {
    log.error('Failed to fetch AI request logs', { error })
    return []
  }

  return data.map(mapAIRequestLog)
}

export async function createAIRequestLog(
  entry: Omit<AIRequestLog, 'id' | 'timestamp'>
): Promise<string | null> {
  const db = getClient()
  if (!db) return null

  const { data, error } = await db
    .from('ai_request_logs')
    .insert({
      user_id: entry.userId,
      session_id: entry.sessionId,
      provider: entry.provider,
      model: entry.model,
      operation: entry.operation,
      endpoint: entry.endpoint,
      policy_id: entry.policyId,
      document_id: entry.documentId,
      prompt_template_id: entry.promptTemplateId,
      input_tokens: entry.inputTokens,
      output_tokens: entry.outputTokens,
      total_tokens: entry.totalTokens,
      input_cost: entry.inputCost,
      output_cost: entry.outputCost,
      total_cost: entry.totalCost,
      response_time_ms: entry.responseTimeMs,
      status: entry.status,
      error_message: entry.errorMessage,
      error_code: entry.errorCode,
      client_ip: entry.clientIp,
      user_agent: entry.userAgent,
    })
    .select('id')
    .single()

  if (error) {
    log.error('Failed to create AI request log', { error })
    return null
  }

  return data.id
}

export async function getAIUsageStats(startDate: string, endDate: string): Promise<{
  totalRequests: number
  totalTokens: number
  totalCost: number
  errorRate: number
  averageResponseTime: number
  byProvider: Record<string, { requests: number; tokens: number; cost: number }>
  byOperation: Record<string, { requests: number; successRate: number; cost: number }>
}> {
  const db = getClient()
  if (!db) {
    return {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      errorRate: 0,
      averageResponseTime: 0,
      byProvider: {},
      byOperation: {},
    }
  }

  const { data, error } = await db
    .from('ai_request_logs')
    .select('*')
    .gte('timestamp', startDate)
    .lte('timestamp', endDate)

  if (error || !data) {
    return {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      errorRate: 0,
      averageResponseTime: 0,
      byProvider: {},
      byOperation: {},
    }
  }

  const totalRequests = data.length
  const totalTokens = data.reduce((sum, r) => sum + (r.total_tokens || 0), 0)
  const totalCost = data.reduce((sum, r) => sum + parseFloat(r.total_cost || 0), 0)
  const errors = data.filter((r) => r.status === 'error').length
  const totalResponseTime = data.reduce((sum, r) => sum + (r.response_time_ms || 0), 0)

  const byProvider: Record<string, { requests: number; tokens: number; cost: number }> = {}
  const byOperation: Record<string, { requests: number; successRate: number; cost: number; successes: number }> = {}

  for (const req of data) {
    // By provider
    if (!byProvider[req.provider]) {
      byProvider[req.provider] = { requests: 0, tokens: 0, cost: 0 }
    }
    byProvider[req.provider].requests++
    byProvider[req.provider].tokens += req.total_tokens || 0
    byProvider[req.provider].cost += parseFloat(req.total_cost || 0)

    // By operation
    if (!byOperation[req.operation]) {
      byOperation[req.operation] = { requests: 0, successRate: 0, cost: 0, successes: 0 }
    }
    byOperation[req.operation].requests++
    byOperation[req.operation].cost += parseFloat(req.total_cost || 0)
    if (req.status === 'success') {
      byOperation[req.operation].successes++
    }
  }

  // Calculate success rates
  for (const op of Object.keys(byOperation)) {
    byOperation[op].successRate = byOperation[op].requests > 0
      ? byOperation[op].successes / byOperation[op].requests
      : 0
  }

  return {
    totalRequests,
    totalTokens,
    totalCost,
    errorRate: totalRequests > 0 ? errors / totalRequests : 0,
    averageResponseTime: totalRequests > 0 ? totalResponseTime / totalRequests : 0,
    byProvider,
    byOperation,
  }
}

function mapAIRequestLog(row: Record<string, unknown>): AIRequestLog {
  return {
    id: row.id as string,
    timestamp: row.timestamp as string,
    userId: row.user_id as string | undefined,
    sessionId: row.session_id as string | undefined,
    provider: row.provider as string,
    model: row.model as string,
    operation: row.operation as string,
    endpoint: row.endpoint as string | undefined,
    policyId: row.policy_id as string | undefined,
    documentId: row.document_id as string | undefined,
    promptTemplateId: row.prompt_template_id as string | undefined,
    inputTokens: row.input_tokens as number,
    outputTokens: row.output_tokens as number,
    totalTokens: row.total_tokens as number,
    inputCost: parseFloat(row.input_cost as string || '0'),
    outputCost: parseFloat(row.output_cost as string || '0'),
    totalCost: parseFloat(row.total_cost as string || '0'),
    responseTimeMs: row.response_time_ms as number | undefined,
    status: row.status as string,
    errorMessage: row.error_message as string | undefined,
    errorCode: row.error_code as string | undefined,
    clientIp: row.client_ip as string | undefined,
    userAgent: row.user_agent as string | undefined,
  }
}

// ============================================================================
// COST BUDGETS
// ============================================================================

export async function getCostBudgets(): Promise<CostBudget[]> {
  const db = getClient()
  if (!db) return []

  const { data, error } = await db
    .from('cost_budgets')
    .select('*')
    .order('name')

  if (error) {
    log.error('Failed to fetch cost budgets', { error })
    return []
  }

  return data.map(mapCostBudget)
}

export async function updateCostBudget(
  id: string,
  updates: Partial<CostBudget>
): Promise<boolean> {
  const db = getClient()
  if (!db) return false

  const { error } = await db
    .from('cost_budgets')
    .update(updates)
    .eq('id', id)

  if (error) {
    log.error('Failed to update cost budget', { error })
    return false
  }

  return true
}

function mapCostBudget(row: Record<string, unknown>): CostBudget {
  return {
    id: row.id as string,
    name: row.name as string,
    budgetType: row.budget_type as string,
    limitAmount: parseFloat(row.limit_amount as string),
    currentUsage: parseFloat(row.current_usage as string),
    alertThresholdPercent: row.alert_threshold_percent as number,
    actionOnExceed: row.action_on_exceed as string | undefined,
    appliesTo: row.applies_to as string | undefined,
    resetAt: row.reset_at as string | undefined,
    isActive: row.is_active as boolean,
    createdAt: row.created_at as string,
    createdBy: row.created_by as string | undefined,
    updatedAt: row.updated_at as string,
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  // Admin Users
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
  logSecurityEvent,
  // Config
  getConfigs,
  getConfig,
  setConfig,
  // Feature Flags
  getFeatureFlags,
  getFeatureFlag,
  updateFeatureFlag,
  createFeatureFlag,
  // Audit Logs
  getAuditLogs,
  createAuditLog,
  // Security Events
  getSecurityEvents,
  createSecurityEvent,
  resolveSecurityEvent,
  // Blocked IPs
  getBlockedIPs,
  blockIP,
  unblockIP,
  isIPBlocked,
  // Prompt Templates
  getPromptTemplates,
  getPromptTemplate,
  getActivePromptTemplate,
  updatePromptTemplate,
  createPromptTemplate,
  deletePromptTemplate,
  recordPromptUsage,
  // AI Request Logs
  getAIRequestLogs,
  createAIRequestLog,
  getAIUsageStats,
  // Cost Budgets
  getCostBudgets,
  updateCostBudget,
}
