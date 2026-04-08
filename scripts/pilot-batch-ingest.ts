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

// Default budget chosen so typical KASKO policies (10-25 pages, up to ~80K chars)
// fit without truncation. gpt-4o-mini context window is 128K tokens (~384K chars),
// so 96K chars leaves comfortable headroom for prompt + response. The head/tail
// collapse remains as a safety net for hypothetical 100+ page edge cases. See
// assessment Finding #2.
function buildSectionAwareText(fullText: string, maxChars: number = 96000): string {
  if (fullText.length <= maxChars) return fullText
  const HEAD_RATIO = 0.625
  const headSize = Math.floor(maxChars * HEAD_RATIO)
  const tailSize = maxChars - headSize
  const head = fullText.substring(0, headSize)
  const tail = fullText.substring(fullText.length - tailSize)
  return head + '\n\n[... document middle section omitted for length ...]\n\n' + tail
}

// ---------------------------------------------------------------------------
// Inlined helpers
// ---------------------------------------------------------------------------
// These are local copies of production utilities (policy-extractor.ts) that
// cannot be imported directly because policy-extractor.ts pulls in Vite-env-
// dependent code (`import.meta.env`) which crashes under standalone `npx tsx`.
// See CLAUDE.md gotchas #16 and #45. Keep in sync with the production source
// referenced below if you modify either side.

// Mirrors src/lib/ai/policy-extractor.ts:173-179
const DEFAULT_CONFIDENCE_WEIGHTS = {
  policyNumber: 0.2,
  provider: 0.15,
  dates: 0.2,
  premium: 0.2,
  coverages: 0.25,
}

// Mirrors src/lib/ai/policy-extractor.ts:186-224
function recalculateOverallConfidence(
  confidence:
    | {
        overall?: number
        policyNumber?: number
        provider?: number
        dates?: number
        premium?: number
        coverages?: number
      }
    | undefined
    | null,
  fallback: number,
  weights = DEFAULT_CONFIDENCE_WEIGHTS
): number {
  if (!confidence) return fallback
  const pn = confidence.policyNumber
  const pr = confidence.provider
  const dt = confidence.dates
  const pm = confidence.premium
  const cv = confidence.coverages
  // If any per-field score is missing, fall back to the model-reported overall
  if (pn == null || pr == null || dt == null || pm == null || cv == null) {
    return typeof confidence.overall === 'number' ? confidence.overall : fallback
  }
  return (
    pn * weights.policyNumber +
    pr * weights.provider +
    dt * weights.dates +
    pm * weights.premium +
    cv * weights.coverages
  )
}

// Mirrors src/lib/ai/policy-extractor.ts:2648-2658 (classifyExclusions patterns).
// Used to detect conditional deductibles in any text source — coverages,
// exclusions, specialConditions, or the explicit conditionalDeductibles array.
const CONDITIONAL_DEDUCTIBLE_PATTERNS: RegExp[] = [
  /muafiyet/i,
  /tenzil/i,
  /%\s*\d+/i,
  /\d+\s*%/i,
  /anlaşmalı olmayan.*servis/i,
  /anlaşmasız.*servis/i,
  /onarım.*muafiyet/i,
  /pert.*muafiyet/i,
  /pert.*tenzil/i,
]

/**
 * Clamp LLM-reported confidence to the deterministic extraction quality score.
 * Used to resolve Finding #1 Round-2: gpt-4o-mini self-rates confidence at 0.99-1.00
 * even for extractions the validator flags with multiple warnings/errors. The
 * extractionQualityScore (0-100) from scoring.ts:63-102 is the ground-truth signal
 * (formula: confidence*100 - 30*errors - 10*warnings, clamped). Taking the minimum
 * ensures persisted confidence can never exceed what the validator is willing to
 * vouch for.
 *
 * If quality score is undefined (e.g., analysis bundle failed to build), pass the
 * raw confidence through unchanged — the clamp must never introduce new failures.
 */
function demoteConfidenceForQuality(
  rawConfidence: number,
  extractionQualityScore: number | undefined
): number {
  if (typeof extractionQualityScore !== 'number' || !Number.isFinite(extractionQualityScore)) {
    return rawConfidence
  }
  const qualityNormalized = Math.max(0, Math.min(100, extractionQualityScore)) / 100
  return Math.min(rawConfidence, qualityNormalized)
}

function detectConditionalDeductibles(extractedData: any): boolean {
  const sources: string[] = []
  // Explicit conditionalDeductibles array (preferred)
  if (Array.isArray(extractedData.conditionalDeductibles)) {
    for (const cd of extractedData.conditionalDeductibles) {
      if (cd && typeof cd === 'object') {
        sources.push(`${cd.trigger || ''} ${cd.rate || ''} ${cd.evidence || ''}`)
      } else if (typeof cd === 'string') {
        sources.push(cd)
      }
    }
  }
  if (Array.isArray(extractedData.specialConditions)) {
    for (const sc of extractedData.specialConditions) {
      if (typeof sc === 'string') sources.push(sc)
    }
  }
  if (Array.isArray(extractedData.exclusions)) {
    for (const ex of extractedData.exclusions) {
      if (typeof ex === 'string') sources.push(ex)
    }
  }
  if (Array.isArray(extractedData.coverages)) {
    for (const cov of extractedData.coverages) {
      if (cov?.description && typeof cov.description === 'string') sources.push(cov.description)
    }
  }
  return sources.some((text) => CONDITIONAL_DEDUCTIBLE_PATTERNS.some((p) => p.test(text)))
}

