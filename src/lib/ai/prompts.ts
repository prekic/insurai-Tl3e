/**
 * AI Prompts for Document Processing
 *
 * Contains system prompts for:
 * - Document normalization and OCR correction
 * - Structured extraction of insurance policy data
 * - Turkish/English mixed language processing
 *
 * These prompts are designed to be legally auditable and deterministic.
 */

// =============================================================================
// DOCUMENT NORMALIZATION AND EXTRACTION PROMPT
// =============================================================================

/**
 * Comprehensive prompt for insurance document normalization and extraction.
 *
 * Produces two outputs:
 * - Output A: Cleaned, readable version preserving meaning exactly
 * - Output B: Structured extraction in universal insurance schema
 *
 * Key principles:
 * - DO NOT paraphrase or rewrite legal/contractual text
 * - DO NOT invent, guess, or fill in missing values
 * - Preserve all numbers, dates, IDs exactly as they appear
 * - Keep page traceability with markers
 */
export const DOCUMENT_NORMALIZATION_PROMPT = `You are an insurance document normalization and extraction engine. I will provide raw text extracted from an insurance policy PDF (sometimes OCR, sometimes digital PDF text). The policy type, insurer, and layout will vary. Your job is to produce two outputs: (A) a cleaned, readable version of the text that preserves meaning exactly, and (B) a structured extraction in a universal schema. Follow the rules strictly.

0) Non-Negotiable Rules (Accuracy and Meaning)
1. DO NOT paraphrase or rewrite legal/contractual sentences in Output A. Output A must remain semantically identical to the source, only fixing OCR artifacts and formatting.
2. DO NOT invent, guess, or "fill in" missing values. If something is unclear or missing, mark it as [UNCLEAR] or [MISSING] and keep the original text fragment if present.
3. Preserve all numbers, dates, policy numbers, IDs, limits, deductibles, percentages, phone numbers, emails, plate/VIN/chassis/engine numbers EXACTLY as they appear. If you normalize number formatting, also retain the raw value.
4. Do not remove content except (i) obvious barcode/QR/binary garbage, and (ii) repeated headers/footers that appear identically on multiple pages. If you remove something, note it in a "Normalization Log."
5. Keep page traceability: if page boundaries are known, include --- Page X / Y --- markers; otherwise, do not fabricate page counts.

1) Output A — Cleaned Text (Verbatim-Plus Readability)

Goal: make the text readable and usable while staying faithful to the source.
Perform ONLY these transformations:
• Fix OCR spacing fragmentation in uppercase Turkish words and headings (e.g., B İ RLE Şİ K → BİRLEŞİK, S İ G O R T A → SİGORTA) when it is clearly a single word. Do not join legitimate separate tokens (e.g., policy numbers, dates, URLs).
• Normalize Turkish diacritics ONLY when the intended word is obvious (common insurance headings/terms like POLİÇE, SİGORTA, TEMİNAT, MUAFİYET, HASAR, SÖZLEŞME, ŞİRKET, ADRES). Do not "correct" names or IDs.
• Normalize whitespace: collapse repeated spaces, fix broken line wraps where a label/value has been split, and ensure headings and lists appear on separate lines.
• Remove non-text garbage:
  - Delete lines containing clear binary/QR artifacts (e.g., B^^^B...) or lines that are mostly non-alphanumeric symbols.
  - Do not delete legitimate punctuation, amounts, or special characters in IDs.
• Deduplicate repeated headers/footers that are identical across many pages (e.g., insurer name, "Sayfa x/y"). Keep one instance only if useful; otherwise omit and note.
• Keep bullet lists and numbering. If bullets are corrupted (e.g., l instead of •), standardize to - while keeping the original list order and content.

At the top of Output A, include:
• Document Title (if present; otherwise [UNKNOWN TITLE])
• A short "Normalization Log" listing what you removed or changed at a high level (e.g., "Removed QR/binary block lines," "Collapsed spaced uppercase headings," "Removed repeated footer lines"). Do not list every single edit.

2) Output B — Structured Extraction (Universal Insurance Schema)

Goal: extract key information into a stable structure that works for all policy types. Use the cleaned text as the only source. If a field cannot be found confidently, write [MISSING] and cite the nearest relevant excerpt.

Produce Output B in Markdown with the following sections:

1. Document Metadata
• Document type (e.g., Kasko, Property, Liability, Marine, Health, Other) or [UNKNOWN]
• Insurer name
• Policy number(s) (policy / endorsement / renewal)
• Issue date/time
• Policy period (start–end)
• Intermediary/agency/broker (if any)
• Reference IDs (e.g., SBM, proposal no, etc.)

2. Parties
• Policyholder (Sigorta Ettiren) — name, address, contact
• Insured (Sigortalı) — name, address, contact
• Beneficiary / Mortgagee / Loss payee (Dain-i mürtehin / rehinli alacaklı) if any
• Note: Do not infer relationships; only extract stated roles.

3. Risk / Subject Matter (choose what fits; do not force vehicle fields onto non-vehicle policies)
• Vehicle policies: plate, make/model, year, VIN/chassis, engine no, usage type, registration date
• Property policies: insured location(s), occupancy, construction type, key assets
• Liability policies: insured activity/operations, territory, insured parties
• Health/personal: insured persons, plan type
If policy type is unclear, summarize what is insured in plain language with citations.

4. Premium & Payment
• Net premium
• Taxes/fees (BSMV, etc.)
• Total payable (CRITICAL: DO NOT extract Vehicle Market Value / "Araç Kasko Bedeli" / "Sigorta Bedeli" here. Premium is the cost of the insurance policy, not the value of the insured asset.)
• Currency
• Payment plan: installment count, dates, amounts, method (if stated)

5. Coverage Summary (most important)
Create a table with one row per coverage where possible:
• Coverage name
• Limit / sum insured
• Deductible / franchise / participation
• Key conditions / notes
If limits are not explicit, write [NOT STATED].

6. Deductibles / Special Deductibles
List all deductibles and when they apply.

7. Exclusions & Major Limitations
List key exclusions, restrictions, and conditions that materially change coverage (e.g., sanctions clause, misuse, territorial limits, specific perils excluded). Do not paraphrase legal text; summarize briefly and cite the clause excerpt.

8. Endorsements / Clauses / Special Terms
List all endorsements/klozlar/ek sözleşmeler and what they modify. If the full text exists, cite and summarize cautiously.

9. Claims Process
• Notice requirements and deadlines
• Contact channels (phone/email/web)
• Required documents checklist (if present)

10. Dispute Resolution / Governing Terms
Extract any arbitration/court/jurisdiction statements if present.

11. Uncertainties / QA Flags
List items that are unclear due to OCR/layout issues, with [UNCLEAR] tags and citations.

3) Citation Requirement

Whenever you extract a field, include a short citation snippet from Output A (a quoted phrase of max ~20–30 words) right under the field or table row so the extraction is auditable. If you cannot cite, mark the field [MISSING].

4) Formatting Requirements
• Output A: use plain text blocks with headings and line breaks; keep original language.
• Output B: use Markdown headings, bullet lists, and tables where appropriate.
• Separate the two outputs clearly:
=== OUTPUT A: CLEANED TEXT ===
=== OUTPUT B: STRUCTURED EXTRACTION ===

Now process the following raw policy text and produce both outputs exactly as specified.`

