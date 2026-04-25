import { createClient } from '@supabase/supabase-js'
import dotenv from 'dotenv'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'

// Mock import.meta.env for tsx
;(globalThis as any).import = { meta: { env: { DEV: true } } }

import { extractWithDocumentAI } from './src/lib/ai/document-ocr.js'

dotenv.config()
const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const POLICIES_DIR = path.resolve(process.cwd(), 'policies')

async function doOcr() {
  const filename = 'KRK_35 VD 458 Kasko Police_32630901_3.pdf'
  const buf = await fs.readFile(path.join(POLICIES_DIR, filename))
  const file = new File([buf], filename, { type: 'application/pdf' })
  const result = await extractWithDocumentAI(file)
  if (!result.success) throw result.error
  await fs.writeFile('test_5b670641.txt', result.data.text)
  console.log('Saved OCR output, length:', result.data.text.length)
}
doOcr().catch(console.error)
