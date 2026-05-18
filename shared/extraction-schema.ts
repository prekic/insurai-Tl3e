/**
 * Canonical Extraction JSON Schema — Single Source of Truth
 *
 * This is the unified schema used by BOTH client (via Vite bundler) and
 * server (via tsc with rootDir: ".."). Previously duplicated across:
 *   - src/lib/ai/extraction-schema.ts (client copy — now re-exports)
 *   - server/schemas/extraction-schema.ts (server copy — deleted)
 *
 * OpenAI strict mode requirements enforced here:
 *   1. ALL properties must be listed in 'required' at every level
 *   2. additionalProperties must be false at every level
 *   3. For nullable types, use type: ['string', 'null'] etc.
 *   4. For nullable enums, include null in the enum array AND in the type array
 *
 * When adding new fields:
 *   - Add to properties AND required (strict mode)
 *   - Update the test count assertion in src/lib/ai/extraction-schema.test.ts
 *   - Run: npx vitest run src/lib/ai/extraction-schema.test.ts
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
      bağlıPolNo: {
        type: ['string', 'null'],
        description:
          'Linked Policy Number (Bağlı Pol No). Used to detect fleet policies or continuations.',
      },
      provider: {
        type: ['string', 'null'],
        description: 'Insurance company name (e.g., Allianz, Axa, Mapfre)',
      },
      insurer: {
        type: ['string', 'null'],
        description:
          'Full insurer company name as stated on the policy (Sigorta Sirketi Unvani, e.g. "ANADOLU ANONIM TURK SIGORTA SIRKETI")',
      },
      policyType: {
        type: ['string', 'null'],
        enum: ['kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business', 'nakliyat', null],
        description: 'Type of insurance policy',
      },
      isBundle: {
        type: ['boolean', 'null'],
        description:
          'True when the policy is a bundled multi-product policy. Detect by looking at the title/product name for "Birleşik" (Turkish) or "Combined" (English), OR when the policy explicitly lists multiple separately-priced products on its cover page. False or null otherwise.',
      },
      bundleProducts: {
        type: ['array', 'null'],
        items: { type: 'string' },
        description:
          'When isBundle=true, the bundled product names exactly as written on the policy (e.g. ["Genişletilmiş Kasko", "Koltuk Ferdi Kaza", "Artan Mali Sorumluluk", "Hukuksal Koruma"]). Null when isBundle is false or null.',
      },
      previousInsurer: {
        type: ['string', 'null'],
        description:
          'Sprint 3 PR-S3.2 — when the policy text indicates a renewal or transfer from a different insurer (Turkish: "yenilenmiştir", "geçiş poliçesi", "devir", "önceki sigortacı"; English: "renewed from", "carry-over from", "transfer from"), extract the previous insurer\'s name (e.g. "Sompo Japan", "Aksigorta", "AXA"). Null when no transfer indicator is present. Often appears alongside an NCD/hasarsızlık-indirimi continuation note.',
      },
      insuredName: {
        type: ['string', 'null'],
        description: 'Name of the insured person or entity',
      },
      insuredAddress: {
        type: ['string', 'null'],
        description: 'Address of the insured property or person',
      },
      insuredEntityType: {
        type: ['string', 'null'],
        enum: ['individual', 'corporate', null],
        description:
          'Type of insured entity based on ID: TCKN (individual/gerçek kişi) vs VKN (corporate/tüzel kişi)',
      },
      vehicleUsage: {
        type: ['string', 'null'],
        enum: ['private', 'commercial', null],
        description:
          'Type of vehicle usage (KULLANIM TARZI): private (Hususi) or commercial (Ticari/Kamyonet/etc)',
      },
      startDate: {
        type: ['string', 'null'],
        description: 'Policy start date in YYYY-MM-DD format',
      },
      endDate: {
        type: ['string', 'null'],
        description: 'Policy end date in YYYY-MM-DD format',
      },
      vehicleMake: {
        type: ['string', 'null'],
        description:
          'Vehicle brand/make (e.g., VOLKSWAGEN, RENAULT, FIAT). Extract specifically the brand, not the model.',
      },
      vehicleModel: {
        type: ['string', 'null'],
        description:
          'Vehicle model and sub-model (e.g., TIGUAN 1.4 TSI ACT BMT 150 DSG HIGHLINE). Extract separately from the make.',
      },
      vehicleYear: {
        type: ['number', 'null'],
        description: 'Vehicle model year (e.g., 2016)',
      },
      vehiclePlate: {
        type: ['string', 'null'],
        description: 'License plate number of the vehicle',
      },
      vin: {
        type: ['string', 'null'],
        description: 'Vehicle Identification Number (Şasi No)',
      },
      tcKimlik: {
        type: ['string', 'null'],
        description: '11-digit Turkish national ID number (TCKN/TC Kimlik No)',
      },
      vkn: {
        type: ['string', 'null'],
        description: '10-digit Turkish Tax ID number (VKN/Vergi No)',
      },
      premium: {
        type: ['number', 'null'],
        description:
          'Total premium amount (Prim/Ödenecek Prim). DO NOT confuse with vehicle market value (Rayiç Bedel) which is usually in the millions.',
      },
      premiumNet: {
        type: ['number', 'null'],
        description:
          'Net premium before tax (Vergi Öncesi Prim). The premium amount before BSMV (Banka ve Sigorta Muameleleri Vergisi) and other taxes/charges are added.',
      },
      premiumTax: {
        type: ['number', 'null'],
        description:
          'Premium tax amount (BSMV / Banka ve Sigorta Muameleleri Vergisi). The tax portion of the premium, typically 5% of net premium in Turkey.',
      },
      sigortaBedeli: {
        type: ['number', 'null'],
        description:
          'Sum Insured / Sigorta Bedeli. Explicit contractual maximum payout limit. Do not extract market value (Rayiç Değer) text here, only a specific numeric limit if one is provided.',
      },
      currency: {
        type: ['string', 'null'],
        description:
          'Currency code - REQUIRED IF PRESENT. Look for: ₺/TL/TRY=TRY, $/USD=USD, €/EUR=EUR, £/GBP=GBP. Check symbols near premium and coverage amounts. Return null if no currency can be found. DO NOT default to TRY or any other currency. ALWAYS return the 3-letter ISO currency code (e.g., TRY, USD, EUR) if found.',
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
            name: { type: 'string', description: 'Coverage name/type in English' },
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
              type: ['string', 'null'],
              enum: ['main', 'liability', 'supplementary', 'assistance', 'legal', 'other', null],
              description:
                'Coverage category: main (Ana Teminat, vehicle/property value), liability (Mali Sorumluluk), supplementary (Ek Teminat), assistance (Asistans, İkame), legal (Hukuki Koruma), other',
            },
            included: {
              type: 'boolean',
              description:
                'Set to true if coverage is DAHİL (included/active). Set to false if coverage is HARİÇ (excluded/not purchased). Turkish policies often have a DAHİL/HARİÇ column — use it. Include BOTH DAHİL and HARİÇ coverages in this array. Default to true if status is ambiguous.',
            },
            isOptional: {
              type: 'boolean',
              description:
                'Set to true if coverage is optional / SECMELI / ISTEGE BAGLI (optional add-on the policyholder can choose). Default to false for standard coverages.',
            },
            limitType: {
              type: ['string', 'null'],
              enum: ['per_event', 'aggregate', 'combined', null],
              description:
                'Type of limit: per_event (Olay Başı), aggregate (Yıllık Toplam/Maktu), or combined.',
            },
            page: {
              type: ['number', 'null'],
              description:
                'The source page number where this coverage limit/deductible is defined.',
            },
            clause: {
              type: ['string', 'null'],
              description: 'The section or clause heading under which this coverage is listed.',
            },
            quote: {
              type: ['string', 'null'],
              description:
                'Verbatim quote of the coverage limit, deductible, or inclusion status as written in the text. Essential for grounding.',
            },
            carveOuts: {
              type: ['array', 'null'],
              items: { type: 'string' },
              description:
                'Optional list of carve-outs / exceptions that apply to this coverage (e.g. "Artan Mali Sorumluluk Sınırsız Teminatı Klozu — havalimanı, liman, akaryakıt deposu, rafineri ve benzeri yerlerde meydana gelen olaylar için azami 2.500.000 TL"). Use only when the policy text explicitly narrows an otherwise-unlimited or wide coverage in specific scenarios. Return null or [] when no carve-out applies.',
            },
          },
          // STRICT MODE: ALL properties must be in required (Issue #331).
          // limit, deductible, description, category, carveOuts are nullable
          // types so the LLM can return null when it can't determine a value.
          required: [
            'name',
            'nameTr',
            'limit',
            'deductible',
            'description',
            'isUnlimited',
            'isMarketValue',
            'category',
            'included',
            'isOptional',
            'limitType',
            'page',
            'clause',
            'quote',
            'carveOuts',
          ],
          additionalProperties: false,
        },
        description:
          'List of coverage items. IMPORTANT: Set isUnlimited=true for "Sınırsız", isMarketValue=true for "Rayiç Değer". Populate carveOuts when a coverage is explicitly capped for specific scenarios (airports, fuel depots, etc. on IMM Sınırsız is the canonical case).',
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
                'What triggers the deductible (e.g. "driver under 26", "license < 3 years", "non-contracted service", "partial loss", "total loss")',
            },
            rate: {
              type: 'string',
              description:
                'The deductible amount or percentage as written in the policy (e.g. "%35", "20%", "5000 TL")',
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
          'Structured conditional deductibles (muafiyet / tenzili muafiyet). List every scenario-triggered deductible: age-based, license-based, non-contracted service, repair-conditional, partial/total loss. Each entry MUST include a verbatim evidence quote. Return null or empty array ONLY if none are present in the document.',
      },
      discounts: {
        type: ['object', 'null'],
        properties: {
          ncdDiscount: {
            type: ['number', 'null'],
            description:
              'No-Claim Discount percentage (Hasarsızlık İndirimi). Integer percent, e.g. 40 for 40%. Null if not specified.',
          },
          groupDiscount: {
            type: ['number', 'null'],
            description:
              'Group / fleet discount percentage (Grup İndirimi / Filo İndirimi). Integer percent. Null if not specified.',
          },
          otherDiscountPct: {
            type: ['number', 'null'],
            description:
              'Any other discount percentage (Özel İndirim, Kampanya İndirimi, etc.). Integer percent. Null if not specified.',
          },
          evidence: {
            type: ['string', 'null'],
            description:
              'Verbatim quote from the policy text showing the discount line. DO NOT paraphrase. Null if no discount row found.',
          },
        },
        required: ['ncdDiscount', 'groupDiscount', 'otherDiscountPct', 'evidence'],
        additionalProperties: false,
        description:
          'Premium discounts applied to the policy. Set the whole object to null if no discount rows appear on the policy.',
      },
      amendmentInfo: {
        type: 'object',
        properties: {
          isAmendment: {
            type: 'boolean',
            description:
              'true if document is a Zeyilname/Amendment (contains "ZEYİLNAME", "POLİÇE DEĞİŞİKLİĞİ", "ENDORSEMENT", "DEĞİŞİKLİK NO")',
          },
          amendmentNumber: {
            type: ['string', 'null'],
            description:
              'Amendment sequence number (e.g., "1/2024", "2/2024") from "NO: N/YYYY" or "Değişiklik No: N"',
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
            description:
              'Reason for amendment (e.g., "Sigortalı Talebi", "Prim Farkı", "Teminat Eklenmesi")',
          },
          premiumDifference: {
            type: ['number', 'null'],
            description:
              'Premium change amount (Prim Farkı) - positive for increase, negative for refund',
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
        description:
          'Amendment/Zeyilname detection - identifies if this is a policy change document',
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
                  description:
                    'The English translation of the insight text (e.g., "✓ Excellent health coverage" or "💡 Consider adding international coverage")',
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
                  description: 'The specific exclusion (e.g., "Deprem teminatı hariçtir")',
                },
                textEn: {
                  type: 'string',
                  description:
                    'The English translation of the exclusion text (e.g., "Earthquake coverage is excluded")',
                },
                quote: {
                  type: 'string',
                  description:
                    'The exact verbatim quote from the raw document stating this exclusion. DO NOT paraphrase.',
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
        description: 'Verbatim evidence supporting the generated insights and exclusions',
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
              // STRICT MODE: ALL properties must be in required (Issue #331).
              // description is a nullable type so the LLM can return null.
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
      qualityScore: {
        type: ['object', 'null'],
        properties: {
          readabilityStructure: { type: 'number' },
          completenessKeyFields: { type: 'number' },
          numericLimitsReconciled: { type: 'number' },
          noGuessingUncertaintiesListed: { type: 'number' },
          total: { type: 'number' },
        },
        required: [
          'readabilityStructure',
          'completenessKeyFields',
          'numericLimitsReconciled',
          'noGuessingUncertaintiesListed',
          'total',
        ],
        additionalProperties: false,
        description: 'Self-assessed extraction quality score',
      },
    },
    // STRICT MODE: ALL top-level properties must be in required (Issue #331).
    // exclusionsEn and conditionalDeductibles are nullable types, so the LLM
    // can return null and still satisfy the requirement. Removing them from
    // required would require also removing them from properties, which would
    // break extraction quality for Turkish KASKO docs that need them.
    required: [
      'policyNumber',
      'bağlıPolNo',
      'provider',
      'insurer',
      'policyType',
      'isBundle',
      'bundleProducts',
      'previousInsurer',
      'insuredName',
      'insuredAddress',
      'insuredEntityType',
      'vehicleUsage',
      'startDate',
      'endDate',
      'vehicleMake',
      'vehicleModel',
      'vehicleYear',
      'vehiclePlate',
      'vin',
      'tcKimlik',
      'vkn',
      'premium',
      'premiumNet',
      'premiumTax',
      'sigortaBedeli',
      'currency',
      'paymentFrequency',
      'discounts',
      'coverages',
      'specialConditions',
      'exclusions',
      'exclusionsEn',
      'conditionalDeductibles',
      'amendmentInfo',
      'evidence',
      'clauseGraph',
      'confidence',
      'qualityScore',
    ],
    additionalProperties: false,
  },
} as const
