import * as fs from 'fs'
import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { PDFParse } = require('pdf-parse')

async function test() {
  console.log('Reading PDF...')
  const buffer = fs.readFileSync('test-data/sample-kasko-policy.pdf')
  const pdfParser = new PDFParse(new Uint8Array(buffer))
  const result = await pdfParser.getText()

  console.log(`Extracted ${result.text.length} chars. Calling local backend API...`)

  const response = await fetch('http://localhost:4001/api/ai/extract/anthropic', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documentText: result.text.substring(0, 15000), prompt: 'extract' }), // The prompt will be ignored or combined
  })

  if (!response.ok) {
    console.error('API Error:', await response.text())
    return
  }

  const data = await response.json()
  console.log('Extraction success:', data.success)

  if (data.data) {
    console.log(JSON.stringify(data.data, null, 2))
  } else {
    console.error('No extraction data:', data)
  }
}

test().catch(console.error)
