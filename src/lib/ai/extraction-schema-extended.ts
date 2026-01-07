/**
 * Extended Extraction Schema with Policy-Type-Specific Fields
 *
 * This extends the base extraction schema to capture type-specific data
 * that varies between kasko, health, DASK, etc.
 */

import type { PolicyType } from '@/types/policy'

// =============================================================================
// EXTENDED COVERAGE INTERFACE
// =============================================================================

export interface ExtendedCoverage {
  // Base fields
  name: string
  limit: number | null
  deductible: number | null
  description: string | null

  // Extended fields
  copayPercentage?: number // For health insurance
  waitingPeriodDays?: number // Waiting period before coverage starts
  coverageType?: 'mandatory' | 'optional' | 'bundled' // Coverage classification
  sublimits?: Array<{ name: string; limit: number }> // Sub-limits within coverage
  isIncluded?: boolean // Whether this coverage is active
  premiumAllocation?: number // Premium portion for this coverage
}

// =============================================================================
// POLICY-TYPE-SPECIFIC FIELDS
// =============================================================================

export interface VehicleInfo {
  make: string | null // Marka
  model: string | null // Model
  year: number | null // Model Yılı
  plateNumber: string | null // Plaka
  chassisNumber: string | null // Şasi No
  engineNumber: string | null // Motor No
  vehicleValue: number | null // Araç Değeri
  usageType: 'private' | 'commercial' | null // Kullanım Şekli
  vehicleClass?: string | null // Araç Türü (for traffic)
  passengerCount?: number | null // Yolcu Sayısı
}

export interface DriverInfo {
  age: number | null
  licenseYear: number | null
  bonusMalus: number | null // 1-7 scale
}

export interface PropertyInfo {
  propertyType: 'apartment' | 'detached' | 'villa' | 'residence' | 'commercial' | null
  constructionType: 'reinforced_concrete' | 'masonry' | 'wood' | 'steel' | null
  constructionYear: number | null
  totalArea: number | null // m²
  floorNumber: number | null
  totalFloors: number | null
  ownershipType: 'owner' | 'tenant' | null
  buildingValue: number | null
  contentsValue: number | null
  valuablesValue: number | null
}

export interface SecurityFeatures {
  hasAlarm: boolean
  hasSprinkler: boolean
  hasSecurityDoor: boolean
  hasSecurityCamera: boolean
  is24HourSecurity: boolean
}

export interface HealthCostSharing {
  copayPercentage: number | null
  annualDeductible: number | null
  outOfPocketMax: number | null
  perVisitCopay: number | null
}

export interface HealthLimits {
  annualLimit: number | null
  lifetimeLimit: number | null
  hospitalizationLimit: number | null
  outpatientLimit: number | null
}

export interface HealthWaitingPeriods {
  general: number | null // days
  maternity: number | null
  preExisting: number | null
}

export interface HealthNetworkInfo {
  networkType: 'broad' | 'narrow' | 'unlimited' | null
  preferredHospitals: string[]
}

export interface LifeBeneficiary {
  name: string
  relationship: string | null
  percentage: number | null
  isPrimary: boolean
}

export interface LifeRiders {
  hasAccidentalDeath: boolean
  hasDisability: boolean
  hasCriticalIllness: boolean
  hasWaiverOfPremium: boolean
  hasHospitalCash: boolean
}

export interface LifeCashValues {
  surrenderValue: number | null
  paidUpValue: number | null
  loanValue: number | null
}

export interface DaskBuildingInfo {
  buildingClass: 'A' | 'B' | null // A = reinforced concrete, B = other
  constructionYear: number | null
  totalArea: number | null
  floorCount: number | null
  unitFloor: number | null
  earthquakeZone: 1 | 2 | 3 | 4 | 5 | null
  landRegistryInfo: string | null
  apartmentNumber: string | null
  buildingType: 'residential' | 'commercial' | null
}

export interface BusinessInfo {
  businessType: string | null
  industryCode: string | null
  businessName: string | null
  taxNumber: string | null
  employeeCount: number | null
  annualRevenue: number | null
}

