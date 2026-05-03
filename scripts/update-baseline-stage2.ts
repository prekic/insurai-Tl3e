import fs from 'fs'
import path from 'path'
import { runStage2Validation } from '../src/lib/policy-pipeline/stage2-validate/orchestrator.js'

const dir = path.resolve('tests/fixtures/baseline/T0')
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'))

for (const file of files) {
  const filePath = path.join(dir, file)
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  let updated = false

  for (const run of data.runs) {
    if (run.success && run.data) {
      const stage2 = runStage2Validation(run.data)
      run.data.entityType = stage2.entityType
      run.data.coverages = stage2.coverages
      updated = true
    }
  }

  if (updated) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2))
    console.log(`Updated ${file}`)
  }
}
