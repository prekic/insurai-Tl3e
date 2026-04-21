import { lookupCoverageNameTr } from '@/lib/i18n/coverage-names'
import { ensureExclusionsEn } from '@/lib/i18n/exclusion-translations'
import { generateMarketComparisonData } from '@/lib/market-data/service'
import type { AnalyzedPolicy, Coverage } from '@/types/policy'
import { deriveDiscountsFromStructured } from '../discount-deriver'
import { translateInsightsToTr } from '../insight-translator'
import { calculateMainCoverage } from '../policy-converter'
import { parseTurkishDate } from '../turkish-utils'
import type { ComprehensiveExtractionResult } from '../policy-extractor'

export function comprehensiveToAnalyzedPolicy(
  result: ComprehensiveExtractionResult,
  file: File,
  rawText: string,
  processedText: string
): AnalyzedPolicy | null {
  if (!result.success || !result.structuredData) {
    return null
  }

  const data = result.structuredData
  const now = new Date()

  // Determine status based on dates
  // Use parseTurkishDate first to avoid V8 DD.MM.YYYY day/month swap (gotcha #52)
  let status: 'active' | 'expiring' | 'expired' | 'pending' = 'active'
  if (data.policy.endDate) {
    const parsedEnd = parseTurkishDate(data.policy.endDate)
    const endDate = parsedEnd ? new Date(parsedEnd + 'T00:00:00Z') : new Date(data.policy.endDate)
    if (!isNaN(endDate.getTime())) {
      const daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      if (daysUntilExpiry < 0) {
        status = 'expired'
      } else if (daysUntilExpiry <= 30) {
        status = 'expiring'
      }
    }
  }

  // Convert coverages — resolve nameTr via AI value, then canonical map fallback
  const coverages: Coverage[] = data.coverages.map((c) => {
    const aiNameTr = c.nameTr && c.nameTr !== c.name ? c.nameTr : null
    const mappedNameTr = lookupCoverageNameTr(c.name)
    return {
      name: c.name,
      nameTr: aiNameTr ?? mappedNameTr ?? c.name,
      limit: c.limit ?? 0,
      deductible: c.deductible ?? 0,
      included: c.included ?? true,
      isUnlimited: c.isUnlimited,
      isMarketValue: c.isMarketValue,
      category: c.category,
      importance:
        c.category === 'main' ? 'critical' : c.category === 'liability' ? 'standard' : 'minor',
    }
  })

  // Calculate main coverage
  const totalCoverage = calculateMainCoverage('kasko', coverages)

  const policy: AnalyzedPolicy = {
    id: crypto.randomUUID(),
    policyNumber: data.policy.policyNumber ?? `POL-${Date.now()}`,
    type: 'kasko',
    typeTr: 'Kasko',
    provider: data.policy.provider,
    logo: '',
    coverage: totalCoverage,
    premium: data.premium.totalPremium,
    monthlyPremium: data.premium.totalPremium / 12,
    deductible: coverages.length > 0 ? Math.max(0, ...coverages.map((c) => c.deductible ?? 0)) : 0,
    startDate: data.policy.startDate,
    expiryDate: data.policy.endDate,
    status,
    uploadDate: now.toISOString().split('T')[0],
    fileName: file.name,
    documentType: 'PDF',
    documentUrl: URL.createObjectURL(file), // Only valid in browser environments
    insuredPerson: data.insured.name,
    location: data.insured.address ?? undefined,
    insuredAddress: data.insured.address ?? undefined,
    coverages,
    exclusions: data.exclusions.map((e) => e.trigger),
    exclusionsEn: ensureExclusionsEn(data.exclusions.map((e) => e.trigger)),
    specialConditions: [],
    insuranceLine: 'Kasko',
    currency: data.premium.currency,
    aiConfidence: result.qualityScore / 100,
    aiInsights: [
      ...result.watchOuts.slice(0, 5).map((w) => `⚠ ${w}`),
      `🔍 Kalite skoru: ${result.qualityScore}/100`,
    ],
    marketComparison: generateMarketComparisonData(
      data.premium.totalPremium,
      totalCoverage,
      'kasko',
      data.insured.address ?? undefined
    ),
    extractedText: rawText,
    processedText,
    vehicleInfo: data.vehicle
      ? {
          make: data.vehicle.make,
          model: data.vehicle.model,
          year: data.vehicle.year,
          plate: data.vehicle.plate,
          chassisNo: data.vehicle.chassisNumber ?? undefined,
          engineNo: data.vehicle.engineNumber ?? undefined,
          usage: data.vehicle.usageType,
        }
      : undefined,
    discounts: data.discounts ?? deriveDiscountsFromStructured(data),
  }

  // Translate insights to Turkish at extraction time
  policy.aiInsightsTr = translateInsightsToTr(policy.aiInsights)

  return policy
}
