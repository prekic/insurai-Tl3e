/**
 * Export utilities for policies
 * Supports PDF and Excel (CSV) export
 */

import { AnalyzedPolicy } from '@/types/policy'
import { formatCurrency, formatDate } from './utils'

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
  const rows = policies.map((policy) => [
    policy.policyNumber,
    policy.provider,
    policy.type,
    policy.typeTr,
    policy.status,
    policy.coverage.toString(),
    policy.premium.toString(),
    policy.monthlyPremium.toString(),
    policy.deductible.toString(),
    policy.startDate,
    policy.expiryDate,
    policy.insuredPerson || '',
    policy.location || '',
    (policy.aiConfidence * 100).toFixed(0) + '%',
    policy.uploadDate,
  ])

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
  const bom = '\uFEFF'
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

    const rows = policies.map((policy) => ({
      'Policy Number': policy.policyNumber,
      Provider: policy.provider,
      Type: policy.type,
      'Type (TR)': policy.typeTr,
      Status: policy.status,
      Coverage: policy.coverage,
      Premium: policy.premium,
      'Monthly Premium': policy.monthlyPremium,
      Deductible: policy.deductible,
      'Start Date': policy.startDate,
      'Expiry Date': policy.expiryDate,
      'Insured Person': policy.insuredPerson || '',
      Location: policy.location || '',
      'AI Confidence': `${(policy.aiConfidence * 100).toFixed(0)}%`,
      'Upload Date': policy.uploadDate,
    }))

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

    const wb = XLSX.utils.book_new()

    // Sheet 1: Policy Info
    const infoData = [
      [isTr ? 'Alan' : 'Field', isTr ? 'Değer' : 'Value'],
      [isTr ? 'Poliçe No' : 'Policy Number', policy.policyNumber],
      [isTr ? 'Şirket' : 'Provider', policy.provider],
      [isTr ? 'Tür' : 'Type', policy.typeTr],
      [isTr ? 'Durum' : 'Status', policy.status],
      [isTr ? 'Sigortalı' : 'Insured Person', policy.insuredPerson || ''],
      [isTr ? 'Teminat' : 'Coverage', formatCurrency(policy.coverage, 'TRY', locale)],
      [isTr ? 'Prim' : 'Premium', formatCurrency(policy.premium, 'TRY', locale)],
      [isTr ? 'Muafiyet' : 'Deductible', formatCurrency(policy.deductible, 'TRY', locale)],
      [isTr ? 'Başlangıç' : 'Start Date', formatDate(policy.startDate, locale)],
      [isTr ? 'Bitiş' : 'Expiry Date', formatDate(policy.expiryDate, locale)],
      [isTr ? 'AI Güven' : 'AI Confidence', `${(policy.aiConfidence * 100).toFixed(0)}%`],
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
      ...policy.coverages.map((c) => [
        isTr ? c.nameTr || c.name : c.name,
        c.isUnlimited
          ? isTr
            ? 'Sınırsız'
            : 'Unlimited'
          : c.isMarketValue
            ? isTr
              ? 'Rayiç Değer'
              : 'Market Value'
            : c.limit,
        c.deductible,
        c.included ? (isTr ? 'Evet' : 'Yes') : isTr ? 'Hayır' : 'No',
      ]),
    ]
    const wsCov = XLSX.utils.aoa_to_sheet(covData)
    wsCov['!cols'] = [{ wch: 30 }, { wch: 16 }, { wch: 14 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, wsCov, isTr ? 'Teminatlar' : 'Coverages')

    // Sheet 3: Exclusions
    if (policy.exclusions.length > 0) {
      const exclData = [[isTr ? 'İstisna' : 'Exclusion'], ...policy.exclusions.map((e) => [e])]
      const wsExcl = XLSX.utils.aoa_to_sheet(exclData)
      wsExcl['!cols'] = [{ wch: 60 }]
      XLSX.utils.book_append_sheet(wb, wsExcl, isTr ? 'İstisnalar' : 'Exclusions')
    }

    // Sheet 4: AI Insights
    if (policy.aiInsights?.length > 0) {
      const insights = isTr && policy.aiInsightsTr ? policy.aiInsightsTr : policy.aiInsights
      const insData = [[isTr ? 'AI Görüşü' : 'AI Insight'], ...insights.map((i) => [i])]
      const wsIns = XLSX.utils.aoa_to_sheet(insData)
      wsIns['!cols'] = [{ wch: 80 }]
      XLSX.utils.book_append_sheet(wb, wsIns, isTr ? 'AI Görüşleri' : 'AI Insights')
    }

    const safeNumber = policy.policyNumber.replace(/[^a-zA-Z0-9]/g, '_')
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
  title = 'Policy Report',
  locale: string = 'tr'
): void {
  const printContent = generatePoliciesSummaryHTML(policies, title, locale)

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
function generatePolicyHTML(policy: AnalyzedPolicy, locale: string = 'tr'): string {
  return `
<!DOCTYPE html>
<html lang="tr">
<head>
  <meta charset="UTF-8">
  <title>${policy.provider} - ${policy.policyNumber}</title>
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
      <div class="policy-number">Policy Report</div>
    </div>
    <div style="text-align: right;">
      <div class="label">Generated</div>
      <div>${new Date().toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-US')}</div>
    </div>
  </div>

  <h1>${policy.provider}</h1>
  <p style="font-size: 18px; color: #666;">${policy.typeTr}</p>
  <span class="status status-${policy.status}">${policy.status.toUpperCase()}</span>

  ${generateScoreSection(policy)}

  <div class="highlight">
    <div class="grid">
      <div>
        <div class="label">Total Coverage</div>
        <div class="value">${formatCurrency(policy.coverage, 'TRY', locale)}</div>
      </div>
      <div>
        <div class="label">Annual Premium</div>
        <div class="value">${formatCurrency(policy.premium, 'TRY', locale)}</div>
      </div>
    </div>
  </div>

  <h2>Policy Details</h2>
  <div class="grid">
    <div class="field">
      <div class="label">Policy Number</div>
      <div class="value">${policy.policyNumber}</div>
    </div>
    <div class="field">
      <div class="label">Insured Person</div>
      <div class="value">${policy.insuredPerson || 'N/A'}</div>
    </div>
    <div class="field">
      <div class="label">Start Date</div>
      <div class="value">${formatDate(policy.startDate, locale)}</div>
    </div>
    <div class="field">
      <div class="label">Expiry Date</div>
      <div class="value">${formatDate(policy.expiryDate, locale)}</div>
    </div>
    <div class="field">
      <div class="label">Monthly Premium</div>
      <div class="value">${formatCurrency(policy.monthlyPremium, 'TRY', locale)}</div>
    </div>
    <div class="field">
      <div class="label">Deductible</div>
      <div class="value">${formatCurrency(policy.deductible, 'TRY', locale)}</div>
    </div>
    ${
      policy.location
        ? `
    <div class="field">
      <div class="label">Location</div>
      <div class="value">${policy.location}</div>
    </div>
    `
        : ''
    }
    <div class="field">
      <div class="label">AI Confidence</div>
      <div class="value">${(policy.aiConfidence * 100).toFixed(0)}%</div>
    </div>
  </div>

  ${
    policy.coverages.length > 0
      ? `
  <h2>Coverages</h2>
  <div class="coverages">
    ${policy.coverages
      .map(
        (c) => `
    <div class="coverage-item">
      <span>${c.nameTr || c.name}</span>
      <span>${formatCurrency(c.limit, 'TRY', locale)}</span>
    </div>
    `
      )
      .join('')}
  </div>
  `
      : ''
  }

  ${
    policy.exclusions && policy.exclusions.length > 0
      ? `
  <h2>Exclusions</h2>
  <ul class="excl-list">
    ${policy.exclusions.map((e) => `<li>${e}</li>`).join('')}
  </ul>
  `
      : ''
  }

  ${
    policy.aiInsights && policy.aiInsights.length > 0
      ? `
  <h2>AI Insights</h2>
  <ul class="insight-list">
    ${policy.aiInsights.map((insight) => `<li>${insight}</li>`).join('')}
  </ul>
  `
      : ''
  }

  <div class="footer">
    <p>Generated by InsurAI • ${new Date().toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US')}</p>
    <p>This document is for informational purposes only. Please refer to your original policy for official terms.</p>
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
    totalCoverage: policies.reduce((sum, p) => sum + p.coverage, 0),
    totalPremium: policies.reduce((sum, p) => sum + p.premium, 0),
  }

  return `
<!DOCTYPE html>
<html lang="tr">
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
      <div style="font-size: 14px; color: #666;">Insurance Portfolio Report</div>
    </div>
    <div style="text-align: right;">
      <div style="font-size: 12px; color: #666;">Generated</div>
      <div>${new Date().toLocaleDateString(locale === 'tr' ? 'tr-TR' : 'en-US')}</div>
    </div>
  </div>

  <h1>${title}</h1>

  <div class="stats">
    <div class="stat">
      <div class="stat-value">${stats.total}</div>
      <div class="stat-label">Total Policies</div>
    </div>
    <div class="stat">
      <div class="stat-value">${stats.active}</div>
      <div class="stat-label">Active</div>
    </div>
    <div class="stat">
      <div class="stat-value">${formatCurrency(stats.totalCoverage, 'TRY', locale)}</div>
      <div class="stat-label">Total Coverage</div>
    </div>
    <div class="stat">
      <div class="stat-value">${formatCurrency(stats.totalPremium, 'TRY', locale)}</div>
      <div class="stat-label">Total Premium</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Policy Number</th>
        <th>Provider</th>
        <th>Type</th>
        <th>Status</th>
        <th>Coverage</th>
        <th>Premium</th>
        <th>Expiry Date</th>
      </tr>
    </thead>
    <tbody>
      ${policies
        .map(
          (p) => `
      <tr>
        <td>${p.policyNumber}</td>
        <td>${p.provider}</td>
        <td>${p.typeTr}</td>
        <td><span class="status status-${p.status}">${p.status}</span></td>
        <td>${formatCurrency(p.coverage, 'TRY', locale)}</td>
        <td>${formatCurrency(p.premium, 'TRY', locale)}</td>
        <td>${formatDate(p.expiryDate, locale)}</td>
      </tr>
      `
        )
        .join('')}
    </tbody>
  </table>

  <div class="footer">
    <p>Generated by InsurAI • ${new Date().toLocaleString(locale === 'tr' ? 'tr-TR' : 'en-US')}</p>
    <p>This report is for informational purposes only.</p>
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

  // --- Policy Info Sheet ---
  const infoHeaders = [isTr ? 'Alan' : 'Field', isTr ? 'Değer' : 'Value']
  const infoRows: string[][] = [
    [isTr ? 'Poliçe No' : 'Policy Number', policy.policyNumber],
    [isTr ? 'Şirket' : 'Provider', policy.provider],
    [isTr ? 'Tür' : 'Type', policy.typeTr],
    [isTr ? 'Durum' : 'Status', policy.status],
    [isTr ? 'Sigortalı' : 'Insured Person', policy.insuredPerson || ''],
    [isTr ? 'Konum' : 'Location', policy.location || ''],
    [
      isTr ? 'Teminat' : 'Coverage',
      policy.type === 'kasko'
        ? isTr
          ? 'Araç Rayiç Bedeli'
          : 'Market Value'
        : formatCurrency(policy.coverage, 'TRY', locale),
    ],
    [isTr ? 'Prim' : 'Premium', formatCurrency(policy.premium, 'TRY', locale)],
    [isTr ? 'Aylık Prim' : 'Monthly Premium', formatCurrency(policy.monthlyPremium, 'TRY', locale)],
    [isTr ? 'Muafiyet' : 'Deductible', formatCurrency(policy.deductible, 'TRY', locale)],
    [isTr ? 'Başlangıç' : 'Start Date', formatDate(policy.startDate, locale)],
    [isTr ? 'Bitiş' : 'Expiry Date', formatDate(policy.expiryDate, locale)],
    [isTr ? 'AI Güven' : 'AI Confidence', (policy.aiConfidence * 100).toFixed(0) + '%'],
  ]

  // --- Coverages Sheet ---
  const covHeaders = [
    isTr ? 'Teminat Adı' : 'Coverage Name',
    isTr ? 'Teminat Adı (TR)' : 'Coverage Name (TR)',
    isTr ? 'Limit' : 'Limit',
    isTr ? 'Muafiyet' : 'Deductible',
    isTr ? 'Dahil' : 'Included',
  ]
  const covRows = policy.coverages.map((c) => [
    c.name,
    c.nameTr || c.name,
    c.isUnlimited
      ? isTr
        ? 'Sınırsız'
        : 'Unlimited'
      : c.isMarketValue
        ? isTr
          ? 'Rayiç Değer'
          : 'Market Value'
        : c.limit.toString(),
    c.deductible.toString(),
    c.included ? (isTr ? 'Evet' : 'Yes') : isTr ? 'Hayır' : 'No',
  ])

  // --- Exclusions Sheet ---
  const exclHeaders = [isTr ? 'İstisna' : 'Exclusion']
  const exclRows = policy.exclusions.map((e) => [e])

  // --- AI Insights Sheet ---
  const insightHeaders = [isTr ? 'AI Görüşü' : 'AI Insight']
  const insightRows = (isTr && policy.aiInsightsTr ? policy.aiInsightsTr : policy.aiInsights).map(
    (i) => [i]
  )

  // Build combined CSV with section separators
  const escapeCSV = (value: string): string => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
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
    `# ${isTr ? 'AI GÖRÜŞLERİ' : 'AI INSIGHTS'}`,
    toRow(insightHeaders),
    ...insightRows.map(toRow),
  ]

  const bom = '\uFEFF'
  const blob = new Blob([bom + sections.join('\n')], { type: 'text/csv;charset=utf-8;' })

  const safeNumber = policy.policyNumber.replace(/[^a-zA-Z0-9]/g, '_')
  downloadBlob(blob, `${safeNumber}_${formatDateForFilename()}.csv`)
}

