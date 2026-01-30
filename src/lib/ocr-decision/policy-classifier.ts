/**
 * Policy Type Classifier
 *
 * Classifies documents into policy types using configuration-based
 * term detection with multi-language support.
 */

import type {
  PolicyTypeClassificationResult,
  OCRSettings,
} from './types'
import type { ConfigurationManager } from './configuration-manager'

// Debug logging flag - set to false in production
const DEBUG_POLICY_CLASSIFICATION = false

function debugLog(message: string, data?: unknown): void {
  if (DEBUG_POLICY_CLASSIFICATION) {
    if (data !== undefined) {
      console.warn(`[PolicyClassifier] ${message}`, data)
    } else {
      console.warn(`[PolicyClassifier] ${message}`)
    }
  }
}

export class PolicyTypeClassifier {
  private configManager: ConfigurationManager
  private settings: OCRSettings

  constructor(configManager: ConfigurationManager) {
    this.configManager = configManager
    this.settings = configManager.getOCRSettings()

    // Verify configuration at construction time
    this.verifyConfiguration()
  }

  /**
   * Verify that policy classification configuration is properly loaded
   */
  private verifyConfiguration(): void {
    const availablePolicyTypes = this.configManager.getAvailablePolicyTypes()
    debugLog(`=== POLICY CLASSIFIER CONFIGURATION ===`)
    debugLog(`Available policy types: ${availablePolicyTypes.join(', ')}`)
    debugLog(`Fallback type: ${this.settings.policy_type_detection.fallback_type}`)
    debugLog(`Min confidence: ${this.settings.policy_type_detection.min_confidence}`)

    // Check motor_kasko specifically
    if (!availablePolicyTypes.includes('motor_kasko')) {
      console.error('[PolicyClassifier] CRITICAL: Kasko policy type (motor_kasko) not loaded!')
    } else {
      const kaskoConfig = this.configManager.getPolicyConfig('motor_kasko')
      if (kaskoConfig.classification) {
        const trTerms = kaskoConfig.classification.detection_terms?.tr || []
        debugLog(`Kasko TR detection terms (${trTerms.length}): ${JSON.stringify(trTerms)}`)
        debugLog(`Kasko confidence threshold: ${kaskoConfig.classification.confidence_threshold}`)
      } else {
        console.error('[PolicyClassifier] CRITICAL: Kasko policy missing classification config!')
      }
    }

    debugLog(`=== END CONFIGURATION ===`)
  }

