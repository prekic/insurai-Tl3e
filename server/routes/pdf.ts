/**
 * PDF Extraction Routes
 *
 * Server-side PDF text extraction with quality analysis.
 * Uses pdf-parse with optimized settings for better text reconstruction.
 */

import { Router, Request, Response } from 'express'
import multer from 'multer'
import pdfParse from 'pdf-parse'

const router = Router()

// Configure multer for PDF uploads (memory storage, 50MB limit)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
    files: 1,
  },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.toLowerCase().endsWith('.pdf')) {
      cb(null, true)
    } else {
      cb(new Error('Only PDF files are allowed'))
    }
  },
})

// ============================================================================
// TYPES
// ============================================================================

interface TextQualityMetrics {
  singleCharRatio: number
  controlCharRatio: number
  highAsciiRatio: number
  barcodePatternCount: number
  averageWordLength: number
  turkishTermsFound: number
  qualityScore: number
  qualityOk: boolean
  issues: string[]
}

interface NoiseStrippingResult {
  text: string
  linesRemoved: number
  charsRemoved: number
  noiseTypes: string[]
}

interface PDFExtractionResult {
  success: true
  data: {
    text: string
    cleanedText: string
    pageCount: number
    metadata: {
      title?: string
      author?: string
      creationDate?: string
    }
    quality: TextQualityMetrics
    cleaning: NoiseStrippingResult
  }
}

interface PDFExtractionError {
  success: false
  error: {
    code: string
    message: string
  }
}

// ============================================================================
// QUALITY ANALYSIS
// ============================================================================

// Turkish insurance terms for quality validation
const TURKISH_INSURANCE_TERMS = [
  'sigorta', 'poliçe', 'prim', 'teminat', 'muafiyet',
  'sigortalı', 'sigortacı', 'kasko', 'trafik', 'sağlık',
  'yangın', 'deprem', 'dask', 'hayat', 'kaza',
  'hasar', 'tazminat', 'riziko', 'ferdi', 'konut',
  'işyeri', 'nakliyat', 'sorumluluk', 'kloz', 'zeyilname',
  'tarih', 'numara', 'adres', 'telefon', 'kimlik',
  'başlangıç', 'bitiş', 'tutar', 'toplam', 'genel',
]

