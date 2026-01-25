/**
 * OCR Decision Engine
 *
 * Main orchestrator for OCR decision making.
 * Policy-agnostic - all policy-specific and language-specific logic
 * is loaded from configuration files.
 */

import type {
  OCRDecision,
  DensityAnalysis,
  ConfidenceScore,
  OCRAction,
  OCRSettings,
} from './types'
import { ConfigurationManager, getConfigurationManager } from './configuration-manager'
import { LanguageDetector } from './language-detector'
import { PolicyTypeClassifier } from './policy-classifier'
import { TextQualityAnalyzer } from './text-quality-analyzer'
import { FieldExtractor } from './field-extractor'

export class OCRDecisionEngine {
  private configManager: ConfigurationManager
  private languageDetector: LanguageDetector
  private policyClassifier: PolicyTypeClassifier
  private qualityAnalyzer: TextQualityAnalyzer
  private fieldExtractor: FieldExtractor
  private settings: OCRSettings

  constructor(configManager?: ConfigurationManager) {
    this.configManager = configManager || getConfigurationManager()
    this.languageDetector = new LanguageDetector(this.configManager)
    this.policyClassifier = new PolicyTypeClassifier(this.configManager)
    this.qualityAnalyzer = new TextQualityAnalyzer(this.configManager)
    this.fieldExtractor = new FieldExtractor(this.configManager)
    this.settings = this.configManager.getOCRSettings()
  }

  /**
   * Main entry point for OCR decision making.
   * Returns decision with full analysis context.
   */
  analyzeDocument(
    extractedText: string,
    pageTexts?: string[]
  ): OCRDecision {
    const startTime = Date.now()
    const reasoning: string[] = []

    // Step 1: Detect language
    const languageResult = this.languageDetector.detect(extractedText)
    reasoning.push(
      `Language detected as ${languageResult.locale_code.toUpperCase()} (confidence: ${(languageResult.confidence * 100).toFixed(0)}%)`
    )

    // Step 2: Classify policy type
    const policyResult = this.policyClassifier.classify(
      extractedText,
      languageResult.locale_code
    )
    const policyConfig = this.configManager.getPolicyConfig(policyResult.policy_type_id)
    reasoning.push(
      `Policy classified as ${policyResult.policy_type_name} (confidence: ${(policyResult.confidence * 100).toFixed(0)}%)`
    )

    // Step 3: Analyze text density (page-level if available)
    const densityAnalysis = this.analyzeDensity(extractedText, pageTexts)
    reasoning.push(
      `Character density: ${densityAnalysis.average_chars_per_page.toFixed(0)} chars/page (threshold: ${densityAnalysis.threshold_used})`
    )

    // Step 4: Validate text quality
    const qualityAnalysis = this.qualityAnalyzer.analyze(
      extractedText,
      languageResult.locale_code,
      policyConfig
    )
    reasoning.push(
      `Text quality score: ${(qualityAnalysis.quality_score * 100).toFixed(0)}% (${qualityAnalysis.terms_found}/${qualityAnalysis.terms_checked} terms found)`
    )

    if (qualityAnalysis.encoding_issues) {
      reasoning.push('Warning: Encoding issues detected in text')
    }

    // Step 5: Test field extraction
    const fieldAnalysis = this.fieldExtractor.testExtraction(
      extractedText,
      policyConfig,
      languageResult.locale_code
    )
    reasoning.push(
      `Field extraction: ${fieldAnalysis.required_fields_found}/${fieldAnalysis.required_fields_total} required fields found (${(fieldAnalysis.extraction_rate * 100).toFixed(0)}%)`
    )

    // Step 6: Calculate confidence score
    const confidence = this.calculateConfidence(
      densityAnalysis,
      qualityAnalysis,
      fieldAnalysis
    )
    reasoning.push(
      `Overall confidence: ${(confidence.overall * 100).toFixed(0)}%`
    )

    // Step 7: Make decision
    const decision = this.makeDecision(
      confidence,
      densityAnalysis,
      policyConfig
    )

    // Generate decision reasoning
    const thresholds = this.settings.confidence_calculation.thresholds
    if (decision.action === 'skip_ocr') {
      reasoning.push(
        `Decision: Skip OCR (confidence ${(confidence.overall * 100).toFixed(0)}% >= ${(thresholds.skip_ocr * 100).toFixed(0)}% threshold)`
      )
    } else if (decision.action === 'selective_ocr') {
      reasoning.push(
        `Decision: Selective OCR for pages ${decision.pages_to_ocr.join(', ')} (confidence ${(confidence.overall * 100).toFixed(0)}% between ${(thresholds.selective_ocr * 100).toFixed(0)}% and ${(thresholds.skip_ocr * 100).toFixed(0)}%)`
      )
    } else {
      reasoning.push(
        `Decision: Full OCR required (confidence ${(confidence.overall * 100).toFixed(0)}% < ${(thresholds.selective_ocr * 100).toFixed(0)}% threshold)`
      )
    }

    const duration = Date.now() - startTime

    return {
      action: decision.action,
      confidence: confidence.overall,
      mode: pageTexts ? 'page_level_analysis' : 'document_level_analysis',
      pages_to_ocr: decision.pages_to_ocr,

      document_classification: {
        detected_language: languageResult,
        detected_policy_type: policyResult,
      },

      configurations_used: {
        locale_config: `${languageResult.locale_code}.json`,
        policy_config: `${policyConfig.category}/${policyResult.policy_type_id}.json`,
        ocr_settings_version: this.settings.version,
      },

      analysis: {
        density: densityAnalysis,
        text_quality: qualityAnalysis,
        field_extraction: fieldAnalysis,
        confidence_breakdown: confidence,
      },

      reasoning,
      timestamp: new Date().toISOString(),
      duration_ms: duration,
    }
  }

