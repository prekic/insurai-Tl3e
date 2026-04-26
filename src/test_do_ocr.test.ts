import { test } from 'vitest'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { extractWithDocumentAI } from './lib/ai/document-ocr'
import dotenv from 'dotenv'

dotenv.config()

test.skip('do OCR', async () => {
  const POLICIES_DIR = path.resolve(process.cwd(), 'policies')
  const filename = 'KRK_35 VD 458 Kasko Police_32630901_3.pdf'
  const buf = await fs.readFile(path.join(POLICIES_DIR, filename))
  const file = new File([buf], filename, { type: 'application/pdf' })
  const result = await extractWithDocumentAI(file)
  if (!result.success) throw result.error
  await fs.writeFile('test_5b670641.txt', result.data.text)
  console.log('Saved OCR output, length:', result.data.text.length)
})
