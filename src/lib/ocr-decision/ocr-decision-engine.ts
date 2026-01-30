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
  ConfidenceComponentBreakdown,
  OCRAction,
  OCRSettings,
  TextQualityAnalysis,
  FieldExtractionAnalysis,
  DocumentJourneyMetadata,
} from './types'

// Debug logging flag - set to false in production
const DEBUG_CONFIDENCE_CALCULATION = false

function debugLog(message: string, data?: unknown): void {
  if (DEBUG_CONFIDENCE_CALCULATION) {
    if (data !== undefined) {
      console.warn(`[ConfidenceCalculator] ${message}`, data)
    } else {
      console.warn(`[ConfidenceCalculator] ${message}`)
    }
  }
}
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
    quality: TextQualityAnalysis,
    fields: FieldExtractionAnalysis
  ): ConfidenceScore {
    const weights = this.settings.confidence_calculation.weights

    debugLog('=== CONFIDENCE CALCULATION START ===')

    // 1. Character Density Score (25%)
    const densityScore = this.calculateDensityScore(density)
    debugLog(`Char density: ${density.average_chars_per_page} chars/page -> score: ${densityScore.toFixed(2)}`)

    // 2. Text Quality Score (30%)
    const qualityScore = quality.quality_score
    debugLog(`Text quality score: ${qualityScore.toFixed(2)} (${quality.terms_found}/${quality.terms_checked} terms found)`)

    // 3. Page Variance Score (15%)
    const varianceScore = this.calculateVarianceScore(density)
    debugLog(`Page variance score: ${varianceScore.toFixed(2)}`)

    // 4. Encoding Check Score (15%) - Gradual, not binary
    const encodingIssueCount = quality.encoding_issues_found?.length || 0
    const encodingScore = quality.encoding_issues
      ? Math.max(0, 1 - (encodingIssueCount * 0.1))
      : 1.0
    debugLog(`Encoding score: ${encodingScore.toFixed(2)} (issues: ${encodingIssueCount})`)

    // 5. Field Extraction Score (15%)
    const fieldScore = fields.extraction_rate
    debugLog(`Field extraction score: ${fieldScore.toFixed(2)} (${fields.required_fields_found}/${fields.required_fields_total} required fields)`)

    const scores = {
      char_density: Math.round(densityScore * 100) / 100,
      text_quality: Math.round(qualityScore * 100) / 100,
      page_variance: Math.round(varianceScore * 100) / 100,
      encoding_check: Math.round(encodingScore * 100) / 100,
      field_extraction: Math.round(fieldScore * 100) / 100,
    }

    // Calculate weighted overall score
    const charDensityContrib = scores.char_density * weights.char_density
    const textQualityContrib = scores.text_quality * weights.text_quality
    const pageVarianceContrib = scores.page_variance * weights.page_variance
    const encodingCheckContrib = scores.encoding_check * weights.encoding_check
    const fieldExtractionContrib = scores.field_extraction * weights.field_extraction

    const overall = charDensityContrib + textQualityContrib + pageVarianceContrib +
      encodingCheckContrib + fieldExtractionContrib

    debugLog(`=== OVERALL CONFIDENCE: ${overall.toFixed(2)} ===`)
    debugLog('Contributions:', {
      char_density: charDensityContrib.toFixed(4),
      text_quality: textQualityContrib.toFixed(4),
      page_variance: pageVarianceContrib.toFixed(4),
      encoding_check: encodingCheckContrib.toFixed(4),
      field_extraction: fieldExtractionContrib.toFixed(4),
    })

    // Build detailed breakdown for Document Journey
    const confidence_breakdown: Record<string, ConfidenceComponentBreakdown> = {
      char_density: {
        score: scores.char_density,
        weight: weights.char_density,
        contribution: Math.round(charDensityContrib * 10000) / 10000,
        raw_value: density.average_chars_per_page,
        details: `${density.average_chars_per_page} chars/page (threshold: ${density.threshold_used})`,
      },
      text_quality: {
        score: scores.text_quality,
        weight: weights.text_quality,
        contribution: Math.round(textQualityContrib * 10000) / 10000,
        raw_value: `${quality.terms_found}/${quality.terms_checked}`,
        details: `${quality.terms_found} of ${quality.terms_checked} terms found`,
      },
      page_variance: {
        score: scores.page_variance,
        weight: weights.page_variance,
        contribution: Math.round(pageVarianceContrib * 10000) / 10000,
        raw_value: density.variance || 0,
        details: density.total_pages < 2
          ? 'Single page (variance N/A)'
          : `Variance: ${density.variance} chars`,
      },
      encoding_check: {
        score: scores.encoding_check,
        weight: weights.encoding_check,
        contribution: Math.round(encodingCheckContrib * 10000) / 10000,
        raw_value: encodingIssueCount,
        details: encodingIssueCount === 0
          ? 'No encoding issues detected'
          : `${encodingIssueCount} encoding issue(s) found`,
      },
      field_extraction: {
        score: scores.field_extraction,
        weight: weights.field_extraction,
        contribution: Math.round(fieldExtractionContrib * 10000) / 10000,
        raw_value: `${fields.required_fields_found}/${fields.required_fields_total}`,
        details: `${fields.required_fields_found} of ${fields.required_fields_total} required fields found`,
      },
    }

    return {
      overall: Math.round(overall * 100) / 100,
      component_scores: scores,
      weights_used: weights,
      confidence_breakdown: confidence_breakdown as ConfidenceScore['confidence_breakdown'],
    }
  }

  /**
   * Calculate density score (0-1)
   *
   * Uses formula: min(1.0, avg_chars_per_page / (threshold * 4))
   * This means 4x threshold = max score (1.0)
   * For threshold 200: 800+ chars/page = 1.0
   */
  private calculateDensityScore(density: DensityAnalysis): number {
    const threshold = density.threshold_used
    const avg = density.average_chars_per_page

    // New formula: linear scaling up to 4x threshold
    const score = Math.min(1.0, avg / (threshold * 4))

    debugLog(`  Density calculation: ${avg} / (${threshold} * 4) = ${(avg / (threshold * 4)).toFixed(2)} -> capped to ${score.toFixed(2)}`)

    return score
  }

  /**
   * Calculate variance score (lower variance = higher score)
   *
   * Uses coefficient of variation (CV = stdev / mean)
   * Lower variance = higher score
   */
  private calculateVarianceScore(density: DensityAnalysis): number {
    if (!density.variance || density.total_pages < 2) {
      debugLog('  Variance calculation: Single page or no variance -> 1.0')
      return 1.0
    }

    const varianceThreshold = this.settings.density_analysis.page_variance_threshold
    const normalizedVariance = density.variance / density.average_chars_per_page

    debugLog(`  Variance calculation: ${density.variance} / ${density.average_chars_per_page} = ${normalizedVariance.toFixed(4)} (threshold: ${varianceThreshold})`)

    // Score based on how close variance is to threshold
    // Lower variance = higher score
    let score: number
    if (normalizedVariance <= varianceThreshold * 0.5) {
      score = 1.0
    } else if (normalizedVariance <= varianceThreshold) {
      score = 0.9
    } else if (normalizedVariance <= varianceThreshold * 1.5) {
      score = 0.7
    } else if (normalizedVariance <= varianceThreshold * 2) {
      score = 0.5
    } else {
      score = 0.3
    }

    debugLog(`  Variance score: ${score.toFixed(2)}`)
    return score
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

  /**
   * Build Document Journey metadata from OCRDecision.
   * Transforms internal analysis into formatted diagnostic output.
   */
  buildDocumentJourneyMetadata(decision: OCRDecision): DocumentJourneyMetadata {
    const { analysis, document_classification, configurations_used } = decision
    const langResult = document_classification.detected_language
    const policyResult = document_classification.detected_policy_type
    const qualityAnalysis = analysis.text_quality
    const fieldAnalysis = analysis.field_extraction
    const densityAnalysis = analysis.density
    const confidenceBreakdown = analysis.confidence_breakdown

    // Build confidence breakdown with thresholds
    const formattedConfidenceBreakdown: DocumentJourneyMetadata['ocr_decision']['confidence_breakdown'] = {}

    if (confidenceBreakdown.confidence_breakdown) {
      const breakdown = confidenceBreakdown.confidence_breakdown
      for (const [key, value] of Object.entries(breakdown)) {
        formattedConfidenceBreakdown[key] = {
          score: value.score,
          weight: value.weight,
          contribution: value.contribution,
          raw_value: value.raw_value ?? 0,
          threshold: key === 'char_density' ? densityAnalysis.threshold_used :
                     key === 'text_quality' ? qualityAnalysis.min_quality_threshold :
                     key === 'field_extraction' ? (fieldAnalysis.min_rate_threshold || 0.5) :
                     undefined,
          details: value.details || '',
        }
      }
    }

    // Build field extraction details
    const fieldDetails: DocumentJourneyMetadata['ocr_decision']['field_extraction']['fields'] = {}
    for (const [fieldName, fieldResult] of Object.entries(fieldAnalysis.field_results)) {
      fieldDetails[fieldName] = {
        found: fieldResult.found,
        value: fieldResult.value,
        pattern_used: fieldResult.matched_pattern || null,
        required: fieldResult.required,
      }
    }

    // Build flagged pages list
    const flaggedPages: Array<{ page: number; chars: number; reason: string }> = []
    for (const pageDetail of densityAnalysis.page_details) {
      if (pageDetail.needs_ocr) {
        flaggedPages.push({
          page: pageDetail.page,
          chars: pageDetail.chars,
          reason: `Below density threshold (${pageDetail.chars} < ${densityAnalysis.threshold_used})`,
        })
      }
    }

    return {
      ocr_decision: {
        action: decision.action,
        confidence: decision.confidence,
        confidence_breakdown: formattedConfidenceBreakdown,

        language_detection: {
          detected: langResult.locale_code,
          confidence: langResult.confidence,
          method: langResult.method,
          matched_terms: langResult.matched_terms || [],
          matched_characters: langResult.matched_chars || [],
          runner_up: langResult.runner_up || null,
        },

        policy_classification: {
          detected: policyResult.policy_type_id,
          name: policyResult.policy_type_name,
          confidence: policyResult.confidence,
          category: policyResult.category,
          matched_terms: policyResult.matched_terms,
          config_used: policyResult.config_path,
        },

        text_quality: {
          quality_score: qualityAnalysis.quality_score,
          locale_used: qualityAnalysis.locale_used,
          terms_found: qualityAnalysis.found_terms_sample,
          terms_checked: qualityAnalysis.terms_checked,
          encoding_issues: qualityAnalysis.encoding_issues_found || [],
          garbage_patterns_checked: qualityAnalysis.garbage_patterns_checked || [],
          recommendation: qualityAnalysis.recommendation,
        },

        field_extraction: {
          extraction_rate: fieldAnalysis.extraction_rate,
          required_found: fieldAnalysis.required_fields_found,
          required_total: fieldAnalysis.required_fields_total,
          fields: fieldDetails,
          recommendation: fieldAnalysis.recommendation,
        },

        page_analysis: {
          total_pages: densityAnalysis.total_pages,
          total_characters: densityAnalysis.total_characters,
          avg_chars_per_page: densityAnalysis.average_chars_per_page,
          density_threshold: densityAnalysis.threshold_used,
          pages_below_threshold: densityAnalysis.pages_below_threshold.length,
          flagged_pages: flaggedPages,
          min_page: densityAnalysis.min_chars_page,
          max_page: densityAnalysis.max_chars_page,
        },

        configs_used: {
          locale: configurations_used.locale_config,
          policy_type: configurations_used.policy_config,
          ocr_settings_version: configurations_used.ocr_settings_version,
        },

        reasoning: decision.reasoning,
        timestamp: decision.timestamp,
        duration_ms: decision.duration_ms,
      },
    }
  }

  /**
   * Analyze document and return Document Journey metadata directly.
   * Convenience method that combines analyzeDocument + buildDocumentJourneyMetadata.
   */
  analyzeDocumentForJourney(
    extractedText: string,
    pageTexts?: string[]
  ): DocumentJourneyMetadata {
    const decision = this.analyzeDocument(extractedText, pageTexts)
    return this.buildDocumentJourneyMetadata(decision)
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
