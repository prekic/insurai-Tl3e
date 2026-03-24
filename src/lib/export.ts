/**
 * Export utilities for policies
 * Supports PDF and Excel (CSV) export
 */

import { AnalyzedPolicy } from '@/types/policy'

import { buildPolicyReviewerSummary } from '@/lib/reviewer/policy-reviewer-summary'

/**
 * Export policies to CSV format
 */
export function exportToText(policy: AnalyzedPolicy, locale: string = 'tr'): string {
  const summary = buildPolicyReviewerSummary(policy, { locale })
  const isTr = locale === 'tr'

  const coverageLabel = isTr ? 'Teminat' : 'Coverage'
  const deductibleLabel = isTr ? 'Muafiyet' : 'Deductible'
  const coveragesTitle = isTr ? 'Teminatlar' : 'Coverages'
  const exclusionsTitle = isTr ? 'İstisnalar' : 'Exclusions'
  const condDeductTitle = isTr
    ? 'Koşullu Muafiyetler / Özel Şartlar'
    : 'Conditional Deductibles / Special Conditions'
  const insightsTitle = isTr ? 'AI Görüşleri' : 'AI Insights'

  const sections = [
    `${isTr ? 'Poliçe' : 'Policy'}: ${summary.policyNumber}`,
    `${isTr ? 'Şirket' : 'Provider'}: ${summary.providerShort || summary.provider}`,
    `${isTr ? 'Tür' : 'Type'}: ${summary.typeTr}`,
    `${isTr ? 'Sigortalı' : 'Insured'}: ${summary.insured}`,
    `${coverageLabel}: ${summary.coverageTotal}`,
    `${isTr ? 'Prim' : 'Premium'}: ${summary.premium}`,
    `${deductibleLabel}: ${summary.deductible}`,
    `${isTr ? 'Tarih' : 'Period'}: ${summary.period}`,
    '',
    `=== ${coveragesTitle} ===`,
    ...summary.coverages.map((c) => `• ${c.name}: ${c.limit}`),
    '',
    `=== ${exclusionsTitle} ===`,
    ...summary.exclusions.map((e) => `• ${e}`),
  ]

  if (summary.hasConditionalDeductibles && summary.conditionalDeductibles.length > 0) {
    sections.push(
      '',
      `=== ${condDeductTitle} ===`,
      ...summary.conditionalDeductibles.map((d) => `• ${d}`)
    )
  }

  if (summary.insights && summary.insights.length > 0) {
    sections.push(
      '',
      `=== ${insightsTitle} ===`,
      ...summary.insights.map((insight) => `• ${insight}`)
    )
  }

  return sections.join('\n')
}

/**
 * Export policies to CSV format
 */
export function exportToCSV(policies: AnalyzedPolicy[], filename = 'policies'): void {
  // CSV headers
  const headers = [
    'Policy Number',
    'Provider',
    'Type',
    'Type (TR)',
    'Status',
    'Coverage',
    'Premium',
    'Monthly Premium',
    'Deductible',
    'Start Date',
    'Expiry Date',
    'Insured Person',
    'Location',
    'AI Confidence',
    'Upload Date',
  ]

  // Convert policies to CSV rows
  const rows = policies.map((policy) => {
    const summary = buildPolicyReviewerSummary(policy, { locale: 'en' })
    return [
      summary.policyNumber,
      summary.provider,
      summary.type,
      summary.typeTr,
      summary.status,
      summary.coverageTotal,
      summary.premium,
      summary.monthlyPremium,
      summary.deductible,
      summary.startDate,
      summary.expiryDate,
      summary.insured,
      summary.location,
      policy.createdAt ? new Date(policy.createdAt).toLocaleDateString('en-GB') : '-',
    ]
  })

  // Escape CSV values
  const escapeCSV = (value: string): string => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
  }

  // Build CSV content
  const csvContent = [
    headers.map(escapeCSV).join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ].join('\n')

  // Add BOM for Excel UTF-8 compatibility
  const bom = '\ufeff'
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })

  // Download file
  downloadBlob(blob, `${filename}_${formatDateForFilename()}.csv`)
}

