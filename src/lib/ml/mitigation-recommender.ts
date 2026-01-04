/**
 * Risk Mitigation Recommender
 * Generates actionable recommendations to reduce policy risk
 */

import type { RiskScore, RiskMitigation, RiskCategory } from '@/types/risk'

/**
 * Mitigation templates for each risk category
 */
const MITIGATION_TEMPLATES: Record<
  RiskCategory,
  Array<{
    trigger: (score: number) => boolean
    priority: RiskMitigation['priority']
    issue: string
    recommendation: string
    expectedImpact: number
    estimatedCostMultiplier?: number
    difficulty: RiskMitigation['difficulty']
  }>
> = {
  coverage_gaps: [
    {
      trigger: (score) => score >= 60,
      priority: 'critical',
      issue: 'Kritik teminat eksiklikleri tespit edildi',
      recommendation: 'Poliçeye temel teminatları ekleyin: Deprem, sel, hırsızlık gibi yaygın risklere karşı koruma sağlayın',
      expectedImpact: 25,
      estimatedCostMultiplier: 1.3,
      difficulty: 'moderate',
    },
    {
      trigger: (score) => score >= 40 && score < 60,
      priority: 'high',
      issue: 'Bazı önemli teminatlar eksik',
      recommendation: 'Eksik teminatları ekleyerek kapsamı genişletin',
      expectedImpact: 15,
      estimatedCostMultiplier: 1.15,
      difficulty: 'easy',
    },
    {
      trigger: (score) => score >= 20 && score < 40,
      priority: 'medium',
      issue: 'Teminat kapsamı iyileştirilebilir',
      recommendation: 'Opsiyonel teminatları değerlendirin',
      expectedImpact: 8,
      difficulty: 'easy',
    },
  ],

  pricing: [
    {
      trigger: (score) => score >= 50,
      priority: 'high',
      issue: 'Fiyatlandırma piyasa normlarının dışında',
      recommendation: 'En az 3 farklı sigorta şirketinden teklif alarak karşılaştırın',
      expectedImpact: 15,
      difficulty: 'easy',
    },
    {
      trigger: (score) => score >= 30 && score < 50,
      priority: 'medium',
      issue: 'Fiyat optimizasyonu mümkün',
      recommendation: 'Hasarsızlık indirimi ve sadakat indirimi için başvurun',
      expectedImpact: 8,
      difficulty: 'easy',
    },
  ],

  provider: [
    {
      trigger: (score) => score >= 50,
      priority: 'high',
      issue: 'Sigorta şirketi risk profili yüksek',
      recommendation: 'Daha yüksek mali derecelendirmeye sahip bir şirketle çalışmayı değerlendirin',
      expectedImpact: 15,
      difficulty: 'moderate',
    },
    {
      trigger: (score) => score >= 30 && score < 50,
      priority: 'medium',
      issue: 'Şirket profili ortalama düzeyde',
      recommendation: 'Şirketin hasar ödeme performansını kontrol edin',
      expectedImpact: 5,
      difficulty: 'easy',
    },
  ],

  temporal: [
    {
      trigger: (score) => score >= 80,
      priority: 'critical',
      issue: 'Poliçe süresi dolmuş veya dolmak üzere',
      recommendation: 'ACİL: Poliçeyi derhal yenileyin, sigortasız kalmayın',
      expectedImpact: 35,
      difficulty: 'easy',
    },
    {
      trigger: (score) => score >= 50 && score < 80,
      priority: 'high',
      issue: 'Poliçe vadesi yaklaşıyor',
      recommendation: 'Yenileme sürecini başlatın, alternatif teklifleri değerlendirin',
      expectedImpact: 20,
      difficulty: 'easy',
    },
  ],

  geographic: [
    {
      trigger: (score) => score >= 40,
      priority: 'medium',
      issue: 'Bölgesel risk faktörleri yüksek',
      recommendation: 'Bölgeye özel ek teminatlar ekleyin (deprem, sel vb.)',
      expectedImpact: 10,
      estimatedCostMultiplier: 1.1,
      difficulty: 'moderate',
    },
  ],

  concentration: [
    {
      trigger: (score) => score >= 50,
      priority: 'high',
      issue: 'Teminat çeşitliliği yetersiz',
      recommendation: 'Riski dağıtmak için farklı teminat türleri ekleyin',
      expectedImpact: 12,
      estimatedCostMultiplier: 1.2,
      difficulty: 'moderate',
    },
    {
      trigger: (score) => score >= 30 && score < 50,
      priority: 'medium',
      issue: 'Koruma tek bir alana yoğunlaşmış',
      recommendation: 'Ek teminatlarla portföyü çeşitlendirin',
      expectedImpact: 8,
      difficulty: 'easy',
    },
  ],

  deductible: [
    {
      trigger: (score) => score >= 60,
      priority: 'high',
      issue: 'Muafiyet tutarları çok yüksek',
      recommendation: 'Muafiyetleri düşürün, hasar durumunda cebinizden ödeyeceğiniz tutarı azaltın',
      expectedImpact: 15,
      estimatedCostMultiplier: 1.25,
      difficulty: 'easy',
    },
    {
      trigger: (score) => score >= 35 && score < 60,
      priority: 'medium',
      issue: 'Muafiyet tutarları optimum değil',
      recommendation: 'Muafiyet ve prim dengesini gözden geçirin',
      expectedImpact: 8,
      difficulty: 'easy',
    },
  ],

  exclusions: [
    {
      trigger: (score) => score >= 50,
      priority: 'high',
      issue: 'Kritik istisna maddeleri mevcut',
      recommendation: 'İstisnaları dikkatlice inceleyin, mümkünse ek teminatla kapatın',
      expectedImpact: 12,
      estimatedCostMultiplier: 1.15,
      difficulty: 'moderate',
    },
    {
      trigger: (score) => score >= 30 && score < 50,
      priority: 'medium',
      issue: 'Bazı riskler kapsam dışı',
      recommendation: 'İstisna listesini inceleyin, ihtiyaçlarınıza uygun mu kontrol edin',
      expectedImpact: 5,
      difficulty: 'easy',
    },
  ],
}

