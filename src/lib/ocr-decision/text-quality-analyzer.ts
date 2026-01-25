/**
 * Text Quality Analyzer
 *
 * Analyzes text quality using locale and policy-specific configurations
 * to determine if OCR is needed.
 */

import type {
  LocaleConfig,
  PolicyTypeConfig,
  TextQualityAnalysis,
} from './types'
import type { ConfigurationManager } from './configuration-manager'

export class TextQualityAnalyzer {
  private configManager: ConfigurationManager

  constructor(configManager: ConfigurationManager) {
    this.configManager = configManager
  }

  /**
   * Analyze text quality based on configuration
   */
  analyze(
    text: string,
    localeCode: string,
    policyConfig: PolicyTypeConfig
  ): TextQualityAnalysis {
    const localeConfig = this.configManager.getLocale(localeCode)
    const textLower = text.toLowerCase()

    // Get insurance terminology for this locale
    const allTerms = this.configManager.getInsuranceTerminology(localeCode)

    // Check for encoding issues
    const { hasIssues: encodingIssues, issues: encodingIssuesFound } =
      this.checkEncodingIssues(text, localeConfig)

    // Term matching
    const foundTerms = allTerms.filter(term => textLower.includes(term.toLowerCase()))
    const qualityScore = allTerms.length > 0 ? foundTerms.length / allTerms.length : 0.5

    // Get threshold from policy config or use defaults
    const minQuality = policyConfig.quality_thresholds?.min_quality_score || 0.30

    // Additional quality checks
    const additionalChecks = this.performAdditionalChecks(text)

    // Determine recommendation
    let recommendation: 'proceed' | 'consider_ocr' | 'require_ocr' = 'proceed'

    if (qualityScore < minQuality || encodingIssues) {
      recommendation = 'consider_ocr'
    }

    if (qualityScore < minQuality * 0.5 || additionalChecks.garbageRatio > 0.15) {
      recommendation = 'require_ocr'
    }

    return {
      quality_score: Math.round(qualityScore * 100) / 100,
      terms_found: foundTerms.length,
      terms_checked: allTerms.length,
      found_terms_sample: foundTerms.slice(0, 10),
      encoding_issues: encodingIssues,
      encoding_issues_found: encodingIssuesFound,
      locale_used: localeCode,
      min_quality_threshold: minQuality,
      recommendation,
    }
  }

  /**
   * Check for encoding issues in text
   */
  private checkEncodingIssues(
    text: string,
    localeConfig: LocaleConfig | { locale_code: string }
  ): { hasIssues: boolean; issues: string[] } {
    const issues: string[] = []

    if ('encoding_validation' in localeConfig) {
      const garbagePatterns = localeConfig.encoding_validation.garbage_patterns || []

      for (const pattern of garbagePatterns) {
        try {
          const regex = new RegExp(pattern, 'gi')
          const matches = text.match(regex)
          if (matches && matches.length > 0) {
            issues.push(`Found ${matches.length} matches of garbage pattern: ${pattern}`)
          }
        } catch {
          // Invalid regex, skip
        }
      }
    }

    // Check for common encoding issues
    const commonIssues = [
      { pattern: /\ufffd{2,}/g, name: 'Unicode replacement characters' },
      { pattern: /[\x00-\x08\x0b\x0c\x0e-\x1f]{3,}/g, name: 'Control characters' },
    ]

    for (const { pattern, name } of commonIssues) {
      const matches = text.match(pattern)
      if (matches && matches.length > 0) {
        issues.push(`Found ${matches.length} occurrences of ${name}`)
      }
    }

    return {
      hasIssues: issues.length > 0,
      issues,
    }
  }

  /**
   * Perform additional quality checks
   */
  private performAdditionalChecks(text: string): {
    wordLengthAverage: number
    garbageRatio: number
    alphanumericRatio: number
    lineCount: number
    avgCharsPerLine: number
  } {
    // Note: Could use configManager.getOCRSettings().quality_checks to customize thresholds if needed
    // Currently using inline calculations that don't require thresholds

    // Word length analysis
    const words = text.split(/\s+/).filter(w => w.length > 0)
    const wordLengthAverage = words.length > 0
      ? words.reduce((sum, w) => sum + w.length, 0) / words.length
      : 0

    // Garbage character ratio (non-printable, weird symbols)
    const garbageChars = (text.match(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd�]/g) || []).length
    const garbageRatio = text.length > 0 ? garbageChars / text.length : 0

    // Alphanumeric ratio
    const alphanumericChars = (text.match(/[a-zA-Z0-9\u00C0-\u024F\u0400-\u04FF]/g) || []).length
    const alphanumericRatio = text.length > 0 ? alphanumericChars / text.length : 0

