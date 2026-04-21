import type { AnalyzedPolicy } from '@/types/policy'
import { TR_TRANSLATIONS } from '@/lib/i18n/translations-tr'
import { ExtractedPolicyData } from './extraction-schema'

/**
 * Mirrors the display-time translateInsight() logic in PolicyDetailView
 * but runs once at extraction so the result is persisted.
 */
// Exported for unit tests verifying cross-language deduplication
export function translateInsightToTr(insight: string): string {
  const trMap = TR_TRANSLATIONS.insightTranslations

  // Extract emoji prefix if present (✓ ⚠ 💡 ❌ 🔍 etc.)
  // eslint-disable-next-line no-misleading-character-class
  const prefixMatch = insight.match(/^([✓✔☑⚠💡❌🔍\uFE0F]\s*)/u)
  const prefix = prefixMatch ? prefixMatch[1] : ''
  const text = prefix ? insight.slice(prefix.length).trim() : insight

  // Exact match from translation map
  if (trMap[text] && trMap[text] !== text) {
    return prefix ? `${prefix}${trMap[text]}` : trMap[text]
  }

  // Dynamic pattern: "Missing common coverage: X"
  if (text.startsWith('Missing common coverage:')) {
    const name = text.replace('Missing common coverage:', '').trim()
    const template = trMap['missingCoverage'] || 'Yaygın teminat eksik: {name}'
    const translated = template.replace('{name}', name)
    return prefix ? `${prefix}${translated}` : translated
  }

  // Dynamic pattern: "Invalid TC Kimlik" or "Invalid TC Kimlik / VKN"
  if (text.startsWith('Invalid TC Kimlik') || text.startsWith('Invalid VKN')) {
    const value = text.split(':').slice(1).join(':').trim()
    const template = trMap['invalidTcKimlik'] || 'Geçersiz TC Kimlik / VKN: {value}'
    const translated = template.replace('{value}', value)
    return prefix ? `${prefix}${translated}` : translated
  }

  // Dynamic pattern: "Market premiums increased N% YoY..."
  const yoyMatch = text.match(/^Market premiums increased (\d+)% YoY - lock in rates early$/)
  if (yoyMatch) {
    const template =
      trMap['marketPremiumsYoY'] ||
      'Piyasa primleri yıllık %{percent} arttı - oranları erkenden sabitleyin'
    const translated = template.replace('{percent}', yoyMatch[1])
    return prefix ? `${prefix}${translated}` : translated
  }

  // No translation found — flag in DEV so locale-mixing regressions are visible
  // during development (Bug #15). Guard by `process.env.NODE_ENV !== 'production'`
  // so Railway stays quiet.
  if (
    typeof process !== 'undefined' &&
    process.env?.NODE_ENV !== 'production' &&
    /^[\x20-\x7E]{6,}$/.test(text) && // mostly ASCII → likely English
    /\s[a-z]+\s/i.test(text) // has multi-word spacing
  ) {
    // Skip known safe patterns (emoji-only, short tokens).
    console.warn(
      `[LocaleMixAudit] insight passed through untranslated — consider adding to insightTranslations: "${text.slice(0, 120)}"`
    )
  }
  return insight
}

/**
 * Reverse-translate a Turkish insight to its English equivalent if known.
 * Iterates the EN→TR translation map looking for a matching TR value, and
 * returns the EN key. Used for cross-language deduplication so an insight
 * present in both languages collapses to a single entry.
 *
 * If no match is found (e.g., new dynamic insight), returns the input unchanged.
 */
// Exported for unit tests verifying cross-language deduplication
export function translateInsightToEn(insight: string): string {
  const trMap = TR_TRANSLATIONS.insightTranslations
  // eslint-disable-next-line no-misleading-character-class
  const prefixMatch = insight.match(/^([✓✔☑⚠💡❌🔍\uFE0F]\s*)/u)
  const prefix = prefixMatch ? prefixMatch[1] : ''
  const text = prefix ? insight.slice(prefix.length).trim() : insight

  for (const [enKey, trValue] of Object.entries(trMap)) {
    if (trValue === text) {
      return prefix ? `${prefix}${enKey}` : enKey
    }
  }
  return insight
}

/**
 * Translate an array of English insight strings to Turkish.
 */
export function translateInsightsToTr(insights: string[]): string[] {
  return insights.map(translateInsightToTr)
}

/**
 * Bug #7 — Detect replacement-parts clauses (Eşdeğer / Çıkma Parça) on older
 * vehicles. Returns a Turkish reviewer insight or null if not applicable.
 *
 * Fires when:
 *   - Vehicle model year is known AND age ≥ 7yr
 *   - Any exclusion / special condition mentions "eşdeğer parça", "çıkma parça",
 *     "orijinal olmayan", or similar OEM-restricting language.
 *
 * Turkish İ handled via character classes (gotcha #62).
 */
export function derivePartsClauseInsight(
  policy: AnalyzedPolicy,
  data: ExtractedPolicyData
): string | null {
  const year = policy.vehicleInfo?.year
  if (!year || year <= 0) return null
  const age = new Date().getFullYear() - year
  if (age < 7) return null

  const NON_OEM_PATTERNS = [
    /eşdeğer\s+parça/i,
    /ç[iı]kma\s+parça/i,
    /or[iı]j[iı]nal\s+olmayan/i,
    /yan\s+sanay[iı]/i,
    /OEM\s+olmayan/i,
  ]

  const hayBlob = [
    ...(data.exclusions ?? []),
    ...(policy.exclusions ?? []),
    ...(data.specialConditions ?? []),
    ...(policy.specialConditions ?? []),
  ]
    .filter((s): s is string => typeof s === 'string')
    .join(' | ')

  if (!hayBlob) return null

  for (const pattern of NON_OEM_PATTERNS) {
    if (pattern.test(hayBlob)) {
      return `⚠ ${age} yaşında araçta eşdeğer/çıkma parça kullanımı — onarım kalitesi ve ikinci el değeri etkilenebilir; orijinal parça (OEM) zeyilnamesi düşünülmelidir`
    }
  }
  return null
}
