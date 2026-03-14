import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import { extractPolicyFromDocument } from './policy-extractor'

// Polyfill arrayBuffer for jsdom Blob and File using FileReader
if (typeof globalThis.Blob !== 'undefined' && !globalThis.Blob.prototype.arrayBuffer) {
  globalThis.Blob.prototype.arrayBuffer = function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => reject(reader.error)
      reader.readAsArrayBuffer(this)
    })
  }
}
if (typeof globalThis.File !== 'undefined' && !globalThis.File.prototype.arrayBuffer) {
  globalThis.File.prototype.arrayBuffer = globalThis.Blob.prototype.arrayBuffer
}

describe('E2E Real Extraction', () => {
  it('should extract the policy correctly from the PDF', async () => {
    const pdfPath = 'test-data/eriş ambalaj 34 rz 9511 kasko pol .pdf'
    expect(fs.existsSync(pdfPath)).toBe(true)

    const buffer = fs.readFileSync(pdfPath)
    // Convert Node Buffer to Uint8Array so jsdom Blob/File stores binary data correctly
    const arrayBuffer = new Uint8Array(buffer).buffer
    const file = new File([arrayBuffer], 'eriş_ambalaj_kasko.pdf', { type: 'application/pdf' })

    // We expect this to run with actual real services since we don't mock them here
    // But since it's a test, maybe vitest mocks some things globally?
    // Let's rely on standard config.
    const result = await extractPolicyFromDocument(file, { useFallback: false, useOCR: true })

    console.log('--- EXTRACTION RESULT ---')
    console.log(JSON.stringify(result, null, 2))
    console.log('-------------------------')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.policy).toBeDefined()
    }
  }, 120000) // 120 seconds timeout
})
