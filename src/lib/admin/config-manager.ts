/**
 * Configuration Manager
 * Manages app configuration, feature flags, and AI provider settings
 */

import type {
  AppConfig,
  ConfigCategory,
  ConfigChange,
  FeatureFlag,
  UserRole,
  AIProviderConfig,
  PromptTemplate,
  AIProvider,
} from '@/types/admin'
import { logAuditEvent } from './operations-logger'

// ============================================================================
// APP CONFIGURATION
// ============================================================================

const configs: Map<string, AppConfig> = new Map()

// Initialize default configurations
function initializeDefaultConfigs(): void {
  const defaults: Omit<AppConfig, 'id' | 'lastModified' | 'history'>[] = [
    // AI Configuration
    {
      category: 'ai',
      key: 'default_provider',
      value: 'openai',
      type: 'string',
      description: 'Default AI provider for extraction',
      isSecret: false,
      isEditable: true,
    },
    {
      category: 'ai',
      key: 'chat_model',
      value: 'gpt-4o-mini',
      type: 'string',
      description: 'Model used for policy chat',
      isSecret: false,
      isEditable: true,
    },
    {
      category: 'ai',
      key: 'extraction_model',
      value: 'gpt-4o',
      type: 'string',
      description: 'Model used for policy extraction',
      isSecret: false,
      isEditable: true,
    },
    {
      category: 'ai',
      key: 'max_tokens_chat',
      value: 2048,
      type: 'number',
      description: 'Maximum tokens for chat responses',
      isSecret: false,
      isEditable: true,
    },
    {
      category: 'ai',
      key: 'max_tokens_extraction',
      value: 4096,
      type: 'number',
      description: 'Maximum tokens for extraction',
      isSecret: false,
      isEditable: true,
    },
    {
      category: 'ai',
      key: 'temperature',
      value: 0.3,
      type: 'number',
      description: 'AI temperature (0-1, lower = more deterministic)',
      isSecret: false,
      isEditable: true,
    },

    // Rate Limits
    {
      category: 'rate_limits',
      key: 'chat_requests_per_hour',
      value: 60,
      type: 'number',
      description: 'Max chat requests per hour per user',
      isSecret: false,
      isEditable: true,
    },
    {
      category: 'rate_limits',
      key: 'extraction_requests_per_hour',
      value: 20,
      type: 'number',
      description: 'Max extraction requests per hour per user',
      isSecret: false,
      isEditable: true,
    },
    {
      category: 'rate_limits',
      key: 'ocr_requests_per_hour',
      value: 30,
      type: 'number',
      description: 'Max OCR requests per hour per user',
      isSecret: false,
      isEditable: true,
    },

    // Security
    {
      category: 'security',
      key: 'max_file_size_mb',
      value: 25,
      type: 'number',
      description: 'Maximum upload file size in MB',
      isSecret: false,
      isEditable: true,
    },
    {
      category: 'security',
      key: 'allowed_file_types',
      value: ['application/pdf'],
      type: 'json',
      description: 'Allowed MIME types for upload',
      isSecret: false,
      isEditable: true,
    },
    {
      category: 'security',
      key: 'session_timeout_minutes',
      value: 60,
      type: 'number',
      description: 'User session timeout in minutes',
      isSecret: false,
      isEditable: true,
    },
    {
      category: 'security',
      key: 'max_login_attempts',
      value: 5,
      type: 'number',
      description: 'Max failed login attempts before lockout',
      isSecret: false,
      isEditable: true,
    },

    // Features
    {
      category: 'features',
      key: 'enable_chat',
      value: true,
      type: 'boolean',
      description: 'Enable AI chat feature',
      isSecret: false,
      isEditable: true,
    },
    {
      category: 'features',
      key: 'enable_ocr',
      value: true,
      type: 'boolean',
      description: 'Enable OCR for scanned documents',
      isSecret: false,
      isEditable: true,
    },
    {
      category: 'features',
      key: 'enable_gap_analysis',
      value: true,
      type: 'boolean',
      description: 'Enable coverage gap analysis',
      isSecret: false,
      isEditable: true,
    },
    {
      category: 'features',
      key: 'enable_policy_comparison',
      value: true,
      type: 'boolean',
      description: 'Enable multi-policy comparison',
      isSecret: false,
      isEditable: true,
    },
    {
      category: 'features',
      key: 'enable_pdf_export',
      value: true,
      type: 'boolean',
      description: 'Enable PDF export feature',
      isSecret: false,
      isEditable: true,
    },

    // UI Configuration
    {
      category: 'ui',
      key: 'default_language',
      value: 'tr',
      type: 'string',
      description: 'Default UI language (tr/en)',
      isSecret: false,
      isEditable: true,
    },
    {
      category: 'ui',
      key: 'items_per_page',
      value: 10,
      type: 'number',
      description: 'Default items per page in lists',
      isSecret: false,
      isEditable: true,
    },
    {
      category: 'ui',
      key: 'show_cost_tracking',
      value: false,
      type: 'boolean',
      description: 'Show AI cost tracking to users',
      isSecret: false,
      isEditable: true,
    },

    // Notifications
    {
      category: 'notifications',
      key: 'email_notifications_enabled',
      value: false,
      type: 'boolean',
      description: 'Enable email notifications',
      isSecret: false,
      isEditable: true,
    },
    {
      category: 'notifications',
      key: 'alert_email_recipients',
      value: [],
      type: 'json',
      description: 'Email addresses for system alerts',
      isSecret: false,
      isEditable: true,
    },

    // System
    {
      category: 'system',
      key: 'maintenance_mode',
      value: false,
      type: 'boolean',
      description: 'Enable maintenance mode',
      isSecret: false,
      isEditable: true,
    },
    {
      category: 'system',
      key: 'debug_mode',
      value: false,
      type: 'boolean',
      description: 'Enable debug logging',
      isSecret: false,
      isEditable: true,
    },
  ]

  defaults.forEach((config) => {
    const id = `config-${config.category}-${config.key}`
    configs.set(id, {
      ...config,
      id,
      lastModified: new Date().toISOString(),
      history: [],
    })
  })
}

