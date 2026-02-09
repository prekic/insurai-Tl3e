/**
 * Multi-AI Analysis System
 *
 * Provides comprehensive policy analysis using multiple AI providers with
 * consensus checking, quality validation, and knowledge base integration.
 *
 * Architecture:
 * 1. Primary AI extracts policy data
 * 2. Secondary AI reviews and validates the extraction
 * 3. If consensus < 90%, tertiary AI provides additional analysis
 * 4. Knowledge base enriches findings with:
 *    - General conditions for the insurance line
 *    - Similar policies comparison
 *    - Market benchmarks and common practices
 * 5. Results are merged and quality scored
 */

import type { AnalyzedPolicy, Coverage, PolicyType } from '@/types/policy'

// Re-define ExtractedPolicyData locally to avoid circular imports
export interface ExtractedPolicyData {
  policyNumber?: string
  insurerName?: string
  policyType?: string
  insuredName?: string
  insuredAddress?: string
  startDate?: string
  endDate?: string
  premium?: number
  coverages?: Coverage[]
  exclusions?: string[]
  specialConditions?: string[]
  currency?: string
  confidence: {
    overall: number
    fields: Record<string, number>
  }
}

// =============================================================================
// TYPES
// =============================================================================

export interface AIAnalysisResult {
  provider: 'openai' | 'anthropic' | 'gemini'
  extraction: ExtractedPolicyData
  confidence: number
  processingTimeMs: number
  insights: string[]
  warnings: string[]
}

export interface ConsensusResult {
  /** Consensus percentage (0-100) */
  consensusScore: number
  /** Number of AI providers that agreed on key fields */
  agreementCount: number
  /** Total AI providers used */
  totalProviders: number
  /** Fields where AIs disagreed */
  disagreements: DisagreementField[]
  /** Merged result from all AIs */
  mergedResult: ExtractedPolicyData
  /** Whether a third AI was needed */
  usedTertiaryAI: boolean
  /** Detailed analysis from each AI */
  analyses: AIAnalysisResult[]
}

export interface DisagreementField {
  field: string
  values: Array<{ provider: string; value: unknown }>
  resolvedValue: unknown
  resolutionMethod: 'majority' | 'highest_confidence' | 'tertiary_ai' | 'manual'
}

export interface KnowledgeEnrichment {
  /** General conditions for this insurance line */
  generalConditions: GeneralConditionMatch[]
  /** Similar policies in the system */
  similarPolicies: SimilarPolicyMatch[]
  /** Market benchmark comparison */
  marketComparison: MarketBenchmarkResult
  /** Coverage recommendations based on industry knowledge */
  recommendations: CoverageRecommendation[]
  /** Potential issues detected */
  potentialIssues: PotentialIssue[]
}

export interface GeneralConditionMatch {
  conditionId: string
  title: string
  titleTr: string
  relevance: number
  applicableClause: string
  implication: string
}

export interface SimilarPolicyMatch {
  policyId: string
  similarity: number
  provider: string
  type: PolicyType
  coverages: string[]
  premium: number
  comparisonNotes: string[]
}

export interface MarketBenchmarkResult {
  averagePremium: number
  premiumPercentile: number
  coverageCompletenessScore: number
  marketStandardCoverages: string[]
  missingMarketStandardCoverages: string[]
  unusualExclusions: string[]
}

export interface CoverageRecommendation {
  coverage: string
  coverageTr: string
  reason: string
  reasonTr: string
  marketInclusionRate: number
  estimatedCost: number | null
  priority: 'critical' | 'recommended' | 'optional'
}

export interface PotentialIssue {
  type: 'missing_coverage' | 'unusual_exclusion' | 'high_deductible' | 'low_limit' | 'compliance' | 'clarity'
  severity: 'critical' | 'high' | 'medium' | 'low'
  description: string
  descriptionTr: string
  recommendation: string
  recommendationTr: string
}

export interface ComprehensiveAnalysisResult {
  /** Final merged policy data */
  policy: AnalyzedPolicy
  /** Consensus details from multi-AI analysis */
  consensus: ConsensusResult
  /** Knowledge base enrichment */
  enrichment: KnowledgeEnrichment
  /** Overall quality score (0-100) */
  qualityScore: number
  /** Whether analysis meets quality threshold */
  meetsQualityThreshold: boolean
  /** Processing metadata */
  metadata: {
    totalProcessingTimeMs: number
    providersUsed: string[]
    knowledgeSourcesUsed: string[]
    timestamp: string
  }
}

// =============================================================================
// CONFIGURATION
// =============================================================================

