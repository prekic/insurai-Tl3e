/**
 * Extraction Pipeline Orchestrator
 *
 * 3-step pipeline for Turkish insurance document processing:
 * Step 1: Normalize - Clean text with section markers
 * Step 2: Extract - Type-specific extraction with evidence tracking
 * Step 3: Analyze - Gap analysis with benchmark citations
 *
 * Features:
 * - Evidence-first outputs with quote + location for every field
 * - Contradiction detection
 * - Hard-gated QA scoring
 * - Data requests generation
 * - Benchmark pack integration
 */

// Re-export all types
export * from '@/types/extraction-pipeline'

// Re-export services
export { normalizeDocument, extractSection, getTextWithLineNumbers, findLineNumber } from './section-normalizer'
export { detectContradictions, quickScan } from './contradiction-detector'
export { calculateQAScore, meetsMinimumQuality, getQualitySummary } from './qa-scoring'
export { generateDataRequests, formatDataRequestsChecklist, isDataMissing } from './data-requests'

// Import for orchestrator
import type {
  PipelineOptions,
  PipelineResult,
  NormalizationResult,
  KaskoExtractionJSON,
  EvidenceMap,
  ExtractionError,
  ExtractionWarning,
  QAScoreResult,
  ContradictionReport,
  DataRequestsReport,
  // AnalysisResult is part of pipeline result type
  BenchmarkPack,
} from '@/types/extraction-pipeline'
import type { PolicyType } from '@/types/policy'
import { normalizeDocument } from './section-normalizer'
import { detectContradictions } from './contradiction-detector'
import { calculateQAScore } from './qa-scoring'
import { generateDataRequests } from './data-requests'

// ============================================================================
// POLICY TYPE DETECTION
// ============================================================================

/**
 * Detect policy type from normalized text
 */
export function detectPolicyType(normalizedText: string): PolicyType {
  const textLower = normalizedText.toLowerCase()

  // Kasko indicators
  const kaskoIndicators = [
    'kasko sigorta',
    'kasko poliçe',
    'araç sigorta',
    'motorlu kara taşıt',
    'oto sigorta',
    'araç değeri',
    'rayiç değer',
  ]
  const kaskoScore = kaskoIndicators.filter((i) => textLower.includes(i)).length

  // Traffic indicators
  const trafficIndicators = [
    'trafik sigorta',
    'zmss',
    'zorunlu mali sorumluluk',
    'motorlu araç zorunlu',
  ]
  const trafficScore = trafficIndicators.filter((i) => textLower.includes(i)).length

  // Home indicators
  const homeIndicators = [
    'konut sigorta',
    'ev sigorta',
    'yangın sigorta',
    'bina sigorta',
    'mesken sigorta',
  ]
  const homeScore = homeIndicators.filter((i) => textLower.includes(i)).length

  // DASK indicators
  const daskIndicators = [
    'dask',
    'deprem sigorta',
    'zorunlu deprem',
    'doğal afet sigorta',
  ]
  const daskScore = daskIndicators.filter((i) => textLower.includes(i)).length

  // Health indicators
  const healthIndicators = [
    'sağlık sigorta',
    'tamamlayıcı sağlık',
    'özel sağlık',
    'medikal sigorta',
  ]
  const healthScore = healthIndicators.filter((i) => textLower.includes(i)).length

  // Find highest score
  const scores: [PolicyType, number][] = [
    ['kasko', kaskoScore],
    ['traffic', trafficScore],
    ['home', homeScore],
    ['dask', daskScore],
    ['health', healthScore],
  ]

  scores.sort((a, b) => b[1] - a[1])

  if (scores[0][1] > 0) {
    return scores[0][0]
  }

  return 'kasko' // Default to kasko if uncertain
}

// ============================================================================
// EXTRACTION WITH EVIDENCE
// ============================================================================

/**
 * Extract policy data with evidence mapping
 *
 * This is a stub - the actual extraction calls the AI service
 * which is implemented in server/routes/ai.ts
 */
export interface ExtractionInput {
  normalizedText: string
  policyType: PolicyType
  provider?: 'openai' | 'anthropic'
  model?: string
  promptVersion?: string
}

