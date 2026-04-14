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
 *   npx tsx scripts/pilot-batch-ingest.ts ./pdfs-to-ingest --persist-policies --reviewer-id=<uuid>
 *
 * Flags:
 *   --dry-run           Validate PDF files and extract text, but skip LLM calls.
 *   --provider=X        Force 'openai' or 'anthropic' (default: openai, falls back to anthropic).
 *   --output=path       Save results JSON to custom path (default: /tmp/pilot-batch-results.json).
 *   --persist-policies  Also insert each extracted policy into the `policies` table (required
 *                       for downstream scripts/backfill-evaluation-scores.ts to pick them up).
 *                       Requires --reviewer-id=<uuid> or PILOT_REVIEWER_USER_ID env var.
 *   --reviewer-id=<uuid>  Explicit auth.users UUID for the user_id column when --persist-policies
 *                         is set. Falls back to PILOT_REVIEWER_USER_ID env var.
 *
 * Requires .env with OPENAI_API_KEY and/or ANTHROPIC_API_KEY (non-dry-run).
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY for QA record + policies persistence.
 * Optionally uses GCP_SERVICE_ACCOUNT_BASE64 (or GOOGLE_APPLICATION_CREDENTIALS) for the
 * Document AI OCR fallback that rescues scanned PDFs pdfjs can't parse.
 */

import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'
import { GoogleAuth } from 'google-auth-library'
import { parseExtractedDate } from './_simple-date-parser'

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
const persistPolicies = args.includes('--persist-policies')
const reviewerArg = args.find((a) => a.startsWith('--reviewer-id='))
const reviewerUserId = reviewerArg?.split('=')[1] || process.env.PILOT_REVIEWER_USER_ID

if (!dirArg) {
  console.error(
    'Usage: npx tsx scripts/pilot-batch-ingest.ts <pdf-directory> [--dry-run] [--provider=openai|anthropic] [--persist-policies --reviewer-id=<uuid>]'
  )
  process.exit(1)
}

const pdfDir = path.resolve(dirArg)

