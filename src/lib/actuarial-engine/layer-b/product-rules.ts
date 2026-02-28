/**
 * Product Name Mismatch Detection
 *
 * Validates that a policy's marketed product name matches the
 * actual coverage scope. For example, "Tam Kasko" (full comprehensive)
 * must include earthquake and flood add-ons — if those are missing,
 * the product name is a mismatch and must trigger a blocking violation.
 *
 * "Dar Kasko" (limited comprehensive) is NOT required to include
 * these add-ons, so no penalty applies.
 */

import type { CanonicalCoverage, ProductMismatch } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Defines the expected coverage scope for a marketed product name.
 * Each product maps to a set of CanonicalCoverage codes that MUST
 * be present (included = true) for the product name to be valid.
 */
interface ProductDefinition {
  /** Possible marketed names (case-insensitive match). */
  names: string[]
  /** Coverage codes that MUST be present. */
  requiredCoverages: string[]
  /** Human-readable description. */
  description: string
  descriptionTr: string
}

/**
 * Turkish kasko product definitions.
 *
 * IMPORTANT: In Turkish motor insurance, "Kasko" (basic) covers
 * collision, theft, fire, and natural disasters as base perils.
 * Add-ons like earthquake and flood are NOT implicit — they are
 * separate endorsements (klozes).
 *
 * - "Dar Kasko" / "Mini Kasko": Only collision and theft.
 * - "Kasko" (standard): Collision, theft, fire, natural disasters.
 * - "Tam Kasko" / "Full Kasko": Standard + all add-ons (EQ, flood, etc.).
 * - "Genişletilmiş Kasko": Tam Kasko + additional riders.
 */
