/**
 * Document Chunker - Intelligent Document Splitting
 *
 * Splits documents for chunk-by-chunk processing:
 * 1. If page markers found (Sayfa : X/Y), split by pages
 * 2. Otherwise, split by size with overlap
 *
 * Chunk-based processing enables:
 * - Better QA gate granularity (re-run failing chunks only)
 * - Memory efficiency for large documents
 * - Parallel processing potential
 */

import { sanitizeOCRTextFull, type SanitizerResult } from './ocr-sanitizer'

// ============================================================================
// TYPES
// ============================================================================

export interface DocumentChunk {
  id: string // Unique identifier for this chunk
  index: number // Zero-based index
  text: string // Raw chunk text
  pageNumbers: number[] // Page numbers this chunk covers (if available)
  startOffset: number // Character offset from original document start
  endOffset: number // Character offset from original document end
  hasOverlap: boolean // Whether this chunk has overlap with previous/next
  overlapChars: number // Number of overlap characters
}

export interface ChunkingResult {
  chunks: DocumentChunk[]
  method: 'page_markers' | 'size_based' | 'single_chunk'
  totalChunks: number
  originalLength: number
  pageMarkersFound: number
  stats: {
    minChunkSize: number
    maxChunkSize: number
    avgChunkSize: number
  }
}

export interface ChunkingOptions {
  // Size-based chunking options
  targetChunkSize?: number // Target size (default: 8000 chars)
  minChunkSize?: number // Minimum chunk size (default: 6000 chars)
  maxChunkSize?: number // Maximum chunk size (default: 12000 chars)
  overlapSize?: number // Overlap between chunks (default: 300 chars)

  // Page marker patterns
  pageMarkerPatterns?: RegExp[]

  // Behavior options
  preferPageMarkers?: boolean // Prefer page markers over size (default: true)
  preserveParagraphs?: boolean // Try to break at paragraph boundaries (default: true)
}

export interface SanitizedChunk extends DocumentChunk {
  sanitizedText: string
  sanitizerResult: SanitizerResult
}

// ============================================================================
// CONSTANTS
// ============================================================================

const DEFAULT_OPTIONS: Required<ChunkingOptions> = {
  targetChunkSize: 8000,
  minChunkSize: 6000,
  maxChunkSize: 12000,
  overlapSize: 300,
  pageMarkerPatterns: [
    /Sayfa\s*:\s*(\d+)\s*\/\s*(\d+)/gi, // Sayfa : 1/5, Sayfa: 2/5
    /Sayfa\s+(\d+)\s*\/\s*(\d+)/gi, // Sayfa 1/5
    /Sf\.\s*(\d+)\s*\/\s*(\d+)/gi, // Sf. 1/5
    /\[Page\s*(\d+)\s*of\s*(\d+)\]/gi, // [Page 1 of 5]
    /---\s*Page\s*(\d+)\s*---/gi, // --- Page 1 ---
    /={3,}\s*(\d+)\s*={3,}/g, // === 1 ===
  ],
  preferPageMarkers: true,
  preserveParagraphs: true,
}

// Paragraph break patterns for smart splitting
const PARAGRAPH_BREAK_PATTERNS = [
  /\n\n+/, // Double newline
  /\n(?=[A-ZÇĞİÖŞÜ])/, // Newline followed by uppercase
  /\n(?=\d+[.)\-])/, // Newline followed by numbered list
  /\n(?=[\-•●○])/, // Newline followed by bullet
  /(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ])/, // Sentence end followed by capital
]

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Generate a unique chunk ID
 */
function generateChunkId(documentId: string, index: number): string {
  return `${documentId}_chunk_${index.toString().padStart(3, '0')}`
}

/**
 * Find all page markers in text
 */
function findPageMarkers(
  text: string,
  patterns: RegExp[]
): Array<{ index: number; pageNumber: number; totalPages: number; match: string }> {
  const markers: Array<{ index: number; pageNumber: number; totalPages: number; match: string }> =
    []

  for (const pattern of patterns) {
    // Reset lastIndex for each pattern
    pattern.lastIndex = 0

    let match
    while ((match = pattern.exec(text)) !== null) {
      const pageNumber = parseInt(match[1], 10)
      const totalPages = match[2] ? parseInt(match[2], 10) : pageNumber

      markers.push({
        index: match.index,
        pageNumber,
        totalPages,
        match: match[0],
      })
    }
  }

  // Sort by position and deduplicate
  markers.sort((a, b) => a.index - b.index)

  // Remove duplicates at same position
  const unique: typeof markers = []
  for (const marker of markers) {
    if (unique.length === 0 || unique[unique.length - 1].index !== marker.index) {
      unique.push(marker)
    }
  }

  return unique
}