  /**
   * Analyze character density at page level
   */
  private analyzeDensity(
    fullText: string,
    pageTexts?: string[]
  ): DensityAnalysis {
    const threshold = this.settings.density_analysis.chars_per_page_threshold
    const minCharsForValid = this.settings.density_analysis.min_chars_for_valid_page

    // If no page-level text provided, estimate based on page markers or split
    const pages = pageTexts || this.estimatePages(fullText)

    const pageDetails: Array<{ page: number; chars: number; needs_ocr: boolean }> = []
    const pagesBelowThreshold: number[] = []

    for (let i = 0; i < pages.length; i++) {
      const charCount = pages[i].trim().length
      const pageNum = i + 1
      const needsOcr = charCount < threshold

      pageDetails.push({
        page: pageNum,
        chars: charCount,
        needs_ocr: needsOcr,
      })

      if (needsOcr && charCount >= minCharsForValid) {
        pagesBelowThreshold.push(pageNum)
      }
    }

    const totalChars = pageDetails.reduce((sum, p) => sum + p.chars, 0)
    const avgChars = pages.length > 0 ? totalChars / pages.length : 0

    // Calculate variance
    let variance = 0
    if (pages.length > 1) {
      const mean = avgChars
      const squaredDiffs = pageDetails.map(p => Math.pow(p.chars - mean, 2))
      variance = Math.sqrt(squaredDiffs.reduce((s, d) => s + d, 0) / pages.length)
    }

    // Find min and max pages
    const sortedByChars = [...pageDetails].sort((a, b) => a.chars - b.chars)
    const minPage = sortedByChars[0] || { page: 1, chars: 0 }
    const maxPage = sortedByChars[sortedByChars.length - 1] || { page: 1, chars: 0 }

    return {
      total_pages: pages.length,
      total_characters: totalChars,
      average_chars_per_page: Math.round(avgChars),
      threshold_used: threshold,
      page_details: pageDetails,
      pages_below_threshold: pagesBelowThreshold,
      min_chars_page: { page: minPage.page, chars: minPage.chars },
      max_chars_page: { page: maxPage.page, chars: maxPage.chars },
      variance: Math.round(variance),
    }
  }

  /**
   * Estimate pages from full text (when page-level text not available)
   */
  private estimatePages(text: string): string[] {
    // Look for common page markers
    const pageMarkers = [
      /\f/g,  // Form feed
      /--- ?Page \d+ ?---/gi,
      /\n{3,}/g,  // Multiple newlines
    ]

    for (const marker of pageMarkers) {
      const parts = text.split(marker)
      if (parts.length > 1) {
        return parts.filter(p => p.trim().length > 0)
      }
    }

    // If no markers found, estimate based on character count
    // Assuming ~2000 chars per page for a typical PDF
    const estimatedPageSize = 2000
    const pages: string[] = []

    for (let i = 0; i < text.length; i += estimatedPageSize) {
      pages.push(text.substring(i, i + estimatedPageSize))
    }

    return pages.length > 0 ? pages : [text]
  }

  /**
   * Calculate weighted confidence score
   */
  private calculateConfidence(
    density: DensityAnalysis,
    quality: { quality_score: number; encoding_issues: boolean },
    fields: { extraction_rate: number }
  ): ConfidenceScore {
    const weights = this.settings.confidence_calculation.weights

    // Calculate individual scores
    const densityScore = this.calculateDensityScore(density)
    const qualityScore = quality.quality_score
    const varianceScore = this.calculateVarianceScore(density)
    const encodingScore = quality.encoding_issues ? 0 : 1
    const fieldScore = fields.extraction_rate

    const scores = {
      char_density: Math.round(densityScore * 100) / 100,
      text_quality: Math.round(qualityScore * 100) / 100,
      page_variance: Math.round(varianceScore * 100) / 100,
      encoding_check: encodingScore,
      field_extraction: Math.round(fieldScore * 100) / 100,
    }

    // Calculate weighted overall score
    const overall =
      scores.char_density * weights.char_density +
      scores.text_quality * weights.text_quality +
      scores.page_variance * weights.page_variance +
      scores.encoding_check * weights.encoding_check +
      scores.field_extraction * weights.field_extraction

    return {
      overall: Math.round(overall * 100) / 100,
      component_scores: scores,
      weights_used: weights,
    }
  }

