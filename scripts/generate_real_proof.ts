import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { buildPolicyReviewerSummary } from '../src/lib/reviewer/policy-reviewer-summary'

dotenv.config({ path: '.env.local' })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

async function run() {
  const { data, error } = await supabase
    .from('policies')
    .select('*')
    .eq('policy_number', '1680600025')
    .single()
    
  if (error || !data) {
    console.error('Failed to fetch:', error)
    return
  }
  
  // Transform DB policy to AnalyzedPolicy (assuming our existing transform logic)
  const p = {
    ...data,
    policyNumber: data.policy_number,
    provider: data.provider,
    type: data.type,
    typeTr: data.type_tr || data.type,
    insuredPerson: data.insured_person,
    startDate: data.start_date,
    expiryDate: data.expiry_date,
    premium: data.premium,
    monthlyPremium: data.monthly_premium,
    deductible: data.deductible,
    location: data.location,
    status: data.status,
    coverages: data.coverages || [],
    exclusions: data.exclusions || [],
    exclusionsEn: data.exclusions_en || [],
    conditionalDeductibles: data.conditional_deductibles || [],
    aiInsights: data.ai_insights || [],
    aiInsightsTr: data.ai_insights_tr || [],
    aiInsightsEn: data.ai_insights_en || [],
    aiConfidence: data.ai_confidence || 1,
    evidenceData: data.evidence_data || {},
  }
  
  const summary = buildPolicyReviewerSummary(p as any, { locale: 'tr' })
  console.log('--- UI REVIEWER SUMMARY OBJECT ---')
  console.log(JSON.stringify(summary, null, 2))
  
  console.log('--- TEXT EXPORT ---')
  const sections = [
    `Poliçe: ${summary.policyNumber}`,
    `Şirket: ${summary.providerShort || summary.provider}`,
    `Tür: ${summary.typeTr}`,
    `Sigortalı: ${summary.insured}`,
    `Teminat: ${summary.coverageTotal}`,
    `Prim: ${summary.premium}`,
    `Muafiyet: ${summary.deductible}`,
    `Tarih: ${summary.period}`,
    '',
    `=== Teminatlar ===`,
    ...summary.coverages.map((c: any) => `• ${c.name}: ${c.limit}`),
    '',
    `=== İstisnalar ===`,
    ...summary.exclusions.map((e: string) => `• ${e}`),
  ]
  if (summary.hasConditionalDeductibles && summary.conditionalDeductibles.length > 0) {
    sections.push('', `=== Koşullu Muafiyetler / Özel Şartlar ===`, ...summary.conditionalDeductibles.map((d: string) => `• ${d}`))
  }
  if (summary.insights && summary.insights.length > 0) {
    sections.push('', `=== AI Görüşleri ===`, ...summary.insights.map((insight: string) => `• ${insight}`))
  }
  console.log(sections.join('\n'))
  
  console.log('--- CSV EXPORT ---')
  const escapeCSV = (value: string) => typeof value === 'string' && (value.includes(',') || value.includes('\n')) ? `"${value.replace(/"/g, '""')}"` : value
  const toRow = (cells: any[]) => cells.map(escapeCSV).join(',')
  
  const infoRows = [
    ['Poliçe No', summary.policyNumber],
    ['Şirket', summary.provider],
    ['Tür', summary.typeTr],
    ['Durum', summary.status],
    ['Sigortalı', summary.insured],
    ['Teminat', summary.coverageTotal],
    ['Prim', summary.premium],
    ['Aylık Prim', summary.monthlyPremium],
    ['Muafiyet', summary.deductible],
    ['Başlangıç', summary.startDate],
    ['Bitiş', summary.expiryDate],
    ['AI Güven', (summary.aiConfidence * 100).toFixed(0) + '%'],
  ]
  
  const covRows = summary.coverages.map((c: any) => [c.name, c.limit, c.deductible, c.included ? 'Evet' : 'Hayır'])
  const exclRows = summary.exclusions.map((e: string) => [e])
  const condDeductRows = summary.conditionalDeductibles.map((d: string) => [d])
  const insightRows = summary.insights.map((insight: string) => [insight])
  
  const csvSections = [
    '# POLİÇE BİLGİLERİ', toRow(['Alan', 'Değer']), ...infoRows.map(toRow),
    '', '# TEMİNATLAR', toRow(['Teminat Adı', 'Limit', 'Muafiyet', 'Dahil']), ...covRows.map(toRow),
    '', '# İSTİSNALAR', toRow(['İstisna']), ...exclRows.map(toRow),
    ...(condDeductRows.length > 0 ? ['', '# KOŞULLU MUAFİYETLER', toRow(['Koşullu Muafiyet']), ...condDeductRows.map(toRow)] : []),
    '', '# AI GÖRÜŞLERİ', toRow(['AI Görüşü']), ...insightRows.map(toRow)
  ]
  console.log(csvSections.join('\n'))
  
  console.log('--- HTML/PDF EXPORT ---')
  console.log(`  <h2>Poliçe Detayları</h2>
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
    ${summary.coverages.map((c: any) => `<div class="coverage-item">
      <span>${c.name}</span>
      <span>${c.limit}</span>
    </div>`).join('\n')}
  <h2>İstisnalar</h2>
  <ul class="excl-list">
    ${summary.exclusions.map((e: string) => `<li>${e}</li>`).join('\n')}
  </ul>
  ${summary.hasConditionalDeductibles && summary.conditionalDeductibles.length > 0 ? `<h2>Koşullu Muafiyetler</h2>
  <ul class="excl-list">
    ${summary.conditionalDeductibles.map((d: string) => `<li>${d}</li>`).join('\n')}
  </ul>` : ''}
  <h2>AI Görüşleri</h2>
  <ul class="insight-list">
    ${summary.insights.map((insight: string) => `<li>${insight}</li>`).join('\n')}
  </ul>`)
}

run().catch(console.error)