// Initialize on module load
initializeDefaultConfigs()

export function getConfig(key: string, category?: ConfigCategory): unknown {
  const id = category ? `config-${category}-${key}` : null

  if (id && configs.has(id)) {
    return configs.get(id)!.value
  }

  // Search by key alone
  for (const config of configs.values()) {
    if (config.key === key) {
      return config.value
    }
  }

  return undefined
}

export function getConfigObject(key: string, category?: ConfigCategory): AppConfig | undefined {
  const id = category ? `config-${category}-${key}` : null

  if (id && configs.has(id)) {
    return configs.get(id)
  }

  for (const config of configs.values()) {
    if (config.key === key) {
      return config
    }
  }

  return undefined
}

export function getAllConfigs(category?: ConfigCategory): AppConfig[] {
  const results: AppConfig[] = []

  for (const config of configs.values()) {
    if (!category || config.category === category) {
      results.push({ ...config })
    }
  }

  return results.sort((a, b) => a.key.localeCompare(b.key))
}

export function setConfig(
  key: string,
  value: unknown,
  category: ConfigCategory,
  changedBy: string,
  reason?: string
): boolean {
  const id = `config-${category}-${key}`
  const config = configs.get(id)

  if (!config) {
    return false
  }

  if (!config.isEditable) {
    return false
  }

  const change: ConfigChange = {
    timestamp: new Date().toISOString(),
    previousValue: config.value,
    newValue: value,
    changedBy,
    reason,
  }

  // Keep last 50 changes in history
  config.history = [change, ...config.history.slice(0, 49)]
  config.value = value
  config.lastModified = new Date().toISOString()
  config.modifiedBy = changedBy

  // Log audit event
  logAuditEvent({
    actorId: changedBy,
    actorEmail: changedBy,
    actorRole: 'admin',
    action: 'update',
    resourceType: 'config',
    resourceId: id,
    previousState: change.previousValue,
    newState: value,
    changes: [{ field: key, oldValue: change.previousValue, newValue: value }],
    ipAddress: 'system',
    reason,
  })

  return true
}

// ============================================================================
// FEATURE FLAGS
// ============================================================================

