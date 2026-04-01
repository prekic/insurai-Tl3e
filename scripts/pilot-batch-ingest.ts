/**
 * pilot-batch-ingest.ts
 *
 * Batch-ingests KASKO PDFs through the extraction + pilot QA pipeline.
 * Designed for Phase 8L graduation: feed diverse PDFs from multiple providers.
 *
 * Usage:
 *   npx tsx scripts/pilot-batch-ingest.ts ./pdfs-to-ingest
 *   npx tsx scripts/pilot-batch-ingest.ts ./pdfs-to-ingest --dry-run
 *   npx tsx scripts/pilot-batch-ingest.ts ./pdfs-to-ingest --provider=openai
 *
 * Flags:
 *   --dry-run       Validate PDF files and extract text, but skip LLM calls.
 *   --provider=X    Force 'openai' or 'anthropic' (default: openai, falls back to anthropic).
 *   --output=path   Save results JSON to custom path (default: /tmp/pilot-batch-results.json).
 *
 * Requires .env with OPENAI_API_KEY and/or ANTHROPIC_API_KEY.
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for QA record persistence.
 */

import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

const args = process.argv.slice(2)
const dirArg = args.find((a) => !a.startsWith('--'))
const isDryRun = args.includes('--dry-run')
const providerArg = args.find((a) => a.startsWith('--provider='))
const forcedProvider = providerArg?.split('=')[1] as 'openai' | 'anthropic' | undefined
const outputArg = args.find((a) => a.startsWith('--output='))
const outputPath = outputArg?.split('=')[1] || '/tmp/pilot-batch-results.json'

if (!dirArg) {
  console.error(
    'Usage: npx tsx scripts/pilot-batch-ingest.ts <pdf-directory> [--dry-run] [--provider=openai|anthropic]'
  )
  process.exit(1)
}

const pdfDir = path.resolve(dirArg)

