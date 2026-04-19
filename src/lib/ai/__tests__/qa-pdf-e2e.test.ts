import { describe, it } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { File } from 'node:buffer'
import { extractPolicyFromDocument } from '../policy-extractor'
import * as dotenv from 'dotenv'

dotenv.config({ path: join(process.cwd(), '.env') })

if (process.env.OPENAI_API_KEY) {
  // @ts-expect-error - injecting env var for test
  import.meta.env.VITE_OPENAI_API_KEY = process.env.OPENAI_API_KEY
}
if (process.env.ANTHROPIC_API_KEY) {
  // @ts-expect-error - injecting env var for test
  import.meta.env.VITE_ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
}

describe('E2E Evaluation of uploaded policies', () => {
  it('processes a single small policy', async () => {
    const policiesDir = join(process.cwd(), 'policies')
    const fileName = 'ANADOLU.PDF'
    const filePath = join(policiesDir, fileName)
    const buf = readFileSync(filePath)

    const file = new File([buf], fileName, { type: 'application/pdf' })

    console.log(`Starting extraction for ${fileName}...`)
    try {
      const res = await extractPolicyFromDocument(file as globalThis.File, { useConsensus: false })
      writeFileSync('out.json', JSON.stringify(res, null, 2))
      console.log('Finished. Check out.json')
    } catch (e) {
      console.log('Error:', e)
    }
  }, 60000)
})
