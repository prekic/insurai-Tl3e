import { ExtractedPolicyData, ExtractedCoverage } from '@/lib/ai/extraction-schema'

export type SafetyFlagLevel = 'Safe' | 'Warning' | 'Error'

export interface SafetyFlag {
  level: SafetyFlagLevel
  message: string
  field?: string
}

export interface ValidationResult {
  isValid: boolean
  flags: SafetyFlag[]
  blockReason?: string
}

/**
 * Deterministic validator to ensure extracted policy data is evidence-backed
 * and does not contain dangerous defaults or conflicting information.
 */
export function validateExtractionSafety(data: Partial<ExtractedPolicyData>): ValidationResult {
  const flags: SafetyFlag[] = []
  let isValid = true
  let blockReason: string | undefined

  // 1. Currency Validation
  // Currency is strictly required to be known. Ambiguous or missing currency is a critical error.
  if (!data.currency) {
    flags.push({
      level: 'Error',
      message: 'Currency must be explicitly extracted. Null or missing currency is unsafe.',
      field: 'currency',
    })
    isValid = false
    blockReason = 'Unsafe default risk: Currency missing.'
  }

  // 2. Premium Validation
  if (data.premium === null || data.premium === undefined) {
    flags.push({
      level: 'Warning',
      message: 'Premium amount is missing.',
      field: 'premium',
    })
  }

  // 3. Coverages Validation
  if (!data.coverages || data.coverages.length === 0) {
    flags.push({
      level: 'Warning',
      message: 'No coverages were extracted.',
      field: 'coverages',
    })
  } else {
    data.coverages.forEach((coverage: ExtractedCoverage, index: number) => {
      // Deductible sanity check
      if (coverage.deductible !== null && coverage.deductible < 0) {
        flags.push({
          level: 'Error',
          message: `Coverage '${coverage.name}' has a negative deductible.`,
          field: `coverages[${index}].deductible`,
        })
        isValid = false
        if (!blockReason) blockReason = 'Unsafe data: Negative deductible.'
      }

      // Limit sanity check
      const isStandardKasko =
        data.policyType === 'kasko' &&
        (coverage.category === 'main' ||
          coverage.name?.toLowerCase().includes('kasko') ||
          coverage.nameTr?.toLowerCase().includes('kasko') ||
          coverage.name?.toLowerCase().includes('collision') ||
          coverage.name?.toLowerCase().includes('çarp') ||
          coverage.nameTr?.toLowerCase().includes('çarp') ||
          coverage.name?.toLowerCase().includes('theft') ||
          coverage.nameTr?.toLowerCase().includes('hırsızlık') ||
          coverage.nameTr?.toLowerCase().includes('hirsizlik') ||
          coverage.name?.toLowerCase().includes('fire') ||
          coverage.nameTr?.toLowerCase().includes('yangın') ||
          coverage.nameTr?.toLowerCase().includes('yangin'))

      if (
        !coverage.isUnlimited &&
        !coverage.isMarketValue &&
        coverage.limit === null &&
        !isStandardKasko
      ) {
        flags.push({
          level: 'Warning',
          message: `Coverage '${coverage.name}' has no limit specified and is not flagged as no-cap or market value.`,
          field: `coverages[${index}].limit`,
        })
      }
    })
  }

  // 4. Traceability/Evidence Check
  if (!data.evidence || !data.evidence.insights || !data.evidence.exclusions) {
    flags.push({
      level: 'Warning',
      message: 'Missing explicit evidence mapping for insights or exclusions.',
      field: 'evidence',
    })
  } else {
    // Check if any insights lack quotes
    const missingQuotes = data.evidence.insights.filter(
      (i: { quote?: string }) => !i.quote || i.quote.trim() === ''
    )
    if (missingQuotes.length > 0) {
      flags.push({
        level: 'Warning',
        message: `${missingQuotes.length} insights lack verbatim quotes.`,
        field: 'evidence.insights',
      })
    }
  }

  // 5. Branch-Specific Validation Rules
  if (data.policyType) {
    const branchFlags = validateBranchSpecificRules(data, data.policyType)
    flags.push(...branchFlags)
    const branchErrors = branchFlags.filter((f) => f.level === 'Error')
    if (branchErrors.length > 0) {
      isValid = false
      if (!blockReason) blockReason = branchErrors[0].message
    }
  }

  return {
    isValid,
    flags,
    blockReason,
  }
}

/**
 * Branch-specific validation rules.
 * Each branch has domain-specific checks that detect dangerous defaults,
 * missing critical fields, or structural issues unique to that insurance type.
 */
