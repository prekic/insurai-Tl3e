import fs from 'fs'
import path from 'path'
import { runStage2Validation } from '../src/lib/policy-pipeline/stage2-validate/orchestrator.js'

const dir = path.resolve('tests/fixtures/baseline/T0')
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))

function findDiffs(obj1: any, obj2: any, pathPrefix: string, results: string[]) {
  const keys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})])
  for (const k of keys) {
    const fullPath = pathPrefix ? `${pathPrefix}.${k}` : k
    const v1 = obj1?.[k]
    const v2 = obj2?.[k]
    if (JSON.stringify(v1) !== JSON.stringify(v2)) {
      if (
        typeof v1 === 'object' &&
        typeof v2 === 'object' &&
        v1 !== null &&
        v2 !== null &&
        !Array.isArray(v1)
      ) {
        findDiffs(v1, v2, fullPath, results)
      } else {
        results.push(fullPath)
      }
    }
  }
}

function normalize(d: any) {
  const clone = JSON.parse(JSON.stringify(d))
  // Use the real orchestrator logic!
  const stage2 = runStage2Validation(clone.data ?? clone)

  // Isolate ONLY the fields governed by Stage 2 canonicalization
  const conceptSet = {
    entityType: stage2?.entityType,
    coverages: stage2?.coverages
      ?.map((c: any) => ({
        canonicalName: c.canonicalName,
        nameTr: c.nameTr,
        limit: c.parsedLimit?.amount ?? c.limit,
        isUnlimited: c.parsedLimit?.type === 'unlimited' ? true : c.isUnlimited,
        isMarketValue: c.parsedLimit?.type === 'market_value' ? true : c.isMarketValue,
        isImplicit: c.isImplicit || false,
      }))
      .sort((a: any, b: any) => (a.canonicalName || '').localeCompare(b.canonicalName || '')),
  }

  return JSON.stringify(conceptSet, null, 0)
}

let totalFixtures = 0
let stableFixtures = 0

for (const file of files) {
  const data = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'))
  const runs = data.runs.filter((r: any) => !r.error)
  console.log(`\n=== ${data.fixture} ===`)
  console.log(`  Successful runs: ${runs.length} / ${data.runs.length}`)

  if (runs.length < 2) {
    console.log('  INSUFFICIENT RUNS for comparison')
    continue
  }

  totalFixtures++
  const normalized = runs.map(normalize)
  const allIdentical = normalized.every((n: string) => n === normalized[0])

  if (allIdentical) {
    console.log(`  ✅ IDENTICAL (Concept Set) across ${runs.length} runs`)
    stableFixtures++
  } else {
    for (let i = 1; i < normalized.length; i++) {
      if (normalized[i] === normalized[0]) {
        console.log(`  ✅ run0 vs run${i}: IDENTICAL`)
        continue
      }
      const a = JSON.parse(normalized[0])
      const b = JSON.parse(normalized[i])

      const coveragesA = new Set(a.coverages?.map((c: any) => c.canonicalName))
      const coveragesB = new Set(b.coverages?.map((c: any) => c.canonicalName))

      const onlyInA = [...coveragesA].filter((x) => !coveragesB.has(x))
      const onlyInB = [...coveragesB].filter((x) => !coveragesA.has(x))

      if (onlyInA.length > 0 || onlyInB.length > 0) {
        console.log(`  ❌ run0 vs run${i}: Coverage variance`)
        if (onlyInA.length > 0) console.log(`    Only in run0: ${onlyInA.join(', ')}`)
        if (onlyInB.length > 0) console.log(`    Only in run${i}: ${onlyInB.join(', ')}`)
      } else {
        const diffs: string[] = []
        findDiffs(a, b, '', diffs)
        console.log(`  ❌ run0 vs run${i}: ${diffs.length} field diffs: ${diffs.join(', ')}`)
        if (diffs.includes('coverages')) {
          console.log(`    run0 coverages: ${JSON.stringify(a.coverages, null, 2)}`)
          console.log(`    run${i} coverages: ${JSON.stringify(b.coverages, null, 2)}`)
        }
      }
    }
  }
}

console.log(
  `\nResults: ${stableFixtures} / ${totalFixtures} fixtures are deterministically canonicalized.`
)