export interface BusinessValues {
  buildingValue: number | null
  stockValue: number | null
  equipmentValue: number | null
  fixturesValue: number | null
  businessInterruptionLimit: number | null
}

export interface BusinessLiability {
  publicLiabilityLimit: number | null
  productLiabilityLimit: number | null
  professionalLiabilityLimit: number | null
  employerLiabilityLimit: number | null
  cyberLiabilityLimit: number | null
}

export interface TrafficLiabilityLimits {
  bodilyInjuryPerPerson: number | null
  bodilyInjuryTotal: number | null
  propertyDamageLimit: number | null
  deathBenefitLimit: number | null
}

// =============================================================================
// EXTENDED EXTRACTED POLICY DATA
// =============================================================================

export interface ExtendedExtractedPolicyData {
  // ===== BASE FIELDS (from original schema) =====
  policyNumber: string | null
  provider: string | null
  policyType: PolicyType | null
  insuredName: string | null
  insuredAddress: string | null
  startDate: string | null
  endDate: string | null
  premium: number | null
  currency: string | null
  paymentFrequency: 'annual' | 'semi-annual' | 'quarterly' | 'monthly' | null
  coverages: ExtendedCoverage[]
  specialConditions: string[]
  exclusions: string[]
  confidence: {
    overall: number
    policyNumber: number
    provider: number
    dates: number
    premium: number
    coverages: number
  }

  // ===== TYPE-SPECIFIC FIELDS =====

  // Vehicle fields (kasko, traffic)
  vehicle?: VehicleInfo
  driver?: DriverInfo
  trafficLimits?: TrafficLiabilityLimits

  // Property fields (home, dask)
  property?: PropertyInfo
  security?: SecurityFeatures
  daskBuilding?: DaskBuildingInfo

  // Health fields
  healthCostSharing?: HealthCostSharing
  healthLimits?: HealthLimits
  healthWaiting?: HealthWaitingPeriods
  healthNetwork?: HealthNetworkInfo
  beneficiaryCount?: number
  beneficiaryType?: 'individual' | 'family' | 'group'

  // Life fields
  lifeBeneficiaries?: LifeBeneficiary[]
  lifeRiders?: LifeRiders
  lifeCashValues?: LifeCashValues
  policyVariant?: 'term' | 'whole_life' | 'endowment' | 'investment_linked'
  termYears?: number
  sumAssured?: number

  // Business fields
  business?: BusinessInfo
  businessValues?: BusinessValues
  businessLiability?: BusinessLiability
}

// =============================================================================
// EXTENDED JSON SCHEMA FOR OPENAI
// =============================================================================

/**
 * Get the JSON schema for a specific policy type
 * This allows OpenAI to extract type-specific fields
 */
