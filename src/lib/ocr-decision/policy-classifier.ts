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

export class PolicyTypeClassifier {
  private configManager: ConfigurationManager
  private settings: OCRSettings

  constructor(configManager: ConfigurationManager) {
    this.configManager = configManager
    this.settings = configManager.getOCRSettings()
  }

  /**
   * Classify document into policy type
   */
  classify(text: string, localeCode: string): PolicyTypeClassificationResult {
    const textLower = text.toLowerCase()
    const scores: Record<string, {
      score: number
      excluded: boolean
      matches: string[]
      threshold?: number
    }> = {}

    const availablePolicyTypes = this.configManager.getAvailablePolicyTypes()

    for (const policyId of availablePolicyTypes) {
      const config = this.configManager.getPolicyConfig(policyId)
      const classification = config.classification

      // Skip if no classification or if this is a fallback config
      if (!classification || classification.is_fallback) continue

      const detectionTerms = classification.detection_terms
      const excludeTerms = classification.exclude_if_contains || {}
      const threshold = classification.confidence_threshold

      // Get locale-specific terms, fall back to English or any available
      const terms = this.getTermsForLocale(detectionTerms, localeCode)
      const exclude = this.getTermsForLocale(excludeTerms, localeCode)

      // Check exclusions first
      const isExcluded = exclude.some(term => textLower.includes(term.toLowerCase()))
      if (isExcluded) {
        scores[policyId] = {
          score: 0,
          excluded: true,
          matches: [],
          threshold,
        }
        continue
      }

      // Count matches
      const matches = terms.filter(term => textLower.includes(term.toLowerCase()))
      const score = terms.length > 0 ? matches.length / terms.length : 0

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

    if (validMatches.length > 0) {
      const [bestTypeId, bestScore] = validMatches[0]
      const config = this.configManager.getPolicyConfig(bestTypeId)

      return {
        policy_type_id: bestTypeId,
        policy_type_name: config.policy_type_name,
        category: config.category,
        confidence: bestScore.score,
        matched_terms: bestScore.matches,
        all_scores: scores,
      }
    }

    // Fallback to generic
    const fallbackId = this.settings.policy_type_detection.fallback_type || '_generic'
    const fallbackConfig = this.configManager.getPolicyConfig(fallbackId)

    return {
      policy_type_id: fallbackId,
      policy_type_name: fallbackConfig.policy_type_name,
      category: fallbackConfig.category,
      confidence: 0,
      matched_terms: [],
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