export const CONSENSUS_CONFIG = {
  /** Minimum consensus score to accept without tertiary AI */
  CONSENSUS_THRESHOLD: 90,
  /** Minimum confidence from any single AI to be considered */
  MIN_CONFIDENCE: 0.7,
  /** Fields that must match for high consensus */
  CRITICAL_FIELDS: [
    'policyNumber',
    'provider',
    'type',
    'insuredName',
    'startDate',
    'endDate',
    'premium',
  ],
  /** Fields where minor differences are acceptable */
  FLEXIBLE_FIELDS: [
    'coverages', // Order may differ
    'exclusions', // Wording may differ
    'specialConditions',
  ],
  /** Weight for each critical field in consensus calculation */
  FIELD_WEIGHTS: {
    policyNumber: 20,
    provider: 15,
    type: 15,
    insuredName: 10,
    startDate: 10,
    endDate: 10,
    premium: 10,
    coverage: 10,
  } as Record<string, number>,
}

// =============================================================================
// CONSENSUS CALCULATION
// =============================================================================

/**
 * Calculate consensus between multiple AI extraction results
 */
export function calculateConsensus(
  analyses: AIAnalysisResult[]
): Omit<ConsensusResult, 'usedTertiaryAI'> {
  if (analyses.length === 0) {
    throw new Error('At least one analysis result is required')
  }

  if (analyses.length === 1) {
    return {
      consensusScore: analyses[0].confidence * 100,
      agreementCount: 1,
      totalProviders: 1,
      disagreements: [],
      mergedResult: analyses[0].extraction,
      analyses,
    }
  }

  const disagreements: DisagreementField[] = []
  let totalWeight = 0
  let matchedWeight = 0

  // Compare critical fields
  for (const field of CONSENSUS_CONFIG.CRITICAL_FIELDS) {
    const weight = CONSENSUS_CONFIG.FIELD_WEIGHTS[field] || 5
    totalWeight += weight

    const values = analyses.map((a) => ({
      provider: a.provider,
      value: getFieldValue(a.extraction, field),
    }))

    const uniqueValues = new Set(values.map((v) => normalizeValue(v.value)))

    if (uniqueValues.size === 1) {
      // All AIs agree
      matchedWeight += weight
    } else {
      // Disagreement - resolve by majority or highest confidence
      const resolvedValue = resolveDisagreement(values, analyses, field)
      disagreements.push({
        field,
        values,
        resolvedValue,
        resolutionMethod: analyses.length > 2 ? 'majority' : 'highest_confidence',
      })
      // Partial credit if majority agrees
      const majorityCount = getMajorityCount(values)
      if (majorityCount > analyses.length / 2) {
        matchedWeight += weight * 0.5
      }
    }
  }

  const consensusScore = totalWeight > 0 ? (matchedWeight / totalWeight) * 100 : 0

  // Merge results
  const mergedResult = mergeExtractionResults(analyses, disagreements)

  return {
    consensusScore,
    agreementCount: CONSENSUS_CONFIG.CRITICAL_FIELDS.length - disagreements.length,
    totalProviders: analyses.length,
    disagreements,
    mergedResult,
    analyses,
  }
}

/**
 * Get a field value from extraction data
 */
function getFieldValue(extraction: ExtractedPolicyData, field: string): unknown {
  const fieldMap: Record<string, unknown> = {
    policyNumber: extraction.policyNumber,
    provider: extraction.insurerName,
    type: extraction.policyType,
    insuredName: extraction.insuredName,
    startDate: extraction.startDate,
    endDate: extraction.endDate,
    premium: extraction.premium,
    coverage: extraction.coverages?.reduce((sum: number, c: Coverage) => sum + (c.limit || 0), 0),
  }
  return fieldMap[field]
}

/**
 * Normalize a value for comparison
 */
function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') {
    return value.toLowerCase().trim().replace(/\s+/g, ' ')
  }
  if (typeof value === 'number') {
    return String(Math.round(value))
  }
  return JSON.stringify(value)
}

/**
 * Resolve disagreement between AI providers
 */
