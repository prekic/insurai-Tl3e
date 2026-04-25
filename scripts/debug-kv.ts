import * as fs from 'fs/promises'
import { extractVehicleInfoFromText } from '../src/lib/ai/turkish-utils'

async function run() {
  let text = await fs.readFile('gunes_text.txt', 'utf8')
  text = text
    .replace(/ý/g, 'ı')
    .replace(/þ/g, 'ş')
    .replace(/ð/g, 'ğ')
    .replace(/Ý/g, 'İ')
    .replace(/Þ/g, 'Ş')
    .replace(/Ð/g, 'Ğ')
  const info = extractVehicleInfoFromText(text)
  console.log('Extracted Info (Gunes with encoding fix):', info)
}
run()
