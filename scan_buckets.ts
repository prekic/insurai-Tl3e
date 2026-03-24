/* eslint-disable no-console */
import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
dotenv.config({ path: '.env' })

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env file')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function scan() {
  const { data: policies, error } = await supabase.from('policies').select('*')
  if (error) {
    console.error(error)
    return
  }

  const buckets = {
    modern: [],
    recoverableFromRawData: [],
    requiresReExtraction: [],
    unrecoverable: [],
  }

  for (const p of policies) {
    const hasInsuredDB = !!p.insured
    const hasDatesDB = !!(p.start_date && p.end_date)

    // Check if it's already "modern" or fully hydrated
    if (hasInsuredDB && hasDatesDB) {
      buckets.modern.push(p)
      continue
    }

    // Attempt to recover from raw_data or extracted_data
    const rd = p.raw_data || {}
    const ed = p.extracted_data || {}

    const possibleInsured =
      rd.insured?.name || rd.insuredName || ed.insured?.name || ed.insured || ed.metadata?.insured
    const possibleStart = rd.startDate || ed.startDate
    const possibleExpiry = rd.endDate || ed.expiryDate || rd.expiryDate

    const effectivelyHasInsured = hasInsuredDB || possibleInsured
    const effectivelyHasDates = hasDatesDB || (possibleStart && possibleExpiry)

    if (effectivelyHasInsured && effectivelyHasDates) {
      buckets.recoverableFromRawData.push(p)
      continue
    }

    // Needs re-extraction
    if (rd.processedText) {
      buckets.requiresReExtraction.push(p)
    } else {
      buckets.unrecoverable.push(p)
    }
  }

  console.log(`Total Policies: ${policies.length}`)
  console.log(`Modern: ${buckets.modern.length}`)
  console.log(`Recoverable from Raw Data: ${buckets.recoverableFromRawData.length}`)
  console.log(`Requires Re-extraction: ${buckets.requiresReExtraction.length}`)
  console.log(`Unrecoverable: ${buckets.unrecoverable.length}`)

  const sample = (arr: Record<string, unknown>[]) =>
    arr.slice(0, 2).map((p) => {
      const rawData = p.raw_data as Record<string, unknown> | undefined
      return {
        id: p.id,
        policy_number: p.policy_number,
        has_text: !!rawData?.processedText,
        has_legacy_coverages: !!rawData?.coverages,
      }
    })

  console.log('\nExamples (Modern):', JSON.stringify(sample(buckets.modern), null, 2))
  console.log(
    'Examples (Recoverable):',
    JSON.stringify(sample(buckets.recoverableFromRawData), null, 2)
  )
  console.log(
    'Examples (Requires Re-extraction):',
    JSON.stringify(sample(buckets.requiresReExtraction), null, 2)
  )
  console.log('Examples (Unrecoverable):', JSON.stringify(sample(buckets.unrecoverable), null, 2))
}

scan()
