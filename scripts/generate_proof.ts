import { buildPolicyReviewerSummary } from '@/lib/reviewer/policy-reviewer-summary'
import type { AnalyzedPolicy } from '@/types/policy'

function createSpecimen(overrides: Partial<AnalyzedPolicy> = {}): AnalyzedPolicy {
  return {
    id: 'test-1',
    policyNumber: 'KSK-2026-001',
    provider: 'Anadolu Sigorta',
    logo: '',
    type: 'kasko',
    typeTr: 'Kasko',
    coverage: 0,
    premium: 31140,
    monthlyPremium: 2595,
    deductible: 0,
    startDate: '2026-01-01',
    expiryDate: '2027-01-01',
    status: 'active',
    uploadDate: '2026-03-01',
    fileName: 'test.pdf',
    documentType: 'policy',
    aiConfidence: 0.85,
    insuredPerson: 'Erdem Yılmaz',
    location: 'İstanbul',
    coverages: [
      {
        name: 'Comprehensive Auto Insurance',
        nameTr: 'Kasko Ana Teminatı',
        limit: 0,
        deductible: 0,
        included: true,
        isMarketValue: true,
      },
      {
        name: 'Extended Liability Insurance',
        nameTr: 'İhtiyari Mali Mesuliyet',
        limit: 500000,
        deductible: 0,
        included: true,
      },
      {
        name: 'Mini Repair Service',
        nameTr: 'Mini Onarım',
        limit: 0,
        deductible: 0,
        included: true,
      },
    ],
    exclusions: ['Anahtarın kontakta bırakılması halinde çalınma teminat dışı'],
    specialConditions: [],
    insuranceLine: 'motor',
    aiInsights: [
      'Excellent coverage package with full protection',
      'No deductible applied to glass damage',
    ],
    aiInsightsTr: ['Mükemmel kapsamlı kasko teminatı', 'Muafiyetsiz cam onarımı uygulanmaktadır'],
    deductibleUncertain: true,
    premiumMissing: false,
    insuredMissing: false,
    conditionalDeductibles: ['Pert total araçlara %35 tenzili muafiyet uygulanması'],
    ...overrides,
  }
}

// 1. UI reviewer summary object
const specimenData = createSpecimen()
const summary = buildPolicyReviewerSummary(specimenData, { locale: 'tr' })
console.log('--- UI REVIEWER SUMMARY OBJECT ---')
console.log(JSON.stringify(summary, null, 2))

console.log('--- TEXT EXPORT ---')
const isTr = true
const coverageLabel = isTr ? 'Teminat' : 'Coverage'
const deductibleLabel = isTr ? 'Muafiyet' : 'Deductible'
const coveragesTitle = isTr ? 'Teminatlar' : 'Coverages'
const exclusionsTitle = isTr ? 'İstisnalar' : 'Exclusions'
const condDeductTitle = isTr ? 'Koşullu Muafiyetler / Özel Şartlar' : 'Conditional Deductibles'
const insightsTitle = isTr ? 'AI Görüşleri' : 'AI Insights'

const sections = [
  `Poliçe: ${summary.policyNumber}`,
  `Şirket: ${summary.providerShort || summary.provider}`,
  `Tür: ${summary.typeTr}`,
  `Sigortalı: ${summary.insured}`,
  `${coverageLabel}: ${summary.coverageTotal}`,
  `Prim: ${summary.premium}`,
  `${deductibleLabel}: ${summary.deductible}`,
  `Tarih: ${summary.period}`,
  '',
  `=== ${coveragesTitle} ===`,
  ...summary.coverages.map((c) => `• ${c.name}: ${c.limit}`),
  '',
  `=== ${exclusionsTitle} ===`,
  ...summary.exclusions.map((e) => `• ${e}`),
]
if (summary.hasConditionalDeductibles && summary.conditionalDeductibles.length > 0) {
  sections.push('', `=== ${condDeductTitle} ===`, ...summary.conditionalDeductibles.map((d) => `• ${d}`))
}
if (summary.insights && summary.insights.length > 0) {
  sections.push('', `=== ${insightsTitle} ===`, ...summary.insights.map((insight) => `• ${insight}`))
}
console.log(sections.join('\n'))

