import type { PolicyType } from '@/types/policy'

/**
 * Schema for AI-extracted policy data
 * This defines the structure that GPT-4 should return
 */
export interface ExtractedPolicyData {
  // Basic policy information
  policyNumber: string | null
  provider: string | null
  policyType: PolicyType | null

  // Policyholder information
  insuredName: string | null
  insuredAddress: string | null

  // Dates
  startDate: string | null // ISO date string
  endDate: string | null // ISO date string

  // Financial details
  premium: number | null
  currency: string | null
  paymentFrequency: 'annual' | 'semi-annual' | 'quarterly' | 'monthly' | null

  // Coverage information
  coverages: ExtractedCoverage[]

  // Special conditions and exclusions
  specialConditions: string[]
  exclusions: string[]

  // Confidence scores for each field
  confidence: {
    overall: number
    policyNumber: number
    provider: number
    dates: number
    premium: number
    coverages: number
  }
}

export interface ExtractedCoverage {
  name: string
  limit: number | null
  deductible: number | null
  description: string | null
}

/**
 * JSON Schema for OpenAI structured output
 * This ensures GPT-4 returns data in the expected format
 */
export const EXTRACTION_JSON_SCHEMA = {
  name: 'policy_extraction',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      policyNumber: {
        type: ['string', 'null'],
        description: 'The unique policy number/identifier',
      },
      provider: {
        type: ['string', 'null'],
        description: 'Insurance company name (e.g., Allianz, Axa, Mapfre)',
      },
      policyType: {
        type: ['string', 'null'],
        enum: ['kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business', null],
        description: 'Type of insurance policy',
      },
      insuredName: {
        type: ['string', 'null'],
        description: 'Name of the insured person or entity',
      },
      insuredAddress: {
        type: ['string', 'null'],
        description: 'Address of the insured property or person',
      },
      startDate: {
        type: ['string', 'null'],
        description: 'Policy start date in YYYY-MM-DD format',
      },
      endDate: {
        type: ['string', 'null'],
        description: 'Policy end date in YYYY-MM-DD format',
      },
      premium: {
        type: ['number', 'null'],
        description: 'Total premium amount',
      },
      currency: {
        type: ['string', 'null'],
        description: 'Currency code (e.g., TRY, USD, EUR)',
      },
      paymentFrequency: {
        type: ['string', 'null'],
        enum: ['annual', 'semi-annual', 'quarterly', 'monthly', null],
        description: 'How often premium is paid',
      },
      coverages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Coverage name/type' },
            limit: { type: ['number', 'null'], description: 'Coverage limit amount' },
            deductible: { type: ['number', 'null'], description: 'Deductible amount' },
            description: { type: ['string', 'null'], description: 'Brief description' },
          },
          required: ['name'],
          additionalProperties: false,
        },
        description: 'List of coverage items',
      },
      specialConditions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Special conditions or endorsements',
      },
      exclusions: {
        type: 'array',
        items: { type: 'string' },
        description: 'What is NOT covered',
      },
      confidence: {
        type: 'object',
        properties: {
          overall: { type: 'number', description: '0-1 confidence in extraction quality' },
          policyNumber: { type: 'number', description: '0-1 confidence' },
          provider: { type: 'number', description: '0-1 confidence' },
          dates: { type: 'number', description: '0-1 confidence' },
          premium: { type: 'number', description: '0-1 confidence' },
          coverages: { type: 'number', description: '0-1 confidence' },
        },
        required: ['overall', 'policyNumber', 'provider', 'dates', 'premium', 'coverages'],
        additionalProperties: false,
        description: 'Confidence scores for extracted fields',
      },
    },
    required: [
      'policyNumber',
      'provider',
      'policyType',
      'insuredName',
      'insuredAddress',
      'startDate',
      'endDate',
      'premium',
      'currency',
      'paymentFrequency',
      'coverages',
      'specialConditions',
      'exclusions',
      'confidence',
    ],
    additionalProperties: false,
  },
} as const

/**
 * System prompt for policy extraction
 * Optimized for Turkish insurance documents
 */
export const EXTRACTION_SYSTEM_PROMPT = `You are an expert insurance document analyst specializing in Turkish insurance policies.

Your task is to extract structured information from insurance policy documents.

## Guidelines:

1. **Language**: Documents may be in Turkish or English. Common Turkish terms:
   - Poliçe = Policy
   - Sigortalı = Insured
   - Sigorta Ettiren = Policyholder
   - Prim = Premium
   - Teminat = Coverage
   - Muafiyet = Deductible
   - Başlangıç Tarihi = Start Date
   - Bitiş Tarihi = End Date

2. **Policy Types**:
   - kasko = Comprehensive auto insurance
   - traffic = Mandatory traffic/liability insurance
   - home = Home/property insurance (Konut)
   - health = Health insurance (Sağlık)
   - life = Life insurance (Hayat)
   - dask = Earthquake insurance (mandatory)
   - business = Commercial/business insurance

3. **Date Format**: Always convert dates to YYYY-MM-DD format

4. **Currency**: Turkish policies typically use TRY (Turkish Lira)

5. **Confidence Scores**: Rate your confidence (0-1) based on:
   - Clarity of the source text
   - Whether the information was explicitly stated vs inferred
   - Consistency of information across the document

6. **Missing Information**: Use null for fields you cannot confidently extract

7. **Coverages**: List all coverage items found, including:
   - Main coverage (Ana Teminat)
   - Additional coverages (Ek Teminatlar)
   - Optional protections

Be thorough but accurate. It's better to return null than to guess incorrectly.`