// =============================================================================
// SIMPLIFIED OCR CORRECTION PROMPT (for quick processing)
// =============================================================================

/**
 * Lighter-weight prompt for basic OCR correction only.
 * Use this when you only need cleaned text, not structured extraction.
 */
export const OCR_CORRECTION_PROMPT = `You are a document text normalizer for Turkish insurance documents. Fix OCR errors while preserving the original meaning exactly.

RULES:
1. Fix spaced Turkish characters in headings: B İ RLE Şİ K → BİRLEŞİK, S İ G O R T A → SİGORTA
2. Fix common Turkish word fragments: poli ç e → poliçe, sigorta l ı → sigortalı
3. Normalize whitespace: collapse multiple spaces, fix broken line wraps
4. Remove obvious garbage: binary data, QR code artifacts, lines with mostly symbols
5. Preserve EXACTLY: numbers, dates, policy numbers, IDs, names, legal text

DO NOT:
- Paraphrase or rewrite any text
- Add or invent information
- Change the meaning of any sentence
- Modify numbers, amounts, or identifiers

Output the cleaned text only, no explanations.`

// =============================================================================
// TURKISH INSURANCE TERMS FOR OCR CORRECTION
// =============================================================================

/**
 * Common Turkish insurance terms that should be recognized and corrected.
 * These are used to validate OCR corrections.
 */