// Patterns indicating barcode/QR noise
const BARCODE_PATTERNS = [
  /\^{3,}/g,
  /[!@#$%^&*]{4,}/g,
  /[\x00-\x1F\x7F-\x9F]{2,}/g,
  /(.)\1{5,}/g,
  /[B♠♣♦♥█▀▄░▒▓]{3,}/gi,
]

function analyzeTextQuality(text: string): TextQualityMetrics {
  const issues: string[] = []

  if (!text || text.length === 0) {
    return {
      singleCharRatio: 1,
      controlCharRatio: 0,
      highAsciiRatio: 0,
      barcodePatternCount: 0,
      averageWordLength: 0,
      turkishTermsFound: 0,
      qualityScore: 0,
      qualityOk: false,
      issues: ['Empty text'],
    }
  }

  // Calculate single character ratio
  const tokens = text.split(/\s+/).filter(t => t.length > 0)
  const singleCharTokens = tokens.filter(t => t.length === 1 && /[a-zA-ZçğıöşüÇĞİÖŞÜ0-9]/.test(t))
  const singleCharRatio = tokens.length > 0 ? singleCharTokens.length / tokens.length : 0

  if (singleCharRatio > 0.15) {
    issues.push(`High single-char ratio: ${(singleCharRatio * 100).toFixed(1)}% (glyph splitting detected)`)
  }

  // Calculate control character ratio
  const controlChars = text.match(/[\x00-\x1F\x7F-\x9F]/g) || []
  const controlCharRatio = controlChars.length / text.length

  if (controlCharRatio > 0.02) {
    issues.push(`High control char ratio: ${(controlCharRatio * 100).toFixed(1)}%`)
  }

  // Calculate high-ASCII ratio (potential encoding issues)
  const highAsciiChars = text.match(/[\x80-\xFF]/g) || []
  const turkishHighAscii = text.match(/[çğıöşüÇĞİÖŞÜ]/g) || []
  const nonTurkishHighAscii = highAsciiChars.length - turkishHighAscii.length
  const highAsciiRatio = Math.max(0, nonTurkishHighAscii) / text.length

  if (highAsciiRatio > 0.05) {
    issues.push(`High non-Turkish high-ASCII ratio: ${(highAsciiRatio * 100).toFixed(1)}%`)
  }

  // Count barcode patterns
  let barcodePatternCount = 0
  for (const pattern of BARCODE_PATTERNS) {
    const matches = text.match(pattern) || []
    if (pattern.source.includes('\\1{5,}')) {
      const filtered = matches.filter(m => !/^[\s\n]+$/.test(m))
      barcodePatternCount += filtered.length
    } else {
      barcodePatternCount += matches.length
    }
  }

  if (barcodePatternCount > 3) {
    issues.push(`Barcode/noise patterns detected: ${barcodePatternCount}`)
  }

  // Calculate average word length
  const words = tokens.filter(t => t.length > 1)
  const totalWordLength = words.reduce((sum, w) => sum + w.length, 0)
  const averageWordLength = words.length > 0 ? totalWordLength / words.length : 0

  if (averageWordLength < 3 && words.length > 10) {
    issues.push(`Low average word length: ${averageWordLength.toFixed(1)} (possible splitting)`)
  }

  // Count Turkish insurance terms
  const lowerText = text.toLowerCase()
  const turkishTermsFound = TURKISH_INSURANCE_TERMS.filter(term =>
    lowerText.includes(term)
  ).length

  if (turkishTermsFound < 3 && text.length > 500) {
    issues.push(`Few Turkish insurance terms found: ${turkishTermsFound}`)
  }

  // Calculate overall quality score (0-100)
  let qualityScore = 100
  qualityScore -= Math.min(40, singleCharRatio * 200)
  qualityScore -= Math.min(20, controlCharRatio * 500)
  qualityScore -= Math.min(15, highAsciiRatio * 200)
  qualityScore -= Math.min(15, barcodePatternCount * 3)
  qualityScore += Math.min(10, turkishTermsFound * 2)
  if (averageWordLength < 4) {
    qualityScore -= Math.min(10, (4 - averageWordLength) * 5)
  }
  qualityScore = Math.max(0, Math.min(100, qualityScore))

  const qualityOk = qualityScore >= 60 && singleCharRatio < 0.15 && controlCharRatio < 0.05

  return {
    singleCharRatio,
    controlCharRatio,
    highAsciiRatio,
    barcodePatternCount,
    averageWordLength,
    turkishTermsFound,
    qualityScore,
    qualityOk,
    issues,
  }
}

// ============================================================================
// NOISE STRIPPING
// ============================================================================

function stripBarcodeNoise(text: string): NoiseStrippingResult {
  const originalLength = text.length
  const originalLines = text.split('\n')
  const noiseTypes = new Set<string>()
  const cleanLines: string[] = []

  for (const line of originalLines) {
    const trimmedLine = line.trim()

    if (trimmedLine.length === 0) {
      if (cleanLines.length > 0 && cleanLines[cleanLines.length - 1].trim().length > 0) {
        cleanLines.push('')
      }
      continue
    }

    const printableChars = trimmedLine.replace(/[^\x20-\x7E\u00A0-\u00FF\u0100-\u017F\u0180-\u024F]/g, '')
    const printableRatio = printableChars.length / trimmedLine.length

    if (printableRatio < 0.7 && trimmedLine.length > 3) {
      noiseTypes.add('non-printable')
      continue
    }

    if (/\^{3,}/.test(trimmedLine)) {
      noiseTypes.add('caret-sequence')
      continue
    }

    if (/^[!@#$%^&*()_+=\[\]{}|\\:;"'<>,.?\/~`\s]+$/.test(trimmedLine)) {
      noiseTypes.add('special-chars-only')
      continue
    }

    if (/[♠♣♦♥█▀▄░▒▓]{2,}/.test(trimmedLine)) {
      noiseTypes.add('block-chars')
      continue
    }

    if (/(.)\1{7,}/.test(trimmedLine) && trimmedLine.length > 10) {
      noiseTypes.add('repetitive')
      continue
    }

    let cleanedLine = trimmedLine
    cleanedLine = cleanedLine.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '')
    cleanedLine = cleanedLine.replace(/\^+/g, '')
    cleanedLine = cleanedLine.replace(/\s{3,}/g, '  ')

    if (cleanedLine.trim().length > 0) {
      cleanLines.push(cleanedLine)
    }
  }

  const cleanedText = cleanLines.join('\n')

  return {
    text: cleanedText,
    linesRemoved: originalLines.length - cleanLines.filter(l => l.length > 0 || l === '').length,
    charsRemoved: originalLength - cleanedText.length,
    noiseTypes: Array.from(noiseTypes),
  }
}

// Common Turkish word splits to fix
const TURKISH_WORD_FIXES: [RegExp, string][] = [
  [/S\s*İ\s*G\s*O\s*R\s*T\s*A/gi, 'SİGORTA'],
  [/P\s*O\s*L\s*İ\s*Ç\s*E/gi, 'POLİÇE'],
  [/K\s*A\s*S\s*K\s*O/gi, 'KASKO'],
  [/T\s*R\s*A\s*F\s*İ\s*K/gi, 'TRAFİK'],
  [/T\s*E\s*M\s*İ\s*N\s*A\s*T/gi, 'TEMİNAT'],
  [/P\s*R\s*İ\s*M/gi, 'PRİM'],
  [/M\s*U\s*A\s*F\s*İ\s*Y\s*E\s*T/gi, 'MUAFİYET'],
  [/H\s*A\s*S\s*A\s*R/gi, 'HASAR'],
  [/T\s*A\s*Z\s*M\s*İ\s*N\s*A\s*T/gi, 'TAZMİNAT'],
  [/B\s*İ\s*R\s*L\s*E\s*Ş\s*İ\s*K/gi, 'BİRLEŞİK'],
  [/G\s*E\s*N\s*İ\s*Ş\s*L\s*E\s*T\s*İ\s*L\s*M\s*İ\s*Ş/gi, 'GENİŞLETİLMİŞ'],
  [/A\s*N\s*A\s*D\s*O\s*L\s*U/gi, 'ANADOLU'],
]

function fixGlyphSplitTurkish(text: string): string {
  let result = text
  for (const [pattern, replacement] of TURKISH_WORD_FIXES) {
    result = result.replace(pattern, replacement)
  }
  return result
}

function cleanExtractedText(text: string): NoiseStrippingResult {
  const barcodeResult = stripBarcodeNoise(text)
  let cleanedText = barcodeResult.text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/[\x7F-\x9F]/g, '')

  cleanedText = fixGlyphSplitTurkish(cleanedText)
  cleanedText = cleanedText
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return {
    text: cleanedText,
    linesRemoved: barcodeResult.linesRemoved,
    charsRemoved: text.length - cleanedText.length,
    noiseTypes: barcodeResult.noiseTypes,
  }
}

