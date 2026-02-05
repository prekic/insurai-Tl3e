/**
 * Tests for ConfigurationManager database config integration
 */

import { describe, it, expect, beforeEach } from 'vitest'
import { ConfigurationManager } from '../configuration-manager'
import type { OCRConfig } from '@/lib/config/types'

describe('ConfigurationManager Database Config Integration', () => {
  let configManager: ConfigurationManager

  beforeEach(() => {
    configManager = new ConfigurationManager()
  })

  describe('updateFromDatabaseConfig', () => {
    it('should apply database config to OCR settings', () => {
      const dbConfig: Partial<OCRConfig> = {
        charsPerPageThreshold: 300,
        skipOcrThreshold: 0.90,
        selectiveOcrThreshold: 0.70,
      }

      configManager.updateFromDatabaseConfig(dbConfig as OCRConfig)
      const settings = configManager.getOCRSettings()

      expect(settings.density_analysis.chars_per_page_threshold).toBe(300)
      expect(settings.confidence_calculation.thresholds.skip_ocr).toBe(0.90)
      expect(settings.confidence_calculation.thresholds.selective_ocr).toBe(0.70)
    })

    it('should mark database config as applied', () => {
      expect(configManager.isDatabaseConfigApplied()).toBe(false)

      configManager.updateFromDatabaseConfig({} as OCRConfig)

      expect(configManager.isDatabaseConfigApplied()).toBe(true)
    })

    it('should preserve base settings for undefined values', () => {
      const originalSettings = configManager.getOCRSettings()
      const originalTimeout = originalSettings.performance.timeout_seconds

      const dbConfig: Partial<OCRConfig> = {
        charsPerPageThreshold: 400,
        // timeoutSeconds not set
      }

      configManager.updateFromDatabaseConfig(dbConfig as OCRConfig)
      const settings = configManager.getOCRSettings()

      expect(settings.density_analysis.chars_per_page_threshold).toBe(400)
      expect(settings.performance.timeout_seconds).toBe(originalTimeout)
    })

    it('should apply confidence weights', () => {
      const dbConfig: Partial<OCRConfig> = {
        weightCharDensity: 0.30,
        weightTextQuality: 0.35,
        weightPageVariance: 0.10,
        weightEncodingCheck: 0.10,
        weightFieldExtraction: 0.15,
      }

      configManager.updateFromDatabaseConfig(dbConfig as OCRConfig)
      const settings = configManager.getOCRSettings()

      expect(settings.confidence_calculation.weights.char_density).toBe(0.30)
      expect(settings.confidence_calculation.weights.text_quality).toBe(0.35)
      expect(settings.confidence_calculation.weights.page_variance).toBe(0.10)
      expect(settings.confidence_calculation.weights.encoding_check).toBe(0.10)
      expect(settings.confidence_calculation.weights.field_extraction).toBe(0.15)
    })

    it('should apply language detection settings', () => {
      const dbConfig: Partial<OCRConfig> = {
        languageMinConfidence: 0.50,
        languageSampleSize: 3000,
      }

      configManager.updateFromDatabaseConfig(dbConfig as OCRConfig)
      const settings = configManager.getOCRSettings()

      expect(settings.language_detection.min_confidence).toBe(0.50)
      expect(settings.language_detection.sample_size).toBe(3000)
    })

    it('should apply performance settings', () => {
      const dbConfig: Partial<OCRConfig> = {
        maxPagesQuickAnalysis: 10,
        timeoutSeconds: 60,
        maxTextLength: 1000000,
      }

      configManager.updateFromDatabaseConfig(dbConfig as OCRConfig)
      const settings = configManager.getOCRSettings()

      expect(settings.performance.max_pages_for_quick_analysis).toBe(10)
      expect(settings.performance.timeout_seconds).toBe(60)
      expect(settings.performance.max_text_length).toBe(1000000)
    })

    it('should apply quality check settings', () => {
      const dbConfig: Partial<OCRConfig> = {
        minWordLengthAverage: 3,
        maxGarbageCharRatio: 0.15,
        minAlphanumericRatio: 0.50,
      }

      configManager.updateFromDatabaseConfig(dbConfig as OCRConfig)
      const settings = configManager.getOCRSettings()

      expect(settings.quality_checks?.min_word_length_average).toBe(3)
      expect(settings.quality_checks?.max_garbage_char_ratio).toBe(0.15)
      expect(settings.quality_checks?.min_alphanumeric_ratio).toBe(0.50)
    })

    it('should apply provider confidence thresholds', () => {
      const dbConfig: Partial<OCRConfig> = {
        googleVisionConfidence: 0.85,
        documentAiConfidence: 0.90,
        tesseractConfidence: 0.75,
      }

      configManager.updateFromDatabaseConfig(dbConfig as OCRConfig)
      const settings = configManager.getOCRSettings()

      expect(settings.ocr_providers.available.google_vision?.confidence_threshold).toBe(0.85)
      expect(settings.ocr_providers.available.google_document_ai?.confidence_threshold).toBe(0.90)
      expect(settings.ocr_providers.available.tesseract?.confidence_threshold).toBe(0.75)
    })

    it('should apply density analysis settings', () => {
      const dbConfig: Partial<OCRConfig> = {
        charsPerPageThreshold: 250,
        minPagesForAverage: 5,
        pageVarianceThreshold: 0.6,
        minCharsForValidPage: 75,
      }

      configManager.updateFromDatabaseConfig(dbConfig as OCRConfig)
      const settings = configManager.getOCRSettings()

      expect(settings.density_analysis.chars_per_page_threshold).toBe(250)
      expect(settings.density_analysis.min_pages_for_average_calculation).toBe(5)
      expect(settings.density_analysis.page_variance_threshold).toBe(0.6)
      expect(settings.density_analysis.min_chars_for_valid_page).toBe(75)
    })

    it('should apply policy type detection settings', () => {
      const dbConfig: Partial<OCRConfig> = {
        policyTypeMinConfidence: 0.60,
      }

      configManager.updateFromDatabaseConfig(dbConfig as OCRConfig)
      const settings = configManager.getOCRSettings()

      expect(settings.policy_type_detection.min_confidence).toBe(0.60)
    })
  })

  describe('resetToBaseSettings', () => {
    it('should reset to original JSON settings', () => {
      const originalSettings = JSON.parse(JSON.stringify(configManager.getOCRSettings()))

      // Apply database config
      configManager.updateFromDatabaseConfig({
        charsPerPageThreshold: 999,
        skipOcrThreshold: 0.99,
      } as OCRConfig)

      // Verify database config was applied
      expect(configManager.getOCRSettings().density_analysis.chars_per_page_threshold).toBe(999)

      // Reset
      configManager.resetToBaseSettings()

      // Verify reset
      expect(configManager.isDatabaseConfigApplied()).toBe(false)
      expect(configManager.getOCRSettings().density_analysis.chars_per_page_threshold)
        .toBe(originalSettings.density_analysis.chars_per_page_threshold)
    })

    it('should mark database config as not applied after reset', () => {
      configManager.updateFromDatabaseConfig({} as OCRConfig)
      expect(configManager.isDatabaseConfigApplied()).toBe(true)

      configManager.resetToBaseSettings()
      expect(configManager.isDatabaseConfigApplied()).toBe(false)
    })
  })

  describe('multiple updates', () => {
    it('should apply multiple database config updates correctly', () => {
      // First update
      configManager.updateFromDatabaseConfig({
        charsPerPageThreshold: 300,
      } as OCRConfig)
      expect(configManager.getOCRSettings().density_analysis.chars_per_page_threshold).toBe(300)

      // Second update should override
      configManager.updateFromDatabaseConfig({
        charsPerPageThreshold: 400,
        skipOcrThreshold: 0.95,
      } as OCRConfig)

      const settings = configManager.getOCRSettings()
      expect(settings.density_analysis.chars_per_page_threshold).toBe(400)
      expect(settings.confidence_calculation.thresholds.skip_ocr).toBe(0.95)
    })

    it('should preserve version information after update', () => {
      configManager.updateFromDatabaseConfig({
        charsPerPageThreshold: 500,
      } as OCRConfig)

      const settings = configManager.getOCRSettings()
      expect(settings.version).toBeDefined()
      expect(settings.last_updated).toBeDefined()
    })
  })

  describe('edge cases', () => {
    it('should handle empty database config', () => {
      const originalSettings = JSON.parse(JSON.stringify(configManager.getOCRSettings()))

      configManager.updateFromDatabaseConfig({} as OCRConfig)

      // Settings should remain unchanged
      const settings = configManager.getOCRSettings()
      expect(settings.density_analysis.chars_per_page_threshold)
        .toBe(originalSettings.density_analysis.chars_per_page_threshold)
      expect(configManager.isDatabaseConfigApplied()).toBe(true)
    })

    it('should handle partial database config', () => {
      const dbConfig: Partial<OCRConfig> = {
        skipOcrThreshold: 0.80,
        // All other values undefined
      }

      configManager.updateFromDatabaseConfig(dbConfig as OCRConfig)

      const settings = configManager.getOCRSettings()
      expect(settings.confidence_calculation.thresholds.skip_ocr).toBe(0.80)
      // Other values should remain from base
      expect(settings.density_analysis.chars_per_page_threshold).toBe(200) // Default from JSON
    })

    it('should not mutate base settings when applying database config', () => {
      const baseSettingsBefore = configManager.getOCRSettings().density_analysis.chars_per_page_threshold

      configManager.updateFromDatabaseConfig({
        charsPerPageThreshold: 999,
      } as OCRConfig)

      // Reset and check base is unchanged
      configManager.resetToBaseSettings()
      expect(configManager.getOCRSettings().density_analysis.chars_per_page_threshold).toBe(baseSettingsBefore)
    })
  })
})
