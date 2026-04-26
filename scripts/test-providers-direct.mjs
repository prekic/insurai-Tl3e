import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')
import dotenv from 'dotenv'

dotenv.config()

async function extractTextWithPdfParse(filePath: string) {
  const dataBuffer = await fs.readFile(filePath)
  console.log(pdfParse)
  return 'dummy'
  return data.text
}

async function extractWithProvider(text: string, provider: string) {
  const url = `http://localhost:4001/api/ai/extract/${provider}`
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentText: text })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Proxy error ${response.status}: ${errorText}`)
  }

  return response.json()
}

async function runTest() {
  try {
    const filename = process.env.PDF_FILENAME || 'KASKO POLİÇESİ.pdf'
    const filePath = path.join(process.cwd(), 'upload/real-kasko-pdf', filename)
    console.log(`Extracting text from ${filePath} using pdf-parse...`)

    const text = await extractTextWithPdfParse(filePath)
    console.log(`Extracted ${text.length} characters of text.`)

    console.log('\n--- Extracting with OpenAI ---')
    const resultOpenAI = await extractWithProvider(text, 'openai')
    await fs.writeFile('extraction_openai.json', JSON.stringify(resultOpenAI, null, 2))
    console.log('OpenAI extraction saved to extraction_openai.json')

    console.log('\n--- Extracting with Anthropic ---')
    const resultAnthropic = await extractWithProvider(text, 'anthropic')
    await fs.writeFile('extraction_anthropic.json', JSON.stringify(resultAnthropic, null, 2))
    console.log('Anthropic extraction saved to extraction_anthropic.json')

    console.log('\n=== Comparison Summary ===')
    console.log('OpenAI Success:', resultOpenAI.success)
    console.log('Anthropic Success:', resultAnthropic.success)

    if (resultOpenAI.success && resultOpenAI.data) {
      console.log(`OpenAI Confidence: ${resultOpenAI.data.aiConfidence}`)
      console.log(`OpenAI Coverages: ${resultOpenAI.data.coverages?.length}`)
    }
    if (resultAnthropic.success && resultAnthropic.data) {
      console.log(`Anthropic Confidence: ${resultAnthropic.data.aiConfidence}`)
      console.log(`Anthropic Coverages: ${resultAnthropic.data.coverages?.length}`)
    }

  } catch (e) {
    console.error('Test failed:', e)
  }
}

runTest()
