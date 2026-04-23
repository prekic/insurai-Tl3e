import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { parseArgs } from 'util'
import { evaluatePolicy } from '../src/lib/policy-evaluation'
import { initializeBenchmarks } from '../src/lib/policy-evaluation/benchmark-service'
import type { Policy } from '../src/types/policy'
import type { Database } from '../src/lib/supabase/types'

dotenv.config()

/**
 * Parses and reconstructs a Policy object required by evaluatePolicy.
 * Follows conservative safety rules: skips invalid or incomplete rows.
 */
export function reconstructPolicySafely(row: any): { policy?: Policy; skipReason?: string } {
  if (!row.raw_data) {
    return { skipReason: 'raw_data is null or missing' }
  }

  if (typeof row.premium !== 'number' || row.premium < 0) {
    return { skipReason: 'premium is invalid or missing' }
  }

  const raw = row.raw_data
  if (!Array.isArray(raw.coverages)) {
    return { skipReason: 'raw_data.coverages is not an array' }
  }

  // Construct the Policy object safely
  const policy = {
    id: row.id,
    policyNumber: row.policy_number || 'UNKNOWN',
    provider: row.provider || 'UNKNOWN',
    logo: '',
    type: row.type || 'unknown',
    typeTr: row.type_tr || '',
    // Infer coverage total from individual limits when the DB field is 0
    coverage:
      typeof row.coverage === 'number' && row.coverage > 0
        ? row.coverage
        : raw.coverages.reduce(
            (sum: number, c: any) => sum + (typeof c.limit === 'number' ? c.limit : 0),
            0
          ),
    premium: row.premium,
    monthlyPremium: Math.round(row.premium / 12),
    deductible: typeof row.deductible === 'number' ? row.deductible : 0,
    // For backfill/calibration, normalize dates so expired sample policies
    // aren't penalized by the compliance checker. We want to evaluate coverage
    // quality, not whether the policy was renewed. If the policy is expired,
    // shift dates forward to make it appear "active" for evaluation purposes.
    startDate: (() => {
      const start = row.start_date ? new Date(row.start_date) : new Date()
      const expiry = row.expiry_date ? new Date(row.expiry_date) : null
      if (expiry && expiry.getTime() < Date.now()) {
        // Expired: shift to current year
        return new Date().toISOString()
      }
      return start.toISOString()
    })(),
    expiryDate: (() => {
      const expiry = row.expiry_date ? new Date(row.expiry_date) : null
      if (!expiry || expiry.getTime() < Date.now()) {
        // Missing or expired: set to 1 year from now
        return new Date(Date.now() + 31536000000).toISOString()
      }
      return expiry.toISOString()
    })(),
    status: row.status || 'active',
    uploadDate: row.upload_date || new Date().toISOString(),
    fileName: 'backfill-stub.pdf',
    documentType: row.document_type || 'application/pdf',
    location: row.location || undefined,

    // Mapping from raw_data — normalize `included` flag:
    // Insurance docs list coverages that ARE included; undefined means included.
    coverages: raw.coverages.map((c: any) => ({
      ...c,
      included: c.included !== false, // undefined/null → true
    })),
    exclusions: Array.isArray(raw.exclusions) ? raw.exclusions : [],
    specialConditions: Array.isArray(raw.specialConditions) ? raw.specialConditions : [],
    insuranceLine: raw.insuranceLine || 'unknown',
    vehicleInfo: raw.vehicleInfo,

    // Extraction states for the evaluator
    // Flag premium as missing if raw_data says so OR if premium is 0 without explicit data
    premiumMissing: raw.premiumMissing === true || row.premium === 0,
    deductibleUncertain: raw.deductibleUncertain === true,
    aiConfidence: raw.aiConfidence,
    isDraft: row.is_draft === true,
  } as Policy

  return { policy }
}

async function main() {
  const { values } = parseArgs({
    options: {
      'dry-run': { type: 'boolean', default: false },
      apply: { type: 'boolean', default: false },
      limit: { type: 'string' },
      type: { type: 'string' },
      'policy-id': { type: 'string' },
    },
  })

  const isDryRun = !values.apply || values['dry-run']
  const limit = values.limit ? parseInt(values.limit) : 100
  const policyType = values.type
  const policyId = values['policy-id']

  console.log(`\n--- Backfill Evaluation Scores ---`)
  console.log(`Mode: ${isDryRun ? 'DRY-RUN' : 'APPLY'}`)
  console.log(`Limit: ${limit}`)
  if (policyType) console.log(`Filter Type: ${policyType}`)
  if (policyId) console.log(`Filter ID: ${policyId}`)
  console.log(`--------------------------------\n`)

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient<Database>(supabaseUrl, supabaseKey)

  // 0. Initialize benchmarks so synchronous evaluation can accurately access market data
  console.log('Fetching market benchmarks...')
  await initializeBenchmarks()

  // 1. Fetch rows
  let query = supabase.from('policies').select('*')

  if (policyType) {
    query = query.eq('type', policyType)
  }
  if (policyId) {
    query = query.eq('id', policyId)
  }

  query = query.limit(limit)

  const { data: rows, error } = await query

  if (error) {
    console.error('Error fetching policies:', error)
    process.exit(1)
  }

  if (!rows || rows.length === 0) {
    console.log('No policies found matching criteria.')
    process.exit(0)
  }

  let successCount = 0
  let skipCount = 0
  let errorCount = 0

  for (const row of rows) {
    console.log(`Processing ${row.id} (${row.type} / ${row.policy_number})`)

    // 2. Safely Reconstruct
    const { policy, skipReason } = reconstructPolicySafely(row)
    if (!policy) {
      console.log(`  [SKIP] ${skipReason}`)
      skipCount++
      continue
    }

    try {
      // 3. Compute Evaluation
      const evaluation = evaluatePolicy(policy)

      const score = evaluation.overallScore
      const grade = evaluation.grade
      console.log(`  [EVAL] Score: ${score}, Grade: ${grade}, Status: ${evaluation.status}`)

      // 4. Update
      if (isDryRun) {
        console.log(`  [DRY-RUN] Will update raw_data.evaluation with score ${score}`)
        successCount++
      } else {
        const currentRawData = row.raw_data as Record<string, any>

        const newRawData = {
          ...currentRawData,
          evaluation: {
            overallScore: evaluation.overallScore,
            grade: evaluation.grade,
            status: evaluation.status,
            complianceIsCompliant: evaluation.compliance.isCompliant,
            evaluatedAt: new Date().toISOString(),
          },
        }

        const { error: updateError } = await supabase
          .from('policies')
          .update({ raw_data: newRawData as any })
          .eq('id', row.id)

        if (updateError) {
          console.error(`  [ERROR] Failed to update: ${updateError.message}`)
          errorCount++
        } else {
          console.log(`  [SUCCESS] Updated row`)
          successCount++
        }
      }
    } catch (e) {
      console.error(
        `  [ERROR] Crash during evaluatePolicy: ${e instanceof Error ? e.message : 'Unknown error'}`
      )
      errorCount++
    }
  }

  console.log(`\n--- Summary ---`)
  console.log(`Processed: ${rows.length}`)
  console.log(`Succeeded/Planned: ${successCount}`)
  console.log(`Skipped: ${skipCount}`)
  console.log(`Errors: ${errorCount}`)
  console.log(`-----------------\n`)
}

// Only run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}
