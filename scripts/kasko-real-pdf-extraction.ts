/**
 * Phase 8D/8E — Controlled Real-PDF Extraction Runner
 *
 * This script reads actual KASKO PDFs, extracts text, calls the LLM,
 * then runs the full analysis pipeline.
 *
 * Phase 8E improvements:
 * - Section-aware chunking (head + tail) replaces naive truncation
 * - Enhanced prompt for conditional deductibles and special conditions
 * - Two-pass extraction for long docs (coverages + conditions)
 *
 * Usage: npx tsx scripts/kasko-real-pdf-extraction.ts
 *
 * IMPORTANT:
 * - Requires OPENAI_API_KEY or ANTHROPIC_API_KEY in .env
 * - Makes real LLM API calls (costs money)
 * - Outputs are logged to console and saved to /tmp/kasko-extraction-results.json
 */

import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// ============================================================================
// STEP 1: PDF TEXT EXTRACTION (using pdfjs-dist directly)
// ============================================================================

async function extractTextFromPdfFile(filePath: string): Promise<{
  success: boolean
  text?: string
  pageCount?: number
  error?: string
}> {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
    // Point to actual worker file for Node.js
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
      error:
        fullText.length < 50
          ? `Only ${fullText.length} chars extracted (may be scanned/image PDF)`
          : undefined,
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Unknown error' }
  }
}

// ============================================================================
// STEP 2: LLM EXTRACTION (call OpenAI or Anthropic directly)
// ============================================================================

// ============================================================================
// SECTION-AWARE TEXT CHUNKING (Phase 8E — DEF-EX-002 fix)
// ============================================================================

/**
 * Instead of naive truncation that drops later pages, keep:
 * - Head: first 20K chars (policy header, declarations, main coverages)
 * - Tail: last 12K chars (special conditions, endorsements, signatures)
 * This preserves both coverage detail AND late-page clauses.
 */
function buildSectionAwareText(fullText: string, maxChars: number = 32000): string {
  if (fullText.length <= maxChars) return fullText

  const HEAD_RATIO = 0.625 // 62.5% for head
  const headSize = Math.floor(maxChars * HEAD_RATIO)
  const tailSize = maxChars - headSize

  const head = fullText.substring(0, headSize)
  const tail = fullText.substring(fullText.length - tailSize)

  return head + '\n\n[... document middle section omitted for length ...]\n\n' + tail
}

/**
 * For very long documents, extract a focused "conditions supplement"
 * from the tail section to capture special conditions / endorsements.
 */
function _extractConditionsSupplementText(fullText: string): string {
  // Take the last 15K chars where conditions/endorsements typically live
  const TAIL_SIZE = 15000
  if (fullText.length <= TAIL_SIZE) return ''
  return fullText.substring(fullText.length - TAIL_SIZE)
}

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
  "startDate": "YYYY-MM-DD or null",
  "endDate": "YYYY-MM-DD or null",
  "premium": number or null,
  "currency": "TRY",
  "coverages": [{
    "name": "string",
    "description": "string — include deductible conditions, network/non-network distinctions",
    "limit": number or null,
    "deductible": number or null,
    "isMarketValue": boolean,
    "isUnlimited": boolean,
    "included": true,
    "evidence": {
      "text": "original Turkish text snippet",
      "textEn": "English translation",
      "quote": "key phrase"
    }
  }],
  "exclusions": ["string"],
  "specialConditions": ["string — include ALL conditional deductibles, age/license restrictions, repair network conditions, and endorsement clauses"],
  "confidence": { "overall": number between 0 and 1 },
  "evidence": {
    "insights": [{ "text": "string", "textEn": "string", "quote": "string" }],
    "exclusions": []
  }
}

CRITICAL EXTRACTION REQUIREMENTS:
1. CONDITIONAL DEDUCTIBLES: Look for muafiyet/tenzili muafiyet clauses that apply under specific conditions:
   - Age-based: "25 yaşından küçük", "yaş şartı", "sürücü yaşı"
   - License-based: "ehliyet süresi", "2 yıldan az"
   - Repair network: "anlaşmalı servis", "anlaşmasız servis", "%25 muafiyet"
   - Scenario-based: "alkol", "ehliyetsiz", "hız"
   Each conditional deductible MUST appear in specialConditions.

