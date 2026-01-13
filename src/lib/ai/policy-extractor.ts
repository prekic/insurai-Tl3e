import { isAIConfigured, AI_CONFIG, getConfiguredProviders, isOCRConfigured, type AIProvider } from './config'
import { extractTextFromPDFWithRetry, isPDFFile } from './pdf-parser'
import { isLikelyScannedPDF, performOCR } from './ocr'
import { extractWithConsensus, type ConsensusResult } from './providers/consensus'
import { extractWithOpenAI } from './providers/openai'
import { extractWithClaude } from './providers/claude'
import {
  ExtractedPolicyData,
} from './extraction-schema'
import type { AnalyzedPolicy, PolicyType, Coverage } from '@/types/policy'
import { POLICY_TYPES } from '@/types/policy'
import { samplePolicies } from '@/data/sample-policies'
import { generateMarketComparisonData } from '@/lib/market-data/service'
import { MARKET_BENCHMARKS } from '@/data/market-data/benchmarks'
import { RiskAssessmentService } from '@/lib/ml'
import { GapDetectionService } from '@/lib/gap-detection'

export interface ExtractionResult {
  success: true
  policy: AnalyzedPolicy
  extractedData: ExtractedPolicyData
  source: 'ai' | 'fallback' | 'ocr'
  // Multi-model consensus info
  consensus?: {
    providers: AIProvider[]
    agreement: number
    score: number
  }
}

export interface ExtractionError {
  success: false
  error: {
    code: 'NO_AI_CONFIG' | 'PDF_PARSE_ERROR' | 'AI_ERROR' | 'INVALID_FILE' | 'LOW_CONFIDENCE' | 'OCR_ERROR'
    message: string
    details?: string
  }
  fallbackAvailable: boolean
}

export type ExtractionResponse = ExtractionResult | ExtractionError

export interface ExtractionOptions {
  useFallback?: boolean
  useOCR?: boolean
  useConsensus?: boolean
  primaryProvider?: AIProvider
  providers?: AIProvider[]
}

/**
 * Extract policy data from a document file
 * Uses AI when available, falls back to sample data otherwise
 * Supports multi-model consensus and OCR for scanned documents
 */
