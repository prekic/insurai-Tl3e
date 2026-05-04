/**
 * Named Deductible Scenarios Registry
 *
 * Structured, exported registry of all known deductible/exclusion scenarios
 * in the Turkish KASKO market. This is the source of truth for:
 *
 *   1. `checkNamedScenarioCoverage()` — the quality detector that flags
 *      scenarios present in raw text but absent from conditionalDeductibles[]
 *   2. Future InsurerAdapter cherry-picking (Session 2)
 *   3. Canonical scenario IDs for the ValidatedConditionalDeductible type
 *
 * Previously inlined in `policy-converter.ts` as `NAMED_DEDUCTIBLE_SCENARIOS`.
 * Extracted here to decouple the registry from the converter's classification
 * logic and to add structure (canonical IDs, categories, importance, display
 * labels) that the pipeline needs.
 *
 * IMPORTANT: The detection patterns are UNCHANGED from the original. This is
 * a pure structural refactor — no new patterns are added (that's Session 2).
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NamedScenario {
  /** Stable canonical ID — used as a key in adapter registries and test fixtures */
  canonicalId: string
  /** Regex patterns for detecting this scenario in raw OCR text.
   *  When multiple patterns are present, ALL must match within a text window
   *  for the scenario to be considered detected. */
  detectionPatterns: RegExp[]
  /** Expected deductible rate when known (e.g. "80%") */
  expectedRate?: string
  /** Scenario category */
  category: 'DEDUCTIBLE_TRIGGER' | 'EXCLUSION' | 'COVERAGE_FEATURE' | 'SUB_LIMIT'
  /** How impactful this scenario is for the policyholder */
  importance: 'high' | 'medium' | 'low'
  /** User-facing display label in Turkish */
  userFacingTitleTR: string
  /** User-facing display label in English */
  userFacingTitleEN: string
}

// ─── Legacy Compatibility Shape ──────────────────────────────────────────────

/**
 * The original shape used by `classifyExclusions()` and
 * `checkNamedScenarioCoverage()` in `policy-converter.ts`.
 * Consumers that rely on the { keywords, labelTr } shape
 * can use `toLegacyFormat()` below.
 */
export interface LegacyNamedScenario {
  keywords: RegExp[]
  labelTr: string
}

// ─── Registry ────────────────────────────────────────────────────────────────

/**
 * The canonical named-scenarios registry.
 *
 * Keyed by canonical ID for O(1) lookup. Iteration order matches the original
 * `NAMED_DEDUCTIBLE_SCENARIOS` array for detection priority.
 */
