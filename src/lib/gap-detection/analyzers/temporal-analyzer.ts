/**
 * Temporal Gap Analyzer
 * Detects coverage period gaps and timing issues
 */

import type { AnalyzedPolicy } from '@/types/policy'
import type { TurkishRegion } from '@/types/market-data'
import type { DetectedGap, GapDetectionConfig } from '@/types/gap'
import { generateGapId, DEFAULT_GAP_CONFIG } from '@/types/gap'

/**
 * Analyze temporal gaps in policy coverage
 */
export function analyzeTemporalGaps(
  policy: AnalyzedPolicy,
  config: GapDetectionConfig = DEFAULT_GAP_CONFIG,
  _region: TurkishRegion = 'marmara'
): DetectedGap[] {
  const gaps: DetectedGap[] = []
  const now = new Date()
  let index = 0

  // Parse policy dates
  const startDate = parseDate(policy.startDate)
  const expiryDate = parseDate(policy.expiryDate)

  if (!expiryDate) {
    // Missing expiry date
    const gap: DetectedGap = {
      id: generateGapId('temporal', 'documentation_gap', index++),
      category: 'temporal',
      subCategory: 'documentation_gap',
      title: 'Missing Expiry Date',
      titleTr: 'Bitiş Tarihi Eksik',
      description: 'Policy expiry date could not be determined. This may indicate incomplete documentation.',
      descriptionTr: 'Poliçe bitiş tarihi belirlenemedi. Bu, eksik belgelemeyi gösterebilir.',
      severity: 'medium',
      severityScore: 50,
      financialImpact: {
        potentialLoss: 0,
        probability: 0,
        expectedLoss: 0,
      },
      remediation: {
        action: 'Verify policy expiry date with provider',
        actionTr: 'Poliçe bitiş tarihini sağlayıcıyla doğrulayın',
        estimatedCost: 0,
        difficulty: 'easy',
        timeToResolve: '1 day',
        steps: [
          'Contact your insurance provider',
          'Request policy documentation with clear dates',
          'Update records with correct expiry date',
        ],
        stepsTr: [
          'Sigorta şirketinizle iletişime geçin',
          'Net tarihlerle poliçe belgesi talep edin',
          'Kayıtları doğru bitiş tarihiyle güncelleyin',
        ],
      },
      detectedAt: new Date().toISOString(),
      confidence: 0.9,
      source: 'temporal',
    }
    gaps.push(gap)
    return gaps
  }

  const daysToExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  const warningDays = config.thresholds.expiryWarningDays

  // Check if policy is expired
  if (daysToExpiry < 0) {
    const gap: DetectedGap = {
      id: generateGapId('temporal', 'coverage_lapse', index++),
      category: 'temporal',
      subCategory: 'coverage_lapse',
      title: 'Policy Expired',
      titleTr: 'Poliçe Süresi Dolmuş',
      description: `This policy expired ${Math.abs(daysToExpiry)} days ago on ${formatDate(expiryDate)}. You currently have no coverage.`,
      descriptionTr: `Bu poliçenin süresi ${Math.abs(daysToExpiry)} gün önce ${formatDateTr(expiryDate)} tarihinde doldu. Şu anda teminatınız yok.`,
      severity: 'critical',
      severityScore: 100,
      financialImpact: {
        potentialLoss: policy.coverage || 500000,
        probability: 0.1, // 10% chance of incident during lapse
        expectedLoss: Math.round((policy.coverage || 500000) * 0.1),
      },
      remediation: {
        action: 'Renew policy immediately',
        actionTr: 'Poliçeyi hemen yenileyin',
        estimatedCost: policy.premium || 0,
        difficulty: 'easy',
        timeToResolve: '1-2 days',
        steps: [
          'Contact insurance provider immediately',
          'Request policy renewal or new policy',
          'Confirm coverage start date with no gap',
          'Pay premium promptly to activate coverage',
        ],
        stepsTr: [
          'Sigorta şirketinizle hemen iletişime geçin',
          'Poliçe yenilemesi veya yeni poliçe talep edin',
          'Kesintisiz teminat başlangıç tarihini onaylayın',
          'Teminatı aktive etmek için primi hemen ödeyin',
        ],
      },
      detectedAt: new Date().toISOString(),
      confidence: 1.0,
      source: 'temporal',
    }
    gaps.push(gap)
  } else if (daysToExpiry <= 7) {
    // Expiring within a week - critical
    const gap: DetectedGap = {
      id: generateGapId('temporal', 'expiring_soon', index++),
      category: 'temporal',
      subCategory: 'expiring_soon',
      title: 'Policy Expiring Very Soon',
      titleTr: 'Poliçe Çok Yakında Sona Eriyor',
      description: `This policy expires in ${daysToExpiry} day(s) on ${formatDate(expiryDate)}. Immediate action required to avoid coverage lapse.`,
      descriptionTr: `Bu poliçe ${daysToExpiry} gün içinde ${formatDateTr(expiryDate)} tarihinde sona eriyor. Teminat kesintisini önlemek için acil işlem gerekli.`,
      severity: 'critical',
      severityScore: 90,
      financialImpact: {
        potentialLoss: policy.coverage || 500000,
        probability: 0.02,
        expectedLoss: Math.round((policy.coverage || 500000) * 0.02),
      },
      remediation: {
        action: 'Renew policy before expiry',
        actionTr: 'Süre dolmadan poliçeyi yenileyin',
        estimatedCost: policy.premium || 0,
        difficulty: 'easy',
        timeToResolve: '1-2 days',
        steps: [
          'Contact insurance provider today',
          'Initiate renewal process',
          'Review any changes in terms or premium',
          'Complete payment before expiry date',
        ],
        stepsTr: [
          'Bugün sigorta şirketinizle iletişime geçin',
          'Yenileme sürecini başlatın',
          'Şartlarda veya primde değişiklikleri inceleyin',
          'Bitiş tarihinden önce ödemeyi tamamlayın',
        ],
      },
      detectedAt: new Date().toISOString(),
      confidence: 1.0,
      source: 'temporal',
    }
    gaps.push(gap)
  } else if (daysToExpiry <= warningDays) {
    // Expiring within warning period
    const gap: DetectedGap = {
      id: generateGapId('temporal', 'expiring_soon', index++),
      category: 'temporal',
      subCategory: 'expiring_soon',
      title: 'Policy Expiring Soon',
      titleTr: 'Poliçe Yakında Sona Eriyor',
      description: `This policy expires in ${daysToExpiry} days on ${formatDate(expiryDate)}. Plan your renewal to ensure continuous coverage.`,
      descriptionTr: `Bu poliçe ${daysToExpiry} gün içinde ${formatDateTr(expiryDate)} tarihinde sona eriyor. Kesintisiz teminat için yenilemeyi planlayın.`,
      severity: 'high',
      severityScore: 70,
      financialImpact: {
        potentialLoss: policy.coverage || 500000,
        probability: 0.01,
        expectedLoss: Math.round((policy.coverage || 500000) * 0.01),
      },
      remediation: {
        action: 'Plan policy renewal',
        actionTr: 'Poliçe yenilemesini planlayın',
        estimatedCost: policy.premium || 0,
        difficulty: 'easy',
        timeToResolve: '1 week',
        steps: [
          'Set reminder for renewal',
          'Compare quotes from other providers',
          'Request renewal quote from current provider',
          'Complete renewal at least 1 week before expiry',
        ],
        stepsTr: [
          'Yenileme için hatırlatıcı ayarlayın',
          'Diğer sağlayıcılardan teklif karşılaştırın',
          'Mevcut sağlayıcıdan yenileme teklifi isteyin',
          'Süreden en az 1 hafta önce yenilemeyi tamamlayın',
        ],
      },
      detectedAt: new Date().toISOString(),
      confidence: 1.0,
      source: 'temporal',
    }
    gaps.push(gap)
  }

  // Check for short policy term (less than 1 year)
  if (startDate && expiryDate) {
    const termDays = Math.ceil((expiryDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))

    if (termDays < 365 && termDays > 0) {
      const gap: DetectedGap = {
        id: generateGapId('temporal', 'waiting_period', index++),
        category: 'temporal',
        subCategory: 'waiting_period',
        title: 'Short Policy Term',
        titleTr: 'Kısa Poliçe Süresi',
        description: `This policy has a ${termDays}-day term, which is shorter than the standard annual term. This may result in more frequent renewals and potential coverage gaps.`,
        descriptionTr: `Bu poliçe ${termDays} günlük bir süreye sahip, standart yıllık süreden kısa. Bu, daha sık yenilemeler ve potansiyel teminat boşluklarına neden olabilir.`,
        severity: 'info',
        severityScore: 20,
        financialImpact: {
          potentialLoss: 0,
          probability: 0,
          expectedLoss: 0,
        },
        remediation: {
          action: 'Consider annual policy for better continuity',
          actionTr: 'Daha iyi süreklilik için yıllık poliçe düşünün',
          estimatedCost: null,
          difficulty: 'easy',
          timeToResolve: 'At renewal',
          steps: [
            'Request annual policy quote at renewal',
            'Compare cost per day of coverage',
            'Evaluate administrative convenience',
          ],
          stepsTr: [
            'Yenilemede yıllık poliçe teklifi isteyin',
            'Günlük teminat maliyetini karşılaştırın',
            'İdari kolaylığı değerlendirin',
          ],
        },
        detectedAt: new Date().toISOString(),
        confidence: 0.9,
        source: 'temporal',
      }
      gaps.push(gap)
    }
  }

  // Check for retroactive date issues (for liability policies)
  if (policy.type === 'business' || policy.type === 'health') {
    // Check if policy mentions retroactive limitations
    const hasRetroactiveLimitation = policy.specialConditions?.some(condition =>
      condition.toLowerCase().includes('retroaktif') ||
      condition.toLowerCase().includes('retroactive') ||
      condition.toLowerCase().includes('geçmişe dönük')
    )

    if (hasRetroactiveLimitation) {
      const gap: DetectedGap = {
        id: generateGapId('temporal', 'retroactive_gap', index++),
        category: 'temporal',
        subCategory: 'retroactive_gap',
        title: 'Retroactive Date Limitation',
        titleTr: 'Geçmişe Dönük Tarih Kısıtlaması',
        description: 'This policy has retroactive date limitations which may exclude claims for incidents that occurred before a certain date.',
        descriptionTr: 'Bu poliçede geçmişe dönük tarih kısıtlamaları var, belirli bir tarihten önce gerçekleşen olaylar için talepleri dışlayabilir.',
        severity: 'medium',
        severityScore: 45,
        financialImpact: {
          potentialLoss: policy.coverage ? policy.coverage * 0.2 : 100000,
          probability: 0.02,
          expectedLoss: Math.round((policy.coverage ? policy.coverage * 0.2 : 100000) * 0.02),
        },
        remediation: {
          action: 'Request removal or extension of retroactive date',
          actionTr: 'Geçmişe dönük tarihin kaldırılmasını veya uzatılmasını talep edin',
          estimatedCost: null,
          difficulty: 'moderate',
          timeToResolve: '1-2 weeks',
          steps: [
            'Review the specific retroactive date in your policy',
            'Assess if past events may trigger claims',
            'Request extension of retroactive coverage',
            'Consider prior acts coverage if available',
          ],
          stepsTr: [
            'Poliçenizdeki belirli geçmişe dönük tarihi inceleyin',
            'Geçmiş olayların talep oluşturup oluşturmayacağını değerlendirin',
            'Geçmişe dönük teminatın uzatılmasını talep edin',
            'Varsa önceki eylemler teminatını düşünün',
          ],
        },
        detectedAt: new Date().toISOString(),
        confidence: 0.75,
        source: 'temporal',
      }
      gaps.push(gap)
    }
  }

  return gaps
}

/**
 * Parse date string to Date object
 */
function parseDate(dateStr: string | undefined): Date | null {
  if (!dateStr) return null

  // Try various date formats
  const formats = [
    /^(\d{4})-(\d{2})-(\d{2})$/, // YYYY-MM-DD
    /^(\d{2})\.(\d{2})\.(\d{4})$/, // DD.MM.YYYY (Turkish format)
    /^(\d{2})\/(\d{2})\/(\d{4})$/, // DD/MM/YYYY
  ]

  for (const format of formats) {
    const match = dateStr.match(format)
    if (match) {
      if (format === formats[0]) {
        return new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]))
      } else {
        return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]))
      }
    }
  }

  // Try direct parsing
  const parsed = new Date(dateStr)
  return isNaN(parsed.getTime()) ? null : parsed
}

/**
 * Format date for English display
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * Format date for Turkish display
 */
function formatDateTr(date: Date): string {
  return date.toLocaleDateString('tr-TR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}