// ============================================================================
// CUSTOM PDF RENDER PAGE
// ============================================================================

/**
 * Custom page render function for pdf-parse that preserves word boundaries
 * Uses text item positions to detect word/line breaks
 */
function customRenderPage(pageData: {
  getTextContent: (options?: { normalizeWhitespace?: boolean }) => Promise<{
    items: Array<{
      str: string
      dir: string
      width: number
      height: number
      transform: number[]
    }>
  }>
}): Promise<string> {
  return pageData.getTextContent({ normalizeWhitespace: false })
    .then((textContent) => {
      const items = textContent.items

      if (items.length === 0) {
        return ''
      }

      // Group text items by their Y position (same line)
      const lines: Map<number, Array<{ x: number, str: string, width: number }>> = new Map()

      for (const item of items) {
        if (!item.str || item.str.length === 0) continue

        // Transform[4] is X position, Transform[5] is Y position
        const y = Math.round(item.transform[5])
        const x = item.transform[4]
        const width = item.width

        if (!lines.has(y)) {
          lines.set(y, [])
        }
        lines.get(y)!.push({ x, str: item.str, width })
      }

      // Sort lines by Y position (descending for PDF coordinate system)
      const sortedYPositions = Array.from(lines.keys()).sort((a, b) => b - a)

      const reconstructedLines: string[] = []

      for (const y of sortedYPositions) {
        const lineItems = lines.get(y)!
        // Sort items by X position
        lineItems.sort((a, b) => a.x - b.x)

        // Reconstruct line with intelligent spacing
        let lineText = ''
        let lastX = -Infinity
        let lastWidth = 0

        for (const item of lineItems) {
          const gap = item.x - (lastX + lastWidth)

          // If there's a significant gap, add a space
          // Threshold: if gap > 2 * average character width, add space
          const avgCharWidth = lastWidth / Math.max(1, lineText.length) || 5
          if (lineText.length > 0 && gap > avgCharWidth * 0.5) {
            lineText += ' '
          }

          lineText += item.str
          lastX = item.x
          lastWidth = item.width
        }

        if (lineText.trim().length > 0) {
          reconstructedLines.push(lineText.trim())
        }
      }

      return reconstructedLines.join('\n')
    })
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * POST /api/pdf/extract
 * Extract text from uploaded PDF with quality analysis
 */
router.post('/extract', upload.single('file'), async (
  req: Request,
  res: Response<PDFExtractionResult | PDFExtractionError>
): Promise<void> => {
  try {
    const file = req.file

    if (!file) {
      res.status(400).json({
        success: false,
        error: {
          code: 'NO_FILE',
          message: 'No PDF file uploaded',
        },
      })
      return
    }

    // Parse PDF with custom render page for better text reconstruction
    const pdfData = await pdfParse(file.buffer, {
      pagerender: customRenderPage,
    })

    const rawText = pdfData.text

    // Check if text is too short (likely scanned/image PDF)
    if (rawText.length < 100) {
      res.status(200).json({
        success: false,
        error: {
          code: 'LOW_TEXT_CONTENT',
          message: 'PDF appears to be scanned or image-based. OCR processing recommended.',
        },
      })
      return
    }

    // Analyze quality
    const quality = analyzeTextQuality(rawText)

    // Clean the text
    const cleaning = cleanExtractedText(rawText)

    res.json({
      success: true,
      data: {
        text: rawText,
        cleanedText: cleaning.text,
        pageCount: pdfData.numpages,
        metadata: {
          title: pdfData.info?.Title,
          author: pdfData.info?.Author,
          creationDate: pdfData.info?.CreationDate,
        },
        quality,
        cleaning,
      },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    console.error('[PDF Extract] Error:', errorMessage)

    if (errorMessage.includes('password')) {
      res.status(400).json({
        success: false,
        error: {
          code: 'PASSWORD_PROTECTED',
          message: 'PDF is password protected',
        },
      })
      return
    }

    if (errorMessage.includes('Invalid PDF')) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_PDF',
          message: 'File does not appear to be a valid PDF',
        },
      })
      return
    }

    res.status(500).json({
      success: false,
      error: {
        code: 'PARSE_ERROR',
        message: `Failed to parse PDF: ${errorMessage}`,
      },
    })
  }
})

/**
 * POST /api/pdf/analyze
 * Analyze text quality without full extraction (for pre-extracted text)
 */
router.post('/analyze', async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { text } = req.body

    if (!text || typeof text !== 'string') {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_INPUT',
          message: 'Text field is required',
        },
      })
      return
    }

    const quality = analyzeTextQuality(text)
    const cleaning = cleanExtractedText(text)

    res.json({
      success: true,
      data: {
        quality,
        cleaning,
      },
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    res.status(500).json({
      success: false,
      error: {
        code: 'ANALYSIS_ERROR',
        message: errorMessage,
      },
    })
  }
})

/**
 * GET /api/pdf/health
 * Health check for PDF extraction service
 */
router.get('/health', (_req: Request, res: Response): void => {
  res.json({
    success: true,
    service: 'pdf-extraction',
    backend: 'pdf-parse',
    features: ['text-extraction', 'quality-analysis', 'noise-stripping', 'turkish-term-detection'],
  })
})

export default router