export async function extractPolicyFromDocument(
  file: File,
  options: ExtractionOptions = {}
): Promise<ExtractionResponse> {
  const {
    useFallback = true,
    useOCR = true,
    useConsensus = true,
    primaryProvider,
    providers,
  } = options

  // Validate file type
  if (!isPDFFile(file)) {
    return {
      success: false,
      error: {
        code: 'INVALID_FILE',
        message: 'Only PDF files are supported for AI extraction',
        details: `Received file type: ${file.type}`,
      },
      fallbackAvailable: useFallback,
    }
  }

  // Check if AI is configured
  if (!isAIConfigured()) {
    if (useFallback) {
      return createFallbackResult(file)
    }
    return {
      success: false,
      error: {
        code: 'NO_AI_CONFIG',
        message: 'AI extraction is not configured',
        details: 'Ensure the backend server is running on port 4001 with OPENAI_API_KEY or ANTHROPIC_API_KEY set in .env (not VITE_ prefixed - API keys must stay server-side)',
      },
      fallbackAvailable: false,
    }
  }

  // Extract text from PDF (with automatic retry for transient errors)
  const parseResult = await extractTextFromPDFWithRetry(file)
  let documentText: string
  let usedOCR = false

  if (!parseResult.success) {
    // Check if we should try OCR
    if (useOCR && isOCRConfigured()) {
      const ocrResult = await performOCR(file)
      if (ocrResult.success && ocrResult.data.text.length > 50) {
        documentText = ocrResult.data.text
        usedOCR = true
      } else {
        if (useFallback) {
          return createFallbackResult(file)
        }
        return {
          success: false,
          error: {
            code: 'PDF_PARSE_ERROR',
            message: parseResult.error.message,
            details: parseResult.error.code,
          },
          fallbackAvailable: false,
        }
      }
    } else {
      if (useFallback) {
        return createFallbackResult(file)
      }
      return {
        success: false,
        error: {
          code: 'PDF_PARSE_ERROR',
          message: parseResult.error.message,
          details: parseResult.error.code,
        },
        fallbackAvailable: false,
      }
    }
  } else {
    // Check if PDF appears to be scanned and OCR is available
    if (
      useOCR &&
      isOCRConfigured() &&
      isLikelyScannedPDF(parseResult.data.text, parseResult.data.pageCount)
    ) {
      const ocrResult = await performOCR(file)
      if (ocrResult.success && ocrResult.data.text.length > parseResult.data.text.length) {
        documentText = ocrResult.data.text
        usedOCR = true
      } else {
        documentText = parseResult.data.text
      }
    } else {
      documentText = parseResult.data.text
    }
  }

  // Call AI for extraction
  try {
    const configuredProviders = getConfiguredProviders()
    const useMultiProvider = useConsensus && configuredProviders.length > 1

    let extractedData: ExtractedPolicyData
    let consensusInfo: ExtractionResult['consensus'] | undefined

    if (useMultiProvider) {
      // Use multi-model consensus
      const consensusResult: ConsensusResult = await extractWithConsensus(documentText, {
        providers,
        primaryProvider,
      })

      extractedData = consensusResult.data
      consensusInfo = {
        providers: consensusResult.providerResults
          .filter((r) => !r.error)
          .map((r) => r.provider),
        agreement: consensusResult.consensus.agreement,
        score: consensusResult.consensus.score,
      }
    } else {
      // Use single provider
      const provider = primaryProvider || configuredProviders[0]
      extractedData = await extractWithProvider(provider, documentText)
    }

    // Check confidence threshold
    if (extractedData.confidence.overall < AI_CONFIG.minConfidence) {
      if (useFallback) {
        console.warn(
          `Low confidence extraction (${extractedData.confidence.overall}), using fallback`
        )
        return createFallbackResult(file, extractedData)
      }
      return {
        success: false,
        error: {
          code: 'LOW_CONFIDENCE',
          message: `Extraction confidence too low: ${Math.round(extractedData.confidence.overall * 100)}%`,
          details: 'The AI could not reliably extract policy information',
        },
        fallbackAvailable: false,
      }
    }

    // Convert extracted data to AnalyzedPolicy format
    const policy = convertToAnalyzedPolicy(extractedData, file)

    return {
      success: true,
      policy,
      extractedData,
      source: usedOCR ? 'ocr' : 'ai',
      consensus: consensusInfo,
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown AI error'

    if (useFallback) {
      console.warn(`AI extraction failed: ${errorMessage}, using fallback`)
      return createFallbackResult(file)
    }

    return {
      success: false,
      error: {
        code: 'AI_ERROR',
        message: 'Failed to extract policy data',
        details: errorMessage,
      },
      fallbackAvailable: false,
    }
  }
}

/**
 * Extract using a specific provider
 */
async function extractWithProvider(provider: AIProvider, documentText: string): Promise<ExtractedPolicyData> {
  switch (provider) {
    case 'openai':
      return extractWithOpenAI(documentText)
    case 'anthropic':
      return extractWithClaude(documentText)
    default:
      throw new Error(`Unknown provider: ${provider}`)
  }
}

/**
 * Convert extracted data to AnalyzedPolicy format
 */
function convertToAnalyzedPolicy(data: ExtractedPolicyData, file: File): AnalyzedPolicy {
  const now = new Date()

  // Determine status based on dates
  let status: 'active' | 'expiring' | 'expired' | 'pending' = 'active'
  const expiryDateStr = data.endDate ?? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  if (data.endDate) {
    const endDate = new Date(data.endDate)
    const daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))

    if (daysUntilExpiry < 0) {
      status = 'expired'
    } else if (daysUntilExpiry <= 30) {
      status = 'expiring'
    }
  }

  // Convert coverages with Turkish names
  const coverages: Coverage[] = data.coverages.map((c) => ({
    name: c.name,
    nameTr: c.name, // AI extracts in original language
    limit: c.limit ?? 0,
    deductible: c.deductible ?? 0,
    included: true,
    description: c.description ?? undefined,
  }))

  // Calculate total coverage
  const totalCoverage = coverages.reduce((sum, c) => sum + c.limit, 0)

  // Get policy type info
  const policyType = data.policyType ?? 'home'
  const typeInfo = POLICY_TYPES[policyType]

  // Build the base policy first for risk assessment
  const basePolicy: AnalyzedPolicy = {
    id: crypto.randomUUID(),
    policyNumber: data.policyNumber ?? `POL-${Date.now()}`,
    type: policyType,
    typeTr: typeInfo.labelTr,
    provider: data.provider ?? 'Unknown Provider',
    logo: '', // Would need to be mapped from provider name
    coverage: totalCoverage,
    premium: data.premium ?? 0,
    monthlyPremium: (data.premium ?? 0) / 12,
    deductible: coverages[0]?.deductible ?? 0,
    startDate: data.startDate ?? now.toISOString().split('T')[0],
    expiryDate: expiryDateStr,
    status,
    uploadDate: now.toISOString().split('T')[0],
    fileName: file.name,
    documentType: 'PDF',
    documentUrl: URL.createObjectURL(file),
    insuredPerson: data.insuredName ?? undefined,
    location: data.insuredAddress ?? undefined,
    insuredAddress: data.insuredAddress ?? undefined,
    coverages,
    exclusions: data.exclusions,
    specialConditions: data.specialConditions,
    insuranceLine: typeInfo.label,
    aiConfidence: data.confidence.overall,
    aiInsights: [
      ...generateStrengths(data).map(s => `✓ ${s}`),
      ...generateGaps(data).map(g => `⚠ ${g}`),
      ...generateRecommendations(data).map(r => `💡 ${r}`),
    ],
    marketComparison: generateMarketComparison(data),
  }

  // Calculate ML-based risk score
  try {
    const quickRisk = RiskAssessmentService.getQuickRiskScore(basePolicy)
    const actionItems = RiskAssessmentService.getActionItems(basePolicy)

    basePolicy.riskScore = {
      overall: quickRisk.score,
      level: quickRisk.level,
      topIssue: quickRisk.topIssue,
      confidence: data.confidence.overall,
    }

    basePolicy.riskActions = actionItems
  } catch {
    // Risk scoring is optional, continue without it
  }

  // Perform comprehensive gap analysis
  try {
    const gapAnalysis = GapDetectionService.analyzePolicy(basePolicy)
    const actionItems = GapDetectionService.getActionItems(basePolicy)

    basePolicy.gapAnalysis = {
      overallScore: gapAnalysis.overallScore,
      criticalCount: gapAnalysis.gapCount.critical,
      highCount: gapAnalysis.gapCount.high,
      totalCount: gapAnalysis.gapCount.total,
      topIssue: gapAnalysis.prioritizedGaps[0]?.gap.title ?? null,
      topIssueTr: gapAnalysis.prioritizedGaps[0]?.gap.titleTr ?? null,
      financialExposure: gapAnalysis.financialSummary.totalExpectedLoss,
      remediationCost: gapAnalysis.financialSummary.estimatedRemediationCost,
    }

    basePolicy.gapActions = actionItems
  } catch {
    // Gap analysis is optional, continue without it
  }

  return basePolicy
}