const featureFlags: Map<string, FeatureFlag> = new Map()

// Initialize default feature flags
function initializeDefaultFeatureFlags(): void {
  const defaults: Omit<FeatureFlag, 'createdAt' | 'updatedAt'>[] = [
    {
      id: 'new_extraction_pipeline',
      name: 'New Extraction Pipeline',
      description: 'Use the combined document processing pipeline for extractions',
      enabled: false,
      enabledPercentage: 0,
    },
    {
      id: 'pii_redaction',
      name: 'PII Redaction',
      description: 'Automatically detect and redact PII from documents',
      enabled: true,
    },
    {
      id: 'multi_provider_fallback',
      name: 'Multi-Provider Fallback',
      description: 'Automatically fallback to secondary AI provider on failure',
      enabled: true,
    },
    {
      id: 'advanced_gap_analysis',
      name: 'Advanced Gap Analysis',
      description: 'Enhanced gap detection with regional benchmarks',
      enabled: true,
    },
    {
      id: 'policy_amendments',
      name: 'Policy Amendments',
      description: 'Track policy amendments and version history',
      enabled: true,
    },
    {
      id: 'beta_features',
      name: 'Beta Features',
      description: 'Enable experimental features for beta users',
      enabled: false,
      enabledForRoles: ['admin', 'super_admin'],
    },
    {
      id: 'dark_mode',
      name: 'Dark Mode',
      description: 'Enable dark mode UI option',
      enabled: false,
      enabledPercentage: 10, // 10% rollout
    },
    {
      id: 'analytics_tracking',
      name: 'Analytics Tracking',
      description: 'Enable detailed analytics tracking',
      enabled: true,
    },
    {
      id: 'ai_cost_display',
      name: 'AI Cost Display',
      description: 'Show AI operation costs to users',
      enabled: false,
      enabledForRoles: ['admin', 'super_admin'],
    },
    {
      id: 'bulk_upload',
      name: 'Bulk Upload',
      description: 'Allow uploading multiple policies at once',
      enabled: false,
      enabledForRoles: ['premium', 'admin', 'super_admin'],
    },
  ]

  const now = new Date().toISOString()
  defaults.forEach((flag) => {
    featureFlags.set(flag.id, {
      ...flag,
      createdAt: now,
      updatedAt: now,
    })
  })
}

initializeDefaultFeatureFlags()

export function isFeatureEnabled(
  featureId: string,
  userId?: string,
  userRole?: UserRole
): boolean {
  const flag = featureFlags.get(featureId)

  if (!flag) {
    return false
  }

  // Check if globally disabled
  if (!flag.enabled) {
    // Check if enabled for specific users
    if (userId && flag.enabledForUsers?.includes(userId)) {
      return true
    }
    // Check if enabled for specific roles
    if (userRole && flag.enabledForRoles?.includes(userRole)) {
      return true
    }
    return false
  }

  // Check percentage rollout
  if (flag.enabledPercentage !== undefined && flag.enabledPercentage < 100) {
    // Use user ID to deterministically enable for a percentage of users
    if (userId) {
      const hash = userId.split('').reduce((a, b) => {
        a = (a << 5) - a + b.charCodeAt(0)
        return a & a
      }, 0)
      const percentage = Math.abs(hash) % 100
      return percentage < flag.enabledPercentage
    }
    return false
  }

  return true
}

export function getFeatureFlags(): FeatureFlag[] {
  return Array.from(featureFlags.values())
}

export function getFeatureFlag(id: string): FeatureFlag | undefined {
  return featureFlags.get(id)
}

export function updateFeatureFlag(
  id: string,
  updates: Partial<Omit<FeatureFlag, 'id' | 'createdAt'>>,
  updatedBy: string
): boolean {
  const flag = featureFlags.get(id)

  if (!flag) {
    return false
  }

  const previousState = { ...flag }

  Object.assign(flag, {
    ...updates,
    updatedAt: new Date().toISOString(),
    updatedBy,
  })

  // Log audit event
  logAuditEvent({
    actorId: updatedBy,
    actorEmail: updatedBy,
    actorRole: 'admin',
    action: updates.enabled !== undefined ? (updates.enabled ? 'enable' : 'disable') : 'update',
    resourceType: 'feature_flag',
    resourceId: id,
    previousState,
    newState: flag,
    ipAddress: 'system',
  })

  return true
}

