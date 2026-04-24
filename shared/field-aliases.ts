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

  /** Model / trim — excludes modelYear forms via negative lookahead.
   *  Allows optional trailing [iİ] to match Turkish possessive "Modeli". */
  model: [
    /model[iİ]?(?!\s*(?:y[ıi]l|bilgisi|year|\s*[:.]?\s*\d{4}\b))/i,
    /\btip[iİ]?\b/i,
    /\btrim\b/i,
  ],

  /** Engine / motor number */
  motorNo: [/motor\s*(?:no|numaras[ıi])/i, /engine\s*(?:no|number)/i],

  /** Chassis / VIN / frame number */
  chassisNo: [/[şs]asi\s*(?:no|numaras[ıi])/i, /chassis\s*(?:no|number)/i, /\bvin\b/i],

  /** License plate */
  plate: [/plaka(?:\s*no)?/i, /license\s*plate/i],
} as const

export type VehicleFieldName = keyof typeof VEHICLE_FIELD_ALIASES

/**
 * Auxiliary labels that commonly appear in the `SİGORTA KONUSU ARAÇ BİLGİLERİ`
 * block in Turkish kasko policies but are NOT fields we extract. Used by
 * `matchLabeledField()` solely as value-capture boundaries so that e.g. a
 * `Model : CLIO HB TOUCH 1.5 DCI EDC 90` capture stops before the following
 * `Kullanım Şekli : HUSUSİ OTOMOBİL` leaks into the model value.
 *
 * Keep Turkish-possessive variants ("Türü", "Modeli", "Tescili") in mind;
 * patterns use the same [iİ]? trailing-possessive trick as the main table.
 */
export const STOP_LABELS: readonly RegExp[] = [
  /kullan[ıi]m\s*[şs]ekl[iİ]?/i,
  /kullan[ıi]m/i,
  /t[üu]r[üu]?\b/i,
  /t[üu]r[üu]?\s*\(/i,
  /tescil\s*tarih[iİ]?/i,
  /yer\s*aded[iİ]?/i,
  /trafi[ğg]e\s*[çc][ıi]k[ıi][şs]/i,
  /ruhsat/i,
  /m[üu][şs]ter[iİ]?\s*numaras[ıi]?/i,
  /sbm\s*tramer/i,
  /acente/i,
]

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
/**
 * After `pos`, look for a key/value separator signature: `:`, a tab, or a
 * run of 2+ spaces (column-aligned layout). A bare word followed by prose
 * punctuation (`,`, `.`, single space + letter) is NOT a kv context and
 * indicates this "match" is a mid-sentence occurrence of the alias word,
 * not a labeled field. Returns true only when `pos` looks like the start
 * of a labeled value.
 */
function hasKvSeparator(text: string, pos: number): boolean {
  let i = pos
  while (i < text.length) {
    const ch = text[i]
    if (ch === ':' || ch === '\t') return true
    if (ch === ' ') {
      // Tolerate a single space, but a run of 2+ is column alignment.
      if (text[i + 1] === ' ') return true
      i++
      continue
    }
    // Any word / punctuation char before a separator → mid-prose match.
    return false
  }
  return false
}

export function matchLabeledField(text: string, field: VehicleFieldName): string | undefined {
  if (!text) return undefined

  const myAliases = VEHICLE_FIELD_ALIASES[field]
  const otherAliases = [
    ...(Object.keys(VEHICLE_FIELD_ALIASES) as VehicleFieldName[])
      .filter((f) => f !== field)
      .flatMap((f) => VEHICLE_FIELD_ALIASES[f]),
    ...STOP_LABELS,
  ].map(anchoredAt)

  for (const alias of myAliases) {
    // Iterate all occurrences, not just the first. Mid-prose mentions of
    // common words like "marka, model, model yılı" must not beat the real
    // labeled occurrence in the vehicle-info section.
    const globalRe = new RegExp(
      alias.source,
      alias.flags.includes('g') ? alias.flags : alias.flags + 'g'
    )
    let labelMatch: RegExpExecArray | null
    while ((labelMatch = globalRe.exec(text)) !== null) {
      const labelEnd = labelMatch.index + labelMatch[0].length
      if (!hasKvSeparator(text, labelEnd)) continue

      let start = labelEnd
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
  }
  return undefined
}
