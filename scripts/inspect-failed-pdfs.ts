import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { execSync } from 'child_process'
dotenv.config()

const url = process.env.SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing env vars')
  process.exit(1)
}

const supabase = createClient(url, key)

async function run() {
  const ids = [
    '688d6b50-8b82-4240-8ea1-b8f1795f2966', // AXA
    '46b9ce55-423a-4fc0-bc01-e5774578d50e', // AXA
    '69199ebc-8af4-4430-986c-dd3431e52748', // AXA
    'fe8de128-bb81-47b3-9dfd-d592589476a8', // AXA
    '7ca5e23c-7b02-405c-81ea-4f7acf52271a', // AXA
    '7b96b946-5cf2-4052-861d-78b31823904d', // AXA
    '87b30f26-6217-4e63-b08c-f656ba49f903', // AXA
    '14f3378a-810e-4978-9647-d24132362267', // AXA model missing
    '94d1768a-9e4b-4052-ac58-63638ff670ae', // Ray
    '62ee93be-3bcf-42a0-a591-97b24a9fbbde', // Groupama
    '6dde25cc-ac16-40b0-8d26-7b02346ed344', // Ray
  ]

  const { data, error } = await supabase
    .from('policies')
    .select('id, raw_data->>sourceFilename')
    .in('id', ids)

  if (error) {
    console.error('Error fetching:', error)
    process.exit(1)
  }

  for (const row of data) {
    console.log(`\n======================================================`)
    console.log(`Inspecting ${row.sourceFilename} (ID: ${row.id})`)
    console.log(`======================================================\n`)
    try {
      const output = execSync(`npx tsx scripts/inspect-pdf-labels.ts "${row.sourceFilename}"`, {
        encoding: 'utf-8',
      })
      // We only want the Label-bearing lines section
      const lines = output.split('\n')
      const labelIndex = lines.findIndex((l) => l.includes('=== Label-bearing lines'))
      if (labelIndex !== -1) {
        console.log(lines.slice(labelIndex).join('\n'))
      } else {
        console.log('No label section found in output.')
      }
    } catch (_e) {
      console.error(`Failed to inspect ${row.sourceFilename}`)
    }
  }
}

run()
