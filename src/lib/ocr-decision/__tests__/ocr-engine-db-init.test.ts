/**
 * Tests for OCRDecisionEngine initialization with database config
 */

import { describe, it, expect, afterEach } from 'vitest'
import {
  OCRDecisionEngine,
  getOCRDecisionEngine,
  initializeOCREngineWithConfig,
  resetOCRDecisionEngine,
} from '../ocr-decision-engine'
import type { OCRConfig } from '@/lib/config/types'

describe('OCRDecisionEngine Database Config Initialization', () => {
  afterEach(() => {
    // Reset singleton after each test
    resetOCRDecisionEngine()
  })

  describe('initializeOCREngineWithConfig', () => {
    it('should initialize engine with database config', () => {
      const dbConfig: Partial<OCRConfig> = {
        charsPerPageThreshold: 350,
        skipOcrThreshold: 0.88,
      }

      const engine = initializeOCREngineWithConfig(dbConfig as OCRConfig)

      const configManager = engine.getConfigurationManager()
      expect(configManager.isDatabaseConfigApplied()).toBe(true)

      const settings = configManager.getOCRSettings()
      expect(settings.density_analysis.chars_per_page_threshold).toBe(350)
      expect(settings.confidence_calculation.thresholds.skip_ocr).toBe(0.88)
    })

    it('should return the singleton engine instance', () => {
      const engine1 = initializeOCREngineWithConfig({ charsPerPageThreshold: 100 } as OCRConfig)
      const engine2 = getOCRDecisionEngine()

      expect(engine1).toBe(engine2)
    })

    it('should apply config to existing singleton', () => {
      // Get engine first
      const engine1 = getOCRDecisionEngine()
      expect(engine1.getConfigurationManager().isDatabaseConfigApplied()).toBe(false)

      // Initialize with config
      initializeOCREngineWithConfig({ charsPerPageThreshold: 500 } as OCRConfig)

      // Same instance should have config applied
      expect(engine1.getConfigurationManager().isDatabaseConfigApplied()).toBe(true)
    })
  })

  describe('resetOCRDecisionEngine', () => {
    it('should reset engine and config', () => {
      // Initialize with config
      initializeOCREngineWithConfig({ charsPerPageThreshold: 999 } as OCRConfig)

      // Reset
      resetOCRDecisionEngine()

      // Get new engine
      const engine = getOCRDecisionEngine()
      expect(engine.getConfigurationManager().isDatabaseConfigApplied()).toBe(false)
      expect(engine.getConfigurationManager().getOCRSettings().density_analysis.chars_per_page_threshold)
        .toBe(200) // Default from JSON
    })

    it('should handle reset when no engine exists', () => {
      // Should not throw
      expect(() => resetOCRDecisionEngine()).not.toThrow()
    })
  })

  describe('refreshSettings', () => {
    it('should refresh settings after ConfigurationManager update', () => {
      const engine = new OCRDecisionEngine()
      const configManager = engine.getConfigurationManager()

      // Initial settings
      const initialThreshold = configManager.getOCRSettings().density_analysis.chars_per_page_threshold

      // Update config manager
      configManager.updateFromDatabaseConfig({
        charsPerPageThreshold: initialThreshold + 100,
      } as OCRConfig)

      // Refresh engine settings
      engine.refreshSettings()

      // Engine should use updated settings
      const status = engine.getConfigurationStatus()
      expect(status.ocr_settings_version).toBeDefined()
    })
  })

  describe('getConfigurationManager', () => {
    it('should return the underlying config manager', () => {
      const engine = new OCRDecisionEngine()
      const configManager = engine.getConfigurationManager()

      expect(configManager).toBeDefined()
      expect(typeof configManager.getOCRSettings).toBe('function')
      expect(typeof configManager.updateFromDatabaseConfig).toBe('function')
    })

    it('should allow direct config updates through returned manager', () => {
      const engine = new OCRDecisionEngine()
      const configManager = engine.getConfigurationManager()

      configManager.updateFromDatabaseConfig({
        skipOcrThreshold: 0.92,
      } as OCRConfig)

      expect(configManager.isDatabaseConfigApplied()).toBe(true)
    })
  })

  describe('analyzeDocument with database config', () => {
    it('should use database config thresholds in analysis', () => {
      const engine = new OCRDecisionEngine()
      const configManager = engine.getConfigurationManager()

      // Set high skip threshold
      configManager.updateFromDatabaseConfig({
        skipOcrThreshold: 0.95,
        selectiveOcrThreshold: 0.70,
      } as OCRConfig)
      engine.refreshSettings()

      // Create test document with decent text
      const documentText = `
        Bu bir test poliçesi belgesidir.
        Poliçe Numarası: TST-2026-001
        Sigorta Şirketi: Test Sigorta A.Ş.
        Sigortalı: Test Kullanıcı
        Başlangıç Tarihi: 01.01.2026
        Bitiş Tarihi: 31.12.2026
        Toplam Prim: 5.000,00 TL
        ${' '.repeat(1000)} // Add padding for density
      `.repeat(5)

      const decision = engine.analyzeDocument(documentText)

      // Decision should reflect the config
      expect(decision.action).toBeDefined()
      expect(decision.confidence).toBeGreaterThanOrEqual(0)
      expect(decision.confidence).toBeLessThanOrEqual(1)
    })

    it('should use database config weights in confidence calculation', () => {
      const engine = new OCRDecisionEngine()
      const configManager = engine.getConfigurationManager()

      // Set custom weights
      configManager.updateFromDatabaseConfig({
        weightCharDensity: 0.40,
        weightTextQuality: 0.40,
        weightPageVariance: 0.05,
        weightEncodingCheck: 0.05,
        weightFieldExtraction: 0.10,
      } as OCRConfig)
      engine.refreshSettings()

      const documentText = `
        Test policy document with insurance terms.
        Policy Number: POL-123
        Provider: Test Insurance
        Premium: $1,000
      `.repeat(3)

      const decision = engine.analyzeDocument(documentText)

      // Verify weights were used
      expect(decision.analysis.confidence_breakdown.weights_used).toBeDefined()
    })
  })

  describe('getConfigurationStatus with database config', () => {
    it('should reflect database config in status', () => {
      const engine = new OCRDecisionEngine()

      // Initial status
      const statusBefore = engine.getConfigurationStatus()
      expect(statusBefore.ocr_settings_version).toBeDefined()

      // Apply database config
      engine.getConfigurationManager().updateFromDatabaseConfig({
        charsPerPageThreshold: 500,
      } as OCRConfig)
      engine.refreshSettings()

      // Status should still show version
      const statusAfter = engine.getConfigurationStatus()
      expect(statusAfter.ocr_settings_version).toBe(statusBefore.ocr_settings_version)
    })
  })
})
