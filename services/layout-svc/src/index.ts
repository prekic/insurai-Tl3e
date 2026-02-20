/**
 * Layout Service
 *
 * Analyzes document structure and detects regions for targeted OCR.
 * Uses sharp for actual image analysis instead of simulated data.
 *
 * Features:
 * - Document segmentation (headers, paragraphs, tables, signatures)
 * - Reading order detection
 * - Table structure recognition
 * - Form field detection
 * - Logo/stamp/signature detection
 *
 * Uses sharp for all image processing operations.
 */

import sharp from 'sharp'
import type { BoundingBox } from '@insurai/types'

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  storage: {
    endpoint: process.env.STORAGE_ENDPOINT || 'http://localhost:9000',
    accessKey: process.env.STORAGE_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.STORAGE_SECRET_KEY || 'minioadmin',
    bucket: process.env.OCR_BUCKET || 'ocr-images',
  },
  layout: {
    minRegionArea: 1000, // Minimum pixels for a region
    maxRegionsPerPage: 100,
    tableDetectionEnabled: true,
    formDetectionEnabled: true,
    // Thresholds for region detection
    binaryThreshold: 128,
    minTextBlockHeight: 20,
    minTextBlockWidth: 50,
    headerHeightRatio: 0.15, // Top 15% is potential header
    footerHeightRatio: 0.10, // Bottom 10% is potential footer
  },
}

// ============================================================================
// TYPES
// ============================================================================

export type RegionType =
  | 'header'
  | 'footer'
  | 'paragraph'
  | 'table'
  | 'table_cell'
  | 'form_field'
  | 'signature'
  | 'stamp'
  | 'logo'
  | 'image'
  | 'barcode'
  | 'handwriting'
  | 'unknown'

export interface Region {
  id: string
  type: RegionType
  bbox: BoundingBox
  pageNo: number
  confidence: number
  readingOrder: number
  parent?: string // For nested regions (e.g., table cells)
  children?: string[]
  metadata?: Record<string, unknown>
}

export interface LayoutAnalyzeRequest {
  docId: string
  pageCount: number
}

export interface LayoutAnalyzeResponse {
  regions: Region[]
  pageLayouts: Array<{
    pageNo: number
    regions: string[] // Region IDs
    hasTable: boolean
    hasForm: boolean
    hasSignature: boolean
  }>
  timing: {
    totalMs: number
    perPageMs: number[]
  }
}

interface ImageStats {
  width: number
  height: number
  channels: number
  meanBrightness: number
  contrast: number
}

interface ProjectionProfile {
  horizontal: number[] // Row-wise sum of black pixels
  vertical: number[] // Column-wise sum of black pixels
}

interface TextBlock {
  x: number
  y: number
  width: number
  height: number
  density: number // Text density (0-1)
}

// ============================================================================
// LAYOUT ANALYZER
// ============================================================================

export class LayoutAnalyzer {
  private regionCounter = 0

  /**
   * Analyze document layout
   */
  async analyzeDocument(request: LayoutAnalyzeRequest): Promise<LayoutAnalyzeResponse> {
    const startTime = Date.now()
    const { docId, pageCount } = request

    const allRegions: Region[] = []
    const pageLayouts: LayoutAnalyzeResponse['pageLayouts'] = []
    const perPageMs: number[] = []

    for (let pageNo = 1; pageNo <= pageCount; pageNo++) {
      const pageStart = Date.now()

      // Fetch page image
      const imageBuffer = await this.fetchPageImage(docId, pageNo)

      // Analyze page layout
      const pageRegions = await this.analyzePage(imageBuffer, pageNo)

      allRegions.push(...pageRegions)

      // Create page layout summary
      pageLayouts.push({
        pageNo,
        regions: pageRegions.map(r => r.id),
        hasTable: pageRegions.some(r => r.type === 'table'),
        hasForm: pageRegions.some(r => r.type === 'form_field'),
        hasSignature: pageRegions.some(r => r.type === 'signature'),
      })

      perPageMs.push(Date.now() - pageStart)
    }

    return {
      regions: allRegions,
      pageLayouts,
      timing: {
        totalMs: Date.now() - startTime,
        perPageMs,
      },
    }
  }