function validateBranchSpecificRules(
  data: Partial<ExtractedPolicyData>,
  policyType: string
): SafetyFlag[] {
  switch (policyType) {
    case 'traffic':
      return validateTraffic(data)
    case 'home':
      return validateHome(data)
    case 'health':
      return validateHealth(data)
    case 'life':
      return validateLife(data)
    case 'dask':
      return validateDask(data)
    case 'business':
      return validateBusiness(data)
    case 'nakliyat':
      return validateNakliyat(data)
    case 'kasko':
      return validateKasko(data)
    default:
      return []
  }
}

// --- TRAFFIC ---
function validateTraffic(data: Partial<ExtractedPolicyData>): SafetyFlag[] {
  const flags: SafetyFlag[] = []
  const coverages = data.coverages || []

  // Statutory minimum checks (SEDDK 2024)
  const bodilyInjury = coverages.find(
    (c) => c.name?.toLowerCase().includes('bodily') || c.nameTr?.toLowerCase().includes('bedeni')
  )
  if (bodilyInjury && bodilyInjury.limit !== null && bodilyInjury.limit < 1_200_000) {
    flags.push({
      level: 'Warning',
      message: `Bodily injury limit (${bodilyInjury.limit}) appears below SEDDK 2024 statutory minimum of ₺1,200,000.`,
      field: 'coverages.bodilyInjury',
    })
  }

  const propertyDamage = coverages.find(
    (c) => c.name?.toLowerCase().includes('property') || c.nameTr?.toLowerCase().includes('maddi')
  )
  if (propertyDamage && propertyDamage.limit !== null && propertyDamage.limit < 300_000) {
    flags.push({
      level: 'Warning',
      message: `Property damage limit (${propertyDamage.limit}) appears below SEDDK 2024 statutory minimum of ₺300,000.`,
      field: 'coverages.propertyDamage',
    })
  }

  // Traffic should not have isMarketValue coverages (that's kasko)
  if (coverages.some((c) => c.isMarketValue)) {
    flags.push({
      level: 'Warning',
      message: 'Traffic policy has market value coverage — may be misclassified as kasko.',
      field: 'policyType',
    })
  }

  return flags
}

// --- HOME ---
function validateHome(data: Partial<ExtractedPolicyData>): SafetyFlag[] {
  const flags: SafetyFlag[] = []
  const coverages = data.coverages || []

  // Building/contents separation check
  const hasBuilding = coverages.some(
    (c) =>
      c.name?.toLowerCase().includes('building') ||
      c.name?.toLowerCase().includes('fire') ||
      c.nameTr?.toLowerCase().includes('bina') ||
      c.nameTr?.toLowerCase().includes('yangın')
  )
  const hasContents = coverages.some(
    (c) =>
      c.name?.toLowerCase().includes('contents') ||
      c.name?.toLowerCase().includes('belongings') ||
      c.nameTr?.toLowerCase().includes('eşya') ||
      c.nameTr?.toLowerCase().includes('muhteviyat')
  )

  if (!hasBuilding && !hasContents && coverages.length > 0) {
    flags.push({
      level: 'Warning',
      message:
        'Home policy has coverages but lacks clear building/contents separation. Underinsurance risk.',
      field: 'coverages',
    })
  }

  // Mixed valuation basis detection
  const hasMarketVal = coverages.some((c) => c.isMarketValue)
  const hasFixedVal = coverages.some(
    (c) => !c.isMarketValue && !c.isUnlimited && c.limit !== null && c.limit > 0
  )
  if (hasMarketVal && hasFixedVal) {
    flags.push({
      level: 'Warning',
      message: 'Home policy has mixed valuation bases (market value + fixed). Average clause risk.',
      field: 'coverages',
    })
  }

  return flags
}

