import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import path from 'path'

// Load environment variables from .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') })

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials in .env file')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkLegacyShapes() {
  const { data: policies, error } = await supabase
    .from('policies')
    .select('id, policy_number, raw_data, status')
    .eq('status', 'active')
    .limit(100)

  if (error) {
    console.error('Error fetching policies:', error)
    return
  }

  console.log('Querying recent active policies (limit 100) to check for legacy missing fields...')
  let totalChecked = 0
  let missingInsuredCount = 0
  let missingPeriodCount = 0
  let missingBothCount = 0

  for (const p of policies) {
    totalChecked++

    const hasInsured = p.raw_data?.insured?.name || p.raw_data?.insuredName

    // Check period/date presence across all locations
    const hasPeriod = p.raw_data?.period || (p.raw_data?.startDate && p.raw_data?.endDate)

    if (!hasInsured && !hasPeriod) {
      missingBothCount++
    } else {
      if (!hasInsured) missingInsuredCount++
      if (!hasPeriod) missingPeriodCount++
    }
  }

  console.log('=== Legacy Shape Scan Results ===')
  console.log(`Total active policies scanned: ${totalChecked}`)
  console.log(`Missing Insured ONLY: ${missingInsuredCount}`)
  console.log(`Missing Period ONLY: ${missingPeriodCount}`)
  console.log(`Missing BOTH Insured and Period: ${missingBothCount}`)
  console.log(
    `Total requiring re-extraction backfill: ${missingInsuredCount + missingPeriodCount + missingBothCount}`
  )
}

checkLegacyShapes()
