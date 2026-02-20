/**
 * Rule Pack System
 *
 * Manages locale and policy rule packs for:
 * - Deterministic normalization
 * - Validation gates
 * - Extraction targets
 *
 * Rule packs are versioned and can be:
 * - Loaded from filesystem (default packs)
 * - Loaded from database (custom packs)
 * - Overridden at runtime
 */

import type { LocaleRulePack, PolicyRulePack } from '@insurai/types'

// ============================================================================
// RULE PACK REGISTRY
// ============================================================================

export class RulePackRegistry {
  private localePacks: Map<string, LocaleRulePack> = new Map()
  private policyPacks: Map<string, PolicyRulePack> = new Map()
  private fallbackLocalePack: LocaleRulePack | null = null
  private fallbackPolicyPack: PolicyRulePack | null = null

  /**
   * Register a locale rule pack
   */
  registerLocalePack(pack: LocaleRulePack): void {
    const key = this.makeKey(pack.locale, pack.version)
    this.localePacks.set(key, pack)

    // Also register as latest version
    this.localePacks.set(pack.locale, pack)
  }

  /**
   * Register a policy rule pack
   */
  registerPolicyPack(pack: PolicyRulePack): void {
    const key = this.makeKey(pack.policyType, pack.version)
    this.policyPacks.set(key, pack)

    // Also register as latest version
    this.policyPacks.set(pack.policyType, pack)
  }

  /**
   * Set fallback packs for unknown locales/policies
   */
  setFallbackPacks(locale: LocaleRulePack, policy: PolicyRulePack): void {
    this.fallbackLocalePack = locale
    this.fallbackPolicyPack = policy
  }

  /**
   * Get a locale pack by locale code
   */
  getLocalePack(locale: string, version?: string): LocaleRulePack | null {
    const key = version ? this.makeKey(locale, version) : locale
    return this.localePacks.get(key) || this.fallbackLocalePack
  }

  /**
   * Get a policy pack by policy type
   */
  getPolicyPack(policyType: string, version?: string): PolicyRulePack | null {
    const key = version ? this.makeKey(policyType, version) : policyType
    return this.policyPacks.get(key) || this.fallbackPolicyPack
  }

  /**
   * Get all registered locale packs
   */
  getAllLocalePacks(): LocaleRulePack[] {
    const seen = new Set<string>()
    const packs: LocaleRulePack[] = []

    for (const [_key, pack] of this.localePacks) {
      if (!seen.has(pack.id)) {
        seen.add(pack.id)
        packs.push(pack)
      }
    }

    return packs
  }

  /**
   * Get all registered policy packs
   */
  getAllPolicyPacks(): PolicyRulePack[] {
    const seen = new Set<string>()
    const packs: PolicyRulePack[] = []

    for (const [_key, pack] of this.policyPacks) {
      if (!seen.has(pack.id)) {
        seen.add(pack.id)
        packs.push(pack)
      }
    }

    return packs
  }

  /**
   * Check if a locale is supported
   */
  hasLocale(locale: string): boolean {
    return this.localePacks.has(locale)
  }

  /**
   * Check if a policy type is supported
   */
  hasPolicyType(policyType: string): boolean {
    return this.policyPacks.has(policyType)
  }

  private makeKey(identifier: string, version: string): string {
    return `${identifier}@${version}`
  }
}

// ============================================================================
// RULE PACK LOADER
// ============================================================================

import { turkishLocalePack } from './packs/locales/tr-TR'
import { germanLocalePack } from './packs/locales/de-DE'
import { englishGBLocalePack } from './packs/locales/en-GB'
import { fallbackLocalePack } from './packs/locales/fallback'

import { motorKaskoTRPack } from './packs/policies/motor-kasko-tr'
import { motorTrafficTRPack } from './packs/policies/motor-traffic-tr'
import { propertyFireTRPack } from './packs/policies/property-fire-tr'
import { daskTRPack } from './packs/policies/dask-tr'
import { fallbackPolicyPack } from './packs/policies/fallback'

/**
 * Create a pre-configured registry with all default packs
 */
export function createDefaultRegistry(): RulePackRegistry {
  const registry = new RulePackRegistry()

  // Register locale packs
  registry.registerLocalePack(turkishLocalePack)
  registry.registerLocalePack(germanLocalePack)
  registry.registerLocalePack(englishGBLocalePack)

  // Register policy packs
  registry.registerPolicyPack(motorKaskoTRPack)
  registry.registerPolicyPack(motorTrafficTRPack)
  registry.registerPolicyPack(propertyFireTRPack)
  registry.registerPolicyPack(daskTRPack)

  // Set fallbacks
  registry.setFallbackPacks(fallbackLocalePack, fallbackPolicyPack)

  return registry
}

