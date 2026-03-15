import { InsightBundle, InsightDetail, InsightCategory } from '@/types/analysis'
import { ExtractedPolicyData } from '@/lib/ai/extraction-schema'

const INSIGHT_MODEL_VERSION = '1.0.0'

function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

/**
 * Deterministic insight engine.
 * Filters raw AI insights and adds structural insights.
 */
export function generateInsightBundle(data: ExtractedPolicyData): InsightBundle {
  const generatedAt = new Date().toISOString()
  const insights: InsightDetail[] = []

  // 1. Process AI Generated Insights from Evidence
  if (data.evidence?.insights) {
    for (const rawInsight of data.evidence.insights) {
      const insight = processRawAiInsight(rawInsight, generatedAt)
      if (insight) {
        insights.push(insight)
      }
    }
  }

  // 2. Deterministic Structural Insights

  // Market Value Check for KASKO
  if (data.policyType === 'kasko') {
    const hasMarketValue = data.coverages?.some((c) => c.isMarketValue)
    if (hasMarketValue) {
      insights.push({
        id: generateId(),
        type: 'positive_confirmed',
        severity: 'medium',
        text_internal: 'Policy covers vehicle at market value (Rayiç Değer).',
        basisType: 'policy_fact',
        displayEligibility: true,
        generatedByRule: 'DETERMINISTIC_RAYIC_DEGER',
        generatedAt,
      })
    } else {
      insights.push({
        id: generateId(),
        type: 'unresolved_data_gap',
        severity: 'high',
        text_internal: 'Could not explicitly confirm market value (Rayiç Değer) protection.',
        basisType: 'unresolved',
        displayEligibility: true,
        generatedByRule: 'MISSING_RAYIC_DEGER',
        generatedAt,
      })
    }
  }

  // Deductible check
  const deductibles = data.coverages?.filter((c) => c.deductible !== null && c.deductible > 0) || []
  if (deductibles.length > 0) {
    insights.push({
      id: generateId(),
      type: 'caution_confirmed',
      severity: 'medium',
      text_internal: `Policy contains ${deductibles.length} coverages with specific deductibles.`,
      basisType: 'policy_fact',
      displayEligibility: true,
      generatedByRule: 'DETERMINISTIC_DEDUCTIBLE_COUNT',
      generatedAt,
    })
  } else if (data.coverages && data.coverages.length > 0) {
    // Only conditionally state no deductibles if we are highly confident
    insights.push({
      id: generateId(),
      type: 'positive_conditional',
      severity: 'medium',
      text_internal:
        'No specific exclusions or deductibles were identified, but general conditions apply.',
      basisType: 'conditional_policy_fact',
      displayEligibility: true, // Conditionally safe wording
      generatedByRule: 'DETERMINISTIC_NO_DEDUCTIBLE_CONDITIONAL',
      generatedAt,
    })
  }

  // 3. Branch-specific structural insights
  if (data.policyType && data.policyType !== 'kasko') {
    const branchInsights = generateBranchInsights(data, data.policyType, generatedAt)
    insights.push(...branchInsights)
  }

  return {
    insights,
    bundleVersion: INSIGHT_MODEL_VERSION,
    generatedAt,
  }
}

/**
 * Branch-specific deterministic insight generator.
 */
function generateBranchInsights(
  data: ExtractedPolicyData,
  policyType: string,
  generatedAt: string
): InsightDetail[] {
  switch (policyType) {
    case 'traffic':
      return trafficInsights(data, generatedAt)
    case 'home':
      return homeInsights(data, generatedAt)
    case 'health':
      return healthInsights(data, generatedAt)
    case 'life':
      return lifeInsights(data, generatedAt)
    case 'dask':
      return daskInsights(data, generatedAt)
    case 'business':
      return businessInsights(data, generatedAt)
    case 'nakliyat':
      return nakliyatInsights(data, generatedAt)
    default:
      return []
  }
}

