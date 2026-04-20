/**
 * PDF Report Templates
 * HTML templates for different report types
 */

import type { AnalyzedPolicy } from '@/types/policy'
import type { DetectedGap } from '@/types/gap'
import type {
  BrandingConfig,
  ReportOptions,
  PolicyDetailReportData,
  GapAnalysisReportData,
  PortfolioReportData,
} from '@/types/pdf-report'
import { formatCurrency } from '@/lib/utils'
import {
  generateBaseStyles,
  generateHeaderHTML,
  generateFooterHTML,
  generateWatermarkHTML,
} from './branding'
import { buildPolicyReviewerSummary } from '@/lib/reviewer/policy-reviewer-summary'

// fmtCovLimitPDF removed since we use string limits from ReviewerSummary

// =============================================================================
// Template Helpers
// =============================================================================

/**
 * Get status badge HTML
 */
function getStatusBadge(status: string): string {
  const styles: Record<string, { bg: string; text: string }> = {
    active: { bg: '#dcfce7', text: '#166534' },
    expiring: { bg: '#fef9c3', text: '#854d0e' },
    expired: { bg: '#fee2e2', text: '#991b1b' },
    pending: { bg: '#e0e7ff', text: '#3730a3' },
  }
  const style = styles[status] || styles.pending
  return `<span class="badge" style="background: ${style.bg}; color: ${style.text};">${status.toUpperCase()}</span>`
}

/**
 * Get severity badge HTML
 */
function getSeverityBadge(severity: string, label?: string): string {
  const styles: Record<string, { bg: string; text: string }> = {
    critical: { bg: '#fee2e2', text: '#991b1b' },
    high: { bg: '#ffedd5', text: '#9a3412' },
    medium: { bg: '#fef9c3', text: '#854d0e' },
    low: { bg: '#dbeafe', text: '#1e40af' },
    info: { bg: '#f3f4f6', text: '#4b5563' },
  }
  const style = styles[severity] || styles.info
  return `<span class="badge" style="background: ${style.bg}; color: ${style.text};">${label || severity.toUpperCase()}</span>`
}

/**
 * Get risk score visualization
 */
function getRiskScoreHTML(score: number): string {
  const getColor = (s: number) => {
    if (s <= 30) return '#22c55e'
    if (s <= 50) return '#84cc16'
    if (s <= 70) return '#eab308'
    if (s <= 85) return '#f97316'
    return '#ef4444'
  }

  const color = getColor(score)
  const label =
    score <= 30
      ? 'Low Risk'
      : score <= 50
        ? 'Moderate'
        : score <= 70
          ? 'Elevated'
          : score <= 85
            ? 'High'
            : 'Critical'

  return `
    <div class="risk-score-container">
      <div class="risk-score-bar">
        <div class="risk-score-fill" style="width: ${score}%; background: ${color};"></div>
      </div>
      <div class="risk-score-info">
        <span class="risk-score-value" style="color: ${color};">${score}</span>
        <span class="risk-score-label">${label}</span>
      </div>
    </div>
    <style>
      .risk-score-container { display: flex; align-items: center; gap: 16px; }
      .risk-score-bar { flex: 1; height: 8px; background: #e5e7eb; border-radius: 4px; overflow: hidden; }
      .risk-score-fill { height: 100%; border-radius: 4px; transition: width 0.3s; }
      .risk-score-info { display: flex; align-items: baseline; gap: 8px; }
      .risk-score-value { font-size: 24px; font-weight: 700; }
      .risk-score-label { font-size: 12px; color: var(--brand-text-light); }
    </style>
  `
}

/**
 * Generate field HTML
 */
function fieldHTML(
  label: string,
  value: string | number,
  highlight = false,
  locale?: string
): string {
  const formattedValue = typeof value === 'number' ? formatCurrency(value, 'TRY', locale) : value
  return `
    <div class="field${highlight ? ' highlight-field' : ''}">
      <div class="field-label">${label}</div>
      <div class="field-value">${formattedValue}</div>
    </div>
  `
}

// =============================================================================
// Policy Detail Template
// =============================================================================

/**
 * Generate policy detail report HTML
 */