2. SPECIAL CONDITIONS / ENDORSEMENTS: Extract ALL special conditions, even if they appear at the end of the document:
   - Özel şartlar, kloz, zeyilname, ek teminat şartları
   - Include the full condition text, not just the heading.

3. RAYIÇ DEĞER: If the sum insured is based on market value (rayiç değer), set isMarketValue=true.
4. SINURSIZ: If a coverage is unlimited (sınırsız), set isUnlimited=true.
5. SERVICE DISTINCTIONS: Note differences between anlaşmalı (network) and anlaşmasız (non-network) service.`

  try {
    if (provider === 'openai') {
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) return { success: false, error: 'OPENAI_API_KEY not set' }

      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Document text:\n\n${documentText}` },
          ],
          temperature: 0.1,
          max_tokens: 4000,
          response_format: { type: 'json_object' },
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        return {
          success: false,
          error: `OpenAI API error ${res.status}: ${errText.substring(0, 200)}`,
        }
      }

      const json = await res.json()
      const content = json.choices?.[0]?.message?.content
      if (!content) return { success: false, error: 'Empty response from OpenAI' }

      return { success: true, data: JSON.parse(content), model: 'gpt-4o-mini' }
    } else {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) return { success: false, error: 'ANTHROPIC_API_KEY not set' }

      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-3-5-haiku-20241022',
          max_tokens: 4000,
          system: systemPrompt,
          messages: [{ role: 'user', content: `Document text:\n\n${documentText}` }],
        }),
      })

      if (!res.ok) {
        const errText = await res.text()
        return {
          success: false,
          error: `Anthropic API error ${res.status}: ${errText.substring(0, 200)}`,
        }
      }

      const json = await res.json()
      const content = json.content?.[0]?.text
      if (!content) return { success: false, error: 'Empty response from Anthropic' }

      // Extract JSON from response (may be wrapped in markdown)
      const jsonMatch = content.match(/\{[\s\S]*\}/)
      if (!jsonMatch) return { success: false, error: 'No JSON found in response' }

      return { success: true, data: JSON.parse(jsonMatch[0]), model: 'claude-3-5-haiku' }
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Unknown error' }
  }
}

// ============================================================================
// STEP 3: DOWNSTREAM PIPELINE (normalization → validation → analysis → display)
// ============================================================================

// We import these dynamically to avoid tsconfig path resolution issues in tsx
async function runDownstreamPipeline(extractedData: any) {
  // Dynamic imports using relative paths from project root
  const { normalizeBranchExtraction } = await import('../src/lib/ai/extraction-normalizer')
  const { validateExtractionSafety } = await import('../src/lib/ai/validator')
  const { generateAnalysisBundle } = await import('../src/lib/analysis/engine')
  const { evaluateDisplayMode } = await import('../src/lib/analysis/review-thresholds')
  const { generateDisplaySafeSummary } = await import('../src/lib/analysis/display-interpreter')

  const PROHIBITED_PHRASES = [
    'no deductible',
    'unlimited',
    'fully covered',
    'tam kapsamlı',
    'guaranteed',
    'full protection',
    'total coverage',
    "your vehicle's full value will be paid",
    'aracınızın tam değeri ödenir',
    'free towing',
    'fully compliant',
    'muafiyetsiz',
    'tamamen kapsar',
    'sınırsız',
  ]

  const normalized = normalizeBranchExtraction(extractedData)
  const validation = validateExtractionSafety(normalized)
  const analysis = generateAnalysisBundle('REAL-PDF', normalized, validation)
  const displayResult = evaluateDisplayMode(normalized, validation, analysis)
  const summary = generateDisplaySafeSummary(normalized, validation, analysis)

  const summaryText = JSON.stringify(summary).toLowerCase()
  const foundPhrases = PROHIBITED_PHRASES.filter((p) => summaryText.includes(p.toLowerCase()))

  return {
    normalized,
    validation,
    displayResult,
    summary,
    phraseClean: foundPhrases.length === 0,
    foundPhrases,
  }
}