function trafficInsights(data: ExtractedPolicyData, generatedAt: string): InsightDetail[] {
  const insights: InsightDetail[] = []
  const coverages = data.coverages || []

  // Statutory vs enhanced check — look at liability coverages
  const liabilityCoverages = coverages.filter(
    (c) =>
      c.category === 'liability' ||
      c.name?.toLowerCase().includes('liability') ||
      c.name?.toLowerCase().includes('bodily') ||
      c.name?.toLowerCase().includes('property') ||
      c.nameTr?.toLowerCase().includes('bedeni') ||
      c.nameTr?.toLowerCase().includes('maddi') ||
      c.nameTr?.toLowerCase().includes('sorumluluk')
  )
  if (liabilityCoverages.length > 0) {
    const hasEnhanced = liabilityCoverages.some((c) => c.limit !== null && c.limit > 1_200_000)
    if (hasEnhanced) {
      insights.push({
        id: generateId(),
        type: 'positive_confirmed',
        severity: 'medium',
        text_internal:
          'Traffic policy includes enhanced liability limits above statutory minimums.',
        basisType: 'policy_fact',
        displayEligibility: true,
        generatedByRule: 'DETERMINISTIC_TRAFFIC_ENHANCED_LIABILITY',
        generatedAt,
      })
    } else {
      insights.push({
        id: generateId(),
        type: 'caution_confirmed',
        severity: 'medium',
        text_internal: 'Traffic policy appears to have only statutory minimum liability limits.',
        basisType: 'policy_fact',
        displayEligibility: true,
        generatedByRule: 'DETERMINISTIC_TRAFFIC_STATUTORY_ONLY',
        generatedAt,
      })
    }
  }
  return insights
}

function homeInsights(data: ExtractedPolicyData, generatedAt: string): InsightDetail[] {
  const insights: InsightDetail[] = []
  const coverages = data.coverages || []

  // Underinsurance check
  const buildingCov = coverages.find(
    (c) => c.name?.toLowerCase().includes('building') || c.nameTr?.toLowerCase().includes('bina')
  )
  const contentsCov = coverages.find(
    (c) => c.name?.toLowerCase().includes('contents') || c.nameTr?.toLowerCase().includes('eşya')
  )

  if (buildingCov && contentsCov) {
    insights.push({
      id: generateId(),
      type: 'positive_confirmed',
      severity: 'low',
      text_internal: 'Home policy separately covers building and contents.',
      basisType: 'policy_fact',
      displayEligibility: true,
      generatedByRule: 'DETERMINISTIC_HOME_SEPARATION',
      generatedAt,
    })
  } else if (!buildingCov || !contentsCov) {
    insights.push({
      id: generateId(),
      type: 'unresolved_data_gap',
      severity: 'high',
      text_internal: 'Could not confirm both building and contents coverage in home policy.',
      basisType: 'unresolved',
      displayEligibility: true,
      generatedByRule: 'MISSING_HOME_SEPARATION',
      generatedAt,
    })
  }
  return insights
}

function healthInsights(data: ExtractedPolicyData, generatedAt: string): InsightDetail[] {
  const insights: InsightDetail[] = []
  const conditions = data.specialConditions || []

  // Network dependency
  const hasNetwork = conditions.some(
    (c) => c.toLowerCase().includes('network') || c.toLowerCase().includes('anlaşmalı')
  )
  if (hasNetwork) {
    insights.push({
      id: generateId(),
      type: 'caution_confirmed',
      severity: 'medium',
      text_internal: 'Health coverage is network-dependent. Out-of-network costs may differ.',
      basisType: 'conditional_policy_fact',
      displayEligibility: true,
      generatedByRule: 'DETERMINISTIC_HEALTH_NETWORK',
      generatedAt,
    })
  }

  // Waiting periods
  const hasWaiting = conditions.some(
    (c) => c.toLowerCase().includes('waiting') || c.toLowerCase().includes('bekleme')
  )
  if (hasWaiting) {
    insights.push({
      id: generateId(),
      type: 'caution_confirmed',
      severity: 'medium',
      text_internal:
        'Health policy has waiting periods. Some benefits may not be immediately available.',
      basisType: 'conditional_policy_fact',
      displayEligibility: true,
      generatedByRule: 'DETERMINISTIC_HEALTH_WAITING',
      generatedAt,
    })
  }
  return insights
}

