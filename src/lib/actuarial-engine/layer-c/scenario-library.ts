/**
 * Risk Scenario Library
 *
 * Defines standard risk scenarios for Turkish insurance products.
 * Each scenario specifies:
 * - Annual occurrence frequency (ρⱼ)
 * - Loss distribution parameters
 * - Affected canonical coverage codes
 *
 * All values are Turkish market defaults calibrated from
 * SEDDK/TSB published statistics and industry experience.
 * Frequencies and distribution parameters are configurable
 * via admin settings.
 */

import type { RiskScenario } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// KASKO (MOTOR OWN DAMAGE) SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────

export const KASKO_SCENARIOS: RiskScenario[] = [
  {
    code: 'SCN_PARTIAL_COLLISION',
    label: 'Partial Collision Damage',
    labelTr: 'Kısmi Çarpma Hasarı',
    frequency: 0.06,
    lossDistribution: { type: 'lognormal', mu: 9.2, sigma: 0.8 },
    affectedCoverages: ['COLLISION', 'COLLISION_DAMAGE'],
    description: 'Minor to moderate collision damage — fender benders, parking incidents',
  },
  {
    code: 'SCN_TOTAL_LOSS',
    label: 'Total Loss / Write-Off',
    labelTr: 'Tam Hasar / Pertotal',
    frequency: 0.015,
    lossDistribution: { type: 'lognormal', mu: 11.5, sigma: 0.6 },
    affectedCoverages: ['COLLISION', 'COLLISION_DAMAGE'],
    description: 'Vehicle declared total loss — repair cost exceeds value threshold',
  },
  {
    code: 'SCN_THEFT',
    label: 'Vehicle Theft',
    labelTr: 'Araç Hırsızlığı',
    frequency: 0.008,
    lossDistribution: { type: 'lognormal', mu: 11.0, sigma: 0.7 },
    affectedCoverages: ['THEFT', 'THEFT_ROBBERY'],
    description: 'Full vehicle theft — typically near market value loss',
  },
  {
    code: 'SCN_FLOOD',
    label: 'Flood / Water Damage',
    labelTr: 'Sel / Su Hasarı',
    frequency: 0.012,
    lossDistribution: { type: 'lognormal', mu: 10.0, sigma: 1.0 },
    affectedCoverages: ['FLOOD', 'FLOOD_INUNDATION'],
    description: 'Flash flood, heavy rain, underground water damage to vehicle',
  },
  {
    code: 'SCN_EARTHQUAKE',
    label: 'Earthquake Damage',
    labelTr: 'Deprem Hasarı',
    frequency: 0.005,
    lossDistribution: { type: 'pareto', alpha: 2.5, xMin: 50000 },
    affectedCoverages: ['EARTHQUAKE', 'EQ_STRUCTURAL', 'EQ_LANDSLIDE'],
    description: 'Catastrophic earthquake — structural collapse, falling objects, landslide',
  },
  {
    code: 'SCN_FIRE',
    label: 'Fire / Explosion',
    labelTr: 'Yangın / Patlama',
    frequency: 0.003,
    lossDistribution: { type: 'lognormal', mu: 10.5, sigma: 1.2 },
    affectedCoverages: ['FIRE', 'FIRE_EXPLOSION'],
    description: 'Vehicle fire from electrical, mechanical, or external cause',
  },
  {
    code: 'SCN_GLASS',
    label: 'Glass Breakage',
    labelTr: 'Cam Kırılması',
    frequency: 0.04,
    lossDistribution: { type: 'lognormal', mu: 7.5, sigma: 0.5 },
    affectedCoverages: ['GLASS', 'GLASS_BREAKAGE'],
    description: 'Windshield or window glass damage from road debris, vandalism',
  },
  {
    code: 'SCN_NATURAL_DISASTER',
    label: 'Natural Disaster (Non-EQ)',
    labelTr: 'Doğal Afet (Deprem Dışı)',
    frequency: 0.01,
    lossDistribution: { type: 'lognormal', mu: 9.5, sigma: 0.9 },
    affectedCoverages: ['NATURAL_DISASTER', 'STORM', 'WINDSTORM', 'HAIL'],
    description: 'Storm, hail, landslide (non-earthquake natural events)',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// TRAFFIC (ZMMS / MTPL) SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────

export const TRAFFIC_SCENARIOS: RiskScenario[] = [
  {
    code: 'SCN_BODILY_INJURY_MINOR',
    label: 'Minor Bodily Injury',
    labelTr: 'Hafif Beden Hasarı',
    frequency: 0.025,
    lossDistribution: { type: 'lognormal', mu: 10.0, sigma: 1.0 },
    affectedCoverages: ['BODILY_INJURY_PER_PERSON', 'BODILY_INJURY_PER_ACCIDENT'],
    description: 'Minor injuries from traffic accident — medical costs, temporary disability',
  },
  {
    code: 'SCN_BODILY_INJURY_SEVERE',
    label: 'Severe Bodily Injury / Death',
    labelTr: 'Ağır Beden Hasarı / Ölüm',
    frequency: 0.003,
    lossDistribution: { type: 'pareto', alpha: 2.0, xMin: 200000 },
    affectedCoverages: ['BODILY_INJURY_PER_PERSON', 'BODILY_INJURY_PER_ACCIDENT'],
    description: 'Severe injury, permanent disability, or death — high-value claim',
  },
  {
    code: 'SCN_MATERIAL_DAMAGE',
    label: 'Third-Party Material Damage',
    labelTr: 'Üçüncü Kişi Maddi Hasar',
    frequency: 0.04,
    lossDistribution: { type: 'lognormal', mu: 10.5, sigma: 0.8 },
    affectedCoverages: ['MATERIAL_DAMAGE_PER_VEHICLE', 'MATERIAL_DAMAGE_PER_ACCIDENT'],
    description: 'Damage to third-party vehicle or property',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// DASK (EARTHQUAKE INSURANCE) SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────

export const DASK_SCENARIOS: RiskScenario[] = [
  {
    code: 'SCN_EQ_MINOR',
    label: 'Minor Earthquake Damage',
    labelTr: 'Hafif Deprem Hasarı',
    frequency: 0.02,
    lossDistribution: { type: 'lognormal', mu: 10.0, sigma: 0.8 },
    affectedCoverages: ['EARTHQUAKE', 'EQ_STRUCTURAL'],
    description: 'Cosmetic/minor structural damage from moderate earthquake',
  },
  {
    code: 'SCN_EQ_MAJOR',
    label: 'Major Earthquake — Structural',
    labelTr: 'Büyük Deprem — Yapısal Hasar',
    frequency: 0.005,
    lossDistribution: { type: 'pareto', alpha: 2.0, xMin: 100000 },
    affectedCoverages: ['EARTHQUAKE', 'EQ_STRUCTURAL', 'EQ_LANDSLIDE'],
    description: 'Severe structural damage or collapse from major earthquake',
  },
  {
    code: 'SCN_EQ_LANDSLIDE',
    label: 'Earthquake-Induced Landslide',
    labelTr: 'Deprem Kaynaklı Heyelan',
    frequency: 0.002,
    lossDistribution: { type: 'pareto', alpha: 2.5, xMin: 80000 },
    affectedCoverages: ['EQ_LANDSLIDE', 'EARTHQUAKE'],
    description: 'Landslide triggered by seismic activity',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// ZAS (MANDATORY DISASTER INSURANCE — DRAFT) SCENARIOS
// ─────────────────────────────────────────────────────────────────────────────

export const ZAS_SCENARIOS: RiskScenario[] = [
  {
    code: 'SCN_ZAS_FLOOD',
    label: 'Flood (ZAS)',
    labelTr: 'Sel (ZAS)',
    frequency: 0.015,
    lossDistribution: { type: 'lognormal', mu: 10.5, sigma: 1.0 },
    affectedCoverages: ['FLOOD', 'FLOOD_INUNDATION'],
    description: 'Residential flood damage under ZAS framework',
  },
  {
    code: 'SCN_ZAS_STORM',
    label: 'Storm (ZAS)',
    labelTr: 'Fırtına (ZAS)',
    frequency: 0.01,
    lossDistribution: { type: 'lognormal', mu: 9.8, sigma: 0.9 },
    affectedCoverages: ['STORM', 'WINDSTORM'],
    description: 'Storm/windstorm damage under ZAS framework',
  },
  {
    code: 'SCN_ZAS_WILDFIRE',
    label: 'Wildfire (ZAS)',
    labelTr: 'Orman Yangını (ZAS)',
    frequency: 0.004,
    lossDistribution: { type: 'pareto', alpha: 2.5, xMin: 60000 },
    affectedCoverages: ['WILDFIRE', 'FIRE_FOREST'],
    description: 'Wildfire damage under ZAS framework',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// SCENARIO REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

import type { ActuarialPolicyType } from '../types'

/**
 * Returns the default risk scenarios for a given policy type.
 */
export function getScenariosForPolicyType(policyType: ActuarialPolicyType): RiskScenario[] {
  switch (policyType) {
    case 'kasko':
      return [...KASKO_SCENARIOS]
    case 'traffic':
      return [...TRAFFIC_SCENARIOS]
    case 'dask':
      return [...DASK_SCENARIOS]
    case 'zas':
      return [...ZAS_SCENARIOS, ...DASK_SCENARIOS] // ZAS extends DASK
    default: {
      const _exhaustive: never = policyType
      throw new Error(`Unknown policy type: ${_exhaustive}`)
    }
  }
}

/**
 * Returns all scenarios across all policy types.
 * Useful for configuration UIs showing the full scenario library.
 */
export function getAllScenarios(): RiskScenario[] {
  return [...KASKO_SCENARIOS, ...TRAFFIC_SCENARIOS, ...DASK_SCENARIOS, ...ZAS_SCENARIOS]
}

/**
 * Finds a scenario by its code.
 */
export function getScenarioByCode(code: string): RiskScenario | undefined {
  return getAllScenarios().find((s) => s.code === code)
}

/**
 * Overrides scenario parameters with custom frequencies/distributions.
 * Used when admin configures custom values via settings.
 */
export function overrideScenarioParams(
  scenarios: RiskScenario[],
  overrides: Partial<
    Record<string, { frequency?: number; lossDistribution?: RiskScenario['lossDistribution'] }>
  >
): RiskScenario[] {
  return scenarios.map((scenario) => {
    const override = overrides[scenario.code]
    if (!override) return scenario

    return {
      ...scenario,
      ...(override.frequency !== undefined && { frequency: override.frequency }),
      ...(override.lossDistribution !== undefined && {
        lossDistribution: override.lossDistribution,
      }),
    }
  })
}
