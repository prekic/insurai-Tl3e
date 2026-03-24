/* eslint-disable no-console */
import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'
import { EXTRACTION_SYSTEM_PROMPT } from './src/lib/ai/extraction-schema'
import * as dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase credentials')
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function run() {
  const policyNumber = '1680600025'
  console.log(`Fetching policy ${policyNumber}...`)

  const { data: policy, error } = await supabase
    .from('policies')
    .select('*')
    .eq('policy_number', policyNumber)
    .single()

  if (error || !policy) {
    console.error('Error fetching policy:', error)
    return
  }

  if (!policy.raw_data || !policy.raw_data.processedText) {
    console.error('No processedText found in raw_data!')
    return
  }

  const ocrText = policy.raw_data.processedText
  console.log(`Found OCR text length: ${ocrText.length}. Starting re-extraction...`)

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: EXTRACTION_SYSTEM_PROMPT + '\n\nYou MUST return a JSON object.',
        },
        {
          role: 'user',
          content: `Please extract the insurance policy information from this document:\n\n${ocrText}`,
        },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.1,
    })

    const choice = response.choices[0]
    const content = choice?.message?.content
    if (!content) {
      console.error('No content in AI response')
      return
    }
    const extractedData = JSON.parse(content)
    console.log('Extraction complete! Data:', JSON.stringify(extractedData, null, 2))

    // Now update the DB record
    const { error: updateError } = await supabase
      .from('policies')
      .update({
        raw_data: {
          ...policy.raw_data,
          ...extractedData,
        },
        insured: extractedData.insuredName,
      })
      .eq('id', policy.id)

    if (updateError) {
      console.error('Error updating record:', updateError)
    } else {
      console.log('Successfully updated DB record with re-extracted data.')
    }
  } catch (err) {
    console.error('Extraction failed:', err)
  }
}

run()
