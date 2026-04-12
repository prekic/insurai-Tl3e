import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

// We use the hardened standalone parser specifically built for robust DD.MM.YYYY handling.
import { parseExtractedDate } from './_simple-date-parser'

dotenv.config()

/**
 * STRATEGY DECISION for existing corrupted policies rows:
 * We MUST RE-PARSE from raw_data. Accepting historical inaccuracy is not an option
 * since date correctness is vital to the Actuarial Engine (days until expiry, status, etc.).
 *
 * This script identifies rows in the `policies` table where dates were captured
 * with the DD.MM.YYYY bug (v8 Date Day/Month swap) and re-parses them using
 * the robust `parseExtractedDate` logic.
 */
async function runBackfill() {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('❌ Missing Supabase credentials in .env')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  console.log('🔍 Executing audit query for KASKO policies with potential date bug...')

  // This matches the exact SQL pattern specified in the Handoff.
  // We fetch those where raw_data exists and has dot-separated format which might have been swapped.
  // Using the Supabase eq and raw text match limits us slightly via the client,
  // but we can pull the range and evaluate the regex in-memory to be perfectly safe.
  const { data: policies, error: fetchError } = await supabase
    .from('policies')
    .select('id, start_date, expiry_date, raw_data')
    .eq('type', 'kasko')
    .not('raw_data', 'is', null)

  if (fetchError) {
    console.error('❌ Failed to fetch policies:', fetchError)
    process.exit(1)
  }

  const datePattern = /^\d{1,2}\.\d{1,2}\.\d{4}$/
  let updatedCount = 0

  for (const policy of policies) {
    const rawData = policy.raw_data as any
    const rawStart = rawData.startDate
    const rawEnd = rawData.endDate

    const fixStart = typeof rawStart === 'string' && datePattern.test(rawStart)
    const fixEnd = typeof rawEnd === 'string' && datePattern.test(rawEnd)

    if (fixStart || fixEnd) {
      const updates: { start_date?: string; expiry_date?: string } = {}

      if (fixStart) {
        const correctStart = parseExtractedDate(rawStart, 0)
        if (correctStart && correctStart !== policy.start_date) {
          updates.start_date = correctStart
        }
      }

      if (fixEnd) {
        const correctEnd = parseExtractedDate(rawEnd, 365)
        if (correctEnd && correctEnd !== policy.expiry_date) {
          updates.expiry_date = correctEnd
        }
      }

      if (Object.keys(updates).length > 0) {
        console.log(`🔄 Updating policy ${policy.id}...`, updates)

        const { error: updateError } = await supabase
          .from('policies')
          .update(updates)
          .eq('id', policy.id)

        if (updateError) {
          console.error(`❌ Failed to update policy ${policy.id}:`, updateError)
        } else {
          updatedCount++
        }
      }
    }
  }

  console.log(`\n✅ Backfill complete. Rows updated: ${updatedCount}`)
}

runBackfill().catch(console.error)
