import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import * as fs from 'fs/promises'
import { extractVehicleInfoFromText } from '../src/lib/ai/turkish-utils'

dotenv.config()

async function debug() {
  const supabase = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const ids = [
    '88169bbf-4e8d-4d98-9345-83ae413b4b53',
    '5b670641-9bbd-48bb-b185-27d73925ca3b'
  ]
  for (const id of ids) {
    const { data: record, error } = await supabase
      .from('policies')
      .select('raw_data')
      .eq('id', id)
      .single()

    if (error) {
      console.error(`Error for ${id}:`, error)
      continue
    }

    const extractedText = record?.raw_data?.extractedText

    if (extractedText) {
      await fs.writeFile(`test_${id}.txt`, extractedText)
      console.log(`\n\n=== TEXT FOR ${id} ===\n\n`)
      console.log(extractedText.slice(0, 500))
      console.log('... skipping ...')
      console.log(extractedText.slice(extractedText.length / 2, extractedText.length / 2 + 500))
      const info = extractVehicleInfoFromText(extractedText)
      console.log(`\n--- Info for ${id} ---`)
      console.log(info)
    } else {
      console.log(`No text for ${id}`)
    }
  }
}

debug().catch(console.error)
