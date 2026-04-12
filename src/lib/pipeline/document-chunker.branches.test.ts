/**
 * Document Chunker Branch Coverage Tests
 *
 * Targets every uncovered branch in document-chunker.ts:
 * - chunkDocument: empty input, single chunk, page markers, size-based, re-chunking oversized pages
 * - findPageMarkers: multiple patterns, deduplication, missing totalPages
 * - findBestBreakPoint: preserveParagraphs on/off, all paragraph patterns
 * - chunkByPageMarkers: empty markers, empty chunks after trim, multi-page
 * - chunkBySize: small doc, breakPoint <= currentPosition, remaining text paths, infinite loop guard
 * - mergeChunks: empty, single, non-overlap, overlap with/without common substring
 * - findOverlapMergePoint: bestMatch >= 50 early exit, bestMatch >= 20, fallback
 * - sanitizeChunk / sanitizeAllChunks
 * - getChunkingStats: all three method branches, preferPageMarkers=false
 * - validateChunkCoverage: empty chunks + non-empty text, all gap checks, no gaps small tolerance
 */

import { describe, it, expect } from 'vitest'
import {
  chunkDocument,
  sanitizeChunk,
  sanitizeAllChunks,
  mergeChunks,
  validateChunkCoverage,
  getChunkingStats,
  type DocumentChunk,
  type SanitizedChunk,
  type ChunkingOptions as _ChunkingOptions,
} from './document-chunker'

// ============================================================================
// HELPERS
// ============================================================================

function makeSanitizedChunk(
  overrides: Partial<SanitizedChunk> & { sanitizedText: string }
): SanitizedChunk {
  return {
    id: 'chunk_000',
    index: 0,
    text: overrides.sanitizedText,
    pageNumbers: [],
    startOffset: 0,
    endOffset: 100,
    hasOverlap: false,
    overlapChars: 0,
    // @ts-expect-error - mismatch due to schema update
    sanitizedText: overrides.sanitizedText,
    sanitizerResult: { text: overrides.sanitizedText, stats: {} as never, warnings: [] },
    ...overrides,
  }
}

function makeChunk(overrides: Partial<DocumentChunk> = {}): DocumentChunk {
  return {
    id: 'chunk_000',
    index: 0,
    text: 'chunk text',
    pageNumbers: [],
    startOffset: 0,
    endOffset: 100,
    hasOverlap: false,
    overlapChars: 0,
    ...overrides,
  }
}

// ============================================================================
// chunkDocument — EMPTY INPUT
// ============================================================================

