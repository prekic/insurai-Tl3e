/**
 * ConfigurationService Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ConfigurationService } from '../configuration-service'
import {
  DEFAULT_AI_CONFIG,
  DEFAULT_EVALUATION_CONFIG,
  DEFAULT_OCR_CONFIG,
  DEFAULT_FUZZY_MATCHING_CONFIG,
} from '../types'

// Mock Supabase
vi.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: null, error: null })),
            order: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
          single: vi.fn(() => Promise.resolve({ data: null, error: null })),
          order: vi.fn(() => ({
            ascending: vi.fn(() => Promise.resolve({ data: [], error: null })),
          })),
        })),
        order: vi.fn(() => ({
          order: vi.fn(() => Promise.resolve({ data: [], error: null })),
        })),
      })),
    })),
  },
}))

describe('ConfigurationService', () => {
  let service: ConfigurationService

  beforeEach(() => {
    // Reset the singleton for each test
    ConfigurationService.resetInstance()
    service = ConfigurationService.getInstance({ enableCache: false })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('getInstance', () => {
    it('should return the same instance', () => {
      const instance1 = ConfigurationService.getInstance()
      const instance2 = ConfigurationService.getInstance()
      expect(instance1).toBe(instance2)
    })

    it('should accept custom options', () => {
      ConfigurationService.resetInstance()
      const instance = ConfigurationService.getInstance({
        cacheTtlMs: 60000,
        enableCache: true,
      })
      expect(instance).toBeDefined()
    })
  })

  describe('get', () => {
    it('should return default value when setting not found', async () => {
      const result = await service.get('ai', 'nonexistent_key', 'default_value')
      expect(result).toBe('default_value')
    })

    it('should return default value for number type', async () => {
      const result = await service.get('ai', 'max_tokens', 4096)
      expect(result).toBe(4096)
    })

    it('should return default value for boolean type', async () => {
      const result = await service.get('ai', 'enable_fallback', true)
      expect(result).toBe(true)
    })

    it('should return default value for array type', async () => {
      const defaultArray = ['field1', 'field2']
      const result = await service.get('ai', 'consensus_fields', defaultArray)
      expect(result).toEqual(defaultArray)
    })
  })

  describe('getCategory', () => {
    it('should return empty object when category has no settings', async () => {
      const result = await service.getCategory('ai')
      expect(result).toEqual({})
    })
  })

  describe('getAIConfig', () => {
    it('should return default AI config when database is empty', async () => {
      const config = await service.getAIConfig()

      expect(config.openaiExtractionModel).toBe(DEFAULT_AI_CONFIG.openaiExtractionModel)
      expect(config.anthropicExtractionModel).toBe(DEFAULT_AI_CONFIG.anthropicExtractionModel)
      expect(config.maxTokens).toBe(DEFAULT_AI_CONFIG.maxTokens)
      expect(config.temperature).toBe(DEFAULT_AI_CONFIG.temperature)
      expect(config.enableFallback).toBe(DEFAULT_AI_CONFIG.enableFallback)
    })

    it('should have correct default model values', async () => {
      const config = await service.getAIConfig()

      expect(config.openaiExtractionModel).toBe('gpt-4o')
      expect(config.openaiBackupModel).toBe('gpt-4o-mini')
      expect(config.anthropicExtractionModel).toBe('claude-sonnet-4-20250514')
      expect(config.anthropicBackupModel).toBe('claude-3-5-haiku-20241022')
    })

    it('should have correct default numeric values', async () => {
      const config = await service.getAIConfig()

      expect(config.maxTokens).toBe(4096)
      expect(config.temperature).toBe(0.1)
      expect(config.chatTemperature).toBe(0.7)
      expect(config.minConfidence).toBe(0.7)
      expect(config.extractionTimeoutMs).toBe(90000)
    })

    it('should have correct default provider settings', async () => {
      const config = await service.getAIConfig()

      expect(config.preferredProvider).toBe('auto')
      expect(config.enableFallback).toBe(true)
    })

    it('should have correct default consensus settings', async () => {
      const config = await service.getAIConfig()

      expect(config.consensusEnabled).toBe(true)
      expect(config.consensusAgreementThreshold).toBe(0.8)
      expect(config.consensusFields).toEqual([
        'policyNumber',
        'provider',
        'premium',
        'startDate',
        'endDate',
      ])
    })
  })

  describe('getEvaluationConfig', () => {
    it('should return default evaluation config when database is empty', async () => {
      const config = await service.getEvaluationConfig()

      expect(config.weightPremium).toBe(DEFAULT_EVALUATION_CONFIG.weightPremium)
      expect(config.weightCoverage).toBe(DEFAULT_EVALUATION_CONFIG.weightCoverage)
      expect(config.weightDeductible).toBe(DEFAULT_EVALUATION_CONFIG.weightDeductible)
      expect(config.weightCompliance).toBe(DEFAULT_EVALUATION_CONFIG.weightCompliance)
      expect(config.weightValue).toBe(DEFAULT_EVALUATION_CONFIG.weightValue)
    })

    it('should have weights that sum to 100', async () => {
      const config = await service.getEvaluationConfig()

      const totalWeight =
        config.weightPremium +
        config.weightCoverage +
        config.weightDeductible +
        config.weightCompliance +
        config.weightValue

      expect(totalWeight).toBe(100)
    })

    it('should have correct grade thresholds', async () => {
      const config = await service.getEvaluationConfig()

      expect(config.gradeAThreshold).toBe(90)
      expect(config.gradeBThreshold).toBe(80)
      expect(config.gradeCThreshold).toBe(70)
      expect(config.gradeDThreshold).toBe(60)
    })

    it('should have correct status thresholds', async () => {
      const config = await service.getEvaluationConfig()

      expect(config.statusExcellentThreshold).toBe(90)
      expect(config.statusGoodThreshold).toBe(75)
      expect(config.statusFairThreshold).toBe(60)
      expect(config.statusPoorThreshold).toBe(40)
    })

    it('should have correct evaluation options', async () => {
      const config = await service.getEvaluationConfig()

      expect(config.strictCompliance).toBe(true)
      expect(config.includeOptionalCoverages).toBe(true)
      expect(config.useRegionalBenchmarks).toBe(true)
    })
  })

  describe('getOCRConfig', () => {
    it('should return default OCR config when database is empty', async () => {
      const config = await service.getOCRConfig()

      expect(config.charsPerPageThreshold).toBe(DEFAULT_OCR_CONFIG.charsPerPageThreshold)
      expect(config.skipOcrThreshold).toBe(DEFAULT_OCR_CONFIG.skipOcrThreshold)
      expect(config.selectiveOcrThreshold).toBe(DEFAULT_OCR_CONFIG.selectiveOcrThreshold)
    })

    it('should have correct density analysis settings', async () => {
      const config = await service.getOCRConfig()

      expect(config.charsPerPageThreshold).toBe(200)
      expect(config.minPagesForAverage).toBe(3)
      expect(config.pageVarianceThreshold).toBe(0.5)
      expect(config.minCharsForValidPage).toBe(50)
    })

    it('should have correct confidence thresholds', async () => {
      const config = await service.getOCRConfig()

      expect(config.skipOcrThreshold).toBe(0.85)
      expect(config.selectiveOcrThreshold).toBe(0.60)
    })

    it('should have confidence weights that sum to 1', async () => {
      const config = await service.getOCRConfig()

      const totalWeight =
        config.weightCharDensity +
        config.weightTextQuality +
        config.weightPageVariance +
        config.weightEncodingCheck +
        config.weightFieldExtraction

      expect(totalWeight).toBe(1)
    })

    it('should have correct provider thresholds', async () => {
      const config = await service.getOCRConfig()

      expect(config.googleVisionConfidence).toBe(0.80)
      expect(config.documentAiConfidence).toBe(0.85)
      expect(config.tesseractConfidence).toBe(0.70)
    })

    it('should have correct language detection settings', async () => {
      const config = await service.getOCRConfig()

      expect(config.languageMinConfidence).toBe(0.40)
      expect(config.languageSampleSize).toBe(2000)
    })

    it('should have correct quality check settings', async () => {
      const config = await service.getOCRConfig()

      expect(config.minWordLengthAverage).toBe(2)
      expect(config.maxGarbageCharRatio).toBe(0.10)
      expect(config.minAlphanumericRatio).toBe(0.60)
    })
  })

  describe('getFuzzyMatchingConfig', () => {
    it('should return default fuzzy matching config when database is empty', async () => {
      const config = await service.getFuzzyMatchingConfig()

      expect(config.defaultThreshold).toBe(DEFAULT_FUZZY_MATCHING_CONFIG.defaultThreshold)
      expect(config.policyNumberThreshold).toBe(DEFAULT_FUZZY_MATCHING_CONFIG.policyNumberThreshold)
    })

    it('should have correct general thresholds', async () => {
      const config = await service.getFuzzyMatchingConfig()

      expect(config.defaultThreshold).toBe(0.85)
      expect(config.shortStringThreshold).toBe(0.90)
    })

    it('should have correct field-specific thresholds', async () => {
      const config = await service.getFuzzyMatchingConfig()

      expect(config.policyNumberThreshold).toBe(0.85)
      expect(config.providerNameThreshold).toBe(0.80)
      expect(config.insuredNameThreshold).toBe(0.80)
      expect(config.coverageNameThreshold).toBe(0.85)
    })

    it('should have correct array comparison thresholds', async () => {
      const config = await service.getFuzzyMatchingConfig()

      expect(config.arrayMatchRatio).toBe(0.70)
      expect(config.keywordOverlapRatio).toBe(0.80)
    })

    it('should have correct numeric tolerance values', async () => {
      const config = await service.getFuzzyMatchingConfig()

      expect(config.numericTolerancePercent).toBe(0.02)
      expect(config.seddkLimitTolerance).toBe(0.05)
      expect(config.coverageLimitTolerance).toBe(0.10)
      expect(config.deductibleTolerance).toBe(0.20)
    })
  })

  describe('invalidateCache', () => {
    it('should not throw when invalidating cache', () => {
      expect(() => service.invalidateCache()).not.toThrow()
    })

    it('should not throw when invalidating specific category', () => {
      expect(() => service.invalidateCache('ai')).not.toThrow()
    })
  })

  describe('isFeatureEnabled', () => {
    it('should return false for non-existent feature flag', async () => {
      const result = await service.isFeatureEnabled('nonexistent_flag')
      expect(result).toBe(false)
    })

    it('should return false for disabled feature flag', async () => {
      const result = await service.isFeatureEnabled('use_db_config')
      expect(result).toBe(false)
    })
  })

  describe('getFeatureFlags', () => {
    it('should return empty array when no flags exist', async () => {
      const flags = await service.getFeatureFlags()
      expect(flags).toEqual([])
    })
  })

  describe('getRegionalFactor', () => {
    it('should return default factor of 1.0 when region not found', async () => {
      const factor = await service.getRegionalFactor('unknown_region')
      expect(factor).toBe(1.0)
    })
  })

  describe('getRegionalFactors', () => {
    it('should return empty array when no factors exist', async () => {
      const factors = await service.getRegionalFactors()
      expect(factors).toEqual([])
    })
  })

  describe('getInsuranceProviders', () => {
    it('should return empty array when no providers exist', async () => {
      const providers = await service.getInsuranceProviders()
      expect(providers).toEqual([])
    })
  })

  describe('getMarketBenchmarks', () => {
    it('should return empty array when no benchmarks exist', async () => {
      const benchmarks = await service.getMarketBenchmarks('kasko')
      expect(benchmarks).toEqual([])
    })
  })

  describe('getUserPreferences', () => {
    it('should return null when user has no preferences', async () => {
      const prefs = await service.getUserPreferences('user123', 'dashboard')
      expect(prefs).toBeNull()
    })
  })

  describe('setUserPreferences', () => {
    it('should return false when database operation fails', async () => {
      const result = await service.setUserPreferences('user123', 'dashboard', { theme: 'dark' })
      expect(result).toBe(false)
    })
  })
})

describe('Default Configuration Values', () => {
  describe('DEFAULT_AI_CONFIG', () => {
    it('should have all required fields', () => {
      expect(DEFAULT_AI_CONFIG).toHaveProperty('openaiExtractionModel')
      expect(DEFAULT_AI_CONFIG).toHaveProperty('anthropicExtractionModel')
      expect(DEFAULT_AI_CONFIG).toHaveProperty('maxTokens')
      expect(DEFAULT_AI_CONFIG).toHaveProperty('temperature')
      expect(DEFAULT_AI_CONFIG).toHaveProperty('enableFallback')
      expect(DEFAULT_AI_CONFIG).toHaveProperty('preferredProvider')
    })
  })

  describe('DEFAULT_EVALUATION_CONFIG', () => {
    it('should have all required weight fields', () => {
      expect(DEFAULT_EVALUATION_CONFIG).toHaveProperty('weightPremium')
      expect(DEFAULT_EVALUATION_CONFIG).toHaveProperty('weightCoverage')
      expect(DEFAULT_EVALUATION_CONFIG).toHaveProperty('weightDeductible')
      expect(DEFAULT_EVALUATION_CONFIG).toHaveProperty('weightCompliance')
      expect(DEFAULT_EVALUATION_CONFIG).toHaveProperty('weightValue')
    })

    it('should have all required threshold fields', () => {
      expect(DEFAULT_EVALUATION_CONFIG).toHaveProperty('gradeAThreshold')
      expect(DEFAULT_EVALUATION_CONFIG).toHaveProperty('gradeBThreshold')
      expect(DEFAULT_EVALUATION_CONFIG).toHaveProperty('gradeCThreshold')
      expect(DEFAULT_EVALUATION_CONFIG).toHaveProperty('gradeDThreshold')
    })
  })

  describe('DEFAULT_OCR_CONFIG', () => {
    it('should have all required density fields', () => {
      expect(DEFAULT_OCR_CONFIG).toHaveProperty('charsPerPageThreshold')
      expect(DEFAULT_OCR_CONFIG).toHaveProperty('minPagesForAverage')
      expect(DEFAULT_OCR_CONFIG).toHaveProperty('pageVarianceThreshold')
    })

    it('should have all required threshold fields', () => {
      expect(DEFAULT_OCR_CONFIG).toHaveProperty('skipOcrThreshold')
      expect(DEFAULT_OCR_CONFIG).toHaveProperty('selectiveOcrThreshold')
    })
  })

  describe('DEFAULT_FUZZY_MATCHING_CONFIG', () => {
    it('should have all required threshold fields', () => {
      expect(DEFAULT_FUZZY_MATCHING_CONFIG).toHaveProperty('defaultThreshold')
      expect(DEFAULT_FUZZY_MATCHING_CONFIG).toHaveProperty('policyNumberThreshold')
      expect(DEFAULT_FUZZY_MATCHING_CONFIG).toHaveProperty('numericTolerancePercent')
    })
  })
})
