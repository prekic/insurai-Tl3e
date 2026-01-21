/**
 * Data Requests Generator
 *
 * Generates a checklist of missing documents/data needed to finalize
 * extraction when critical items are marked as "Belirsiz" or missing.
 *
 * Types of requests:
 * - Missing pages
 * - Missing vehicle list annex
 * - Missing premium breakdown
 * - Missing endorsement pages
 * - Illegible sections
 * - Clarification needed
 */

import type {
  KaskoExtractionJSON,
  DataRequest,
  DataRequestsReport,
  ExtractionError,
  NormalizationWarning,
} from '@/types/extraction-pipeline'

// ============================================================================
// REQUEST GENERATORS
// ============================================================================

/**
 * Generate requests for missing critical fields
 */
function generateMissingFieldRequests(extraction: KaskoExtractionJSON): DataRequest[] {
  const requests: DataRequest[] = []

  // Missing policy number
  if (!extraction.policyNumber) {
    requests.push({
      id: 'missing-policy-number',
      type: 'clarification_needed',
      description: 'Poliçe numarası belirlenemedi. Lütfen poliçe numarasını içeren sayfa veya bölümü sağlayın.',
      priority: 'critical',
      affectedFields: ['policyNumber'],
      suggestedAction: 'Poliçenin ön yüzü veya özet sayfasını kontrol edin',
    })
  }

  // Missing dates
  if (!extraction.startDate || !extraction.endDate) {
    requests.push({
      id: 'missing-dates',
      type: 'clarification_needed',
      description: 'Poliçe başlangıç ve/veya bitiş tarihleri eksik. Sigorta süresini içeren bölümü sağlayın.',
      priority: 'critical',
      affectedFields: ['startDate', 'endDate'].filter(
        (f) => !extraction[f as keyof KaskoExtractionJSON]
      ),
      suggestedAction: 'Sigorta süresi/vade bölümünü kontrol edin',
    })
  }

  // Missing premium
  if (!extraction.premium?.gross && !extraction.premium?.net) {
    requests.push({
      id: 'missing-premium',
      type: 'missing_premium_breakdown',
      description: 'Prim bilgileri eksik. Prim detaylarını içeren bölümü sağlayın.',
      priority: 'high',
      affectedFields: ['premium.gross', 'premium.net', 'premium.tax'],
      suggestedAction: 'Prim özeti veya ödeme planı sayfasını kontrol edin',
    })
  }

  // Missing vehicle information (for Kasko)
  if (extraction.vehicles.length === 0) {
    requests.push({
      id: 'missing-vehicle',
      type: 'missing_annex',
      description: 'Araç bilgileri eksik. Araç detaylarını içeren ek veya bölümü sağlayın.',
      priority: 'critical',
      affectedFields: ['vehicles'],
      suggestedAction: 'Araç listesi ekini veya ruhsat bilgilerini kontrol edin',
    })
  } else {
    // Check individual vehicle fields
    for (let i = 0; i < extraction.vehicles.length; i++) {
      const vehicle = extraction.vehicles[i]

      if (!vehicle.plate) {
        requests.push({
          id: `missing-plate-${i}`,
          type: 'clarification_needed',
          description: `Araç ${i + 1} için plaka bilgisi eksik.`,
          priority: 'high',
          affectedFields: [`vehicles[${i}].plate`],
          suggestedAction: 'Araç ruhsat bilgilerini kontrol edin',
        })
      }

      if (!vehicle.chassisNo) {
        requests.push({
          id: `missing-chassis-${i}`,
          type: 'clarification_needed',
          description: `Araç ${i + 1} için şasi numarası eksik.`,
          priority: 'medium',
          affectedFields: [`vehicles[${i}].chassisNo`],
          suggestedAction: 'Araç ruhsat veya trafik belgesini kontrol edin',
        })
      }

      // Check vehicle value
      if (!vehicle.vehicleValue?.amount && !vehicle.vehicleValue?.isMarketValue) {
        requests.push({
          id: `missing-value-${i}`,
          type: 'clarification_needed',
          description: `Araç ${i + 1} için değer bilgisi eksik. Rayiç değer mi yoksa belirli bir tutar mı?`,
          priority: 'high',
          affectedFields: [`vehicles[${i}].vehicleValue`],
          suggestedAction: 'Teminat limitleri veya araç değeri bölümünü kontrol edin',
        })
      }
    }
  }

  // Missing insured information
  if (!extraction.insured?.name) {
    requests.push({
      id: 'missing-insured-name',
      type: 'clarification_needed',
      description: 'Sigortalı adı belirlenemedi.',
      priority: 'high',
      affectedFields: ['insured.name'],
      suggestedAction: 'Poliçe sahibi/sigortalı bölümünü kontrol edin',
    })
  }

  // Missing provider
  if (!extraction.provider) {
    requests.push({
      id: 'missing-provider',
      type: 'clarification_needed',
      description: 'Sigorta şirketi adı belirlenemedi.',
      priority: 'high',
      affectedFields: ['provider'],
      suggestedAction: 'Poliçe başlığı veya antetli kağıdı kontrol edin',
    })
  }

  return requests
}