export function createFeatureFlag(
  flag: Omit<FeatureFlag, 'createdAt' | 'updatedAt'>,
  createdBy: string
): boolean {
  if (featureFlags.has(flag.id)) {
    return false
  }

  const now = new Date().toISOString()
  featureFlags.set(flag.id, {
    ...flag,
    createdAt: now,
    updatedAt: now,
    updatedBy: createdBy,
  })

  logAuditEvent({
    actorId: createdBy,
    actorEmail: createdBy,
    actorRole: 'admin',
    action: 'create',
    resourceType: 'feature_flag',
    resourceId: flag.id,
    newState: featureFlags.get(flag.id),
    ipAddress: 'system',
  })

  return true
}

// ============================================================================
// AI PROVIDER CONFIGURATION
// ============================================================================

const providerConfigs: Map<AIProvider, AIProviderConfig> = new Map()

function initializeProviderConfigs(): void {
  const configs: AIProviderConfig[] = [
    {
      provider: 'openai',
      enabled: true,
      apiKeyConfigured: false,
      models: [
        {
          id: 'gpt-4o',
          name: 'GPT-4o',
          enabled: true,
          maxContextTokens: 128000,
          costPerInputToken: 0.000005,
          costPerOutputToken: 0.000015,
          capabilities: ['extraction', 'chat', 'analysis'],
          recommended: true,
        },
        {
          id: 'gpt-4o-mini',
          name: 'GPT-4o Mini',
          enabled: true,
          maxContextTokens: 128000,
          costPerInputToken: 0.00000015,
          costPerOutputToken: 0.0000006,
          capabilities: ['chat', 'simple_extraction'],
          recommended: false,
        },
        {
          id: 'gpt-4-turbo',
          name: 'GPT-4 Turbo',
          enabled: true,
          maxContextTokens: 128000,
          costPerInputToken: 0.00001,
          costPerOutputToken: 0.00003,
          capabilities: ['extraction', 'chat', 'analysis'],
          recommended: false,
        },
      ],
      rateLimits: {
        requestsPerMinute: 60,
        tokensPerMinute: 150000,
        requestsPerDay: 10000,
      },
      defaultModel: 'gpt-4o',
      fallbackProvider: 'anthropic',
    },
    {
      provider: 'anthropic',
      enabled: true,
      apiKeyConfigured: false,
      models: [
        {
          id: 'claude-3-5-sonnet-20241022',
          name: 'Claude 3.5 Sonnet',
          enabled: true,
          maxContextTokens: 200000,
          costPerInputToken: 0.000003,
          costPerOutputToken: 0.000015,
          capabilities: ['extraction', 'chat', 'analysis'],
          recommended: true,
        },
        {
          id: 'claude-3-5-haiku-20241022',
          name: 'Claude 3.5 Haiku',
          enabled: true,
          maxContextTokens: 200000,
          costPerInputToken: 0.0000008,
          costPerOutputToken: 0.000004,
          capabilities: ['chat', 'simple_extraction'],
          recommended: false,
        },
      ],
      rateLimits: {
        requestsPerMinute: 50,
        tokensPerMinute: 100000,
        requestsPerDay: 5000,
      },
      defaultModel: 'claude-3-5-sonnet-20241022',
      fallbackProvider: 'openai',
    },
    {
      provider: 'google',
      enabled: true,
      apiKeyConfigured: false,
      models: [
        {
          id: 'gemini-pro-vision',
          name: 'Gemini Pro Vision',
          enabled: true,
          maxContextTokens: 30720,
          costPerInputToken: 0.00000025,
          costPerOutputToken: 0.0000005,
          capabilities: ['ocr', 'image_analysis'],
          recommended: true,
        },
      ],
      rateLimits: {
        requestsPerMinute: 60,
        tokensPerMinute: 60000,
        requestsPerDay: 1500,
      },
      defaultModel: 'gemini-pro-vision',
    },
  ]

  configs.forEach((config) => {
    providerConfigs.set(config.provider, config)
  })
}