  /**
   * Calculate density score (0-1)
   */
  private calculateDensityScore(density: DensityAnalysis): number {
    const threshold = density.threshold_used
    const avg = density.average_chars_per_page

    if (avg >= threshold * 10) return 1.0
    if (avg >= threshold * 5) return 0.9
    if (avg >= threshold * 2) return 0.8
    if (avg >= threshold) return 0.7
    if (avg >= threshold * 0.5) return 0.5
    if (avg >= threshold * 0.25) return 0.3
    return 0.1
  }

  /**
   * Calculate variance score (lower variance = higher score)
   */
  private calculateVarianceScore(density: DensityAnalysis): number {
    if (!density.variance || density.total_pages < 2) return 1.0

    const varianceThreshold = this.settings.density_analysis.page_variance_threshold
    const normalizedVariance = density.variance / density.average_chars_per_page

    if (normalizedVariance <= varianceThreshold * 0.5) return 1.0
    if (normalizedVariance <= varianceThreshold) return 0.8
    if (normalizedVariance <= varianceThreshold * 2) return 0.6
    return 0.4
  }

  /**
   * Make OCR decision based on confidence and analysis
   */
  private makeDecision(
    confidence: ConfidenceScore,
    density: DensityAnalysis,
    policyConfig: { quality_thresholds?: { ocr_trigger_confidence?: number } }
  ): { action: OCRAction; pages_to_ocr: number[] } {
    const thresholds = this.settings.confidence_calculation.thresholds

    // Override with policy-specific threshold if available
    const ocrThreshold = policyConfig.quality_thresholds?.ocr_trigger_confidence ||
      thresholds.selective_ocr

    if (confidence.overall >= thresholds.skip_ocr) {
      return { action: 'skip_ocr', pages_to_ocr: [] }
    }

    if (confidence.overall >= ocrThreshold) {
      // Selective OCR for pages below threshold
      return {
        action: 'selective_ocr',
        pages_to_ocr: density.pages_below_threshold,
      }
    }

    // Full OCR
    return {
      action: 'full_ocr',
      pages_to_ocr: Array.from({ length: density.total_pages }, (_, i) => i + 1),
    }
  }

  /**
   * Quick analysis (faster, less detailed)
   */
  quickAnalyze(text: string, pageCount?: number): {
    action: OCRAction
    confidence: number
    reasoning: string
  } {
    const pages = pageCount || 1
    const charsPerPage = text.length / pages
    const threshold = this.settings.density_analysis.chars_per_page_threshold

    // Quick quality check
    const quickQuality = this.qualityAnalyzer.quickCheck(text)

    // Quick decision
    if (charsPerPage >= threshold * 5 && quickQuality.isLikelyGood) {
      return {
        action: 'skip_ocr',
        confidence: 0.9,
        reasoning: `High text density (${charsPerPage.toFixed(0)} chars/page) and good quality`,
      }
    }

    if (charsPerPage >= threshold && quickQuality.score > 0.5) {
      return {
        action: 'skip_ocr',
        confidence: 0.7,
        reasoning: `Adequate text density (${charsPerPage.toFixed(0)} chars/page)`,
      }
    }

    if (charsPerPage < threshold * 0.5) {
      return {
        action: 'full_ocr',
        confidence: 0.3,
        reasoning: `Low text density (${charsPerPage.toFixed(0)} chars/page < ${threshold} threshold)`,
      }
    }

    return {
      action: 'selective_ocr',
      confidence: 0.5,
      reasoning: `Borderline text density, selective OCR recommended`,
    }
  }

  /**
   * Get configuration status
   */
  getConfigurationStatus(): {
    locales: string[]
    policy_types: string[]
    ocr_settings_version: string
    last_load_time: Date
  } {
    return {
      locales: this.configManager.getAvailableLocales(),
      policy_types: this.configManager.getAvailablePolicyTypes(),
      ocr_settings_version: this.settings.version,
      last_load_time: this.configManager.getLastLoadTime(),
    }
  }

  /**
   * Reload configurations (for hot-reload support)
   */
  reloadConfigurations(): void {
    this.configManager.reload()
    this.settings = this.configManager.getOCRSettings()
  }
}

// Singleton instance
let engineInstance: OCRDecisionEngine | null = null

/**
 * Get the singleton OCRDecisionEngine instance
 */
export function getOCRDecisionEngine(): OCRDecisionEngine {
  if (!engineInstance) {
    engineInstance = new OCRDecisionEngine()
  }
  return engineInstance
}