const KASKO_PRODUCTS: ProductDefinition[] = [
  {
    names: ['dar kasko', 'mini kasko', 'limited kasko'],
    requiredCoverages: ['COLLISION', 'THEFT'],
    description: 'Limited comprehensive — collision and theft only',
    descriptionTr: 'Dar kasko — sadece çarpma ve hırsızlık',
  },
  // IMPORTANT: Tam Kasko MUST come before standard Kasko because
  // matching uses .includes() — 'tam kasko'.includes('kasko') = true,
  // so the more specific "tam kasko" must be checked first.
  {
    names: ['tam kasko', 'full kasko', 'genişletilmiş kasko', 'extended kasko'],
    requiredCoverages: ['COLLISION', 'THEFT', 'FIRE', 'NATURAL_DISASTER', 'FLOOD', 'EARTHQUAKE'],
    description: 'Full comprehensive — all perils including earthquake and flood add-ons',
    descriptionTr: 'Tam kasko — deprem ve sel dahil tüm teminatlar',
  },
  {
    names: ['kasko', 'standart kasko', 'standard kasko'],
    requiredCoverages: ['COLLISION', 'THEFT', 'FIRE', 'NATURAL_DISASTER'],
    description: 'Standard comprehensive — core perils',
    descriptionTr: 'Standart kasko — temel teminatlar',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// COVERAGE CODE ALIASES
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps variant coverage codes to their canonical form.
 * This allows fuzzy matching of extracted coverage codes that
 * may use different naming conventions.
 */
const COVERAGE_CODE_ALIASES: Record<string, string[]> = {
  COLLISION: ['COLLISION', 'COLLISION_DAMAGE', 'CARPMA', 'CARPISMA'],
  THEFT: ['THEFT', 'HIRSIZLIK', 'THEFT_ROBBERY'],
  FIRE: ['FIRE', 'YANGIN', 'FIRE_EXPLOSION'],
  NATURAL_DISASTER: ['NATURAL_DISASTER', 'DOGAL_AFET', 'NAT_DISASTER'],
  FLOOD: ['FLOOD', 'FLOOD_INUNDATION', 'SEL', 'SU_BASKINI'],
  EARTHQUAKE: ['EARTHQUAKE', 'EQ_STRUCTURAL', 'EQ_LANDSLIDE', 'DEPREM'],
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Checks if a coverage code (or any alias) is present and included
 * in the given coverage list.
 */
function isCoveragePresent(requiredCode: string, coverages: CanonicalCoverage[]): boolean {
  const aliases = COVERAGE_CODE_ALIASES[requiredCode] ?? [requiredCode]
  return coverages.some((c) => aliases.includes(c.code.toUpperCase()) && c.included)
}

/**
 * Validates that the marketed product name matches the actual coverages.
 *
 * @param marketedName - The product name as marketed (e.g., "Tam Kasko")
 * @param coverages - The actual coverages extracted from the policy
 * @returns Array of mismatches (empty = no issues)
 */
export function validateProductName(
  marketedName: string | undefined,
  coverages: CanonicalCoverage[]
): ProductMismatch[] {
  if (!marketedName) return []

  const normalizedName = marketedName.toLowerCase().trim()

  // Find matching product definition
  const matchedProduct = KASKO_PRODUCTS.find((p) => p.names.some((n) => normalizedName.includes(n)))

  if (!matchedProduct) {
    // Product name doesn't match any known definition — no validation possible
    return []
  }

  // Check each required coverage
  const missingCoverages: string[] = []
  for (const requiredCode of matchedProduct.requiredCoverages) {
    if (!isCoveragePresent(requiredCode, coverages)) {
      missingCoverages.push(requiredCode)
    }
  }

  if (missingCoverages.length === 0) return []

  // Determine if this is a "Tam Kasko" level mismatch (blocking)
  // vs a standard kasko mismatch (critical but not blocking for basic coverages)
  const isTamKaskoLevel = matchedProduct.names.some(
    (n) => n.includes('tam') || n.includes('full') || n.includes('genişletilmiş')
  )

  return [
    {
      marketedName,
      expectedCoverages: matchedProduct.requiredCoverages,
      missingCoverages,
      severity: isTamKaskoLevel ? 'blocking' : 'critical',
      message: `Product "${marketedName}" claims ${matchedProduct.description}, but is missing: ${missingCoverages.join(', ')}`,
      messageTr: `"${marketedName}" ürünü ${matchedProduct.descriptionTr} olarak pazarlanmış, ancak eksik teminatlar: ${missingCoverages.join(', ')}`,
    },
  ]
}

/**
 * Determines whether a "basic kasko" policy should be penalised
 * for missing earthquake/flood coverages.
 *
 * Key insight: Basic kasko (Dar Kasko / standard Kasko) does NOT
 * include EQ and flood as standard coverages — these are paid add-ons.
 * Only "Tam Kasko" is expected to include them. Therefore, missing
 * EQ/flood on a basic kasko is NOT a product mismatch.
 */
export function isBasicKasko(
  marketedName: string | undefined,
  coverages: CanonicalCoverage[]
): boolean {
  if (!marketedName) {
    // No marketed name — infer from coverages
    // If missing both EQ and FLOOD, it's likely basic/standard kasko
    const hasEQ = isCoveragePresent('EARTHQUAKE', coverages)
    const hasFlood = isCoveragePresent('FLOOD', coverages)
    return !hasEQ && !hasFlood
  }

  const normalizedName = marketedName.toLowerCase().trim()

  // Explicitly check for Tam/Full — if not, it's basic
  const tamNames = ['tam kasko', 'full kasko', 'genişletilmiş kasko', 'extended kasko']
  return !tamNames.some((n) => normalizedName.includes(n))
}

/**
 * Returns the list of coverage codes that should NOT be penalised
 * as "missing" for a basic kasko policy.
 */
export function getBasicKaskoExemptCoverages(): string[] {
  return ['EARTHQUAKE', 'EQ_STRUCTURAL', 'EQ_LANDSLIDE', 'FLOOD', 'FLOOD_INUNDATION']
}
