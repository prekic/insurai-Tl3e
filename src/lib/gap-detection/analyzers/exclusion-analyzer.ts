/**
 * Exclusion Gap Analyzer
 * Detects problematic policy exclusions
 */

import type { PolicyType, AnalyzedPolicy } from '@/types/policy'
import type { TurkishRegion } from '@/types/market-data'
import type { DetectedGap, GapDetectionConfig } from '@/types/gap'
import { generateGapId, DEFAULT_GAP_CONFIG } from '@/types/gap'

/**
 * Exclusion risk patterns by policy type
 */
const EXCLUSION_PATTERNS: Record<PolicyType, ExclusionPattern[]> = {
  kasko: [
    { pattern: /deprem|earthquake/i, risk: 'critical', nameTr: 'Deprem Hasarı', nameEn: 'Earthquake Damage' },
    { pattern: /sel|flood/i, risk: 'high', nameTr: 'Sel Hasarı', nameEn: 'Flood Damage' },
    { pattern: /hırsızlık|theft/i, risk: 'critical', nameTr: 'Hırsızlık', nameEn: 'Theft' },
    { pattern: /vandal|zarar/i, risk: 'medium', nameTr: 'Vandalizm', nameEn: 'Vandalism' },
    { pattern: /cam|glass/i, risk: 'medium', nameTr: 'Cam Kırılması', nameEn: 'Glass Breakage' },
    { pattern: /terör|terror/i, risk: 'low', nameTr: 'Terör', nameEn: 'Terrorism' },
  ],
  traffic: [
    { pattern: /kasıt|intent/i, risk: 'low', nameTr: 'Kasıtlı Hasar', nameEn: 'Intentional Damage' },
  ],
  home: [
    { pattern: /deprem|earthquake/i, risk: 'critical', nameTr: 'Deprem', nameEn: 'Earthquake' },
    { pattern: /hırsızlık|theft/i, risk: 'critical', nameTr: 'Hırsızlık', nameEn: 'Theft' },
    { pattern: /sel|flood/i, risk: 'high', nameTr: 'Sel', nameEn: 'Flood' },
    { pattern: /yangın|fire/i, risk: 'critical', nameTr: 'Yangın', nameEn: 'Fire' },
    { pattern: /cam|glass/i, risk: 'low', nameTr: 'Cam Kırılması', nameEn: 'Glass Breakage' },
    { pattern: /su|water/i, risk: 'medium', nameTr: 'Su Hasarı', nameEn: 'Water Damage' },
    { pattern: /duman|smoke/i, risk: 'medium', nameTr: 'Duman Hasarı', nameEn: 'Smoke Damage' },
  ],
  health: [
    { pattern: /kanser|cancer/i, risk: 'critical', nameTr: 'Kanser Tedavisi', nameEn: 'Cancer Treatment' },
    { pattern: /kronik|chronic/i, risk: 'high', nameTr: 'Kronik Hastalık', nameEn: 'Chronic Illness' },
    { pattern: /diş|dental/i, risk: 'medium', nameTr: 'Diş Tedavisi', nameEn: 'Dental Treatment' },
    { pattern: /yurtdışı|abroad|overseas/i, risk: 'medium', nameTr: 'Yurtdışı Tedavi', nameEn: 'Overseas Treatment' },
    { pattern: /hamilelik|pregnancy|doğum|birth/i, risk: 'high', nameTr: 'Hamilelik/Doğum', nameEn: 'Pregnancy/Birth' },
    { pattern: /psikiyatri|psychiatric|mental/i, risk: 'medium', nameTr: 'Psikiyatrik Tedavi', nameEn: 'Psychiatric Treatment' },
    { pattern: /estetik|cosmetic/i, risk: 'low', nameTr: 'Estetik İşlemler', nameEn: 'Cosmetic Procedures' },
  ],
  life: [
    { pattern: /intihar|suicide/i, risk: 'medium', nameTr: 'İntihar', nameEn: 'Suicide' },
    { pattern: /savaş|war/i, risk: 'low', nameTr: 'Savaş', nameEn: 'War' },
    { pattern: /kaza|accident/i, risk: 'high', nameTr: 'Kaza Sonucu Vefat', nameEn: 'Accidental Death' },
    { pattern: /maluliyet|disability/i, risk: 'high', nameTr: 'Maluliyet', nameEn: 'Disability' },
    { pattern: /kritik hastalık|critical illness/i, risk: 'high', nameTr: 'Kritik Hastalık', nameEn: 'Critical Illness' },
  ],
  dask: [
    { pattern: /tsunami/i, risk: 'medium', nameTr: 'Tsunami', nameEn: 'Tsunami' },
    { pattern: /heyelan|landslide/i, risk: 'medium', nameTr: 'Heyelan', nameEn: 'Landslide' },
  ],
  business: [
    { pattern: /iş durması|business interruption/i, risk: 'critical', nameTr: 'İş Durması', nameEn: 'Business Interruption' },
    { pattern: /siber|cyber/i, risk: 'high', nameTr: 'Siber Saldırı', nameEn: 'Cyber Attack' },
    { pattern: /sorumluluk|liability/i, risk: 'critical', nameTr: 'Mesleki Sorumluluk', nameEn: 'Professional Liability' },
    { pattern: /çalışan|employee/i, risk: 'high', nameTr: 'Çalışan Kaynaklı Hasar', nameEn: 'Employee-caused Damage' },
    { pattern: /grev|strike/i, risk: 'medium', nameTr: 'Grev/Lokavt', nameEn: 'Strike/Lockout' },
    { pattern: /terör|terror/i, risk: 'medium', nameTr: 'Terör', nameEn: 'Terrorism' },
  ],
  nakliyat: [
    { pattern: /emtia hasarı|cargo damage/i, risk: 'critical', nameTr: 'Emtia Hasarı', nameEn: 'Cargo Damage' },
    { pattern: /yükleme|boşaltma|loading|unloading/i, risk: 'high', nameTr: 'Yükleme/Boşaltma Hasarı', nameEn: 'Loading/Unloading Damage' },
    { pattern: /hırsızlık|theft/i, risk: 'critical', nameTr: 'Hırsızlık', nameEn: 'Theft' },
    { pattern: /deprem|earthquake|doğal afet|natural disaster/i, risk: 'high', nameTr: 'Doğal Afetler', nameEn: 'Natural Disasters' },
    { pattern: /depo|warehouse|storage/i, risk: 'medium', nameTr: 'Depo Riski', nameEn: 'Warehouse Risk' },
    { pattern: /gecikme|delay/i, risk: 'medium', nameTr: 'Gecikme Hasarı', nameEn: 'Delay Damage' },
    { pattern: /kontaminasyon|contamination/i, risk: 'high', nameTr: 'Kontaminasyon', nameEn: 'Contamination' },
  ],
}

