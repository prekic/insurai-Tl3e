import * as fs from 'fs/promises'
import { VEHICLE_FIELD_ALIASES } from '../shared/field-aliases'

function hasKvSeparator(text: string, pos: number): boolean {
  let i = pos
  while (i < text.length) {
    const ch = text[i]
    if (ch === ':' || ch === '\t') return true
    if (ch === ' ' || ch === '\n' || ch === '\r') {
      // Tolerate a single space, but a run of 2+ spaces is column alignment.
      if (ch === ' ' && text[i + 1] === ' ') return true
      i++
      continue
    }
    // Any word / punctuation char before a separator → mid-prose match.
    return false
  }
  return false
}

async function run() {
  let text = await fs.readFile('gunes_text.txt', 'utf8')
  text = text
    .replace(/ý/g, 'ı')
    .replace(/þ/g, 'ş')
    .replace(/ð/g, 'ğ')
    .replace(/Ý/g, 'İ')
    .replace(/Þ/g, 'Ş')
    .replace(/Ð/g, 'Ğ')
  
  const alias = VEHICLE_FIELD_ALIASES['make'][0]
  const globalRe = new RegExp(alias.source, alias.flags + 'g')
  
  let match
  while ((match = globalRe.exec(text)) !== null) {
    const end = match.index + match[0].length
    const kv = hasKvSeparator(text, end)
    console.log(`Found "${match[0]}" at ${match.index}. hasKvSeparator=${kv}`)
    if (kv) {
       console.log("  Text after:", JSON.stringify(text.slice(end, end + 20)))
    }
  }
}
run()