// --- HEALTH ---
function validateHealth(data: Partial<ExtractedPolicyData>): SafetyFlag[] {
  const flags: SafetyFlag[] = []
  const coverages = data.coverages || []
  const conditions = data.specialConditions || []

  // Network dependency check
  const hasNetworkMention = conditions.some(
    (c) =>
      c.toLowerCase().includes('network') ||
      c.toLowerCase().includes('anlaşmalı') ||
      c.toLowerCase().includes('ağ')
  )
  if (!hasNetworkMention && coverages.length > 0) {
    flags.push({
      level: 'Warning',
      message: 'Health policy lacks explicit network type/dependency information.',
      field: 'specialConditions',
    })
  }

  // Waiting period check
  const hasWaitingPeriod = conditions.some(
    (c) =>
      c.toLowerCase().includes('waiting') ||
      c.toLowerCase().includes('bekleme') ||
      c.toLowerCase().includes('karens')
  )
  if (!hasWaitingPeriod) {
    flags.push({
      level: 'Warning',
      message: 'Health policy lacks explicit waiting period information. Common omission risk.',
      field: 'specialConditions',
    })
  }

  // Copay/deductible structure check
  const hasCopay = conditions.some(
    (c) =>
      c.toLowerCase().includes('copay') ||
      c.toLowerCase().includes('katılım') ||
      c.toLowerCase().includes('co-pay')
  )
  const hasDeductible = coverages.some((c) => c.deductible !== null && c.deductible > 0)
  if (!hasCopay && !hasDeductible) {
    flags.push({
      level: 'Warning',
      message: 'Health policy lacks copay/deductible structure. May indicate extraction gap.',
      field: 'coverages',
    })
  }

  return flags
}

// --- LIFE ---
function validateLife(data: Partial<ExtractedPolicyData>): SafetyFlag[] {
  const flags: SafetyFlag[] = []
  const coverages = data.coverages || []
  const conditions = data.specialConditions || []

  // Death benefit / sum assured check
  const hasDeathBenefit = coverages.some(
    (c) =>
      c.name?.toLowerCase().includes('death') ||
      c.name?.toLowerCase().includes('life') ||
      c.nameTr?.toLowerCase().includes('vefat') ||
      c.nameTr?.toLowerCase().includes('hayat')
  )
  if (!hasDeathBenefit && coverages.length > 0) {
    flags.push({
      level: 'Warning',
      message: 'Life policy lacks explicit death benefit coverage.',
      field: 'coverages',
    })
  }

  // Beneficiary uncertainty
  const hasBeneficiaryMention = conditions.some(
    (c) =>
      c.toLowerCase().includes('beneficiary') ||
      c.toLowerCase().includes('lehdar') ||
      c.toLowerCase().includes('lehtar')
  )
  if (!hasBeneficiaryMention) {
    flags.push({
      level: 'Warning',
      message:
        'Life policy lacks explicit beneficiary information. Beneficiary uncertainty is a critical gap.',
      field: 'specialConditions',
    })
  }

  return flags
}

// --- DASK ---
function validateDask(data: Partial<ExtractedPolicyData>): SafetyFlag[] {
  const flags: SafetyFlag[] = []
  const coverages = data.coverages || []

  // DASK statutory cap check (2024: ~₺640,000 for class A, varying by m²)
  const mainCoverage = coverages.find(
    (c) =>
      c.category === 'main' ||
      c.name?.toLowerCase().includes('earthquake') ||
      c.nameTr?.toLowerCase().includes('deprem')
  )
  if (mainCoverage && mainCoverage.limit !== null && mainCoverage.limit > 1_000_000) {
    flags.push({
      level: 'Warning',
      message: `DASK coverage limit (${mainCoverage.limit}) appears above typical statutory maximums. Verify.`,
      field: 'coverages',
    })
  }

  // DASK should not have extensive non-earthquake coverages
  const nonEarthquake = coverages.filter(
    (c) =>
      !c.name?.toLowerCase().includes('earthquake') &&
      !c.name?.toLowerCase().includes('fire following') &&
      !c.name?.toLowerCase().includes('tsunami') &&
      !c.name?.toLowerCase().includes('landslide') &&
      !c.nameTr?.toLowerCase().includes('deprem') &&
      !c.nameTr?.toLowerCase().includes('yangın') &&
      !c.nameTr?.toLowerCase().includes('tsunami') &&
      !c.nameTr?.toLowerCase().includes('yer kayması')
  )
  if (nonEarthquake.length > 2) {
    flags.push({
      level: 'Warning',
      message: `DASK policy has ${nonEarthquake.length} non-earthquake coverages. DASK is earthquake-only — may be misclassified.`,
      field: 'policyType',
    })
  }

  return flags
}