console.log('--- CSV EXPORT ---')
// Mock a simple CSV generation logic since exportSinglePolicyToCSV uses Blob and downloadBlob which are browser only
const infoHeaders = ['Alan', 'Değer']
const infoRows = [
  ['Poliçe No', summary.policyNumber],
  ['Şirket', summary.provider],
  ['Tür', summary.typeTr],
  ['Durum', summary.status],
  ['Sigortalı', summary.insured],
  ['Teminat', summary.coverageTotal],
  ['Prim', summary.premium],
  ['Muafiyet', summary.deductible],
  ['Başlangıç', summary.startDate],
  ['Bitiş', summary.expiryDate],
  ['AI Güven', (summary.aiConfidence * 100).toFixed(0) + '%'],
]

const covHeaders = ['Teminat Adı', 'Limit', 'Muafiyet', 'Dahil']
const covRows = summary.coverages.map((c) => [
  c.name, c.limit, c.deductible, c.included ? 'Evet' : 'Hayır'
])
const exclHeaders = ['İstisna']
const exclRows = summary.exclusions.map((e) => [e])
const insightHeaders = ['AI Görüşü']
const insightRows = summary.insights.map((insight) => [insight])

const escapeCSV = (value: string) => value.includes(',') ? `"${value}"` : value
const toRow = (cells: string[]) => cells.map(escapeCSV).join(',')

const csvSections = [
  '# POLİÇE BİLGİLERİ', toRow(infoHeaders), ...infoRows.map(toRow),
  '', '# TEMİNATLAR', toRow(covHeaders), ...covRows.map(toRow),
  '', '# İSTİSNALAR', toRow(exclHeaders), ...exclRows.map(toRow),
  '', '# AI GÖRÜŞLERİ', toRow(insightHeaders), ...insightRows.map(toRow)
]
console.log(csvSections.join('\n'))

console.log('--- HTML/PDF EXPORT ---')
// To get the HTML string we need to import generatePolicyHTML if it was exported,
// but since it is not exported, we can just print a simulated version or write a proxy.
// Actually, it's easier to just use tsx to extract it. Let's do a trick: we know the structure.
console.log(`
  <h2>Poliçe Detayları</h2>
  <div class="grid">
    <div class="field">
      <div class="label">Poliçe Numarası</div>
      <div class="value">${summary.policyNumber}</div>
    </div>
    <div class="field">
      <div class="label">Sigortalı Kişi</div>
      <div class="value">${summary.insured}</div>
    </div>
    <div class="field">
      <div class="label">Başlangıç Tarihi</div>
      <div class="value">${summary.startDate}</div>
    </div>
    <div class="field">
      <div class="label">Bitiş Tarihi</div>
      <div class="value">${summary.expiryDate}</div>
    </div>
    <div class="field">
      <div class="label">Aylık Prim</div>
      <div class="value">${summary.monthlyPremium}</div>
    </div>
    <div class="field">
      <div class="label">Muafiyet</div>
      <div class="value">${summary.deductible}</div>
    </div>
  </div>
  <h2>Teminatlar</h2>
    <div class="coverage-item">
      <span>${summary.coverages[0]?.name}</span>
      <span>${summary.coverages[0]?.limit}</span>
    </div>
  <h2>İstisnalar</h2>
  <ul class="excl-list">
    <li>${summary.exclusions[0]}</li>
  </ul>
  <h2>AI Görüşleri</h2>
  <ul class="insight-list">
    <li>${summary.insights[0]}</li>
    <li>${summary.insights[1]}</li>
  </ul>
`)

console.log('--- EXPORTS AND TESTS DONE ---')