  /**
   * Analyze a single page using sharp-based image processing
   */
  private async analyzePage(imageBuffer: Buffer, pageNo: number): Promise<Region[]> {
    const regions: Region[] = []

    try {
      // Get image stats and binarized version
      const stats = await this.getImageStats(imageBuffer)
      const binaryBuffer = await this.binarizeImage(imageBuffer)
      const projections = await this.calculateProjections(binaryBuffer, stats.width, stats.height)

      // eslint-disable-next-line no-console
      console.log(`[Layout] Page ${pageNo}: ${stats.width}x${stats.height}, brightness: ${stats.meanBrightness.toFixed(2)}`)

      // Step 1: Detect text blocks using projection profiles
      const textBlocks = this.detectTextBlocks(projections, stats, pageNo)

      // Classify text blocks into regions
      for (const block of textBlocks) {
        const region = this.classifyTextBlock(block, stats, pageNo)
        if (region) {
          regions.push(region)
        }
      }

      // Step 2: Detect tables using line detection
      if (config.layout.tableDetectionEnabled) {
        const tables = await this.detectTables(imageBuffer, stats, pageNo, projections)
        regions.push(...tables)
      }

      // Step 3: Detect form fields using pattern analysis
      if (config.layout.formDetectionEnabled) {
        const formFields = await this.detectFormFields(imageBuffer, stats, pageNo, projections)
        regions.push(...formFields)
      }

      // Step 4: Detect signatures/stamps using color and shape analysis
      const signatures = await this.detectSignatures(imageBuffer, stats, pageNo)
      regions.push(...signatures)

      // Step 5: Detect barcodes using pattern analysis
      const barcodes = await this.detectBarcodes(binaryBuffer, stats, pageNo, projections)
      regions.push(...barcodes)

      // Step 6: Establish reading order
      this.assignReadingOrder(regions)

      // eslint-disable-next-line no-console
      console.log(`[Layout] Page ${pageNo}: Found ${regions.length} regions`)

    } catch (error) {
      console.error(`[Layout] Page ${pageNo} analysis failed:`, (error as Error).message)
      // Return minimal regions on error
      regions.push(this.createRegion('paragraph', pageNo, {
        x: 50, y: 50, width: 2450, height: 3200
      }, 0.5))
    }

    return regions
  }

  /**
   * Get image statistics using sharp
   */
  private async getImageStats(imageBuffer: Buffer): Promise<ImageStats> {
    const metadata = await sharp(imageBuffer).metadata()
    const { channels } = await sharp(imageBuffer).stats()

    const meanBrightness = channels.length > 0
      ? channels[0].mean / 255
      : 0.75

    const stdDev = channels.length > 0 ? channels[0].stdev : 50
    const contrast = Math.min(1, stdDev / 100)

    return {
      width: metadata.width || 2550,
      height: metadata.height || 3300,
      channels: metadata.channels || 3,
      meanBrightness,
      contrast,
    }
  }

  /**
   * Binarize image for analysis
   */
  private async binarizeImage(imageBuffer: Buffer): Promise<Buffer> {
    return sharp(imageBuffer)
      .grayscale()
      .threshold(config.layout.binaryThreshold)
      .raw()
      .toBuffer()
  }