// --- BUSINESS ---
function validateBusiness(data: Partial<ExtractedPolicyData>): SafetyFlag[] {
  const flags: SafetyFlag[] = []
  const coverages = data.coverages || []
  const conditions = data.specialConditions || []

  // BI waiting period / indemnity period check
  const hasBI = coverages.some(
    (c) =>
      c.name?.toLowerCase().includes('business interruption') ||
      c.name?.toLowerCase().includes('loss of profit') ||
      c.nameTr?.toLowerCase().includes('iş durması') ||
      c.nameTr?.toLowerCase().includes('kâr kaybı')
  )
  if (hasBI) {
    const hasBIPeriod = conditions.some(
      (c) =>
        c.toLowerCase().includes('indemnity period') ||
        c.toLowerCase().includes('waiting period') ||
        c.toLowerCase().includes('tazminat süresi') ||
        c.toLowerCase().includes('bekleme süresi')
    )
    if (!hasBIPeriod) {
      flags.push({
        level: 'Warning',
        message:
          'Business policy has BI coverage but lacks explicit indemnity/waiting period. Critical gap.',
        field: 'specialConditions',
      })
    }
  }

  // Warranty / protection conditions
  const hasWarranty = conditions.some(
    (c) =>
      c.toLowerCase().includes('alarm') ||
      c.toLowerCase().includes('sprinkler') ||
      c.toLowerCase().includes('security') ||
      c.toLowerCase().includes('güvenlik') ||
      c.toLowerCase().includes('warranty')
  )
  if (!hasWarranty && coverages.length > 5) {
    flags.push({
      level: 'Warning',
      message:
        'Business policy lacks protection/warranty conditions. Common omission for commercial risks.',
      field: 'specialConditions',
    })
  }

  return flags
}

// --- NAKLIYAT ---
function validateNakliyat(data: Partial<ExtractedPolicyData>): SafetyFlag[] {
  const flags: SafetyFlag[] = []
  const coverages = data.coverages || []
  const conditions = data.specialConditions || []

  // ICC basis check
  const hasICCMention =
    coverages.some(
      (c) =>
        c.name?.toLowerCase().includes('icc') ||
        c.description?.toLowerCase().includes('icc') ||
        c.name?.toLowerCase().includes('all risk') ||
        c.name?.toLowerCase().includes('named peril')
    ) ||
    conditions.some(
      (c) => c.toLowerCase().includes('icc') || c.toLowerCase().includes('institute cargo')
    )
  if (!hasICCMention && coverages.length > 0) {
    flags.push({
      level: 'Warning',
      message: 'Cargo policy lacks explicit ICC clause type (A/B/C). Coverage scope unclear.',
      field: 'coverages',
    })
  }

  // Warehouse-to-warehouse check
  const hasW2W = conditions.some(
    (c) =>
      c.toLowerCase().includes('warehouse') ||
      c.toLowerCase().includes('depodan depoya') ||
      c.toLowerCase().includes('transit')
  )
  if (!hasW2W) {
    flags.push({
      level: 'Warning',
      message: 'Cargo policy lacks warehouse-to-warehouse clause. Coverage transit scope unclear.',
      field: 'specialConditions',
    })
  }

  // Packaging exclusion check
  const hasPackaging = conditions.some(
    (c) =>
      c.toLowerCase().includes('packaging') ||
      c.toLowerCase().includes('ambalaj') ||
      c.toLowerCase().includes('packing')
  )
  if (!hasPackaging) {
    flags.push({
      level: 'Warning',
      message: 'Cargo policy lacks packaging adequacy condition. Common exclusion risk.',
      field: 'specialConditions',
    })
  }

  return flags
}

