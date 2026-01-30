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

// Debug logging flag - set to false in production
const DEBUG_LANGUAGE_DETECTION = false

function debugLog(message: string, data?: unknown): void {
  if (DEBUG_LANGUAGE_DETECTION) {
    if (data !== undefined) {
      console.warn(`[LanguageDetector] ${message}`, data)
    } else {
      console.warn(`[LanguageDetector] ${message}`)
    }
  }
}

export class LanguageDetector {
  private configManager: ConfigurationManager
  private settings: OCRSettings

  constructor(configManager: ConfigurationManager) {
    this.configManager = configManager
    this.settings = configManager.getOCRSettings()

    // Verify configuration at construction time
    this.verifyConfiguration()
  }

  /**
   * Verify that language detection configuration is properly loaded
   */
  private verifyConfiguration(): void {
    const availableLocales = this.configManager.getAvailableLocales()
    debugLog(`=== LANGUAGE DETECTOR CONFIGURATION ===`)
    debugLog(`Available locales: ${availableLocales.join(', ')}`)
    debugLog(`Min confidence threshold: ${this.settings.language_detection.min_confidence}`)
    debugLog(`Fallback locale: ${this.settings.language_detection.fallback_locale}`)
    debugLog(`Sample size: ${this.settings.language_detection.sample_size}`)

    // Check Turkish locale specifically
    if (!availableLocales.includes('tr')) {
      console.error('[LanguageDetector] CRITICAL: Turkish locale (tr) not loaded!')
    } else {
      const trConfig = this.configManager.getLocale('tr') as LocaleConfig
      if (trConfig.language_detection) {
        debugLog(`Turkish sample_terms count: ${trConfig.language_detection.sample_terms?.length || 0}`)
        debugLog(`Turkish sample_terms: ${JSON.stringify(trConfig.language_detection.sample_terms?.slice(0, 5))}...`)
        debugLog(`Turkish special_characters count: ${trConfig.language_detection.special_characters?.length || 0}`)
        debugLog(`Turkish special_characters: ${JSON.stringify(trConfig.language_detection.special_characters)}`)
      } else {
        console.error('[LanguageDetector] CRITICAL: Turkish locale missing language_detection config!')
      }
    }

    // Check English locale
    if (!availableLocales.includes('en')) {
      console.error('[LanguageDetector] WARNING: English locale (en) not loaded!')
    }

    debugLog(`=== END CONFIGURATION ===`)
  }

  /**
   * Detect language from text using configured detection terms
   */
  detect(text: string): LanguageDetectionResult {
    debugLog(`=== LANGUAGE DETECTION START ===`)
    debugLog(`Input text length: ${text.length} chars`)
    debugLog(`Text sample (first 300 chars): "${text.substring(0, 300).replace(/\n/g, ' ')}"`)

    const textLower = text.toLowerCase()
    const sampleSize = this.settings.language_detection.sample_size || 2000
    const sampleText = textLower.substring(0, sampleSize)

    debugLog(`Sample size: ${sampleSize}, actual sample length: ${sampleText.length}`)

    const scores: Record<string, {
      term_score: number
      char_score: number
      combined: number
      term_matches: number
      char_matches: number
      matched_terms?: string[]
      matched_chars?: string[]
    }> = {}

    const availableLocales = this.configManager.getAvailableLocales()
    debugLog(`Testing ${availableLocales.length} locales: ${availableLocales.join(', ')}`)

    for (const localeCode of availableLocales) {
      const config = this.configManager.getLocale(localeCode)

      if (!('language_detection' in config)) {
        debugLog(`  Locale '${localeCode}': SKIPPED (no language_detection config)`)
        continue
      }
      const localeConfig = config as LocaleConfig

      const detectionConfig = localeConfig.language_detection
      const sampleTerms = detectionConfig.sample_terms || []
      const specialChars = detectionConfig.special_characters || []

      debugLog(`  Testing locale '${localeCode}' with ${sampleTerms.length} terms and ${specialChars.length} special chars`)

      // Count term matches - with detailed logging
      const matchedTerms: string[] = []
      for (const term of sampleTerms) {
        const termLower = term.toLowerCase()
        if (sampleText.includes(termLower)) {
          matchedTerms.push(term)
        }
      }
      const termMatches = matchedTerms.length

      debugLog(`    Terms matched (${termMatches}/${sampleTerms.length}): ${JSON.stringify(matchedTerms)}`)

      // Check for special characters in full text (not just sample)
      const matchedChars: string[] = []
      for (const char of specialChars) {
        if (text.includes(char)) {
          matchedChars.push(char)
        }
      }
      const charMatches = matchedChars.length

      debugLog(`    Special chars matched (${charMatches}/${specialChars.length}): ${JSON.stringify(matchedChars)}`)

      // Calculate scores
      const termScore = sampleTerms.length > 0 ? termMatches / sampleTerms.length : 0
      const charScore = specialChars.length > 0 ? Math.min(charMatches / 5, 1.0) : 0

      // Combined score with term matching weighted more heavily
      const combined = (termScore * 0.7) + (charScore * 0.3)

      debugLog(`    Scores: term=${termScore.toFixed(3)}, char=${charScore.toFixed(3)}, combined=${combined.toFixed(3)}`)

      scores[localeCode] = {
        term_score: termScore,
        char_score: charScore,
        combined,
        term_matches: termMatches,
        char_matches: charMatches,
        matched_terms: matchedTerms,
        matched_chars: matchedChars,
      }
    }

    // Find best match
    const sortedLocales = Object.entries(scores)
      .sort(([, a], [, b]) => b.combined - a.combined)

    const minConfidence = this.settings.language_detection.min_confidence

    debugLog(`Min confidence threshold: ${minConfidence}`)
    debugLog(`Sorted results:`)
    for (const [locale, score] of sortedLocales.slice(0, 3)) {
      debugLog(`  ${locale}: ${score.combined.toFixed(3)} (terms: ${score.term_matches}, chars: ${score.char_matches})`)
    }

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

      debugLog(`=== RESULT: ${bestLocale} (confidence: ${bestScore.combined.toFixed(3)}, method: ${method}) ===`)
      debugLog(`  Matched terms: ${JSON.stringify(bestScore.matched_terms)}`)
      debugLog(`  Matched chars: ${JSON.stringify(bestScore.matched_chars)}`)

      return {
        locale_code: bestLocale,
        confidence: bestScore.combined,
        method,
        matched_terms: bestScore.matched_terms,
        matched_chars: bestScore.matched_chars,
        all_scores: scores,
        runner_up: runnerUp,
      }
    }

    // Fallback - confidence below threshold
    const fallbackLocale = this.settings.language_detection.fallback_locale || 'en'
    const bestScore = sortedLocales[0]?.[1]

    debugLog(`=== RESULT: FALLBACK to '${fallbackLocale}' (best score ${bestScore?.combined.toFixed(3) || 0} < threshold ${minConfidence}) ===`)
    if (bestScore) {
      debugLog(`  Best was '${sortedLocales[0][0]}' with terms: ${JSON.stringify(bestScore.matched_terms)}`)
    }

    return {
      locale_code: fallbackLocale,
      confidence: 0,
      method: 'fallback',
      matched_terms: bestScore?.matched_terms,
      matched_chars: bestScore?.matched_chars,
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
