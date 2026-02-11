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
          overall: {
            type: 'number',
            description:
              'Weighted average of per-field scores: policyNumber*0.20 + provider*0.15 + dates*0.20 + premium*0.20 + coverages*0.25. A clearly printed document with readable fields should score 0.85-0.95.',
          },
          policyNumber: {
            type: 'number',
            description:
              '1.0=found explicitly, 0.8-0.9=found with minor ambiguity, 0.5-0.7=inferred, 0.1-0.4=guessed, 0.0=not found',
          },
          provider: {
            type: 'number',
            description:
              '1.0=found explicitly, 0.8-0.9=found with minor ambiguity, 0.5-0.7=inferred, 0.1-0.4=guessed, 0.0=not found',
          },
          dates: {
            type: 'number',
            description:
              '1.0=both dates found clearly, 0.8-0.9=dates found with minor ambiguity, 0.5-0.7=only one date or format unclear, 0.0=not found',
          },
          premium: {
            type: 'number',
            description:
              '1.0=found explicitly, 0.8-0.9=found with minor ambiguity, 0.5-0.7=inferred from context, 0.1-0.4=guessed, 0.0=not found',
          },
          coverages: {
            type: 'number',
            description:
              '1.0=all coverages clearly listed with limits, 0.8-0.9=most coverages found, 0.5-0.7=partial coverage list, 0.1-0.4=few coverages found, 0.0=none found',
          },
        },
        required: ['overall', 'policyNumber', 'provider', 'dates', 'premium', 'coverages'],
        additionalProperties: false,
        description:
          'Confidence scores for extracted fields. Overall is a weighted average of per-field scores (default: policyNumber 20%, provider 15%, dates 20%, premium 20%, coverages 25%). A well-structured readable document should score 0.85-0.95 overall.',
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
