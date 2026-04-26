import { extractPolicyFromDocument } from './lib/ai/policy-extractor'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import dotenv from 'dotenv'
import { test } from 'vitest'

dotenv.config()

// Polyfill import.meta.env for tsx
if (!(import.meta as any).env) {
  ;(import.meta as any).env = { 
    ...process.env,
    DEV: process.env.NODE_ENV !== 'production' 
  }
}

// Polyfill DOMMatrix for PDF.js
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

test('multi-provider extraction', async () => {
  const filename = process.env.PDF_FILENAME || 'KASKO POLİÇESİ.pdf'
  const filePath = path.join(process.cwd(), 'upload/real-kasko-pdf', filename)
  console.log(`Extracting from ${filePath}`)

  const buf = await fs.readFile(filePath)
  const file = new File([buf], filename, { type: 'application/pdf' })

  try {
    console.log('\n--- Extracting with OpenAI ---')
    const resultOpenAI = await extractPolicyFromDocument(file, { primaryProvider: 'openai' })
    await fs.writeFile('extraction_openai.json', JSON.stringify(resultOpenAI, null, 2))
    console.log('OpenAI extraction saved to extraction_openai.json')

    console.log('\n--- Extracting with Anthropic ---')
    const resultAnthropic = await extractPolicyFromDocument(file, { primaryProvider: 'anthropic' })
    await fs.writeFile('extraction_anthropic.json', JSON.stringify(resultAnthropic, null, 2))
    console.log('Anthropic extraction saved to extraction_anthropic.json')

    // Quick comparison summary
    console.log('\n=== Comparison Summary ===')
    if (resultOpenAI.success && resultAnthropic.success) {
      console.log('Both extractions successful.')
      console.log(`OpenAI Confidence: ${resultOpenAI.policy?.aiConfidence}`)
      console.log(`Anthropic Confidence: ${resultAnthropic.policy?.aiConfidence}`)
      console.log(`OpenAI Coverages: ${resultOpenAI.policy?.coverages?.length}`)
      console.log(`Anthropic Coverages: ${resultAnthropic.policy?.coverages?.length}`)
      
      if ((resultOpenAI as any).insights) {
          console.log(`OpenAI Insights (Strengths): ${(resultOpenAI as any).insights.strengths?.length}`)
      }
      if ((resultAnthropic as any).insights) {
          console.log(`Anthropic Insights (Strengths): ${(resultAnthropic as any).insights.strengths?.length}`)
      }
    } else {
      console.error('One or both extractions failed.')
    }
  } catch (e) {
    console.error('Failed:', e)
  }
}, 300000)
