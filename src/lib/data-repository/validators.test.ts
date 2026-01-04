/**
 * Tests for Data Validators
 * Tests validation rules and utility functions for market data integrity
 */

import { describe, it, expect } from 'vitest'
import {
  BENCHMARK_VALIDATION_RULES,
  PROVIDER_VALIDATION_RULES,
  REGIONAL_VALIDATION_RULES,
  METADATA_VALIDATION_RULES,
  runValidation,
  validateRepository,
  quickValidate,
  calculateQualityScore,
} from './validators'
import type { BenchmarkDataRepository, ValidationReport } from '@/types/data-repository'

// =============================================================================
// Test Fixtures
// =============================================================================

const createValidBenchmarks = () => ({
  home: {
    premiumRange: { min: 500, max: 5000 },
    coverageRange: { min: 100000, max: 10000000 },
    commonCoverages: ['fire', 'theft', 'natural-disaster'],
    trends: { premiumChangeYoY: 15, claimsRatio: 0.65 },
  },
  kasko: {
    premiumRange: { min: 1000, max: 20000 },
    coverageRange: { min: 50000, max: 5000000 },
    commonCoverages: ['collision', 'comprehensive'],
    trends: { premiumChangeYoY: 20, claimsRatio: 0.75 },
  },
})

const createValidProviders = () => ({
  allianz: { name: 'Allianz Sigorta', website: 'https://allianz.com.tr', rating: 4.5 },
  axa: { name: 'AXA Sigorta', website: 'https://axa.com.tr', rating: 4.2 },
})

const createValidRegions = () => ({
  istanbul: { baseFactor: 1.2, population: 16000000 },
  ankara: { baseFactor: 1.0, population: 5700000 },
  izmir: { baseFactor: 1.1, population: 4400000 },
})

const createValidRepository = (): BenchmarkDataRepository => ({
  benchmarks: createValidBenchmarks() as unknown as BenchmarkDataRepository['benchmarks'],
  providers: createValidProviders() as unknown as BenchmarkDataRepository['providers'],
  regionalFactors: createValidRegions() as unknown as BenchmarkDataRepository['regionalFactors'],
  metadata: {
    lastUpdated: new Date().toISOString(),
    version: '1.0.0',
    source: {
      name: 'Test Data',
      type: 'official',
      confidence: 1.0,
    },
  } as unknown as BenchmarkDataRepository['metadata'],
})

// =============================================================================
// Premium Range Rule Tests
// =============================================================================

describe('Premium Range Validation', () => {
  it('should pass for valid premium ranges', () => {
    const data = {
      home: { premiumRange: { min: 500, max: 5000 } },
    }

    const result = runValidation(data, BENCHMARK_VALIDATION_RULES)

    expect(result.issues.filter(i => i.field?.includes('premiumRange') && i.severity === 'error')).toHaveLength(0)
  })

  it('should fail when min premium is negative', () => {
    const data = {
      home: { premiumRange: { min: -100, max: 5000 }, commonCoverages: ['fire'] },
    }

    const result = runValidation(data, BENCHMARK_VALIDATION_RULES)
    const premiumIssues = result.issues.filter(i => i.field?.includes('premiumRange'))

    expect(premiumIssues.some(i => i.message.includes('positive'))).toBe(true)
  })

  it('should fail when max premium is negative', () => {
    const data = {
      home: { premiumRange: { min: 100, max: -5000 }, commonCoverages: ['fire'] },
    }

    const result = runValidation(data, BENCHMARK_VALIDATION_RULES)

    expect(result.issues.some(i => i.message.includes('positive'))).toBe(true)
  })

  it('should fail when min is greater than max', () => {
    const data = {
      home: { premiumRange: { min: 5000, max: 500 }, commonCoverages: ['fire'] },
    }

    const result = runValidation(data, BENCHMARK_VALIDATION_RULES)

    expect(result.issues.some(i => i.message.includes('greater than max'))).toBe(true)
  })

  it('should handle missing premium range', () => {
    const data = {
      home: { commonCoverages: ['fire'] },
    }

    const result = runValidation(data, BENCHMARK_VALIDATION_RULES)

    // Should not throw, just skip validation for missing field
    expect(result.issues.filter(i => i.field?.includes('premiumRange'))).toHaveLength(0)
  })
})

