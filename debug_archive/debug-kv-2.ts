import * as fs from 'fs/promises'
import { matchLabeledField } from '../shared/field-aliases'

async function run() {
  let text = await fs.readFile('gunes_text.txt', 'utf8')
  text = text
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    .replace(/ý/g, 'ı')
    .replace(/þ/g, 'ş')
    .replace(/ð/g, 'ğ')
    .replace(/Ý/g, 'İ')
    .replace(/Þ/g, 'Ş')
    .replace(/Ð/g, 'Ğ')
  
  const value = matchLabeledField(text, 'make')
  console.log('matchLabeledField(make) =', value)
}
run()