export const TURKISH_INSURANCE_TERMS = [
  // Policy document terms
  'POLİÇE',
  'SİGORTA',
  'TEMİNAT',
  'MUAFİYET',
  'PRİM',
  'HASAR',
  'SÖZLEŞME',
  'ŞİRKET',
  'ADRES',
  'TARİH',
  'SÜRE',
  'VERGİ',

  // Coverage types
  'KASKO',
  'TRAFİK',
  'KONUT',
  'SAĞLIK',
  'HAYAT',
  'YANGIN',
  'DEPREM',
  'DASK',
  'SEL',
  'HIRSIZLIK',
  'KAZA',
  'SORUMLULUK',
  'NAKLİYAT',

  // Policy parties
  'SİGORTALI',
  'SİGORTA ETTİREN',
  'LEHDAR',
  'DAİN-İ MÜRTEHİN',

  // Coverage terms
  'TAZMİNAT',
  'LİMİT',
  'TUTAR',
  'BEDEL',
  'DEĞER',
  'ORAN',
  'FRANŞİZ',
  'İSTİSNA',
  'KAPSAM',
  'TEMİNAT DIŞI',

  // Document sections
  'GENEL ŞARTLAR',
  'ÖZEL ŞARTLAR',
  'KLOZLAR',
  'EK SÖZLEŞME',
  'TEMİNATLAR',
  'İSTİSNALAR',
  'AÇIKLAMALAR',
  'BİLDİRİM',

  // Vehicle specific
  'PLAKA',
  'ŞASİ',
  'MOTOR',
  'MODEL',
  'MARKA',
  'ARAÇ',
  'RUHSAT',

  // Financial terms
  'ÖDEME',
  'TAKSİT',
  'BSMV',
  'NET PRİM',
  'BRÜT PRİM',
  'TOPLAM',

  // Company names (partial)
  'ANONİM',
  'ŞİRKETİ',
  'AŞ',
  'TÜRKİYE',
  'ANADOLU',

  // Common words in documents
  'BİRLEŞİK',
  'KAPSAMINDA',
  'UYARINCA',
  'GEREĞİNCE',
  'MADDE',
] as const

/**
 * OCR confusion pairs - characters commonly confused by OCR.
 * Used for validation of corrections.
 */
export const OCR_CONFUSION_PAIRS: Record<string, string[]> = {
  İ: ['I', 'l', '1', '|'],
  ı: ['i', 'l', '1'],
  Ş: ['S', '5'],
  ş: ['s', '5'],
  Ğ: ['G', '6'],
  ğ: ['g', '9'],
  Ü: ['U', 'Ü'],
  ü: ['u', 'ü'],
  Ö: ['O', '0'],
  ö: ['o', '0'],
  Ç: ['C', 'c'],
  ç: ['c', 'C'],
  '0': ['O', 'o', 'Q'],
  '1': ['l', 'I', '|', 'i'],
}

// =============================================================================
// STRUCTURED EXTRACTION SCHEMA PROMPT
// =============================================================================

/**
 * Prompt for extracting structured data from already-cleaned text.
 * Use this after OCR correction for JSON extraction.
 */
export const EXTRACTION_SCHEMA_PROMPT = `Extract insurance policy data from the following text into the JSON schema provided. Follow these rules:

1. Extract ONLY what is explicitly stated in the text
2. Use [MISSING] for fields that cannot be found
3. Use [UNCLEAR] for fields that are ambiguous or partially readable
4. Preserve all numbers, dates, and identifiers exactly
5. Include brief citation snippets for key fields

Output valid JSON matching the schema. Do not add fields not in the schema.`

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Build a complete prompt for document processing
 */
export function buildDocumentProcessingPrompt(
  rawText: string,
  options: {
    includeStructuredExtraction?: boolean
    language?: 'tr' | 'en' | 'mixed'
  } = {}
): string {
  const { includeStructuredExtraction = true, language = 'mixed' } = options

  const systemPrompt = includeStructuredExtraction
    ? DOCUMENT_NORMALIZATION_PROMPT
    : OCR_CORRECTION_PROMPT

  const languageNote =
    language === 'tr'
      ? '\n\nNote: This document is in Turkish (Türkçe). Preserve Turkish characters (İ, ı, Ş, ş, Ğ, ğ, Ü, ü, Ö, ö, Ç, ç) carefully.'
      : language === 'en'
        ? '\n\nNote: This document is in English.'
        : '\n\nNote: This document is mixed Turkish/English. Preserve Turkish characters carefully.'

  return `${systemPrompt}${languageNote}

--- BEGIN RAW TEXT ---
${rawText}
--- END RAW TEXT ---`
}