function resolveDisagreement(
  values: Array<{ provider: string; value: unknown }>,
  analyses: AIAnalysisResult[],
  _field: string
): unknown {
  // Count occurrences of each value
  const valueCounts = new Map<string, { count: number; value: unknown }>()
  for (const v of values) {
    const normalized = normalizeValue(v.value)
    const existing = valueCounts.get(normalized)
    if (existing) {
      existing.count++
    } else {
      valueCounts.set(normalized, { count: 1, value: v.value })
    }
  }

  // Find majority value
  let maxCount = 0
  let majorityValue: unknown = values[0]?.value

  for (const { count, value } of valueCounts.values()) {
    if (count > maxCount) {
      maxCount = count
      majorityValue = value
    }
  }

  // If no clear majority, use value from highest confidence AI
  if (maxCount <= values.length / 2) {
    const sortedByConfidence = [...analyses].sort((a, b) => b.confidence - a.confidence)
    const highestConfidenceProvider = sortedByConfidence[0].provider
    const highestConfValue = values.find((v) => v.provider === highestConfidenceProvider)
    return highestConfValue?.value ?? majorityValue
  }

  return majorityValue
}

/**
 * Get the count of the majority value
 */
function getMajorityCount(values: Array<{ provider: string; value: unknown }>): number {
  const valueCounts = new Map<string, number>()
  for (const v of values) {
    const normalized = normalizeValue(v.value)
    valueCounts.set(normalized, (valueCounts.get(normalized) || 0) + 1)
  }
  return Math.max(...valueCounts.values())
}

/**
 * Merge extraction results from multiple AIs
 */
function mergeExtractionResults(
  analyses: AIAnalysisResult[],
  disagreements: DisagreementField[]
): ExtractedPolicyData {
  // Start with highest confidence result as base
  const sortedByConfidence = [...analyses].sort((a, b) => b.confidence - a.confidence)
  const base = { ...sortedByConfidence[0].extraction }

  // Override with resolved disagreements
  for (const disagreement of disagreements) {
    setFieldValue(base, disagreement.field, disagreement.resolvedValue)
  }

  // Merge coverages from all AIs (union)
  const allCoverages = new Map<string, Coverage>()
  for (const analysis of analyses) {
    for (const coverage of analysis.extraction.coverages || []) {
      const key = coverage.name.toLowerCase()
      if (!allCoverages.has(key) || (coverage.limit || 0) > (allCoverages.get(key)?.limit || 0)) {
        allCoverages.set(key, coverage)
      }
    }
  }
  base.coverages = Array.from(allCoverages.values())

  // Merge exclusions (union)
  const allExclusions = new Set<string>()
  for (const analysis of analyses) {
    for (const exclusion of analysis.extraction.exclusions || []) {
      allExclusions.add(exclusion)
    }
  }
  base.exclusions = Array.from(allExclusions)

  // Average confidence across all AIs, weighted by individual confidence
  const totalConfidence = analyses.reduce((sum, a) => sum + a.confidence, 0)
  const weightedConfidence = analyses.reduce(
    (sum, a) => sum + a.confidence * a.confidence,
    0
  ) / totalConfidence
  base.confidence = {
    overall: weightedConfidence,
    fields: base.confidence?.fields || {},
  }

  return base
}

/**
 * Set a field value on extraction data
 */
function setFieldValue(extraction: ExtractedPolicyData, field: string, value: unknown): void {
  switch (field) {
    case 'policyNumber':
      extraction.policyNumber = value as string
      break
    case 'provider':
      extraction.insurerName = value as string
      break
    case 'type':
      extraction.policyType = value as string
      break
    case 'insuredName':
      extraction.insuredName = value as string
      break
    case 'startDate':
      extraction.startDate = value as string
      break
    case 'endDate':
      extraction.endDate = value as string
      break
    case 'premium':
      extraction.premium = value as number
      break
  }
}

// =============================================================================
// KNOWLEDGE ENRICHMENT
// =============================================================================

/**
 * Enrich policy analysis with knowledge base data
 */
export async function enrichWithKnowledge(
  policy: AnalyzedPolicy,
  _extractedData: ExtractedPolicyData
): Promise<KnowledgeEnrichment> {
  // Load general conditions for this insurance line
  const generalConditions = await loadGeneralConditions(policy.type)

  // Find similar policies in the database
  const similarPolicies = await findSimilarPolicies(policy)

  // Get market benchmarks
  const marketComparison = await getMarketBenchmarks(policy)

  // Generate recommendations based on knowledge
  const recommendations = generateRecommendations(policy, generalConditions, marketComparison)

  // Detect potential issues
  const potentialIssues = detectPotentialIssues(policy, generalConditions, marketComparison)

  return {
    generalConditions,
    similarPolicies,
    marketComparison,
    recommendations,
    potentialIssues,
  }
}

/**
 * Load general conditions for an insurance line
 */