export function generatePolicyDetailHTML(
  data: PolicyDetailReportData,
  branding: BrandingConfig,
  options: ReportOptions
): string {
  const { policy, gapAnalysis: _gapAnalysis, marketBenchmark } = data
  const lang = options.language || 'en'
  const isTr = lang === 'tr' || lang === 'bilingual'
  const locale = isTr ? 'tr' : 'en'
  const sections = options.sections || {}

  const summary = buildPolicyReviewerSummary(policy, { locale })

  const title = options.title || (isTr ? 'Poliçe Detay Raporu' : 'Policy Detail Report')
  const subtitle = options.subtitle || `${summary.provider} - ${summary.policyNumber}`

  return `
<!DOCTYPE html>
<html lang="${isTr ? 'tr' : 'en'}">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>${generateBaseStyles(branding)}</style>
</head>
<body>
  ${generateWatermarkHTML(branding)}
  ${generateHeaderHTML(branding, title, subtitle)}

  <!-- Policy Overview -->
  <div class="card highlight-card">
    <div class="stat-grid" style="grid-template-columns: repeat(3, 1fr);">
      <div class="stat-card">
        <div class="stat-value">${formatCurrency(policy.coverage, 'TRY', locale)}</div>
        <div class="stat-label">${isTr ? 'Toplam Teminat' : 'Total Coverage'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatCurrency(policy.premium, 'TRY', locale)}</div>
        <div class="stat-label">${isTr ? 'Yıllık Prim' : 'Annual Premium'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatCurrency(policy.deductible, 'TRY', locale)}</div>
        <div class="stat-label">${isTr ? 'Muafiyet' : 'Deductible'}</div>
      </div>
    </div>
  </div>

  ${
    sections.showPolicyDetails !== false
      ? `
  <!-- Policy Details -->
  <h2>${isTr ? 'Poliçe Bilgileri' : 'Policy Details'}</h2>
  <div class="grid-2">
    ${fieldHTML(isTr ? 'Poliçe Numarası' : 'Policy Number', summary.policyNumber)}
    ${fieldHTML(isTr ? 'Sigorta Şirketi' : 'Provider', summary.provider)}
    ${fieldHTML(isTr ? 'Poliçe Türü' : 'Policy Type', isTr ? summary.typeTr : summary.type)}
    ${fieldHTML(isTr ? 'Durum' : 'Status', getStatusBadge(summary.status))}
    ${fieldHTML(isTr ? 'Başlangıç Tarihi' : 'Start Date', summary.startDate)}
    ${fieldHTML(isTr ? 'Bitiş Tarihi' : 'Expiry Date', summary.expiryDate)}
    ${summary.insured ? fieldHTML(isTr ? 'Sigortalı' : 'Insured Person', summary.insured) : ''}
    ${summary.location ? fieldHTML(isTr ? 'Konum' : 'Location', summary.location) : ''}
  </div>
  `
      : ''
  }

  ${(() => {
    if (!policy.discounts) return ''
    const dList: Array<{ type: string; rate: string }> = []
    if (policy.discounts.ncdDiscount)
      dList.push({
        type: isTr ? 'Hasarsızlık İndirimi' : 'No Claims Discount',
        rate: '%' + policy.discounts.ncdDiscount,
      })
    if (policy.discounts.groupDiscount)
      dList.push({
        type: isTr ? 'Grup/Kurum İndirimi' : 'Group/Corporate Discount',
        rate: '%' + policy.discounts.groupDiscount,
      })
    if (policy.discounts.otherDiscountPct)
      dList.push({
        type: isTr ? 'Diğer İndirimler' : 'Other Discounts',
        rate: '%' + policy.discounts.otherDiscountPct,
      })

    if (dList.length === 0) return ''

    return `
  <!-- Discounts -->
  <h2>${isTr ? 'İndirimler / Ek Avantajlar' : 'Discounts / Extra Benefits'}</h2>
  <table>
    <thead>
      <tr>
        <th>${isTr ? 'İndirim Türü' : 'Discount Type'}</th>
        <th style="text-align: right;">${isTr ? 'Oran / Tutar' : 'Rate / Amount'}</th>
      </tr>
    </thead>
    <tbody>
      ${dList
        .map(
          (d) => `
        <tr>
          <td>${d.type}</td>
          <td style="text-align: right; font-weight: bold; color: #166534;">${d.rate}</td>
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>
  `
  })()}


  ${
    sections.showRiskScore !== false && policy.riskScore
      ? `
  <!-- Risk Assessment -->
  <h2>${isTr ? 'Risk Değerlendirmesi' : 'Risk Assessment'}</h2>
  <div class="card">
    ${getRiskScoreHTML(policy.riskScore.overall)}
    ${
      policy.riskScore.topIssue
        ? `
      <div style="margin-top: 12px; padding: 8px 12px; background: #fef3c7; border-radius: 4px;">
        <strong>${isTr ? 'Önemli Bulgu' : 'Key Finding'}:</strong> ${policy.riskScore.topIssue}
      </div>
    `
        : ''
    }
  </div>
  `
      : ''
  }

  ${
    sections.showCoverages !== false && summary.coverages.length > 0
      ? `
  <!-- Coverages -->
  <h2>${isTr ? 'Teminatlar' : 'Coverages'}</h2>
  <table>
    <thead>
      <tr>
        <th>${isTr ? 'Teminat' : 'Coverage'}</th>
        <th style="text-align: right;">${isTr ? 'Limit' : 'Limit'}</th>
        <th style="text-align: right;">${isTr ? 'Muafiyet' : 'Deductible'}</th>
        <th style="text-align: center;">${isTr ? 'Dahil' : 'Included'}</th>
      </tr>
    </thead>
    <tbody>
      ${summary.coverages
        .map(
          (c) => `
        <tr>
          <td>${c.name}</td>
          <td style="text-align: right;">${c.limit}</td>
          <td style="text-align: right;">${c.deductible}</td>
          <td style="text-align: center;">${c.included ? '✓' : '—'}</td>
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>
  `
      : ''
  }

  ${
    sections.showMarketComparison !== false && marketBenchmark
      ? `
  <!-- Market Comparison -->
  <h2>${isTr ? 'Piyasa Karşılaştırması' : 'Market Comparison'}</h2>
  <div class="grid-3">
    <div class="stat-card">
      <div class="stat-value">${marketBenchmark.percentile}%</div>
      <div class="stat-label">${isTr ? 'Piyasa Yüzdelik' : 'Market Percentile'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${formatCurrency(marketBenchmark.avgPremium, 'TRY', locale)}</div>
      <div class="stat-label">${isTr ? 'Ort. Prim' : 'Avg Premium'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${formatCurrency(marketBenchmark.avgCoverage, 'TRY', locale)}</div>
      <div class="stat-label">${isTr ? 'Ort. Teminat' : 'Avg Coverage'}</div>
    </div>
  </div>
  `
      : ''
  }

  ${
    sections.showExclusions !== false && summary.exclusions.length > 0
      ? `
  <!-- Exclusions -->
  <h2>${isTr ? 'İstisnalar' : 'Exclusions'}</h2>
  <ul>
    ${summary.exclusions.map((e) => `<li>${e}</li>`).join('')}
  </ul>
  `
      : ''
  }

  ${
    summary.hasConditionalDeductibles && summary.conditionalDeductibles.length > 0
      ? `
  <!-- Conditional Deductibles / Special Conditions -->
  <h2>${isTr ? 'Koşullu Muafiyetler / Özel Şartlar' : 'Conditional Deductibles / Special Conditions'}</h2>
  <ul>
    ${summary.conditionalDeductibles.map((e) => `<li>${e}</li>`).join('')}
  </ul>
  `
      : ''
  }

  ${
    sections.showAiInsights !== false && summary.insights && summary.insights.length > 0
      ? `
  <!-- AI Insights -->
  <h2>${isTr ? 'AI Önerileri' : 'AI Insights'}</h2>
  <div class="card">
    <ul>
      ${summary.insights.map((i) => `<li style="margin-bottom: 8px;">${i}</li>`).join('')}
    </ul>
  </div>
  `
      : ''
  }

  ${generateFooterHTML(branding, isTr ? 'tr' : 'en')}
</body>
</html>
  `
}

// =============================================================================
// Gap Analysis Template
// =============================================================================

/**
 * Generate gap analysis report HTML
 */
export function generateGapAnalysisHTML(
  data: GapAnalysisReportData,
  branding: BrandingConfig,
  options: ReportOptions
): string {
  const { policy, gapAnalysis, recommendations } = data
  const lang = options.language || 'en'
  const isTr = lang === 'tr' || lang === 'bilingual'
  const locale = isTr ? 'tr' : 'en'

  const title = options.title || (isTr ? 'Teminat Açığı Analiz Raporu' : 'Gap Analysis Report')
  const subtitle = options.subtitle || `${policy.provider} - ${policy.policyNumber}`

  const formatGapItem = (gap: DetectedGap) => `
    <div class="gap-item severity-${gap.severity}">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
        <strong>${isTr ? gap.titleTr : gap.title}</strong>
        ${getSeverityBadge(gap.severity)}
      </div>
      <p style="font-size: 11px; margin-bottom: 8px;">${isTr ? gap.descriptionTr : gap.description}</p>
      <div style="display: flex; gap: 16px; font-size: 10px; color: var(--brand-text-light);">
        <span>${isTr ? 'Potansiyel Kayıp' : 'Potential Loss'}: ${formatCurrency(gap.financialImpact.potentialLoss, 'TRY', locale)}</span>
        <span>${isTr ? 'Güven' : 'Confidence'}: ${(gap.confidence * 100).toFixed(0)}%</span>
      </div>
    </div>
  `

  return `
<!DOCTYPE html>
<html lang="${isTr ? 'tr' : 'en'}">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>${generateBaseStyles(branding)}</style>
</head>
<body>
  ${generateWatermarkHTML(branding)}
  ${generateHeaderHTML(branding, title, subtitle)}

  <!-- Summary Stats -->
  <div class="card highlight-card">
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-value" style="color: ${gapAnalysis.overallScore > 50 ? 'var(--brand-danger)' : 'var(--brand-success)'};">
          ${gapAnalysis.overallScore}
        </div>
        <div class="stat-label">${isTr ? 'Risk Skoru' : 'Gap Score'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${gapAnalysis.gapCount.total}</div>
        <div class="stat-label">${isTr ? 'Toplam Açık' : 'Total Gaps'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: var(--brand-danger);">${gapAnalysis.gapCount.critical}</div>
        <div class="stat-label">${isTr ? 'Kritik' : 'Critical'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatCurrency(gapAnalysis.financialSummary.totalExpectedLoss, 'TRY', locale)}</div>
        <div class="stat-label">${isTr ? 'Tahmini Kayıp' : 'Expected Loss'}</div>
      </div>
    </div>
  </div>

  <!-- Executive Summary -->
  <h2>${isTr ? 'Yönetici Özeti' : 'Executive Summary'}</h2>
  <div class="card">
    <p style="margin-bottom: 12px;">
      ${
        isTr
          ? `Bu poliçede toplam <strong>${gapAnalysis.gapCount.total} teminat açığı</strong> tespit edilmiştir.
           Bunların <strong>${gapAnalysis.gapCount.critical} tanesi kritik</strong> ve <strong>${gapAnalysis.gapCount.high} tanesi yüksek</strong> önceliklidir.`
          : `A total of <strong>${gapAnalysis.gapCount.total} coverage gaps</strong> were identified in this policy.
           <strong>${gapAnalysis.gapCount.critical} are critical</strong> and <strong>${gapAnalysis.gapCount.high} are high</strong> priority.`
      }
    </p>
    <p>
      ${
        isTr
          ? `Tahmini toplam risk tutarı <strong>${formatCurrency(gapAnalysis.financialSummary.totalExpectedLoss, 'TRY', locale)}</strong> olup,
           önerilen iyileştirme maliyeti yaklaşık <strong>${formatCurrency(gapAnalysis.financialSummary.estimatedRemediationCost, 'TRY', locale)}</strong>'dir.`
          : `The estimated total risk exposure is <strong>${formatCurrency(gapAnalysis.financialSummary.totalExpectedLoss, 'TRY', locale)}</strong>,
           with an estimated remediation cost of approximately <strong>${formatCurrency(gapAnalysis.financialSummary.estimatedRemediationCost, 'TRY', locale)}</strong>.`
      }
    </p>
  </div>

  ${
    gapAnalysis.gapCount.critical > 0
      ? `
  <!-- Critical Gaps -->
  <h2 style="color: var(--brand-danger);">${isTr ? 'Kritik Açıklar' : 'Critical Gaps'}</h2>
  ${gapAnalysis.gapsBySeverity.critical.map(formatGapItem).join('')}
  `
      : ''
  }

  ${
    gapAnalysis.gapCount.high > 0
      ? `
  <!-- High Priority Gaps -->
  <h2 style="color: #f97316;">${isTr ? 'Yüksek Öncelikli Açıklar' : 'High Priority Gaps'}</h2>
  ${gapAnalysis.gapsBySeverity.high.map(formatGapItem).join('')}
  `
      : ''
  }

  ${
    gapAnalysis.gapCount.medium > 0 || gapAnalysis.gapCount.low > 0
      ? `
  <!-- Other Gaps -->
  <h2>${isTr ? 'Diğer Açıklar' : 'Other Gaps'}</h2>
  ${[...gapAnalysis.gapsBySeverity.medium, ...gapAnalysis.gapsBySeverity.low].map(formatGapItem).join('')}
  `
      : ''
  }

  ${
    recommendations && recommendations.length > 0
      ? `
  <!-- Recommendations -->
  <div class="page-break"></div>
  <h2>${isTr ? 'Öneriler' : 'Recommendations'}</h2>
  ${recommendations
    .map(
      (rec, idx) => `
    <div class="recommendation">
      <div class="recommendation-number">${idx + 1}</div>
      <div>
        <div style="font-weight: 600; margin-bottom: 4px;">${isTr ? rec.actionTr : rec.action}</div>
        <div style="font-size: 11px; color: var(--brand-text-light);">
          ${isTr ? rec.impactTr : rec.impact}
          ${rec.estimatedCost ? ` • ${isTr ? 'Tahmini Maliyet' : 'Est. Cost'}: ${formatCurrency(rec.estimatedCost, 'TRY', locale)}` : ''}
        </div>
      </div>
    </div>
  `
    )
    .join('')}
  `
      : ''
  }

  ${generateFooterHTML(branding, isTr ? 'tr' : 'en')}
</body>
</html>
  `
}

// =============================================================================
// Portfolio Template
// =============================================================================

/**
 * Generate portfolio report HTML
 */
export function generatePortfolioHTML(
  data: PortfolioReportData,
  branding: BrandingConfig,
  options: ReportOptions
): string {
  const { policies, summary, byType, gapSummary } = data
  const lang = options.language || 'en'
  const isTr = lang === 'tr' || lang === 'bilingual'
  const locale = isTr ? 'tr' : 'en'

  const title = options.title || (isTr ? 'Portföy Analiz Raporu' : 'Portfolio Analysis Report')
  const subtitle =
    options.subtitle ||
    (isTr ? `${summary.totalPolicies} Poliçe` : `${summary.totalPolicies} Policies`)

  return `
<!DOCTYPE html>
<html lang="${isTr ? 'tr' : 'en'}">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>${generateBaseStyles(branding)}</style>
</head>
<body>
  ${generateWatermarkHTML(branding)}
  ${generateHeaderHTML(branding, title, subtitle)}

  <!-- Portfolio Overview -->
  <div class="card highlight-card">
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-value">${summary.totalPolicies}</div>
        <div class="stat-label">${isTr ? 'Toplam Poliçe' : 'Total Policies'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value" style="color: var(--brand-success);">${summary.activePolicies}</div>
        <div class="stat-label">${isTr ? 'Aktif' : 'Active'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatCurrency(summary.totalCoverage, 'TRY', locale)}</div>
        <div class="stat-label">${isTr ? 'Toplam Teminat' : 'Total Coverage'}</div>
      </div>
      <div class="stat-card">
        <div class="stat-value">${formatCurrency(summary.totalPremium, 'TRY', locale)}</div>
        <div class="stat-label">${isTr ? 'Toplam Prim' : 'Total Premium'}</div>
      </div>
    </div>
  </div>

  ${
    summary.expiringPolicies > 0
      ? `
  <!-- Expiring Alert -->
  <div class="card" style="background: #fef3c7; border-color: #f59e0b;">
    <div style="display: flex; align-items: center; gap: 12px;">
      <span style="font-size: 24px;">⚠️</span>
      <div>
        <strong>${isTr ? 'Dikkat' : 'Attention'}:</strong>
        ${
          isTr
            ? `${summary.expiringPolicies} poliçenin süresi yakında doluyor.`
            : `${summary.expiringPolicies} policies are expiring soon.`
        }
      </div>
    </div>
  </div>
  `
      : ''
  }

  ${
    gapSummary && gapSummary.criticalGaps > 0
      ? `
  <!-- Gap Alert -->
  <div class="card" style="background: #fee2e2; border-color: #ef4444;">
    <div style="display: flex; align-items: center; gap: 12px;">
      <span style="font-size: 24px;">🚨</span>
      <div>
        <strong>${isTr ? 'Kritik Açıklar' : 'Critical Gaps'}:</strong>
        ${
          isTr
            ? `Portföyünüzde ${gapSummary.criticalGaps} kritik teminat açığı bulunmaktadır. Tahmini risk tutarı: ${formatCurrency(gapSummary.estimatedExposure, 'TRY', locale)}`
            : `Your portfolio has ${gapSummary.criticalGaps} critical coverage gaps. Estimated exposure: ${formatCurrency(gapSummary.estimatedExposure, 'TRY', locale)}`
        }
      </div>
    </div>
  </div>
  `
      : ''
  }

  <!-- Policy by Type -->
  <h2>${isTr ? 'Tür Bazında Poliçeler' : 'Policies by Type'}</h2>
  <table>
    <thead>
      <tr>
        <th>${isTr ? 'Poliçe Türü' : 'Policy Type'}</th>
        <th style="text-align: center;">${isTr ? 'Adet' : 'Count'}</th>
        <th style="text-align: right;">${isTr ? 'Toplam Teminat' : 'Total Coverage'}</th>
        <th style="text-align: right;">${isTr ? 'Toplam Prim' : 'Total Premium'}</th>
      </tr>
    </thead>
    <tbody>
      ${Object.entries(byType)
        .map(
          ([type, data]) => `
        <tr>
          <td>${type}</td>
          <td style="text-align: center;">${data.count}</td>
          <td style="text-align: right;">${formatCurrency(data.totalCoverage, 'TRY', locale)}</td>
          <td style="text-align: right;">${formatCurrency(data.totalPremium, 'TRY', locale)}</td>
        </tr>
      `
        )
        .join('')}
    </tbody>
  </table>

  <!-- Policy List -->
  <div class="page-break"></div>
  <h2>${isTr ? 'Poliçe Listesi' : 'Policy List'}</h2>
  <table>
    <thead>
      <tr>
        <th>${isTr ? 'Poliçe No' : 'Policy #'}</th>
        <th>${isTr ? 'Şirket' : 'Provider'}</th>
        <th>${isTr ? 'Tür' : 'Type'}</th>
        <th style="text-align: center;">${isTr ? 'Durum' : 'Status'}</th>
        <th style="text-align: right;">${isTr ? 'Teminat' : 'Coverage'}</th>
        <th style="text-align: right;">${isTr ? 'Prim' : 'Premium'}</th>
        <th>${isTr ? 'Bitiş' : 'Expiry'}</th>
      </tr>
    </thead>
    <tbody>
      ${policies
        .map((p) => {
          const s = buildPolicyReviewerSummary(p, { locale })
          return `
        <tr>
          <td>${s.policyNumber}</td>
          <td>${s.provider}</td>
          <td>${isTr ? s.typeTr : s.type}</td>
          <td style="text-align: center;">${getStatusBadge(s.status)}</td>
          <td style="text-align: right;">${s.coverageTotal}</td>
          <td style="text-align: right;">${s.premium}</td>
          <td>${s.expiryDate}</td>
        </tr>
      `
        })
        .join('')}
    </tbody>
  </table>

  ${
    gapSummary && gapSummary.topIssues.length > 0
      ? `
  <!-- Top Issues -->
  <h2>${isTr ? 'Öncelikli Konular' : 'Top Issues'}</h2>
  <div class="card">
    <ol>
      ${gapSummary.topIssues.map((issue) => `<li style="margin-bottom: 8px;">${issue}</li>`).join('')}
    </ol>
  </div>
  `
      : ''
  }

  ${generateFooterHTML(branding, isTr ? 'tr' : 'en')}
</body>
</html>
  `
}

// =============================================================================
// Policy Summary Template
// =============================================================================

/**
 * Generate policy summary report HTML
 */
export function generatePolicySummaryHTML(
  policies: AnalyzedPolicy[],
  branding: BrandingConfig,
  options: ReportOptions
): string {
  const lang = options.language || 'en'
  const isTr = lang === 'tr' || lang === 'bilingual'
  const locale = isTr ? 'tr' : 'en'

  const title = options.title || (isTr ? 'Poliçe Özet Raporu' : 'Policy Summary Report')

  const stats = {
    total: policies.length,
    active: policies.filter((p) => p.status === 'active').length,
    expiring: policies.filter((p) => p.status === 'expiring').length,
    totalCoverage: policies.reduce((sum, p) => sum + p.coverage, 0),
    totalPremium: policies.reduce((sum, p) => sum + p.premium, 0),
  }

  return `
<!DOCTYPE html>
<html lang="${isTr ? 'tr' : 'en'}">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>${generateBaseStyles(branding)}</style>
</head>
<body>
  ${generateWatermarkHTML(branding)}
  ${generateHeaderHTML(branding, title)}

  <!-- Stats -->
  <div class="stat-grid">
    <div class="stat-card">
      <div class="stat-value">${stats.total}</div>
      <div class="stat-label">${isTr ? 'Toplam Poliçe' : 'Total Policies'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color: var(--brand-success);">${stats.active}</div>
      <div class="stat-label">${isTr ? 'Aktif' : 'Active'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${formatCurrency(stats.totalCoverage, 'TRY', locale)}</div>
      <div class="stat-label">${isTr ? 'Toplam Teminat' : 'Total Coverage'}</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${formatCurrency(stats.totalPremium, 'TRY', locale)}</div>
      <div class="stat-label">${isTr ? 'Toplam Prim' : 'Total Premium'}</div>
    </div>
  </div>

  <!-- Policy Table -->
  <table>
    <thead>
      <tr>
        <th>${isTr ? 'Poliçe No' : 'Policy #'}</th>
        <th>${isTr ? 'Şirket' : 'Provider'}</th>
        <th>${isTr ? 'Tür' : 'Type'}</th>
        <th style="text-align: center;">${isTr ? 'Durum' : 'Status'}</th>
        <th style="text-align: right;">${isTr ? 'Teminat' : 'Coverage'}</th>
        <th style="text-align: right;">${isTr ? 'Prim' : 'Premium'}</th>
        <th>${isTr ? 'Bitiş' : 'Expiry'}</th>
      </tr>
    </thead>
    <tbody>
      ${policies
        .map((p) => {
          const s = buildPolicyReviewerSummary(p, { locale })
          return `
        <tr>
          <td>${s.policyNumber}</td>
          <td>${s.provider}</td>
          <td>${isTr ? s.typeTr : s.type}</td>
          <td style="text-align: center;">${getStatusBadge(s.status)}</td>
          <td style="text-align: right;">${s.coverageTotal}</td>
          <td style="text-align: right;">${s.premium}</td>
          <td>${s.expiryDate}</td>
        </tr>
      `
        })
        .join('')}
    </tbody>
  </table>

  ${generateFooterHTML(branding, isTr ? 'tr' : 'en')}
</body>
</html>
  `
}