interface ExclusionPattern {
  pattern: RegExp
  risk: 'critical' | 'high' | 'medium' | 'low'
  nameTr: string
  nameEn: string
}

/**
 * Regional exclusion importance
 */
const REGIONAL_EXCLUSION_IMPORTANCE: Record<TurkishRegion, string[]> = {
  marmara: ['deprem', 'earthquake', 'sel', 'flood'],
  ege: ['deprem', 'earthquake'],
  akdeniz: ['sel', 'flood', 'yangın', 'fire'],
  karadeniz: ['sel', 'flood', 'heyelan', 'landslide'],
  ic_anadolu: ['kuraklık', 'drought'],
  dogu_anadolu: ['deprem', 'earthquake', 'don', 'frost'],
  guneydogu: ['deprem', 'earthquake'],
}

/**
 * Analyze exclusion gaps
 */
export function analyzeExclusionGaps(
  policy: AnalyzedPolicy,
  config: GapDetectionConfig = DEFAULT_GAP_CONFIG,
  region: TurkishRegion = 'marmara'
): DetectedGap[] {
  const gaps: DetectedGap[] = []
  const patterns = EXCLUSION_PATTERNS[policy.type] || []
  const regionalImportant = REGIONAL_EXCLUSION_IMPORTANCE[region] || []

  let index = 0
  for (const exclusion of policy.exclusions) {
    for (const pattern of patterns) {
      if (pattern.pattern.test(exclusion)) {
        let severity = riskToSeverity(pattern.risk)

        // Bump severity for regionally important exclusions
        if (regionalImportant.some(re => pattern.pattern.test(re))) {
          if (severity === 'medium') severity = 'high'
          if (severity === 'low') severity = 'medium'
        }

        const gap: DetectedGap = {
          id: generateGapId('exclusion', getExclusionSubCategory(severity), index++),
          category: 'exclusion',
          subCategory: getExclusionSubCategory(severity),
          title: `Excluded: ${pattern.nameEn}`,
          titleTr: `İstisna: ${pattern.nameTr}`,
          description: `Your policy excludes ${pattern.nameEn.toLowerCase()}. This exclusion text: "${exclusion}"`,
          descriptionTr: `Poliçeniz ${pattern.nameTr.toLowerCase()} hasarını kapsam dışı bırakıyor. İstisna metni: "${exclusion}"`,
          severity,
          severityScore: getSeverityScore(severity),
          financialImpact: getExclusionFinancialImpact(pattern, policy.type, region),
          affectedCoverage: pattern.nameEn,
          affectedCoverageTr: pattern.nameTr,
          remediation: createExclusionRemediation(pattern, policy.type),
          detectedAt: new Date().toISOString(),
          confidence: 0.9,
          source: 'exclusion',
        }

        gaps.push(gap)
        break // Only match first pattern per exclusion
      }
    }
  }

  // Check for critical exclusions that should be present
  const typeRules = config.policyTypeRules[policy.type]
  if (typeRules?.criticalExclusions) {
    for (const criticalExclusion of typeRules.criticalExclusions) {
      const isExcluded = policy.exclusions.some(e =>
        e.toLowerCase().includes(criticalExclusion.toLowerCase())
      )

      const hasCoverage = policy.coverages.some(c =>
        c.name.toLowerCase().includes(criticalExclusion.toLowerCase()) ||
        c.nameTr?.toLowerCase().includes(criticalExclusion.toLowerCase())
      )

      if (isExcluded && !hasCoverage) {
        // This is a critical area that's excluded - add warning if not already captured
        const alreadyCaptured = gaps.some(g =>
          g.affectedCoverage?.toLowerCase().includes(criticalExclusion.toLowerCase()) ||
          g.affectedCoverageTr?.toLowerCase().includes(criticalExclusion.toLowerCase())
        )

        if (!alreadyCaptured) {
          const gap: DetectedGap = {
            id: generateGapId('exclusion', 'high_risk_exclusion', index++),
            category: 'exclusion',
            subCategory: 'high_risk_exclusion',
            title: `Critical Exclusion: ${criticalExclusion}`,
            titleTr: `Kritik İstisna: ${criticalExclusion}`,
            description: `This policy explicitly excludes ${criticalExclusion}, which is considered critical for ${policy.type} policies.`,
            descriptionTr: `Bu poliçe ${criticalExclusion} hasarını açıkça kapsam dışı bırakıyor, bu ${policy.typeTr} poliçeleri için kritik kabul edilir.`,
            severity: 'high',
            severityScore: 75,
            financialImpact: {
              potentialLoss: 100000,
              probability: 0.05,
              expectedLoss: 5000,
            },
            affectedCoverage: criticalExclusion,
            affectedCoverageTr: criticalExclusion,
            remediation: {
              action: `Consider adding ${criticalExclusion} coverage via endorsement`,
              actionTr: `Zeyilname ile ${criticalExclusion} teminatı eklemeyi düşünün`,
              estimatedCost: null,
              difficulty: 'moderate',
              timeToResolve: '1 week',
              steps: [
                'Contact your insurance provider',
                'Request coverage for excluded risk',
                'Review additional premium and terms',
                'Consider standalone policy if not available',
              ],
              stepsTr: [
                'Sigorta şirketinizle iletişime geçin',
                'İstisna edilen risk için teminat talep edin',
                'Ek primi ve şartları inceleyin',
                'Mümkün değilse müstakil poliçe düşünün',
              ],
            },
            detectedAt: new Date().toISOString(),
            confidence: 0.85,
            source: 'exclusion',
          }

          gaps.push(gap)
        }
      }
    }
  }

  return gaps
}