    // Line analysis
    const lines = text.split('\n')
    const lineCount = lines.length
    const avgCharsPerLine = lineCount > 0
      ? text.length / lineCount
      : 0

    return {
      wordLengthAverage,
      garbageRatio,
      alphanumericRatio,
      lineCount,
      avgCharsPerLine,
    }
  }

  /**
   * Get detailed quality metrics
   */
  getDetailedMetrics(text: string, localeCode: string): {
    basic: {
      totalChars: number
      totalWords: number
      totalLines: number
      avgWordLength: number
      avgLineLength: number
    }
    quality: {
      alphanumericRatio: number
      whitespaceRatio: number
      punctuationRatio: number
      specialCharRatio: number
      garbageCharRatio: number
    }
    insurance: {
      termsFound: string[]
      termsMissing: string[]
      termCoverage: number
    }
    encoding: {
      hasIssues: boolean
      issues: string[]
    }
  } {
    const localeConfig = this.configManager.getLocale(localeCode)
    const textLower = text.toLowerCase()

    // Basic metrics
    const words = text.split(/\s+/).filter(w => w.length > 0)
    const lines = text.split('\n')

    // Quality metrics
    const alphanumeric = (text.match(/[a-zA-Z0-9\u00C0-\u024F\u0400-\u04FF]/g) || []).length
    const whitespace = (text.match(/\s/g) || []).length
    const punctuation = (text.match(/[.,;:!?'"()\[\]{}]/g) || []).length
    const special = (text.match(/[^a-zA-Z0-9\s\u00C0-\u024F]/g) || []).length
    const garbage = (text.match(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/g) || []).length

    const total = text.length || 1

    // Insurance terminology
    const allTerms = this.configManager.getInsuranceTerminology(localeCode)
    const foundTerms = allTerms.filter(term => textLower.includes(term.toLowerCase()))
    const missingTerms = allTerms.filter(term => !textLower.includes(term.toLowerCase()))

    // Encoding check
    const encodingResult = this.checkEncodingIssues(text, localeConfig)

    return {
      basic: {
        totalChars: text.length,
        totalWords: words.length,
        totalLines: lines.length,
        avgWordLength: words.length > 0
          ? Math.round((words.reduce((s, w) => s + w.length, 0) / words.length) * 10) / 10
          : 0,
        avgLineLength: lines.length > 0
          ? Math.round(text.length / lines.length)
          : 0,
      },
      quality: {
        alphanumericRatio: Math.round((alphanumeric / total) * 100) / 100,
        whitespaceRatio: Math.round((whitespace / total) * 100) / 100,
        punctuationRatio: Math.round((punctuation / total) * 100) / 100,
        specialCharRatio: Math.round((special / total) * 100) / 100,
        garbageCharRatio: Math.round((garbage / total) * 100) / 100,
      },
      insurance: {
        termsFound: foundTerms,
        termsMissing: missingTerms.slice(0, 20), // Limit to avoid huge output
        termCoverage: allTerms.length > 0
          ? Math.round((foundTerms.length / allTerms.length) * 100) / 100
          : 0,
      },
      encoding: encodingResult,
    }
  }

  /**
   * Quick quality check (fast, for initial screening)
   */
  quickCheck(text: string): {
    isLikelyGood: boolean
    score: number
    issues: string[]
  } {
    const issues: string[] = []
    let score = 1.0

    // Check text length
    if (text.length < 100) {
      issues.push('Text too short')
      score -= 0.3
    }

    // Check garbage ratio
    const garbage = (text.match(/[\x00-\x08\x0b\x0c\x0e-\x1f\ufffd]/g) || []).length
    const garbageRatio = garbage / Math.max(text.length, 1)
    if (garbageRatio > 0.05) {
      issues.push(`High garbage character ratio: ${(garbageRatio * 100).toFixed(1)}%`)
      score -= 0.3
    }

    // Check alphanumeric ratio
    const alphanumeric = (text.match(/[a-zA-Z0-9]/g) || []).length
    const alphaRatio = alphanumeric / Math.max(text.length, 1)
    if (alphaRatio < 0.5) {
      issues.push(`Low alphanumeric ratio: ${(alphaRatio * 100).toFixed(1)}%`)
      score -= 0.2
    }

    // Check for repeated characters (OCR artifact)
    const repeatedPattern = /(.)\1{10,}/g
    const repeated = text.match(repeatedPattern)
    if (repeated && repeated.length > 3) {
      issues.push(`Excessive repeated characters found`)
      score -= 0.2
    }

    return {
      isLikelyGood: score > 0.6,
      score: Math.max(0, Math.min(1, score)),
      issues,
    }
  }
}
