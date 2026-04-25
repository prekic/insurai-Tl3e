/**
 * Test script for AI policy extraction
 *
 * Usage: npx tsx scripts/test-ai-extraction.ts [path-to-pdf]
 */

import * as fs from 'fs'
import * as path from 'path'
import { createRequire } from 'module'

// Load environment variables
import { config } from 'dotenv'
config()

// Use pdf-parse for Node.js
const require = createRequire(import.meta.url)
const { PDFParse } = require('pdf-parse')

const OPENAI_API_KEY = process.env.VITE_OPENAI_API_KEY

async function extractTextFromPDFNode(pdfPath: string): Promise<{ text: string; pageCount: number }> {
  const buffer = fs.readFileSync(pdfPath)
  const uint8Array = new Uint8Array(buffer)
  const pdfParser = new PDFParse(uint8Array)
  const result = await pdfParser.getText()

  return {
    text: result.text,
    pageCount: result.total || result.pages?.length || 0,
  }
}

async function testExtraction(pdfPath: string) {
  console.log('='.repeat(60))
  console.log('🔬 AI Policy Extraction Test')
  console.log('='.repeat(60))

  // Check if OpenAI is configured
  if (!OPENAI_API_KEY || OPENAI_API_KEY === 'sk-...') {
    console.log('\n❌ OpenAI API key not configured')
    console.log('Set VITE_OPENAI_API_KEY in .env file')
    process.exit(1)
  }
  console.log('\n✅ OpenAI API key configured')

  // Resolve path
  const resolvedPath = path.resolve(pdfPath)

  // Check if file exists
  if (!fs.existsSync(resolvedPath)) {
    console.log(`\n❌ PDF file not found: ${resolvedPath}`)
    process.exit(1)
  }

  const stats = fs.statSync(resolvedPath)
  console.log(`\n📄 PDF File: ${path.basename(resolvedPath)}`)
  console.log(`   Size: ${(stats.size / 1024).toFixed(1)} KB`)

  // Step 1: Extract text from PDF
  console.log('\n📝 Step 1: Extracting text from PDF...')
  try {
    const pdfResult = await extractTextFromPDFNode(resolvedPath)

    console.log(`   ✅ Extracted ${pdfResult.text.length} characters`)
    console.log(`   📃 Pages: ${pdfResult.pageCount}`)

    // Show first 1500 characters of extracted text
    const previewText = pdfResult.text.substring(0, 1500)
    console.log('\n📖 Text Preview (first 1500 chars):')
    console.log('-'.repeat(50))
    console.log(previewText)
    console.log('-'.repeat(50))

    // Step 2: Call OpenAI for extraction
    console.log('\n🤖 Step 2: Calling OpenAI GPT-4o for structured extraction...')
    console.log('   (This may take 10-20 seconds...)')

    const startTime = Date.now()

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an expert at extracting structured data from Turkish insurance policy documents.
Extract the following fields from the policy text. Return JSON only.

Fields to extract:
- policyNumber: Policy/Poliçe numarası
- provider: Insurance company name / Sigorta şirketi adı
- policyType: Type - one of: kasko, traffic, home, health, life, dask, business
- policyTypeTr: Turkish name of policy type
- insuredPerson: Name of insured / Sigortalı adı
- startDate: Policy start date (YYYY-MM-DD format)
- endDate: Policy end date (YYYY-MM-DD format)
- premium: Total premium amount (number only, no currency)
- coverage: Total coverage/limit amount (number only)
- deductible: Deductible/Muafiyet amount (number only)
- vehicleInfo: For auto policies - object with {plate, make, model, year, chassisNumber}
- propertyInfo: For property policies - object with {address, type, size}
- coverages: Array of coverage items, each with {name, nameTr, limit, deductible, included: boolean}
- exclusions: Array of exclusion items (strings)
- specialConditions: Array of special conditions (strings)
- confidence: Object with confidence scores (0.0-1.0) for: policyNumber, provider, premium, coverage, dates

If a field cannot be found, use null.
For currency amounts, extract just the number (e.g., "10.000 TL" becomes 10000).
Return valid JSON only, no markdown code blocks.`,
          },
          {
            role: 'user',
            content: `Extract policy data from this Turkish insurance document:\n\n${pdfResult.text}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    })

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)

    if (!response.ok) {
      const errorText = await response.text()
      console.log(`\n❌ OpenAI API error: ${response.status}`)
      console.log(errorText)
      process.exit(1)
    }

    const result = await response.json()
    const extractedData = JSON.parse(result.choices[0].message.content)

    console.log(`   ✅ Completed in ${elapsed}s`)

    console.log('\n' + '='.repeat(60))
    console.log('📋 EXTRACTED POLICY DATA')
    console.log('='.repeat(60))
    console.log(JSON.stringify(extractedData, null, 2))
    console.log('='.repeat(60))

    // Summary
    console.log('\n📊 EXTRACTION SUMMARY')
    console.log('-'.repeat(40))
    console.log(`   Policy Number:  ${extractedData.policyNumber || '⚠️ Not found'}`)
    console.log(`   Provider:       ${extractedData.provider || '⚠️ Not found'}`)
    console.log(`   Type:           ${extractedData.policyTypeTr || extractedData.policyType || '⚠️ Not found'}`)
    console.log(`   Insured:        ${extractedData.insuredPerson || '⚠️ Not found'}`)
    console.log(
      `   Premium:        ${extractedData.premium ? `₺${Number(extractedData.premium).toLocaleString('tr-TR')}` : '⚠️ Not found'}`
    )
    console.log(
      `   Total Coverage: ${extractedData.coverage ? `₺${Number(extractedData.coverage).toLocaleString('tr-TR')}` : '⚠️ Not found'}`
    )
    console.log(
      `   Deductible:     ${extractedData.deductible ? `₺${Number(extractedData.deductible).toLocaleString('tr-TR')}` : 'None'}`
    )
    console.log(`   Period:         ${extractedData.startDate || '?'} → ${extractedData.endDate || '?'}`)

    if (extractedData.vehicleInfo) {
      console.log('\n🚗 Vehicle Information:')
      console.log(`   Plate:   ${extractedData.vehicleInfo.plate || 'N/A'}`)
      console.log(`   Make:    ${extractedData.vehicleInfo.make || 'N/A'}`)
      console.log(`   Model:   ${extractedData.vehicleInfo.model || 'N/A'}`)
      console.log(`   Year:    ${extractedData.vehicleInfo.year || 'N/A'}`)
      if (extractedData.vehicleInfo.chassisNumber) {
        console.log(`   Chassis: ${extractedData.vehicleInfo.chassisNumber}`)
      }
    }

    if (extractedData.propertyInfo) {
      console.log('\n🏠 Property Information:')
      console.log(`   Address: ${extractedData.propertyInfo.address || 'N/A'}`)
      console.log(`   Type:    ${extractedData.propertyInfo.type || 'N/A'}`)
    }

    if (extractedData.coverages?.length) {
      console.log(`\n📋 Coverages (${extractedData.coverages.length} items):`)
      for (const cov of extractedData.coverages.slice(0, 8)) {
        const limit = cov.limit ? `₺${Number(cov.limit).toLocaleString('tr-TR')}` : 'N/A'
        const status = cov.included ? '✅' : '❌'
        console.log(`   ${status} ${cov.nameTr || cov.name}: ${limit}`)
      }
      if (extractedData.coverages.length > 8) {
        console.log(`   ... and ${extractedData.coverages.length - 8} more`)
      }
    }

    if (extractedData.exclusions?.length) {
      console.log(`\n⛔ Exclusions (${extractedData.exclusions.length} items):`)
      for (const exc of extractedData.exclusions.slice(0, 5)) {
        console.log(`   - ${exc}`)
      }
    }

    if (extractedData.confidence) {
      console.log('\n📈 Confidence Scores:')
      for (const [key, value] of Object.entries(extractedData.confidence)) {
        const score = Number(value) * 100
        const bar = '█'.repeat(Math.round(score / 10)) + '░'.repeat(10 - Math.round(score / 10))
        const color = score >= 80 ? '🟢' : score >= 60 ? '🟡' : '🔴'
        console.log(`   ${color} ${key.padEnd(15)}: ${bar} ${score.toFixed(0)}%`)
      }
    }

    // Token usage & cost
    if (result.usage) {
      console.log('\n💰 API Usage:')
      console.log(`   Input tokens:  ${result.usage.prompt_tokens.toLocaleString()}`)
      console.log(`   Output tokens: ${result.usage.completion_tokens.toLocaleString()}`)
      console.log(`   Total tokens:  ${result.usage.total_tokens.toLocaleString()}`)
      // GPT-4o pricing: $2.50/1M input, $10/1M output
      const cost = (result.usage.prompt_tokens * 2.5 + result.usage.completion_tokens * 10) / 1000000
      console.log(`   Est. cost:     $${cost.toFixed(4)}`)
    }

    console.log('\n' + '='.repeat(60))
    console.log('✅ TEST COMPLETED SUCCESSFULLY')
    console.log('='.repeat(60))
  } catch (error) {
    console.log(`\n❌ Error: ${error}`)
    console.error(error)
    process.exit(1)
  }
}

// Run test
const pdfPath = process.argv[2] || './test-data/sample-kasko-policy.pdf'
testExtraction(pdfPath)