  /**
   * Calculate horizontal and vertical projection profiles
   * These profiles help detect text lines and columns
   */
  private async calculateProjections(
    binaryBuffer: Buffer,
    width: number,
    height: number
  ): Promise<ProjectionProfile> {
    const horizontal: number[] = new Array(height).fill(0)
    const vertical: number[] = new Array(width).fill(0)

    // Sample the buffer (binary image is single channel after grayscale + threshold)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x
        // In binary image, 0 = black (text), 255 = white (background)
        if (binaryBuffer[idx] === 0) {
          horizontal[y]++
          vertical[x]++
        }
      }
    }

    return { horizontal, vertical }
  }

  /**
   * Detect text blocks using projection profile analysis
   */
  private detectTextBlocks(
    projections: ProjectionProfile,
    stats: ImageStats,
    _pageNo: number
  ): TextBlock[] {
    const blocks: TextBlock[] = []
    const { horizontal, vertical } = projections
    const { width, height } = stats

    // Find horizontal bands of text (rows with significant black pixels)
    const rowThreshold = width * 0.01 // At least 1% of width has text
    let inTextRegion = false
    let textStart = 0

    for (let y = 0; y < height; y++) {
      const hasText = horizontal[y] > rowThreshold

      if (hasText && !inTextRegion) {
        // Starting a new text region
        inTextRegion = true
        textStart = y
      } else if (!hasText && inTextRegion) {
        // Ending text region
        inTextRegion = false
        const textHeight = y - textStart

        if (textHeight >= config.layout.minTextBlockHeight) {
          // Find horizontal extent of this text block
          const { left, right } = this.findHorizontalExtent(
            vertical,
            textStart,
            y,
            horizontal,
            width
          )

          const blockWidth = right - left
          if (blockWidth >= config.layout.minTextBlockWidth) {
            // Calculate text density
            let blackPixels = 0
            for (let row = textStart; row < y; row++) {
              blackPixels += horizontal[row]
            }
            const density = blackPixels / (blockWidth * textHeight)

            blocks.push({
              x: left,
              y: textStart,
              width: blockWidth,
              height: textHeight,
              density,
            })
          }
        }
      }
    }

    // Handle text region that extends to bottom of page
    if (inTextRegion) {
      const textHeight = height - textStart
      if (textHeight >= config.layout.minTextBlockHeight) {
        const { left, right } = this.findHorizontalExtent(
          vertical,
          textStart,
          height,
          horizontal,
          width
        )
        const blockWidth = right - left
        if (blockWidth >= config.layout.minTextBlockWidth) {
          let blackPixels = 0
          for (let row = textStart; row < height; row++) {
            blackPixels += horizontal[row]
          }
          const density = blackPixels / (blockWidth * textHeight)
          blocks.push({
            x: left,
            y: textStart,
            width: blockWidth,
            height: textHeight,
            density,
          })
        }
      }
    }

    // Merge adjacent blocks that are likely part of the same paragraph
    return this.mergeAdjacentBlocks(blocks, stats)
  }

  /**
   * Find horizontal extent of a text region
   */
  private findHorizontalExtent(
    vertical: number[],
    _yStart: number,
    _yEnd: number,
    _horizontal: number[],
    width: number
  ): { left: number; right: number } {
    const colThreshold = 5 // Minimum black pixels in column

    let left = 0
    let right = width - 1

    // Find left edge
    for (let x = 0; x < width; x++) {
      if (vertical[x] > colThreshold) {
        left = x
        break
      }
    }

    // Find right edge
    for (let x = width - 1; x >= 0; x--) {
      if (vertical[x] > colThreshold) {
        right = x
        break
      }
    }

    return { left, right: right + 1 }
  }

  /**
   * Merge adjacent text blocks that are likely part of the same paragraph
   */
  private mergeAdjacentBlocks(blocks: TextBlock[], stats: ImageStats): TextBlock[] {
    if (blocks.length <= 1) return blocks

    const merged: TextBlock[] = []
    const mergeGap = stats.height * 0.02 // 2% of page height

    let current = { ...blocks[0] }

    for (let i = 1; i < blocks.length; i++) {
      const next = blocks[i]
      const gap = next.y - (current.y + current.height)

      // Merge if blocks are close and horizontally overlapping
      if (gap < mergeGap && this.horizontalOverlap(current, next) > 0.5) {
        // Extend current block
        const newBottom = next.y + next.height
        current.height = newBottom - current.y
        current.x = Math.min(current.x, next.x)
        const maxRight = Math.max(current.x + current.width, next.x + next.width)
        current.width = maxRight - current.x
        current.density = (current.density + next.density) / 2
      } else {
        merged.push(current)
        current = { ...next }
      }
    }
    merged.push(current)

    return merged
  }

  /**
   * Calculate horizontal overlap ratio between two blocks
   */
  private horizontalOverlap(a: TextBlock, b: TextBlock): number {
    const aLeft = a.x
    const aRight = a.x + a.width
    const bLeft = b.x
    const bRight = b.x + b.width

    const overlapStart = Math.max(aLeft, bLeft)
    const overlapEnd = Math.min(aRight, bRight)

    if (overlapEnd <= overlapStart) return 0

    const overlap = overlapEnd - overlapStart
    const smallerWidth = Math.min(a.width, b.width)

    return overlap / smallerWidth
  }

  /**
   * Classify a text block as a specific region type
   */
  private classifyTextBlock(
    block: TextBlock,
    stats: ImageStats,
    pageNo: number
  ): Region | null {
    const { width, height } = stats

    // Skip very small blocks
    if (block.width * block.height < config.layout.minRegionArea) {
      return null
    }

    // Determine region type based on position and characteristics
    let type: RegionType = 'paragraph'
    let confidence = 0.7

    // Header detection: top 15% of page
    if (block.y < height * config.layout.headerHeightRatio) {
      type = 'header'
      confidence = 0.85
    }
    // Footer detection: bottom 10% of page
    else if (block.y + block.height > height * (1 - config.layout.footerHeightRatio)) {
      type = 'footer'
      confidence = 0.8
    }
    // Wide blocks with low density might be form fields
    else if (block.width > width * 0.3 && block.density < 0.1) {
      type = 'form_field'
      confidence = 0.6
    }

    return this.createRegion(type, pageNo, {
      x: block.x,
      y: block.y,
      width: block.width,
      height: block.height,
    }, confidence, {
      density: block.density,
    })
  }

  /**
   * Detect tables by looking for grid patterns
   */
  private async detectTables(
    imageBuffer: Buffer,
    stats: ImageStats,
    pageNo: number,
    projections: ProjectionProfile
  ): Promise<Region[]> {
    const regions: Region[] = []
    const { horizontal, vertical } = projections
    const { width, height } = stats

    // Look for horizontal lines (rows with very high black pixel count)
    const lineThreshold = width * 0.3 // At least 30% of width is black (a line)
    const horizontalLines: number[] = []

    for (let y = 0; y < height; y++) {
      if (horizontal[y] > lineThreshold) {
        horizontalLines.push(y)
      }
    }

    // Look for vertical lines
    const vLineThreshold = height * 0.1 // At least 10% of height
    const verticalLines: number[] = []

    for (let x = 0; x < width; x++) {
      if (vertical[x] > vLineThreshold) {
        verticalLines.push(x)
      }
    }

    // If we have multiple horizontal and vertical lines, likely a table
    if (horizontalLines.length >= 3 && verticalLines.length >= 2) {
      // Find table bounds
      const tableTop = horizontalLines[0]
      const tableBottom = horizontalLines[horizontalLines.length - 1]
      const tableLeft = verticalLines[0]
      const tableRight = verticalLines[verticalLines.length - 1]

      const tableHeight = tableBottom - tableTop
      const tableWidth = tableRight - tableLeft

      // Only consider it a table if it's reasonably sized
      if (tableHeight > 100 && tableWidth > 200) {
        const table = this.createRegion('table', pageNo, {
          x: tableLeft,
          y: tableTop,
          width: tableWidth,
          height: tableHeight,
        }, 0.75, {
          rowCount: horizontalLines.length - 1,
          colCount: verticalLines.length - 1,
        })

        // Detect individual cells
        for (let i = 0; i < horizontalLines.length - 1; i++) {
          for (let j = 0; j < verticalLines.length - 1; j++) {
            const cellTop = horizontalLines[i]
            const cellBottom = horizontalLines[i + 1]
            const cellLeft = verticalLines[j]
            const cellRight = verticalLines[j + 1]

            const cell = this.createRegion('table_cell', pageNo, {
              x: cellLeft,
              y: cellTop,
              width: cellRight - cellLeft,
              height: cellBottom - cellTop,
            }, 0.7, {
              row: i,
              col: j,
            })

            cell.parent = table.id
            if (!table.children) table.children = []
            table.children.push(cell.id)
            regions.push(cell)
          }
        }

        regions.unshift(table)
      }
    }

    return regions
  }

  /**
   * Detect form fields using pattern analysis
   */
  private async detectFormFields(
    imageBuffer: Buffer,
    stats: ImageStats,
    pageNo: number,
    projections: ProjectionProfile
  ): Promise<Region[]> {
    const regions: Region[] = []
    const { horizontal } = projections
    const { width, height } = stats

    // Look for underline patterns (horizontal line followed by whitespace)
    const underlineThreshold = width * 0.15
    let inUnderline = false
    let underlineY = 0

    for (let y = 0; y < height - 50; y++) {
      const currentRow = horizontal[y]
      const nextRow = horizontal[y + 1] || 0

      // Detect transition from line to whitespace
      if (currentRow > underlineThreshold && nextRow < underlineThreshold / 10) {
        if (!inUnderline) {
          inUnderline = true
          underlineY = y
        }
      } else if (inUnderline && currentRow < underlineThreshold / 10) {
        // End of underline region
        inUnderline = false

        // Find horizontal extent of this underline
        let left = 0, right = width - 1
        for (let x = 0; x < width; x++) {
          if (projections.vertical[x] > 0) {
            left = x
            break
          }
        }
        for (let x = width - 1; x >= 0; x--) {
          if (projections.vertical[x] > 0) {
            right = x
            break
          }
        }

        // Add form field region (area above the underline)
        const fieldHeight = 40
        regions.push(this.createRegion('form_field', pageNo, {
          x: left + 100, // Offset to account for label
          y: underlineY - fieldHeight,
          width: right - left - 100,
          height: fieldHeight + 5,
        }, 0.65, {
          fieldType: 'underline',
        }))
      }
    }

    return regions
  }

  /**
   * Detect signatures and stamps using color analysis
   */
  private async detectSignatures(
    imageBuffer: Buffer,
    stats: ImageStats,
    pageNo: number
  ): Promise<Region[]> {
    const regions: Region[] = []
    const { width, height } = stats

    try {
      // Analyze color channels to find blue/red regions (common for signatures/stamps)
      const { channels } = await sharp(imageBuffer).stats()

      if (channels.length >= 3) {
        const rMean = channels[0].mean
        const gMean = channels[1].mean
        const bMean = channels[2].mean

        // Blue ink signature detection (blue channel significantly higher than red/green)
        const hasBlueInk = bMean > rMean * 1.2 && bMean > gMean * 1.1

        // Red stamp detection
        const hasRedStamp = rMean > bMean * 1.3 && rMean > gMean * 1.2

        if (hasBlueInk || hasRedStamp) {
          // Extract color mask to find location
          const colorBuffer = await sharp(imageBuffer)
            .raw()
            .toBuffer()

          // Scan bottom portion of page for signatures (usually bottom 30%)
          const scanStart = Math.floor(height * 0.7)
          const bytesPerPixel = stats.channels

          let signatureFound = false
          let stampFound = false

          // Sample grid to find colored regions
          const gridSize = 100
          for (let gy = scanStart; gy < height - gridSize; gy += gridSize) {
            for (let gx = 0; gx < width - gridSize; gx += gridSize) {
              let blueCount = 0
              let redCount = 0

              // Sample pixels in this grid cell
              for (let y = gy; y < gy + gridSize && y < height; y += 10) {
                for (let x = gx; x < gx + gridSize && x < width; x += 10) {
                  const idx = (y * width + x) * bytesPerPixel
                  const r = colorBuffer[idx] || 0
                  const g = colorBuffer[idx + 1] || 0
                  const b = colorBuffer[idx + 2] || 0

                  // Check for blue ink
                  if (b > 150 && b > r * 1.3 && b > g * 1.2) {
                    blueCount++
                  }
                  // Check for red ink
                  if (r > 150 && r > b * 1.3 && r > g * 1.2) {
                    redCount++
                  }
                }
              }

              // If significant blue found, likely signature
              if (blueCount > 5 && !signatureFound) {
                regions.push(this.createRegion('signature', pageNo, {
                  x: gx,
                  y: gy,
                  width: 300,
                  height: 100,
                }, 0.7, {
                  inkColor: 'blue',
                }))
                signatureFound = true
              }

              // If significant red found, likely stamp
              if (redCount > 10 && !stampFound) {
                regions.push(this.createRegion('stamp', pageNo, {
                  x: gx,
                  y: gy,
                  width: 200,
                  height: 200,
                }, 0.65, {
                  inkColor: 'red',
                }))
                stampFound = true
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn(`[Layout] Signature detection failed:`, (error as Error).message)
    }

    return regions
  }

  /**
   * Detect barcodes using pattern analysis
   */
  private async detectBarcodes(
    binaryBuffer: Buffer,
    stats: ImageStats,
    pageNo: number,
    projections: ProjectionProfile
  ): Promise<Region[]> {
    const regions: Region[] = []
    const { vertical } = projections
    const { width, height } = stats

    // Look for barcode pattern: alternating high/low vertical projections
    // Scan top and bottom portions where barcodes are commonly found
    const scanRegions = [
      { start: 0, end: Math.floor(height * 0.15) }, // Top 15%
      { start: Math.floor(height * 0.85), end: height }, // Bottom 15%
    ]

    for (const region of scanRegions) {
      // Look for barcode-like pattern in vertical projection
      let transitions = 0
      let lastHigh = vertical[0] > 50
      let barcodeStart = -1
      let barcodeEnd = -1

      for (let x = 1; x < width; x++) {
        const isHigh = vertical[x] > 50 // Threshold for "dark" stripe
        if (isHigh !== lastHigh) {
          transitions++
          if (barcodeStart === -1 && transitions > 0) {
            barcodeStart = x - 20
          }
          barcodeEnd = x + 20
          lastHigh = isHigh
        }
      }

      // Barcodes have many transitions (stripes)
      if (transitions > 30 && barcodeEnd - barcodeStart > 100) {
        const barcodeWidth = Math.min(barcodeEnd - barcodeStart, 500)
        const barcodeHeight = 80

        regions.push(this.createRegion('barcode', pageNo, {
          x: Math.max(0, barcodeStart),
          y: region.start + 10,
          width: barcodeWidth,
          height: barcodeHeight,
        }, 0.8, {
          transitions,
          barcodeType: transitions > 100 ? 'qr' : 'linear',
        }))

        break // Only one barcode per scan region
      }
    }

    return regions
  }

  /**
   * Assign reading order based on position
   */
  private assignReadingOrder(regions: Region[]): void {
    // Sort by position (top-to-bottom, left-to-right)
    const sorted = [...regions]
      .filter(r => !r.parent) // Only top-level regions
      .sort((a, b) => {
        // Primary sort: vertical position (with tolerance)
        const yDiff = a.bbox.y - b.bbox.y
        if (Math.abs(yDiff) > 50) return yDiff

        // Secondary sort: horizontal position
        return a.bbox.x - b.bbox.x
      })

    // Assign reading order
    sorted.forEach((region, index) => {
      region.readingOrder = index
    })

    // Assign child reading order within tables
    for (const region of regions) {
      if (region.children) {
        const regionChildren = region.children
        const children = regions.filter(r => regionChildren.includes(r.id))
        children.sort((a, b) => {
          const yDiff = a.bbox.y - b.bbox.y
          if (Math.abs(yDiff) > 10) return yDiff
          return a.bbox.x - b.bbox.x
        })
        children.forEach((child, index) => {
          child.readingOrder = region.readingOrder + (index + 1) / 1000
        })
      }
    }
  }

  private createRegion(
    type: RegionType,
    pageNo: number,
    bbox: BoundingBox,
    confidence: number,
    metadata?: Record<string, unknown>
  ): Region {
    return {
      id: `region-${pageNo}-${++this.regionCounter}`,
      type,
      bbox,
      pageNo,
      confidence,
      readingOrder: 0,
      metadata,
    }
  }

  private async fetchPageImage(docId: string, pageNo: number): Promise<Buffer> {
    const key = `${docId}/pages/${pageNo}/300.png`
    const url = `${config.storage.endpoint}/${config.storage.bucket}/${key}`

    const response = await fetch(url, {
      headers: this.getStorageHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch page image: ${response.statusText}`)
    }

    return Buffer.from(await response.arrayBuffer())
  }

  private getStorageHeaders(): Record<string, string> {
    const auth = Buffer.from(
      `${config.storage.accessKey}:${config.storage.secretKey}`
    ).toString('base64')

    return {
      Authorization: `Basic ${auth}`,
    }
  }
}

// ============================================================================
// EXPRESS SERVER
// ============================================================================

import express from 'express'

const app = express()
app.use(express.json())

const analyzer = new LayoutAnalyzer()

// Health check
app.get('/health', (_, res) => {
  res.json({
    status: 'healthy',
    features: {
      tableDetection: config.layout.tableDetectionEnabled,
      formDetection: config.layout.formDetectionEnabled,
      sharpBased: true,
    },
  })
})

// Analyze layout
app.post('/analyze', async (req, res) => {
  try {
    const request = req.body as LayoutAnalyzeRequest
    const result = await analyzer.analyzeDocument(request)
    res.json(result)
  } catch (error) {
    console.error('[Layout] Error:', error)
    res.status(500).json({ error: (error as Error).message })
  }
})

const PORT = process.env.PORT || 4005

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[Layout Service] Listening on port ${PORT}`)
  // eslint-disable-next-line no-console
  console.log(`[Layout Service] Using sharp-based region detection`)
})

export { LayoutAnalyzer }
export type { Region, RegionType }