// ============================================================================
// RULE PACK SELECTION
// ============================================================================

export interface PackSelectionResult {
  locale: LocaleRulePack
  policy: PolicyRulePack | null
  confidence: number
  detectionMethod: 'hint' | 'auto' | 'fallback'
}

export interface DetectionInput {
  text: string
  filename?: string
  hints?: {
    locale?: string
    policyType?: string
  }
}

/**
 * Auto-detect and select appropriate rule packs
 */
export function selectRulePacks(
  registry: RulePackRegistry,
  input: DetectionInput
): PackSelectionResult {
  let locale: LocaleRulePack
  let policy: PolicyRulePack | null = null
  let confidence = 0
  let detectionMethod: 'hint' | 'auto' | 'fallback' = 'auto'

  // Check hints first
  if (input.hints?.locale) {
    const hintedLocale = registry.getLocalePack(input.hints.locale)
    if (hintedLocale) {
      locale = hintedLocale
      confidence = 1.0
      detectionMethod = 'hint'
    }
  }

  // Auto-detect locale if not hinted
  if (!locale) {
    const detected = detectLocale(input.text)
    const detectedPack = registry.getLocalePack(detected.locale)

    if (detectedPack) {
      locale = detectedPack
      confidence = detected.confidence
      detectionMethod = 'auto'
    } else {
      const fallbackPack = registry.getLocalePack('fallback')
      if (!fallbackPack) throw new Error('Fallback locale pack is not registered')
      locale = fallbackPack
      confidence = 0.5
      detectionMethod = 'fallback'
    }
  }

  // Check policy hints
  if (input.hints?.policyType) {
    const hintedPolicy = registry.getPolicyPack(input.hints.policyType)
    if (hintedPolicy) {
      policy = hintedPolicy
    }
  }

  // Auto-detect policy type if not hinted
  if (!policy) {
    const detected = detectPolicyType(input.text, locale.locale)
    if (detected.policyType && detected.confidence > 0.6) {
      policy = registry.getPolicyPack(detected.policyType)
    }
  }

  return { locale, policy, confidence, detectionMethod }
}

// ============================================================================
// LOCALE DETECTION
// ============================================================================

interface LocaleDetectionResult {
  locale: string
  confidence: number
  signals: string[]
}

/**
 * Detect locale from text using multiple signals
 */
export function detectLocale(text: string): LocaleDetectionResult {
  const signals: string[] = []
  const scores: Record<string, number> = {}

  // Turkish signals
  if (/[İıĞğŞşÜüÖöÇç]/.test(text)) {
    scores['tr-TR'] = (scores['tr-TR'] || 0) + 0.3
    signals.push('turkish_chars')
  }
  if (/\b(sigorta|poliçe|teminat|prim|muafiyet)\b/i.test(text)) {
    scores['tr-TR'] = (scores['tr-TR'] || 0) + 0.3
    signals.push('turkish_insurance_terms')
  }
  if (/₺|TL|TRY/i.test(text)) {
    scores['tr-TR'] = (scores['tr-TR'] || 0) + 0.2
    signals.push('turkish_currency')
  }
  if (/T\.?C\.?\s*Kimlik|TCKN/i.test(text)) {
    scores['tr-TR'] = (scores['tr-TR'] || 0) + 0.2
    signals.push('turkish_national_id')
  }

  // German signals
  if (/[äöüßÄÖÜ]/.test(text)) {
    scores['de-DE'] = (scores['de-DE'] || 0) + 0.3
    signals.push('german_chars')
  }
  if (/\b(Versicherung|Police|Deckung|Prämie)\b/i.test(text)) {
    scores['de-DE'] = (scores['de-DE'] || 0) + 0.3
    signals.push('german_insurance_terms')
  }
  if (/€|EUR/i.test(text)) {
    scores['de-DE'] = (scores['de-DE'] || 0) + 0.15
    signals.push('euro_currency')
  }

  // English signals
  if (/\b(insurance|policy|coverage|premium|deductible)\b/i.test(text)) {
    scores['en-GB'] = (scores['en-GB'] || 0) + 0.3
    signals.push('english_insurance_terms')
  }
  if (/£|GBP/i.test(text)) {
    scores['en-GB'] = (scores['en-GB'] || 0) + 0.2
    signals.push('gbp_currency')
  }
  if (/\$|USD/i.test(text)) {
    scores['en-US'] = (scores['en-US'] || 0) + 0.2
    signals.push('usd_currency')
  }

  // Find highest scoring locale
  let bestLocale = 'en-GB' // default
  let bestScore = 0

  for (const [locale, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score
      bestLocale = locale
    }
  }

  return {
    locale: bestLocale,
    confidence: Math.min(bestScore, 1.0),
    signals,
  }
}

