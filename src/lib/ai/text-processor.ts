/**
 * AI Text Processor
 *
 * Second-pass AI processing for raw extracted text:
 * - Corrects OCR errors
 * - Fixes formatting and structure
 * - Detects and corrects language-specific issues (Turkish chars)
 * - Makes text human and AI readable
 */

import { env } from '@/lib/env'

export interface ProcessedTextResult {
  success: boolean
  processedText: string
  corrections: TextCorrection[]
  detectedLanguage: string
  confidence: number
  processingTimeMs: number
}

export interface TextCorrection {
  original: string
  corrected: string
  type: 'ocr_error' | 'spelling' | 'formatting' | 'language' | 'structure'
  position?: { start: number; end: number }
}

/**
 * Common OCR error patterns for Turkish insurance documents
 */
const TURKISH_OCR_CORRECTIONS: Array<[RegExp, string]> = [
  // Letter substitutions
  [/l(?=\d)/gi, 'I'],           // l1234 -> I1234 (policy numbers)
  [/0(?=[A-Za-z])/g, 'O'],     // 0N -> ON
  [/1(?=[A-Za-z])/g, 'I'],     // 1nsurance -> Insurance
  [/5(?=[İiIı])/g, 'S'],       // 5igorta -> Sigorta
  [/\bI\b(?=stanbul)/gi, 'İ'], // Istanbul -> İstanbul
  [/ISTANBUL/g, 'İSTANBUL'],
  [/TURKIYE/g, 'TÜRKİYE'],
  [/SIGORTA/g, 'SİGORTA'],
  [/POLICE/g, 'POLİÇE'],

  // Common word corrections
  [/teminat(?!ı)/gi, 'teminatı'],
  [/muafiyet(?!i)/gi, 'muafiyeti'],
  [/priml(?=\s|$)/gi, 'primi'],

  // Number formatting
  [/(\d)\.(\d{3})\.(\d{3})/g, '$1.$2.$3'], // Keep Turkish number format
  [/TL(?=\d)/g, 'TL '],        // TL1000 -> TL 1000
  [/(\d)TL/g, '$1 TL'],        // 1000TL -> 1000 TL

  // Common OCR artifacts
  [/\s{2,}/g, ' '],            // Multiple spaces
  [/\n{3,}/g, '\n\n'],         // Multiple newlines
  [/([.,:;])(?=[^\s\d])/g, '$1 '], // Missing space after punctuation
]

/**
 * Apply basic OCR corrections without AI
 * Fast local processing for common errors
 */
export function applyBasicOCRCorrections(text: string): {
  text: string
  corrections: TextCorrection[]
} {
  const corrections: TextCorrection[] = []
  let processedText = text

  for (const [pattern, replacement] of TURKISH_OCR_CORRECTIONS) {
    const matches = processedText.match(pattern)
    if (matches) {
      for (const match of matches) {
        corrections.push({
          original: match,
          corrected: match.replace(pattern, replacement),
          type: 'ocr_error',
        })
      }
      processedText = processedText.replace(pattern, replacement)
    }
  }

  return { text: processedText, corrections }
}

/**
 * Process raw extracted text with AI
 * Corrects errors, improves readability, structures content
 */