function riskToSeverity(risk: 'critical' | 'high' | 'medium' | 'low'): DetectedGap['severity'] {
  const mapping = { critical: 'critical', high: 'high', medium: 'medium', low: 'low' } as const
  return mapping[risk]
}

function getExclusionSubCategory(severity: DetectedGap['severity']): DetectedGap['subCategory'] {
  if (severity === 'critical' || severity === 'high') return 'high_risk_exclusion'
  if (severity === 'medium') return 'common_claim_excluded'
  return 'regional_risk'
}

function getSeverityScore(severity: DetectedGap['severity']): number {
  const scores = { critical: 95, high: 75, medium: 50, low: 25, info: 10 }
  return scores[severity]
}

function getExclusionFinancialImpact(
  pattern: ExclusionPattern,
  _policyType: PolicyType,
  region: TurkishRegion
): DetectedGap['financialImpact'] {
  // Note: _policyType reserved for future policy-type-specific loss estimates
  // Base potential losses by exclusion type
  const baseLosses: Record<string, number> = {
    'deprem': 500000,
    'yangın': 300000,
    'hırsızlık': 100000,
    'sel': 150000,
    'siber': 200000,
    'iş durması': 500000,
    'kanser': 300000,
    'kronik': 150000,
  }

  // Base probabilities
  const baseProbabilities: Record<string, number> = {
    'deprem': 0.02,
    'yangın': 0.02,
    'hırsızlık': 0.05,
    'sel': 0.03,
    'siber': 0.08,
    'iş durması': 0.03,
    'kanser': 0.01,
    'kronik': 0.05,
  }

  let potentialLoss = 100000 // Default
  let probability = 0.05 // Default

  for (const [key, loss] of Object.entries(baseLosses)) {
    if (pattern.pattern.test(key) || pattern.nameTr.toLowerCase().includes(key)) {
      potentialLoss = loss
      probability = baseProbabilities[key] || 0.05
      break
    }
  }

  // Apply regional multiplier
  const regionalMultipliers: Record<TurkishRegion, number> = {
    marmara: 1.3, ege: 1.2, akdeniz: 1.1, karadeniz: 1.15,
    ic_anadolu: 1.0, dogu_anadolu: 1.25, guneydogu: 1.15,
  }

  const multiplier = regionalMultipliers[region] || 1.0
  potentialLoss = Math.round(potentialLoss * multiplier)

  return {
    potentialLoss,
    probability,
    expectedLoss: Math.round(potentialLoss * probability),
  }
}