/**
 * Create fallback result using sample data
 */
function createFallbackResult(
  file: File,
  partialData?: ExtractedPolicyData
): ExtractionResult {
  // Pick a random sample policy
  const samplePolicy = samplePolicies[Math.floor(Math.random() * samplePolicies.length)]

  // Create a new policy based on sample
  const policy: AnalyzedPolicy = {
    ...samplePolicy,
    id: crypto.randomUUID(),
    documentUrl: URL.createObjectURL(file),
    uploadDate: new Date().toISOString().split('T')[0],
    aiConfidence: partialData?.confidence.overall ?? 0.5,
  }

  return {
    success: true,
    policy,
    extractedData: partialData ?? createEmptyExtractedData(),
    source: 'fallback',
  }
}

/**
 * Create empty extracted data structure
 */
function createEmptyExtractedData(): ExtractedPolicyData {
  return {
    policyNumber: null,
    provider: null,
    policyType: null,
    insuredName: null,
    insuredAddress: null,
    startDate: null,
    endDate: null,
    premium: null,
    currency: null,
    paymentFrequency: null,
    coverages: [],
    specialConditions: [],
    exclusions: [],
    amendmentInfo: {
      isAmendment: false,
      amendmentNumber: null,
      amendmentDate: null,
      basePolicyNumber: null,
      amendmentReason: null,
      premiumDifference: null,
    },
    confidence: {
      overall: 0,
      policyNumber: 0,
      provider: 0,
      dates: 0,
      premium: 0,
      coverages: 0,
    },
  }
}