export const NAMED_SCENARIOS = {
  NON_CONTRACTED_SERVICE: {
    canonicalId: 'NON_CONTRACTED_SERVICE',
    detectionPatterns: [
      /(anla[şs]mal[ıi]\s*olmayan|anla[şs]mas[ıi]z)/i,
      /servis|yetkili\s*servis/i,
    ],
    category: 'DEDUCTIBLE_TRIGGER' as const,
    importance: 'medium' as const,
    userFacingTitleTR: 'Anlaşmalı olmayan servis',
    userFacingTitleEN: 'Non-contracted service deductible',
  },
  TOTAL_LOSS_DEDUCTIBLE: {
    canonicalId: 'TOTAL_LOSS_DEDUCTIBLE',
    detectionPatterns: [/pert|hurda/i, /muaf[iİ]yet|tenzil/i],
    category: 'DEDUCTIBLE_TRIGGER' as const,
    importance: 'high' as const,
    userFacingTitleTR: 'Pert araç muafiyeti',
    userFacingTitleEN: 'Total loss deductible',
  },
  UNDECLARED_LPG_CNG: {
    canonicalId: 'UNDECLARED_LPG_CNG',
    detectionPatterns: [/lpg|cng|beyan\s*d[ıi][şs][ıi]|beyan\s*edilmemi[şs]/i],
    category: 'DEDUCTIBLE_TRIGGER' as const,
    importance: 'medium' as const,
    userFacingTitleTR: 'Beyan dışı LPG / CNG donanımı',
    userFacingTitleEN: 'Undeclared LPG/CNG equipment',
  },
  KULLANIM_SEKLI_80: {
    canonicalId: 'KULLANIM_SEKLI_80',
    detectionPatterns: [
      /rent[\s-]*a[\s-]*car|taksi|dolmu[şs]|kurye|kargo|kiral[ıi]k\s*ara[çc]|ikame\s*ara[çc]|uygulama\s*ta[şs][ıi]mac[ıi]l[ıi][ğg]?[ıi]?|ta[şs][ıi]mac[ıi]l[ıi][ğg]?[ıi]?|ticari\s*kullan[ıi]m|kullan[ıi]m\s*[şs]ekli/i,
    ],
    expectedRate: '80%',
    category: 'DEDUCTIBLE_TRIGGER' as const,
    importance: 'high' as const,
    userFacingTitleTR: 'Rent-a-car / ticari kullanım',
    userFacingTitleEN: 'Rental car / commercial use deductible',
  },
  FIRST_GLASS_DEDUCTIBLE: {
    canonicalId: 'FIRST_GLASS_DEDUCTIBLE',
    detectionPatterns: [
      /(ilk|birinci|1\.?)\s*cam|cam\s*hasar[ıi]?\s*(ilk|birinci|1\.?)|anla[şs]mal[ıi]\s*cam/i,
    ],
    category: 'DEDUCTIBLE_TRIGGER' as const,
    importance: 'medium' as const,
    userFacingTitleTR: 'İlk cam hasarı muafiyeti',
    userFacingTitleEN: 'First glass damage deductible',
  },
  DRIVER_AGE: {
    canonicalId: 'DRIVER_AGE',
    detectionPatterns: [/ya[şs]|sür[üu]c[üu]\s*ya[şs]|25\s*ya[şs]|18\s*ya[şs]/i],
    category: 'DEDUCTIBLE_TRIGGER' as const,
    importance: 'medium' as const,
    userFacingTitleTR: 'Sürücü yaşı',
    userFacingTitleEN: 'Driver age deductible',
  },
  LICENCE_DURATION: {
    canonicalId: 'LICENCE_DURATION',
    detectionPatterns: [/ehliyet|s[üu]r[üu]c[üu]\s*belgesi|belge\s*s[üu]resi|belge\s*y[ıi]l/i],
    category: 'DEDUCTIBLE_TRIGGER' as const,
    importance: 'medium' as const,
    userFacingTitleTR: 'Ehliyet süresi',
    userFacingTitleEN: 'Licence duration deductible',
  },
} satisfies Record<string, NamedScenario>

// ─── Derived Types ───────────────────────────────────────────────────────────

export type NamedScenarioId = keyof typeof NAMED_SCENARIOS

/**
 * Ordered array of all scenarios for iteration.
 * Order matches the original NAMED_DEDUCTIBLE_SCENARIOS detection priority.
 */
export const NAMED_SCENARIOS_LIST: ReadonlyArray<NamedScenario> = Object.values(NAMED_SCENARIOS)

// ─── Legacy Compatibility ────────────────────────────────────────────────────

/**
 * Convert a NamedScenario to the legacy { keywords, labelTr } shape.
 * Used by `classifyExclusions()` in `policy-converter.ts` which relies
 * on the original array format.
 */
export function toLegacyFormat(scenario: NamedScenario): LegacyNamedScenario {
  return {
    keywords: scenario.detectionPatterns,
    labelTr: scenario.userFacingTitleTR,
  }
}

/**
 * The full registry in legacy format.
 * Drop-in replacement for the original `NAMED_DEDUCTIBLE_SCENARIOS` export.
 *
 * Import this in `policy-converter.ts`:
 *   import { NAMED_DEDUCTIBLE_SCENARIOS } from '../audit/named-scenarios.js'
 */
export const NAMED_DEDUCTIBLE_SCENARIOS: ReadonlyArray<LegacyNamedScenario> =
  NAMED_SCENARIOS_LIST.map(toLegacyFormat)

// ─── Lookup Helpers ──────────────────────────────────────────────────────────

/**
 * Get a named scenario by its canonical ID.
 * Returns undefined if the ID is not in the registry.
 */
export function getNamedScenario(id: string): NamedScenario | undefined {
  return (NAMED_SCENARIOS as Record<string, NamedScenario>)[id]
}

/**
 * Get all scenario IDs.
 */
export function getScenarioIds(): NamedScenarioId[] {
  return Object.keys(NAMED_SCENARIOS) as NamedScenarioId[]
}