function createExclusionRemediation(pattern: ExclusionPattern, _policyType: PolicyType): DetectedGap['remediation'] {
  // Note: _policyType reserved for future policy-type-specific remediation
  return {
    action: `Request coverage for ${pattern.nameEn} via policy endorsement`,
    actionTr: `Zeyilname ile ${pattern.nameTr} teminatı talep edin`,
    estimatedCost: null,
    difficulty: pattern.risk === 'critical' ? 'moderate' : 'easy',
    timeToResolve: pattern.risk === 'critical' ? '1-2 weeks' : '3-5 days',
    steps: [
      'Contact your insurance provider or broker',
      `Request ${pattern.nameEn} coverage addition`,
      'Review additional premium and any new conditions',
      'Sign endorsement if terms are acceptable',
    ],
    stepsTr: [
      'Sigorta şirketiniz veya brokerinizle iletişime geçin',
      `${pattern.nameTr} teminatı eklenmesini talep edin`,
      'Ek primi ve yeni şartları inceleyin',
      'Şartlar uygunsa zeyilnameyi imzalayın',
    ],
    alternatives: [
      {
        action: `Purchase standalone ${pattern.nameEn.toLowerCase()} insurance`,
        actionTr: `Ayrı ${pattern.nameTr.toLowerCase()} sigortası satın alın`,
        tradeoff: 'May offer more comprehensive coverage but at additional cost',
      },
    ],
  }
}
