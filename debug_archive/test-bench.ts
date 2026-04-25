import * as dotenv from 'dotenv'
dotenv.config()
import {
  initializeBenchmarks,
  getPremiumBenchmarkWithFallback,
} from '../src/lib/policy-evaluation/benchmark-service'

async function main() {
  await initializeBenchmarks()
  console.log('Cache after init:')
  console.log(getPremiumBenchmarkWithFallback('kasko'))
}
main().catch(console.error)
