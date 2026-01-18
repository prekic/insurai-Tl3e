/**
 * Config Manager Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
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

// Mock the logAuditEvent function
vi.mock('./operations-logger', () => ({
  logAuditEvent: vi.fn(),
}))

describe('Config Manager', () => {
  describe('App Configuration', () => {
    it('should get default config values', () => {
      const defaultProvider = getConfig('default_provider', 'ai')
      expect(defaultProvider).toBe('openai')
    })

    it('should get config by key alone', () => {
      const chatModel = getConfig('chat_model')
      expect(chatModel).toBe('gpt-4o-mini')
    })

    it('should return undefined for non-existent config', () => {
      const nonExistent = getConfig('non_existent_key')
      expect(nonExistent).toBeUndefined()
    })

    it('should get config object with metadata', () => {
      const configObj = getConfigObject('default_provider', 'ai')
      expect(configObj).toBeDefined()
      expect(configObj?.key).toBe('default_provider')
      expect(configObj?.category).toBe('ai')
      expect(configObj?.isEditable).toBe(true)
    })

    it('should get all configs', () => {
      const allConfigs = getAllConfigs()
      expect(allConfigs.length).toBeGreaterThan(0)
    })

    it('should get configs by category', () => {
      const aiConfigs = getAllConfigs('ai')
      expect(aiConfigs.every((c) => c.category === 'ai')).toBe(true)
    })

    it('should update config value', () => {
      const originalValue = getConfig('default_provider', 'ai')

      const success = setConfig(
        'default_provider',
        'anthropic',
        'ai',
        'admin@test.com',
        'Testing new provider'
      )

      expect(success).toBe(true)
      expect(getConfig('default_provider', 'ai')).toBe('anthropic')

      // Restore
      setConfig('default_provider', originalValue, 'ai', 'admin@test.com')
    })

    it('should track config change history', () => {
      const originalValue = getConfig('temperature', 'ai')

      setConfig('temperature', 0.5, 'ai', 'admin@test.com', 'Testing')
      setConfig('temperature', 0.7, 'ai', 'admin@test.com', 'Another change')

      const configObj = getConfigObject('temperature', 'ai')
      expect(configObj?.history.length).toBeGreaterThanOrEqual(2)

      // Restore
      setConfig('temperature', originalValue, 'ai', 'admin@test.com')
    })

    it('should return false for non-existent config update', () => {
      const success = setConfig(
        'non_existent_key',
        'value',
        'ai',
        'admin@test.com'
      )
      expect(success).toBe(false)
    })
  })

  describe('Feature Flags', () => {
    it('should get all feature flags', () => {
      const flags = getFeatureFlags()
      expect(flags.length).toBeGreaterThan(0)
    })

    it('should get a specific feature flag', () => {
      const flag = getFeatureFlag('pii_redaction')
      expect(flag).toBeDefined()
      expect(flag?.name).toBe('PII Redaction')
    })

    it('should check if feature is enabled globally', () => {
      const piiEnabled = isFeatureEnabled('pii_redaction')
      expect(piiEnabled).toBe(true)
    })

    it('should check if disabled feature returns false', () => {
      const newPipelineEnabled = isFeatureEnabled('new_extraction_pipeline')
      expect(newPipelineEnabled).toBe(false)
    })

    it('should enable feature for specific roles', () => {
      // beta_features is disabled but enabled for admin and super_admin roles
      const enabled = isFeatureEnabled('beta_features', 'user-1', 'admin')
      expect(enabled).toBe(true)

      const disabledForUser = isFeatureEnabled('beta_features', 'user-1', 'user')
      expect(disabledForUser).toBe(false)
    })

    it('should update feature flag', () => {
      const originalFlag = getFeatureFlag('dark_mode')
      const originalEnabled = originalFlag?.enabled

      const success = updateFeatureFlag(
        'dark_mode',
        { enabled: true },
        'admin@test.com'
      )

      expect(success).toBe(true)

      const updatedFlag = getFeatureFlag('dark_mode')
      expect(updatedFlag?.enabled).toBe(true)
      expect(updatedFlag?.updatedBy).toBe('admin@test.com')

      // Restore
      updateFeatureFlag('dark_mode', { enabled: originalEnabled }, 'admin@test.com')
    })

    it('should create new feature flag', () => {
      const created = createFeatureFlag(
        {
          id: 'test_feature',
          name: 'Test Feature',
          description: 'A test feature flag',
          enabled: false,
        },
        'admin@test.com'
      )

      expect(created).toBe(true)

      const flag = getFeatureFlag('test_feature')
      expect(flag).toBeDefined()
      expect(flag?.name).toBe('Test Feature')
    })

    it('should not create duplicate feature flag', () => {
      const duplicate = createFeatureFlag(
        {
          id: 'pii_redaction',
          name: 'Duplicate',
          description: 'Duplicate',
          enabled: false,
        },
        'admin@test.com'
      )

      expect(duplicate).toBe(false)
    })
  })

  describe('AI Provider Configuration', () => {
    it('should get all provider configs', () => {
      const providers = getAllProviderConfigs()
      expect(providers.length).toBe(3) // openai, anthropic, google
    })

    it('should get specific provider config', () => {
      const openai = getProviderConfig('openai')
      expect(openai).toBeDefined()
      expect(openai?.provider).toBe('openai')
      expect(openai?.models.length).toBeGreaterThan(0)
    })

    it('should have correct model configurations', () => {
      const openai = getProviderConfig('openai')
      const gpt4o = openai?.models.find((m) => m.id === 'gpt-4o')

      expect(gpt4o).toBeDefined()
      expect(gpt4o?.capabilities).toContain('extraction')
      expect(gpt4o?.capabilities).toContain('chat')
    })

    it('should update provider config', () => {
      const original = getProviderConfig('openai')

      const success = updateProviderConfig(
        'openai',
        { enabled: false },
        'admin@test.com'
      )

      expect(success).toBe(true)

      const updated = getProviderConfig('openai')
      expect(updated?.enabled).toBe(false)

      // Restore
      updateProviderConfig('openai', { enabled: true }, 'admin@test.com')
    })

    it('should set API key status', () => {
      setProviderApiKeyStatus('openai', true, '...abc123')

      const config = getProviderConfig('openai')
      expect(config?.apiKeyConfigured).toBe(true)
      expect(config?.apiKeyLastDigits).toBe('...abc123')

      // Reset
      setProviderApiKeyStatus('openai', false)
    })
  })

  describe('Prompt Templates', () => {
    it('should have default templates', () => {
      const templates = getPromptTemplates()
      expect(templates.length).toBeGreaterThan(0)
    })

    it('should get templates by category', () => {
      const extractionTemplates = getPromptTemplates('extraction')
      expect(extractionTemplates.every((t) => t.category === 'extraction')).toBe(true)
    })

    it('should get active template for category', () => {
      const activeExtraction = getActivePromptTemplate('extraction')
      expect(activeExtraction).toBeDefined()
      expect(activeExtraction?.isActive).toBe(true)
      expect(activeExtraction?.category).toBe('extraction')
    })

    it('should create new prompt template', () => {
      const id = createPromptTemplate(
        {
          name: 'Test Template',
          description: 'A test template',
          category: 'chat',
          systemPrompt: 'You are a test assistant.',
          userPromptTemplate: 'Test: {{input}}',
          variables: [{ name: 'input', description: 'Test input', type: 'string', required: true }],
          isActive: false,
          defaultProvider: 'openai',
          defaultModel: 'gpt-4o',
          parameters: { temperature: 0.5, maxTokens: 1024 },
        },
        'admin@test.com'
      )

      expect(id).toBeDefined()

      const template = getPromptTemplate(id)
      expect(template?.name).toBe('Test Template')
      expect(template?.version).toBe(1)
    })

    it('should update prompt template', () => {
      const id = createPromptTemplate(
        {
          name: 'Update Test',
          description: 'Will be updated',
          category: 'analysis',
          systemPrompt: 'Original system prompt',
          userPromptTemplate: 'Original: {{input}}',
          variables: [],
          isActive: false,
          defaultProvider: 'openai',
          defaultModel: 'gpt-4o',
          parameters: { temperature: 0.3 },
        },
        'admin@test.com'
      )

      const success = updatePromptTemplate(
        id,
        { systemPrompt: 'Updated system prompt' },
        'admin@test.com'
      )

      expect(success).toBe(true)

      const template = getPromptTemplate(id)
      expect(template?.systemPrompt).toBe('Updated system prompt')
      expect(template?.version).toBe(2)
    })

    it('should record prompt usage', () => {
      const id = createPromptTemplate(
        {
          name: 'Usage Test',
          description: 'For usage tracking',
          category: 'chat',
          systemPrompt: 'Test',
          userPromptTemplate: 'Test',
          variables: [],
          isActive: false,
          defaultProvider: 'openai',
          defaultModel: 'gpt-4o',
          parameters: {},
        },
        'admin@test.com'
      )

      const before = getPromptTemplate(id)
      expect(before?.usageCount).toBe(0)

      recordPromptUsage(id)
      recordPromptUsage(id)

      const after = getPromptTemplate(id)
      expect(after?.usageCount).toBe(2)
      expect(after?.lastUsed).toBeDefined()
    })

    it('should delete prompt template', () => {
      const id = createPromptTemplate(
        {
          name: 'Delete Test',
          description: 'Will be deleted',
          category: 'chat',
          systemPrompt: 'Test',
          userPromptTemplate: 'Test',
          variables: [],
          isActive: false,
          defaultProvider: 'openai',
          defaultModel: 'gpt-4o',
          parameters: {},
        },
        'admin@test.com'
      )

      expect(getPromptTemplate(id)).toBeDefined()

      const deleted = deletePromptTemplate(id, 'admin@test.com')
      expect(deleted).toBe(true)

      expect(getPromptTemplate(id)).toBeUndefined()
    })
  })

  describe('Cost Calculation', () => {
    it('should calculate request cost for OpenAI', () => {
      const cost = calculateRequestCost('openai', 'gpt-4o', 1000, 500)

      expect(cost.input).toBeCloseTo(0.005, 6)  // 1000 * 0.000005
      expect(cost.output).toBeCloseTo(0.0075, 6) // 500 * 0.000015
      expect(cost.total).toBeCloseTo(0.0125, 6)
    })

    it('should calculate request cost for Anthropic', () => {
      const cost = calculateRequestCost('anthropic', 'claude-3-5-sonnet-20241022', 1000, 500)

      expect(cost.input).toBeCloseTo(0.003, 6)  // 1000 * 0.000003
      expect(cost.output).toBeCloseTo(0.0075, 6) // 500 * 0.000015
      expect(cost.total).toBeCloseTo(0.0105, 6)
    })

    it('should return zero cost for unknown provider', () => {
      const cost = calculateRequestCost('unknown' as any, 'model', 1000, 500)

      expect(cost.input).toBe(0)
      expect(cost.output).toBe(0)
      expect(cost.total).toBe(0)
    })

    it('should return zero cost for unknown model', () => {
      const cost = calculateRequestCost('openai', 'unknown-model', 1000, 500)

      expect(cost.input).toBe(0)
      expect(cost.output).toBe(0)
      expect(cost.total).toBe(0)
    })
  })
})
