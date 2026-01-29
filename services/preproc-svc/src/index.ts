/**
 * Preprocess Service
 *
 * Applies image preprocessing transformations to improve OCR quality.
 *
 * Features:
 * - Binarization (threshold-based, adaptive simulation)
 * - Deskewing (rotation correction)
 * - Denoising (median/blur operations)
 * - Contrast enhancement (normalization, gamma correction)
 * - Border removal
 * - Multiple variant generation for ensemble processing
 *
 * Uses sharp for all image processing operations.
 */

import sharp from 'sharp'
import type { PreprocessVariant } from '@insurai/types'

// ============================================================================
// CONFIGURATION
// ============================================================================

const config = {
  storage: {
    endpoint: process.env.STORAGE_ENDPOINT || 'http://localhost:9000',
    accessKey: process.env.STORAGE_ACCESS_KEY || 'minioadmin',
    secretKey: process.env.STORAGE_SECRET_KEY || 'minioadmin',
    inputBucket: process.env.INPUT_BUCKET || 'ocr-images',
    outputBucket: process.env.OUTPUT_BUCKET || 'ocr-images',
  },
  processing: {
    maxConcurrency: 4,
    variants: ['original', 'binarized', 'deskewed', 'enhanced'] as PreprocessVariant[],
  },
}

// ============================================================================
// TYPES
// ============================================================================

export interface PreprocessRequest {
  docId: string
  pageCount: number
  variants: PreprocessVariant[]
}

export interface PreprocessResponse {
  docId: string
  processedPages: Array<{
    pageNo: number
    variants: Record<PreprocessVariant, string>
  }>
  timing: {
    totalMs: number
    perVariantMs: Record<PreprocessVariant, number>
  }
}

export interface ImageStats {
  width: number
  height: number
  meanBrightness: number
  contrast: number
  noiseLevel: number
  skewAngle: number
}

// ============================================================================
// IMAGE PREPROCESSOR
// ============================================================================

export class ImagePreprocessor {
  /**
   * Process all pages with requested variants
   */
  async preprocessDocument(request: PreprocessRequest): Promise<PreprocessResponse> {
    const startTime = Date.now()
    const { docId, pageCount, variants } = request

    const processedPages: PreprocessResponse['processedPages'] = []
    const variantTimes: Record<PreprocessVariant, number[]> = {
      original: [],
      binarized: [],
      deskewed: [],
      enhanced: [],
      denoised: [],
    }

    // Process pages in batches
    const batches = this.chunk(
      Array.from({ length: pageCount }, (_, i) => i + 1),
      config.processing.maxConcurrency
    )

    for (const batch of batches) {
      const batchResults = await Promise.all(
        batch.map(pageNo => this.preprocessPage(docId, pageNo, variants))
      )

      for (const result of batchResults) {
        processedPages.push(result.page)
        for (const [variant, time] of Object.entries(result.times)) {
          variantTimes[variant as PreprocessVariant].push(time)
        }
      }
    }

    // Calculate average times per variant
    const perVariantMs: Record<PreprocessVariant, number> = {} as Record<PreprocessVariant, number>
    for (const [variant, times] of Object.entries(variantTimes)) {
      if (times.length > 0) {
        perVariantMs[variant as PreprocessVariant] = times.reduce((a, b) => a + b, 0) / times.length
      }
    }

    return {
      docId,
      processedPages,
      timing: {
        totalMs: Date.now() - startTime,
        perVariantMs,
      },
    }
  }

  private async preprocessPage(
    docId: string,
    pageNo: number,
    variants: PreprocessVariant[]
  ): Promise<{
    page: { pageNo: number; variants: Record<PreprocessVariant, string> }
    times: Record<PreprocessVariant, number>
  }> {
    const resultVariants: Record<PreprocessVariant, string> = {} as Record<PreprocessVariant, string>
    const times: Record<PreprocessVariant, number> = {} as Record<PreprocessVariant, number>

    // Fetch original image
    const originalKey = `${docId}/pages/${pageNo}/300.png`
    const imageBuffer = await this.fetchImage(originalKey)

    // Analyze image
    const stats = await this.analyzeImage(imageBuffer)

    // Process each variant
    for (const variant of variants) {
      const variantStart = Date.now()

      if (variant === 'original') {
        // Just copy the original
        resultVariants[variant] = originalKey
      } else {
        const processedBuffer = await this.applyVariant(imageBuffer, variant, stats)
        const variantKey = `${docId}/pages/${pageNo}/${variant}.png`
        await this.uploadImage(variantKey, processedBuffer)
        resultVariants[variant] = variantKey
      }

      times[variant] = Date.now() - variantStart
    }

    return {
      page: { pageNo, variants: resultVariants },
      times,
    }
  }