/**
 * Find the best break point near a target position
 */
function findBestBreakPoint(
  text: string,
  targetPosition: number,
  minPosition: number,
  maxPosition: number,
  preserveParagraphs: boolean
): number {
  // Clamp target within bounds
  targetPosition = Math.max(minPosition, Math.min(maxPosition, targetPosition))

  if (!preserveParagraphs) {
    return targetPosition
  }

  // Search window around target
  const searchStart = Math.max(minPosition, targetPosition - 500)
  const searchEnd = Math.min(maxPosition, targetPosition + 500)
  const searchText = text.slice(searchStart, searchEnd)

  let bestBreak = targetPosition
  let bestDistance = Infinity

  // Look for paragraph breaks
  for (const pattern of PARAGRAPH_BREAK_PATTERNS) {
    const regex = new RegExp(pattern.source, 'g')
    let match

    while ((match = regex.exec(searchText)) !== null) {
      const absolutePosition = searchStart + match.index + match[0].length
      const distance = Math.abs(absolutePosition - targetPosition)

      if (distance < bestDistance && absolutePosition >= minPosition && absolutePosition <= maxPosition) {
        bestBreak = absolutePosition
        bestDistance = distance
      }
    }
  }

  return bestBreak
}

// ============================================================================
// CHUNKING FUNCTIONS
// ============================================================================

/**
 * Split document by page markers
 */
function chunkByPageMarkers(
  text: string,
  markers: Array<{ index: number; pageNumber: number; totalPages: number; match: string }>,
  documentId: string
): DocumentChunk[] {
  const chunks: DocumentChunk[] = []

  if (markers.length === 0) {
    return []
  }

  // Add virtual marker at end
  const allMarkers = [...markers, { index: text.length, pageNumber: -1, totalPages: -1, match: '' }]

  for (let i = 0; i < allMarkers.length - 1; i++) {
    const start = i === 0 ? 0 : allMarkers[i].index
    const end = allMarkers[i + 1].index
    const chunkText = text.slice(start, end).trim()

    if (chunkText.length > 0) {
      chunks.push({
        id: generateChunkId(documentId, chunks.length),
        index: chunks.length,
        text: chunkText,
        pageNumbers: [allMarkers[i].pageNumber],
        startOffset: start,
        endOffset: end,
        hasOverlap: false,
        overlapChars: 0,
      })
    }
  }

  return chunks
}

/**
 * Split document by size with overlap
 */
function chunkBySize(
  text: string,
  documentId: string,
  options: Required<ChunkingOptions>
): DocumentChunk[] {
  const chunks: DocumentChunk[] = []
  const { targetChunkSize, minChunkSize, maxChunkSize, overlapSize, preserveParagraphs } = options

  // If document is small enough, return as single chunk
  if (text.length <= maxChunkSize) {
    return [
      {
        id: generateChunkId(documentId, 0),
        index: 0,
        text: text.trim(),
        pageNumbers: [],
        startOffset: 0,
        endOffset: text.length,
        hasOverlap: false,
        overlapChars: 0,
      },
    ]
  }

  let currentPosition = 0

  while (currentPosition < text.length) {
    // Calculate target end position
    const targetEnd = currentPosition + targetChunkSize

    // Find best break point
    const breakPoint = findBestBreakPoint(
      text,
      targetEnd,
      currentPosition + minChunkSize,
      Math.min(currentPosition + maxChunkSize, text.length),
      preserveParagraphs
    )

    // Handle case where we couldn't find a break point
    const actualEnd = breakPoint > currentPosition ? breakPoint : Math.min(currentPosition + maxChunkSize, text.length)

    // Extract chunk text
    const chunkText = text.slice(currentPosition, actualEnd).trim()

    if (chunkText.length > 0) {
      chunks.push({
        id: generateChunkId(documentId, chunks.length),
        index: chunks.length,
        text: chunkText,
        pageNumbers: [],
        startOffset: currentPosition,
        endOffset: actualEnd,
        hasOverlap: currentPosition > 0,
        overlapChars: currentPosition > 0 ? overlapSize : 0,
      })
    }

    // Move to next chunk, accounting for overlap
    currentPosition = Math.max(currentPosition + 1, actualEnd - overlapSize)

    // Prevent infinite loop
    if (currentPosition >= text.length - 100) {
      break
    }
  }

  // Handle remaining text
  if (currentPosition < text.length) {
    const remainingText = text.slice(currentPosition).trim()
    if (remainingText.length > 0) {
      // If remaining is small, append to last chunk
      if (remainingText.length < minChunkSize / 2 && chunks.length > 0) {
        const lastChunk = chunks[chunks.length - 1]
        lastChunk.text = text.slice(lastChunk.startOffset, text.length).trim()
        lastChunk.endOffset = text.length
      } else {
        chunks.push({
          id: generateChunkId(documentId, chunks.length),
          index: chunks.length,
          text: remainingText,
          pageNumbers: [],
          startOffset: currentPosition,
          endOffset: text.length,
          hasOverlap: true,
          overlapChars: overlapSize,
        })
      }
    }
  }

  return chunks
}

