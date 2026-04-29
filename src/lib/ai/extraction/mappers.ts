import { lookupCoverageNameTr } from '@/lib/i18n/coverage-names'
import { ensureExclusionsEn } from '@/lib/i18n/exclusion-translations'
import { generateMarketComparisonData } from '@/lib/market-data/service'
import type { AnalyzedPolicy, Coverage } from '@/types/policy'
import { deriveDiscountsFromStructured } from '../discount-deriver'
import { translateInsightsToTr } from '../insight-translator'
import { calculateMainCoverage } from '../policy-converter'
import { extractVehicleInfoFromText, parseTurkishDate } from '../turkish-utils'
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
    // Merge LLM-returned vehicle fields with regex fallback recovered from
    // raw text. Production data showed kasko extractions consistently land
    // with `vehicleInfo.make = NULL` because the LLM omits the field even
    // though the document contains it. The regex extractor handles the
    // common Turkish layouts (Marka:, Aracın Markası:, inverted AXA layout).
    // LLM value wins when present and non-empty; regex fills the gaps.
    // Empty string / 0 / null all count as "missing" — the LLM frequently
    // returns these when it can't find a field.
    vehicleInfo: (() => {
      const fromText = rawText ? extractVehicleInfoFromText(rawText) : undefined
      const fromLlm = data.vehicle
      if (!fromLlm && !fromText) return undefined
      const pickStr = (a: unknown, b: unknown): string | undefined => {
        if (typeof a === 'string' && a.trim()) return a
        if (typeof b === 'string' && b.trim()) return b
        return undefined
      }
      const pickNum = (a: unknown, b: unknown): number | undefined => {
        if (typeof a === 'number' && a > 0) return a
        if (typeof b === 'number' && b > 0) return b
        return undefined
      }
      return {
        make: pickStr(fromLlm?.make, fromText?.make),
        model: pickStr(fromLlm?.model, fromText?.model),
        year: pickNum(fromLlm?.year, fromText?.year),
        plate: pickStr(fromLlm?.plate, fromText?.plate),
        chassisNo: pickStr(fromLlm?.chassisNumber, fromText?.chassisNo),
        engineNo: pickStr(fromLlm?.engineNumber, fromText?.engineNo),
        usage: fromLlm?.usageType,
      }
    })(),
    discounts: data.discounts ?? deriveDiscountsFromStructured(data),
  }

  // Translate insights to Turkish at extraction time
  policy.aiInsightsTr = translateInsightsToTr(policy.aiInsights)

  return policy
}
