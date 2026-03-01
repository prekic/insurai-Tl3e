/**
 * Performance Profiling Script for Actuarial Engine
 *
 * Measures execution time of calculateEOOP for varying simulation counts.
 */

import { calculateEOOP } from '../src/lib/actuarial-engine/layer-c/monte-carlo'
import { KASKO_SCENARIOS } from '../src/lib/actuarial-engine/layer-c/scenario-library'
import { ActuarialPolicyInput } from '../src/lib/actuarial-engine/types'

const mockPolicy: ActuarialPolicyInput = {
  policyId: 'perf-test',
  policyType: 'kasko',
  premium: { currency: 'TRY', amount: 5000 },
  effectiveDate: new Date().toISOString(),
  expiryDate: new Date(Date.now() + 31536000000).toISOString(),
  coverages: [
    { code: 'COLLISION', included: true, limit: { value: { currency: 'TRY', amount: 500000 } } },
    { code: 'THEFT', included: true, limit: { value: { currency: 'TRY', amount: 500000 } } },
  ],
  exclusionTexts: [],
}

async function runProfile() {
  const iterations = [10_000, 25_000, 50_000, 100_000]

  console.log('--- Actuarial Engine Performance Profile ---')
  console.log('Policy: Kasko, Scenarios: ' + KASKO_SCENARIOS.length)

  for (const n of iterations) {
    const start = performance.now()
    calculateEOOP(mockPolicy, KASKO_SCENARIOS, { numSimulations: n })
    const end = performance.now()
    console.log(`n=${n.toLocaleString().padEnd(8)} | Time: ${(end - start).toFixed(2)}ms`)
  }
}

runProfile().catch(console.error)