function lifeInsights(data: ExtractedPolicyData, generatedAt: string): InsightDetail[] {
  const insights: InsightDetail[] = []
  const conditions = data.specialConditions || []

  // Beneficiary flag
  const hasBeneficiary = conditions.some(
    (c) => c.toLowerCase().includes('beneficiary') || c.toLowerCase().includes('lehdar')
  )
  if (!hasBeneficiary) {
    insights.push({
      id: generateId(),
      type: 'unresolved_data_gap',
      severity: 'high',
      text_internal: 'Beneficiary designation could not be confirmed from the document.',
      basisType: 'unresolved',
      displayEligibility: true,
      generatedByRule: 'MISSING_LIFE_BENEFICIARY',
      generatedAt,
    })
  }

  // Rider conditionality
  const coverages = data.coverages || []
  const riders = coverages.filter(
    (c) => c.category === 'supplementary' || c.name?.toLowerCase().includes('rider')
  )
  if (riders.length > 0) {
    insights.push({
      id: generateId(),
      type: 'positive_conditional',
      severity: 'medium',
      text_internal: `Life policy includes ${riders.length} rider(s). Riders are subject to their own conditions and exclusions.`,
      basisType: 'conditional_policy_fact',
      displayEligibility: true,
      generatedByRule: 'DETERMINISTIC_LIFE_RIDERS',
      generatedAt,
    })
  }
  return insights
}

function daskInsights(_data: ExtractedPolicyData, generatedAt: string): InsightDetail[] {
  const insights: InsightDetail[] = []

  // Statutory scope limitation
  insights.push({
    id: generateId(),
    type: 'caution_confirmed',
    severity: 'medium',
    text_internal:
      'DASK covers earthquake damage only. Additional property risks require a separate home policy.',
    basisType: 'policy_fact',
    displayEligibility: true,
    generatedByRule: 'DETERMINISTIC_DASK_SCOPE',
    generatedAt,
  })
  return insights
}

function businessInsights(data: ExtractedPolicyData, generatedAt: string): InsightDetail[] {
  const insights: InsightDetail[] = []
  const coverages = data.coverages || []

  // BI coverage flag
  const hasBI = coverages.some(
    (c) =>
      c.name?.toLowerCase().includes('business interruption') ||
      c.nameTr?.toLowerCase().includes('iş durması')
  )
  if (hasBI) {
    insights.push({
      id: generateId(),
      type: 'positive_conditional',
      severity: 'medium',
      text_internal:
        'Business interruption coverage is present. Subject to waiting period and indemnity period conditions.',
      basisType: 'conditional_policy_fact',
      displayEligibility: true,
      generatedByRule: 'DETERMINISTIC_BUSINESS_BI',
      generatedAt,
    })
  }

  // Liability separation
  const liabilities = coverages.filter((c) => c.category === 'liability')
  if (liabilities.length > 0) {
    insights.push({
      id: generateId(),
      type: 'positive_confirmed',
      severity: 'low',
      text_internal: `Business policy includes ${liabilities.length} liability coverage(s).`,
      basisType: 'policy_fact',
      displayEligibility: true,
      generatedByRule: 'DETERMINISTIC_BUSINESS_LIABILITY',
      generatedAt,
    })
  }
  return insights
}