/**
 * Generate policy strengths based on extracted data
 */
function generateStrengths(data: ExtractedPolicyData): string[] {
  const strengths: string[] = []

  if (data.coverages.length > 3) {
    strengths.push('Comprehensive coverage with multiple protection areas')
  }

  if (data.coverages.some((c) => c.limit && c.limit > 500000)) {
    strengths.push('High coverage limits for major risks')
  }

  if (data.coverages.some((c) => c.deductible === 0)) {
    strengths.push('Zero deductible on some coverages')
  }

  if (data.specialConditions.length > 0) {
    strengths.push('Includes special endorsements for enhanced protection')
  }

  if (strengths.length === 0) {
    strengths.push('Standard coverage for policy type')
  }

  return strengths
}

/**
 * Generate policy gaps based on extracted data and market benchmarks
 */
function generateGaps(data: ExtractedPolicyData): string[] {
  const gaps: string[] = []
  const policyType = (data.policyType ?? 'home') as PolicyType
  const benchmark = MARKET_BENCHMARKS[policyType]

  // Check for high exclusion count
  if (data.exclusions.length > 5) {
    gaps.push('Multiple exclusions may limit coverage in certain scenarios')
  }

  // Check for high deductibles compared to market
  const avgDeductible = benchmark.commonCoverages.reduce(
    (sum, c) => sum + c.typicalDeductible,
    0
  ) / benchmark.commonCoverages.length

  if (data.coverages.some((c) => c.deductible && c.deductible > avgDeductible * 2)) {
    gaps.push('High deductibles may result in significant out-of-pocket costs')
  }

  // Check for limited coverage areas
  const criticalCoverages = benchmark.commonCoverages.filter(c => c.inclusionRate >= 90)

  // Check for missing critical coverages with smart matching
  // For traffic insurance, match based on coverage name AND limit to handle per-person/per-accident variants
  const isTrafficPolicy = policyType === 'traffic'

  for (const critical of criticalCoverages) {
    const criticalNameLower = critical.nameTr.toLowerCase()
    // Extract base name without qualifier (e.g., "Maddi Hasar" from "Maddi Hasar (kaza başı)")
    const baseNameMatch = criticalNameLower.match(/^([^(]+)/)
    const criticalBaseName = baseNameMatch ? baseNameMatch[1].trim() : criticalNameLower

    const hasCoverage = data.coverages.some(c => {
      const coverageNameLower = c.name.toLowerCase()
      const coverageLimit = c.limit ?? 0

      // Direct match
      if (coverageNameLower.includes(critical.name.toLowerCase()) ||
          coverageNameLower.includes(criticalNameLower)) {
        return true
      }

      // For traffic insurance, match base name + limit tolerance
      if (isTrafficPolicy) {
        // Check if the coverage matches the base name
        const matchesBaseName = coverageNameLower.includes(criticalBaseName) ||
          criticalBaseName.includes(coverageNameLower.replace(/\([^)]*\)/g, '').trim())

        if (matchesBaseName) {
          // If limits match within 10% tolerance, consider it a match
          const limitTolerance = critical.typicalLimit * 0.1
          if (Math.abs(coverageLimit - critical.typicalLimit) <= limitTolerance) {
            return true
          }
          // Per-accident limits are always higher, so also match if coverage >= expected
          if (criticalNameLower.includes('kaza başı') && coverageLimit >= critical.typicalLimit * 0.9) {
            return true
          }
        }
      }

      return false
    })

    if (!hasCoverage) {
      // For traffic insurance, don't report per-person variants as missing if per-accident variant exists
      // since policies often only show the per-accident (higher) limit
      if (isTrafficPolicy && criticalNameLower.includes('kişi başı')) {
        const hasPerAccident = data.coverages.some(c =>
          c.name.toLowerCase().includes(criticalBaseName) &&
          (c.limit ?? 0) >= critical.typicalLimit
        )
        if (hasPerAccident) continue // Skip this gap, per-accident coverage exists
      }

      gaps.push(`Missing common coverage: ${critical.nameTr}`)
    }
  }

  // Check for underinsured coverages
  const totalCoverage = data.coverages.reduce((sum, c) => sum + (c.limit ?? 0), 0)
  if (totalCoverage < benchmark.coverageRange.average * 0.5) {
    gaps.push('Total coverage significantly below market average')
  }

  // DASK check for home policies
  if (policyType === 'home') {
    const hasDaskMention = data.coverages.some(c =>
      c.name.toLowerCase().includes('deprem') ||
      c.name.toLowerCase().includes('dask') ||
      c.name.toLowerCase().includes('earthquake')
    )
    if (!hasDaskMention) {
      gaps.push('Consider adding DASK earthquake insurance if not included')
    }
  }

  return gaps.slice(0, 5) // Limit to top 5 gaps
}

