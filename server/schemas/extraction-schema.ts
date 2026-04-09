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
          {
            type: 'string',
            enum: ['kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business', 'nakliyat'],
          },
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
          'Currency code - REQUIRED IF PRESENT. Look for: ₺/TL/TRY=TRY, $/USD=USD, €/EUR=EUR, £/GBP=GBP. Check symbols near premium and coverage amounts. Return null if no currency can be found. DO NOT default to TRY or any other currency. ALWAYS return the 3-letter ISO currency code (e.g., TRY, USD, EUR) if found.',
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
            nameTr: {
              type: ['string', 'null'],
              description:
                'Coverage name in Turkish. For Turkish policies, provide the original Turkish name (e.g., "Çarpma/Çarpışma", "Hırsızlık", "Yangın"). For English policies, set to null.',
            },
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
                {
                  type: 'string',
                  enum: ['main', 'liability', 'supplementary', 'assistance', 'legal', 'other'],
                },
                { type: 'null' },
              ],
              description:
                'Coverage category: main (Ana Teminat), liability (Mali Sorumluluk), supplementary (Ek Teminat), assistance (Asistans), legal (Hukuki Koruma), other',
            },
          },
          // STRICT MODE: ALL properties must be in required
          required: [
            'name',
            'nameTr',
            'limit',
            'deductible',
            'description',
            'isUnlimited',
            'isMarketValue',
            'category',
          ],
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
      exclusionsEn: {
        type: ['array', 'null'],
        items: { type: 'string' },
        description:
          'REQUIRED: English translation of each exclusion at the same array index. For Turkish policies, ALWAYS provide this array with the same length as "exclusions". Example: exclusions=["Deprem hariçtir"] → exclusionsEn=["Earthquake is excluded"].',
      },
      conditionalDeductibles: {
        type: ['array', 'null'],
        items: {
          type: 'object',
          properties: {
            trigger: {
              type: 'string',
              description:
                'What triggers the deductible (e.g. "driver under 26", "license < 3 years", "non-contracted service", "partial loss")',
            },
            rate: {
              type: 'string',
              description:
                'The deductible amount or percentage as written (e.g. "%35", "20%", "5000 TL")',
            },
            evidence: {
              type: 'string',
              description:
                'Verbatim direct quote from the policy text proving this deductible exists. DO NOT paraphrase.',
            },
          },
          required: ['trigger', 'rate', 'evidence'],
          additionalProperties: false,
        },
        description:
          'Structured conditional deductibles (muafiyet / tenzili muafiyet). List every scenario-triggered deductible with verbatim evidence. Return null if none present.',
      },
      evidence: {
        type: 'object',
        properties: {
          insights: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: {
                  type: 'string',
                  description:
                    'The insight text (e.g., "✓ Mükemmel sağlık teminatı" or "💡 Yurt dışı teminatı eklemeyi düşünün")',
                },
                textEn: {
                  type: 'string',
                  description: 'The English translation of the insight text',
                },
                quote: {
                  type: 'string',
                  description:
                    'The exact verbatim quote from the raw document that proves this insight. DO NOT paraphrase. Extract directly from the text.',
                },
                quoteTr: {
                  type: ['string', 'null'],
                  description:
                    'If the original quote is NOT in Turkish, provide its Turkish translation here. If the original is already in Turkish, set to null.',
                },
              },
              required: ['text', 'textEn', 'quote', 'quoteTr'],
              additionalProperties: false,
            },
            description: 'List of insights with corroborating quotes from the text',
          },
          exclusions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                text: {
                  type: 'string',
                  description: 'The exclusion text',
                },
                textEn: {
                  type: 'string',
                  description: 'The English translation of the exclusion text',
                },
                quote: {
                  type: 'string',
                  description:
                    'The exact verbatim quote from the raw document that proves this exclusion. DO NOT paraphrase.',
                },
                quoteTr: {
                  type: ['string', 'null'],
                  description:
                    'If the original quote is NOT in Turkish, provide its Turkish translation here. If the original is already in Turkish, set to null.',
                },
              },
              required: ['text', 'textEn', 'quote', 'quoteTr'],
              additionalProperties: false,
            },
            description: 'List of exclusions with corroborating quotes from the text',
          },
        },
        required: ['insights', 'exclusions'],
        additionalProperties: false,
        description:
          'Verbatim evidence quotes from the source document for insights and exclusions',
      },
      clauseGraph: {
        type: 'object',
        properties: {
          edges: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                sourceId: { type: 'string', description: 'Name of the source coverage or clause' },
                targetId: {
                  type: ['string', 'null'],
                  description: 'Name of the target coverage or clause. Use null if ambiguous.',
                },
                relationshipType: {
                  type: 'string',
                  enum: [
                    'coverage_inclusion',
                    'conditional_restriction',
                    'deductible_trigger',
                    'sublimit',
                    'carve_out',
                    'endorsement_override',
                    'service_benefit_linkage',
                  ],
                  description: 'Type of relationship',
                },
                description: {
                  type: ['string', 'null'],
                  description: 'Explanation of the relationship',
                },
                isCandidate: {
                  type: 'boolean',
                  description:
                    'Set to true if this relationship is unclear or ambiguous and needs review',
                },
              },
              required: ['sourceId', 'targetId', 'relationshipType', 'description', 'isCandidate'],
              additionalProperties: false,
            },
          },
        },
        required: ['edges'],
        additionalProperties: false,
        description:
          'A graph representing relationships and overrides between clauses and coverages',
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
      'exclusionsEn',
      'conditionalDeductibles',
      'evidence',
      'clauseGraph',
      'amendmentInfo',
      'confidence',
    ],
    additionalProperties: false,
  },
} as const
