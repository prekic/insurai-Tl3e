import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { buildPolicyReviewerSummary } from '@/lib/reviewer/policy-reviewer-summary'
import { exportToText, exportSinglePolicyToCSV, generatePolicyHTML } from '@/lib/export'

dotenv.config({ path: '.env' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

declare global {
  var downloadBlob: (blob: Blob, _filename: string) => Promise<void>
}

let capturedCSVOutput = ''

global.downloadBlob = async (blob: Blob, _filename: string) => {
  capturedCSVOutput = await blob.text()
}

async function run() {
  // Fetch real specimen from DB
  const { data, error } = await supabase
    .from('policies')
    .select('*')
    .eq('policy_number', '1680600025')
    .single()

  if (error) {
    console.error('Failed to fetch real specimen from Supabase:', error)
    process.exit(1)
  }

  // Map snake_case DB fields to camelCase AnalyzedPolicy
  const p: any = {
    id: data.id,
    name: data.name,
    status: data.status,
    policyNumber: data.policy_number,
    provider: data.provider,
    type: data.type || data.extracted_data?.type || data.extracted_data?.metadata?.type,
    insuredPerson:
      data.insured ||
      data.raw_data?.insured?.name ||
      data.raw_data?.insuredName ||
      data.extracted_data?.insured?.name ||
      data.extracted_data?.insured ||
      data.extracted_data?.metadata?.insured,
    premium: data.premium || data.raw_data?.premium?.amount || data.extracted_data?.premium,
    deductible: data.deductible || data.raw_data?.deductible || data.extracted_data?.deductible,
    startDate: data.raw_data?.startDate || data.extracted_data?.startDate,
    expiryDate: data.raw_data?.endDate || data.extracted_data?.expiryDate,
    coverage: data.coverage,
    coverages: data.coverages || data.extracted_data?.coverages || data.raw_data?.coverages || [],
    exclusions:
      data.exclusions || data.extracted_data?.exclusions || data.raw_data?.exclusions || [],
    aiInsights:
      data.ai_insights || data.extracted_data?.insights || data.raw_data?.aiInsights || [],
    typeTr: data.type === 'kasko' ? 'Kasko' : data.type === 'traffic' ? 'Trafik' : data.type,
    documentPath: data.document_path,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    extractedData: data.extracted_data || {},
  }

  console.log('=== REAL SPECIMEN PROOF ===')
  console.log(`Policy: ${p.policyNumber}`)
  console.log(`Provider: ${p.provider}`)
  console.log(`Type: ${p.type ?? 'MISSING_IN_DB'} (Derived by product code fallback if empty)`)
  console.log(
    `Insured: ${p.insuredPerson ?? 'MISSING_IN_DB'} (Derived by product code fallback if empty)`
  )
  console.log(
    `Period: ${p.startDate && p.expiryDate ? p.startDate + ' - ' + p.expiryDate : 'MISSING_IN_DB'} (Derived by product code fallback if empty)`
  )
  console.log('\n')

  // Generate Reviewer Summary
  const summaryJSON = buildPolicyReviewerSummary(p, { locale: 'tr' })
  console.log('1. json reviewerSummary')
  console.log(JSON.stringify(summaryJSON, null, 2))
  console.log('\n')

  // Text Export
  console.log('2. text export')
  const textOutput = exportToText(p, 'tr')
  console.log(textOutput)
  console.log('\n')

  // CSV Export
  console.log('3. CSV export (via exportSinglePolicyToCSV)')
  exportSinglePolicyToCSV(p)
  console.log(capturedCSVOutput)
  console.log('\n')

  // HTML/PDF Export
  console.log('4. html/pdf export')
  const htmlOutputTr = generatePolicyHTML(p, 'tr')
  console.log(htmlOutputTr)
}

run().catch(console.error)