/**
 * Export policies to a real XLSX spreadsheet via lazy-loaded xlsx (SheetJS).
 * Falls back to CSV if xlsx fails to load.
 */
export async function exportToExcel(
  policies: AnalyzedPolicy[],
  filename = 'policies'
): Promise<void> {
  try {
    const XLSX = await import('xlsx')

    const rows = policies.map((policy) => {
      const summary = buildPolicyReviewerSummary(policy, { locale: 'en' })
      return {
        'Policy Number': summary.policyNumber,
        Provider: summary.provider,
        Type: summary.type,
        'Type (TR)': summary.typeTr,
        Status: summary.status,
        Coverage: summary.coverageTotal,
        Premium: summary.premium,
        'Monthly Premium': summary.monthlyPremium,
        Deductible: summary.deductible,
        'Start Date': summary.startDate,
        'Expiry Date': summary.expiryDate,
        'Insured Person': summary.insured,
        Location: summary.location,
        'AI Confidence':
          summary.aiConfidence !== null ? `${(summary.aiConfidence * 100).toFixed(0)}%` : '-',
        'Upload Date': policy.createdAt
          ? new Date(policy.createdAt).toLocaleDateString('en-GB')
          : '-',
      }
    })

    const ws = XLSX.utils.json_to_sheet(rows)
    // Set column widths for readability
    ws['!cols'] = [
      { wch: 18 },
      { wch: 16 },
      { wch: 10 },
      { wch: 14 },
      { wch: 10 },
      { wch: 14 },
      { wch: 12 },
      { wch: 14 },
      { wch: 12 },
      { wch: 12 },
      { wch: 12 },
      { wch: 20 },
      { wch: 16 },
      { wch: 14 },
      { wch: 12 },
    ]

    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Policies')

    XLSX.writeFile(wb, `${filename}_${formatDateForFilename()}.xlsx`)
  } catch {
    // Fallback to CSV if xlsx fails
    exportToCSV(policies, filename)
  }
}

/**
 * Export a single policy to a multi-sheet XLSX workbook.
 * Sheets: Policy Info, Coverages, Exclusions, AI Insights
 */
