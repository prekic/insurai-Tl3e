import { db } from '../src/lib/db'
import { extractVehicleInfoFromText } from '../src/lib/ai/turkish-utils'
import { test } from 'vitest'

test('debug failures', async () => {
  const ids = [
    '88169bbf-4e8d-4d98-9345-83ae413b4b53',
    '5b670641-9bbd-48bb-b185-27d73925ca3b'
  ]
  for (const id of ids) {
    const record = await db.selectFrom('PolicyRecord').select('extractedText').where('id', '=', id).executeTakeFirst()
    if (record?.extractedText) {
      console.log(`\n\n=== TEXT FOR ${id} ===\n\n`)
      console.log(record.extractedText.slice(0, 500))
      console.log('... skipping ...')
      console.log(record.extractedText.slice(record.extractedText.length / 2, record.extractedText.length / 2 + 500))
      const info = extractVehicleInfoFromText(record.extractedText)
      console.log(`\n--- Info for ${id} ---`)
      console.log(info)
    } else {
      console.log(`No text for ${id}`)
    }
  }
})