// --- KASKO ---
function validateKasko(data: Partial<ExtractedPolicyData>): SafetyFlag[] {
  const flags: SafetyFlag[] = []
  const coverages = data.coverages || []
  const conditions = data.specialConditions || []

  // 1. Vehicle value basis — warn if neither market value nor fixed-sum main coverage
  const hasMarketValue = coverages.some((c) => c.isMarketValue === true)
  const hasMainWithLimit = coverages.some(
    (c) => c.category === 'main' && c.limit !== null && c.limit > 0
  )
  if (!hasMarketValue && !hasMainWithLimit) {
    flags.push({
      level: 'Warning',
      message:
        'Kasko policy lacks clear vehicle value basis. Neither market value nor fixed-sum main coverage detected.',
      field: 'coverages.valueBasis',
    })
  }

  // 2. Parts standard — search conditions and coverage descriptions for parts terminology
  const partsTerms = [
    'orijinal',
    'original',
    'eşdeğer',
    'equivalent',
    'muadil',
    'oem',
    'yan sanayi',
    'çıkma',
    'logolu olmayan',
  ]
  const hasPartsInConditions = conditions.some((c) =>
    partsTerms.some((term) => c.toLowerCase().includes(term))
  )
  const hasPartsInDescriptions = coverages.some(
    (c) => c.description && partsTerms.some((term) => c.description?.toLowerCase().includes(term))
  )
  if (!hasPartsInConditions && !hasPartsInDescriptions) {
    flags.push({
      level: 'Warning',
      message:
        'Kasko policy lacks parts standard specification (orijinal/eşdeğer/muadil/OEM). Repair cost basis unclear.',
      field: 'specialConditions.partsStandard',
    })
  }

  // 3. Deductible structure — warn if all coverages lack deductibles and no condition mentions them
  const hasAnyDeductible = coverages.some((c) => c.deductible !== null && c.deductible > 0)
  const deductibleTerms = ['muafiyet', 'tenzil', 'deductible']
  const hasDeductibleMention = conditions.some((c) =>
    deductibleTerms.some((term) => c.toLowerCase().includes(term))
  )
  if (!hasAnyDeductible && !hasDeductibleMention) {
    flags.push({
      level: 'Warning',
      message:
        'Kasko policy has no deductible on any coverage and no deductible terms in conditions. Deductible structure unclear.',
      field: 'coverages.deductible',
    })
  }

  // 4. Minimum expected coverages — collision, theft, fire
  const hasCollision = coverages.some((c) => {
    const n = c.name?.toLowerCase() || ''
    const t = c.nameTr?.toLowerCase() || ''
    return (
      n.includes('collision') ||
      n.includes('çarpma') ||
      n.includes('çarpışma') ||
      n.includes('carpma') ||
      n.includes('carpisma') ||
      t.includes('çarpma') ||
      t.includes('çarpışma') ||
      t.includes('carpma') ||
      t.includes('carpisma')
    )
  })
  const hasTheft = coverages.some((c) => {
    const n = c.name?.toLowerCase() || ''
    const t = c.nameTr?.toLowerCase() || ''
    return (
      n.includes('theft') ||
      n.includes('hırsızlık') ||
      n.includes('hirsizlik') ||
      t.includes('hırsızlık') ||
      t.includes('hirsizlik') ||
      t.includes('theft')
    )
  })
  const hasFire = coverages.some((c) => {
    const n = c.name?.toLowerCase() || ''
    const t = c.nameTr?.toLowerCase() || ''
    return (
      n.includes('fire') ||
      n.includes('yangın') ||
      n.includes('yangin') ||
      t.includes('yangın') ||
      t.includes('yangin') ||
      t.includes('fire')
    )
  })
  if (!hasCollision) {
    flags.push({
      level: 'Warning',
      message: 'Kasko policy is missing collision coverage (çarpma/çarpışma).',
      field: 'coverages.collision',
    })
  }
  if (!hasTheft) {
    flags.push({
      level: 'Warning',
      message: 'Kasko policy is missing theft coverage (hırsızlık).',
      field: 'coverages.theft',
    })
  }
  if (!hasFire) {
    flags.push({
      level: 'Warning',
      message: 'Kasko policy is missing fire coverage (yangın).',
      field: 'coverages.fire',
    })
  }

  // 5. "Tam Kasko" consistency — if labeled as full/comprehensive, check for flood and earthquake
  const isTamKasko =
    coverages.some((c) => {
      const n = c.name?.toLowerCase() || ''
      const t = c.nameTr?.toLowerCase() || ''
      return (
        n.includes('tam kasko') ||
        n.includes('full kasko') ||
        n.includes('genişletilmiş') ||
        t.includes('tam kasko') ||
        t.includes('full kasko') ||
        t.includes('genişletilmiş')
      )
    }) || conditions.some((c) => c.toLowerCase().includes('tam kasko'))

  if (isTamKasko) {
    const hasFlood = coverages.some((c) => {
      const n = c.name?.toLowerCase() || ''
      const t = c.nameTr?.toLowerCase() || ''
      return (
        n.includes('flood') ||
        n.includes('sel') ||
        n.includes('su baskını') ||
        n.includes('su baskini') ||
        t.includes('sel') ||
        t.includes('su baskını') ||
        t.includes('su baskini') ||
        t.includes('flood')
      )
    })
    const hasEarthquake = coverages.some((c) => {
      const n = c.name?.toLowerCase() || ''
      const t = c.nameTr?.toLowerCase() || ''
      return (
        n.includes('earthquake') ||
        n.includes('deprem') ||
        t.includes('deprem') ||
        t.includes('earthquake')
      )
    })
    if (!hasFlood) {
      flags.push({
        level: 'Warning',
        message:
          'Policy labeled "Tam Kasko" but lacks flood coverage (sel/su baskını). Scope may be narrower than expected.',
        field: 'coverages.flood',
      })
    }
    if (!hasEarthquake) {
      flags.push({
        level: 'Warning',
        message:
          'Policy labeled "Tam Kasko" but lacks earthquake coverage (deprem). Scope may be narrower than expected.',
        field: 'coverages.earthquake',
      })
    }
  }

  return flags
}