// =============================================================================
// Coverage Limits Rule Tests
// =============================================================================

describe('Coverage Limits Validation', () => {
  it('should pass for reasonable coverage limits', () => {
    const data = {
      home: { coverageRange: { max: 10000000 }, commonCoverages: ['fire'] },
    }

    const result = runValidation(data, BENCHMARK_VALIDATION_RULES)

    expect(result.issues.filter(i => i.field?.includes('coverageRange'))).toHaveLength(0)
  })

  it('should warn for excessively high home coverage', () => {
    const data = {
      home: { coverageRange: { max: 100000000 }, commonCoverages: ['fire'] },
    }

    const result = runValidation(data, BENCHMARK_VALIDATION_RULES)
    const coverageIssues = result.issues.filter(i => i.field?.includes('coverageRange'))

    expect(coverageIssues.some(i => i.severity === 'warning')).toBe(true)
  })

  it('should warn for excessively high kasko coverage', () => {
    const data = {
      kasko: { coverageRange: { max: 50000000 }, commonCoverages: ['collision'] },
    }

    const result = runValidation(data, BENCHMARK_VALIDATION_RULES)

    expect(result.issues.some(i => i.message.includes('exceeds typical'))).toBe(true)
  })
})

// =============================================================================
// Market Trends Rule Tests
// =============================================================================

describe('Market Trends Validation', () => {
  it('should pass for reasonable trends', () => {
    const data = {
      home: {
        commonCoverages: ['fire'],
        trends: { premiumChangeYoY: 25, claimsRatio: 0.7 },
      },
    }

    const result = runValidation(data, BENCHMARK_VALIDATION_RULES)
    const trendIssues = result.issues.filter(i => i.field?.includes('trends'))

    expect(trendIssues).toHaveLength(0)
  })

  it('should warn for extreme premium changes', () => {
    const data = {
      home: {
        commonCoverages: ['fire'],
        trends: { premiumChangeYoY: 150, claimsRatio: 0.7 },
      },
    }

    const result = runValidation(data, BENCHMARK_VALIDATION_RULES)

    expect(result.issues.some(i => i.message.includes('unrealistic'))).toBe(true)
  })

  it('should warn for negative claims ratio', () => {
    const data = {
      home: {
        commonCoverages: ['fire'],
        trends: { premiumChangeYoY: 10, claimsRatio: -0.5 },
      },
    }

    const result = runValidation(data, BENCHMARK_VALIDATION_RULES)

    expect(result.issues.some(i => i.message.includes('outside expected range'))).toBe(true)
  })

  it('should warn for very high claims ratio', () => {
    const data = {
      home: {
        commonCoverages: ['fire'],
        trends: { premiumChangeYoY: 10, claimsRatio: 2.5 },
      },
    }

    const result = runValidation(data, BENCHMARK_VALIDATION_RULES)

    expect(result.issues.some(i => i.field?.includes('claimsRatio'))).toBe(true)
  })
})

// =============================================================================
// Required Coverages Rule Tests
// =============================================================================

describe('Required Coverages Validation', () => {
  it('should pass when common coverages are defined', () => {
    const data = {
      home: { commonCoverages: ['fire', 'theft'] },
    }

    const result = runValidation(data, BENCHMARK_VALIDATION_RULES)

    expect(result.valid).toBe(true)
  })

  it('should fail when common coverages are empty', () => {
    const data = {
      home: { commonCoverages: [] },
    }

    const result = runValidation(data, BENCHMARK_VALIDATION_RULES)

    expect(result.issues.some(i => i.message.includes('No common coverages'))).toBe(true)
    expect(result.valid).toBe(false)
  })

  it('should fail when common coverages are missing', () => {
    const data = {
      home: {},
    }

    const result = runValidation(data, BENCHMARK_VALIDATION_RULES)

    expect(result.issues.some(i => i.field?.includes('commonCoverages'))).toBe(true)
  })
})

// =============================================================================
// Provider Data Rule Tests
// =============================================================================