export function getExtendedJsonSchema(policyType?: PolicyType | null) {
  // Base schema properties (always included)
  const baseProperties = {
    policyNumber: {
      type: ['string', 'null'],
      description: 'The unique policy number/identifier',
    },
    provider: {
      type: ['string', 'null'],
      description: 'Insurance company name',
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
      description: 'Currency code (e.g., TRY)',
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
          name: { type: 'string', description: 'Coverage name' },
          limit: { type: ['number', 'null'], description: 'Coverage limit' },
          deductible: { type: ['number', 'null'], description: 'Deductible' },
          description: { type: ['string', 'null'], description: 'Description' },
          copayPercentage: { type: ['number', 'null'], description: 'Copay % (health)' },
          waitingPeriodDays: { type: ['number', 'null'], description: 'Waiting period' },
          coverageType: {
            type: ['string', 'null'],
            enum: ['mandatory', 'optional', 'bundled', null],
          },
          isIncluded: { type: ['boolean', 'null'], description: 'Is active' },
        },
        required: ['name'],
        additionalProperties: false,
      },
    },
    specialConditions: {
      type: 'array',
      items: { type: 'string' },
    },
    exclusions: {
      type: 'array',
      items: { type: 'string' },
    },
    confidence: {
      type: 'object',
      properties: {
        overall: { type: 'number' },
        policyNumber: { type: 'number' },
        provider: { type: 'number' },
        dates: { type: 'number' },
        premium: { type: 'number' },
        coverages: { type: 'number' },
      },
      required: ['overall', 'policyNumber', 'provider', 'dates', 'premium', 'coverages'],
      additionalProperties: false,
    },
  }

  // Type-specific properties
  const typeSpecificProperties: Record<string, object> = {}
  const typeSpecificRequired: string[] = []

  if (policyType === 'kasko' || policyType === 'traffic' || !policyType) {
    typeSpecificProperties.vehicle = {
      type: ['object', 'null'],
      properties: {
        make: { type: ['string', 'null'] },
        model: { type: ['string', 'null'] },
        year: { type: ['number', 'null'] },
        plateNumber: { type: ['string', 'null'] },
        chassisNumber: { type: ['string', 'null'] },
        engineNumber: { type: ['string', 'null'] },
        vehicleValue: { type: ['number', 'null'] },
        usageType: { type: ['string', 'null'], enum: ['private', 'commercial', null] },
        vehicleClass: { type: ['string', 'null'] },
        passengerCount: { type: ['number', 'null'] },
      },
      additionalProperties: false,
    }
  }

  if (policyType === 'kasko' || !policyType) {
    typeSpecificProperties.driver = {
      type: ['object', 'null'],
      properties: {
        age: { type: ['number', 'null'] },
        licenseYear: { type: ['number', 'null'] },
        bonusMalus: { type: ['number', 'null'] },
      },
      additionalProperties: false,
    }
  }

  if (policyType === 'traffic' || !policyType) {
    typeSpecificProperties.trafficLimits = {
      type: ['object', 'null'],
      properties: {
        bodilyInjuryPerPerson: { type: ['number', 'null'] },
        bodilyInjuryTotal: { type: ['number', 'null'] },
        propertyDamageLimit: { type: ['number', 'null'] },
        deathBenefitLimit: { type: ['number', 'null'] },
      },
      additionalProperties: false,
    }
  }

  if (policyType === 'home' || policyType === 'dask' || !policyType) {
    typeSpecificProperties.property = {
      type: ['object', 'null'],
      properties: {
        propertyType: {
          type: ['string', 'null'],
          enum: ['apartment', 'detached', 'villa', 'residence', 'commercial', null],
        },
        constructionType: {
          type: ['string', 'null'],
          enum: ['reinforced_concrete', 'masonry', 'wood', 'steel', null],
        },
        constructionYear: { type: ['number', 'null'] },
        totalArea: { type: ['number', 'null'] },
        floorNumber: { type: ['number', 'null'] },
        totalFloors: { type: ['number', 'null'] },
        ownershipType: { type: ['string', 'null'], enum: ['owner', 'tenant', null] },
        buildingValue: { type: ['number', 'null'] },
        contentsValue: { type: ['number', 'null'] },
        valuablesValue: { type: ['number', 'null'] },
      },
      additionalProperties: false,
    }
  }

  if (policyType === 'dask' || !policyType) {
    typeSpecificProperties.daskBuilding = {
      type: ['object', 'null'],
      properties: {
        buildingClass: { type: ['string', 'null'], enum: ['A', 'B', null] },
        constructionYear: { type: ['number', 'null'] },
        totalArea: { type: ['number', 'null'] },
        floorCount: { type: ['number', 'null'] },
        unitFloor: { type: ['number', 'null'] },
        earthquakeZone: { type: ['number', 'null'], enum: [1, 2, 3, 4, 5, null] },
        landRegistryInfo: { type: ['string', 'null'] },
        apartmentNumber: { type: ['string', 'null'] },
        buildingType: { type: ['string', 'null'], enum: ['residential', 'commercial', null] },
      },
      additionalProperties: false,
    }
  }

  if (policyType === 'health' || !policyType) {
    typeSpecificProperties.healthCostSharing = {
      type: ['object', 'null'],
      properties: {
        copayPercentage: { type: ['number', 'null'] },
        annualDeductible: { type: ['number', 'null'] },
        outOfPocketMax: { type: ['number', 'null'] },
        perVisitCopay: { type: ['number', 'null'] },
      },
      additionalProperties: false,
    }
    typeSpecificProperties.healthLimits = {
      type: ['object', 'null'],
      properties: {
        annualLimit: { type: ['number', 'null'] },
        lifetimeLimit: { type: ['number', 'null'] },
        hospitalizationLimit: { type: ['number', 'null'] },
        outpatientLimit: { type: ['number', 'null'] },
      },
      additionalProperties: false,
    }
    typeSpecificProperties.healthWaiting = {
      type: ['object', 'null'],
      properties: {
        general: { type: ['number', 'null'] },
        maternity: { type: ['number', 'null'] },
        preExisting: { type: ['number', 'null'] },
      },
      additionalProperties: false,
    }
    typeSpecificProperties.beneficiaryCount = { type: ['number', 'null'] }
    typeSpecificProperties.beneficiaryType = {
      type: ['string', 'null'],
      enum: ['individual', 'family', 'group', null],
    }
  }

  if (policyType === 'life' || !policyType) {
    typeSpecificProperties.lifeBeneficiaries = {
      type: ['array', 'null'],
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          relationship: { type: ['string', 'null'] },
          percentage: { type: ['number', 'null'] },
          isPrimary: { type: 'boolean' },
        },
        required: ['name', 'isPrimary'],
        additionalProperties: false,
      },
    }
    typeSpecificProperties.lifeRiders = {
      type: ['object', 'null'],
      properties: {
        hasAccidentalDeath: { type: 'boolean' },
        hasDisability: { type: 'boolean' },
        hasCriticalIllness: { type: 'boolean' },
        hasWaiverOfPremium: { type: 'boolean' },
        hasHospitalCash: { type: 'boolean' },
      },
      additionalProperties: false,
    }
    typeSpecificProperties.policyVariant = {
      type: ['string', 'null'],
      enum: ['term', 'whole_life', 'endowment', 'investment_linked', null],
    }
    typeSpecificProperties.termYears = { type: ['number', 'null'] }
    typeSpecificProperties.sumAssured = { type: ['number', 'null'] }
  }

  if (policyType === 'business' || !policyType) {
    typeSpecificProperties.business = {
      type: ['object', 'null'],
      properties: {
        businessType: { type: ['string', 'null'] },
        industryCode: { type: ['string', 'null'] },
        businessName: { type: ['string', 'null'] },
        taxNumber: { type: ['string', 'null'] },
        employeeCount: { type: ['number', 'null'] },
        annualRevenue: { type: ['number', 'null'] },
      },
      additionalProperties: false,
    }
    typeSpecificProperties.businessValues = {
      type: ['object', 'null'],
      properties: {
        buildingValue: { type: ['number', 'null'] },
        stockValue: { type: ['number', 'null'] },
        equipmentValue: { type: ['number', 'null'] },
        fixturesValue: { type: ['number', 'null'] },
        businessInterruptionLimit: { type: ['number', 'null'] },
      },
      additionalProperties: false,
    }
    typeSpecificProperties.businessLiability = {
      type: ['object', 'null'],
      properties: {
        publicLiabilityLimit: { type: ['number', 'null'] },
        productLiabilityLimit: { type: ['number', 'null'] },
        professionalLiabilityLimit: { type: ['number', 'null'] },
        employerLiabilityLimit: { type: ['number', 'null'] },
        cyberLiabilityLimit: { type: ['number', 'null'] },
      },
      additionalProperties: false,
    }
  }

  return {
    name: 'policy_extraction_extended',
    strict: true,
    schema: {
      type: 'object',
      properties: {
        ...baseProperties,
        ...typeSpecificProperties,
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
        ...typeSpecificRequired,
      ],
      additionalProperties: false,
    },
  }
}