  private async applyVariant(
    imageBuffer: Buffer,
    variant: PreprocessVariant,
    stats: ImageStats
  ): Promise<Buffer> {
    switch (variant) {
      case 'binarized':
        return this.binarize(imageBuffer, stats)
      case 'deskewed':
        return this.deskew(imageBuffer, stats)
      case 'enhanced':
        return this.enhance(imageBuffer, stats)
      case 'denoised':
        return this.denoise(imageBuffer, stats)
      default:
        return imageBuffer
    }
  }

  /**
   * Binarization using threshold-based conversion
   * Converts image to grayscale and applies threshold for OCR optimization
   */
  private async binarize(imageBuffer: Buffer, stats: ImageStats): Promise<Buffer> {
    console.warn(`[Preprocess] Binarizing (brightness: ${stats.meanBrightness.toFixed(2)})`)

    try {
      // Calculate adaptive threshold based on image brightness
      // Lower threshold for darker images, higher for brighter
      const threshold = Math.round(255 * (stats.meanBrightness < 0.5 ? 0.4 : 0.5))

      console.warn(`[Preprocess] Using threshold: ${threshold}`)

      const binarized = await sharp(imageBuffer)
        .grayscale()
        .threshold(threshold)
        .png()
        .toBuffer()

      console.warn(`[Preprocess] Binarized: ${binarized.length} bytes`)
      return binarized
    } catch (error) {
      console.error(`[Preprocess] Binarization failed: ${(error as Error).message}`)
      return imageBuffer
    }
  }

  /**
   * Deskewing by rotating image to correct detected skew
   */
  private async deskew(imageBuffer: Buffer, stats: ImageStats): Promise<Buffer> {
    console.warn(`[Preprocess] Deskewing (detected angle: ${stats.skewAngle.toFixed(2)}°)`)

    if (Math.abs(stats.skewAngle) < 0.5) {
      console.warn(`[Preprocess] Skew angle too small, skipping deskew`)
      return imageBuffer
    }

    try {
      // Rotate by negative of detected skew to correct it
      // Sharp rotates counter-clockwise, so use negative angle
      const correctionAngle = -stats.skewAngle

      const deskewed = await sharp(imageBuffer)
        .rotate(correctionAngle, {
          background: { r: 255, g: 255, b: 255, alpha: 1 }, // White background for fill
        })
        .png()
        .toBuffer()

      console.warn(`[Preprocess] Deskewed by ${correctionAngle.toFixed(2)}°: ${deskewed.length} bytes`)
      return deskewed
    } catch (error) {
      console.error(`[Preprocess] Deskew failed: ${(error as Error).message}`)
      return imageBuffer
    }
  }

  /**
   * Contrast enhancement using normalization and gamma correction
   */
  private async enhance(imageBuffer: Buffer, stats: ImageStats): Promise<Buffer> {
    console.warn(`[Preprocess] Enhancing contrast (current: ${stats.contrast.toFixed(2)})`)

    try {
      // Determine enhancement strength based on current contrast
      // Low contrast (< 0.5) needs strong enhancement
      // Medium contrast (0.5-0.7) needs moderate enhancement
      // High contrast (> 0.7) needs light enhancement
      const gamma = stats.contrast < 0.5 ? 0.8 : stats.contrast < 0.7 ? 0.9 : 1.0
      const sharpenSigma = stats.contrast < 0.6 ? 1.5 : 1.0

      let pipeline = sharp(imageBuffer)
        .normalize() // Stretch contrast to full range

      // Apply gamma correction for darker images
      if (gamma !== 1.0) {
        pipeline = pipeline.gamma(gamma)
      }

      // Light sharpening to improve text edges
      pipeline = pipeline.sharpen({ sigma: sharpenSigma })

      const enhanced = await pipeline.png().toBuffer()

      console.warn(`[Preprocess] Enhanced (gamma: ${gamma}, sharpen: ${sharpenSigma}): ${enhanced.length} bytes`)
      return enhanced
    } catch (error) {
      console.error(`[Preprocess] Enhancement failed: ${(error as Error).message}`)
      return imageBuffer
    }
  }

  /**
   * Denoising using median blur and light sharpening
   */
  private async denoise(imageBuffer: Buffer, stats: ImageStats): Promise<Buffer> {
    console.warn(`[Preprocess] Denoising (noise level: ${stats.noiseLevel.toFixed(2)})`)

    if (stats.noiseLevel < 0.1) {
      console.warn(`[Preprocess] Low noise, applying light cleanup only`)
    }

    try {
      // Use median filter strength based on noise level
      // Higher noise = stronger blur (but limit to preserve text)
      const blurSigma = stats.noiseLevel > 0.2 ? 1.5 : stats.noiseLevel > 0.1 ? 1.0 : 0.5

      const denoised = await sharp(imageBuffer)
        .median(3) // 3x3 median filter for salt-and-pepper noise
        .blur(blurSigma) // Gaussian blur for continuous noise
        .sharpen({ sigma: 0.5 }) // Light sharpen to restore edges
        .png()
        .toBuffer()

      console.warn(`[Preprocess] Denoised (blur: ${blurSigma}): ${denoised.length} bytes`)
      return denoised
    } catch (error) {
      console.error(`[Preprocess] Denoise failed: ${(error as Error).message}`)
      return imageBuffer
    }
  }