/**
 * Parse the AI response to extract Output A and Output B
 */
export function parseDocumentProcessingResponse(response: string): {
  cleanedText: string | null
  structuredExtraction: string | null
  normalizationLog: string | null
} {
  const result = {
    cleanedText: null as string | null,
    structuredExtraction: null as string | null,
    normalizationLog: null as string | null,
  }

  // Try to find Output A marker
  const outputAMatch = response.match(
    /===\s*OUTPUT A[:\s]*CLEANED TEXT\s*===\s*([\s\S]*?)(?====\s*OUTPUT B|$)/i
  )
  if (outputAMatch) {
    result.cleanedText = outputAMatch[1].trim()

    // Extract normalization log from Output A
    const logMatch = result.cleanedText.match(
      /Normalization Log[:\s]*([\s\S]*?)(?=\n\n|\n---|\n[A-Z])/i
    )
    if (logMatch) {
      result.normalizationLog = logMatch[1].trim()
    }
  }

  // Try to find Output B marker
  const outputBMatch = response.match(
    /===\s*OUTPUT B[:\s]*STRUCTURED EXTRACTION\s*===\s*([\s\S]*?)$/i
  )
  if (outputBMatch) {
    result.structuredExtraction = outputBMatch[1].trim()
  }

  // If no markers found, try to split on common patterns
  if (!result.cleanedText && !result.structuredExtraction) {
    // Look for structured extraction patterns
    if (
      response.includes('## 1. Document Metadata') ||
      response.includes('### Document Metadata')
    ) {
      // Assume everything before metadata is cleaned text
      const metadataIndex = response.search(/##?\s*1?\.\s*Document Metadata/i)
      if (metadataIndex > 100) {
        result.cleanedText = response.slice(0, metadataIndex).trim()
        result.structuredExtraction = response.slice(metadataIndex).trim()
      } else {
        result.structuredExtraction = response.trim()
      }
    } else {
      // Just return the whole response as cleaned text
      result.cleanedText = response.trim()
    }
  }

  return result
}

/**
 * Validate that OCR corrections are consistent with known Turkish terms
 */
export function validateOCRCorrection(
  original: string,
  corrected: string
): {
  isValid: boolean
  issues: string[]
} {
  const issues: string[] = []

  // Check that corrected text doesn't introduce new characters
  const originalChars = new Set(original.replace(/\s/g, ''))
  const correctedChars = new Set(corrected.replace(/\s/g, ''))

  for (const char of correctedChars) {
    if (!originalChars.has(char)) {
      // New character introduced - check if it's a valid Turkish correction
      const isValidTurkishChar = /[İıŞşĞğÜüÖöÇç]/.test(char)
      const couldBeConfusion = Object.entries(OCR_CONFUSION_PAIRS).some(
        ([correct, confusions]) => correct === char && confusions.some((c) => originalChars.has(c))
      )

      if (!isValidTurkishChar && !couldBeConfusion) {
        issues.push(`Unexpected character '${char}' introduced in correction`)
      }
    }
  }

  // Check that known Turkish terms appear correctly if they were attempted
  for (const term of TURKISH_INSURANCE_TERMS) {
    const termLower = term.toLowerCase()
    if (corrected.toLowerCase().includes(termLower)) {
      // The term appears - check if it's spelled correctly
      const regex = new RegExp(term.replace(/[İıŞşĞğÜüÖöÇç]/g, '.'), 'gi')
      const matches = corrected.match(regex)
      if (matches) {
        for (const match of matches) {
          if (match !== term && match.toUpperCase() !== term) {
            // Check if this is a case variation
            if (match.toUpperCase().replace(/I/g, 'İ').replace(/i/g, 'ı') !== term) {
              issues.push(`Possible misspelling: '${match}' should be '${term}'`)
            }
          }
        }
      }
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
  }
}

export type DocumentProcessingResult = ReturnType<typeof parseDocumentProcessingResponse>
