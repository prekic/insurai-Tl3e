import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ExtractedPolicyData } from '../extraction-schema'

// Mock the dependencies
vi.mock('../config', () => ({
  getConfiguredProviders: vi.fn(),
  AI_CONFIG: {
    consensus: {
      enabled: true,
      agreementThreshold: 0.8,
      consensusFields: ['policyNumber', 'provider', 'premium', 'startDate', 'endDate'],
    },
  },
}))

vi.mock('./openai', () => ({
  extractWithOpenAI: vi.fn(),
}))

vi.mock('./claude', () => ({
  extractWithClaude: vi.fn(),
}))

import { extractWithConsensus } from './consensus'
import { getConfiguredProviders } from '../config'
import { extractWithOpenAI } from './openai'
import { extractWithClaude } from './claude'

// Helper to create mock extraction data
function createMockExtraction(overrides: Partial<ExtractedPolicyData> = {}): ExtractedPolicyData {
  // @ts-expect-error - mismatch due to schema update
  return {
    policyNumber: 'POL-001',
    provider: 'Test Insurance',
    policyType: 'home',
    insuredName: 'John Doe',
    insuredAddress: '123 Main St',
    startDate: '2024-01-01',
    endDate: '2025-01-01',
    premium: 5000,
    currency: 'TRY',
    paymentFrequency: 'annual',
    coverages: [{ name: 'Fire', limit: 100000, deductible: 1000, description: null }],
    specialConditions: [],
    exclusions: [],
    confidence: {
      overall: 0.9,
      policyNumber: 0.95,
      provider: 0.9,
      dates: 0.85,
      premium: 0.9,
      coverages: 0.88,
    },
    ...overrides,
  }
}