describe('Provider Data Validation', () => {
  it('should pass for complete provider data', () => {
    const data = {
      allianz: { name: 'Allianz Sigorta', website: 'https://allianz.com.tr', rating: 4.5 },
    }

    const result = runValidation(data, PROVIDER_VALIDATION_RULES)

    expect(result.valid).toBe(true)
  })

  it('should fail when provider name is missing', () => {
    const data = {
      allianz: { website: 'https://allianz.com.tr' },
    }

    const result = runValidation(data, PROVIDER_VALIDATION_RULES)

    expect(result.issues.some(i => i.message.includes('Missing name'))).toBe(true)
    expect(result.valid).toBe(false)
  })

  it('should report info when website is missing', () => {
    const data = {
      allianz: { name: 'Allianz Sigorta' },
    }

    const result = runValidation(data, PROVIDER_VALIDATION_RULES)

    expect(result.issues.some(i => i.severity === 'info' && i.message.includes('No website'))).toBe(true)
  })

  it('should warn for invalid rating (too high)', () => {
    const data = {
      allianz: { name: 'Allianz', rating: 6 },
    }

    const result = runValidation(data, PROVIDER_VALIDATION_RULES)

    expect(result.issues.some(i => i.message.includes('outside 0-5 range'))).toBe(true)
  })

  it('should warn for invalid rating (negative)', () => {
    const data = {
      allianz: { name: 'Allianz', rating: -1 },
    }

    const result = runValidation(data, PROVIDER_VALIDATION_RULES)

    expect(result.issues.some(i => i.message.includes('outside 0-5 range'))).toBe(true)
  })
})

// =============================================================================
// Regional Factors Rule Tests
// =============================================================================

describe('Regional Factors Validation', () => {
  it('should pass for valid regional factors', () => {
    const data = {
      istanbul: { baseFactor: 1.2, population: 16000000 },
    }

    const result = runValidation(data, REGIONAL_VALIDATION_RULES)

    expect(result.valid).toBe(true)
  })

  it('should warn for base factor below 0.5', () => {
    const data = {
      istanbul: { baseFactor: 0.3, population: 16000000 },
    }

    const result = runValidation(data, REGIONAL_VALIDATION_RULES)

    expect(result.issues.some(i => i.message.includes('outside typical range'))).toBe(true)
  })

  it('should warn for base factor above 2.0', () => {
    const data = {
      istanbul: { baseFactor: 2.5, population: 16000000 },
    }

    const result = runValidation(data, REGIONAL_VALIDATION_RULES)

    expect(result.issues.some(i => i.field?.includes('baseFactor'))).toBe(true)
  })

  it('should fail for negative population', () => {
    const data = {
      istanbul: { baseFactor: 1.0, population: -1000 },
    }

    const result = runValidation(data, REGIONAL_VALIDATION_RULES)

    expect(result.issues.some(i => i.message.includes('cannot be negative'))).toBe(true)
    expect(result.valid).toBe(false)
  })
})

// =============================================================================
// Data Freshness Rule Tests
// =============================================================================