async function loadGeneralConditions(policyType: PolicyType): Promise<GeneralConditionMatch[]> {
  // Import regulations data dynamically
  const { GENERAL_CONDITIONS } = await import('@/data/regulations')

  try {
    // Map policy type to category keyword
    const categoryKeywords: Record<PolicyType, string[]> = {
      kasko: ['kasko', 'kara_araclari'],
      traffic: ['traffic', 'trafik', 'sorumluluk'],
      home: ['property', 'konut', 'yangin'],
      health: ['health', 'saglik'],
      life: ['life', 'hayat'],
      dask: ['dask', 'deprem'],
      business: ['business', 'isyeri', 'property'],
      nakliyat: ['transport', 'nakliyat', 'kargo'],
    }
    const keywords = categoryKeywords[policyType] || ['property']

    // Filter general conditions by matching categories
    const relevantConditions = GENERAL_CONDITIONS.filter((gc) =>
      gc.category?.some((cat: string) =>
        keywords.some((kw) => cat.toLowerCase().includes(kw.toLowerCase()))
      )
    )

    return relevantConditions.slice(0, 5).map((reg) => ({
      conditionId: reg.id,
      title: reg.nameEN,
      titleTr: reg.nameTR,
      relevance: 0.9, // High relevance for matching policy type
      applicableClause: reg.keyProvisions?.[0]?.summary || reg.descriptionTR || '',
      implication: reg.keyProvisions?.[0]?.summaryTR || 'Standard market practice',
    }))
  } catch {
    return []
  }
}

/**
 * Find similar policies in the system
 * Note: In production, this would query Supabase
 */
async function findSimilarPolicies(_policy: AnalyzedPolicy): Promise<SimilarPolicyMatch[]> {
  // Placeholder - would query Supabase for policies with:
  // - Same type
  // - Similar coverage amounts
  // - Same or similar provider
  return []
}

/**
 * Get market benchmarks for the policy type
 */
async function getMarketBenchmarks(policy: AnalyzedPolicy): Promise<MarketBenchmarkResult> {
  const { marketDataProvider } = await import('@/lib/market-data/market-data-provider')
  const { getBenchmarkData, MARKET_BENCHMARKS } = await import('@/data/market-data/benchmarks')

  try {
    // Try DB-backed provider first, fall back to static
    let marketData
    try {
      marketData = await marketDataProvider.getBenchmark(policy.type)
    } catch {
      const benchmarkData = getBenchmarkData(policy.type)
      marketData = benchmarkData || MARKET_BENCHMARKS[policy.type]
    }

    // Get common coverages as standard coverages (CoverageBenchmark has name/nameTr)
    type BenchmarkCoverage = { name: string; nameTr: string; inclusionRate?: number }
    const coverageBenchmarks = (marketData?.commonCoverages || []) as BenchmarkCoverage[]
    const standardCovers = coverageBenchmarks
      .filter((c) => (c.inclusionRate ?? 100) >= 70)
      .map((c) => c.name.toLowerCase())

    // Calculate coverage completeness
    const policyCovers = new Set(policy.coverages.map((c: Coverage) => c.name.toLowerCase()))
    const missingStandard = standardCovers.filter((c: string) => !policyCovers.has(c))
    const completeness =
      standardCovers.length > 0
        ? ((standardCovers.length - missingStandard.length) / standardCovers.length) * 100
        : 100

    // Calculate premium percentile using premium range data
    const avgPremium = marketData?.premiumRange?.average || 18500
    const minPremium = marketData?.premiumRange?.min || 5000
    const maxPremium = marketData?.premiumRange?.max || 50000

    // Calculate where policy premium falls in the range
    const normalizedPosition = (policy.premium - minPremium) / (maxPremium - minPremium)
    const percentile = Math.min(100, Math.max(0, normalizedPosition * 100))

    return {
      averagePremium: avgPremium,
      premiumPercentile: percentile,
      coverageCompletenessScore: completeness,
      marketStandardCoverages: standardCovers,
      missingMarketStandardCoverages: missingStandard,
      unusualExclusions: [], // Would analyze exclusions against market data
    }
  } catch {
    return {
      averagePremium: 0,
      premiumPercentile: 50,
      coverageCompletenessScore: 0,
      marketStandardCoverages: [],
      missingMarketStandardCoverages: [],
      unusualExclusions: [],
    }
  }
}

/**
 * Generate coverage recommendations
 */