export interface ExtractionOutput {
  extraction: KaskoExtractionJSON
  evidenceMap: EvidenceMap
  errors: ExtractionError[]
  warnings: ExtractionWarning[]
  tokenUsage: {
    inputTokens: number
    outputTokens: number
    costEstimate: number
  }
}

/**
 * Create extraction prompt with evidence requirements
 */
export function createExtractionPrompt(policyType: PolicyType, normalizedText: string): string {
  const basePrompt = `You are an expert Turkish insurance document extractor. Extract structured data from this ${policyType} policy document.

CRITICAL REQUIREMENTS:
1. Every extracted field MUST have evidence from the source document
2. Use null for missing values - NEVER guess or invent data
3. For "Rayiç Değer" (market value), set isMarketValue=true and amount=null
4. Include exact quotes from the document as evidence
5. Note any ambiguities or uncertainties in the errors array

OUTPUT FORMAT:
Return a JSON object with these top-level keys:
- extraction: The extracted policy data
- evidence_map: Mapping of field paths to source quotes
- errors: Array of extraction errors
- warnings: Array of extraction warnings

EVIDENCE MAP FORMAT:
{
  "fieldPath": {
    "quote": "exact text from document",
    "location": "Section: X, Line: Y",
    "confidence": 0.0-1.0
  }
}

ERROR FORMAT:
{
  "type": "missing_required|parse_error|currency_unknown|inconsistency|validation_failed|ambiguous_value",
  "field": "fieldPath",
  "message": "description",
  "severity": "critical|high|medium|low"
}

DOCUMENT TEXT:
${normalizedText}

Extract all available information and provide evidence for each field.`

  return basePrompt
}

// ============================================================================
// ANALYSIS WITH BENCHMARKS
// ============================================================================

/**
 * Create analysis prompt with benchmark citations
 */
export function createAnalysisPrompt(
  extraction: KaskoExtractionJSON,
  evidenceMap: EvidenceMap,
  benchmarkPack: BenchmarkPack | null
): string {
  const benchmarkSection = benchmarkPack
    ? `
BENCHMARK DATA (from ${benchmarkPack.name} v${benchmarkPack.version}):
${JSON.stringify(benchmarkPack.entries, null, 2)}

CITATION REQUIREMENT:
- When referencing benchmarks, cite by entryId: "According to benchmark [entryId]: ..."
- Label all benchmark comparisons as "Benchmark:" prefix
- Do NOT invent market averages - only cite provided benchmarks
`
    : `
NO BENCHMARK PACK PROVIDED:
- Do NOT provide any numeric market averages or comparisons
- Focus only on policy completeness and internal consistency
- Flag that benchmarks are unavailable
`

  return `You are an expert Turkish insurance analyst. Analyze this ${extraction.documentType} policy extraction.

EXTRACTION DATA:
${JSON.stringify(extraction, null, 2)}

EVIDENCE MAP:
${JSON.stringify(evidenceMap, null, 2)}

${benchmarkSection}

ANALYSIS REQUIREMENTS:
1. Identify coverage gaps based on policy type standards
2. Calculate financial exposure for each gap
3. Provide negotiation points with evidence from policy
4. Suggest draft endorsements if appropriate
5. Every analysis point must cite either:
   - Evidence from the policy (via evidence_map)
   - Benchmark data (via entryId)

OUTPUT FORMAT:
{
  "gapRegister": [...],
  "negotiationPoints": [...],
  "draftEndorsements": [...],
  "benchmarkCitations": [...],
  "evidenceCitations": [...],
  "summary": {...}
}

Analyze the policy thoroughly.`
}

// ============================================================================
// MAIN PIPELINE ORCHESTRATOR
// ============================================================================

/**
 * Run the complete extraction pipeline
 *
 * This is the main entry point that orchestrates:
 * 1. Normalization
 * 2. Extraction with evidence
 * 3. Contradiction detection
 * 4. QA scoring
 * 5. Data requests generation
 * 6. Analysis (optional)
 */