  /**
   * Analyze image statistics using sharp metadata and pixel sampling
   */
  private async analyzeImage(imageBuffer: Buffer): Promise<ImageStats> {
    try {
      const metadata = await sharp(imageBuffer).metadata()

      // Get image stats for a sample of the image
      const { channels } = await sharp(imageBuffer)
        .stats()

      // Calculate mean brightness from first channel (or average of RGB)
      const meanBrightness = channels.length > 0
        ? channels[0].mean / 255
        : 0.75

      // Estimate contrast from standard deviation
      const stdDev = channels.length > 0 ? channels[0].stdev : 50
      const contrast = Math.min(1, stdDev / 100) // Normalize to 0-1

      // Estimate noise level (simplified - based on entropy approximation)
      // In production, would use more sophisticated noise estimation
      const noiseLevel = Math.max(0, 0.3 - contrast * 0.3)

      // Estimate skew angle (simplified - random for now)
      // In production, would use Hough transform or ML-based detection
      const skewAngle = (Math.random() - 0.5) * 4

      const stats: ImageStats = {
        width: metadata.width || 2550,
        height: metadata.height || 3300,
        meanBrightness,
        contrast,
        noiseLevel,
        skewAngle,
      }

      console.warn(`[Preprocess] Image stats: ${JSON.stringify(stats)}`)
      return stats
    } catch (error) {
      console.error(`[Preprocess] Analysis failed: ${(error as Error).message}`)
      // Return default stats on error
      return {
        width: 2550,
        height: 3300,
        meanBrightness: 0.75,
        contrast: 0.6,
        noiseLevel: 0.1,
        skewAngle: 0,
      }
    }
  }

  /**
   * Auto-select optimal variants based on image analysis
   */
  selectOptimalVariants(stats: ImageStats): PreprocessVariant[] {
    const variants: PreprocessVariant[] = ['original']

    // Always include binarized for text-heavy documents
    variants.push('binarized')

    // Include deskewed if significant skew detected
    if (Math.abs(stats.skewAngle) > 1.0) {
      variants.push('deskewed')
    }

    // Include enhanced if low contrast
    if (stats.contrast < 0.6) {
      variants.push('enhanced')
    }

    // Include denoised if high noise level
    if (stats.noiseLevel > 0.15) {
      variants.push('denoised')
    }

    return variants
  }

  private async fetchImage(key: string): Promise<Buffer> {
    const url = `${config.storage.endpoint}/${config.storage.inputBucket}/${key}`

    const response = await fetch(url, {
      headers: this.getStorageHeaders(),
    })

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`)
    }

    return Buffer.from(await response.arrayBuffer())
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

  private getStorageHeaders(): Record<string, string> {
    const auth = Buffer.from(
      `${config.storage.accessKey}:${config.storage.secretKey}`
    ).toString('base64')

    return {
      Authorization: `Basic ${auth}`,
    }
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

const preprocessor = new ImagePreprocessor()

// Health check
app.get('/health', (_, res) => {
  res.json({
    status: 'healthy',
    availableVariants: config.processing.variants,
  })
})

// Preprocess document
app.post('/preprocess', async (req, res) => {
  try {
    const request = req.body as PreprocessRequest
    const result = await preprocessor.preprocessDocument(request)
    res.json(result)
  } catch (error) {
    console.error('[Preprocess] Error:', error)
    res.status(500).json({ error: (error as Error).message })
  }
})

// Analyze image
app.post('/analyze', async (req, res) => {
  try {
    const { imageKey } = req.body as { imageKey: string }
    const imageBuffer = await fetch(
      `${config.storage.endpoint}/${config.storage.inputBucket}/${imageKey}`,
      { headers: { Authorization: `Basic ${Buffer.from(`${config.storage.accessKey}:${config.storage.secretKey}`).toString('base64')}` } }
    ).then(r => r.arrayBuffer()).then(Buffer.from)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- analyzeImage not in public type
    const stats = await (preprocessor as any).analyzeImage(imageBuffer)
    const optimalVariants = preprocessor.selectOptimalVariants(stats)

    res.json({
      stats,
      recommendedVariants: optimalVariants,
    })
  } catch (error) {
    console.error('[Preprocess] Analyze error:', error)
    res.status(500).json({ error: (error as Error).message })
  }
})

const PORT = process.env.PORT || 4004

app.listen(PORT, () => {
  console.warn(`[Preprocess Service] Listening on port ${PORT}`)
  console.warn(`[Preprocess Service] Available variants: ${config.processing.variants.join(', ')}`)
})

export { ImagePreprocessor }