/**
 * Generate recommendations based on extracted data and market benchmarks
 */
function generateRecommendations(data: ExtractedPolicyData): string[] {
  const recommendations: string[] = []
  const policyType = (data.policyType ?? 'home') as PolicyType
  const benchmark = MARKET_BENCHMARKS[policyType]

  // Premium comparison recommendation
  if (data.premium && data.premium > benchmark.premiumRange.percentile75) {
    recommendations.push('Premium is above 75th percentile - compare with other providers')
  }

  // Coverage limit recommendation
  const totalCoverage = data.coverages.reduce((sum, c) => sum + (c.limit ?? 0), 0)
  if (totalCoverage < benchmark.coverageRange.median) {
    recommendations.push('Coverage below market median - consider increasing limits')
  }

  // Market trend awareness
  if (benchmark.trends.premiumChangeYoY > 30) {
    recommendations.push(`Market premiums increased ${Math.round(benchmark.trends.premiumChangeYoY)}% YoY - lock in rates early`)
  }

  // Annual review recommendation
  recommendations.push('Review coverage limits annually to ensure adequate protection')

  // Specific policy type recommendations
  if (policyType === 'kasko') {
    recommendations.push('Consider bundling with traffic insurance for discounts')
  } else if (policyType === 'health') {
    recommendations.push('Review network hospitals and coverage scope before renewal')
  } else if (policyType === 'business') {
    if (!data.coverages.some(c => c.name.toLowerCase().includes('siber') || c.name.toLowerCase().includes('cyber'))) {
      recommendations.push('Consider cyber insurance for digital business risks')
    }
  }

  return recommendations.slice(0, 4) // Limit to top 4 recommendations
}

/**
 * Generate market comparison data using real market benchmarks
 */
function generateMarketComparison(data: ExtractedPolicyData): AnalyzedPolicy['marketComparison'] {
  const premium = data.premium ?? 0
  const policyType = (data.policyType ?? 'home') as PolicyType
  const location = data.insuredAddress ?? undefined

  // Calculate total coverage from coverages
  const totalCoverage = data.coverages.reduce((sum, c) => sum + (c.limit ?? 0), 0)

  // Use the new market data service for accurate benchmarking
  return generateMarketComparisonData(premium, totalCoverage, policyType, location)
}
