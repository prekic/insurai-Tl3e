/**
 * Document Chunker Tests
 */

import { describe, it, expect } from 'vitest'
import {
  chunkDocument,
  sanitizeChunk,
  sanitizeAllChunks,
  mergeChunks,
  validateChunkCoverage,
  getChunkingStats,
} from './document-chunker'

describe('Document Chunker', () => {
  describe('chunkDocument', () => {
    describe('single chunk mode', () => {
      it('should return single chunk for small documents', () => {
        const text = 'Short document text'
        const result = chunkDocument(text, 'doc')

        expect(result.totalChunks).toBe(1)
        expect(result.method).toBe('single_chunk')
        expect(result.chunks[0].text).toBe(text)
      })

      it('should return empty array for empty document', () => {
        const result = chunkDocument('', 'doc')

        expect(result.totalChunks).toBe(0)
        expect(result.chunks).toHaveLength(0)
      })

      it('should set correct chunk properties for single chunk', () => {
        const text = 'Document content here'
        const result = chunkDocument(text, 'testdoc')

        expect(result.chunks[0].id).toBe('testdoc_chunk_000')
        expect(result.chunks[0].index).toBe(0)
        expect(result.chunks[0].startOffset).toBe(0)
        expect(result.chunks[0].endOffset).toBe(text.length)
        expect(result.chunks[0].hasOverlap).toBe(false)
      })
    })

    describe('page marker detection', () => {
      it('should split by Sayfa : X/Y markers', () => {
        const text = `
Page 1 content
Sayfa : 1/3
Page 2 content
Sayfa : 2/3
Page 3 content
Sayfa : 3/3
End
`.repeat(100) // Make it large enough

        const result = chunkDocument(text, 'doc')

        expect(result.pageMarkersFound).toBeGreaterThanOrEqual(2)
        expect(result.method).toBe('page_markers')
      })

      it('should split by Sayfa: X/Y markers (no space after colon)', () => {
        const text = `
Content here
Sayfa: 1/2
More content
Sayfa: 2/2
Final
`.repeat(100)

        const result = chunkDocument(text, 'doc')

        expect(result.pageMarkersFound).toBeGreaterThanOrEqual(2)
      })

      it('should detect [Page X of Y] markers', () => {
        const text = `
Content
[Page 1 of 3]
More content
[Page 2 of 3]
Even more
[Page 3 of 3]
End
`.repeat(100)

        const result = chunkDocument(text, 'doc')

        expect(result.pageMarkersFound).toBeGreaterThanOrEqual(2)
      })

      it('should fall back to size-based for documents without markers', () => {
        const text = 'A'.repeat(20000) // Large document without markers
        const result = chunkDocument(text, 'doc')

        expect(result.method).toBe('size_based')
        expect(result.totalChunks).toBeGreaterThan(1)
      })
    })

    describe('size-based chunking', () => {
      it('should chunk large documents by size', () => {
        const text = 'Word '.repeat(5000) // ~25000 chars
        const result = chunkDocument(text, 'doc', {
          targetChunkSize: 8000,
          minChunkSize: 6000,
          maxChunkSize: 12000,
        })

        expect(result.method).toBe('size_based')
        expect(result.totalChunks).toBeGreaterThan(1)

        // All chunks should be within size bounds
        for (const chunk of result.chunks) {
          expect(chunk.text.length).toBeLessThanOrEqual(12500) // Allow some tolerance
        }
      })

      it('should include overlap between chunks', () => {
        const text = 'A'.repeat(20000)
        const result = chunkDocument(text, 'doc', {
          targetChunkSize: 8000,
          overlapSize: 300,
        })

        // Non-first chunks should have overlap
        for (let i = 1; i < result.chunks.length; i++) {
          expect(result.chunks[i].hasOverlap).toBe(true)
          expect(result.chunks[i].overlapChars).toBe(300)
        }
      })

      it('should respect minimum chunk size', () => {
        const text = 'A'.repeat(20000)
        const result = chunkDocument(text, 'doc', {
          minChunkSize: 5000,
        })

        // Most chunks should meet minimum (last chunk might be smaller)
        const nonLastChunks = result.chunks.slice(0, -1)
        for (const chunk of nonLastChunks) {
          expect(chunk.text.length).toBeGreaterThanOrEqual(4500) // Allow some tolerance
        }
      })
    })

    describe('chunk IDs', () => {
      it('should generate unique chunk IDs', () => {
        const text = 'A'.repeat(25000)
        const result = chunkDocument(text, 'mydoc')

        const ids = result.chunks.map(c => c.id)
        const uniqueIds = new Set(ids)
        expect(uniqueIds.size).toBe(ids.length)
      })

      it('should include document ID in chunk ID', () => {
        const text = 'A'.repeat(25000)
        const result = chunkDocument(text, 'policy123')

        for (const chunk of result.chunks) {
          expect(chunk.id).toContain('policy123')
        }
      })

      it('should zero-pad chunk indices', () => {
        const text = 'A'.repeat(25000)
        const result = chunkDocument(text, 'doc')

        expect(result.chunks[0].id).toContain('_000')
        if (result.chunks.length > 1) {
          expect(result.chunks[1].id).toContain('_001')
        }
      })
    })

    describe('stats', () => {
      it('should calculate chunk size stats', () => {
        const text = 'A'.repeat(25000)
        const result = chunkDocument(text, 'doc')

        expect(result.stats.minChunkSize).toBeGreaterThan(0)
        expect(result.stats.maxChunkSize).toBeGreaterThan(0)
        expect(result.stats.avgChunkSize).toBeGreaterThan(0)
        expect(result.stats.avgChunkSize).toBeLessThanOrEqual(result.stats.maxChunkSize)
        expect(result.stats.avgChunkSize).toBeGreaterThanOrEqual(result.stats.minChunkSize)
      })

      it('should set stats to 0 for empty document', () => {
        const result = chunkDocument('', 'doc')

        expect(result.stats.minChunkSize).toBe(0)
        expect(result.stats.maxChunkSize).toBe(0)
        expect(result.stats.avgChunkSize).toBe(0)
      })
    })
  })

  describe('sanitizeChunk', () => {
    it('should sanitize chunk text', () => {
      const chunk = {
        id: 'chunk_000',
        index: 0,
        text: 'S İ G O R T A poliçesi\nB^^^B\nNormal text',
        pageNumbers: [],
        startOffset: 0,
        endOffset: 100,
        hasOverlap: false,
        overlapChars: 0,
      }

      const result = sanitizeChunk(chunk)

      expect(result.sanitizedText).toContain('SİGORTA')
      expect(result.sanitizedText).not.toContain('B^^^B')
      expect(result.sanitizerResult).toBeDefined()
    })

    it('should preserve original chunk properties', () => {
      const chunk = {
        id: 'chunk_001',
        index: 1,
        text: 'Test text',
        pageNumbers: [2],
        startOffset: 100,
        endOffset: 200,
        hasOverlap: true,
        overlapChars: 50,
      }

      const result = sanitizeChunk(chunk)

      expect(result.id).toBe(chunk.id)
      expect(result.index).toBe(chunk.index)
      expect(result.pageNumbers).toEqual(chunk.pageNumbers)
      expect(result.hasOverlap).toBe(chunk.hasOverlap)
    })
  })

  describe('sanitizeAllChunks', () => {
    it('should sanitize all chunks', () => {
      const chunks = [
        {
          id: 'chunk_000',
          index: 0,
          text: 'S İ G O R T A',
          pageNumbers: [],
          startOffset: 0,
          endOffset: 50,
          hasOverlap: false,
          overlapChars: 0,
        },
        {
          id: 'chunk_001',
          index: 1,
          text: 'K A S K O',
          pageNumbers: [],
          startOffset: 50,
          endOffset: 100,
          hasOverlap: true,
          overlapChars: 10,
        },
      ]

      const result = sanitizeAllChunks(chunks)

      expect(result).toHaveLength(2)
      expect(result[0].sanitizedText).toContain('SİGORTA')
      expect(result[1].sanitizedText).toContain('KASKO')
    })
  })

  describe('mergeChunks', () => {
    it('should merge single chunk without changes', () => {
      const chunks = [
        {
          id: 'chunk_000',
          index: 0,
          text: 'Original text',
          sanitizedText: 'Cleaned text',
          pageNumbers: [],
          startOffset: 0,
          endOffset: 100,
          hasOverlap: false,
          overlapChars: 0,
          sanitizerResult: { text: '', stats: {} as never, warnings: [] },
        },
      ]

      const result = mergeChunks(chunks)

      expect(result).toBe('Cleaned text')
    })

    it('should merge non-overlapping chunks with separator', () => {
      const chunks = [
        {
          id: 'chunk_000',
          index: 0,
          text: 'Part 1',
          sanitizedText: 'Part 1 cleaned',
          pageNumbers: [],
          startOffset: 0,
          endOffset: 50,
          hasOverlap: false,
          overlapChars: 0,
          sanitizerResult: { text: '', stats: {} as never, warnings: [] },
        },
        {
          id: 'chunk_001',
          index: 1,
          text: 'Part 2',
          sanitizedText: 'Part 2 cleaned',
          pageNumbers: [],
          startOffset: 50,
          endOffset: 100,
          hasOverlap: false,
          overlapChars: 0,
          sanitizerResult: { text: '', stats: {} as never, warnings: [] },
        },
      ]

      const result = mergeChunks(chunks)

      expect(result).toContain('Part 1 cleaned')
      expect(result).toContain('Part 2 cleaned')
    })

    it('should handle overlapping chunks', () => {
      const overlapText = 'This is the overlapping section.'
      const chunks = [
        {
          id: 'chunk_000',
          index: 0,
          text: 'Part 1',
          sanitizedText: `Part 1 content. ${overlapText}`,
          pageNumbers: [],
          startOffset: 0,
          endOffset: 100,
          hasOverlap: false,
          overlapChars: 0,
          sanitizerResult: { text: '', stats: {} as never, warnings: [] },
        },
        {
          id: 'chunk_001',
          index: 1,
          text: 'Part 2',
          sanitizedText: `${overlapText} Part 2 content.`,
          pageNumbers: [],
          startOffset: 70,
          endOffset: 150,
          hasOverlap: true,
          overlapChars: 30,
          sanitizerResult: { text: '', stats: {} as never, warnings: [] },
        },
      ]

      const result = mergeChunks(chunks)

      // Should contain both parts
      expect(result).toContain('Part 1 content')
      expect(result).toContain('Part 2 content')
    })

    it('should return empty string for empty array', () => {
      const result = mergeChunks([])
      expect(result).toBe('')
    })

    it('should sort chunks by index before merging', () => {
      const chunks = [
        {
          id: 'chunk_001',
          index: 1,
          text: 'Part 2',
          sanitizedText: 'Second',
          pageNumbers: [],
          startOffset: 50,
          endOffset: 100,
          hasOverlap: false,
          overlapChars: 0,
          sanitizerResult: { text: '', stats: {} as never, warnings: [] },
        },
        {
          id: 'chunk_000',
          index: 0,
          text: 'Part 1',
          sanitizedText: 'First',
          pageNumbers: [],
          startOffset: 0,
          endOffset: 50,
          hasOverlap: false,
          overlapChars: 0,
          sanitizerResult: { text: '', stats: {} as never, warnings: [] },
        },
      ]

      const result = mergeChunks(chunks)

      expect(result.indexOf('First')).toBeLessThan(result.indexOf('Second'))
    })
  })

  describe('validateChunkCoverage', () => {
    it('should pass for well-covered document', () => {
      const text = 'A'.repeat(1000)
      const chunks = [
        {
          id: 'chunk_000',
          index: 0,
          text: text.slice(0, 600),
          pageNumbers: [],
          startOffset: 0,
          endOffset: 600,
          hasOverlap: false,
          overlapChars: 0,
        },
        {
          id: 'chunk_001',
          index: 1,
          text: text.slice(500, 1000),
          pageNumbers: [],
          startOffset: 500,
          endOffset: 1000,
          hasOverlap: true,
          overlapChars: 100,
        },
      ]

      const result = validateChunkCoverage(text, chunks)

      expect(result.valid).toBe(true)
      expect(result.issues).toHaveLength(0)
    })

    it('should detect gap at beginning', () => {
      const text = 'A'.repeat(1000)
      const chunks = [
        {
          id: 'chunk_000',
          index: 0,
          text: text.slice(200, 1000),
          pageNumbers: [],
          startOffset: 200,
          endOffset: 1000,
          hasOverlap: false,
          overlapChars: 0,
        },
      ]

      const result = validateChunkCoverage(text, chunks)

      expect(result.valid).toBe(false)
      expect(result.issues.some(i => i.includes('First chunk starts'))).toBe(true)
    })

    it('should detect gap at end', () => {
      const text = 'A'.repeat(1000)
      const chunks = [
        {
          id: 'chunk_000',
          index: 0,
          text: text.slice(0, 700),
          pageNumbers: [],
          startOffset: 0,
          endOffset: 700,
          hasOverlap: false,
          overlapChars: 0,
        },
      ]

      const result = validateChunkCoverage(text, chunks)

      expect(result.valid).toBe(false)
      expect(result.issues.some(i => i.includes('Last chunk ends'))).toBe(true)
    })

    it('should detect gaps between chunks', () => {
      const text = 'A'.repeat(1000)
      const chunks = [
        {
          id: 'chunk_000',
          index: 0,
          text: text.slice(0, 300),
          pageNumbers: [],
          startOffset: 0,
          endOffset: 300,
          hasOverlap: false,
          overlapChars: 0,
        },
        {
          id: 'chunk_001',
          index: 1,
          text: text.slice(600, 1000),
          pageNumbers: [],
          startOffset: 600,
          endOffset: 1000,
          hasOverlap: false,
          overlapChars: 0,
        },
      ]

      const result = validateChunkCoverage(text, chunks)

      expect(result.valid).toBe(false)
      expect(result.issues.some(i => i.includes('Gap of'))).toBe(true)
    })

    it('should pass for empty document with no chunks', () => {
      const result = validateChunkCoverage('', [])
      expect(result.valid).toBe(true)
    })
  })

  describe('getChunkingStats', () => {
    it('should estimate single chunk for small document', () => {
      const text = 'Small document'
      const stats = getChunkingStats(text)

      expect(stats.estimatedChunks).toBe(1)
      expect(stats.recommendedMethod).toBe('single_chunk')
    })

    it('should detect page markers', () => {
      const text = 'Content\nSayfa : 1/3\nMore\nSayfa : 2/3\nEnd\nSayfa : 3/3'
      const stats = getChunkingStats(text)

      expect(stats.hasPageMarkers).toBe(true)
      expect(stats.pageMarkerCount).toBeGreaterThanOrEqual(2)
    })

    it('should recommend size-based for large doc without markers', () => {
      const text = 'A'.repeat(50000)
      const stats = getChunkingStats(text)

      expect(stats.hasPageMarkers).toBe(false)
      expect(stats.recommendedMethod).toBe('size_based')
      expect(stats.estimatedChunks).toBeGreaterThan(1)
    })
  })
})