export async function exportSinglePolicyToExcel(
  policy: AnalyzedPolicy,
  locale: 'en' | 'tr' = 'tr'
): Promise<void> {
  try {
    const XLSX = await import('xlsx')
    const isTr = locale === 'tr'
    const summary = buildPolicyReviewerSummary(policy, { locale })

    const wb = XLSX.utils.book_new()

    // Sheet 1: Policy Info
    const infoData = [
      [isTr ? 'Alan' : 'Field', isTr ? 'Değer' : 'Value'],
      [isTr ? 'Poliçe No' : 'Policy Number', summary.policyNumber],
      [isTr ? 'Şirket' : 'Provider', summary.provider],
      [isTr ? 'Tür' : 'Type', summary.typeTr],
      [isTr ? 'Durum' : 'Status', summary.status],
      [isTr ? 'Sigortalı' : 'Insured Person', summary.insured],
      [isTr ? 'Teminat' : 'Coverage', summary.coverageTotal],
      [isTr ? 'Prim' : 'Premium', summary.premium],
      [isTr ? 'Muafiyet' : 'Deductible', summary.deductible],
      [isTr ? 'Başlangıç' : 'Start Date', summary.startDate],
      [isTr ? 'Bitiş' : 'Expiry Date', summary.expiryDate],
      [
        isTr ? 'AI Güven' : 'AI Confidence',
        summary.aiConfidence !== null ? `${(summary.aiConfidence * 100).toFixed(0)}%` : '-',
      ],
    ]
    const wsInfo = XLSX.utils.aoa_to_sheet(infoData)
    wsInfo['!cols'] = [{ wch: 20 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(wb, wsInfo, isTr ? 'Poliçe Bilgileri' : 'Policy Info')

    // Sheet 2: Coverages
    const covHeader = [
      isTr ? 'Teminat' : 'Coverage',
      isTr ? 'Limit' : 'Limit',
      isTr ? 'Muafiyet' : 'Deductible',
      isTr ? 'Dahil' : 'Included',
    ]
    const covData = [
      covHeader,
      ...summary.coverages.map((c) => [
        c.name,
        c.limit,
        c.deductible,
        c.included ? (isTr ? 'Evet' : 'Yes') : isTr ? 'Hayır' : 'No',
      ]),
    ]
    const wsCov = XLSX.utils.aoa_to_sheet(covData)
    wsCov['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 14 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, wsCov, isTr ? 'Teminatlar' : 'Coverages')

    // Sheet 3: Exclusions
    if (summary.exclusions.length > 0) {
      const exclData = [[isTr ? 'İstisna' : 'Exclusion'], ...summary.exclusions.map((e) => [e])]
      const wsExcl = XLSX.utils.aoa_to_sheet(exclData)
      wsExcl['!cols'] = [{ wch: 60 }]
      XLSX.utils.book_append_sheet(wb, wsExcl, isTr ? 'İstisnalar' : 'Exclusions')
    }

    // Sheet 4: Conditional Deductibles
    if (summary.hasConditionalDeductibles && summary.conditionalDeductibles.length > 0) {
      const cdData = [
        [isTr ? 'Koşullu Muafiyet' : 'Conditional Deductible'],
        ...summary.conditionalDeductibles.map((d) => [d]),
      ]
      const wsCd = XLSX.utils.aoa_to_sheet(cdData)
      wsCd['!cols'] = [{ wch: 60 }]
      XLSX.utils.book_append_sheet(
        wb,
        wsCd,
        isTr ? 'Koşullu Muafiyetler' : 'Conditional Deductibles'
      )
    }

    // Sheet 5: AI Insights
    if (summary.insights?.length > 0) {
      const insData = [
        [isTr ? 'AI Görüşü' : 'AI Insight'],
        ...summary.insights.map((insight) => [insight]),
      ]
      const wsIns = XLSX.utils.aoa_to_sheet(insData)
      wsIns['!cols'] = [{ wch: 80 }]
      XLSX.utils.book_append_sheet(wb, wsIns, isTr ? 'AI Görüşleri' : 'AI Insights')
    }

    const safeNumber = summary.policyNumber.replace(/[^a-zA-Z0-9]/g, '_')
    XLSX.writeFile(wb, `${safeNumber}_${formatDateForFilename()}.xlsx`)
  } catch {
    // Fallback to CSV
    exportSinglePolicyToCSV(policy, locale)
  }
}

/**
 * Export a single policy to PDF format
 * Uses browser print functionality for PDF generation
 */
export function exportToPDF(policy: AnalyzedPolicy, locale: string = 'tr'): void {
  // Create a printable HTML document
  const printContent = generatePolicyHTML(policy, locale)

  // Open in new window and print
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    alert('Please allow popups to export PDF')
    return
  }

  printWindow.document.write(printContent)
  printWindow.document.close()

  // Wait for content to load then print
  printWindow.onload = () => {
    printWindow.print()
  }
}

/**
 * Export multiple policies to a summary PDF
 */
export function exportPoliciesToPDF(
  policies: AnalyzedPolicy[],
  title?: string,
  locale: string = 'tr'
): void {
  const displayTitle = title || (locale === 'tr' ? 'Poliçe Raporu' : 'Policy Report')
  const printContent = generatePoliciesSummaryHTML(policies, displayTitle, locale)

  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    alert('Please allow popups to export PDF')
    return
  }

  printWindow.document.write(printContent)
  printWindow.document.close()

  printWindow.onload = () => {
    printWindow.print()
  }
}

/**
 * Generate HTML for a single policy
 */
export function generatePolicyHTML(policy: AnalyzedPolicy, locale: string = 'tr'): string {
  const summary = buildPolicyReviewerSummary(policy, { locale })
  return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <title>${summary.provider} - ${summary.policyNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 40px;
      color: #1a1a1a;
      line-height: 1.6;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .logo { font-size: 24px; font-weight: bold; color: #3b82f6; }
    .policy-number { font-size: 14px; color: #666; }
    h1 { font-size: 28px; margin-bottom: 5px; }
    h2 { font-size: 18px; color: #3b82f6; margin: 25px 0 15px; border-bottom: 1px solid #e5e7eb; padding-bottom: 5px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; }
    .field { margin-bottom: 10px; }
    .label { font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }
    .value { font-size: 16px; font-weight: 500; }
    .highlight { background: #f0f9ff; padding: 20px; border-radius: 8px; margin: 20px 0; }
    .highlight .value { font-size: 24px; color: #3b82f6; }
    .status {
      display: inline-block;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }
    .status-active { background: #dcfce7; color: #166534; }
    .status-expiring { background: #fef9c3; color: #854d0e; }
    .status-expired { background: #fee2e2; color: #991b1b; }
    .coverages { margin-top: 20px; }
    .coverage-item {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px solid #f3f4f6;
    }
    .score-bar { display: flex; align-items: center; gap: 10px; margin: 15px 0; }
    .score-track { flex: 1; height: 12px; background: #e5e7eb; border-radius: 6px; overflow: hidden; }
    .score-fill { height: 100%; border-radius: 6px; }
    .score-label { font-size: 20px; font-weight: bold; min-width: 50px; text-align: right; }
    .excl-list { padding-left: 20px; }
    .excl-list li { margin-bottom: 6px; color: #b91c1c; }
    .insight-list { padding-left: 20px; }
    .insight-list li { margin-bottom: 8px; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; margin-left: 8px; }
    .badge-a { background: #dcfce7; color: #166534; }
    .badge-b { background: #dbeafe; color: #1e40af; }
    .badge-c { background: #fef9c3; color: #854d0e; }
    .badge-d { background: #fed7aa; color: #9a3412; }
    .badge-f { background: #fee2e2; color: #991b1b; }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #666;
      text-align: center;
    }
    @media print {
      body { padding: 20px; }
      @page { margin: 1cm; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">InsurAI</div>
    </div>
    <div style="text-align: right;">
      <div class="label">${locale === 'tr' ? 'Oluşturulma' : 'Generated'}</div>
      <div>${new Date().toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-US')}</div>
    </div>
  </div>

  <h1>${summary.provider}</h1>
  <p style="font-size: 18px; color: #666;">${summary.typeTr}</p>
  <span class="status status-${summary.status}">${
    locale === 'tr'
      ? summary.status === 'active'
        ? 'AKTİF'
        : summary.status === 'expired'
          ? 'SÜRESİ DOLDU'
          : summary.status === 'expiring'
            ? 'YAKINDA BİTİYOR'
            : summary.status === 'cancelled'
              ? 'İPTAL EDİLDİ'
              : summary.status.toUpperCase()
      : summary.status.toUpperCase()
  }</span>

  ${generateScoreSection(summary.aiConfidence, locale)}

  <div class="highlight">
    <div class="grid">
      <div>
        <div class="label">${locale === 'tr' ? 'Toplam Teminat' : 'Total Coverage'}</div>
        <div class="value">${summary.coverageTotal}</div>
      </div>
      <div>
        <div class="label">${locale === 'tr' ? 'Yıllık Prim' : 'Annual Premium'}</div>
        <div class="value">${summary.premium}</div>
      </div>
    </div>
  </div>

  <h2>${locale === 'tr' ? 'Poliçe Detayları' : 'Policy Details'}</h2>
  <div class="grid">
    <div class="field">
      <div class="label">${locale === 'tr' ? 'Poliçe Numarası' : 'Policy Number'}</div>
      <div class="value">${summary.policyNumber}</div>
    </div>
    <div class="field">
      <div class="label">${locale === 'tr' ? 'Sigortalı Kişi' : 'Insured Person'}</div>
      <div class="value">${summary.insured}</div>
    </div>
    <div class="field">
      <div class="label">${locale === 'tr' ? 'Başlangıç Tarihi' : 'Start Date'}</div>
      <div class="value">${summary.startDate}</div>
    </div>
    <div class="field">
      <div class="label">${locale === 'tr' ? 'Bitiş Tarihi' : 'Expiry Date'}</div>
      <div class="value">${summary.expiryDate}</div>
    </div>
    <div class="field">
      <div class="label">${locale === 'tr' ? 'Aylık Prim' : 'Monthly Premium'}</div>
      <div class="value">${summary.monthlyPremium}</div>
    </div>
    <div class="field">
      <div class="label">${locale === 'tr' ? 'Muafiyet' : 'Deductible'}</div>
      <div class="value">${summary.deductible}</div>
    </div>
    ${
      summary.location
        ? `
    <div class="field">
      <div class="label">${locale === 'tr' ? 'Konum' : 'Location'}</div>
      <div class="value">${summary.location}</div>
    </div>
    `
        : ''
    }
    <div class="field">
      <div class="label">${locale === 'tr' ? 'AI Güven Skoru' : 'AI Confidence Score'}</div>
      <div class="value">${summary.aiConfidence !== null ? `${(summary.aiConfidence * 100).toFixed(0)}%` : '-'}</div>
    </div>
  </div>

  ${
    summary.coverages.length > 0
      ? `
  <h2>${locale === 'tr' ? 'Teminatlar' : 'Coverages'}</h2>
  <div class="coverages">
    ${summary.coverages
      .map(
        (c) => `
    <div class="coverage-item">
      <span>${c.name}</span>
      <span>${c.limit}</span>
    </div>
    `
      )
      .join('')}
  </div>
  `
      : ''
  }

  ${
    summary.exclusions && summary.exclusions.length > 0
      ? `
  <h2>${locale === 'tr' ? 'İstisnalar' : 'Exclusions'}</h2>
  <ul class="excl-list">
    ${summary.exclusions.map((e) => `<li>${e}</li>`).join('')}
  </ul>
  `
      : ''
  }

  ${
    summary.hasConditionalDeductibles && summary.conditionalDeductibles.length > 0
      ? `
  <h2>${locale === 'tr' ? 'Koşullu Muafiyetler' : 'Conditional Deductibles'}</h2>
  <ul class="excl-list">
    ${summary.conditionalDeductibles.map((d) => `<li>${d}</li>`).join('')}
  </ul>
  `
      : ''
  }

  ${
    summary.insights && summary.insights.length > 0
      ? `
  <h2>${locale === 'tr' ? 'AI Görüşleri' : 'AI Insights'}</h2>
  <ul class="insight-list">
    ${summary.insights.map((insight) => `<li>${insight}</li>`).join('')}
  </ul>
  `
      : ''
  }

  <div class="footer">
    <p>${locale === 'tr' ? 'InsurAI tarafından oluşturuldu' : 'Generated by InsurAI'} • ${new Date().toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US')}</p>
    <p>${locale === 'tr' ? 'Bu belge yalnızca bilgilendirme amaçlıdır. Lütfen resmi şartlar için orijinal poliçenize başvurun.' : 'This document is for informational purposes only. Please refer to your original policy for official terms.'}</p>
  </div>
</body>
</html>
`
}

/**
 * Generate HTML for multiple policies summary
 */
function generatePoliciesSummaryHTML(
  policies: AnalyzedPolicy[],
  title: string,
  locale: string = 'tr'
): string {
  const stats = {
    total: policies.length,
    active: policies.filter((p) => p.status === 'active').length,
    expiring: policies.filter((p) => p.status === 'expiring').length,
  }

  return `
<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      padding: 40px;
      color: #1a1a1a;
      line-height: 1.5;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #3b82f6;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .logo { font-size: 24px; font-weight: bold; color: #3b82f6; }
    h1 { font-size: 28px; margin-bottom: 20px; }
    .stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 15px;
      margin-bottom: 30px;
    }
    .stat {
      background: #f8fafc;
      padding: 20px;
      border-radius: 8px;
      text-align: center;
    }
    .stat-value { font-size: 28px; font-weight: bold; color: #3b82f6; }
    .stat-label { font-size: 12px; color: #666; text-transform: uppercase; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th {
      background: #f1f5f9;
      padding: 12px 8px;
      text-align: left;
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: #475569;
    }
    td { padding: 12px 8px; border-bottom: 1px solid #e2e8f0; font-size: 13px; }
    tr:hover { background: #f8fafc; }
    .status {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 600;
    }
    .status-active { background: #dcfce7; color: #166534; }
    .status-expiring { background: #fef9c3; color: #854d0e; }
    .status-expired { background: #fee2e2; color: #991b1b; }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      font-size: 12px;
      color: #666;
      text-align: center;
    }
    @media print {
      body { padding: 15px; font-size: 12px; }
      @page { margin: 0.5cm; size: landscape; }
      .stat { padding: 10px; }
      .stat-value { font-size: 20px; }
      th, td { padding: 6px 4px; font-size: 10px; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="logo">InsurAI</div>
      <div style="font-size: 14px; color: #666;">${locale === 'tr' ? 'Sigorta Portföy Raporu' : 'Insurance Portfolio Report'}</div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 12px; color: #666;">${locale === 'tr' ? 'Oluşturulma' : 'Generated'}</div>
      <div>${new Date().toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-US')}</div>
    </div>
  </div>

  <h1>${title}</h1>

  <div class="stats">
    <div class="stat">
      <div class="stat-value">${stats.total}</div>
      <div class="stat-label">${locale === 'tr' ? 'Toplam Poliçe' : 'Total Policies'}</div>
    </div>
    <div class="stat">
      <div class="stat-value">${stats.active}</div>
      <div class="stat-label">${locale === 'tr' ? 'Aktif' : 'Active'}</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>${locale === 'tr' ? 'Poliçe No' : 'Policy Number'}</th>
        <th>${locale === 'tr' ? 'Şirket' : 'Provider'}</th>
        <th>${locale === 'tr' ? 'Tür' : 'Type'}</th>
        <th>${locale === 'tr' ? 'Durum' : 'Status'}</th>
        <th>${locale === 'tr' ? 'Teminat' : 'Coverage'}</th>
        <th>${locale === 'tr' ? 'Prim' : 'Premium'}</th>
        <th>${locale === 'tr' ? 'Bitiş Tarihi' : 'Expiry Date'}</th>
      </tr>
    </thead>
    <tbody>
      ${policies
        .map((p) => {
          const summary = buildPolicyReviewerSummary(p, { locale })
          return `
      <tr>
        <td>${summary.policyNumber}</td>
        <td>${summary.provider}</td>
        <td>${summary.typeTr}</td>
        <td><span class="status status-${summary.status}">${
          locale === 'tr'
            ? summary.status === 'active'
              ? 'AKTİF'
              : summary.status === 'expired'
                ? 'SÜRESİ DOLDU'
                : summary.status === 'expiring'
                  ? 'YAKINDA BİTİYOR'
                  : summary.status === 'cancelled'
                    ? 'İPTAL EDİLDİ'
                    : summary.status.toUpperCase()
            : summary.status.toUpperCase()
        }</span></td>
        <td>${summary.coverageTotal}</td>
        <td>${summary.premium}</td>
        <td>${summary.expiryDate}</td>
      </tr>
      `
        })
        .join('')}
    </tbody>
  </table>

  <div class="footer">
    <p>${locale === 'tr' ? 'InsurAI tarafından oluşturuldu' : 'Generated by InsurAI'} • ${new Date().toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US')}</p>
    <p>${locale === 'tr' ? 'Bu rapor yalnızca bilgilendirme amaçlıdır.' : 'This report is for informational purposes only.'}</p>
  </div>
</body>
</html>
`
}

/**
 * Export a single policy to a detailed CSV with coverages, exclusions, and insights
 */
export function exportSinglePolicyToCSV(policy: AnalyzedPolicy, locale: 'en' | 'tr' = 'tr'): void {
  const isTr = locale === 'tr'
  const summary = buildPolicyReviewerSummary(policy, { locale })

  // --- Policy Info Sheet ---
  const infoHeaders = [isTr ? 'Alan' : 'Field', isTr ? 'Değer' : 'Value']
  const infoRows: string[][] = [
    [isTr ? 'Poliçe No' : 'Policy Number', summary.policyNumber],
    [isTr ? 'Şirket' : 'Provider', summary.provider],
    [isTr ? 'Tür' : 'Type', summary.typeTr],
    [isTr ? 'Durum' : 'Status', summary.status],
    [isTr ? 'Sigortalı' : 'Insured Person', summary.insured],
    [isTr ? 'Konum' : 'Location', summary.location],
    [isTr ? 'Teminat' : 'Coverage', summary.coverageTotal],
    [isTr ? 'Prim' : 'Premium', summary.premium],
    [isTr ? 'Aylık Prim' : 'Monthly Premium', summary.monthlyPremium],
    [isTr ? 'Muafiyet' : 'Deductible', summary.deductible],
    [isTr ? 'Başlangıç' : 'Start Date', summary.startDate],
    [isTr ? 'Bitiş' : 'Expiry Date', summary.expiryDate],
    [
      isTr ? 'AI Güven' : 'AI Confidence',
      summary.aiConfidence !== null ? (summary.aiConfidence * 100).toFixed(0) + '%' : '-',
    ],
  ]

  // --- Coverages Sheet ---
  const covHeaders = [
    isTr ? 'Teminat Adı' : 'Coverage Name',
    isTr ? 'Limit' : 'Limit',
    isTr ? 'Muafiyet' : 'Deductible',
    isTr ? 'Dahil' : 'Included',
  ]
  const covRows = summary.coverages.map((c) => [
    c.name,
    c.limit,
    c.deductible,
    c.included ? (isTr ? 'Evet' : 'Yes') : isTr ? 'Hayır' : 'No',
  ])

  // --- Exclusions Sheet ---
  const exclHeaders = [isTr ? 'İstisna' : 'Exclusion']
  const exclRows = summary.exclusions.map((e) => [e])

  // --- Conditional Deductibles Sheet ---
  const condDeductHeaders = [isTr ? 'Koşullu Muafiyet' : 'Conditional Deductible']
  const condDeductRows = (summary.conditionalDeductibles ?? []).map((d) => [d])

  // --- AI Insights Sheet ---
  const insightHeaders = [isTr ? 'AI Görüşü' : 'AI Insight']
  const insightRows = summary.insights.map((insight) => [insight])

  // Build combined CSV with section separators
  const escapeCSV = (value: string | number | boolean | null | undefined): string => {
    if (value === null || value === undefined) return ''
    const str = String(value)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }
  const toRow = (cells: string[]) => cells.map(escapeCSV).join(',')

  const sections = [
    `# ${isTr ? 'POLİÇE BİLGİLERİ' : 'POLICY INFORMATION'}`,
    toRow(infoHeaders),
    ...infoRows.map(toRow),
    '',
    `# ${isTr ? 'TEMİNATLAR' : 'COVERAGES'}`,
    toRow(covHeaders),
    ...covRows.map(toRow),
    '',
    `# ${isTr ? 'İSTİSNALAR' : 'EXCLUSIONS'}`,
    toRow(exclHeaders),
    ...exclRows.map(toRow),
    '',
    ...(condDeductRows.length > 0
      ? [
          `# ${isTr ? 'KOŞULLU MUAFİYETLER' : 'CONDITIONAL DEDUCTIBLES'}`,
          toRow(condDeductHeaders),
          ...condDeductRows.map(toRow),
          '',
        ]
      : []),
    `# ${isTr ? 'AI GÖRÜŞLERİ' : 'AI INSIGHTS'}`,
    toRow(insightHeaders),
    ...insightRows.map(toRow),
  ]

  const bom = '\ufeff'
  const blob = new Blob([bom + sections.join('\n')], { type: 'text/csv;charset=utf-8;' })

  const safeNumber = summary.policyNumber.replace(/[^a-zA-Z0-9]/g, '_')
  downloadBlob(blob, `${safeNumber}_${formatDateForFilename()}.csv`)
}

/**
 * Generate score visualization section for PDF export
 */
function generateScoreSection(confidence: number | null, locale: string = 'tr'): string {
  if (confidence === null) return ''
  // Only show if rawData has evaluation info
  const score = Math.round(confidence * 100)
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F'
  const barColor = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'

  return `
  <div style="margin: 20px 0; padding: 15px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
    <div class="label">${locale === 'tr' ? 'AI Güven Skoru' : 'AI Confidence Score'}</div>
    <div class="score-bar">
      <div class="score-track">
        <div class="score-fill" style="width: ${score}%; background: ${barColor};"></div>
      </div>
      <span class="score-label">${score}%</span>
      <span class="badge badge-${grade.toLowerCase()}">${grade}</span>
    </div>
  </div>`
}

/**
 * Export comparison results to CSV
 */
export function exportComparisonToCSV(
  policies: AnalyzedPolicy[],
  filename = 'comparison',
  locale: string = 'tr'
): void {
  const headers = ['Metric', ...policies.map((p) => p.provider)]

  const summarizedPolicies = policies.map((p) => buildPolicyReviewerSummary(p, { locale }))

  const rows = [
    ['Policy Number', ...summarizedPolicies.map((p) => p.policyNumber)],
    ['Type', ...summarizedPolicies.map((p) => p.typeTr)],
    ['Status', ...summarizedPolicies.map((p) => p.status)],
    ['Coverage', ...summarizedPolicies.map((p) => p.coverageTotal)],
    ['Premium', ...summarizedPolicies.map((p) => p.premium)],
    ['Monthly Premium', ...summarizedPolicies.map((p) => p.monthlyPremium)],
    ['Deductible', ...summarizedPolicies.map((p) => p.deductible)],
    ['Start Date', ...summarizedPolicies.map((p) => p.startDate)],
    ['Expiry Date', ...summarizedPolicies.map((p) => p.expiryDate)],
    [
      'AI Confidence',
      ...summarizedPolicies.map((p) =>
        p.aiConfidence !== null ? `${(p.aiConfidence * 100).toFixed(0)}%` : '-'
      ),
    ],
    ['Coverages Count', ...summarizedPolicies.map((p) => String(p.coverages.length))],
    ['Exclusions Count', ...summarizedPolicies.map((p) => String(p.exclusions.length))],
  ]

  const escapeCSV = (value: string): string => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
  }

  const csvContent = [
    headers.map(escapeCSV).join(','),
    ...rows.map((row) => row.map(escapeCSV).join(',')),
  ].join('\n')

  const bom = '\ufeff'
  const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8;' })
  downloadBlob(blob, `${filename}_${formatDateForFilename()}.csv`)
}

/**
 * Export comparison results to PDF
 */
export function exportComparisonToPDF(policies: AnalyzedPolicy[], locale: string = 'tr'): void {
  const printContent = generatePoliciesSummaryHTML(policies, 'Policy Comparison Report', locale)

  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    return
  }

  printWindow.document.write(printContent)
  printWindow.document.close()
  printWindow.onload = () => {
    printWindow.print()
  }
}

/**
 * Download a blob as a file
 */
function downloadBlob(blob: Blob, filename: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    const g = globalThis as Record<string, unknown>
    if (typeof g.downloadBlob === 'function') {
      void (g.downloadBlob as (b: Blob, f: string) => void)(blob, filename)
    } else {
      console.warn('Skipping file download in Node environment')
    }
    return
  }
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Format date for filename
 */
function formatDateForFilename(): string {
  return new Date().toISOString().split('T')[0]
}