// ============================================================================
// MAIN CHUNKING FUNCTION
// ============================================================================

/**
 * Chunk a document for processing
 *
 * @param text - The document text to chunk
 * @param documentId - Unique identifier for the document (used in chunk IDs)
 * @param options - Chunking options
 */
export function chunkDocument(
  text: string,
  documentId: string = 'doc',
  options: ChunkingOptions = {}
): ChunkingResult {
  const opts: Required<ChunkingOptions> = { ...DEFAULT_OPTIONS, ...options }
  const originalLength = text.length

  // Empty or very short documents
  if (text.length === 0) {
    return {
      chunks: [],
      method: 'single_chunk',
      totalChunks: 0,
      originalLength: 0,
      pageMarkersFound: 0,
      stats: { minChunkSize: 0, maxChunkSize: 0, avgChunkSize: 0 },
    }
  }

  // Find page markers
  const pageMarkers = findPageMarkers(text, opts.pageMarkerPatterns)

  let chunks: DocumentChunk[]
  let method: ChunkingResult['method']

  // Decide chunking method
  if (opts.preferPageMarkers && pageMarkers.length >= 2) {
    // Use page markers if we found at least 2
    chunks = chunkByPageMarkers(text, pageMarkers, documentId)
    method = 'page_markers'

    // If page marker chunking produced too large chunks, re-chunk by size
    const maxChunkFound = Math.max(...chunks.map(c => c.text.length), 0)
    if (maxChunkFound > opts.maxChunkSize * 1.5) {
      // Re-chunk large page chunks by size
      const rechunked: DocumentChunk[] = []
      for (const chunk of chunks) {
        if (chunk.text.length > opts.maxChunkSize) {
          const subChunks = chunkBySize(chunk.text, `${documentId}_p${chunk.pageNumbers[0]}`, opts)
          for (const subChunk of subChunks) {
            rechunked.push({
              ...subChunk,
              id: generateChunkId(documentId, rechunked.length),
              index: rechunked.length,
              pageNumbers: chunk.pageNumbers,
              startOffset: chunk.startOffset + subChunk.startOffset,
              endOffset: chunk.startOffset + subChunk.endOffset,
            })
          }
        } else {
          rechunked.push({
            ...chunk,
            id: generateChunkId(documentId, rechunked.length),
            index: rechunked.length,
          })
        }
      }
      chunks = rechunked
    }
  } else if (text.length <= opts.maxChunkSize) {
    // Small document - single chunk
    chunks = [
      {
        id: generateChunkId(documentId, 0),
        index: 0,
        text: text.trim(),
        pageNumbers: [],
        startOffset: 0,
        endOffset: text.length,
        hasOverlap: false,
        overlapChars: 0,
      },
    ]
    method = 'single_chunk'
  } else {
    // Size-based chunking
    chunks = chunkBySize(text, documentId, opts)
    method = 'size_based'
  }

  // Calculate stats
  const chunkSizes = chunks.map(c => c.text.length)
  const stats = {
    minChunkSize: chunkSizes.length > 0 ? Math.min(...chunkSizes) : 0,
    maxChunkSize: chunkSizes.length > 0 ? Math.max(...chunkSizes) : 0,
    avgChunkSize: chunkSizes.length > 0 ? Math.round(chunkSizes.reduce((a, b) => a + b, 0) / chunkSizes.length) : 0,
  }

  return {
    chunks,
    method,
    totalChunks: chunks.length,
    originalLength,
    pageMarkersFound: pageMarkers.length,
    stats,
  }
}

// ============================================================================
// CHUNK PROCESSING FUNCTIONS
// ============================================================================

/**
 * Sanitize a single chunk
 */
export function sanitizeChunk(chunk: DocumentChunk): SanitizedChunk {
  const result = sanitizeOCRTextFull(chunk.text)

  return {
    ...chunk,
    sanitizedText: result.text,
    sanitizerResult: result,
  }
}

/**
 * Sanitize all chunks in a document
 */
export function sanitizeAllChunks(chunks: DocumentChunk[]): SanitizedChunk[] {
  return chunks.map(sanitizeChunk)
}

/**
 * Merge sanitized chunks back into a single document
 *
 * Handles overlap by preferring the later chunk's version
 * (which typically has better context)
 */
