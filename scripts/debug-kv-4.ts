import * as fs from 'fs/promises'
import { matchLabeledField, VEHICLE_FIELD_ALIASES } from '../shared/field-aliases' // eslint-disable-line @typescript-eslint/no-unused-vars

async function run() {
  let text = await fs.readFile('gunes_text.txt', 'utf8')
  text = text
    .replace(/ý/g, 'ı')
    .replace(/þ/g, 'ş')
    .replace(/ð/g, 'ğ')
    .replace(/Ý/g, 'İ')
    .replace(/Þ/g, 'Ş')
    .replace(/Ð/g, 'Ğ')

  console.log('Third pass fallback is extracting this?')
  // We can just trace the exact thing returned.
  const value = matchLabeledField(text, 'make')
  console.log('Result:', value)
}
run()
