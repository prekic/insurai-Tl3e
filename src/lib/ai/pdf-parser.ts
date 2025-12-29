import * as pdfjsLib from 'pdfjs-dist'

// Configure PDF.js worker
// Using CDN for worker to avoid bundling issues
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`

export interface PDFParseResult {
  text: string
  pageCount: number
  metadata: {
    title?: string
    author?: string
    creationDate?: string
  }
}

export interface PDFParseError {
  code: 'INVALID_PDF' | 'EMPTY_PDF' | 'PARSE_ERROR' | 'PASSWORD_PROTECTED'
  message: string
}

/**
 * Extract text content from a PDF file
 */
export async function extractTextFromPDF(
  file: File
): Promise<{ success: true; data: PDFParseResult } | { success: false; error: PDFParseError }> {
  try {
    // Read file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer()

    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({
      data: arrayBuffer,
      useSystemFonts: true,
    })

    const pdf = await loadingTask.promise

    // Check for empty PDF
    if (pdf.numPages === 0) {
      return {
        success: false,
        error: {
          code: 'EMPTY_PDF',
          message: 'The PDF file appears to be empty',
        },
      }
    }

    // Extract text from all pages
    const textContent: string[] = []

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum)
      const content = await page.getTextContent()

      // Join text items with proper spacing
      const pageText = content.items
        .map((item) => {
          if ('str' in item) {
            return item.str
          }
          return ''
        })
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim()

      textContent.push(pageText)
    }

    // Get metadata
    const metadata = await pdf.getMetadata().catch(() => null)
    const info = metadata?.info as Record<string, unknown> | undefined

    const fullText = textContent.join('\n\n')

    // Check if we extracted any meaningful text
    if (fullText.length < 50) {
      return {
        success: false,
        error: {
          code: 'EMPTY_PDF',
          message: 'Could not extract meaningful text from the PDF. It may be a scanned document requiring OCR.',
        },
      }
    }

    return {
      success: true,
      data: {
        text: fullText,
        pageCount: pdf.numPages,
        metadata: {
          title: info?.Title as string | undefined,
          author: info?.Author as string | undefined,
          creationDate: info?.CreationDate as string | undefined,
        },
      },
    }
  } catch (error) {
    // Handle specific PDF.js errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'

    if (errorMessage.includes('password')) {
      return {
        success: false,
        error: {
          code: 'PASSWORD_PROTECTED',
          message: 'The PDF is password protected. Please provide an unprotected version.',
        },
      }
    }

    if (errorMessage.includes('Invalid PDF')) {
      return {
        success: false,
        error: {
          code: 'INVALID_PDF',
          message: 'The file does not appear to be a valid PDF document.',
        },
      }
    }

    return {
      success: false,
      error: {
        code: 'PARSE_ERROR',
        message: `Failed to parse PDF: ${errorMessage}`,
      },
    }
  }
}

/**
 * Check if a file is a PDF
 */
export function isPDFFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}
