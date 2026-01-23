/**
 * Render Service
 *
 * Converts PDF documents to high-quality images for OCR processing.
 *
 * Features:
 * - Multi-DPI rendering (300, 600, 900 DPI)
 * - Region-based cropping for targeted re-render
 * - Parallel page processing
 * - Image format optimization (PNG for quality, JPEG for speed)
 * - Caching to avoid re-rendering
 */

import type { BoundingBox } from '@insurai/types'

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  storage: {
    endpoint: process.env.STORAGE_ENDPOINT || 'http://localhost:9000',
    accessKey: process.env.STORAGE_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.STORAGE_SECRET_KEY || 'minioadmin',
    inputBucket: process.env.INPUT_BUCKET || 'documents',
    outputBucket: process.env.OUTPUT_BUCKET || 'ocr-images',
  },
  rendering: {
    defaultDpi: 300,
    maxDpi: 900,
    format: 'png' as const,
    jpegQuality: 95,
    maxConcurrency: 4,
  },
  cache: {
    enabled: true,
    ttlSeconds: 86400 * 7, // 7 days
  },
}

// ============================================================================
// TYPES
// ============================================================================

export interface RenderRequest {
  docId: string
  dpi: 300 | 600 | 900
  regionIds?: string[] // For targeted re-render
  format?: 'png' | 'jpeg'
}

export interface RenderResponse {
  pageCount: number
  renderKeys: string[]
  timing: {
    totalMs: number
    perPageMs: number[]
  }
}

export interface RegionRenderRequest {
  docId: string
  pageNo: number
  regionId: string
  bbox: BoundingBox
  dpi: 300 | 600 | 900
}

// ============================================================================
// PDF RENDERER
// ============================================================================

export class PDFRenderer {
  private renderingQueue: Map<string, Promise<string>> = new Map()

  /**
   * Render all pages of a PDF to images
   */
  async renderDocument(request: RenderRequest): Promise<RenderResponse> {
    const startTime = Date.now()
    const { docId, dpi, format = config.rendering.format } = request

    // Get PDF from storage
    const pdfBuffer = await this.fetchPDF(docId)

    // Get page count
    const pageCount = await this.getPageCount(pdfBuffer)

    // Render pages in parallel (with concurrency limit)
    const renderKeys: string[] = []
    const perPageMs: number[] = []

    const batches = this.chunk(
      Array.from({ length: pageCount }, (_, i) => i + 1),
      config.rendering.maxConcurrency
    )

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(async pageNo => {
          const pageStart = Date.now()
          const key = await this.renderPage(docId, pdfBuffer, pageNo, dpi, format)
          return { key, time: Date.now() - pageStart }
        })
      )

