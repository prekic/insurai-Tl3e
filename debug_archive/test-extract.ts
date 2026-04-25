import * as fs from 'fs/promises'
import { extractVehicleInfoFromText } from '../src/lib/ai/turkish-utils'

async function run() {
  try {
    const text = await fs.readFile('ray_text.txt', 'utf8')
    const result = extractVehicleInfoFromText(text)
    console.log('RAY RESULT:', result)
  } catch (e) {
    console.error('RAY failed:', e)
  }

  try {
    const text2 = await fs.readFile('gunes_text.txt', 'utf8')
    const result2 = extractVehicleInfoFromText(text2)
    console.log('GUNES RESULT:', result2)
  } catch (e) {
    console.error('GUNES failed:', e)
  }
}

run()
