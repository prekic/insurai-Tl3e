import { extractPolicyFromDocument } from '../src/lib/ai/policy-extractor'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import dotenv from 'dotenv'

dotenv.config()

// Polyfill import.meta.env for tsx
if (!(import.meta as any).env) {
  ;(import.meta as any).env = { DEV: process.env.NODE_ENV !== 'production' }
}

import { test } from 'vitest'

// Polyfill DOMMatrix for PDF.js in JSDOM
if (typeof global !== 'undefined' && !(global as any).DOMMatrix) {
  ;(global as any).DOMMatrix = class DOMMatrix {
    constructor() {}
  }
}

if (typeof File !== 'undefined' && !File.prototype.arrayBuffer) {
  File.prototype.arrayBuffer = async function () {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = reject
      reader.readAsArrayBuffer(this)
    })
  }
}

test('extract policy from pdf', async () => {
  console.log(
    'ENV CHECK:',
    (import.meta as any).env?.VITE_API_PROXY_URL,
    process.env.VITE_API_PROXY_URL
  )
  // NOTE: You must provide a valid PDF file path here
  // If the file doesn't exist, the test will log a message and skip
  const filename = process.env.PDF_FILENAME || 'KASKO POLİÇESİ.pdf'
  const filePath = path.join(process.cwd(), 'upload/real-kasko-pdf', filename)
  console.log(`Extracting from ${filePath}`)

  const buf = await fs.readFile(filePath)
  const file = new File([buf], filename, { type: 'application/pdf' })

  try {
    console.log('Starting extraction...')
    const result = await extractPolicyFromDocument(file)
    console.log('Extraction complete!')
    await fs.writeFile('extraction_result.json', JSON.stringify(result, null, 2))
    console.log('Result saved to extraction_result.json')
    if (!result.success) {
      console.error('Extraction failed:', result.error)
      return
    }

    // Quick findings summary
    const pol = result.policy
    console.log('\n--- Policy Summary ---')
    console.log(`Provider: ${pol.provider}`)
    console.log(`Type: ${pol.type}`)
    console.log(`Premium Net: ${pol.premium?.netAmount} ${pol.premium?.currency}`)
    console.log(
      `Vehicle: ${pol.vehicleInfo?.make} ${pol.vehicleInfo?.model} (${pol.vehicleInfo?.year})`
    )
    console.log(`Coverages: ${pol.coverages?.length || 0}`)
    console.log(`Exclusions: ${pol.exclusions?.length || 0}`)
    console.log(`AI Confidence: ${pol.aiConfidence}`)

    if ((result as any).insights) {
      console.log('\n--- AI Insights ---')
      console.log('Strengths:', (result as any).insights.strengths?.length)
      console.log('Gaps:', (result as any).insights.gaps?.length)
    }
  } catch (e) {
    console.error('Failed:', e)
  }
}, 300000) // 5 minute timeout