/**
 * Generate requests for coverage issues
 */
function generateCoverageRequests(extraction: KaskoExtractionJSON): DataRequest[] {
  const requests: DataRequest[] = []

  // No coverages at all
  if (extraction.coverages.length === 0) {
    requests.push({
      id: 'missing-coverages',
      type: 'missing_schedule',
      description: 'Teminat bilgileri eksik. Teminat cetvelini veya teminat listesini sağlayın.',
      priority: 'critical',
      affectedFields: ['coverages'],
      suggestedAction: 'Teminat cetveli veya TEMİNATLAR bölümünü kontrol edin',
    })
  } else {
    // Check for coverages without limits
    const coveragesWithoutLimits = extraction.coverages.filter(
      (c) => c.limit === null && !c.isUnlimited && !c.isMarketValue && c.isIncluded
    )

    if (coveragesWithoutLimits.length > 0) {
      requests.push({
        id: 'missing-coverage-limits',
        type: 'clarification_needed',
        description: `${coveragesWithoutLimits.length} teminat için limit bilgisi eksik: ${coveragesWithoutLimits
          .slice(0, 3)
          .map((c) => c.nameTr || c.name)
          .join(', ')}${coveragesWithoutLimits.length > 3 ? '...' : ''}`,
        priority: 'medium',
        affectedFields: coveragesWithoutLimits.map((c) => `coverages[${c.id}].limit`),
        suggestedAction: 'Teminat limitleri tablosunu kontrol edin',
      })
    }
  }

  return requests
}

/**
 * Generate requests based on extraction errors
 */
function generateErrorBasedRequests(errors: ExtractionError[]): DataRequest[] {
  const requests: DataRequest[] = []

  // Group errors by type
  const missingRequired = errors.filter((e) => e.type === 'missing_required')
  const parseErrors = errors.filter((e) => e.type === 'parse_error')
  const ambiguous = errors.filter((e) => e.type === 'ambiguous_value')

  // Missing required fields
  if (missingRequired.length > 0) {
    const criticalMissing = missingRequired.filter((e) => e.severity === 'critical')
    if (criticalMissing.length > 0) {
      requests.push({
        id: 'missing-critical-fields',
        type: 'missing_page',
        description: `Kritik alanlar eksik: ${criticalMissing.map((e) => e.field).join(', ')}. İlgili sayfalar eksik olabilir.`,
        priority: 'critical',
        affectedFields: criticalMissing.map((e) => e.field),
        suggestedAction: 'Belgenin tüm sayfalarının yüklendiğinden emin olun',
      })
    }
  }

  // Parse errors suggest illegible sections
  if (parseErrors.length > 0) {
    requests.push({
      id: 'illegible-sections',
      type: 'illegible_section',
      description: `${parseErrors.length} alanda okuma hatası. Belge kalitesi düşük olabilir.`,
      priority: 'medium',
      affectedFields: parseErrors.map((e) => e.field),
      suggestedAction: 'Daha yüksek kaliteli tarama veya orijinal PDF sağlayın',
    })
  }

  // Ambiguous values need clarification
  if (ambiguous.length > 0) {
    requests.push({
      id: 'ambiguous-values',
      type: 'clarification_needed',
      description: `${ambiguous.length} alanda belirsizlik var: ${ambiguous
        .slice(0, 3)
        .map((e) => e.field)
        .join(', ')}`,
      priority: 'medium',
      affectedFields: ambiguous.map((e) => e.field),
      suggestedAction: 'İlgili alanlar için doğru değerleri belirtin',
    })
  }

  return requests
}

/**
 * Generate requests based on normalization warnings
 */
function generateNormalizationBasedRequests(warnings: NormalizationWarning[]): DataRequest[] {
  const requests: DataRequest[] = []

  // Truncation warnings
  const truncationWarnings = warnings.filter((w) => w.type === 'truncation')
  if (truncationWarnings.length > 0) {
    requests.push({
      id: 'truncated-document',
      type: 'missing_page',
      description: 'Belge kesik görünüyor. Bazı sayfalar eksik olabilir.',
      priority: 'high',
      affectedFields: [],
      suggestedAction: 'Tüm sayfaların dahil edildiğini doğrulayın',
    })
  }

  // Garbled text warnings
  const garbledWarnings = warnings.filter((w) => w.type === 'garbled_text')
  if (garbledWarnings.length > 0) {
    requests.push({
      id: 'garbled-text',
      type: 'illegible_section',
      description: `${garbledWarnings.length} bölümde okunamayan metin tespit edildi.`,
      priority: 'medium',
      affectedFields: [],
      suggestedAction: 'Daha iyi kalitede taranmış belge sağlayın',
    })
  }

  // Missing section warnings
  const missingSectionWarnings = warnings.filter((w) => w.type === 'missing_section')
  if (missingSectionWarnings.length > 0) {
    const sections = missingSectionWarnings.map((w) => w.message).join(', ')
    requests.push({
      id: 'missing-sections',
      type: 'missing_page',
      description: `Beklenen bölümler bulunamadı: ${sections}`,
      priority: 'medium',
      affectedFields: [],
      suggestedAction: 'Belgenin tamamının yüklendiğini kontrol edin',
    })
  }

  return requests
}