if (!fs.existsSync(pdfDir) || !fs.statSync(pdfDir).isDirectory()) {
  console.error(`Not a directory: ${pdfDir}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Preflight: fail fast when --persist-policies is set but env/inputs are
// missing. Runs ONLY outside dry-run mode — dry-run should always work for
// verification without credentials. This saves real LLM tokens from being
// spent on runs that would only fail at Supabase insert time.
// ---------------------------------------------------------------------------

if (persistPolicies && !isDryRun) {
  const missing: string[] = []
  if (!process.env.SUPABASE_URL && !process.env.VITE_SUPABASE_URL) {
    missing.push('SUPABASE_URL (or VITE_SUPABASE_URL)')
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    missing.push('SUPABASE_SERVICE_ROLE_KEY')
  }
  if (!reviewerUserId) {
    missing.push('--reviewer-id=<uuid> or PILOT_REVIEWER_USER_ID env')
  } else {
    // Basic UUID v4-ish shape check — catches typos and accidental emails.
    // Does NOT verify that the UUID exists in auth.users (that would need
    // a live Supabase query; defer to the actual insert which will hard-fail
    // on FK violation with a clear error message).
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    if (!uuidRe.test(reviewerUserId)) {
      console.error(
        `Invalid --reviewer-id: "${reviewerUserId}" — expected a UUID (e.g. 12345678-1234-1234-1234-123456789abc)`
      )
      process.exit(1)
    }
  }
  if (missing.length > 0) {
    console.error('--persist-policies requires the following to be set:')
    for (const m of missing) console.error(`  • ${m}`)
    console.error(
      '\nEither provide them (e.g. via .env) or drop --persist-policies to run in QA-only mode.'
    )
    process.exit(1)
  }
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

    if (fullText.includes('%DûODQJÖo') || fullText.includes('ûWHUL')) {
      throw new Error('Axa Sigorta Font Encoding Corruption Detected (Requires OCR)')
    }

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

// ---------------------------------------------------------------------------
// Document AI OCR fallback
// ---------------------------------------------------------------------------
// Mirrors scripts/test-document-ai.ts:49-95 for the auth + REST call pattern.
// Splits PDFs >10 pages via src/lib/ai/pdf-splitter.ts (Document AI's per-request
// page cap). Used when pdfjs-dist fails to extract readable text from scanned
// or image-only PDFs. Returns a structured success/error result; never throws.
//
// Credential resolution order (first match wins):
//   1. GCP_SERVICE_ACCOUNT_BASE64 env (sandbox-friendly, base64-encoded JSON key)
//   2. GOOGLE_APPLICATION_CREDENTIALS env (path to JSON key file)
//   3. ./gcp-service-account.json relative to the project root
async function extractViaDocumentAI(filePath: string): Promise<{
  success: boolean
  text?: string
  pageCount?: number
  error?: string
}> {
  const projectId = process.env.GCP_PROJECT_ID || 'gen-lang-client-0171803889'
  const location = process.env.GCP_LOCATION || 'us'
  const processorId = process.env.GCP_DOCAI_PROCESSOR_ID || 'c2741b178ab61433'

  const baseOpts = { scopes: ['https://www.googleapis.com/auth/cloud-platform'] }
  let authOpts: ConstructorParameters<typeof GoogleAuth>[0] = baseOpts

  if (process.env.GCP_SERVICE_ACCOUNT_BASE64) {
    try {
      const json = JSON.parse(
        Buffer.from(process.env.GCP_SERVICE_ACCOUNT_BASE64, 'base64').toString('utf-8')
      )
      authOpts = { ...baseOpts, credentials: json }
    } catch {
      return { success: false, error: 'GCP_SERVICE_ACCOUNT_BASE64 decode/parse failed' }
    }
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    authOpts = { ...baseOpts, keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS }
  } else {
    const defaultPath = path.join(__dirname, '..', 'gcp-service-account.json')
    if (!fs.existsSync(defaultPath)) {
      return { success: false, error: 'No GCP credentials found' }
    }
    authOpts = { ...baseOpts, keyFile: defaultPath }
  }

  try {
    const auth = new GoogleAuth(authOpts)
    const token = (await auth.getAccessToken()) as string

    const { splitPdf, DOCUMENT_AI_PAGE_LIMIT } = await import('../src/lib/ai/pdf-splitter')
    const buf = fs.readFileSync(filePath)
    const file = new File([buf], path.basename(filePath), { type: 'application/pdf' })
    const split = await splitPdf(file, DOCUMENT_AI_PAGE_LIMIT)

    const endpoint = `https://${location}-documentai.googleapis.com/v1/projects/${projectId}/locations/${location}/processors/${processorId}:process`
    const parts: string[] = []
    let pages = 0

    for (const chunk of split.chunks) {
      // split.chunks is Uint8Array[] per PDFSplitResult (pdf-splitter.ts:20)
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          rawDocument: {
            content: Buffer.from(chunk).toString('base64'),
            mimeType: 'application/pdf',
          },
          processOptions: { ocrConfig: { hints: { languageHints: ['tr', 'en'] } } },
        }),
      })
      if (!resp.ok) {
        const bodyText = await resp.text().catch(() => '')
        return {
          success: false,
          error: `Document AI HTTP ${resp.status}${bodyText ? `: ${bodyText.slice(0, 200)}` : ''}`,
        }
      }
      const json: any = await resp.json()
      if (json.document?.text) parts.push(json.document.text)
      pages += json.document?.pages?.length || 0
    }

    const text = parts.join('\n\n').trim()
    return {
      success: text.length >= 50,
      text,
      pageCount: pages,
      error: text.length < 50 ? `OCR returned only ${text.length} chars` : undefined,
    }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Unknown OCR error' }
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
  // Production extraction schema places verbatim quotes under
  // `evidence.insights[].quote` and `evidence.exclusions[].quote`. The new
  // structured `conditionalDeductibles[].evidence` field (added in the
  // production schema enhancement commit) also carries quotes. We sum all
  // three sources. The round-1 per-coverage `sourceQuote` / parallel
  // `exclusionEvidence` fields are NOT in the production schema and will
  // be absent after the refactor — that's expected.
  let count = 0
  const insights = extractedData?.evidence?.insights
  if (Array.isArray(insights)) {
    for (const ins of insights) {
      if (ins?.quote && typeof ins.quote === 'string' && ins.quote.trim()) {
        count++
      }
    }
  }
  const evExclusions = extractedData?.evidence?.exclusions
  if (Array.isArray(evExclusions)) {
    for (const ex of evExclusions) {
      if (ex?.quote && typeof ex.quote === 'string' && ex.quote.trim()) {
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
  return count
}

// ---------------------------------------------------------------------------
// LLM extraction (mirrors kasko-real-pdf-extraction.ts)
// ---------------------------------------------------------------------------

async function extractWithLLM(
  documentText: string,
  provider: 'openai' | 'anthropic'
): Promise<{ success: boolean; data?: any; model?: string; error?: string }> {
  // Import production extraction prompt + JSON schema. The PROMPT comes
  // from the client extraction-schema.ts (the only place EXTRACTION_SYSTEM_PROMPT
  // is exported). The SCHEMA comes from the server extraction-schema.ts because
  // (a) it's explicitly strict-mode compliant ("ALL properties must be in required"
  // per the file header) and (b) the client schema has a latent bug where
  // coverages.items.required is missing fields, causing OpenAI's strict mode
  // to reject it. Both files are Vite-env-free and safe to import from a
  // standalone tsx script.
  const { EXTRACTION_SYSTEM_PROMPT } = await import('../src/lib/ai/extraction-schema')
  const { EXTRACTION_JSON_SCHEMA } = await import('../shared/extraction-schema')
  const systemPrompt = EXTRACTION_SYSTEM_PROMPT

  // We use OpenAI's strict json_schema response mode (not json_object) so
  // gpt-4o-mini is forced to return ALL required fields including provider.
  // Without strict schema enforcement, gpt-4o-mini under-extracts when given
  // the production prompt — it drops provider/insuredName fields, which
  // breaks the downstream analysis pipeline (some helpers .toLowerCase()
  // these fields without null checks).
  const userMessage = documentText

  try {
    if (provider === 'openai') {
      const { default: OpenAI } = await import('openai')
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      const resp = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.1,
        response_format: {
          type: 'json_schema',
          json_schema: EXTRACTION_JSON_SCHEMA as any,
        },
        max_tokens: 4096,
      })
      const content = resp.choices[0]?.message?.content
      if (!content) return { success: false, error: 'Empty response' }
      return { success: true, data: JSON.parse(content), model: 'gpt-4o-mini' }
    } else {
      const { default: Anthropic } = await import('@anthropic-ai/sdk')
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const resp = await anthropic.messages.create({
        // Pinned to a current model. Both 'claude-3-5-haiku-latest' (alias)
        // and 'claude-3-5-haiku-20241022' (dated) are now retired (post-EOL
        // April 2026). claude-haiku-4-5-20251001 is the current cheap haiku
        // per CLAUDE.md. Production extraction uses DB-managed config; we
        // hardcode here to avoid the alias breakage.
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 16384,
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content:
              userMessage +
              '\n\nRespond with ONLY the JSON object. No markdown, no commentary, no code fences.',
          },
        ],
      })
      const text = resp.content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('')

      // Debug: log first 200 chars of response when it looks problematic
      if (!text.includes('{')) {
        console.log(`    [DEBUG] Anthropic response (first 300 chars): ${text.substring(0, 300)}`)
      }

      // Robust brace-balanced JSON extraction: Claude often appends commentary
      // after the JSON object which breaks greedy regex + JSON.parse. Walk
      // forward from the first '{', counting braces while respecting strings.
      let parsed = null
      const cleaned = text
        .replace(/```json/gi, '')
        .replace(/```/gi, '')
        .trim()
      const startIdx = cleaned.indexOf('{')
      if (startIdx === -1) return { success: false, error: 'No JSON in response' }

      let depth = 0
      let inString = false
      let escape = false
      let endIdx = -1
      for (let ci = startIdx; ci < cleaned.length; ci++) {
        const ch = cleaned[ci]
        if (escape) {
          escape = false
          continue
        }
        if (ch === '\\' && inString) {
          escape = true
          continue
        }
        if (ch === '"') {
          inString = !inString
          continue
        }
        if (inString) continue
        if (ch === '{') depth++
        else if (ch === '}') {
          depth--
          if (depth === 0) {
            endIdx = ci
            break
          }
        }
      }

      if (endIdx === -1) return { success: false, error: 'Unbalanced JSON braces' }
      try {
        parsed = JSON.parse(cleaned.substring(startIdx, endIdx + 1))
      } catch (e: any) {
        return { success: false, error: e.message || 'JSON parse error' }
      }
      return { success: true, data: parsed, model: 'claude-haiku-4-5-20251001' }
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
// policies-table writer (batch mode only, opt-in via --persist-policies)
// ---------------------------------------------------------------------------
// Unlocks the end-to-end pipeline CLAUDE.md tasks #4 → #5 → #6:
//   task #4: pilot batch ingestion → policies table
//   task #5: scripts/backfill-evaluation-scores.ts reads policies table
//   task #6: scripts/calibrate-grade-thresholds.ts reads scored policies
// The existing persistQARecord() only writes to kasko_pilot_qa_records, which
// the backfill script does NOT query. That mis-wiring stalled past sessions.
//
// Date-parse and premium-unwrap logic is a minimal inlined slice of
// src/lib/ai/policy-extractor.ts:1609-1729 — cannot import it directly because
// that file pulls in Vite's import.meta.env (CLAUDE.md gotcha #16).
// KEEP IN SYNC with the production function if the date formats or premium
// shape ever change.

// parseExtractedDate lives in scripts/_simple-date-parser.ts — imported at
// the top of this file. It MIRRORS src/lib/ai/policy-extractor.ts:1609-1637
// and is now unit-tested in scripts/__tests__/simple-date-parser.test.ts to
// catch drift early.

async function findDuplicatePolicy(
  supabase: any,
  policyNumber: string,
  provider: string,
  userId: string
): Promise<string | null> {
  const { data } = await supabase
    .from('policies')
    .select('id')
    .eq('policy_number', policyNumber)
    .eq('provider', provider)
    .eq('user_id', userId)
    .limit(1)
  return data && data.length > 0 ? data[0].id : null
}

async function persistToPoliciesTable(
  extracted: any,
  reviewerUserIdArg: string,
  filename: string
): Promise<{ ok: boolean; id?: string; skipped?: boolean; error?: string }> {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return { ok: false, error: 'Supabase not configured' }

  try {
    const { createClient } = await import('@supabase/supabase-js')
    const supabase = createClient(url, key)

    const policyNumber = extracted.policyNumber || 'UNKNOWN'
    const provider = extracted.provider || 'UNKNOWN'

    const existingId = await findDuplicatePolicy(
      supabase,
      policyNumber,
      provider,
      reviewerUserIdArg
    )
    if (existingId) return { ok: true, id: existingId, skipped: true }

    // Premium: scalar or { amount } (production handles both shapes)
    let premium = 0
    if (typeof extracted.premium === 'number') premium = extracted.premium
    else if (extracted.premium && typeof extracted.premium === 'object' && extracted.premium.amount)
      premium = extracted.premium.amount

    const coverages = Array.isArray(extracted.coverages) ? extracted.coverages : []

    const row = {
      user_id: reviewerUserIdArg,
      policy_number: policyNumber,
      provider,
      type: extracted.policyType || 'kasko',
      type_tr: 'Kasko',
      coverage: coverages[0]?.limit || 0,
      premium,
      deductible: typeof extracted.deductible === 'number' ? extracted.deductible : 0,
      start_date: parseExtractedDate(extracted.startDate || extracted.start_date, 0),
      expiry_date: parseExtractedDate(
        extracted.endDate || extracted.expiryDate || extracted.end_date,
        365
      ),
      insured_person: extracted.insuredPerson || extracted.insuredName || 'Unknown',
      status: 'active' as const,
      document_type: 'policy',
      raw_data: {
        // backfill-evaluation-scores.ts:24 requires raw_data.coverages to be an array
        coverages,
        exclusions: Array.isArray(extracted.exclusions) ? extracted.exclusions : [],
        specialConditions: Array.isArray(extracted.specialConditions)
          ? extracted.specialConditions
          : [],
        aiConfidence: extracted.confidence?.overall ?? 0,
        sourceFilename: filename,
        extractionModel: extracted._model || 'unknown',
        _batchIngested: true,
        _batchIngestedAt: new Date().toISOString(),
      },
    }

    const { data, error } = await supabase.from('policies').insert(row).select('id').single()
    if (error) return { ok: false, error: error.message }
    return { ok: true, id: data?.id }
  } catch (err: any) {
    return { ok: false, error: err?.message || 'Unknown insert error' }
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
      // 'not_attempted' is the initial sentinel: distinguishes dry-run/text-fail artifacts
      // from legitimate pilot-gate admission outcomes like 'admitted' / 'pilot_ineligible'.
      // Overwritten below after evaluatePilotAdmissionForBatch() runs in full mode.
      admissionStatus: 'not_attempted',
      displayMode: 'unknown',
      phraseClean: true,
      error: null,
    }

    // Step 1: Text extraction (pdfjs primary, Document AI OCR fallback)
    console.log('  Extracting text...')
    let textResult = await extractTextFromPdfFile(pdf.path)

    // If pdfjs can't parse the PDF (scanned / image-only), try Document AI OCR.
    // The OCR helper gracefully no-ops with a structured error when GCP creds
    // are missing, so this is safe in credential-free dry-runs.
    if (!textResult.success || !textResult.text) {
      const pdfjsErr = textResult.error || 'Text extraction failed'
      console.log(`  pdfjs failed (${pdfjsErr}) — trying Document AI OCR...`)
      const ocrResult = await extractViaDocumentAI(pdf.path)
      if (ocrResult.success && ocrResult.text) {
        console.log(`  OCR recovered ${ocrResult.text.length} chars`)
        textResult = {
          success: true,
          text: ocrResult.text,
          pageCount: ocrResult.pageCount,
        }
      } else {
        console.log(`  OCR also failed: ${ocrResult.error || 'Unknown OCR error'}`)
        textResult = {
          success: false,
          error: `pdfjs: ${pdfjsErr}; ocr: ${ocrResult.error || 'Unknown OCR error'}`,
        }
      }
    }

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
      console.log(
        `  ${primary} failed (${llmResult.error || 'unknown error'}), trying ${fallback}...`
      )
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

    // Step 6: Optionally persist to the `policies` table so downstream
    // scripts/backfill-evaluation-scores.ts can pick up the extraction.
    // Gated behind --persist-policies + --reviewer-id=<uuid> (or
    // PILOT_REVIEWER_USER_ID env). Never reached in dry-run mode.
    if (persistPolicies) {
      if (!reviewerUserId) {
        console.log('  policies: SKIP (missing --reviewer-id=<uuid> or PILOT_REVIEWER_USER_ID)')
      } else {
        const r = await persistToPoliciesTable(extracted, reviewerUserId, pdf.name)
        if (r.ok && r.skipped) {
          console.log(`  policies: duplicate skipped (id ${r.id})`)
        } else if (r.ok) {
          console.log(`  policies: inserted (id ${r.id})`)
        } else {
          console.log(`  policies: insert failed — ${r.error}`)
        }
      }
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