  /**
   * Classify document into policy type
   */
  classify(text: string, localeCode: string): PolicyTypeClassificationResult {
    debugLog(`=== POLICY TYPE CLASSIFICATION START ===`)
    debugLog(`Input text length: ${text.length} chars`)
    debugLog(`Detected language/locale: ${localeCode}`)
    debugLog(`Text sample (first 300 chars): "${text.substring(0, 300).replace(/\n/g, ' ')}"`)

    const textLower = text.toLowerCase()
    const scores: Record<string, {
      score: number
      excluded: boolean
      matches: string[]
      threshold?: number
    }> = {}

    const availablePolicyTypes = this.configManager.getAvailablePolicyTypes()
    debugLog(`Testing ${availablePolicyTypes.length} policy types: ${availablePolicyTypes.join(', ')}`)

    for (const policyId of availablePolicyTypes) {
      const config = this.configManager.getPolicyConfig(policyId)
      const classification = config.classification

      // Skip if no classification or if this is a fallback config
      if (!classification || classification.is_fallback) {
        debugLog(`  Policy '${policyId}': SKIPPED (no classification or is_fallback)`)
        continue
      }

      const detectionTerms = classification.detection_terms
      const excludeTerms = classification.exclude_if_contains || {}
      const threshold = classification.confidence_threshold

      // Get locale-specific terms, fall back to English or any available
      const terms = this.getTermsForLocale(detectionTerms, localeCode)
      const exclude = this.getTermsForLocale(excludeTerms, localeCode)

      debugLog(`  Testing policy '${policyId}' (threshold: ${threshold})`)
      debugLog(`    Detection terms for '${localeCode}': ${JSON.stringify(terms)}`)

      // Check exclusions first
      const excludeMatches = exclude.filter(term => textLower.includes(term.toLowerCase()))
      const isExcluded = excludeMatches.length > 0

      if (isExcluded) {
        debugLog(`    EXCLUDED by terms: ${JSON.stringify(excludeMatches)}`)
        scores[policyId] = {
          score: 0,
          excluded: true,
          matches: [],
          threshold,
        }
        continue
      }

      // Count matches - with detailed logging
      const matches: string[] = []
      for (const term of terms) {
        const termLower = term.toLowerCase()
        if (textLower.includes(termLower)) {
          matches.push(term)
        }
      }
      const score = terms.length > 0 ? matches.length / terms.length : 0

      debugLog(`    Matched (${matches.length}/${terms.length}): ${JSON.stringify(matches)}`)
      debugLog(`    Score: ${score.toFixed(3)} (threshold: ${threshold})`)

      scores[policyId] = {
        score,
        excluded: false,
        matches,
        threshold,
      }
    }

    // Find best match above threshold
    const validMatches = Object.entries(scores)
      .filter(([, v]) => !v.excluded && v.score >= (v.threshold || 0.5))
      .sort(([, a], [, b]) => b.score - a.score)

    debugLog(`Valid matches above threshold: ${validMatches.length}`)
    for (const [policyId, score] of validMatches.slice(0, 3)) {
      debugLog(`  ${policyId}: ${score.score.toFixed(3)} (matches: ${score.matches.join(', ')})`)
    }

    if (validMatches.length > 0) {
      const [bestTypeId, bestScore] = validMatches[0]
      const config = this.configManager.getPolicyConfig(bestTypeId)
      const configPath = `config/policy_types/${config.category}/${bestTypeId}.json`

      debugLog(`=== RESULT: ${bestTypeId} (confidence: ${bestScore.score.toFixed(3)}) ===`)
      debugLog(`  Matched terms: ${JSON.stringify(bestScore.matches)}`)
      debugLog(`  Config path: ${configPath}`)

      return {
        policy_type_id: bestTypeId,
        policy_type_name: config.policy_type_name,
        category: config.category,
        confidence: bestScore.score,
        matched_terms: bestScore.matches,
        config_path: configPath,
        all_scores: scores,
      }
    }

    // Fallback to generic - find best score for debugging
    const allScoresSorted = Object.entries(scores)
      .filter(([, v]) => !v.excluded)
      .sort(([, a], [, b]) => b.score - a.score)

    debugLog(`=== RESULT: FALLBACK to '_generic' ===`)
    if (allScoresSorted.length > 0) {
      const [bestId, bestScore] = allScoresSorted[0]
      debugLog(`  Best match was '${bestId}' with score ${bestScore.score.toFixed(3)} (below threshold ${bestScore.threshold})`)
      debugLog(`  Matched terms: ${JSON.stringify(bestScore.matches)}`)
    } else {
      debugLog(`  No policy types had any matches`)
    }

    const fallbackId = this.settings.policy_type_detection.fallback_type || '_generic'
    const fallbackConfig = this.configManager.getPolicyConfig(fallbackId)
    const fallbackConfigPath = `config/policy_types/${fallbackConfig.category}/${fallbackId}.json`

    return {
      policy_type_id: fallbackId,
      policy_type_name: fallbackConfig.policy_type_name,
      category: fallbackConfig.category,
      confidence: 0,
      matched_terms: [],
      config_path: fallbackConfigPath,
      all_scores: scores,
    }
  }