if (!fs.existsSync(pdfDir) || !fs.statSync(pdfDir).isDirectory()) {
  console.error(`Not a directory: ${pdfDir}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// PDF text extraction (mirrors kasko-real-pdf-extraction.ts)
// ---------------------------------------------------------------------------

async function extractTextFromPdfFile(
  filePath: string
): Promise<{ success: boolean; text?: string; pageCount?: number; error?: string }> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const workerPath = path.resolve(process.cwd(), 'node_modules/pdfjs-dist/build/pdf.worker.mjs')
    ;(pdfjs as any).GlobalWorkerOptions.workerSrc = workerPath

    const buffer = fs.readFileSync(filePath)
    const data = new Uint8Array(buffer)
    const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise
    const pages: string[] = []

    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      const content = await page.getTextContent()
      const text = content.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()
      pages.push(text)
    }

    doc.destroy()
    const fullText = pages.join('\n\n')
    return {
      success: fullText.length >= 50,
      text: fullText,
      pageCount: doc.numPages,
      error: fullText.length < 50 ? `Only ${fullText.length} chars extracted` : undefined,
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Unknown error' }
  }
}

function buildSectionAwareText(fullText: string, maxChars: number = 32000): string {
  if (fullText.length <= maxChars) return fullText
  const HEAD_RATIO = 0.625
  const headSize = Math.floor(maxChars * HEAD_RATIO)
  const tailSize = maxChars - headSize
  const head = fullText.substring(0, headSize)
  const tail = fullText.substring(fullText.length - tailSize)
  return head + '\n\n[... document middle section omitted for length ...]\n\n' + tail
}

// ---------------------------------------------------------------------------
// LLM extraction (mirrors kasko-real-pdf-extraction.ts)
// ---------------------------------------------------------------------------

async function extractWithLLM(
  documentText: string,
  provider: 'openai' | 'anthropic'
): Promise<{ success: boolean; data?: any; model?: string; error?: string }> {
  const systemPrompt = `You are a Turkish insurance policy (KASKO) extraction expert.
Extract structured data from the following policy document text.
Return ONLY valid JSON with these fields:
{
  "policyNumber": "string or null",
  "provider": "string",
  "branch": "kasko",
  "policyType": "kasko",
  "startDate": "YYYY-MM-DD or null",
  "endDate": "YYYY-MM-DD or null",
  "premium": number or null,
  "currency": "TRY",
  "insuredName": "string or null",
  "coverages": [{
    "name": "string",
    "nameTr": "string",
    "description": "string",
    "limit": number or null,
    "deductible": number or null,
    "isMarketValue": boolean,
    "isUnlimited": boolean,
    "included": true,
    "category": "main"|"liability"|"supplementary"|"assistance"|"legal"|"other"
  }],
  "exclusions": ["string"],
  "specialConditions": ["string"],
  "confidence": { "overall": number between 0 and 1 }
}
Focus on: conditional deductibles, muafiyet/tenzili muafiyet, age/license restrictions.`

  try {
    if (provider === 'openai') {
      const { default: OpenAI } = await import('openai')
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: documentText },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
        max_tokens: 4096,
      })
      const content = resp.choices[0]?.message?.content
      if (!content) return { success: false, error: 'Empty response' }
      return { success: true, data: JSON.parse(content), model: 'gpt-4o-mini' }
    } else {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const resp = await anthropic.messages.create({
        model: 'claude-3-5-haiku-latest',
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: documentText }],
      })
      const text = resp.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('')
      const jsonMatch = text.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return { success: false, error: 'No JSON in response' }
      return { success: true, data: JSON.parse(jsonMatch[0]), model: 'claude-3-5-haiku' }
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Unknown error' }
  }
}

// ---------------------------------------------------------------------------
// Downstream pipeline + Pilot QA
// ---------------------------------------------------------------------------

async function runDownstreamPipeline(extractedData: any) {
  const { normalizeBranchExtraction } = await import('../src/lib/ai/extraction-normalizer')
  const { validateExtractionSafety } = await import('../src/lib/ai/validator')
  const { generateAnalysisBundle } = await import('../src/lib/analysis/engine')
  const { evaluateDisplayMode } = await import('../src/lib/analysis/review-thresholds')

  const PROHIBITED_PHRASES = [
    'no deductible',
    'unlimited',
    'fully covered',
    'tam kapsamlı',
    'guaranteed',
    'full protection',
    'total coverage',
    'muafiyetsiz',
    'tamamen kapsar',
    'sınırsız',
  ]

  const normalized = normalizeBranchExtraction(extractedData)
  const validation = validateExtractionSafety(normalized)
  const analysis = generateAnalysisBundle('BATCH', normalized, validation)
  const displayResult = evaluateDisplayMode(normalized, validation, analysis)

  const { checkProhibitedPhrases } = await import('../src/lib/analysis/batch-ingest-helpers')
  const foundPhrases = checkProhibitedPhrases(normalized, PROHIBITED_PHRASES)

  return {
    normalized,
    validation,
    displayResult,
    phraseClean: foundPhrases.length === 0,
    foundPhrases,
  }
}

async function evaluatePilotAdmissionForBatch(extractedData: any, textLength: number) {
  const { evaluatePilotAdmission, createPilotQARecord, evaluateSimpleDisplayMode } =
    await import('../src/lib/analysis/kasko-pilot-gate')

  const admission = evaluatePilotAdmission(extractedData, { textCharCount: textLength })

  if (!admission.countedInPilotMetrics) {
    return { admission, qaRecord: null }
  }

  const qaRecord = createPilotQARecord(
    `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    extractedData._filename || 'unknown.pdf',
    'batch-script'
  )
  qaRecord.extractionSuccess = true
  qaRecord.extractionModel = extractedData._model || 'unknown'
  qaRecord.textCharCount = textLength
  qaRecord.pageCount = extractedData._pageCount || 0
  qaRecord.admissionStatus = admission.status
  qaRecord.admissionReason = admission.reason
  qaRecord.countedInPilotMetrics = admission.countedInPilotMetrics
  qaRecord.coverageCountExtracted = extractedData.coverages?.length || 0
  qaRecord.specialConditionCount = extractedData.specialConditions?.length || 0
  qaRecord.confidenceScore = extractedData.confidence?.overall || 0

  // WS-1 fields
  qaRecord.hasRayicDeger = extractedData.coverages?.some((c: any) => c.isMarketValue) || false
  qaRecord.hasConditionalDeductible = (extractedData.specialConditions || []).some(
    (sc: string) => sc.toLowerCase().includes('muafiyet') || sc.toLowerCase().includes('tenzil')
  )
  qaRecord.sourceQuoteCount = 0 // Evidence not available in simplified pipeline
  qaRecord.zeroCoverage = (extractedData.coverages?.length || 0) === 0

  // Display mode
  const dm = evaluateSimpleDisplayMode(extractedData.confidence?.overall || 0, {
    policyNumber: extractedData.policyNumber,
    provider: extractedData.provider,
    coverages: extractedData.coverages,
  })
  qaRecord.displayMode = dm.mode
  qaRecord.triggersFired = dm.triggers

  return { admission, qaRecord }
}