function countSourceQuotes(extractedData: any): number {
  let count = 0
  if (Array.isArray(extractedData.coverages)) {
    for (const cov of extractedData.coverages) {
      if (cov?.sourceQuote && typeof cov.sourceQuote === 'string' && cov.sourceQuote.trim()) {
        count++
      }
    }
  }
  if (Array.isArray(extractedData.conditionalDeductibles)) {
    for (const cd of extractedData.conditionalDeductibles) {
      if (cd?.evidence && typeof cd.evidence === 'string' && cd.evidence.trim()) {
        count++
      }
    }
  }
  if (Array.isArray(extractedData.exclusionEvidence)) {
    for (const ev of extractedData.exclusionEvidence) {
      if (typeof ev === 'string' && ev.trim()) count++
    }
  }
  return count
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
    "category": "main"|"liability"|"supplementary"|"assistance"|"legal"|"other",
    "sourceQuote": "string — 1-2 line direct quote from the policy text proving this coverage exists; copy verbatim, do not paraphrase"
  }],
  "exclusions": ["string"],
  "exclusionEvidence": ["string — for each exclusion above (same index), a direct quote from policy text"],
  "specialConditions": ["string"],
  "conditionalDeductibles": [{
    "trigger": "string — what triggers the deductible (e.g. 'driver under 26', 'license < 3 years', 'non-contracted service', 'partial loss')",
    "rate": "string — the deductible amount or percentage as written (e.g. '%35', '20%', '5000 TL')",
    "evidence": "string — direct quote from policy text proving this deductible exists"
  }],
  "confidence": {
    "policyNumber": <number 0-1>,
    "provider": <number 0-1>,
    "dates": <number 0-1>,
    "premium": <number 0-1>,
    "coverages": <number 0-1>,
    "overall": <number 0-1 — your holistic estimate; the script will recompute a weighted overall too>
  }
}

CONFIDENCE RUBRIC — apply per field:
- 0.95-1.0: Field is explicitly stated in source text, unambiguous, formatted normally
- 0.75-0.9: Field is present but slightly ambiguous, abbreviated, or unusually formatted
- 0.5-0.75: Field is partially readable or inferred from context (not directly stated)
- 0.3-0.5: Field is uncertain or only weakly suggested
- 0.0-0.3: Field is missing, contradictory, or unreadable
DO NOT default every field to 0.95. Only use 0.95+ when the field is genuinely
explicit and verifiable from a single sentence in the source. If you had to guess,
infer, or read across multiple sections, use 0.6-0.8.

EXTRACTION FOCUS:
- All conditional deductibles MUST be enumerated in the conditionalDeductibles array
  with explicit trigger/rate/evidence. Examples: muafiyet, tenzili muafiyet,
  age-based deductibles ("25 yaş altı sürücü"), license-tenure deductibles
  ("ehliyetin 3 yıldan az olması"), non-contracted service penalties
  ("anlaşmalı olmayan servis"), partial loss deductibles, total loss deductibles.
- Every coverage and conditional deductible MUST have a verbatim source quote.
- exclusionEvidence array indices MUST correspond to exclusions array indices.`

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
    analysis,
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

  // Confidence: prefer per-field weighted recalculation; fall back to model overall.
  // See assessment Finding #1 and CLAUDE.md gotcha — production uses the same
  // weighted formula via DEFAULT_CONFIDENCE_WEIGHTS.
  qaRecord.confidenceScore = recalculateOverallConfidence(
    extractedData.confidence,
    typeof extractedData.confidence?.overall === 'number' ? extractedData.confidence.overall : 0
  )

  // WS-1 fields
  qaRecord.hasRayicDeger = extractedData.coverages?.some((c: any) => c.isMarketValue) || false
  // Conditional deductible detection now scans all sources (conditionalDeductibles
  // array, specialConditions, exclusions, coverage descriptions) using production's
  // regex pattern set. See assessment Finding #3.
  qaRecord.hasConditionalDeductible = detectConditionalDeductibles(extractedData)
  // Evidence quote count: sums sourceQuotes from coverages, evidence from
  // conditionalDeductibles, and exclusionEvidence entries. See Finding #7.
  qaRecord.sourceQuoteCount = countSourceQuotes(extractedData)
  qaRecord.zeroCoverage = (extractedData.coverages?.length || 0) === 0

  // Display mode (lightweight QA-time evaluator). NOTE: this verdict is later
  // overwritten in pilot-batch-ingest main loop with the strict
  // evaluateDisplayMode() result from runDownstreamPipeline(). See Finding #6.
  const dm = evaluateSimpleDisplayMode(qaRecord.confidenceScore, {
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
        // Sync display mode + triggers from the strict (full ValidationResult-based)
        // evaluator. Without this, the QA record persists the lightweight
        // evaluateSimpleDisplayMode() verdict which can disagree with what reviewers
        // see in CLI output. See assessment Finding #6.
        qaRecord.displayMode = downstream.displayResult.mode
        qaRecord.triggersFired = downstream.displayResult.triggers.map((t: any) => t.triggerRule)
        // Demote confidence to at most the deterministic extraction quality score.
        // gpt-4o-mini self-rates at 0.99-1.00 regardless of validator defects; this
        // clamp ensures pilot metrics reflect real quality, not LLM self-flattery.
        // See assessment Finding #1 Round-2.
        const rawConfidence = qaRecord.confidenceScore
        const qualityScore =
          downstream.analysis?.scoreBundle?.scores?.extractionQualityScore?.scoreValue
        qaRecord.confidenceScore = demoteConfidenceForQuality(rawConfidence, qualityScore)
        console.log(
          `  Confidence: LLM ${rawConfidence.toFixed(2)} → quality-clamped ${qaRecord.confidenceScore.toFixed(2)} (quality score: ${qualityScore ?? 'n/a'})`
        )
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
