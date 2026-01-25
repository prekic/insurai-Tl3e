/**
 * Language Detector
 *
 * Detects document language using configuration-based term matching
 * and character detection.
 */

import type {
  LocaleConfig,
  LanguageDetectionResult,
  OCRSettings,
} from './types'
import type { ConfigurationManager } from './configuration-manager'

export class LanguageDetector {
  private configManager: ConfigurationManager
  private settings: OCRSettings

  constructor(configManager: ConfigurationManager) {
    this.configManager = configManager
    this.settings = configManager.getOCRSettings()
  }

  /**
   * Detect language from text using configured detection terms
   */
  detect(text: string): LanguageDetectionResult {
    const textLower = text.toLowerCase()
    const sampleSize = this.settings.language_detection.sample_size || 2000
    const sampleText = textLower.substring(0, sampleSize)

    const scores: Record<string, {
      term_score: number
      char_score: number
      combined: number
      term_matches: number
      char_matches: number
    }> = {}

    const availableLocales = this.configManager.getAvailableLocales()

    for (const localeCode of availableLocales) {
      const config = this.configManager.getLocale(localeCode)

      if (!('language_detection' in config)) continue
      const localeConfig = config as LocaleConfig

      const detectionConfig = localeConfig.language_detection
      const sampleTerms = detectionConfig.sample_terms || []
      const specialChars = detectionConfig.special_characters || []

      // Count term matches
      const termMatches = sampleTerms.filter(term =>
        sampleText.includes(term.toLowerCase())
      ).length

      // Check for special characters in full text (not just sample)
      const charMatches = specialChars.filter(char => text.includes(char)).length

      // Calculate scores
      const termScore = sampleTerms.length > 0 ? termMatches / sampleTerms.length : 0
      const charScore = specialChars.length > 0 ? Math.min(charMatches / 5, 1.0) : 0

      // Combined score with term matching weighted more heavily
      const combined = (termScore * 0.7) + (charScore * 0.3)

      scores[localeCode] = {
        term_score: termScore,
        char_score: charScore,
        combined,
        term_matches: termMatches,
        char_matches: charMatches,
      }
    }

    // Find best match
    const sortedLocales = Object.entries(scores)
      .sort(([, a], [, b]) => b.combined - a.combined)

    const minConfidence = this.settings.language_detection.min_confidence

    if (sortedLocales.length > 0 && sortedLocales[0][1].combined >= minConfidence) {
      const [bestLocale, bestScore] = sortedLocales[0]

      // Determine detection method
      let method: 'term_matching' | 'character_detection' | 'fallback' = 'term_matching'
      if (bestScore.term_score === 0 && bestScore.char_score > 0) {
        method = 'character_detection'
      }

      // Get runner-up
      let runnerUp: { locale: string; confidence: number } | undefined
      if (sortedLocales.length > 1) {
        runnerUp = {
          locale: sortedLocales[1][0],
          confidence: sortedLocales[1][1].combined,
        }
      }

      return {
        locale_code: bestLocale,
        confidence: bestScore.combined,
        method,
        all_scores: scores,
        runner_up: runnerUp,
      }
    }

    // Fallback
    const fallbackLocale = this.settings.language_detection.fallback_locale || 'en'

    return {
      locale_code: fallbackLocale,
      confidence: 0,
      method: 'fallback',
      all_scores: scores,
    }
  }

  /**
   * Check if text contains specific language indicators
   */
  hasLanguageIndicators(text: string, localeCode: string): boolean {
    const config = this.configManager.getLocale(localeCode)

    if (!('language_detection' in config)) return false
    const localeConfig = config as LocaleConfig

    const sampleTerms = localeConfig.language_detection.sample_terms || []
    const minMatches = localeConfig.language_detection.min_matches_for_detection || 3

    const textLower = text.toLowerCase()
    const matches = sampleTerms.filter(term =>
      textLower.includes(term.toLowerCase())
    ).length

    return matches >= minMatches
  }

  /**
   * Detect special characters presence for a locale
   */
  detectSpecialCharacters(text: string, localeCode: string): {
    found: string[]
    count: number
    hasIndicators: boolean
  } {
    const config = this.configManager.getLocale(localeCode)

    if (!('language_detection' in config)) {
      return { found: [], count: 0, hasIndicators: false }
    }

    const localeConfig = config as LocaleConfig
    const specialChars = localeConfig.language_detection.special_characters || []

    const found = specialChars.filter(char => text.includes(char))

    return {
      found,
      count: found.length,
      hasIndicators: found.length > 0,
    }
  }

  /**
   * Get detailed language analysis
   */
  getDetailedAnalysis(text: string): {
    detected: LanguageDetectionResult
    term_analysis: Record<string, { found: string[]; missing: string[] }>
    char_analysis: Record<string, { found: string[]; missing: string[] }>
  } {
    const detected = this.detect(text)
    const textLower = text.toLowerCase()

    const termAnalysis: Record<string, { found: string[]; missing: string[] }> = {}
    const charAnalysis: Record<string, { found: string[]; missing: string[] }> = {}

    for (const localeCode of this.configManager.getAvailableLocales()) {
      const config = this.configManager.getLocale(localeCode)

      if (!('language_detection' in config)) continue
      const localeConfig = config as LocaleConfig

      // Term analysis
      const sampleTerms = localeConfig.language_detection.sample_terms || []
      const foundTerms = sampleTerms.filter(term => textLower.includes(term.toLowerCase()))
      const missingTerms = sampleTerms.filter(term => !textLower.includes(term.toLowerCase()))

      termAnalysis[localeCode] = {
        found: foundTerms,
        missing: missingTerms,
      }

      // Character analysis
      const specialChars = localeConfig.language_detection.special_characters || []
      const foundChars = specialChars.filter(char => text.includes(char))
      const missingChars = specialChars.filter(char => !text.includes(char))

      charAnalysis[localeCode] = {
        found: foundChars,
        missing: missingChars,
      }
    }

    return {
      detected,
      term_analysis: termAnalysis,
      char_analysis: charAnalysis,
    }
  }
}
