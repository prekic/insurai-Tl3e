/**
 * Server-side Extraction Schema
 *
 * JSON Schema for OpenAI structured output with strict mode.
 *
 * IMPORTANT: OpenAI strict mode requirements:
 * 1. ALL properties must be listed in 'required' at every level
 * 2. additionalProperties must be false at every level
 * 3. For nullable types, use type: ['string', 'null'] etc.
 * 4. For nullable enums, include null in the enum array AND in the type array
 */

/**
 * JSON Schema for OpenAI structured output
 * Mirrors the client-side EXTRACTION_JSON_SCHEMA
 *
 * When strict: true, ALL properties at ALL levels must be in required.
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
        description: 'Insurance company name (e.g., Allianz, Axa, Anadolu Sigorta)',
      },
      policyType: {
        anyOf: [
          { type: 'string', enum: ['kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business', 'nakliyat'] },
          { type: 'null' },
        ],
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
        description:
          'Currency code - Look for: ₺/TL/TRY=TRY, $/USD=USD, €/EUR=EUR. Default to TRY if not found.',
      },
      paymentFrequency: {
        anyOf: [
          { type: 'string', enum: ['annual', 'semi-annual', 'quarterly', 'monthly'] },
          { type: 'null' },
        ],
        description: 'How often premium is paid',
      },
      coverages: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Coverage name/type' },
            limit: {
              type: ['number', 'null'],
              description: 'Coverage limit amount. Use null for Sınırsız or Rayiç Değer.',
            },
            deductible: { type: ['number', 'null'], description: 'Deductible amount' },
            description: { type: ['string', 'null'], description: 'Brief description' },
            isUnlimited: {
              type: 'boolean',
              description: 'Set to true if coverage shows "Sınırsız" (unlimited)',
            },
            isMarketValue: {
              type: 'boolean',
              description: 'Set to true if limit shows "Rayiç Değer" (market value)',
            },
            category: {
              anyOf: [
                { type: 'string', enum: ['main', 'liability', 'supplementary', 'assistance', 'legal', 'other'] },
                { type: 'null' },
              ],
              description:
                'Coverage category: main (Ana Teminat), liability (Mali Sorumluluk), supplementary (Ek Teminat), assistance (Asistans), legal (Hukuki Koruma), other',
            },
          },
          // STRICT MODE: ALL properties must be in required
          required: ['name', 'limit', 'deductible', 'description', 'isUnlimited', 'isMarketValue', 'category'],
          additionalProperties: false,
        },
        description: 'List of coverage items found in the policy',
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
            description:
              'true if document is a Zeyilname/Amendment (contains "ZEYİLNAME", "POLİÇE DEĞİŞİKLİĞİ")',
          },
          amendmentNumber: {
            type: ['string', 'null'],
            description: 'Amendment sequence number (e.g., "1/2024")',
          },
          amendmentDate: {
            type: ['string', 'null'],
            description: 'Effective date of amendment in YYYY-MM-DD format',
          },
          basePolicyNumber: {
            type: ['string', 'null'],
            description: 'Original policy number this amends',
          },
          amendmentReason: {
            type: ['string', 'null'],
            description: 'Reason for amendment',
          },
          premiumDifference: {
            type: ['number', 'null'],
            description: 'Premium change amount (can be negative)',
          },
        },
        required: [
          'isAmendment',
          'amendmentNumber',
          'amendmentDate',
          'basePolicyNumber',
          'amendmentReason',
          'premiumDifference',
        ],
        additionalProperties: false,
        description: 'Amendment/Zeyilname detection',
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