// ============================================================================
// POLICY TYPE DETECTION
// ============================================================================

interface PolicyTypeDetectionResult {
  policyType: string | null
  confidence: number
  matchedKeywords: string[]
}

/**
 * Detect policy type from text
 */
export function detectPolicyType(text: string, locale: string): PolicyTypeDetectionResult {
  const matchedKeywords: string[] = []
  const scores: Record<string, number> = {}

  // Turkish policy types
  if (locale === 'tr-TR' || locale.startsWith('tr')) {
    // Motor Kasko
    if (/\bkasko\b/i.test(text)) {
      scores['motor_kasko'] = (scores['motor_kasko'] || 0) + 0.4
      matchedKeywords.push('kasko')
    }
    if (/\b(araç|plaka|şasi|motor\s*no)\b/i.test(text)) {
      scores['motor_kasko'] = (scores['motor_kasko'] || 0) + 0.2
      matchedKeywords.push('vehicle_terms')
    }
    if (/\bbirleşik\s*kasko\b/i.test(text)) {
      scores['motor_kasko'] = (scores['motor_kasko'] || 0) + 0.3
      matchedKeywords.push('birlesik_kasko')
    }
    if (/\bgenişletilmiş\s*kasko\b/i.test(text)) {
      scores['motor_kasko'] = (scores['motor_kasko'] || 0) + 0.3
      matchedKeywords.push('genisletilmis_kasko')
    }

    // Motor Traffic (ZMSS)
    if (/\btrafik\s*(sigortası)?\b/i.test(text)) {
      scores['motor_traffic'] = (scores['motor_traffic'] || 0) + 0.4
      matchedKeywords.push('trafik')
    }
    if (/\bzorunlu\s*mali\s*sorumluluk\b/i.test(text)) {
      scores['motor_traffic'] = (scores['motor_traffic'] || 0) + 0.4
      matchedKeywords.push('zmss')
    }
    if (/\bZMSS\b/.test(text)) {
      scores['motor_traffic'] = (scores['motor_traffic'] || 0) + 0.5
      matchedKeywords.push('zmss_abbrev')
    }

    // DASK (Earthquake)
    if (/\bDASK\b/.test(text)) {
      scores['property_dask'] = (scores['property_dask'] || 0) + 0.6
      matchedKeywords.push('dask')
    }
    if (/\bdeprem\s*(sigortası)?\b/i.test(text)) {
      scores['property_dask'] = (scores['property_dask'] || 0) + 0.4
      matchedKeywords.push('deprem')
    }
    if (/\bzorunlu\s*deprem\b/i.test(text)) {
      scores['property_dask'] = (scores['property_dask'] || 0) + 0.4
      matchedKeywords.push('zorunlu_deprem')
    }

    // Property Fire
    if (/\byangın\s*(sigortası)?\b/i.test(text)) {
      scores['property_fire'] = (scores['property_fire'] || 0) + 0.4
      matchedKeywords.push('yangin')
    }
    if (/\bkonut\s*(sigortası)?\b/i.test(text)) {
      scores['property_fire'] = (scores['property_fire'] || 0) + 0.3
      matchedKeywords.push('konut')
    }
  }

  // Find highest scoring policy type
  let bestType: string | null = null
  let bestScore = 0

  for (const [policyType, score] of Object.entries(scores)) {
    if (score > bestScore) {
      bestScore = score
      bestType = policyType
    }
  }

  return {
    policyType: bestType,
    confidence: Math.min(bestScore, 1.0),
    matchedKeywords,
  }
}

// ============================================================================
// EXPORTS
// ============================================================================

export { turkishLocalePack, validateTCKimlik } from './packs/locales/tr-TR'
export { germanLocalePack } from './packs/locales/de-DE'
export { englishGBLocalePack } from './packs/locales/en-GB'
export { fallbackLocalePack } from './packs/locales/fallback'

export { motorKaskoTRPack } from './packs/policies/motor-kasko-tr'
export { motorTrafficTRPack } from './packs/policies/motor-traffic-tr'
export { propertyFireTRPack } from './packs/policies/property-fire-tr'
export { daskTRPack } from './packs/policies/dask-tr'
export { fallbackPolicyPack } from './packs/policies/fallback'

export type {
  LocaleRulePack,
  PolicyRulePack,
  RulePack,
  RulePackType,
  SupportedLocale,
  SupportedPolicyType,
} from '@insurai/types'