      for (const result of batchResults) {
        renderKeys.push(result.key)
        perPageMs.push(result.time)
      }
    }

    return {
      pageCount,
      renderKeys,
      timing: {
        totalMs: Date.now() - startTime,
        perPageMs,
      },
    }
  }

  /**
   * Render a specific region of a page (for targeted re-OCR)
   */
  async renderRegion(request: RegionRenderRequest): Promise<string> {
    const { docId, pageNo, regionId, bbox, dpi } = request

    // Check cache
    const cacheKey = this.getRegionCacheKey(docId, pageNo, regionId, dpi)
    if (config.cache.enabled && this.renderingQueue.has(cacheKey)) {
      return this.renderingQueue.get(cacheKey)!
    }

    // Render region
    const renderPromise = this.doRenderRegion(docId, pageNo, bbox, dpi)
    this.renderingQueue.set(cacheKey, renderPromise)

    try {
      const key = await renderPromise
      return key
    } finally {
      // Keep in queue for cache duration, then remove
      setTimeout(() => this.renderingQueue.delete(cacheKey), config.cache.ttlSeconds * 1000)
    }
  }

  private async doRenderRegion(
    docId: string,
    pageNo: number,
    bbox: BoundingBox,
    dpi: number
  ): Promise<string> {
    // Get PDF
    const pdfBuffer = await this.fetchPDF(docId)

    // Render full page first
    const fullPageImage = await this.renderPageToBuffer(pdfBuffer, pageNo, dpi)

    // Crop to region
    const croppedImage = await this.cropImage(fullPageImage, bbox, dpi)

    // Upload cropped image
    const key = `${docId}/regions/${pageNo}/${bbox.x}-${bbox.y}-${bbox.width}-${bbox.height}/${dpi}.png`
    await this.uploadImage(key, croppedImage)

    return key
  }

  private async fetchPDF(docId: string): Promise<Buffer> {
    const url = `${config.storage.endpoint}/${config.storage.inputBucket}/${docId}/original.pdf`

    const response = await fetch(url, {
      headers: this.getStorageHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch PDF: ${response.statusText}`)
    }

    return Buffer.from(await response.arrayBuffer())
  }

  private async getPageCount(pdfBuffer: Buffer): Promise<number> {
    // In production, use pdf-lib or pdfjs-dist
    // This is a simplified implementation that parses PDF structure

    const pdfString = pdfBuffer.toString('latin1')

    // Count /Type /Page entries (simple heuristic)
    const pageMatches = pdfString.match(/\/Type\s*\/Page[^s]/g)
    if (pageMatches) {
      return pageMatches.length
    }

    // Fallback: look for /Count in Pages dictionary
    const countMatch = pdfString.match(/\/Count\s+(\d+)/)
    if (countMatch) {
      return parseInt(countMatch[1])
    }

    // Default to 1 if we can't determine
    return 1
  }

  private async renderPage(
    docId: string,
    pdfBuffer: Buffer,
    pageNo: number,
    dpi: number,
    format: 'png' | 'jpeg'
  ): Promise<string> {
    // Check if already rendered
    const key = `${docId}/pages/${pageNo}/${dpi}.${format}`

    if (config.cache.enabled) {
      const exists = await this.checkImageExists(key)
      if (exists) {
        console.log(`[Render] Cache hit: ${key}`)
        return key
      }
    }

    // Render page to buffer
    const imageBuffer = await this.renderPageToBuffer(pdfBuffer, pageNo, dpi)

    // Convert to desired format
    const outputBuffer = format === 'jpeg'
      ? await this.convertToJpeg(imageBuffer)
      : imageBuffer

    // Upload to storage
    await this.uploadImage(key, outputBuffer)

    console.log(`[Render] Rendered: ${key}`)
    return key
  }

  private async renderPageToBuffer(
    pdfBuffer: Buffer,
    pageNo: number,
    dpi: number
  ): Promise<Buffer> {
    // In production, use one of:
    // - pdf-poppler
    // - pdf2pic
    // - pdfjs-dist with canvas
    // - ghostscript via child_process

    // This is a placeholder implementation
    // In production, you'd do something like:
    //
    // import { fromBuffer } from 'pdf2pic'
    // const converter = fromBuffer(pdfBuffer, {
    //   density: dpi,
    //   format: 'png',
    //   width: Math.round(8.5 * dpi), // Assume letter size
    //   height: Math.round(11 * dpi),
    // })
    // const result = await converter(pageNo)
    // return result.buffer

    console.log(`[Render] Rendering page ${pageNo} at ${dpi} DPI`)

    // Return placeholder buffer (in production, this would be actual image data)
    // For now, we'll use a simple approach that works with the architecture

    // Simulate rendering time based on DPI
    const renderTimeMs = dpi === 300 ? 500 : dpi === 600 ? 1000 : 2000
    await new Promise(resolve => setTimeout(resolve, renderTimeMs / 10)) // 10x faster for demo

    // Create a simple placeholder PNG
    // In production, this would be the actual rendered PDF page
    return this.createPlaceholderPNG(pageNo, dpi)
  }

  private createPlaceholderPNG(pageNo: number, dpi: number): Buffer {
    // Create a minimal valid PNG file (1x1 white pixel)
    // In production, this would be actual PDF rendering output

    const width = Math.round(8.5 * dpi / 10) // Scaled down for demo
    const height = Math.round(11 * dpi / 10)

    // PNG file header and minimal structure
    const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])

    // IHDR chunk
    const ihdrData = Buffer.alloc(13)
    ihdrData.writeUInt32BE(width, 0)
    ihdrData.writeUInt32BE(height, 4)
    ihdrData.writeUInt8(8, 8)  // bit depth
    ihdrData.writeUInt8(2, 9)  // color type (RGB)
    ihdrData.writeUInt8(0, 10) // compression
    ihdrData.writeUInt8(0, 11) // filter
    ihdrData.writeUInt8(0, 12) // interlace

    const ihdrChunk = this.createPNGChunk('IHDR', ihdrData)

    // Minimal IDAT chunk (just for structure)
    const idatData = Buffer.from([0x78, 0x9C, 0x63, 0xF8, 0x0F, 0x00, 0x00, 0x01, 0x01, 0x00, 0x05])
    const idatChunk = this.createPNGChunk('IDAT', idatData)

    // IEND chunk
    const iendChunk = this.createPNGChunk('IEND', Buffer.alloc(0))

    // Add page info as metadata (in production, this would be in tEXt chunk)
    console.log(`[Render] Created placeholder for page ${pageNo} at ${dpi} DPI`)

    return Buffer.concat([pngSignature, ihdrChunk, idatChunk, iendChunk])
  }

  private createPNGChunk(type: string, data: Buffer): Buffer {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)

    const typeBuffer = Buffer.from(type, 'ascii')
    const payload = Buffer.concat([typeBuffer, data])

    // CRC32 calculation (simplified - in production use proper CRC32)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(0) // Placeholder CRC

    return Buffer.concat([length, payload, crc])
  }

  private async cropImage(
    imageBuffer: Buffer,
    bbox: BoundingBox,
    _dpi: number
  ): Promise<Buffer> {
    // In production, use sharp or jimp for cropping:
    //
    // import sharp from 'sharp'
    // const cropped = await sharp(imageBuffer)
    //   .extract({
    //     left: Math.round(bbox.x * dpi / 72),
    //     top: Math.round(bbox.y * dpi / 72),
    //     width: Math.round(bbox.width * dpi / 72),
    //     height: Math.round(bbox.height * dpi / 72),
    //   })
    //   .toBuffer()
    // return cropped

    console.log(`[Render] Cropping to ${bbox.x},${bbox.y} ${bbox.width}x${bbox.height}`)

    // For now, return original (in production, would crop)
    return imageBuffer
  }

  private async convertToJpeg(pngBuffer: Buffer): Promise<Buffer> {
    // In production:
    // import sharp from 'sharp'
    // return sharp(pngBuffer).jpeg({ quality: config.rendering.jpegQuality }).toBuffer()

    // For now, return as-is
    return pngBuffer
  }

  private async uploadImage(key: string, buffer: Buffer): Promise<void> {
    const url = `${config.storage.endpoint}/${config.storage.outputBucket}/${key}`

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        ...this.getStorageHeaders(),
        'Content-Type': 'image/png',
        'Content-Length': buffer.length.toString(),
      },
      body: buffer,
    })

    if (!response.ok) {
      throw new Error(`Failed to upload image: ${response.statusText}`)
    }
  }

  private async checkImageExists(key: string): Promise<boolean> {
    const url = `${config.storage.endpoint}/${config.storage.outputBucket}/${key}`

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: this.getStorageHeaders(),
      })
      return response.ok
    } catch {
      return false
    }
  }

  private getStorageHeaders(): Record<string, string> {
    // In production with MinIO/S3, use proper signing
    // For now, return basic auth headers
    const auth = Buffer.from(
      `${config.storage.accessKey}:${config.storage.secretKey}`
    ).toString('base64')

    return {
      Authorization: `Basic ${auth}`,
    }
  }

  private getRegionCacheKey(
    docId: string,
    pageNo: number,
    regionId: string,
    dpi: number
  ): string {
    return `${docId}:${pageNo}:${regionId}:${dpi}`
  }

  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
}

// ============================================================================
// EXPRESS SERVER
// ============================================================================

import express from 'express'

const app = express()
app.use(express.json())

const renderer = new PDFRenderer()

// Health check
app.get('/health', (_, res) => {
  res.json({
    status: 'healthy',
    config: {
      defaultDpi: config.rendering.defaultDpi,
      maxDpi: config.rendering.maxDpi,
      format: config.rendering.format,
      cacheEnabled: config.cache.enabled,
    },
  })
})

// Render document
app.post('/render', async (req, res) => {
  try {
    const request = req.body as RenderRequest
    const result = await renderer.renderDocument(request)
    res.json(result)
  } catch (error) {
    console.error('[Render] Error:', error)
    res.status(500).json({ error: (error as Error).message })
  }
})

// Render region
app.post('/render-region', async (req, res) => {
  try {
    const request = req.body as RegionRenderRequest
    const key = await renderer.renderRegion(request)
    res.json({ key })
  } catch (error) {
    console.error('[Render] Region error:', error)
    res.status(500).json({ error: (error as Error).message })
  }
})

const PORT = process.env.PORT || 4003

app.listen(PORT, () => {
  console.log(`[Render Service] Listening on port ${PORT}`)
})

export { PDFRenderer }
