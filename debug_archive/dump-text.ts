import * as fs from 'fs/promises'
import * as path from 'path'
import { extractWithDocumentAI } from '../src/lib/ai/document-ocr'

async function dump() {
  const filepath = path.join('/workspaces/insurai/policies', '4.4. Kasko.pdf')
  const buf = await fs.readFile(filepath)
  const file = new File([buf], '4.4. Kasko.pdf', { type: 'application/pdf' })
  const result = await extractWithDocumentAI(file)
  if (result.success) {
    await fs.writeFile('gunes_text.txt', result.data.text)
    await fs.writeFile('gunes_full.json', JSON.stringify(result.data, null, 2))
    console.log('Saved gunes_text.txt and gunes_full.json')
  } else {
    console.error('Gunes Document AI failed:', result.error)
  }
}

dump().catch(console.error)