initializeProviderConfigs()

export function getProviderConfig(provider: AIProvider): AIProviderConfig | undefined {
  return providerConfigs.get(provider)
}

export function getAllProviderConfigs(): AIProviderConfig[] {
  return Array.from(providerConfigs.values())
}

export function updateProviderConfig(
  provider: AIProvider,
  updates: Partial<AIProviderConfig>,
  updatedBy: string
): boolean {
  const config = providerConfigs.get(provider)

  if (!config) {
    return false
  }

  const previousState = { ...config }
  Object.assign(config, updates)

  logAuditEvent({
    actorId: updatedBy,
    actorEmail: updatedBy,
    actorRole: 'admin',
    action: 'update',
    resourceType: 'config',
    resourceId: `provider-${provider}`,
    previousState,
    newState: config,
    ipAddress: 'system',
  })

  return true
}

export function setProviderApiKeyStatus(
  provider: AIProvider,
  configured: boolean,
  lastDigits?: string
): void {
  const config = providerConfigs.get(provider)
  if (config) {
    config.apiKeyConfigured = configured
    config.apiKeyLastDigits = lastDigits
  }
}

// ============================================================================
// PROMPT TEMPLATES
// ============================================================================

const promptTemplates: Map<string, PromptTemplate> = new Map()
let templateCounter = 0

export function createPromptTemplate(
  template: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount' | 'version'>,
  createdBy: string
): string {
  const id = `prompt-${Date.now()}-${++templateCounter}`
  const now = new Date().toISOString()

  const newTemplate: PromptTemplate = {
    ...template,
    id,
    version: 1,
    createdAt: now,
    updatedAt: now,
    createdBy,
    usageCount: 0,
  }

  promptTemplates.set(id, newTemplate)

  logAuditEvent({
    actorId: createdBy,
    actorEmail: createdBy,
    actorRole: 'admin',
    action: 'create',
    resourceType: 'prompt_template',
    resourceId: id,
    newState: newTemplate,
    ipAddress: 'system',
  })

  return id
}

export function updatePromptTemplate(
  id: string,
  updates: Partial<PromptTemplate>,
  updatedBy: string
): boolean {
  const template = promptTemplates.get(id)

  if (!template) {
    return false
  }

  const previousState = { ...template }

  Object.assign(template, {
    ...updates,
    version: template.version + 1,
    updatedAt: new Date().toISOString(),
  })

  logAuditEvent({
    actorId: updatedBy,
    actorEmail: updatedBy,
    actorRole: 'admin',
    action: 'update',
    resourceType: 'prompt_template',
    resourceId: id,
    previousState,
    newState: template,
    ipAddress: 'system',
  })

  return true
}

export function getPromptTemplate(id: string): PromptTemplate | undefined {
  return promptTemplates.get(id)
}

