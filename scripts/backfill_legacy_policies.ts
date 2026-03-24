import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import OpenAI from 'openai'

dotenv.config({ path: '.env' })

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY!
)

// We strip arrays from the prompt to prevent the LLM from hallucinating coverages
// and table-shifting priorities, keeping the targeted extraction strictly to Top-level Headers.
const HEADER_EXTRACTION_PROMPT = `Extract ONLY the following header/identity fields from this insurance policy text. 
DO NOT extract coverages, exclusions, or complex arrays.

Return a JSON object matching this schema EXACTLY:
{
  "policyType": "string (kasko, traffic, home, health, life, dask, business, nakliyat)",
  "policyNumber": "string",
  "provider": "string",
  "insuredName": "string (The name of the insured person or company)",
  "startDate": "string (YYYY-MM-DD)",
  "endDate": "string (YYYY-MM-DD)",
  "premium": { "amount": number, "currency": "TRY" }
}`

const isDryRun = process.argv.includes('--dry-run')
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined

async function run() {
  console.log(`Fetching policies for legacy backfill... (DRY RUN: ${isDryRun})`)
  let query = supabase.from('policies').select('*')
  if (limit) {
    query = query.limit(limit)
  }

  const { data: policies, error } = await query

  if (error) {
    console.error('Failed to fetch policies:', error)
    return
  }

  const buckets = {
    modern: [] as any[],
    recoverableFromRawData: [] as any[],
    requiresReExtraction: [] as any[],
    unrecoverable: [] as any[],
  }

  // 1. Scan and Classify
  for (const p of policies) {
    const hasInsuredDB = !!p.insured
    const hasDatesDB = !!(p.start_date && p.end_date)

    if (hasInsuredDB && hasDatesDB) {
      buckets.modern.push(p)
      continue
    }

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

    if (rd.processedText) {
      buckets.requiresReExtraction.push(p)
    } else {
      buckets.unrecoverable.push(p)
    }
  }

  console.log()
  console.log(`Total Policies: ${policies.length}`)
  console.log(`Modern (No Action): ${buckets.modern.length}`)
  console.log(`Recoverable from Raw Data: ${buckets.recoverableFromRawData.length}`)
  console.log(`Requires Re-extraction: ${buckets.requiresReExtraction.length}`)
  console.log(`Unrecoverable: ${buckets.unrecoverable.length}`)
  console.log()

  let updatedCount = 0

  // 2. Hydrate Recoverable
  console.log('--- Hydrating from Raw Data ---')
  for (const p of buckets.recoverableFromRawData) {
    const rd = p.raw_data || {}
    const ed = p.extracted_data || {}

    // Prefer raw_data for legacy fields as per strategy
    const insured =
      rd.insured?.name ||
      rd.insuredName ||
      ed.insured?.name ||
      ed.insured ||
      ed.metadata?.insured ||
      p.insured
    const startDate = rd.startDate || ed.startDate || p.start_date
    const expiryDate = rd.endDate || ed.expiryDate || rd.expiryDate || p.end_date

    // Safety check: Don't mutate DB if no actual changes will be made
    if (insured !== p.insured || startDate !== p.start_date || expiryDate !== p.end_date) {
      console.log(`\n[DRY RUN: ${isDryRun}] Hydrating policy ${p.policy_number} (${p.id})...`)
      console.log(`  - Updating 'insured': '${p.insured}' -> '${insured}'`)
      console.log(`  - Updating 'start_date': '${p.start_date}' -> '${startDate}'`)
      console.log(`  - Updating 'end_date': '${p.end_date}' -> '${expiryDate}'`)

      if (!isDryRun) {
        const { error: updateError } = await supabase
          .from('policies')
          .update({
            insured: insured,
            start_date: startDate,
            end_date: expiryDate,
          })
          .eq('id', p.id)

        if (updateError) {
          console.error(`Failed to update ${p.id}:`, updateError)
        } else {
          updatedCount++
        }
      } else {
        updatedCount++ // count for simulation
      }
    }
  }

  // 3. Targeted Re-extraction
  console.log('\n--- Processing Targeted Re-extractions ---')
  for (const p of buckets.requiresReExtraction) {
    console.log(
      `\n[DRY RUN: ${isDryRun}] Re-extracting headers for policy ${p.policy_number} (${p.id})...`
    )
    const rawText = p.raw_data.processedText

    try {
      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
      // Call OpenAI with our targeted header prompt (Array stripping is enforced by prompt schema)
      let aiResponse

      if (!isDryRun) {
        const response = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'You MUST return a JSON object.',
            },
            {
              role: 'user',
              content: `${HEADER_EXTRACTION_PROMPT}\n\nDocument text:\n${rawText}`,
            },
          ],
          response_format: { type: 'json_object' },
        })
        aiResponse = JSON.parse(response.choices[0]!.message!.content!)
      } else {
        // Mock response for quick dry-runs without burning tokens unnecessarily
        aiResponse = {
          insuredName: 'DRY RUN MOCKED INSURED INC.',
          startDate: '2023-01-01',
          endDate: '2024-01-01',
        }
      }

      const newInsured = aiResponse.insuredName || aiResponse.insured?.name
      const newStartDate = aiResponse.startDate
      const newExpiryDate = aiResponse.endDate || aiResponse.expiryDate

      // Update the row. Notice we leave `p.raw_data.coverages` COMPLETELY untouched.
      // This strictly enforces the "legacy arrays remain authoritative" rule by definition.
      if (newInsured || newStartDate || newExpiryDate) {
        console.log(`  - Extracted 'insuredName': '${newInsured}'`)
        console.log(`  - Extracted 'startDate': '${newStartDate}'`)
        console.log(`  - Extracted 'endDate': '${newExpiryDate}'`)
        // Also map to raw_data so the UI `policyRowToAnalyzedPolicy` catches them
        const updatedRawData = {
          ...p.raw_data,
          insuredName: newInsured || p.raw_data.insuredName,
          startDate: newStartDate || p.raw_data.startDate,
          endDate: newExpiryDate || p.raw_data.endDate,
        }

        if (!isDryRun) {
          const { error: updateError } = await supabase
            .from('policies')
            .update({
              insured: newInsured || p.insured,
              start_date: newStartDate || p.start_date,
              end_date: newExpiryDate || p.end_date,
              raw_data: updatedRawData,
            })
            .eq('id', p.id)

          if (updateError) {
            console.error(`Failed to update ${p.id}:`, updateError)
          } else {
            updatedCount++
            console.log(`Successfully re-extracted headers for ${p.policy_number}.`)
          }
        } else {
          updatedCount++
          console.log(`[DRY RUN] Would update row and raw_data (legacy arrays preserved).`)
        }
      } else {
        console.log(`Re-extraction yielded no missing identity fields for ${p.policy_number}.`)
      }
    } catch (err) {
      console.error(`AI Extraction failed for ${p.id}:`, err)
    }

    // Delay to respect AI rate limits
    if (!isDryRun) await new Promise((resolve) => setTimeout(resolve, 1500))
  }

  console.log('\n--- Backfill Complete ---')
  console.log(
    `Successfully ${isDryRun ? 'simulated updating' : 'updated'} ${updatedCount} records.`
  )

  if (buckets.unrecoverable.length > 0) {
    console.log(
      '\nWARNING: The following policy IDs are completely unrecoverable and will show "Cannot Verify" fallback labels in reviewer:'
    )
    buckets.unrecoverable.forEach((p) => {
      console.log(`- ${p.id} (Number: ${p.policy_number})`)
    })
  }
}

run().catch(console.error)