async function persistQARecord(record: any): Promise<boolean> {
  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!supabaseUrl || !supabaseKey) {
      console.log('    Supabase not configured, skipping QA persistence')
      return false
    }

    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(supabaseUrl, supabaseKey)

    const { error } = await supabase.from('kasko_pilot_qa_records').insert({
      document_id: record.documentId,
      filename: record.filename,
      branch: record.branch,
      review_date: record.reviewDate,
      reviewer_user_id: record.reviewerUserId,
      extraction_success: record.extractionSuccess,
      extraction_model: record.extractionModel,
      text_char_count: record.textCharCount,
      page_count: record.pageCount,
      reviewer_outcome: record.reviewerOutcome,
      review_time_minutes: record.reviewTimeMinutes,
      correction_categories: record.correctionCategories,
      critical_fields_missed: record.criticalFieldsMissed,
      display_mode: record.displayMode,
      triggers_fired: record.triggersFired,
      phrase_clean: record.phraseClean,
      found_prohibited_phrases: record.foundProhibitedPhrases,
      admission_status: record.admissionStatus,
      admission_reason: record.admissionReason,
      counted_in_pilot_metrics: record.countedInPilotMetrics,
      coverage_count_extracted: record.coverageCountExtracted,
      special_condition_count: record.specialConditionCount,
      has_rayic_deger: record.hasRayicDeger,
      has_conditional_deductible: record.hasConditionalDeductible,
      source_quote_count: record.sourceQuoteCount,
      confidence_score: record.confidenceScore,
      zero_coverage: record.zeroCoverage,
      deductible_miss: record.deductibleMiss,
      special_condition_miss: record.specialConditionMiss,
      major_correction: record.majorCorrection,
      reviewer_notes: record.reviewerNotes,
    })

    if (error) {
      console.log(`    QA persist failed: ${error.message}`)
      return false
    }
    return true
  } catch (err: any) {
    console.log(`    QA persist error: ${err.message}`)
    return false
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

import {
  discoverPDFs,
  summarizeBatch,
  type BatchResultEntry,
} from '../src/lib/analysis/batch-ingest-helpers'

async function main() {
  console.log('='.repeat(60))
  console.log('  KASKO Pilot Batch Ingestion')
  console.log(`  Directory: ${pdfDir}`)
  console.log(
    `  Mode: ${isDryRun ? 'DRY RUN (text extraction only)' : 'FULL (LLM + QA recording)'}`
  )
  if (forcedProvider) console.log(`  Provider: ${forcedProvider}`)
  console.log('='.repeat(60))
  console.log()

  const pdfs = discoverPDFs(pdfDir, fs, path)
  console.log(`Found ${pdfs.length} PDF files`)
  if (pdfs.length === 0) {
    console.log('No PDFs found. Place .pdf files in the specified directory.')
    process.exit(0)
  }

  for (const pdf of pdfs) {
    console.log(`  ${pdf.name} (${(pdf.sizeBytes / 1024).toFixed(1)} KB)`)
  }
  console.log()

  const results: BatchResultEntry[] = []

  for (let i = 0; i < pdfs.length; i++) {
    const pdf = pdfs[i]
    console.log(`[${i + 1}/${pdfs.length}] ${pdf.name}`)

    const entry: BatchResultEntry = {
      filename: pdf.name,
      textExtracted: false,
      textLength: 0,
      pageCount: 0,
      llmExtracted: false,
      llmModel: 'N/A',
      policyNumber: null,
      provider: null,
      coverageCount: 0,
      admissionStatus: 'skipped',
      displayMode: 'unknown',
      phraseClean: true,
      error: null,
    }

    // Step 1: Text extraction
    console.log('  Extracting text...')
    const textResult = await extractTextFromPdfFile(pdf.path)
    entry.textExtracted = textResult.success
    entry.textLength = textResult.text?.length || 0
    entry.pageCount = textResult.pageCount || 0

    if (!textResult.success || !textResult.text) {
      entry.error = textResult.error || 'Text extraction failed'
      console.log(`  FAIL: ${entry.error}`)
      results.push(entry)
      continue
    }
    console.log(`  OK: ${entry.textLength} chars, ${entry.pageCount} pages`)

    if (isDryRun) {
      console.log('  [dry-run] Skipping LLM extraction')
      results.push(entry)
      continue
    }

    // Step 2: LLM extraction
    const llmText = buildSectionAwareText(textResult.text)
    const primary = forcedProvider || 'openai'
    console.log(`  LLM extraction (${primary})...`)
    let llmResult = await extractWithLLM(llmText, primary)

    if (!llmResult.success && !forcedProvider) {
      const fallback = primary === 'openai' ? 'anthropic' : 'openai'
      console.log(`  ${primary} failed, trying ${fallback}...`)
      llmResult = await extractWithLLM(llmText, fallback as 'openai' | 'anthropic')
    }

    entry.llmExtracted = llmResult.success
    entry.llmModel = llmResult.model || 'N/A'

    if (!llmResult.success) {
      entry.error = llmResult.error || 'LLM extraction failed'
      console.log(`  FAIL: ${entry.error}`)
      results.push(entry)
      continue
    }

    const extracted = llmResult.data
    extracted._filename = pdf.name
    extracted._model = llmResult.model
    extracted._pageCount = entry.pageCount
    entry.policyNumber = extracted.policyNumber
    entry.provider = extracted.provider
    entry.coverageCount = extracted.coverages?.length || 0

    console.log(
      `  Policy: ${entry.policyNumber || 'N/A'} | Provider: ${entry.provider || 'N/A'} | Coverages: ${entry.coverageCount}`
    )

    // Step 3: Pilot admission + QA record
    const { admission, qaRecord } = await evaluatePilotAdmissionForBatch(
      extracted,
      entry.textLength
    )
    entry.admissionStatus = admission.status

    // Step 4: Downstream pipeline
    try {
      const downstream = await runDownstreamPipeline(extracted)
      entry.displayMode = downstream.displayResult.mode
      entry.phraseClean = downstream.phraseClean
      if (qaRecord) {
        qaRecord.phraseClean = downstream.phraseClean
        qaRecord.foundProhibitedPhrases = downstream.foundPhrases
      }
    } catch (err: any) {
      console.log(`  Pipeline error: ${err.message}`)
      entry.displayMode = 'error'
    }

    // Step 5: Persist QA record
    if (qaRecord) {
      const persisted = await persistQARecord(qaRecord)
      console.log(
        `  QA: ${entry.admissionStatus} | Display: ${entry.displayMode} | Persisted: ${persisted ? 'yes' : 'no'}`
      )
    } else {
      console.log(`  QA: ${entry.admissionStatus} (not counted in pilot metrics)`)
    }

    results.push(entry)
  }

  // Summary
  console.log()
  console.log('='.repeat(60))
  console.log('  BATCH SUMMARY')
  console.log('='.repeat(60))

  const summary = summarizeBatch(results)
  console.log(`  Total files:       ${summary.totalFiles}`)
  console.log(`  Text extracted:    ${summary.textSuccess} / ${summary.totalFiles}`)
  console.log(`  LLM extracted:     ${summary.llmSuccess} / ${summary.totalFiles}`)
  console.log(`  Avg coverages:     ${summary.averageCoverages}`)
  console.log(`  Phrase leaks:      ${summary.phraseLeaks}`)
  console.log()
  console.log('  Admission breakdown:')
  for (const [status, count] of Object.entries(summary.admissionBreakdown)) {
    console.log(`    ${status}: ${count}`)
  }
  console.log()
  console.log('  Display mode breakdown:')
  for (const [mode, count] of Object.entries(summary.displayModeBreakdown)) {
    console.log(`    ${mode}: ${count}`)
  }

  // Save results
  fs.writeFileSync(outputPath, JSON.stringify({ results, summary }, null, 2))
  console.log(`\nResults saved to: ${outputPath}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
