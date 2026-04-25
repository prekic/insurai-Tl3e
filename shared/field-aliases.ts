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
    // AXA Sigorta packed-line format puts the model under "Marka Tipi"
    // (with a single space, not a slash) — must come BEFORE the bare
    // `model` alias so it's tried first when both could apply.
    /marka\s+t[iİ]p[iİ]?/i,
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

  // Forward scan yielded nothing. Try the backward fallback for insurer
  // formats that place the value BEFORE the label on the same line, e.g.
  // the Allianz Peugeot layout `: PEUGEOT (114)\tMarka Plaka No : ...`.
  // See scanBackwardForInvertedValue for the strict shape requirements.
  for (const alias of myAliases) {
    const globalRe = new RegExp(
      alias.source,
      alias.flags.includes('g') ? alias.flags : alias.flags + 'g'
    )
    let labelMatch: RegExpExecArray | null
    while ((labelMatch = globalRe.exec(text)) !== null) {
      const backValue = scanBackwardForInvertedValue(text, labelMatch.index)
      if (backValue) return backValue
    }
  }

  // Both prior passes failed. Try the tabular single-space fallback for
  // packed-line formats like AXA Sigorta:
  //   `Kullanım Tarzı KAMYONET Marka ISUZU\nMarka Tipi 1003 --- D-MAX...`
  // hasKvSeparator() rejects single-space layouts (it would create prose
  // false positives), but legitimate AXA labels are followed by exactly
  // one space then an UPPERCASE letter or digit. We use that signature
  // (label + single space + uppercase/digit) as the narrow tabular signal.
  // See scanTabularSpaceSeparated for guards.
  for (const alias of myAliases) {
    const globalRe = new RegExp(
      alias.source,
      alias.flags.includes('g') ? alias.flags : alias.flags + 'g'
    )
    let labelMatch: RegExpExecArray | null
    while ((labelMatch = globalRe.exec(text)) !== null) {
      const tabValue = scanTabularSpaceSeparated(
        text,
        labelMatch.index,
        labelMatch.index + labelMatch[0].length,
        labelMatch[0],
        otherAliases
      )
      if (tabValue) return tabValue
    }
  }

  return undefined
}

/**
 * Backward fallback for the Allianz inverted `: VALUE\tLabel` layout where
 * the value precedes the label on the same line. Forward scan from the
 * label position returns nothing (the char immediately after the label is
 * another label like `Plaka No :`), so we walk back to the start of the
 * line and look for a value that sits after a leading `:`.
 *
 * Narrow by design: only fires when the line segment before the label
 * begins with `:` (optionally after whitespace). Any other shape is an
 * ambiguity risk — for example a line like `Plaka : 34 ABC 12\tMarka`
 * would otherwise mis-capture the plate value as the make. Returning
 * `undefined` in the ambiguous cases is safer than a false positive.
 */
function scanBackwardForInvertedValue(text: string, labelStart: number): string | undefined {
  // Walk backwards to the start of the current line.
  let lineStart = labelStart - 1
  while (lineStart >= 0 && text[lineStart] !== '\n' && text[lineStart] !== '\r') {
    lineStart--
  }
  lineStart++ // move past the newline to the first char of the line

  // Drop trailing whitespace so the tab/spaces immediately before the label
  // don't count against us.
  const segment = text.slice(lineStart, labelStart).replace(/\s+$/, '')
  if (segment.length === 0) return undefined

  // Require the inverted-format `:` prefix. Anything else (another label,
  // prose, a different delimiter) is not a confident inverted-value signal.
  const trimmedStart = segment.replace(/^\s+/, '')
  if (!trimmedStart.startsWith(':')) return undefined

  const candidate = trimmedStart.slice(1).trim()
  // Minimum two characters; must start with a capital letter or digit
  // (values like `PEUGEOT (114)`, `VOLKSWAGEN`, `308`, `2010`).
  if (candidate.length < 2) return undefined
  if (!/^[A-ZÇĞİÖŞÜ0-9]/.test(candidate)) return undefined
  return candidate
}