describe('Consensus Module', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('extractWithConsensus', () => {
    it('should throw error when no providers are configured', async () => {
      vi.mocked(getConfiguredProviders).mockReturnValue([])

      await expect(extractWithConsensus('test document')).rejects.toThrow(
        'No AI providers configured'
      )
    })

    it('should use single provider when only one is configured', async () => {
      vi.mocked(getConfiguredProviders).mockReturnValue(['openai'])
      const mockData = createMockExtraction()
      vi.mocked(extractWithOpenAI).mockResolvedValue(mockData)

      const result = await extractWithConsensus('test document')

      expect(extractWithOpenAI).toHaveBeenCalledWith('test document')
      expect(extractWithClaude).not.toHaveBeenCalled()
      expect(result.primaryProvider).toBe('openai')
      expect(result.consensus.agreement).toBe(1)
      expect(result.consensus.score).toBe(1)
    })

    it('should call both providers when both are configured', async () => {
      vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])
      const mockOpenAI = createMockExtraction({ policyNumber: 'POL-001' })
      const mockClaude = createMockExtraction({ policyNumber: 'POL-001' })

      vi.mocked(extractWithOpenAI).mockResolvedValue(mockOpenAI)
      vi.mocked(extractWithClaude).mockResolvedValue(mockClaude)

      const result = await extractWithConsensus('test document')

      expect(extractWithOpenAI).toHaveBeenCalled()
      expect(extractWithClaude).toHaveBeenCalled()
      expect(result.providerResults).toHaveLength(2)
    })

    it('should build consensus when providers agree', async () => {
      vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])

      const sharedData = {
        policyNumber: 'POL-001',
        provider: 'Allianz',
        premium: 5000,
        startDate: '2024-01-01',
        endDate: '2025-01-01',
      }

      vi.mocked(extractWithOpenAI).mockResolvedValue(createMockExtraction(sharedData))
      vi.mocked(extractWithClaude).mockResolvedValue(createMockExtraction(sharedData))

      const result = await extractWithConsensus('test document')

      expect(result.consensus.agreement).toBe(2)
      expect(result.consensus.score).toBe(1) // Full agreement
      expect(result.consensus.agreedFields).toContain('policyNumber')
      expect(result.consensus.agreedFields).toContain('provider')
      expect(result.consensus.disagreedFields).toHaveLength(0)
    })

    it('should identify disagreements between providers', async () => {
      vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])

      vi.mocked(extractWithOpenAI).mockResolvedValue(
        createMockExtraction({ premium: 5000, policyNumber: 'POL-001' })
      )
      vi.mocked(extractWithClaude).mockResolvedValue(
        createMockExtraction({ premium: 6000, policyNumber: 'POL-001' })
      )

      const result = await extractWithConsensus('test document')

      expect(result.consensus.disagreedFields).toContain('premium')
    })

    it('should use higher confidence value for disagreements', async () => {
      vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])

      vi.mocked(extractWithOpenAI).mockResolvedValue(
        createMockExtraction({
          premium: 5000,
          confidence: {
            overall: 0.9,
            policyNumber: 0.9,
            provider: 0.9,
            dates: 0.9,
            premium: 0.95,
            coverages: 0.9,
          },
        })
      )
      vi.mocked(extractWithClaude).mockResolvedValue(
        createMockExtraction({
          premium: 6000,
          confidence: {
            overall: 0.8,
            policyNumber: 0.8,
            provider: 0.8,
            dates: 0.8,
            premium: 0.75,
            coverages: 0.8,
          },
        })
      )

      const result = await extractWithConsensus('test document')

      // Should use OpenAI's value since it has higher premium confidence
      expect(result.data.premium).toBe(5000)
    })

    it('should handle provider failure gracefully', async () => {
      vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])

      vi.mocked(extractWithOpenAI).mockResolvedValue(createMockExtraction())
      vi.mocked(extractWithClaude).mockRejectedValue(new Error('API error'))

      const result = await extractWithConsensus('test document')

      expect(result.providerResults).toHaveLength(2)
      const claudeResult = result.providerResults.find((r) => r.provider === 'anthropic')
      expect(claudeResult?.error).toBeDefined()
      expect(result.data).toBeDefined() // Should still return data from OpenAI
    })

    it('should throw when all providers fail', async () => {
      vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])

      vi.mocked(extractWithOpenAI).mockRejectedValue(new Error('OpenAI error'))
      vi.mocked(extractWithClaude).mockRejectedValue(new Error('Claude error'))

      await expect(extractWithConsensus('test document')).rejects.toThrow('All AI providers failed')
    })

    it('should respect primaryProvider option', async () => {
      vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])

      vi.mocked(extractWithOpenAI).mockResolvedValue(
        createMockExtraction({
          confidence: {
            overall: 0.9,
            policyNumber: 0.9,
            provider: 0.9,
            dates: 0.9,
            premium: 0.9,
            coverages: 0.9,
          },
        })
      )
      vi.mocked(extractWithClaude).mockResolvedValue(
        createMockExtraction({
          confidence: {
            overall: 0.8,
            policyNumber: 0.8,
            provider: 0.8,
            dates: 0.8,
            premium: 0.8,
            coverages: 0.8,
          },
        })
      )

      const result = await extractWithConsensus('test document', {
        primaryProvider: 'anthropic',
      })

      expect(result.primaryProvider).toBe('anthropic')
    })

    it('should filter providers based on options', async () => {
      vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])

      vi.mocked(extractWithOpenAI).mockResolvedValue(createMockExtraction())

      const result = await extractWithConsensus('test document', {
        providers: ['openai'],
      })

      expect(extractWithOpenAI).toHaveBeenCalled()
      expect(extractWithClaude).not.toHaveBeenCalled()
      expect(result.providerResults).toHaveLength(1)
    })

    it('should merge coverages from multiple providers', async () => {
      vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])

      vi.mocked(extractWithOpenAI).mockResolvedValue(
        createMockExtraction({
          coverages: [{ name: 'Fire', limit: 100000, deductible: 1000, description: null }],
        })
      )
      vi.mocked(extractWithClaude).mockResolvedValue(
        createMockExtraction({
          coverages: [
            { name: 'Fire', limit: 120000, deductible: 1000, description: null },
            { name: 'Theft', limit: 50000, deductible: 500, description: null },
          ],
        })
      )

      const result = await extractWithConsensus('test document')

      // Should merge unique coverages
      expect(result.data.coverages.length).toBeGreaterThanOrEqual(1)
      // Should prefer higher limit
      const fireCoverage = result.data.coverages.find((c) => c.name.toLowerCase() === 'fire')
      expect(fireCoverage?.limit).toBe(120000)
    })

    it('should merge exclusions from multiple providers', async () => {
      vi.mocked(getConfiguredProviders).mockReturnValue(['openai', 'anthropic'])

      vi.mocked(extractWithOpenAI).mockResolvedValue(
        createMockExtraction({ exclusions: ['War', 'Nuclear'] })
      )
      vi.mocked(extractWithClaude).mockResolvedValue(
        createMockExtraction({ exclusions: ['War', 'Terrorism'] })
      )

      const result = await extractWithConsensus('test document')

      expect(result.data.exclusions).toContain('War')
      expect(result.data.exclusions).toContain('Nuclear')
      expect(result.data.exclusions).toContain('Terrorism')
    })
  })
})
