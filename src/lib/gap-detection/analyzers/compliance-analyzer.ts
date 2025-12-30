/**
 * Compliance Gap Analyzer
 * Detects regulatory compliance issues
 */

import type { PolicyType, AnalyzedPolicy } from '@/types/policy'
import type { TurkishRegion } from '@/types/market-data'
import type { DetectedGap, GapDetectionConfig } from '@/types/gap'
import { generateGapId, DEFAULT_GAP_CONFIG } from '@/types/gap'

/**
 * Turkish insurance compliance requirements
 */
interface ComplianceRequirement {
  id: string
  name: string
  nameTr: string
  description: string
  descriptionTr: string
  policyTypes: PolicyType[]
  checkType: 'coverage' | 'limit' | 'documentation'
  matcher?: RegExp
  minimumLimit?: number
  mandatory: boolean
  source: string
}

const COMPLIANCE_REQUIREMENTS: ComplianceRequirement[] = [
  // DASK (Compulsory Earthquake Insurance)
  {
    id: 'dask-mandatory',
    name: 'DASK Earthquake Insurance',
    nameTr: 'DASK Deprem Sigortası',
    description: 'DASK (Compulsory Earthquake Insurance) is mandatory for all residential properties in Turkey.',
    descriptionTr: 'DASK (Zorunlu Deprem Sigortası) Türkiye\'deki tüm konutlar için zorunludur.',
    policyTypes: ['home', 'dask'],
    checkType: 'coverage',
    matcher: /dask|deprem|earthquake/i,
    mandatory: true,
    source: 'SEDDK',
  },
  // Traffic Insurance
  {
    id: 'traffic-mandatory',
    name: 'Compulsory Traffic Insurance',
    nameTr: 'Zorunlu Trafik Sigortası',
    description: 'Third-party liability insurance is mandatory for all motor vehicles in Turkey.',
    descriptionTr: 'Üçüncü şahıs sorumluluk sigortası Türkiye\'deki tüm motorlu araçlar için zorunludur.',
    policyTypes: ['traffic', 'kasko'],
    checkType: 'coverage',
    matcher: /trafik|traffic|zorunlu|mandatory|liability/i,
    mandatory: true,
    source: 'SEDDK',
  },
  // Minimum liability limits
  {
    id: 'traffic-bodily-limit',
    name: 'Minimum Bodily Injury Limit',
    nameTr: 'Minimum Bedensel Hasar Limiti',
    description: 'Minimum coverage limit for bodily injury as per 2024 regulations.',
    descriptionTr: '2024 düzenlemelerine göre minimum bedensel hasar teminat limiti.',
    policyTypes: ['traffic'],
    checkType: 'limit',
    matcher: /bedensel|bodily|kişi başı/i,
    minimumLimit: 1200000, // Updated for 2024
    mandatory: true,
    source: 'SEDDK 2024',
  },
  {
    id: 'traffic-property-limit',
    name: 'Minimum Property Damage Limit',
    nameTr: 'Minimum Maddi Hasar Limiti',
    description: 'Minimum coverage limit for property damage as per 2024 regulations.',
    descriptionTr: '2024 düzenlemelerine göre minimum maddi hasar teminat limiti.',
    policyTypes: ['traffic'],
    checkType: 'limit',
    matcher: /maddi|property|araç/i,
    minimumLimit: 300000, // Updated for 2024
    mandatory: true,
    source: 'SEDDK 2024',
  },
  // Professional liability for certain professions
  {
    id: 'professional-liability',
    name: 'Professional Liability Insurance',
    nameTr: 'Mesleki Sorumluluk Sigortası',
    description: 'Professional liability insurance may be mandatory for certain professions (doctors, lawyers, etc.).',
    descriptionTr: 'Mesleki sorumluluk sigortası bazı meslekler için zorunlu olabilir (doktorlar, avukatlar vb.).',
    policyTypes: ['business'],
    checkType: 'coverage',
    matcher: /mesleki sorumluluk|professional liability|hata|omission/i,
    mandatory: false, // Context-dependent
    source: 'TSB',
  },
  // Employer's liability
  {
    id: 'employer-liability',
    name: 'Employer\'s Liability Insurance',
    nameTr: 'İşveren Sorumluluk Sigortası',
    description: 'Coverage for employer liability related to workplace accidents.',
    descriptionTr: 'İş kazalarıyla ilgili işveren sorumluluğu teminatı.',
    policyTypes: ['business'],
    checkType: 'coverage',
    matcher: /işveren|employer|iş kazası|workplace/i,
    mandatory: false,
    source: 'TSB',
  },
]

/**
 * Analyze compliance gaps
 */