/**
 * Tabular single-space-separator fallback for packed-line insurer formats
 * like AXA Sigorta KASKO PDFs:
 *
 *   `Kullanım Tarzı / Cinsi KAMYONET Marka ISUZU`
 *   `Marka Tipi 1003 --- D-MAX CIFT KABIN`
 *   `Model Bilgisi 2015`
 *   `Plaka No 67LA807`
 *   `Motor No MP0428 Şasi No NNATFR86JL2000712`
 *
 * The label is followed by exactly one space (not `:`, not tab, not
 * multiple spaces), which `hasKvSeparator()` correctly rejects as
 * potentially mid-prose. To distinguish a legitimate tabular label from
 * mid-prose use, we require:
 *   1. The label match begins with an UPPERCASE Turkish letter (rejects
 *      lowercase prose like "bu marka ISUZU"). The aliases match
 *      case-insensitively, so uppercase initial is the discriminator.
 *   2. Exactly one space follows the label.
 *   3. The next character is an UPPERCASE letter or DIGIT (rejects
 *      prose continuations like "marka iyidir").
 *
 * Captures forward until newline or the next known label boundary.
 */
function scanTabularSpaceSeparated(
  text: string,
  labelStart: number,
  labelEnd: number,
  matchedLabel: string,
  otherAliases: readonly RegExp[]
): string | undefined {
  // Guard 1: the label as it appeared must start with an uppercase letter.
  // This is what distinguishes a tabular label position from mid-prose.
  if (!/^[A-ZÇĞİÖŞÜ]/.test(matchedLabel)) return undefined

  // Guard 2: exactly one space (or tab) after the label, then non-space.
  if (text[labelEnd] !== ' ' && text[labelEnd] !== '\t') return undefined
  // Reject 2+ spaces — those should have been caught by hasKvSeparator path.
  if (text[labelEnd + 1] === ' ') return undefined

  const start = labelEnd + 1

  // Guard 3: value must start with uppercase letter or digit.
  if (start >= text.length) return undefined
  if (!/[A-ZÇĞİÖŞÜ0-9]/.test(text[start])) return undefined

  // Guard 4: the label must be at line-start OR preceded by another
  // recognized label or stop-label (i.e. a column break, not prose).
  // Walk backward from labelStart until newline or text-start.
  let lineStart = labelStart - 1
  while (lineStart >= 0 && text[lineStart] !== '\n' && text[lineStart] !== '\r') {
    lineStart--
  }
  lineStart++

  const beforeLabel = text.slice(lineStart, labelStart).trimEnd()
  if (beforeLabel.length > 0) {
    // Something precedes the label on this line. Accept only if that
    // segment ends with a recognized label OR appears to end with a
    // value (uppercase token followed by space — the AXA pattern of
    // `<prev value> <next label>` packed on one line).
    const endsWithLabel = otherAliases.some((a) => {
      const m = beforeLabel.match(
        new RegExp('(?:' + a.source + ')\\s*(?:[:.\\s]+\\S+\\s*)?$', a.flags.replace('g', ''))
      )
      return m !== null
    })
    const endsWithUppercaseToken = /[A-ZÇĞİÖŞÜ0-9][A-ZÇĞİÖŞÜ0-9./-]*\s*$/.test(beforeLabel)
    if (!endsWithLabel && !endsWithUppercaseToken) return undefined
  }

  // Capture forward until newline or next known label.
  let end = start
  while (end < text.length) {
    const ch = text[end]
    if (ch === '\n' || ch === '\r') break
    const remaining = text.slice(end)
    if (otherAliases.some((a) => a.test(remaining))) break
    end++
  }

  const value = text.slice(start, end).trim()
  if (value.length < 2) return undefined
  return value
}
