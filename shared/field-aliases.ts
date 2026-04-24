/**
 * Canonical vehicle-field label aliases for Turkish (and English) insurance
 * PDFs. Different insurers (AXA, Anadolu, Allianz, Türkiye, HDI, Sompo, Ray,
 * Quick, etc.) use different label phrasing for the same underlying field —
 * this map centralizes the known variants so extraction can be format-agnostic.
 *
 * Turkish İ (U+0130) is handled via [iİ] character classes because the /i
 * regex flag does NOT perform Unicode-aware case folding in V8. See CLAUDE.md
 * gotcha #62.
 *
 * Iteration order within a field's array matters when multiple aliases could
 * match: the first match wins. The `model` alias uses a negative lookahead to
 * avoid matching `Model Yılı` / `Model Bilgisi` / `Model Year` / bare
 * `Model: <year>` — those all resolve to `modelYear`.
 */
export const VEHICLE_FIELD_ALIASES = {
  /** Model year — 4-digit production / registration year */
  modelYear: [
    /model\s*y[ıi]l[ıi]/i,
    /model\s*bilgisi/i,
    /[iİ]mal\s*y[ıi]l[ıi]/i,
    /[üu]retim\s*y[ıi]l[ıi]/i,
    /model\s*year/i,
    /ara[çc]\s*y[ıi]l[ıi]/i,
    // Bare "MODEL:" followed by a 4-digit year (Ray Sigorta commercial layout)
    /model(?=\s*[:.]?\s*\d{4}\b)/i,
  ],

  /** Make / manufacturer */
  make: [/marka(?:s[ıi])?(?:\s*\/\s*t[iİ]p[iİ]?)?/i, /[üu]retici/i, /\bmake\b/i],

  /** Model / trim — excludes modelYear forms via negative lookahead */
  model: [/model(?!\s*(?:y[ıi]l|bilgisi|year|\s*[:.]?\s*\d{4}\b))/i, /\btip\b/i, /\btrim\b/i],

  /** Engine / motor number */
  motorNo: [/motor\s*(?:no|numaras[ıi])/i, /engine\s*(?:no|number)/i],

  /** Chassis / VIN / frame number */
  chassisNo: [/[şs]asi\s*(?:no|numaras[ıi])/i, /chassis\s*(?:no|number)/i, /\bvin\b/i],

  /** License plate */
  plate: [/plaka(?:\s*no)?/i, /license\s*plate/i],
} as const

export type VehicleFieldName = keyof typeof VEHICLE_FIELD_ALIASES

function nonGlobal(re: RegExp): RegExp {
  return re.flags.includes('g') ? new RegExp(re.source, re.flags.replace('g', '')) : re
}

function anchoredAt(alias: RegExp): RegExp {
  return new RegExp('^(?:' + alias.source + ')', alias.flags.replace('g', ''))
}

/**
 * Extract the raw string value for a labeled field from free text.
 *
 * Finds the first occurrence of any alias for the requested field, then
 * captures characters after the label (and an optional separator) until
 * either the next known label begins, a newline is hit, or the text ends.
 *
 * The "stop at any other known label" behavior prevents greedy capture
 * across fields packed on the same line — e.g., capturing `VOLKSWAGEN`
 * from `Marka: VOLKSWAGEN  Model: TIGUAN  Motor No: CZE307964` without
 * swallowing the trailing `Model: TIGUAN...` tokens.
 *
 * Returns `undefined` if the field's label is not found in the text.
 */
export function matchLabeledField(text: string, field: VehicleFieldName): string | undefined {
  if (!text) return undefined

  const myAliases = VEHICLE_FIELD_ALIASES[field]
  const otherAliases = (Object.keys(VEHICLE_FIELD_ALIASES) as VehicleFieldName[])
    .filter((f) => f !== field)
    .flatMap((f) => VEHICLE_FIELD_ALIASES[f])
    .map(anchoredAt)

  for (const alias of myAliases) {
    const re = nonGlobal(alias)
    const labelMatch = re.exec(text)
    if (!labelMatch || labelMatch.index === undefined) continue

    let start = labelMatch.index + labelMatch[0].length
    while (start < text.length && /[:.\s]/.test(text[start])) start++

    let end = start
    while (end < text.length) {
      const ch = text[end]
      if (ch === '\n' || ch === '\r') break
      const remaining = text.slice(end)
      if (otherAliases.some((a) => a.test(remaining))) break
      end++
    }

    const value = text.slice(start, end).trim()
    if (value.length > 0) return value
  }
  return undefined
}
