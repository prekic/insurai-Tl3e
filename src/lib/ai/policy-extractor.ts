import { isAIConfigured, AI_CONFIG, getConfiguredProviders, isOCRConfigured, type AIProvider } from './config'
import { extractTextFromPDF, isPDFFile } from './pdf-parser'
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
        details: 'Set VITE_OPENAI_API_KEY or VITE_ANTHROPIC_API_KEY in your environment variables',
      },
      fallbackAvailable: false,
    }
  }

  // Extract text from PDF
  const parseResult = await extractTextFromPDF(file)
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

  return {
    id: `policy-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
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
    id: `policy-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
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
 * Generate policy gaps based on extracted data
 */
function generateGaps(data: ExtractedPolicyData): string[] {
  const gaps: string[] = []

  if (data.exclusions.length > 5) {
    gaps.push('Multiple exclusions may limit coverage in certain scenarios')
  }

  if (data.coverages.some((c) => c.deductible && c.deductible > 10000)) {
    gaps.push('High deductibles may result in significant out-of-pocket costs')
  }

  if (data.coverages.length < 3) {
    gaps.push('Limited coverage areas - consider additional protection')
  }

  return gaps
}

/**
 * Generate recommendations based on extracted data
 */
function generateRecommendations(data: ExtractedPolicyData): string[] {
  const recommendations: string[] = []

  if (data.policyType === 'home' && !data.coverages.some((c) => c.name.toLowerCase().includes('deprem'))) {
    recommendations.push('Consider adding DASK earthquake insurance if not included')
  }

  if (data.premium && data.premium > 5000) {
    recommendations.push('Review annual premium - consider comparing with other providers')
  }

  if (data.coverages.length > 0) {
    recommendations.push('Review coverage limits annually to ensure adequate protection')
  }

  return recommendations
}

/**
 * Generate market comparison data
 */
function generateMarketComparison(data: ExtractedPolicyData): AnalyzedPolicy['marketComparison'] {
  const premium = data.premium ?? 0

  // Simulated market data (in production, this would come from a database)
  const marketData = {
    kasko: { avgPremium: 15000, avgCoverage: 500000, minPremium: 8000, maxPremium: 35000 },
    traffic: { avgPremium: 3500, avgCoverage: 100000, minPremium: 2000, maxPremium: 6000 },
    home: { avgPremium: 4500, avgCoverage: 300000, minPremium: 2000, maxPremium: 12000 },
    health: { avgPremium: 25000, avgCoverage: 1000000, minPremium: 10000, maxPremium: 80000 },
    life: { avgPremium: 8000, avgCoverage: 500000, minPremium: 3000, maxPremium: 30000 },
    dask: { avgPremium: 500, avgCoverage: 200000, minPremium: 200, maxPremium: 2000 },
    business: { avgPremium: 20000, avgCoverage: 1000000, minPremium: 5000, maxPremium: 100000 },
  }

  const policyType = (data.policyType ?? 'home') as PolicyType
  const market = marketData[policyType] ?? marketData.home

  // Calculate percentile
  const range = market.maxPremium - market.minPremium
  const percentile = Math.min(100, Math.max(0, ((premium - market.minPremium) / range) * 100))

  return {
    averagePremium: market.avgPremium,
    averageCoverage: market.avgCoverage,
    percentile: Math.round(percentile),
  }
}