export function mergeChunks(chunks: SanitizedChunk[]): string {
  if (chunks.length === 0) return ''
  if (chunks.length === 1) return chunks[0].sanitizedText

  // Sort by index
  const sorted = [...chunks].sort((a, b) => a.index - b.index)

  let result = sorted[0].sanitizedText

  for (let i = 1; i < sorted.length; i++) {
    const chunk = sorted[i]

    if (chunk.hasOverlap && chunk.overlapChars > 0) {
      // Find overlap region and merge
      const overlapText = findOverlapMergePoint(result, chunk.sanitizedText, chunk.overlapChars)
      result = overlapText
    } else {
      // No overlap - simple concatenation with separator
      result = result.trimEnd() + '\n\n' + chunk.sanitizedText.trimStart()
    }
  }

  return result.trim()
}

/**
 * Find the best merge point for overlapping chunks
 */
function findOverlapMergePoint(
  previousText: string,
  currentText: string,
  expectedOverlap: number
): string {
  // Take end of previous text
  const searchWindow = Math.min(expectedOverlap * 2, previousText.length, 1000)
  const prevEnd = previousText.slice(-searchWindow)

  // Take start of current text
  const currentStart = currentText.slice(0, searchWindow)

  // Find longest common substring
  let bestMatch = { length: 0, prevIndex: -1, currIndex: -1 }

  for (let len = Math.min(100, searchWindow); len >= 20; len--) {
    for (let i = 0; i <= prevEnd.length - len; i++) {
      const substring = prevEnd.slice(i, i + len)
      const currIndex = currentStart.indexOf(substring)

      if (currIndex !== -1 && len > bestMatch.length) {
        bestMatch = {
          length: len,
          prevIndex: previousText.length - searchWindow + i,
          currIndex,
        }
        break
      }
    }

    if (bestMatch.length >= 50) break
  }

  if (bestMatch.length >= 20) {
    // Merge at the overlap point
    return (
      previousText.slice(0, bestMatch.prevIndex) + currentText.slice(bestMatch.currIndex)
    )
  }

  // Fallback: simple concatenation
  return previousText.trimEnd() + '\n\n' + currentText.trimStart()
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get chunk statistics for a document
 */
export function getChunkingStats(text: string, options: ChunkingOptions = {}): {
  estimatedChunks: number
  hasPageMarkers: boolean
  pageMarkerCount: number
  recommendedMethod: ChunkingResult['method']
} {
  const opts: Required<ChunkingOptions> = { ...DEFAULT_OPTIONS, ...options }
  const pageMarkers = findPageMarkers(text, opts.pageMarkerPatterns)

  const hasPageMarkers = pageMarkers.length >= 2
  let estimatedChunks: number
  let recommendedMethod: ChunkingResult['method']

  if (text.length <= opts.maxChunkSize) {
    estimatedChunks = 1
    recommendedMethod = 'single_chunk'
  } else if (hasPageMarkers && opts.preferPageMarkers) {
    estimatedChunks = pageMarkers.length
    recommendedMethod = 'page_markers'
  } else {
    estimatedChunks = Math.ceil(text.length / (opts.targetChunkSize - opts.overlapSize))
    recommendedMethod = 'size_based'
  }

  return {
    estimatedChunks,
    hasPageMarkers,
    pageMarkerCount: pageMarkers.length,
    recommendedMethod,
  }
}

/**
 * Validate chunk coverage - ensure no text is lost
 */
export function validateChunkCoverage(
  originalText: string,
  chunks: DocumentChunk[]
): { valid: boolean; issues: string[] } {
  const issues: string[] = []

  if (chunks.length === 0) {
    if (originalText.trim().length > 0) {
      issues.push('No chunks produced for non-empty text')
    }
    return { valid: issues.length === 0, issues }
  }

  // Check that chunks cover the entire document
  const sortedChunks = [...chunks].sort((a, b) => a.startOffset - b.startOffset)

  // Check first chunk starts at 0
  if (sortedChunks[0].startOffset > 100) {
    issues.push(`First chunk starts at offset ${sortedChunks[0].startOffset}, may be missing text`)
  }

  // Check last chunk ends near document end
  const lastChunk = sortedChunks[sortedChunks.length - 1]
  if (originalText.length - lastChunk.endOffset > 100) {
    issues.push(`Last chunk ends at ${lastChunk.endOffset}, document length is ${originalText.length}`)
  }

  // Check for gaps between chunks (accounting for overlap)
  for (let i = 1; i < sortedChunks.length; i++) {
    const prev = sortedChunks[i - 1]
    const curr = sortedChunks[i]

    const gap = curr.startOffset - prev.endOffset
    if (gap > 100) {
      issues.push(`Gap of ${gap} chars between chunks ${prev.index} and ${curr.index}`)
    }
  }

  return { valid: issues.length === 0, issues }
}