// ============================================================================
// MAIN
// ============================================================================

interface ExtractionResult {
  sampleId: string
  pdfPath: string
  sourceType: string
  // Text extraction
  textExtractionSuccess: boolean
  textLength: number
  pageCount: number
  textExtractionError?: string
  // LLM extraction
  llmExtractionSuccess: boolean
  llmModel?: string
  llmExtractionError?: string
  // Extracted fields
  policyNumber?: string | null
  provider?: string
  branch?: string
  premium?: number | null
  coverageCount?: number
  specialConditionCount?: number
  hasRayicDeger?: boolean
  hasConditionalDeductible?: boolean
  hasUnlimitedCoverage?: boolean
  // Display pipeline
  displayMode?: string
  phraseClean?: boolean
  foundPhrases?: string[]
  triggerCount?: number
  triggerNames?: string[]
  validationFlags?: number
  // Human QA fields
  sourceQuoteCount?: number
}

async function main() {
  console.log('=== Phase 8D: KASKO Real-PDF Extraction Validation ===\n')

  const pdfs = [
    {
      id: 'KASKO-PDF-001',
      path: path.resolve(__dirname, '../test-data/sample-kasko-policy.pdf'),
      sourceType: 'digital-pdf',
    },
    {
      id: 'KASKO-PDF-002',
      path: path.resolve(__dirname, '../test-data/eriş ambalaj 34 rz 9511 kasko pol .pdf'),
      sourceType: 'scan-ocr-pdf',
    },
    {
      id: 'KASKO-PDF-003',
      path: path.resolve(__dirname, '../e2e/fixtures/test-policy.pdf'),
      sourceType: 'test-fixture',
    },
  ]

  const results: ExtractionResult[] = []

  for (const pdf of pdfs) {
    console.log(`\n--- ${pdf.id}: ${path.basename(pdf.path)} ---`)
    const result: ExtractionResult = {
      sampleId: pdf.id,
      pdfPath: path.basename(pdf.path),
      sourceType: pdf.sourceType,
      textExtractionSuccess: false,
      textLength: 0,
      pageCount: 0,
      llmExtractionSuccess: false,
    }

    // Check file exists
    if (!fs.existsSync(pdf.path)) {
      console.log(`  ❌ File not found: ${pdf.path}`)
      result.textExtractionError = 'File not found'
      results.push(result)
      continue
    }

    const fileSize = fs.statSync(pdf.path).size
    console.log(`  File size: ${(fileSize / 1024).toFixed(1)} KB`)

    // Step 1: Text extraction
    console.log('  📄 Extracting text from PDF...')
    const textResult = await extractTextFromPdfFile(pdf.path)
    result.textExtractionSuccess = textResult.success
    result.textLength = textResult.text?.length || 0
    result.pageCount = textResult.pageCount || 0
    result.textExtractionError = textResult.error

    console.log(
      `  ${textResult.success ? '✅' : '❌'} Text: ${result.textLength} chars, ${result.pageCount} pages`
    )
    if (textResult.text && textResult.text.length > 0) {
      console.log(`  Preview: ${textResult.text.substring(0, 200)}...`)
    }

    if (!textResult.success || !textResult.text || textResult.text.length < 50) {
      console.log(`  ⚠️ Insufficient text extracted, skipping LLM extraction`)
      results.push(result)
      continue
    }

    // Step 2: LLM extraction with section-aware chunking (Phase 8E)
    const llmText = buildSectionAwareText(textResult.text)
    if (llmText.length < textResult.text.length) {
      console.log(
        `  📎 Section-aware chunking: ${textResult.text.length} → ${llmText.length} chars (head+tail preserved)`
      )
    }
    console.log('  🤖 Running LLM extraction (OpenAI gpt-4o-mini)...')
    let llmResult = await extractWithLLM(llmText, 'openai')

    if (!llmResult.success) {
      console.log(`  ⚠️ OpenAI failed: ${llmResult.error}`)
      console.log('  🤖 Trying Anthropic claude-3-5-haiku...')
      llmResult = await extractWithLLM(textResult.text, 'anthropic')
    }

    result.llmExtractionSuccess = llmResult.success
    result.llmModel = llmResult.model
    result.llmExtractionError = llmResult.error

    if (!llmResult.success) {
      console.log(`  ❌ LLM extraction failed: ${llmResult.error}`)
      results.push(result)
      continue
    }

    console.log(`  ✅ LLM extraction succeeded (${llmResult.model})`)

    // Capture extracted fields
    const extracted = llmResult.data
    result.policyNumber = extracted.policyNumber
    result.provider = extracted.provider
    result.branch = extracted.branch
    result.premium = extracted.premium
    result.coverageCount = extracted.coverages?.length || 0
    result.specialConditionCount = extracted.specialConditions?.length || 0
    result.hasRayicDeger = extracted.coverages?.some((c: any) => c.isMarketValue === true) || false
    result.hasConditionalDeductible = (extracted.specialConditions || []).some(
      (sc: any) => typeof sc === 'string' && (sc.includes('muafiyet') || sc.includes('deductible'))
    )
    result.hasUnlimitedCoverage =
      extracted.coverages?.some((c: any) => c.isUnlimited === true) || false

    console.log(`  Policy#: ${result.policyNumber || 'N/A'}`)
    console.log(`  Provider: ${result.provider || 'N/A'}`)
    console.log(`  Branch: ${result.branch || 'N/A'}`)
    console.log(`  Premium: ${result.premium || 'N/A'}`)
    console.log(`  Coverages: ${result.coverageCount}`)
    console.log(`  Rayiç Değer: ${result.hasRayicDeger ? '✅' : '❌'}`)
    console.log(`  Conditional deductible: ${result.hasConditionalDeductible ? '✅' : '❌'}`)
    console.log(`  Unlimited coverage: ${result.hasUnlimitedCoverage ? '✅' : '❌'}`)

    // Step 3: Downstream pipeline
    console.log('  📊 Running downstream pipeline...')
    try {
      const downstream = await runDownstreamPipeline(extracted)
      result.displayMode = downstream.displayResult.mode
      result.phraseClean = downstream.phraseClean
      result.foundPhrases = downstream.foundPhrases
      result.triggerCount = downstream.displayResult.triggers.length
      result.triggerNames = downstream.displayResult.triggers.map((t: any) => t.triggerRule)
      result.validationFlags = downstream.validation.flags.length
      result.sourceQuoteCount = (downstream.normalized.coverages || []).filter(
        (c: any) => c.evidence?.quote
      ).length

      console.log(`  Display mode: ${result.displayMode}`)
      console.log(
        `  Phrase clean: ${result.phraseClean ? '✅' : '❌ ' + result.foundPhrases?.join(', ')}`
      )
      console.log(`  Triggers: ${result.triggerNames?.join(', ') || 'none'}`)
      console.log(`  Source quotes: ${result.sourceQuoteCount}`)
    } catch (err: any) {
      console.log(`  ❌ Downstream pipeline error: ${err.message}`)
    }

    results.push(result)
  }

  // Print summary
  console.log('\n\n=== PHASE 8D: EXTRACTION SUMMARY ===')
  console.table(
    results.map((r) => ({
      id: r.sampleId,
      pdf: r.pdfPath,
      textOK: r.textExtractionSuccess ? '✅' : '❌',
      chars: r.textLength,
      llmOK: r.llmExtractionSuccess ? '✅' : '❌',
      model: r.llmModel || 'N/A',
      mode: r.displayMode || 'N/A',
      phrases: r.phraseClean ? '✅' : '❌',
      covs: r.coverageCount || 0,
      quotes: r.sourceQuoteCount || 0,
    }))
  )

  // Save results
  const outputPath = '/tmp/kasko-extraction-results.json'
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2))
  console.log(`\nResults saved to: ${outputPath}`)
}

main().catch((err) => {
  console.error('Fatal error:', err)
  process.exit(1)
})
