import { AI_CONFIG, getConfiguredProviders, type AIProvider, type ConsensusField } from '../config'
import { ExtractedPolicyData } from '../extraction-schema'
import { extractWithOpenAI } from './openai'
import { extractWithClaude } from './claude'

export interface ProviderResult {
  provider: AIProvider
  data: ExtractedPolicyData
  error?: string
}

export interface ConsensusResult {
  // Final merged result
  data: ExtractedPolicyData
  // Individual provider results
  providerResults: ProviderResult[]
  // Consensus metrics
  consensus: {
    // How many providers agreed
    agreement: number
    // Fields that had consensus
    agreedFields: ConsensusField[]
    // Fields that had disagreement
    disagreedFields: ConsensusField[]
    // Overall consensus score (0-1)
    score: number
  }
  // Which provider was primary for the result
  primaryProvider: AIProvider
}

/**
 * Extract using multiple providers and build consensus
 */
export async function extractWithConsensus(
  documentText: string,
  options: {
    providers?: AIProvider[]
    requireConsensus?: boolean
    primaryProvider?: AIProvider
  } = {}
): Promise<ConsensusResult> {
  const configuredProviders = getConfiguredProviders()
  const providers = options.providers?.filter((p) => configuredProviders.includes(p)) ?? configuredProviders

  if (providers.length === 0) {
    throw new Error('No AI providers configured')
  }

  // If only one provider, just use it
  if (providers.length === 1) {
    const provider = providers[0]
    const data = await extractWithProvider(provider, documentText)

    return {
      data,
      providerResults: [{ provider, data }],
      consensus: {
        agreement: 1,
        agreedFields: [...AI_CONFIG.consensus.consensusFields],
        disagreedFields: [],
        score: 1,
      },
      primaryProvider: provider,
    }
  }

  // Extract from all providers in parallel
  const results = await Promise.allSettled(
    providers.map(async (provider) => {
      const data = await extractWithProvider(provider, documentText)
      return { provider, data }
    })
  )

  // Collect successful results
  const providerResults: ProviderResult[] = []
  for (let i = 0; i < results.length; i++) {
    const result = results[i]
    if (result.status === 'fulfilled') {
      providerResults.push(result.value)
    } else {
      providerResults.push({
        provider: providers[i],
        data: createEmptyData(),
        error: result.reason?.message || 'Unknown error',
      })
    }
  }

  // If all failed, throw error
  const successfulResults = providerResults.filter((r) => !r.error)
  if (successfulResults.length === 0) {
    throw new Error('All AI providers failed to extract data')
  }

  // If only one succeeded, use it
  if (successfulResults.length === 1) {
    return {
      data: successfulResults[0].data,
      providerResults,
      consensus: {
        agreement: 1,
        agreedFields: [...AI_CONFIG.consensus.consensusFields],
        disagreedFields: [],
        score: 1,
      },
      primaryProvider: successfulResults[0].provider,
    }
  }

  // Build consensus from multiple results
  const { mergedData, agreedFields, disagreedFields, consensusScore } = buildConsensus(successfulResults)

  // Determine primary provider (prefer the one with higher confidence)
  const primaryProvider =
    options.primaryProvider && successfulResults.some((r) => r.provider === options.primaryProvider)
      ? options.primaryProvider
      : successfulResults.reduce((best, current) =>
          current.data.confidence.overall > best.data.confidence.overall ? current : best
        ).provider

  return {
    data: mergedData,
    providerResults,
    consensus: {
      agreement: successfulResults.length,
      agreedFields,
      disagreedFields,
      score: consensusScore,
    },
    primaryProvider,
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
 * Build consensus from multiple extraction results
 */
function buildConsensus(results: ProviderResult[]): {
  mergedData: ExtractedPolicyData
  agreedFields: ConsensusField[]
  disagreedFields: ConsensusField[]
  consensusScore: number
} {
  const agreedFields: ConsensusField[] = []
  const disagreedFields: ConsensusField[] = []

  // Start with the highest confidence result as base
  const baseResult = results.reduce((best, current) =>
    current.data.confidence.overall > best.data.confidence.overall ? current : best
  )

  const mergedData = { ...baseResult.data }

  // Check consensus on key fields
  for (const field of AI_CONFIG.consensus.consensusFields) {
    const values = results.map((r) => getFieldValue(r.data, field))
    const uniqueNonNullValues = [...new Set(values.filter((v) => v !== null && v !== undefined))]

    if (uniqueNonNullValues.length <= 1) {
      // All agree (or only one has a value)
      agreedFields.push(field)
    } else if (areValuesEquivalent(uniqueNonNullValues, field)) {
      // Values are equivalent (e.g., same date in different formats)
      agreedFields.push(field)
    } else {
      // Disagreement - take the value from highest confidence provider for this field
      disagreedFields.push(field)
      // For disagreements, use the value from the provider with highest confidence for that field
      const bestForField = results.reduce((best, current) => {
        const currentConfidence = getFieldConfidence(current.data, field)
        const bestConfidence = getFieldConfidence(best.data, field)
        return currentConfidence > bestConfidence ? current : best
      })
      setFieldValue(mergedData, field, getFieldValue(bestForField.data, field))
    }
  }

  // Merge coverages - combine unique coverages from all providers
  mergedData.coverages = mergeCoverages(results.map((r) => r.data.coverages))

  // Merge exclusions and special conditions
  mergedData.exclusions = mergeStringArrays(results.map((r) => r.data.exclusions))
  mergedData.specialConditions = mergeStringArrays(results.map((r) => r.data.specialConditions))

  // Calculate overall confidence as average of all providers, weighted by consensus
  const avgConfidence =
    results.reduce((sum, r) => sum + r.data.confidence.overall, 0) / results.length
  const consensusBonus = agreedFields.length / AI_CONFIG.consensus.consensusFields.length
  mergedData.confidence.overall = Math.min(1, avgConfidence * (0.8 + consensusBonus * 0.2))

  // Calculate consensus score
  const consensusScore = agreedFields.length / AI_CONFIG.consensus.consensusFields.length

  return { mergedData, agreedFields, disagreedFields, consensusScore }
}

/**
 * Get field value from extracted data
 */
function getFieldValue(data: ExtractedPolicyData, field: ConsensusField): unknown {
  switch (field) {
    case 'policyNumber':
      return data.policyNumber
    case 'provider':
      return data.provider
    case 'premium':
      return data.premium
    case 'startDate':
      return data.startDate
    case 'endDate':
      return data.endDate
  }
}

/**
 * Set field value on extracted data
 */
function setFieldValue(data: ExtractedPolicyData, field: ConsensusField, value: unknown): void {
  switch (field) {
    case 'policyNumber':
      data.policyNumber = value as string | null
      break
    case 'provider':
      data.provider = value as string | null
      break
    case 'premium':
      data.premium = value as number | null
      break
    case 'startDate':
      data.startDate = value as string | null
      break
    case 'endDate':
      data.endDate = value as string | null
      break
  }
}

/**
 * Get field-specific confidence
 */
function getFieldConfidence(data: ExtractedPolicyData, field: ConsensusField): number {
  switch (field) {
    case 'policyNumber':
      return data.confidence.policyNumber
    case 'provider':
      return data.confidence.provider
    case 'premium':
      return data.confidence.premium
    case 'startDate':
    case 'endDate':
      return data.confidence.dates
    default:
      return data.confidence.overall
  }
}

/**
 * Check if values are equivalent (handles formatting differences)
 */
function areValuesEquivalent(values: unknown[], field: ConsensusField): boolean {
  if (values.length <= 1) return true

  // Normalize values for comparison
  const normalized = values.map((v) => normalizeValue(v, field))
  return normalized.every((v) => v === normalized[0])
}

/**
 * Normalize value for comparison
 */
function normalizeValue(value: unknown, field: ConsensusField): string {
  if (value === null || value === undefined) return ''

  switch (field) {
    case 'policyNumber':
      // Remove spaces and dashes for comparison
      return String(value).replace(/[\s-]/g, '').toLowerCase()
    case 'provider':
      // Normalize provider names
      return String(value).toLowerCase().replace(/\s+/g, ' ').trim()
    case 'premium':
      // Round to nearest whole number
      return String(Math.round(Number(value)))
    case 'startDate':
    case 'endDate':
      // Normalize date format
      try {
        return new Date(String(value)).toISOString().split('T')[0]
      } catch {
        return String(value)
      }
    default:
      return String(value)
  }
}

/**
 * Merge coverages from multiple providers
 */
function mergeCoverages(coverageArrays: ExtractedPolicyData['coverages'][]): ExtractedPolicyData['coverages'] {
  const merged = new Map<string, ExtractedPolicyData['coverages'][0]>()

  for (const coverages of coverageArrays) {
    for (const coverage of coverages) {
      const key = coverage.name.toLowerCase().replace(/\s+/g, ' ').trim()
      const existing = merged.get(key)

      if (!existing) {
        merged.set(key, { ...coverage })
      } else {
        // Merge: prefer higher limits, combine descriptions
        if (coverage.limit && (!existing.limit || coverage.limit > existing.limit)) {
          existing.limit = coverage.limit
        }
        if (coverage.deductible !== null && existing.deductible === null) {
          existing.deductible = coverage.deductible
        }
        if (coverage.description && !existing.description) {
          existing.description = coverage.description
        }
      }
    }
  }

  return Array.from(merged.values())
}

/**
 * Merge string arrays, removing duplicates
 */
function mergeStringArrays(arrays: string[][]): string[] {
  const seen = new Set<string>()
  const result: string[] = []

  for (const array of arrays) {
    for (const item of array) {
      const normalized = item.toLowerCase().trim()
      if (!seen.has(normalized)) {
        seen.add(normalized)
        result.push(item)
      }
    }
  }

  return result
}

/**
 * Create empty extracted data structure
 */
function createEmptyData(): ExtractedPolicyData {
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