export async function runPipeline(
  rawText: string,
  fileName: string,
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const startTime = Date.now()
  const errors: string[] = []

  // Initialize result structure
  const result: PipelineResult = {
    document: {
      id: '', // Will be set after DB insert
      fileName,
      status: 'pending',
    },
    normalization: null,
    extraction: null,
    qa: null,
    contradictions: null,
    dataRequests: null,
    analysis: null,
    status: 'failed',
    errors: [],
    processingTimeMs: 0,
  }

  try {
    // Step 1: Normalize
    if (!options.skipNormalization) {
      const normalization = normalizeDocument(rawText)
      result.normalization = normalization
      result.document.status = 'normalized'

      // Check for severe normalization issues
      const criticalWarnings = normalization.warnings.filter((w) => w.severity === 'high')
      if (criticalWarnings.length > 0) {
        errors.push(`Normalization warnings: ${criticalWarnings.map((w) => w.message).join(', ')}`)
      }
    }

    // Determine policy type
    const normalizedText = result.normalization?.normalizedText || rawText
    const policyType = options.policyType || detectPolicyType(normalizedText)

    // Step 2: Extraction
    // Note: Actual AI extraction happens via API call in the component
    // This pipeline prepares the prompts and handles results

    // For now, create a placeholder extraction structure
    // The actual extraction is done by calling /api/ai/extract with createExtractionPrompt()
    // Prompt is generated but stored for external use via separate function call
    void createExtractionPrompt(policyType, normalizedText)

    // Store prompt for external use
    result.extraction = {
      runId: '', // Will be set after extraction
      policyType,
      data: {} as KaskoExtractionJSON, // Will be filled by AI response
      evidenceMap: {},
      errors: [],
      warnings: [],
    }

    // Step 3: Contradiction detection (requires extraction data)
    // This will be called after extraction completes

    // Step 4: QA scoring (requires extraction and contradictions)
    // This will be called after extraction completes

    // Step 5: Data requests (requires extraction)
    // This will be called after extraction completes

    // Step 6: Analysis (optional, requires extraction)
    // This will be called after extraction completes

    result.status = 'partial'
    result.document.status = 'normalized'
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown error')
    result.status = 'failed'
    result.document.status = 'failed'
  }

  result.errors = errors
  result.processingTimeMs = Date.now() - startTime

  return result
}

/**
 * Process extraction results through validation pipeline
 *
 * Call this after receiving extraction JSON from AI
 */
export function processExtractionResults(
  extraction: KaskoExtractionJSON,
  _evidenceMap: EvidenceMap, // Reserved for future evidence validation
  extractionErrors: ExtractionError[],
  _extractionWarnings: ExtractionWarning[], // Reserved for future warning analysis
  normalizedText: string,
  normalizationWarnings: NormalizationResult['warnings']
): {
  qa: QAScoreResult
  contradictions: ContradictionReport
  dataRequests: DataRequestsReport
} {
  // Run contradiction detection
  const contradictions = detectContradictions(extraction, normalizedText)

  // Calculate QA score
  const qa = calculateQAScore(extraction, normalizedText, contradictions)

  // Generate data requests
  const dataRequests = generateDataRequests({
    extraction,
    errors: extractionErrors,
    normalizationWarnings,
    normalizedText,
  })

  return { qa, contradictions, dataRequests }
}

/**
 * Get extraction prompt version identifier
 */
export function getPromptVersion(policyType: PolicyType): string {
  return `${policyType}-extract-v3.0`
}

/**
 * Validate pipeline result before saving
 */
export function validatePipelineResult(result: PipelineResult): {
  isValid: boolean
  issues: string[]
} {
  const issues: string[] = []

  if (!result.normalization) {
    issues.push('Normalization not completed')
  }

  if (!result.extraction?.data?.policyNumber && result.extraction?.data) {
    issues.push('Policy number not extracted')
  }

  if (result.qa && result.qa.score < 40) {
    issues.push(`QA score too low: ${result.qa.score}`)
  }

  if (result.contradictions && result.contradictions.summary.critical > 0) {
    issues.push(`${result.contradictions.summary.critical} critical contradictions`)
  }

  if (result.dataRequests && !result.dataRequests.canFinalize) {
    issues.push('Critical data requests pending')
  }

  return {
    isValid: issues.length === 0,
    issues,
  }
}