export function analyzeComplianceGaps(
  policy: AnalyzedPolicy,
  _config: GapDetectionConfig = DEFAULT_GAP_CONFIG,
  region: TurkishRegion = 'marmara'
): DetectedGap[] {
  // Note: _config reserved for future configurable compliance thresholds
  const gaps: DetectedGap[] = []
  let index = 0

  // Filter requirements applicable to this policy type
  const applicableRequirements = COMPLIANCE_REQUIREMENTS.filter(
    req => req.policyTypes.includes(policy.type)
  )

  for (const requirement of applicableRequirements) {
    const gap = checkRequirement(policy, requirement, region, index)
    if (gap) {
      gaps.push(gap)
      index++
    }
  }

  // Special check for home policies without DASK reference
  if (policy.type === 'home') {
    const hasDaskReference = policy.coverages.some(c =>
      /dask|deprem|earthquake/i.test(c.name) ||
      /dask|deprem|earthquake/i.test(c.nameTr || '')
    ) || policy.specialConditions?.some(sc =>
      /dask|deprem/i.test(sc)
    )

    if (!hasDaskReference) {
      const gap: DetectedGap = {
        id: generateGapId('compliance', 'mandatory_missing', index++),
        category: 'compliance',
        subCategory: 'mandatory_missing',
        title: 'DASK Reference Missing',
        titleTr: 'DASK Referansı Eksik',
        description: 'No reference to DASK earthquake insurance found. DASK is mandatory for all residential properties in Turkey. Ensure you have a separate DASK policy.',
        descriptionTr: 'DASK deprem sigortası referansı bulunamadı. DASK Türkiye\'deki tüm konutlar için zorunludur. Ayrı bir DASK poliçeniz olduğundan emin olun.',
        severity: 'high',
        severityScore: 80,
        financialImpact: {
          potentialLoss: 500000,
          probability: getEarthquakeProbability(region),
          expectedLoss: Math.round(500000 * getEarthquakeProbability(region)),
        },
        remediation: {
          action: 'Obtain DASK earthquake insurance policy',
          actionTr: 'DASK deprem sigortası poliçesi edinin',
          estimatedCost: 500, // Average DASK premium
          difficulty: 'easy',
          timeToResolve: '1-2 days',
          steps: [
            'Check if you already have a DASK policy',
            'If not, apply through any insurance company or bank',
            'Provide property registration (tapu) details',
            'Pay the regulated premium',
          ],
          stepsTr: [
            'Zaten bir DASK poliçeniz olup olmadığını kontrol edin',
            'Yoksa, herhangi bir sigorta şirketi veya bankadan başvurun',
            'Tapu bilgilerini sağlayın',
            'Düzenlenmiş primi ödeyin',
          ],
        },
        detectedAt: new Date().toISOString(),
        confidence: 0.85,
        source: 'compliance',
      }
      gaps.push(gap)
    }
  }

  // Check for kasko without traffic reference
  if (policy.type === 'kasko') {
    const hasTrafficReference = policy.coverages.some(c =>
      /trafik|traffic|zorunlu|mandatory/i.test(c.name) ||
      /trafik|traffic|zorunlu|mandatory/i.test(c.nameTr || '')
    ) || policy.specialConditions?.some(sc =>
      /trafik|traffic/i.test(sc)
    )

    if (!hasTrafficReference) {
      const gap: DetectedGap = {
        id: generateGapId('compliance', 'mandatory_missing', index++),
        category: 'compliance',
        subCategory: 'mandatory_missing',
        title: 'Traffic Insurance Reference Missing',
        titleTr: 'Trafik Sigortası Referansı Eksik',
        description: 'No reference to compulsory traffic insurance found. Traffic insurance is mandatory for all vehicles. Ensure you have a valid traffic policy.',
        descriptionTr: 'Zorunlu trafik sigortası referansı bulunamadı. Trafik sigortası tüm araçlar için zorunludur. Geçerli bir trafik poliçeniz olduğundan emin olun.',
        severity: 'critical',
        severityScore: 95,
        financialImpact: {
          potentialLoss: 1500000, // Combined minimum limits
          probability: 0.08,
          expectedLoss: 120000,
        },
        remediation: {
          action: 'Verify and obtain traffic insurance if missing',
          actionTr: 'Trafik sigortasını doğrulayın ve eksikse edinin',
          estimatedCost: 2000, // Average traffic insurance premium
          difficulty: 'easy',
          timeToResolve: '1 day',
          steps: [
            'Check if you have valid traffic insurance',
            'If not, apply through any insurance company',
            'Provide vehicle registration details',
            'Pay the regulated premium',
          ],
          stepsTr: [
            'Geçerli trafik sigortanız olup olmadığını kontrol edin',
            'Yoksa, herhangi bir sigorta şirketinden başvurun',
            'Araç ruhsat bilgilerini sağlayın',
            'Düzenlenmiş primi ödeyin',
          ],
        },
        detectedAt: new Date().toISOString(),
        confidence: 0.8,
        source: 'compliance',
      }
      gaps.push(gap)
    }
  }

  return gaps
}

/**
 * Check a specific compliance requirement
 */
function checkRequirement(
  policy: AnalyzedPolicy,
  requirement: ComplianceRequirement,
  region: TurkishRegion,
  index: number
): DetectedGap | null {
  if (requirement.checkType === 'coverage') {
    return checkCoverageRequirement(policy, requirement, region, index)
  } else if (requirement.checkType === 'limit') {
    return checkLimitRequirement(policy, requirement, index)
  }
  return null
}