/**
 * Generate score visualization section for PDF export
 */
function generateScoreSection(policy: AnalyzedPolicy): string {
  // Only show if rawData has evaluation info
  const confidence = policy.aiConfidence
  const score = Math.round(confidence * 100)
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F'
  const barColor = score >= 75 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444'

  return `
  <div style="margin: 20px 0; padding: 15px; background: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0;">
    <div class="label">AI Confidence Score</div>
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

  const rows = [
    ['Policy Number', ...policies.map((p) => p.policyNumber)],
    ['Type', ...policies.map((p) => p.typeTr)],
    ['Status', ...policies.map((p) => p.status)],
    ['Coverage', ...policies.map((p) => formatCurrency(p.coverage, 'TRY', locale))],
    ['Premium', ...policies.map((p) => formatCurrency(p.premium, 'TRY', locale))],
    ['Monthly Premium', ...policies.map((p) => formatCurrency(p.monthlyPremium, 'TRY', locale))],
    ['Deductible', ...policies.map((p) => formatCurrency(p.deductible, 'TRY', locale))],
    ['Start Date', ...policies.map((p) => formatDate(p.startDate, locale))],
    ['Expiry Date', ...policies.map((p) => formatDate(p.expiryDate, locale))],
    ['AI Confidence', ...policies.map((p) => `${(p.aiConfidence * 100).toFixed(0)}%`)],
    ['Coverages Count', ...policies.map((p) => String(p.coverages.length))],
    ['Exclusions Count', ...policies.map((p) => String(p.exclusions.length))],
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

  const bom = '\uFEFF'
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
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Format date for filename
 */
function formatDateForFilename(): string {
  return new Date().toISOString().split('T')[0]
}