/**
 * Generate requests for amendment/endorsement documents
 */
function generateAmendmentRequests(extraction: KaskoExtractionJSON): DataRequest[] {
  const requests: DataRequest[] = []

  if (extraction.amendment?.isAmendment) {
    // Check for base policy reference
    if (!extraction.amendment.basePolicyNumber) {
      requests.push({
        id: 'missing-base-policy',
        type: 'clarification_needed',
        description: 'Bu bir zeyilname ancak ana poliçe numarası belirlenemedi.',
        priority: 'high',
        affectedFields: ['amendment.basePolicyNumber'],
        suggestedAction: 'Ana poliçe numarasını belirtin veya ana poliçeyi yükleyin',
      })
    }

    // Check for premium difference
    if (extraction.amendment.premiumDifference === null) {
      requests.push({
        id: 'missing-premium-diff',
        type: 'clarification_needed',
        description: 'Zeyilname prim farkı belirlenemedi.',
        priority: 'medium',
        affectedFields: ['amendment.premiumDifference'],
        suggestedAction: 'Prim farkı tutarını kontrol edin',
      })
    }
  }

  return requests
}

// ============================================================================
// MAIN GENERATOR FUNCTION
// ============================================================================

export interface DataRequestsInput {
  extraction: KaskoExtractionJSON
  errors: ExtractionError[]
  normalizationWarnings: NormalizationWarning[]
  normalizedText?: string
}

/**
 * Generate complete data requests report
 */
export function generateDataRequests(input: DataRequestsInput): DataRequestsReport {
  const { extraction, errors, normalizationWarnings } = input
  const allRequests: DataRequest[] = []

  // Gather requests from all generators
  allRequests.push(...generateMissingFieldRequests(extraction))
  allRequests.push(...generateCoverageRequests(extraction))
  allRequests.push(...generateErrorBasedRequests(errors))
  allRequests.push(...generateNormalizationBasedRequests(normalizationWarnings))
  allRequests.push(...generateAmendmentRequests(extraction))

  // Deduplicate by ID
  const uniqueRequests = allRequests.filter(
    (r, i, arr) => arr.findIndex((x) => x.id === r.id) === i
  )

  // Sort by priority
  const priorityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  }

  uniqueRequests.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority])

  // Calculate summary
  const summary = {
    total: uniqueRequests.length,
    critical: uniqueRequests.filter((r) => r.priority === 'critical').length,
    blockers: uniqueRequests.filter(
      (r) => r.priority === 'critical' || (r.priority === 'high' && r.type === 'missing_page')
    ).length,
  }

  // Determine if extraction can be finalized
  const canFinalize = summary.critical === 0

  return {
    requests: uniqueRequests,
    summary,
    canFinalize,
  }
}

/**
 * Get formatted checklist for display
 */
export function formatDataRequestsChecklist(report: DataRequestsReport): string {
  if (report.requests.length === 0) {
    return '✅ Tüm gerekli veriler mevcut. Çıkarım tamamlanabilir.'
  }

  const lines: string[] = [
    `📋 Eksik Veriler (${report.summary.total} öğe)`,
    '',
  ]

  if (report.summary.critical > 0) {
    lines.push('🔴 Kritik Eksikler:')
    for (const req of report.requests.filter((r) => r.priority === 'critical')) {
      lines.push(`  • ${req.description}`)
      lines.push(`    → ${req.suggestedAction}`)
    }
    lines.push('')
  }

  const highPriority = report.requests.filter((r) => r.priority === 'high')
  if (highPriority.length > 0) {
    lines.push('🟠 Yüksek Öncelikli:')
    for (const req of highPriority) {
      lines.push(`  • ${req.description}`)
    }
    lines.push('')
  }

  const mediumPriority = report.requests.filter((r) => r.priority === 'medium')
  if (mediumPriority.length > 0) {
    lines.push('🟡 Orta Öncelikli:')
    for (const req of mediumPriority) {
      lines.push(`  • ${req.description}`)
    }
    lines.push('')
  }

  if (!report.canFinalize) {
    lines.push('⚠️ Kritik eksikler giderilmeden çıkarım sonuçlandırılamaz.')
  }

  return lines.join('\n')
}

/**
 * Check if specific data type is missing
 */
export function isDataMissing(
  report: DataRequestsReport,
  dataType: DataRequest['type']
): boolean {
  return report.requests.some((r) => r.type === dataType)
}