/**
 * Check coverage-type compliance requirement
 */
function checkCoverageRequirement(
  policy: AnalyzedPolicy,
  requirement: ComplianceRequirement,
  _region: TurkishRegion,
  index: number
): DetectedGap | null {
  if (!requirement.matcher) return null

  const hasCoverage = policy.coverages.some(c =>
    requirement.matcher?.test(c.name) ||
    requirement.matcher?.test(c.nameTr || '')
  )

  if (!hasCoverage && requirement.mandatory) {
    return {
      id: generateGapId('compliance', 'mandatory_missing', index),
      category: 'compliance',
      subCategory: 'mandatory_missing',
      title: `Missing: ${requirement.name}`,
      titleTr: `Eksik: ${requirement.nameTr}`,
      description: requirement.description,
      descriptionTr: requirement.descriptionTr,
      severity: 'critical',
      severityScore: 90,
      financialImpact: {
        potentialLoss: requirement.minimumLimit || 100000,
        probability: 0.05,
        expectedLoss: (requirement.minimumLimit || 100000) * 0.05,
      },
      remediation: {
        action: `Obtain ${requirement.name}`,
        actionTr: `${requirement.nameTr} edinin`,
        estimatedCost: null,
        difficulty: 'easy',
        timeToResolve: '1-3 days',
        steps: [
          'Contact your insurance provider',
          `Request ${requirement.name} coverage`,
          'Complete any required documentation',
          'Pay applicable premium',
        ],
        stepsTr: [
          'Sigorta şirketinizle iletişime geçin',
          `${requirement.nameTr} teminatı talep edin`,
          'Gerekli belgeleri tamamlayın',
          'İlgili primi ödeyin',
        ],
      },
      detectedAt: new Date().toISOString(),
      confidence: 0.9,
      source: 'compliance',
    }
  }

  return null
}

/**
 * Check limit-type compliance requirement
 */
function checkLimitRequirement(
  policy: AnalyzedPolicy,
  requirement: ComplianceRequirement,
  index: number
): DetectedGap | null {
  if (!requirement.matcher || !requirement.minimumLimit) return null

  const matchingCoverage = policy.coverages.find(c =>
    requirement.matcher?.test(c.name) ||
    requirement.matcher?.test(c.nameTr || '')
  )

  if (matchingCoverage && matchingCoverage.limit < requirement.minimumLimit) {
    const shortfall = requirement.minimumLimit - matchingCoverage.limit

    return {
      id: generateGapId('compliance', 'regulatory_shortfall', index),
      category: 'compliance',
      subCategory: 'regulatory_shortfall',
      title: `Below Minimum: ${requirement.name}`,
      titleTr: `Minimum Altında: ${requirement.nameTr}`,
      description: `${requirement.description} Current limit (₺${matchingCoverage.limit.toLocaleString('tr-TR')}) is below the required minimum (₺${requirement.minimumLimit.toLocaleString('tr-TR')}).`,
      descriptionTr: `${requirement.descriptionTr} Mevcut limit (₺${matchingCoverage.limit.toLocaleString('tr-TR')}) gerekli minimumun (₺${requirement.minimumLimit.toLocaleString('tr-TR')}) altında.`,
      severity: 'high',
      severityScore: 85,
      financialImpact: {
        potentialLoss: shortfall,
        probability: 0.05,
        expectedLoss: shortfall * 0.05,
      },
      affectedCoverage: matchingCoverage.name,
      affectedCoverageTr: matchingCoverage.nameTr,
      remediation: {
        action: `Increase limit to meet regulatory minimum of ₺${requirement.minimumLimit.toLocaleString('tr-TR')}`,
        actionTr: `Limiti düzenleyici minimum olan ₺${requirement.minimumLimit.toLocaleString('tr-TR')}'ye yükseltin`,
        estimatedCost: Math.round(shortfall * 0.002),
        difficulty: 'easy',
        timeToResolve: '1-2 days',
        steps: [
          'Contact your insurance provider',
          'Request limit increase to regulatory minimum',
          'Pay any additional premium',
          'Receive updated policy documentation',
        ],
        stepsTr: [
          'Sigorta şirketinizle iletişime geçin',
          'Düzenleyici minimuma limit artışı talep edin',
          'Ek primi ödeyin',
          'Güncellenmiş poliçe belgesini alın',
        ],
      },
      detectedAt: new Date().toISOString(),
      confidence: 0.95,
      source: 'compliance',
    }
  }

  return null
}

/**
 * Get earthquake probability by region
 */
function getEarthquakeProbability(region: TurkishRegion): number {
  const probabilities: Record<TurkishRegion, number> = {
    marmara: 0.03,
    ege: 0.02,
    akdeniz: 0.015,
    karadeniz: 0.015,
    ic_anadolu: 0.01,
    dogu_anadolu: 0.025,
    guneydogu: 0.02,
  }
  return probabilities[region] || 0.015
}