  /**
   * Get terms for a specific locale with fallback
   */
  private getTermsForLocale(
    termsMap: Record<string, string[]>,
    localeCode: string
  ): string[] {
    // Try exact locale
    if (termsMap[localeCode]?.length) {
      return termsMap[localeCode]
    }

    // Try English fallback
    if (termsMap['en']?.length) {
      return termsMap['en']
    }

    // Try first available
    const firstAvailable = Object.values(termsMap).find(terms => terms.length > 0)
    return firstAvailable || []
  }

  /**
   * Classify with detailed analysis
   */
  classifyWithDetails(text: string, localeCode: string): {
    result: PolicyTypeClassificationResult
    analysis: {
      all_detections: Array<{
        policy_type: string
        score: number
        matched_terms: string[]
        excluded: boolean
        exclusion_terms?: string[]
      }>
      text_sample: string
      locale_used: string
    }
  } {
    const result = this.classify(text, localeCode)
    const textLower = text.toLowerCase()

    const allDetections: Array<{
      policy_type: string
      score: number
      matched_terms: string[]
      excluded: boolean
      exclusion_terms?: string[]
    }> = []

    for (const policyId of this.configManager.getAvailablePolicyTypes()) {
      const config = this.configManager.getPolicyConfig(policyId)
      const classification = config.classification

      if (!classification || classification.is_fallback) continue

      const terms = this.getTermsForLocale(classification.detection_terms, localeCode)
      const exclude = this.getTermsForLocale(classification.exclude_if_contains || {}, localeCode)

      const matches = terms.filter(term => textLower.includes(term.toLowerCase()))
      const excludeMatches = exclude.filter(term => textLower.includes(term.toLowerCase()))

      allDetections.push({
        policy_type: policyId,
        score: terms.length > 0 ? matches.length / terms.length : 0,
        matched_terms: matches,
        excluded: excludeMatches.length > 0,
        exclusion_terms: excludeMatches.length > 0 ? excludeMatches : undefined,
      })
    }

    // Sort by score descending
    allDetections.sort((a, b) => b.score - a.score)

    return {
      result,
      analysis: {
        all_detections: allDetections,
        text_sample: text.substring(0, 500),
        locale_used: localeCode,
      },
    }
  }

  /**
   * Check if document matches a specific policy type
   */
  matchesPolicyType(
    text: string,
    policyTypeId: string,
    localeCode: string
  ): { matches: boolean; confidence: number; matched_terms: string[] } {
    const config = this.configManager.getPolicyConfig(policyTypeId)
    const classification = config.classification

    // If no classification config, cannot match
    if (!classification) {
      return { matches: false, confidence: 0, matched_terms: [] }
    }

    const textLower = text.toLowerCase()
    const terms = this.getTermsForLocale(classification.detection_terms, localeCode)
    const exclude = this.getTermsForLocale(classification.exclude_if_contains || {}, localeCode)

    // Check exclusions
    if (exclude.some(term => textLower.includes(term.toLowerCase()))) {
      return { matches: false, confidence: 0, matched_terms: [] }
    }

    const matches = terms.filter(term => textLower.includes(term.toLowerCase()))
    const score = terms.length > 0 ? matches.length / terms.length : 0

    return {
      matches: score >= classification.confidence_threshold,
      confidence: score,
      matched_terms: matches,
    }
  }

  /**
   * Get all policy types that could match the document
   */
  getAllPotentialMatches(
    text: string,
    localeCode: string,
    minConfidence: number = 0.3
  ): Array<{
    policy_type_id: string
    policy_type_name: string
    confidence: number
    matched_terms: string[]
  }> {
    const result = this.classify(text, localeCode)

    return Object.entries(result.all_scores)
      .filter(([, v]) => !v.excluded && v.score >= minConfidence)
      .map(([id, v]) => {
        const config = this.configManager.getPolicyConfig(id)
        return {
          policy_type_id: id,
          policy_type_name: config.policy_type_name,
          confidence: v.score,
          matched_terms: v.matches,
        }
      })
      .sort((a, b) => b.confidence - a.confidence)
  }
}
