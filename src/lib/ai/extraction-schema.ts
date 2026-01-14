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

  // Amendment/Zeyilname detection (NEW)
  // Turkish insurance amendments have specific markers that distinguish them from original policies
  amendmentInfo: {
    isAmendment: boolean // true if document contains "ZEYİLNAME", "POLİÇE DEĞİŞİKLİĞİ", or similar markers
    amendmentNumber: string | null // e.g., "1/2024", "2/2024" - extracted from "NO: N/YYYY" or "Değişiklik No: N"
    amendmentDate: string | null // Effective date of amendment (Geçerlilik Tarihi) in YYYY-MM-DD
    basePolicyNumber: string | null // Original policy number this amends (Ana Poliçe No)
    amendmentReason: string | null // e.g., "Sigortalı Talebi", "Prim Farkı", "Teminat Eklenmesi"
    premiumDifference: number | null // Premium change amount (can be negative for refunds)
  }

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
        enum: ['kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business', 'nakliyat', null],
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
        description: 'Currency code - REQUIRED. Look for: ₺/TL/TRY=TRY, $/USD=USD, €/EUR=EUR, £/GBP=GBP. Check symbols near premium and coverage amounts. Default to TRY only if no indicator found.',
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
      amendmentInfo: {
        type: 'object',
        properties: {
          isAmendment: {
            type: 'boolean',
            description: 'true if document is a Zeyilname/Amendment (contains "ZEYİLNAME", "POLİÇE DEĞİŞİKLİĞİ", "ENDORSEMENT", "DEĞİŞİKLİK NO")',
          },
          amendmentNumber: {
            type: ['string', 'null'],
            description: 'Amendment sequence number (e.g., "1/2024", "2/2024") from "NO: N/YYYY" or "Değişiklik No: N"',
          },
          amendmentDate: {
            type: ['string', 'null'],
            description: 'Effective date of amendment (Geçerlilik Tarihi) in YYYY-MM-DD format',
          },
          basePolicyNumber: {
            type: ['string', 'null'],
            description: 'Original policy number this amends (Ana Poliçe No)',
          },
          amendmentReason: {
            type: ['string', 'null'],
            description: 'Reason for amendment (e.g., "Sigortalı Talebi", "Prim Farkı", "Teminat Eklenmesi")',
          },
          premiumDifference: {
            type: ['number', 'null'],
            description: 'Premium change amount (Prim Farkı) - positive for increase, negative for refund',
          },
        },
        required: ['isAmendment', 'amendmentNumber', 'amendmentDate', 'basePolicyNumber', 'amendmentReason', 'premiumDifference'],
        additionalProperties: false,
        description: 'Amendment/Zeyilname detection - identifies if this is a policy change document',
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
      'amendmentInfo',
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
   - nakliyat = Transportation/Cargo insurance (Nakliyat/Emtia)

3. **Date Format**: Always convert dates to YYYY-MM-DD format

4. **Currency Detection** (CRITICAL):
   - Look carefully at the currency symbols and text near monetary values
   - Most Turkish policies use TRY (Turkish Lira):
     - Indicators: ₺, TL, TRY, "Türk Lirası", "-TL", "TL."
   - Common foreign currencies in Turkish policies:
     - USD: $, USD, "Amerikan Doları", "ABD Doları", "Dolar"
     - EUR: €, EUR, "Euro", "Avro"
     - GBP: £, GBP, "Sterlin", "İngiliz Sterlini"
   - Other worldwide currencies (use 3-letter ISO code):
     - JPY/CNY: ¥, Yen, Yuan, Renminbi
     - CHF: CHF, "İsviçre Frangı", Swiss Franc
     - AED: د.إ, AED, Dirham
     - SAR: ﷼, SAR, Riyal
     - INR: ₹, INR, Rupee
     - AUD: A$, AUD, Australian Dollar
     - CAD: C$, CAD, Canadian Dollar
     - SEK/NOK/DKK: kr, Krone/Krona
     - PLN: zł, PLN, Zloty
     - RUB: ₽, RUB, Ruble
     - KRW: ₩, KRW, Won
     - BRL: R$, BRL, Real
     - MXN: MX$, MXN, Peso
     - ZAR: R, ZAR, Rand
     - SGD: S$, SGD, Singapore Dollar
     - HKD: HK$, HKD, Hong Kong Dollar
   - Check the currency near:
     - Premium amount (Prim)
     - Coverage limits (Teminat Limiti)
     - Sum insured (Sigorta Bedeli)
   - If mixed currencies: use the currency of the main coverage/premium
   - Default to "TRY" only if no currency indicator is found
   - ALWAYS return the 3-letter ISO currency code (e.g., TRY, USD, EUR)

5. **Confidence Scores**: Rate your confidence (0-1) based on:
   - Clarity of the source text
   - Whether the information was explicitly stated vs inferred
   - Consistency of information across the document

6. **Missing Information**: Use null for fields you cannot confidently extract

7. **Coverages**: List all coverage items found, including:
   - Main coverage (Ana Teminat)
   - Additional coverages (Ek Teminatlar)
   - Optional protections

8. **CRITICAL - Amendment/Zeyilname Detection**:
   IMPORTANT: Determine if this document is an ORIGINAL POLICY or an AMENDMENT (Zeyilname).

   An AMENDMENT (Zeyilname) document will have ONE OR MORE of these markers:
   - Header containing: "ZEYİLNAME", "POLİÇE DEĞİŞİKLİĞİ", "ENDORSEMENT", "POLİÇE TADİLATI"
   - Amendment number: "NO: N/YYYY", "Değişiklik No: N", "Zeyilname No: N"
   - Reference text: "Ana Poliçe No:", "Esas Poliçe:", "Base Policy:"
   - Change reason: "Değişiklik Nedeni:", "Reason for Amendment:"
   - Premium difference: "Prim Farkı:", "Premium Adjustment:"

   For amendmentInfo:
   - isAmendment: Set to TRUE only if you find explicit amendment markers above
   - isAmendment: Set to FALSE for original policy documents (most documents)
   - amendmentNumber: Extract from "NO: 1/2024" or "Değişiklik No: 1" format
   - amendmentDate: The effective date of the amendment (Geçerlilik Tarihi)
   - basePolicyNumber: The original policy being amended (may be same as policyNumber)
   - amendmentReason: e.g., "Sigortalı Talebi", "Teminat Eklenmesi", "Prim Düzeltmesi"
   - premiumDifference: Amount added/subtracted from premium (can be negative)

   If NO amendment markers are found, set isAmendment to false and all other amendmentInfo fields to null.

Be thorough but accurate. It's better to return null than to guess incorrectly.`