export async function processTextWithAI(
  rawText: string,
  options: {
    provider?: 'openai' | 'anthropic'
    preserveStructure?: boolean
    detectLanguage?: boolean
  } = {}
): Promise<ProcessedTextResult> {
  const startTime = Date.now()
  const { provider = 'openai', preserveStructure = true } = options

  // First apply basic corrections
  const { text: preProcessed, corrections: basicCorrections } = applyBasicOCRCorrections(rawText)

  // If text is very short or looks clean, skip AI processing
  if (rawText.length < 100 || basicCorrections.length === 0) {
    return {
      success: true,
      processedText: preProcessed,
      corrections: basicCorrections,
      detectedLanguage: 'tr',
      confidence: 0.95,
      processingTimeMs: Date.now() - startTime,
    }
  }

  const API_URL = env.proxyUrl
  if (!API_URL) {
    // No API available, return basic corrections only
    return {
      success: true,
      processedText: preProcessed,
      corrections: basicCorrections,
      detectedLanguage: 'tr',
      confidence: 0.85,
      processingTimeMs: Date.now() - startTime,
    }
  }

  const systemPrompt = `You are a Turkish insurance document text processor. Your task is to:
1. Correct OCR errors in Turkish text (especially İ/I, Ş/S, Ğ/G, Ü/U, Ö/O, Ç/C confusion)
2. Fix formatting issues while preserving the document structure
3. Correct spelling errors common in insurance terminology
4. Ensure proper Turkish number formatting (e.g., 1.000.000 TL)
5. Preserve all policy numbers, dates, and monetary values exactly

Important:
- Keep the same general structure and sections
- Do NOT translate - keep everything in the original language
- Do NOT add any information not present in the original
- Preserve line breaks that separate different sections
- Output ONLY the corrected text, no explanations

Turkish insurance terms to preserve correctly:
- Sigorta, Sigortalı, Sigortacı
- Teminat, Muafiyet, Prim
- Poliçe, Zeyilname, Tecdit
- Kasko, DASK, Trafik Sigortası`

  const userPrompt = `Process and correct the following insurance document text:\n\n${preProcessed}`

  try {
    const response = await fetch(`${API_URL}/api/ai/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userPrompt,
        policyContext: systemPrompt,
        provider,
      }),
    })

    if (!response.ok) {
      // If AI fails, return basic corrections
      return {
        success: true,
        processedText: preProcessed,
        corrections: basicCorrections,
        detectedLanguage: 'tr',
        confidence: 0.85,
        processingTimeMs: Date.now() - startTime,
      }
    }

    const data = await response.json()

    if (data.success && data.response) {
      // Extract the processed text from AI response
      let aiProcessedText = data.response.trim()

      // Sometimes AI adds quotes or markdown, clean it up
      if (aiProcessedText.startsWith('```') && aiProcessedText.endsWith('```')) {
        aiProcessedText = aiProcessedText.slice(3, -3).trim()
      }
      if (aiProcessedText.startsWith('"') && aiProcessedText.endsWith('"')) {
        aiProcessedText = aiProcessedText.slice(1, -1)
      }

      // Compare with original to identify AI corrections
      const aiCorrections = identifyCorrections(preProcessed, aiProcessedText)

      return {
        success: true,
        processedText: preserveStructure ? aiProcessedText : aiProcessedText.replace(/\n+/g, '\n'),
        corrections: [...basicCorrections, ...aiCorrections],
        detectedLanguage: detectLanguage(aiProcessedText),
        confidence: 0.95,
        processingTimeMs: Date.now() - startTime,
      }
    }

    // Fallback to basic corrections
    return {
      success: true,
      processedText: preProcessed,
      corrections: basicCorrections,
      detectedLanguage: 'tr',
      confidence: 0.85,
      processingTimeMs: Date.now() - startTime,
    }
  } catch (error) {
    console.error('AI text processing failed:', error)
    // Return basic corrections on error
    return {
      success: true,
      processedText: preProcessed,
      corrections: basicCorrections,
      detectedLanguage: 'tr',
      confidence: 0.75,
      processingTimeMs: Date.now() - startTime,
    }
  }
}

/**
 * Identify corrections made between original and processed text
 */
function identifyCorrections(original: string, processed: string): TextCorrection[] {
  const corrections: TextCorrection[] = []

  // Simple word-level comparison
  const originalWords = original.split(/\s+/)
  const processedWords = processed.split(/\s+/)

  const minLen = Math.min(originalWords.length, processedWords.length)
  for (let i = 0; i < minLen; i++) {
    if (originalWords[i] !== processedWords[i]) {
      corrections.push({
        original: originalWords[i],
        corrected: processedWords[i],
        type: 'ocr_error',
      })
    }
  }

  // Limit to most significant corrections
  return corrections.slice(0, 50)
}

/**
 * Detect language from text content
 */
function detectLanguage(text: string): string {
  // Turkish-specific characters
  const turkishChars = /[İıĞğŞşÜüÖöÇç]/g
  const turkishMatches = (text.match(turkishChars) || []).length

  // Turkish common words
  const turkishWords = /\b(ve|bir|bu|için|ile|olan|olarak|gibi|veya|ancak|sigorta|poliçe|teminat)\b/gi
  const turkishWordMatches = (text.match(turkishWords) || []).length

  // If significant Turkish markers, return Turkish
  if (turkishMatches > 5 || turkishWordMatches > 10) {
    return 'tr'
  }

  return 'en'
}

/**
 * Check if text needs processing
 * Quick heuristic to skip unnecessary AI calls
 */
export function textNeedsProcessing(text: string): boolean {
  // Check for common OCR error indicators
  const indicators = [
    /[0O][A-Za-z]{2,}/g,      // 0CR errors like "0CT" for "OCT"
    /[1lI][A-Za-z]{2,}/g,     // 1/l/I confusion
    /[5S][İiIı]/g,            // 5/S confusion with Turkish i
    /\s{3,}/g,                // Excessive spacing
    /[A-Za-z]{15,}/g,         // Words that are too long (likely merged)
    /[.,:;]{2,}/g,            // Repeated punctuation
    /ISTANBUL|TURKIYE|SIGORTA/g, // Missing Turkish characters
  ]

  for (const pattern of indicators) {
    if (pattern.test(text)) {
      return true
    }
  }

  return false
}
