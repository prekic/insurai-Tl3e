/**
 * Layout Service
 *
 * Analyzes document structure and detects regions for targeted OCR.
 *
 * Features:
 * - Document segmentation (headers, paragraphs, tables, signatures)
 * - Reading order detection
 * - Table structure recognition
 * - Form field detection
 * - Logo/stamp/signature detection
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
    bucket: process.env.OCR_BUCKET || 'ocr-images',
  },
  layout: {
    minRegionArea: 1000, // Minimum pixels for a region
    maxRegionsPerPage: 100,
    tableDetectionEnabled: true,
    formDetectionEnabled: true,
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
   * Analyze a single page
   */
  private async analyzePage(imageBuffer: Buffer, pageNo: number): Promise<Region[]> {
    const regions: Region[] = []

    // In production, use ML-based layout detection:
    // - LayoutParser with Detectron2
    // - Document AI layout model
    // - Custom trained YOLO/Faster R-CNN

    // Step 1: Detect text blocks using connected component analysis
    const textBlocks = await this.detectTextBlocks(imageBuffer, pageNo)
    regions.push(...textBlocks)

    // Step 2: Detect tables
    if (config.layout.tableDetectionEnabled) {
      const tables = await this.detectTables(imageBuffer, pageNo)
      regions.push(...tables)
    }

    // Step 3: Detect form fields
    if (config.layout.formDetectionEnabled) {
      const formFields = await this.detectFormFields(imageBuffer, pageNo)
      regions.push(...formFields)
    }

    // Step 4: Detect signatures/stamps
    const signatures = await this.detectSignatures(imageBuffer, pageNo)
    regions.push(...signatures)

    // Step 5: Detect barcodes
    const barcodes = await this.detectBarcodes(imageBuffer, pageNo)
    regions.push(...barcodes)

    // Step 6: Establish reading order
    this.assignReadingOrder(regions)

    return regions
  }

  /**
   * Detect text blocks using connected component analysis
   */
  private async detectTextBlocks(
    _imageBuffer: Buffer,
    pageNo: number
  ): Promise<Region[]> {
    // In production:
    //
    // const mat = cv.imdecode(imageBuffer)
    // const gray = mat.cvtColor(cv.COLOR_BGR2GRAY)
    // const binary = gray.threshold(0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU)
    //
    // // Dilate to connect text
    // const kernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(30, 5))
    // const dilated = binary.dilate(kernel)
    //
    // // Find contours
    // const contours = dilated.findContours(cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE)
    //
    // return contours.map(contour => {
    //   const rect = cv.boundingRect(contour)
    //   return { type: 'paragraph', bbox: rect, ... }
    // })

    // Simulated layout detection for insurance documents
    const regions: Region[] = []
    const pageHeight = 3300 // 11" at 300 DPI
    const pageWidth = 2550 // 8.5" at 300 DPI

    // Header region (company info, logo area)
    regions.push(this.createRegion('header', pageNo, {
      x: 50,
      y: 50,
      width: pageWidth - 100,
      height: 400,
    }, 0.95))

    // Policy number / title area
    regions.push(this.createRegion('paragraph', pageNo, {
      x: 50,
      y: 500,
      width: pageWidth - 100,
      height: 100,
    }, 0.9))

    // Main content paragraphs
    const contentTop = 650
    const paragraphHeight = 200
    const paragraphGap = 20

    for (let i = 0; i < 5; i++) {
      regions.push(this.createRegion('paragraph', pageNo, {
        x: 50,
        y: contentTop + i * (paragraphHeight + paragraphGap),
        width: pageWidth - 100,
        height: paragraphHeight,
      }, 0.85))
    }

    // Footer region
    regions.push(this.createRegion('footer', pageNo, {
      x: 50,
      y: pageHeight - 200,
      width: pageWidth - 100,
      height: 150,
    }, 0.9))

    return regions
  }

  /**
   * Detect tables in the page
   */
  private async detectTables(
    _imageBuffer: Buffer,
    pageNo: number
  ): Promise<Region[]> {
    // In production, use:
    // - Hough lines to detect table grid
    // - ML-based table detection (TableNet, TableTransformer)
    // - Rule-based detection from text alignment

    // Simulated table detection for insurance documents
    const regions: Region[] = []
    const pageWidth = 2550

    // Common table positions in insurance documents
    // Coverage details table
    if (Math.random() > 0.5) {
      const table = this.createRegion('table', pageNo, {
        x: 50,
        y: 1800,
        width: pageWidth - 100,
        height: 500,
      }, 0.85)

      // Add table cells
      const cellWidth = (pageWidth - 100) / 4
      const cellHeight = 50
      const rows = 8

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < 4; col++) {
          const cell = this.createRegion('table_cell', pageNo, {
            x: 50 + col * cellWidth,
            y: 1800 + row * cellHeight,
            width: cellWidth,
            height: cellHeight,
          }, 0.8)
          cell.parent = table.id
          if (!table.children) table.children = []
          table.children.push(cell.id)
          regions.push(cell)
        }
      }

      regions.unshift(table)
    }

    return regions
  }

  /**
   * Detect form fields
   */
  private async detectFormFields(
    _imageBuffer: Buffer,
    pageNo: number
  ): Promise<Region[]> {
    // In production, detect:
    // - Checkbox patterns
    // - Underline fields
    // - Box fields
    // - Label-value pairs

    const regions: Region[] = []

    // Simulated form field detection
    // Common form positions in insurance documents

    // Policy holder info section
    const formFieldPositions = [
      { label: 'Sigortalı Adı', y: 700 },
      { label: 'T.C. Kimlik No', y: 750 },
      { label: 'Adres', y: 800 },
      { label: 'Telefon', y: 850 },
    ]

    for (const field of formFieldPositions) {
      if (Math.random() > 0.3) {
        regions.push(this.createRegion('form_field', pageNo, {
          x: 300,
          y: field.y,
          width: 700,
          height: 40,
        }, 0.75, {
          fieldLabel: field.label,
          fieldType: 'text',
        }))
      }
    }

    return regions
  }

  /**
   * Detect signatures and stamps
   */
  private async detectSignatures(
    _imageBuffer: Buffer,
    pageNo: number
  ): Promise<Region[]> {
    // In production:
    // - Contour analysis for irregular shapes
    // - ML-based signature detection
    // - Color analysis (blue ink for signatures)

    const regions: Region[] = []

    // Signatures typically at bottom of pages
    if (Math.random() > 0.7) {
      regions.push(this.createRegion('signature', pageNo, {
        x: 100,
        y: 2800,
        width: 300,
        height: 100,
      }, 0.7))

      regions.push(this.createRegion('stamp', pageNo, {
        x: 2000,
        y: 2700,
        width: 200,
        height: 200,
      }, 0.75))
    }

    return regions
  }

  /**
   * Detect barcodes
   */
  private async detectBarcodes(
    _imageBuffer: Buffer,
    pageNo: number
  ): Promise<Region[]> {
    // In production, use:
    // - ZXing or ZBar for barcode detection
    // - Custom CNN for barcode localization

    const regions: Region[] = []

    // Barcodes often at top or bottom of insurance docs
    if (Math.random() > 0.5) {
      regions.push(this.createRegion('barcode', pageNo, {
        x: 50,
        y: 100,
        width: 400,
        height: 80,
      }, 0.9, {
        barcodeType: 'code128',
      }))
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
        const children = regions.filter(r => region.children!.includes(r.id))
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
  console.log(`[Layout Service] Listening on port ${PORT}`)
})

export { LayoutAnalyzer }
export type { Region, RegionType }