export function getPromptTemplates(category?: PromptTemplate['category']): PromptTemplate[] {
  const results: PromptTemplate[] = []

  for (const template of promptTemplates.values()) {
    if (!category || template.category === category) {
      results.push({ ...template })
    }
  }

  return results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function getActivePromptTemplate(category: PromptTemplate['category']): PromptTemplate | undefined {
  for (const template of promptTemplates.values()) {
    if (template.category === category && template.isActive) {
      return template
    }
  }
  return undefined
}

export function recordPromptUsage(id: string): void {
  const template = promptTemplates.get(id)
  if (template) {
    template.usageCount++
    template.lastUsed = new Date().toISOString()
  }
}

export function deletePromptTemplate(id: string, deletedBy: string): boolean {
  const template = promptTemplates.get(id)

  if (!template) {
    return false
  }

  promptTemplates.delete(id)

  logAuditEvent({
    actorId: deletedBy,
    actorEmail: deletedBy,
    actorRole: 'admin',
    action: 'delete',
    resourceType: 'prompt_template',
    resourceId: id,
    previousState: template,
    ipAddress: 'system',
  })

  return true
}

// Initialize some default prompt templates
function initializeDefaultPromptTemplates(): void {
  const now = new Date().toISOString()

  const defaultTemplates: PromptTemplate[] = [
    {
      id: 'prompt-extraction-default',
      name: 'Policy Extraction (Default)',
      description: 'Standard prompt for extracting policy data from Turkish insurance documents',
      category: 'extraction',
      version: 1,
      isActive: true,
      systemPrompt: `You are an expert Turkish insurance document analyzer. Extract structured data from the provided policy document.
Always respond in valid JSON format following the exact schema provided.
Pay special attention to Turkish-specific terms and formats.`,
      userPromptTemplate: `Extract all relevant information from this Turkish insurance policy document:

{{document_text}}

Return the data in the following JSON structure:
{{json_schema}}`,
      variables: [
        { name: 'document_text', description: 'The extracted text from the PDF', type: 'string', required: true },
        { name: 'json_schema', description: 'The target JSON schema for extraction', type: 'json', required: true },
      ],
      defaultProvider: 'openai',
      defaultModel: 'gpt-4o',
      parameters: {
        temperature: 0.1,
        maxTokens: 4096,
      },
      createdAt: now,
      updatedAt: now,
      createdBy: 'system',
      usageCount: 0,
    },
    {
      id: 'prompt-chat-default',
      name: 'Policy Chat (Default)',
      description: 'Standard prompt for answering questions about insurance policies',
      category: 'chat',
      version: 1,
      isActive: true,
      systemPrompt: `You are an expert Turkish insurance advisor assistant. Help users understand their insurance policies.
Answer questions clearly and concisely in the same language as the user's question (Turkish or English).
When referencing specific coverages, limits, or exclusions, cite the relevant parts of the policy.
If you're unsure about something, say so rather than making assumptions.`,
      userPromptTemplate: `Policy Context:
{{policy_context}}

User Question: {{user_message}}`,
      variables: [
        { name: 'policy_context', description: 'Formatted policy details for context', type: 'string', required: true },
        { name: 'user_message', description: 'The user\'s question', type: 'string', required: true },
      ],
      defaultProvider: 'openai',
      defaultModel: 'gpt-4o-mini',
      parameters: {
        temperature: 0.5,
        maxTokens: 2048,
      },
      createdAt: now,
      updatedAt: now,
      createdBy: 'system',
      usageCount: 0,
    },
    {
      id: 'prompt-ocr-default',
      name: 'OCR Correction (Default)',
      description: 'Prompt for correcting OCR errors in Turkish documents',
      category: 'ocr',
      version: 1,
      isActive: true,
      systemPrompt: `You are an expert at correcting OCR errors in Turkish insurance documents.
Fix common OCR mistakes while preserving the original meaning and structure.
Pay attention to Turkish characters (ı, İ, ğ, Ğ, ü, Ü, ş, Ş, ö, Ö, ç, Ç) and numbers.`,
      userPromptTemplate: `Correct any OCR errors in this Turkish insurance document text:

{{raw_text}}

Return only the corrected text without explanations.`,
      variables: [
        { name: 'raw_text', description: 'The raw OCR text to correct', type: 'string', required: true },
      ],
      defaultProvider: 'openai',
      defaultModel: 'gpt-4o-mini',
      parameters: {
        temperature: 0.2,
        maxTokens: 8192,
      },
      createdAt: now,
      updatedAt: now,
      createdBy: 'system',
      usageCount: 0,
    },
  ]

  defaultTemplates.forEach((template) => {
    promptTemplates.set(template.id, template)
  })
}

initializeDefaultPromptTemplates()

// ============================================================================
// COST CALCULATION HELPERS
// ============================================================================

export function calculateRequestCost(
  provider: AIProvider,
  model: string,
  inputTokens: number,
  outputTokens: number
): { input: number; output: number; total: number } {
  const config = providerConfigs.get(provider)
  if (!config) {
    return { input: 0, output: 0, total: 0 }
  }

  const modelConfig = config.models.find((m) => m.id === model)
  if (!modelConfig) {
    return { input: 0, output: 0, total: 0 }
  }

  const inputCost = inputTokens * modelConfig.costPerInputToken
  const outputCost = outputTokens * modelConfig.costPerOutputToken

  return {
    input: inputCost,
    output: outputCost,
    total: inputCost + outputCost,
  }
}