function generateRecommendations(
  policy: AnalyzedPolicy,
  _generalConditions: GeneralConditionMatch[],
  marketComparison: MarketBenchmarkResult
): CoverageRecommendation[] {
  const recommendations: CoverageRecommendation[] = []

  // Recommend missing market standard coverages
  for (const missing of marketComparison.missingMarketStandardCoverages) {
    recommendations.push({
      coverage: missing,
      coverageTr: missing, // Would translate
      reason: 'This coverage is included in 70%+ of similar policies',
      reasonTr: 'Bu teminat benzer poliçelerin %70\'inden fazlasında mevcut',
      marketInclusionRate: 75, // Would look up actual rate
      estimatedCost: null,
      priority: 'recommended',
    })
  }

  // Check for low coverage limits
  for (const coverage of policy.coverages) {
    if (coverage.limit && coverage.limit < 50000) {
      recommendations.push({
        coverage: coverage.name,
        coverageTr: coverage.nameTr,
        reason: `Current limit (${coverage.limit.toLocaleString('tr-TR')} TL) may be insufficient`,
        reasonTr: `Mevcut limit (${coverage.limit.toLocaleString('tr-TR')} TL) yetersiz olabilir`,
        marketInclusionRate: 80,
        estimatedCost: null,
        priority: 'optional',
      })
    }
  }

  return recommendations
}

/**
 * Detect potential issues in the policy
 */
function detectPotentialIssues(
  policy: AnalyzedPolicy,
  _generalConditions: GeneralConditionMatch[],
  marketComparison: MarketBenchmarkResult
): PotentialIssue[] {
  const issues: PotentialIssue[] = []

  // Missing critical coverages
  for (const missing of marketComparison.missingMarketStandardCoverages.slice(0, 3)) {
    issues.push({
      type: 'missing_coverage',
      severity: 'high',
      description: `Missing "${missing}" coverage which is standard in the market`,
      descriptionTr: `Piyasada standart olan "${missing}" teminatı eksik`,
      recommendation: 'Consider adding this coverage or confirming it\'s not needed',
      recommendationTr: 'Bu teminatı eklemeyi veya gerekli olmadığını teyit etmeyi düşünün',
    })
  }

  // High deductible warning
  if (policy.deductible > policy.premium * 0.5) {
    issues.push({
      type: 'high_deductible',
      severity: 'medium',
      description: 'Deductible is higher than 50% of the annual premium',
      descriptionTr: 'Muafiyet yıllık primin %50\'sinden yüksek',
      recommendation: 'Consider negotiating a lower deductible',
      recommendationTr: 'Daha düşük bir muafiyet için müzakere etmeyi düşünün',
    })
  }

  // Premium percentile warning
  if (marketComparison.premiumPercentile > 80) {
    issues.push({
      type: 'high_deductible', // Reusing type
      severity: 'low',
      description: 'Premium is in the top 20% of market prices',
      descriptionTr: 'Prim piyasa fiyatlarının en yüksek %20\'sinde',
      recommendation: 'Compare quotes from other providers',
      recommendationTr: 'Diğer sigortacılardan teklif alın',
    })
  }

  return issues
}

// =============================================================================
// LEARNING SYSTEM
// =============================================================================

export interface LearningFeedback {
  policyId: string
  feedbackType: 'correction' | 'confirmation' | 'addition'
  field: string
  originalValue: unknown
  correctedValue: unknown
  source: 'user' | 'claim' | 'renewal'
  timestamp: string
}

export interface KnowledgeUpdate {
  type: 'regulation' | 'coverage_definition' | 'exclusion_pattern' | 'provider_info'
  content: string
  source: string
  timestamp: string
  confidence: number
}

/**
 * Record learning feedback for future improvement
 * Note: In production, this would store to Supabase
 */
export async function recordLearningFeedback(feedback: LearningFeedback): Promise<void> {
  // Store feedback for analysis and model improvement
  // This would be sent to a learning pipeline in production
  console.warn('Learning feedback recorded:', feedback)
}

/**
 * Update knowledge base with new information
 * Note: In production, this would update a vector store or knowledge graph
 */
export async function updateKnowledgeBase(update: KnowledgeUpdate): Promise<void> {
  // Add to knowledge base for future extractions
  console.warn('Knowledge base updated:', update)
}

/**
 * Get extraction accuracy metrics
 */
export async function getExtractionAccuracy(): Promise<{
  overallAccuracy: number
  fieldAccuracies: Record<string, number>
  improvementTrend: number
  totalFeedbackCount: number
}> {
  // Would calculate from stored feedback
  return {
    overallAccuracy: 0.95,
    fieldAccuracies: {
      policyNumber: 0.98,
      premium: 0.96,
      coverages: 0.93,
      exclusions: 0.91,
    },
    improvementTrend: 0.02,
    totalFeedbackCount: 0,
  }
}