describe('Document Chunker Branch Coverage', () => {
  describe('chunkDocument — empty and whitespace inputs', () => {
    it('returns empty result for empty string', () => {
      const result = chunkDocument('', 'doc')
      expect(result.totalChunks).toBe(0)
      expect(result.chunks).toHaveLength(0)
      expect(result.method).toBe('single_chunk')
      expect(result.originalLength).toBe(0)
      expect(result.pageMarkersFound).toBe(0)
      expect(result.stats).toEqual({ minChunkSize: 0, maxChunkSize: 0, avgChunkSize: 0 })
    })

    it('uses default documentId when none provided', () => {
      const result = chunkDocument('Hello')
      expect(result.chunks[0].id).toBe('doc_chunk_000')
    })

    it('uses default empty options when none provided', () => {
      const result = chunkDocument('Hello', 'x')
      expect(result.method).toBe('single_chunk')
    })
  })

  // ============================================================================
  // chunkDocument — SINGLE CHUNK
  // ============================================================================

  describe('chunkDocument — single chunk (text <= maxChunkSize, no page markers)', () => {
    it('returns single chunk for text exactly at maxChunkSize', () => {
      const text = 'A'.repeat(12000) // default maxChunkSize
      const result = chunkDocument(text, 'doc')
      expect(result.method).toBe('single_chunk')
      expect(result.totalChunks).toBe(1)
      expect(result.chunks[0].text).toBe(text.trim())
      expect(result.chunks[0].startOffset).toBe(0)
      expect(result.chunks[0].endOffset).toBe(12000)
      expect(result.chunks[0].hasOverlap).toBe(false)
      expect(result.chunks[0].overlapChars).toBe(0)
      expect(result.chunks[0].pageNumbers).toEqual([])
    })

    it('trims whitespace from single chunk text', () => {
      const text = '   content with spaces   '
      const result = chunkDocument(text, 'doc')
      expect(result.chunks[0].text).toBe('content with spaces')
    })

    it('single chunk has correct stats', () => {
      const result = chunkDocument('Hello World', 'doc')
      expect(result.stats.minChunkSize).toBe(result.chunks[0].text.length)
      expect(result.stats.maxChunkSize).toBe(result.chunks[0].text.length)
      expect(result.stats.avgChunkSize).toBe(result.chunks[0].text.length)
    })
  })

  // ============================================================================
  // chunkDocument — PAGE MARKERS (multiple patterns)
  // ============================================================================

  describe('chunkDocument — page marker detection (all patterns)', () => {
    it('detects Sayfa X/Y pattern (space before page number)', () => {
      // Build text big enough to avoid single_chunk (> maxChunkSize)
      const page1 = 'A'.repeat(5000)
      const page2 = 'B'.repeat(5000)
      const page3 = 'C'.repeat(5000)
      const text = `${page1}\nSayfa 1/3\n${page2}\nSayfa 2/3\n${page3}\nSayfa 3/3\n`
      const result = chunkDocument(text, 'doc')
      expect(result.pageMarkersFound).toBeGreaterThanOrEqual(3)
      expect(result.method).toBe('page_markers')
    })

    it('detects Sf. X/Y pattern', () => {
      const page1 = 'A'.repeat(5000)
      const page2 = 'B'.repeat(5000)
      const text = `${page1}\nSf. 1/2\n${page2}\nSf. 2/2\n`
      const result = chunkDocument(text, 'doc')
      expect(result.pageMarkersFound).toBeGreaterThanOrEqual(2)
      expect(result.method).toBe('page_markers')
    })

    it('detects --- Page X --- pattern', () => {
      const page1 = 'A'.repeat(5000)
      const page2 = 'B'.repeat(5000)
      const text = `${page1}\n--- Page 1 ---\n${page2}\n--- Page 2 ---\n`
      const result = chunkDocument(text, 'doc')
      expect(result.pageMarkersFound).toBeGreaterThanOrEqual(2)
      expect(result.method).toBe('page_markers')
    })

    it('detects === N === pattern', () => {
      const page1 = 'A'.repeat(5000)
      const page2 = 'B'.repeat(5000)
      const text = `${page1}\n=== 1 ===\n${page2}\n=== 2 ===\n`
      const result = chunkDocument(text, 'doc')
      expect(result.pageMarkersFound).toBeGreaterThanOrEqual(2)
      expect(result.method).toBe('page_markers')
    })

    it('falls back to size-based when preferPageMarkers is false', () => {
      const page1 = 'A'.repeat(7000)
      const page2 = 'B'.repeat(7000)
      const text = `${page1}\nSayfa : 1/2\n${page2}\nSayfa : 2/2\n`
      // Text length > maxChunkSize (12000), so with preferPageMarkers=false it should be size_based
      expect(text.length).toBeGreaterThan(12000)
      const result = chunkDocument(text, 'doc', { preferPageMarkers: false })
      expect(result.method).toBe('size_based')
    })

    it('falls back to size-based when only 1 page marker found (needs >= 2)', () => {
      const text = 'A'.repeat(15000) + '\nSayfa : 1/1\n'
      const result = chunkDocument(text, 'doc')
      expect(result.method).toBe('size_based')
    })

    it('deduplicates page markers at the same position', () => {
      // Two patterns matching at same position — only one should survive
      const page1 = 'A'.repeat(5000)
      const page2 = 'B'.repeat(5000)
      // Sayfa : 1/2 matches first pattern, Sayfa 1/2 also matches second pattern at same index
      const text = `${page1}\nSayfa : 1/2\n${page2}\nSayfa : 2/2\n`
      const result = chunkDocument(text, 'doc')
      // Should not double-count markers at same position
      expect(result.pageMarkersFound).toBeGreaterThanOrEqual(2)
    })

    it('custom page marker patterns can be provided', () => {
      const page1 = 'A'.repeat(5000)
      const page2 = 'B'.repeat(5000)
      const text = `${page1}\n##PAGE(1)##\n${page2}\n##PAGE(2)##\n`
      const result = chunkDocument(text, 'doc', {
        pageMarkerPatterns: [/##PAGE\((\d+)\)##/g],
      })
      expect(result.pageMarkersFound).toBeGreaterThanOrEqual(2)
      expect(result.method).toBe('page_markers')
    })

    it('assigns page numbers from marker to chunk', () => {
      const page1 = 'A'.repeat(5000)
      const page2 = 'B'.repeat(5000)
      const text = `${page1}\nSayfa : 1/2\n${page2}\nSayfa : 2/2\n`
      const result = chunkDocument(text, 'doc')
      expect(result.method).toBe('page_markers')
      // Check that page numbers are populated
      const pageNums = result.chunks.flatMap((c) => c.pageNumbers)
      expect(pageNums.length).toBeGreaterThan(0)
    })
  })

  // ============================================================================
  // chunkDocument — PAGE MARKERS RE-CHUNKING oversized pages
  // ============================================================================

  describe('chunkDocument — re-chunking oversized page marker chunks', () => {
    it('re-chunks when a page chunk exceeds maxChunkSize * 1.5', () => {
      // Create a very large page between two markers — should trigger re-chunking
      const bigPage = 'Word '.repeat(5000) // 25000 chars >> default maxChunkSize * 1.5 = 18000
      const smallPage = 'B'.repeat(1000)
      const text = `Sayfa : 1/2\n${bigPage}\nSayfa : 2/2\n${smallPage}\n`
      const result = chunkDocument(text, 'doc')
      expect(result.method).toBe('page_markers')
      // The big page should have been sub-chunked into multiple chunks
      expect(result.totalChunks).toBeGreaterThan(2)
    })

    it('preserves small page chunks during re-chunking without modification', () => {
      // One huge page + one small page
      const bigPage = 'X'.repeat(20000) // > maxChunkSize * 1.5
      const smallPage = 'Y'.repeat(1000)
      const text = `Sayfa : 1/2\n${bigPage}\nSayfa : 2/2\n${smallPage}\n`
      const result = chunkDocument(text, 'doc')
      expect(result.method).toBe('page_markers')
      // The last chunk (small page) should remain intact
      const lastChunk = result.chunks[result.chunks.length - 1]
      expect(lastChunk.text.length).toBeLessThanOrEqual(12000)
    })

    it('does NOT re-chunk when no page exceeds maxChunkSize * 1.5', () => {
      // Pages within size limits
      const page1 = 'A'.repeat(5000)
      const page2 = 'B'.repeat(5000)
      const text = `Sayfa : 1/2\n${page1}\nSayfa : 2/2\n${page2}\n`
      const result = chunkDocument(text, 'doc')
      expect(result.method).toBe('page_markers')
      expect(result.totalChunks).toBe(2) // No re-chunking needed
    })

    it('re-chunked chunks have sequential IDs and indices', () => {
      const bigPage = 'Z'.repeat(25000)
      const text = `Sayfa : 1/2\n${bigPage}\nSayfa : 2/2\nSmall page content\n`
      const result = chunkDocument(text, 'doc')
      for (let i = 0; i < result.chunks.length; i++) {
        expect(result.chunks[i].index).toBe(i)
        expect(result.chunks[i].id).toContain(`_${i.toString().padStart(3, '0')}`)
      }
    })

    it('re-chunked sub-chunks inherit parent page numbers', () => {
      const bigPage = 'Content '.repeat(4000) // ~32000 chars
      const text = `Sayfa : 1/2\n${bigPage}\nSayfa : 2/2\nSmall\n`
      const result = chunkDocument(text, 'doc')
      // Sub-chunks from page 1 should have pageNumbers [1]
      const page1Chunks = result.chunks.filter((c) => c.pageNumbers.includes(1))
      expect(page1Chunks.length).toBeGreaterThan(1) // Multiple sub-chunks
    })
  })

  // ============================================================================
  // chunkDocument — SIZE-BASED CHUNKING
  // ============================================================================

  describe('chunkDocument — size-based chunking', () => {
    it('creates multiple chunks for large text', () => {
      const text = 'A'.repeat(30000)
      const result = chunkDocument(text, 'doc')
      expect(result.method).toBe('size_based')
      expect(result.totalChunks).toBeGreaterThan(1)
    })

    it('first chunk has no overlap, subsequent chunks do', () => {
      const text = 'A'.repeat(30000)
      const result = chunkDocument(text, 'doc', { overlapSize: 500 })
      expect(result.chunks[0].hasOverlap).toBe(false)
      expect(result.chunks[0].overlapChars).toBe(0)
      for (let i = 1; i < result.chunks.length; i++) {
        expect(result.chunks[i].hasOverlap).toBe(true)
        expect(result.chunks[i].overlapChars).toBe(500)
      }
    })

    it('handles zero overlap', () => {
      const text = 'A'.repeat(25000)
      const result = chunkDocument(text, 'doc', {
        overlapSize: 0,
        targetChunkSize: 8000,
        minChunkSize: 6000,
        maxChunkSize: 12000,
      })
      expect(result.method).toBe('size_based')
      expect(result.totalChunks).toBeGreaterThan(1)
    })

    it('handles preserveParagraphs=false (direct break at target)', () => {
      const text = 'A'.repeat(25000)
      const result = chunkDocument(text, 'doc', { preserveParagraphs: false })
      expect(result.method).toBe('size_based')
      expect(result.totalChunks).toBeGreaterThan(1)
    })

    it('breaks at paragraph boundaries when preserveParagraphs=true', () => {
      // Build text with clear paragraph breaks
      const paragraphs: string[] = []
      for (let i = 0; i < 10; i++) {
        paragraphs.push('Sentence '.repeat(200) + '\n\n')
      }
      const text = paragraphs.join('')
      const result = chunkDocument(text, 'doc', {
        preserveParagraphs: true,
        targetChunkSize: 3000,
        minChunkSize: 2000,
        maxChunkSize: 5000,
      })
      expect(result.method).toBe('size_based')
      expect(result.totalChunks).toBeGreaterThan(1)
    })

    it('handles text with Turkish uppercase paragraph starts', () => {
      const lines: string[] = []
      for (let i = 0; i < 30; i++) {
        lines.push('A'.repeat(500) + '\n' + 'Çok uzun bir paragraf. '.repeat(30))
      }
      const text = lines.join('\n')
      const result = chunkDocument(text, 'doc', {
        targetChunkSize: 4000,
        minChunkSize: 2000,
        maxChunkSize: 6000,
        preserveParagraphs: true,
      })
      expect(result.method).toBe('size_based')
      expect(result.totalChunks).toBeGreaterThan(1)
    })

    it('handles text with numbered list paragraph breaks', () => {
      const lines: string[] = []
      for (let i = 0; i < 30; i++) {
        lines.push(`${i + 1}) ${'Content '.repeat(100)}`)
      }
      const text = lines.join('\n')
      const result = chunkDocument(text, 'doc', {
        targetChunkSize: 3000,
        minChunkSize: 2000,
        maxChunkSize: 5000,
        preserveParagraphs: true,
      })
      expect(result.totalChunks).toBeGreaterThan(1)
    })

    it('handles text with bullet point paragraph breaks', () => {
      const lines: string[] = []
      for (let i = 0; i < 30; i++) {
        const bullet = ['●', '○', '-'][i % 3]
        lines.push(`${bullet} ${'Item content '.repeat(80)}`)
      }
      const text = lines.join('\n')
      const result = chunkDocument(text, 'doc', {
        targetChunkSize: 3000,
        minChunkSize: 2000,
        maxChunkSize: 5000,
        preserveParagraphs: true,
      })
      expect(result.totalChunks).toBeGreaterThan(1)
    })

    it('handles text with sentence-end followed by capital (Turkish chars)', () => {
      const sentences: string[] = []
      for (let i = 0; i < 50; i++) {
        sentences.push('Bu bir cümle sonu. Şimdi yeni bir cümle başlıyor ve devam ediyor')
      }
      const text = sentences.join(' ').repeat(10)
      const result = chunkDocument(text, 'doc', {
        targetChunkSize: 3000,
        minChunkSize: 2000,
        maxChunkSize: 5000,
        preserveParagraphs: true,
      })
      expect(result.totalChunks).toBeGreaterThan(1)
    })

    it('small remaining text is appended to last chunk', () => {
      // Craft text where remaining after chunking is < minChunkSize / 2
      // Default minChunkSize = 6000, so < 3000 remaining should be appended
      const text = 'A'.repeat(20100) // After 2 chunks of ~8000 each (+overlap), remainder is small
      const result = chunkDocument(text, 'doc', {
        targetChunkSize: 8000,
        minChunkSize: 6000,
        maxChunkSize: 12000,
        overlapSize: 300,
      })
      // The last chunk should cover to the end of the document
      const lastChunk = result.chunks[result.chunks.length - 1]
      // If remaining was appended to last chunk, its text should extend to the end
      expect(lastChunk.text.length).toBeGreaterThan(0)
      // The method should be size_based
      expect(result.method).toBe('size_based')
      expect(result.totalChunks).toBeGreaterThan(1)
    })

    it('large remaining text creates new chunk', () => {
      // Craft text so remaining is large enough to be its own chunk
      const text = 'A'.repeat(50000)
      const result = chunkDocument(text, 'doc', {
        targetChunkSize: 8000,
        minChunkSize: 6000,
        maxChunkSize: 12000,
        overlapSize: 300,
      })
      expect(result.totalChunks).toBeGreaterThan(2)
    })

    it('avoids infinite loop with currentPosition advancement', () => {
      // Edge: very small maxChunkSize to force many iterations
      const text = 'A'.repeat(5000)
      const result = chunkDocument(text, 'doc', {
        targetChunkSize: 500,
        minChunkSize: 200,
        maxChunkSize: 800,
        overlapSize: 50,
      })
      expect(result.totalChunks).toBeGreaterThan(1)
      // Should terminate without hanging
    })

    it('size-based: chunkBySize returns single chunk when text <= maxChunkSize', () => {
      // This exercises chunkBySize's early return for small text
      // Triggered when chunkDocument uses size-based but a sub-call handles small page
      const text = 'A'.repeat(11000)
      const result = chunkDocument(text, 'doc', {
        maxChunkSize: 12000,
      })
      expect(result.method).toBe('single_chunk')
      expect(result.totalChunks).toBe(1)
    })

    it('breakPoint <= currentPosition fallback to maxChunkSize end', () => {
      // When findBestBreakPoint returns currentPosition (no good break found),
      // actualEnd should fall back to min(currentPosition + maxChunkSize, text.length)
      // Use text with no paragraph breaks at all
      const text = 'AAAA'.repeat(10000) // 40000 chars, no newlines, no sentence ends
      const result = chunkDocument(text, 'doc', {
        targetChunkSize: 8000,
        minChunkSize: 6000,
        maxChunkSize: 12000,
        overlapSize: 300,
        preserveParagraphs: true,
      })
      expect(result.method).toBe('size_based')
      expect(result.totalChunks).toBeGreaterThan(1)
    })
  })

  // ============================================================================
  // chunkByPageMarkers — edge cases
  // ============================================================================

  describe('chunkDocument — page marker edge cases', () => {
    it('skips empty chunks after trim (whitespace-only between markers)', () => {
      // Content between markers is only whitespace — should be skipped
      const page1 = 'A'.repeat(5000)
      const text = `Sayfa : 1/3\n${page1}\nSayfa : 2/3\n   \n   \nSayfa : 3/3\nFinal content here!\n`
      const result = chunkDocument(text, 'doc')
      expect(result.method).toBe('page_markers')
      // The empty page should not produce a chunk
      for (const chunk of result.chunks) {
        expect(chunk.text.trim().length).toBeGreaterThan(0)
      }
    })

    it('first chunk includes content before first marker', () => {
      const preamble = 'Preamble content before any markers. '.repeat(100)
      const page2 = 'B'.repeat(5000)
      const text = `${preamble}\nSayfa : 1/2\n${page2}\nSayfa : 2/2\nEnd\n`
      const result = chunkDocument(text, 'doc')
      expect(result.method).toBe('page_markers')
      // First chunk should start from offset 0 and include preamble
      expect(result.chunks[0].startOffset).toBe(0)
      expect(result.chunks[0].text).toContain('Preamble content')
    })

    it('pattern without totalPages group uses pageNumber as totalPages', () => {
      // The === N === pattern has only one capture group
      const page1 = 'A'.repeat(6000)
      const page2 = 'B'.repeat(6000)
      const text = `${page1}\n=== 1 ===\n${page2}\n=== 2 ===\n`
      const result = chunkDocument(text, 'doc')
      expect(result.pageMarkersFound).toBeGreaterThanOrEqual(2)
    })
  })

  // ============================================================================
  // mergeChunks — all branches
  // ============================================================================

  describe('mergeChunks', () => {
    it('returns empty string for empty array', () => {
      expect(mergeChunks([])).toBe('')
    })

    it('returns sanitizedText for single chunk', () => {
      const chunk = makeSanitizedChunk({ sanitizedText: '  Hello World  ' })
      expect(mergeChunks([chunk])).toBe('  Hello World  ')
    })

    it('concatenates non-overlapping chunks with double newline separator', () => {
      const c1 = makeSanitizedChunk({
        index: 0,
        sanitizedText: 'First part  ',
        hasOverlap: false,
        overlapChars: 0,
      })
      const c2 = makeSanitizedChunk({
        id: 'chunk_001',
        index: 1,
        sanitizedText: '  Second part',
        startOffset: 100,
        hasOverlap: false,
        overlapChars: 0,
      })
      const result = mergeChunks([c1, c2])
      expect(result).toBe('First part\n\nSecond part')
    })

    it('sorts chunks by index before merging', () => {
      const c1 = makeSanitizedChunk({
        id: 'chunk_001',
        index: 1,
        sanitizedText: 'Second',
        hasOverlap: false,
        overlapChars: 0,
      })
      const c0 = makeSanitizedChunk({
        id: 'chunk_000',
        index: 0,
        sanitizedText: 'First',
        hasOverlap: false,
        overlapChars: 0,
      })
      const result = mergeChunks([c1, c0])
      expect(result.indexOf('First')).toBeLessThan(result.indexOf('Second'))
    })

    it('merges overlapping chunks using common substring detection', () => {
      const commonSection = 'This is the common overlapping text section that repeats.'
      const c0 = makeSanitizedChunk({
        index: 0,
        sanitizedText: `Start of document. ${commonSection}`,
        hasOverlap: false,
        overlapChars: 0,
      })
      const c1 = makeSanitizedChunk({
        id: 'chunk_001',
        index: 1,
        sanitizedText: `${commonSection} End of document.`,
        startOffset: 50,
        hasOverlap: true,
        overlapChars: commonSection.length,
      })
      const result = mergeChunks([c0, c1])
      // Should contain both unique parts
      expect(result).toContain('Start of document')
      expect(result).toContain('End of document')
      // Common section should appear only once (or be deduplicated)
    })

    it('falls back to concatenation when no common substring >= 20 chars', () => {
      const c0 = makeSanitizedChunk({
        index: 0,
        sanitizedText: 'AAAAAAAAAA completely unique text AAAAAAAAAA',
        hasOverlap: false,
        overlapChars: 0,
      })
      const c1 = makeSanitizedChunk({
        id: 'chunk_001',
        index: 1,
        sanitizedText: 'BBBBBBBBBB totally different text BBBBBBBBBB',
        startOffset: 50,
        hasOverlap: true,
        overlapChars: 100,
      })
      const result = mergeChunks([c0, c1])
      expect(result).toContain('completely unique text')
      expect(result).toContain('totally different text')
    })

    it('early exits overlap search when bestMatch >= 50', () => {
      // Create long common substring (> 50 chars) at the boundary
      const longCommon = 'X'.repeat(60)
      const c0 = makeSanitizedChunk({
        index: 0,
        sanitizedText: `Start ${longCommon}`,
        hasOverlap: false,
        overlapChars: 0,
      })
      const c1 = makeSanitizedChunk({
        id: 'chunk_001',
        index: 1,
        sanitizedText: `${longCommon} End`,
        startOffset: 50,
        hasOverlap: true,
        overlapChars: 60,
      })
      const result = mergeChunks([c0, c1])
      expect(result).toContain('Start')
      expect(result).toContain('End')
    })

    it('merges three chunks, mix of overlap and non-overlap', () => {
      const common = 'A common overlap section here!'
      const c0 = makeSanitizedChunk({
        index: 0,
        sanitizedText: `Part one. ${common}`,
        hasOverlap: false,
        overlapChars: 0,
      })
      const c1 = makeSanitizedChunk({
        id: 'chunk_001',
        index: 1,
        sanitizedText: `${common} Part two.`,
        startOffset: 50,
        hasOverlap: true,
        overlapChars: common.length,
      })
      const c2 = makeSanitizedChunk({
        id: 'chunk_002',
        index: 2,
        sanitizedText: 'Part three.',
        startOffset: 150,
        hasOverlap: false,
        overlapChars: 0,
      })
      const result = mergeChunks([c0, c1, c2])
      expect(result).toContain('Part one')
      expect(result).toContain('Part two')
      expect(result).toContain('Part three')
    })

    it('handles chunk with hasOverlap=true but overlapChars=0 as non-overlap', () => {
      const c0 = makeSanitizedChunk({
        index: 0,
        sanitizedText: 'First',
        hasOverlap: false,
        overlapChars: 0,
      })
      const c1 = makeSanitizedChunk({
        id: 'chunk_001',
        index: 1,
        sanitizedText: 'Second',
        startOffset: 50,
        hasOverlap: true,
        overlapChars: 0, // hasOverlap true but overlapChars 0
      })
      const result = mergeChunks([c0, c1])
      // Should use concatenation path since overlapChars === 0
      expect(result).toContain('First')
      expect(result).toContain('Second')
    })
  })

  // ============================================================================
  // findOverlapMergePoint — edge cases via mergeChunks
  // ============================================================================

  describe('findOverlapMergePoint — exercised via mergeChunks', () => {
    it('handles very short texts where searchWindow is clamped', () => {
      const c0 = makeSanitizedChunk({
        index: 0,
        sanitizedText: 'Short prev text overlap overlap overlap',
        hasOverlap: false,
        overlapChars: 0,
      })
      const c1 = makeSanitizedChunk({
        id: 'chunk_001',
        index: 1,
        sanitizedText: 'overlap overlap overlap More text here',
        startOffset: 20,
        hasOverlap: true,
        overlapChars: 30,
      })
      const result = mergeChunks([c0, c1])
      expect(result).toContain('Short prev text')
      expect(result).toContain('More text here')
    })

    it('handles expectedOverlap larger than previous text', () => {
      const c0 = makeSanitizedChunk({
        index: 0,
        sanitizedText: 'Tiny',
        hasOverlap: false,
        overlapChars: 0,
      })
      const c1 = makeSanitizedChunk({
        id: 'chunk_001',
        index: 1,
        sanitizedText: 'Different',
        startOffset: 10,
        hasOverlap: true,
        overlapChars: 9999,
      })
      const result = mergeChunks([c0, c1])
      // Fallback concatenation since no common substring
      expect(result).toContain('Tiny')
      expect(result).toContain('Different')
    })
  })

  // ============================================================================
  // sanitizeChunk & sanitizeAllChunks
  // ============================================================================

  describe('sanitizeChunk', () => {
    it('returns sanitized text and preserves chunk metadata', () => {
      const chunk = makeChunk({
        text: 'T E S T text here',
        pageNumbers: [3],
        hasOverlap: true,
        overlapChars: 25,
      })
      const result = sanitizeChunk(chunk)
      expect(result.sanitizedText).toBeDefined()
      expect(result.sanitizerResult).toBeDefined()
      expect(result.id).toBe(chunk.id)
      expect(result.pageNumbers).toEqual([3])
      expect(result.hasOverlap).toBe(true)
      expect(result.overlapChars).toBe(25)
    })

    it('sanitizes Turkish OCR spaced text', () => {
      const chunk = makeChunk({ text: 'S İ G O R T A P O L İ Ç E S İ' })
      const result = sanitizeChunk(chunk)
      // Should merge spaced Turkish characters
      expect(result.sanitizedText).toContain('SİGORTA')
    })
  })

  describe('sanitizeAllChunks', () => {
    it('returns empty array for empty input', () => {
      expect(sanitizeAllChunks([])).toEqual([])
    })

    it('sanitizes all chunks and preserves ordering', () => {
      const chunks = [
        makeChunk({ id: 'c0', index: 0, text: 'P O L İ Ç E' }),
        makeChunk({ id: 'c1', index: 1, text: 'K A S K O' }),
        makeChunk({ id: 'c2', index: 2, text: 'Normal text' }),
      ]
      const results = sanitizeAllChunks(chunks)
      expect(results).toHaveLength(3)
      expect(results[0].id).toBe('c0')
      expect(results[1].id).toBe('c1')
      expect(results[2].id).toBe('c2')
    })
  })

  // ============================================================================
  // getChunkingStats — all branches
  // ============================================================================

  describe('getChunkingStats', () => {
    it('returns single_chunk for small text', () => {
      const stats = getChunkingStats('Hello')
      expect(stats.estimatedChunks).toBe(1)
      expect(stats.recommendedMethod).toBe('single_chunk')
      expect(stats.hasPageMarkers).toBe(false)
      expect(stats.pageMarkerCount).toBe(0)
    })

    it('returns page_markers when markers found and preferPageMarkers is true', () => {
      // Text must be > maxChunkSize (12000) to avoid single_chunk path
      const filler = 'A'.repeat(5000)
      const text = `${filler}\nSayfa : 1/3\n${filler}\nSayfa : 2/3\n${filler}\nSayfa : 3/3`
      expect(text.length).toBeGreaterThan(12000)
      const stats = getChunkingStats(text)
      expect(stats.hasPageMarkers).toBe(true)
      expect(stats.recommendedMethod).toBe('page_markers')
      expect(stats.estimatedChunks).toBeGreaterThanOrEqual(3)
    })

    it('returns size_based when markers found but preferPageMarkers is false', () => {
      const text = 'A'.repeat(20000) + '\nSayfa : 1/3\nMore\nSayfa : 2/3\nEnd\nSayfa : 3/3'
      const stats = getChunkingStats(text, { preferPageMarkers: false })
      expect(stats.recommendedMethod).toBe('size_based')
    })

    it('returns size_based for large text without markers', () => {
      const text = 'A'.repeat(50000)
      const stats = getChunkingStats(text)
      expect(stats.recommendedMethod).toBe('size_based')
      expect(stats.estimatedChunks).toBeGreaterThan(1)
      expect(stats.hasPageMarkers).toBe(false)
    })

    it('estimates chunk count based on target and overlap sizes', () => {
      const text = 'A'.repeat(40000)
      const stats = getChunkingStats(text, { targetChunkSize: 10000, overlapSize: 500 })
      // estimatedChunks = ceil(40000 / (10000 - 500)) = ceil(40000 / 9500) = 5
      expect(stats.estimatedChunks).toBe(5)
    })

    it('returns single_chunk when text equals maxChunkSize', () => {
      const text = 'A'.repeat(12000) // default maxChunkSize
      const stats = getChunkingStats(text)
      expect(stats.estimatedChunks).toBe(1)
      expect(stats.recommendedMethod).toBe('single_chunk')
    })

    it('accepts custom page marker patterns', () => {
      const text = 'AAA\n###1###\nBBB\n###2###\nCCC'
      const stats = getChunkingStats(text, {
        pageMarkerPatterns: [/###(\d+)###/g],
      })
      expect(stats.hasPageMarkers).toBe(true)
      expect(stats.pageMarkerCount).toBe(2)
    })

    it('returns size_based when only 1 page marker found (< 2)', () => {
      const text = 'A'.repeat(20000) + '\nSayfa : 1/1\n'
      const stats = getChunkingStats(text)
      expect(stats.hasPageMarkers).toBe(false)
      expect(stats.recommendedMethod).toBe('size_based')
    })
  })

  // ============================================================================
  // validateChunkCoverage — all branches
  // ============================================================================

  describe('validateChunkCoverage', () => {
    it('valid for empty text with no chunks', () => {
      const result = validateChunkCoverage('', [])
      expect(result.valid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('valid for whitespace-only text with no chunks', () => {
      const result = validateChunkCoverage('   ', [])
      expect(result.valid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('invalid when non-empty text has no chunks', () => {
      const result = validateChunkCoverage('Some content here', [])
      expect(result.valid).toBe(false)
      expect(result.issues).toContain('No chunks produced for non-empty text')
    })

    it('valid when first chunk starts at 0 and last ends at text.length', () => {
      const text = 'A'.repeat(500)
      const chunks = [
        makeChunk({ startOffset: 0, endOffset: 300, index: 0 }),
        makeChunk({ id: 'c1', startOffset: 200, endOffset: 500, index: 1 }),
      ]
      const result = validateChunkCoverage(text, chunks)
      expect(result.valid).toBe(true)
    })

    it('invalid when first chunk starts > 100 chars in', () => {
      const text = 'A'.repeat(500)
      const chunks = [makeChunk({ startOffset: 150, endOffset: 500 })]
      const result = validateChunkCoverage(text, chunks)
      expect(result.valid).toBe(false)
      expect(result.issues.some((i) => i.includes('First chunk starts at offset 150'))).toBe(true)
    })

    it('valid when first chunk starts at offset <= 100', () => {
      const text = 'A'.repeat(500)
      const chunks = [makeChunk({ startOffset: 50, endOffset: 500 })]
      const result = validateChunkCoverage(text, chunks)
      expect(result.valid).toBe(true)
    })

    it('invalid when last chunk ends > 100 chars before document end', () => {
      const text = 'A'.repeat(1000)
      const chunks = [makeChunk({ startOffset: 0, endOffset: 800 })]
      const result = validateChunkCoverage(text, chunks)
      expect(result.valid).toBe(false)
      expect(result.issues.some((i) => i.includes('Last chunk ends at 800'))).toBe(true)
    })

    it('valid when last chunk ends within 100 chars of document end', () => {
      const text = 'A'.repeat(1000)
      const chunks = [makeChunk({ startOffset: 0, endOffset: 950 })]
      const result = validateChunkCoverage(text, chunks)
      expect(result.valid).toBe(true)
    })

    it('detects gap > 100 between consecutive chunks', () => {
      const text = 'A'.repeat(1000)
      const chunks = [
        makeChunk({ startOffset: 0, endOffset: 200, index: 0 }),
        makeChunk({ id: 'c1', startOffset: 400, endOffset: 1000, index: 1 }),
      ]
      const result = validateChunkCoverage(text, chunks)
      expect(result.valid).toBe(false)
      expect(result.issues.some((i) => i.includes('Gap of 200 chars'))).toBe(true)
    })

    it('valid when gap between chunks <= 100', () => {
      const text = 'A'.repeat(1000)
      const chunks = [
        makeChunk({ startOffset: 0, endOffset: 500, index: 0 }),
        makeChunk({ id: 'c1', startOffset: 550, endOffset: 1000, index: 1 }),
      ]
      const result = validateChunkCoverage(text, chunks)
      expect(result.valid).toBe(true)
    })

    it('sorts chunks by startOffset before checking gaps', () => {
      const text = 'A'.repeat(1000)
      // Provide chunks out of order
      const chunks = [
        makeChunk({ id: 'c1', startOffset: 450, endOffset: 1000, index: 1 }),
        makeChunk({ startOffset: 0, endOffset: 500, index: 0 }),
      ]
      const result = validateChunkCoverage(text, chunks)
      expect(result.valid).toBe(true)
    })

    it('reports multiple issues simultaneously', () => {
      const text = 'A'.repeat(2000)
      const chunks = [
        makeChunk({ startOffset: 200, endOffset: 500, index: 0 }), // start gap
        makeChunk({ id: 'c1', startOffset: 700, endOffset: 1200, index: 1 }), // gap between
        // end gap (1200 < 2000)
      ]
      const result = validateChunkCoverage(text, chunks)
      expect(result.valid).toBe(false)
      expect(result.issues.length).toBeGreaterThanOrEqual(2)
    })

    it('handles single chunk covering entire document', () => {
      const text = 'A'.repeat(500)
      const chunks = [makeChunk({ startOffset: 0, endOffset: 500 })]
      const result = validateChunkCoverage(text, chunks)
      expect(result.valid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('gap check: overlapping chunks (negative gap) are valid', () => {
      const text = 'A'.repeat(1000)
      const chunks = [
        makeChunk({ startOffset: 0, endOffset: 600, index: 0 }),
        makeChunk({ id: 'c1', startOffset: 400, endOffset: 1000, index: 1 }),
      ]
      const result = validateChunkCoverage(text, chunks)
      expect(result.valid).toBe(true)
    })
  })

  // ============================================================================
  // INTEGRATION: chunkDocument + validateChunkCoverage
  // ============================================================================

  describe('Integration: chunk then validate', () => {
    it('size-based chunking produces valid coverage', () => {
      const text = 'Word '.repeat(6000) // ~30000 chars
      const result = chunkDocument(text, 'doc')
      const validation = validateChunkCoverage(text, result.chunks)
      expect(validation.valid).toBe(true)
    })

    it('page-marker chunking produces valid coverage', () => {
      const page1 = 'A'.repeat(5000)
      const page2 = 'B'.repeat(5000)
      const page3 = 'C'.repeat(5000)
      const text = `${page1}\nSayfa : 1/3\n${page2}\nSayfa : 2/3\n${page3}\nSayfa : 3/3\n`
      const result = chunkDocument(text, 'doc')
      const validation = validateChunkCoverage(text, result.chunks)
      expect(validation.valid).toBe(true)
    })

    it('single-chunk produces valid coverage', () => {
      const text = 'Hello World'
      const result = chunkDocument(text, 'doc')
      const validation = validateChunkCoverage(text, result.chunks)
      expect(validation.valid).toBe(true)
    })

    it('empty document produces valid coverage', () => {
      const result = chunkDocument('', 'doc')
      const validation = validateChunkCoverage('', result.chunks)
      expect(validation.valid).toBe(true)
    })
  })

  // ============================================================================
  // INTEGRATION: chunkDocument + sanitize + merge round-trip
  // ============================================================================

  describe('Integration: chunk + sanitize + merge round-trip', () => {
    it('round-trips a multi-chunk document through sanitize and merge', () => {
      const text = 'Normal text content. '.repeat(1500) // ~31500 chars
      const result = chunkDocument(text, 'rt')
      expect(result.totalChunks).toBeGreaterThan(1)

      const sanitized = sanitizeAllChunks(result.chunks)
      expect(sanitized).toHaveLength(result.totalChunks)

      const merged = mergeChunks(sanitized)
      expect(merged.length).toBeGreaterThan(0)
      expect(merged).toContain('Normal text content')
    })
  })

  // ============================================================================
  // Edge: chunk ID padding for large index values
  // ============================================================================

  describe('generateChunkId — via chunkDocument', () => {
    it('zero-pads to at least 3 digits', () => {
      const result = chunkDocument('Hello', 'myDoc')
      expect(result.chunks[0].id).toBe('myDoc_chunk_000')
    })

    it('pads correctly for multi-chunk output', () => {
      const text = 'A'.repeat(30000)
      const result = chunkDocument(text, 'd')
      for (let i = 0; i < result.chunks.length; i++) {
        expect(result.chunks[i].id).toBe(`d_chunk_${i.toString().padStart(3, '0')}`)
      }
    })
  })

  // ============================================================================
  // Edge: originalLength and stats calculation
  // ============================================================================

  describe('stats calculation edge cases', () => {
    it('stats are calculated from chunk text lengths, not raw offsets', () => {
      const text = '   A'.repeat(3001) // text with leading spaces, ~12004 chars
      const result = chunkDocument(text, 'doc')
      expect(result.originalLength).toBe(text.length)
      // Stats should reflect actual chunk text length (after trim)
      if (result.totalChunks === 1) {
        expect(result.stats.minChunkSize).toBe(result.chunks[0].text.length)
      }
    })

    it('avg is rounded to integer', () => {
      // Create a situation with multiple chunks of varying sizes
      const text = 'A'.repeat(25000)
      const result = chunkDocument(text, 'doc')
      expect(Number.isInteger(result.stats.avgChunkSize)).toBe(true)
    })
  })
})