/**
 * Generate risk mitigation recommendations
 */
export function generateMitigations(riskScore: RiskScore): RiskMitigation[] {
  const mitigations: RiskMitigation[] = []

  for (const [category, categoryData] of Object.entries(riskScore.categories)) {
    if (!categoryData) continue

    const templates = MITIGATION_TEMPLATES[category as RiskCategory]
    if (!templates) continue

    for (const template of templates) {
      if (template.trigger(categoryData.score)) {
        const estimatedCost = template.estimatedCostMultiplier
          ? (template.estimatedCostMultiplier - 1) * 100
          : undefined

        mitigations.push({
          priority: template.priority,
          category: category as RiskCategory,
          issue: template.issue,
          recommendation: template.recommendation,
          expectedImpact: template.expectedImpact,
          estimatedCost,
          difficulty: template.difficulty,
        })
      }
    }
  }

  // Sort by priority and expected impact
  const priorityOrder: Record<RiskMitigation['priority'], number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  }

  mitigations.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
    if (priorityDiff !== 0) return priorityDiff
    return b.expectedImpact - a.expectedImpact
  })

  return mitigations
}

/**
 * Get quick wins - easy mitigations with high impact
 */
export function getQuickWins(mitigations: RiskMitigation[]): RiskMitigation[] {
  return mitigations
    .filter(m => m.difficulty === 'easy' && m.expectedImpact >= 10)
    .slice(0, 3)
}

/**
 * Calculate total potential risk reduction
 */
export function calculatePotentialReduction(mitigations: RiskMitigation[]): number {
  // Cap at 50 points reduction (can't eliminate all risk)
  return Math.min(
    50,
    mitigations.reduce((sum, m) => sum + m.expectedImpact * 0.7, 0) // 70% effectiveness
  )
}

/**
 * Estimate cost of implementing all mitigations
 */
export function estimateMitigationCost(
  mitigations: RiskMitigation[],
  currentPremium: number | null
): number | null {
  if (!currentPremium) return null

  const costIncreases = mitigations
    .map(m => m.estimatedCost)
    .filter((cost): cost is number => cost !== undefined)

  if (costIncreases.length === 0) return 0

  // Compound cost increases (not additive)
  const compoundFactor = costIncreases.reduce(
    (factor, increase) => factor * (1 + increase / 100),
    1
  )

  return currentPremium * (compoundFactor - 1)
}

/**
 * Get priority summary for dashboard
 */
export function getMitigationSummary(mitigations: RiskMitigation[]): {
  critical: number
  high: number
  medium: number
  low: number
  totalImpact: number
} {
  return {
    critical: mitigations.filter(m => m.priority === 'critical').length,
    high: mitigations.filter(m => m.priority === 'high').length,
    medium: mitigations.filter(m => m.priority === 'medium').length,
    low: mitigations.filter(m => m.priority === 'low').length,
    totalImpact: calculatePotentialReduction(mitigations),
  }
}