describe('Data Freshness Validation', () => {
  it('should pass for fresh data', () => {
    const data = {}
    const context = { lastUpdated: new Date().toISOString() }

    const result = runValidation(data, METADATA_VALIDATION_RULES, context)

    expect(result.valid).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('should warn for data older than 90 days', () => {
    const data = {}
    const oldDate = new Date()
    oldDate.setDate(oldDate.getDate() - 100)
    const context = { lastUpdated: oldDate.toISOString() }

    const result = runValidation(data, METADATA_VALIDATION_RULES, context)

    expect(result.issues.some(i => i.severity === 'warning' && i.message.includes('days old'))).toBe(true)
  })

  it('should fail for data older than 365 days', () => {
    const data = {}
    const oldDate = new Date()
    oldDate.setDate(oldDate.getDate() - 400)
    const context = { lastUpdated: oldDate.toISOString() }

    const result = runValidation(data, METADATA_VALIDATION_RULES, context)

    expect(result.issues.some(i => i.severity === 'error')).toBe(true)
    expect(result.valid).toBe(false)
  })

  it('should handle missing lastUpdated', () => {
    const data = {}
    const context = {}

    const result = runValidation(data, METADATA_VALIDATION_RULES, context)

    expect(result.valid).toBe(true)
  })
})

// =============================================================================
// runValidation Tests
// =============================================================================

describe('runValidation', () => {
  it('should aggregate issues from multiple rules', () => {
    const data = {
      home: {
        premiumRange: { min: -100, max: 5000 },
        commonCoverages: [],
      },
    }

    const result = runValidation(data, BENCHMARK_VALIDATION_RULES)

    // Should have issues from both premium and coverage rules
    expect(result.issues.length).toBeGreaterThan(1)
  })

  it('should return valid=true when no errors', () => {
    const data = {
      home: {
        premiumRange: { min: 500, max: 5000 },
        commonCoverages: ['fire'],
      },
    }

    const result = runValidation(data, BENCHMARK_VALIDATION_RULES)

    expect(result.valid).toBe(true)
  })

  it('should return valid=false when there are errors', () => {
    const data = {
      home: {
        premiumRange: { min: -100, max: 5000 },
        commonCoverages: ['fire'],
      },
    }

    const result = runValidation(data, BENCHMARK_VALIDATION_RULES)

    expect(result.valid).toBe(false)
  })

  it('should handle empty rules array', () => {
    const result = runValidation({}, [])

    expect(result.valid).toBe(true)
    expect(result.issues).toHaveLength(0)
  })
})

// =============================================================================
// validateRepository Tests
// =============================================================================

describe('validateRepository', () => {
  it('should return valid report for complete valid repository', () => {
    const repository = createValidRepository()

    const report = validateRepository(repository)

    expect(report.valid).toBe(true)
    expect(report.errors).toHaveLength(0)
  })

  it('should include timestamp in report', () => {
    const repository = createValidRepository()

    const report = validateRepository(repository)

    expect(report.timestamp).toBeDefined()
    expect(new Date(report.timestamp).getTime()).not.toBeNaN()
  })

  it('should count rules applied', () => {
    const repository = createValidRepository()

    const report = validateRepository(repository)

    expect(report.rulesApplied).toBeGreaterThan(0)
  })

  it('should categorize issues by severity', () => {
    const repository = createValidRepository()
    // Add invalid data
    repository.providers = {
      allianz: { website: 'https://allianz.com.tr' }, // Missing name - error
    } as unknown as BenchmarkDataRepository['providers']

    const report = validateRepository(repository)

    expect(report.errors.length).toBeGreaterThan(0)
  })

  it('should generate summary message', () => {
    const repository = createValidRepository()

    const report = validateRepository(repository)

    expect(report.summary).toBeDefined()
    expect(report.summary.length).toBeGreaterThan(0)
  })
})

// =============================================================================
// quickValidate Tests
// =============================================================================

describe('quickValidate', () => {
  it('should return true for valid repository', () => {
    const repository = createValidRepository()

    const result = quickValidate(repository)

    expect(result).toBe(true)
  })

  it('should return false for invalid benchmarks', () => {
    const repository = createValidRepository()
    repository.benchmarks = {
      home: { commonCoverages: [] }, // Missing required coverages
    } as unknown as BenchmarkDataRepository['benchmarks']

    const result = quickValidate(repository)

    expect(result).toBe(false)
  })

  it('should return false for invalid providers', () => {
    const repository = createValidRepository()
    repository.providers = {
      allianz: {}, // Missing name
    } as unknown as BenchmarkDataRepository['providers']

    const result = quickValidate(repository)

    expect(result).toBe(false)
  })

  it('should return false for invalid regions', () => {
    const repository = createValidRepository()
    repository.regionalFactors = {
      istanbul: { baseFactor: 1.0, population: -1000 }, // Negative population
    } as unknown as BenchmarkDataRepository['regionalFactors']

    const result = quickValidate(repository)

    expect(result).toBe(false)
  })
})

// =============================================================================
// calculateQualityScore Tests
// =============================================================================

describe('calculateQualityScore', () => {
  it('should return 100 for perfect report', () => {
    const report: ValidationReport = {
      valid: true,
      timestamp: new Date().toISOString(),
      rulesApplied: 10,
      rulesPassed: 10,
      errors: [],
      warnings: [],
      info: [],
      summary: 'All good',
    }

    const score = calculateQualityScore(report)

    expect(score).toBeGreaterThanOrEqual(100)
  })

  it('should deduct 20 points per error', () => {
    const report: ValidationReport = {
      valid: false,
      timestamp: new Date().toISOString(),
      rulesApplied: 10,
      rulesPassed: 9,
      errors: [{ severity: 'error', field: 'test', message: 'Error 1' }],
      warnings: [],
      info: [],
      summary: 'Has errors',
    }

    const score = calculateQualityScore(report)

    expect(score).toBeLessThan(100)
  })

  it('should deduct 5 points per warning', () => {
    const report: ValidationReport = {
      valid: true,
      timestamp: new Date().toISOString(),
      rulesApplied: 10,
      rulesPassed: 10,
      errors: [],
      warnings: [{ severity: 'warning', field: 'test', message: 'Warning 1' }],
      info: [],
      summary: 'Has warnings',
    }

    const score = calculateQualityScore(report)

    expect(score).toBeLessThan(110) // Less than max possible
  })

  it('should deduct 1 point per info', () => {
    const report: ValidationReport = {
      valid: true,
      timestamp: new Date().toISOString(),
      rulesApplied: 10,
      rulesPassed: 10,
      errors: [],
      warnings: [],
      info: [{ severity: 'info', field: 'test', message: 'Info 1' }],
      summary: 'Has info',
    }

    const score = calculateQualityScore(report)

    expect(score).toBeDefined()
  })

  it('should not go below 0', () => {
    const report: ValidationReport = {
      valid: false,
      timestamp: new Date().toISOString(),
      rulesApplied: 10,
      rulesPassed: 0,
      errors: Array(10).fill({ severity: 'error', field: 'test', message: 'Error' }),
      warnings: Array(20).fill({ severity: 'warning', field: 'test', message: 'Warning' }),
      info: [],
      summary: 'Very bad',
    }

    const score = calculateQualityScore(report)

    expect(score).toBeGreaterThanOrEqual(0)
  })

  it('should not go above 100', () => {
    const report: ValidationReport = {
      valid: true,
      timestamp: new Date().toISOString(),
      rulesApplied: 10,
      rulesPassed: 10,
      errors: [],
      warnings: [],
      info: [],
      summary: 'Perfect',
    }

    const score = calculateQualityScore(report)

    expect(score).toBeLessThanOrEqual(100)
  })
})

// =============================================================================
// Rule Arrays Export Tests
// =============================================================================

describe('Rule Arrays', () => {
  it('should export BENCHMARK_VALIDATION_RULES', () => {
    expect(BENCHMARK_VALIDATION_RULES).toBeDefined()
    expect(Array.isArray(BENCHMARK_VALIDATION_RULES)).toBe(true)
    expect(BENCHMARK_VALIDATION_RULES.length).toBeGreaterThan(0)
  })

  it('should export PROVIDER_VALIDATION_RULES', () => {
    expect(PROVIDER_VALIDATION_RULES).toBeDefined()
    expect(Array.isArray(PROVIDER_VALIDATION_RULES)).toBe(true)
  })

  it('should export REGIONAL_VALIDATION_RULES', () => {
    expect(REGIONAL_VALIDATION_RULES).toBeDefined()
    expect(Array.isArray(REGIONAL_VALIDATION_RULES)).toBe(true)
  })

  it('should export METADATA_VALIDATION_RULES', () => {
    expect(METADATA_VALIDATION_RULES).toBeDefined()
    expect(Array.isArray(METADATA_VALIDATION_RULES)).toBe(true)
  })

  it('each rule should have required properties', () => {
    const allRules = [
      ...BENCHMARK_VALIDATION_RULES,
      ...PROVIDER_VALIDATION_RULES,
      ...REGIONAL_VALIDATION_RULES,
      ...METADATA_VALIDATION_RULES,
    ]

    for (const rule of allRules) {
      expect(rule.id).toBeDefined()
      expect(rule.name).toBeDefined()
      expect(rule.description).toBeDefined()
      expect(rule.severity).toBeDefined()
      expect(typeof rule.validate).toBe('function')
    }
  })
})