function nakliyatInsights(data: ExtractedPolicyData, generatedAt: string): InsightDetail[] {
  const insights: InsightDetail[] = []
  const coverages = data.coverages || []
  const conditions = data.specialConditions || []

  // ICC basis classification
  const iccA = coverages.some(
    (c) => c.name?.toLowerCase().includes('icc (a)') || c.name?.toLowerCase().includes('all risk')
  )
  const iccC = coverages.some(
    (c) => c.name?.toLowerCase().includes('icc (c)') || c.name?.toLowerCase().includes('minimum')
  )

  if (iccA) {
    insights.push({
      id: generateId(),
      type: 'positive_confirmed',
      severity: 'low',
      text_internal: 'Cargo policy is on ICC (A) All Risks basis — broadest coverage.',
      basisType: 'policy_fact',
      displayEligibility: true,
      generatedByRule: 'DETERMINISTIC_NAKLIYAT_ICC_A',
      generatedAt,
    })
  } else if (iccC) {
    insights.push({
      id: generateId(),
      type: 'caution_confirmed',
      severity: 'high',
      text_internal:
        'Cargo policy is on ICC (C) minimum basis — covers only major perils (fire, sinking, collision). Many risks excluded.',
      basisType: 'policy_fact',
      displayEligibility: true,
      generatedByRule: 'DETERMINISTIC_NAKLIYAT_ICC_C',
      generatedAt,
    })
  }

  // W2W check
  const hasW2W = conditions.some(
    (c) => c.toLowerCase().includes('warehouse') || c.toLowerCase().includes('depodan depoya')
  )
  if (hasW2W) {
    insights.push({
      id: generateId(),
      type: 'positive_confirmed',
      severity: 'low',
      text_internal: 'Warehouse-to-warehouse coverage confirmed.',
      basisType: 'policy_fact',
      displayEligibility: true,
      generatedByRule: 'DETERMINISTIC_NAKLIYAT_W2W',
      generatedAt,
    })
  }
  return insights
}

/**
 * Scans raw AI insights for prohibited dangerous terms (Display Suppression Policy).
 * Applies fallback categorization or blocks entirely.
 */
function processRawAiInsight(
  raw: { text: string; textEn: string; quote: string },
  generatedAt: string
): InsightDetail | null {
  const textLower = raw.textEn.toLowerCase()
  const displaySafe = enforceDisplaySuppression(textLower)

  // Determine Category based on sentiment/danger
  let type: InsightCategory = 'positive_conditional'
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'low'

  if (
    textLower.includes('not covered') ||
    textLower.includes('excluded') ||
    textLower.includes('warning') ||
    textLower.includes('caution')
  ) {
    type = 'caution_conditional'
    severity = 'medium'
  }

  if (displaySafe.blocked) {
    return {
      id: generateId(),
      type,
      severity: 'high',
      text_internal: `[SUPPRESSED] Original: ${raw.textEn}`,
      basisType: 'unresolved',
      displayEligibility: false,
      blockingReason: displaySafe.reason,
      generatedByRule: 'AI_RAW_FILTERED',
      generatedAt,
      // We could map the raw quote into EvidenceRefs if we had the full evidence model available here
    }
  }

  return {
    id: generateId(),
    type,
    severity,
    text_internal: raw.textEn,
    basisType: 'conditional_policy_fact',
    displayEligibility: true,
    generatedByRule: 'AI_RAW_ALLOWED',
    generatedAt,
  }
}

function enforceDisplaySuppression(text: string): { blocked: boolean; reason?: string } {
  const displayDangerWords = [
    'fully covered',
    'tam kapsamlı',
    'tamamen kapsar',
    'no deductible',
    'muafiyetsiz',
    'guaranteed',
    'aracınızın tam değeri ödenir',
  ]

  for (const word of displayDangerWords) {
    if (text.includes(word)) {
      return {
        blocked: true,
        reason: `Violation of Suppression Policy: contains prohibited phrase '${word}'`,
      }
    }
  }

  return { blocked: false }
}
