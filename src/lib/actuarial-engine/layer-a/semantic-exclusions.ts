/**
 * Layer A — Semantic Exclusion Analysis
 *
 * Analyzes policy exclusion clauses to determine their impact
 * on risk scenarios. Uses a pattern-based classification approach
 * with a Turkish insurance term dictionary.
 *
 * In production, this can be enhanced with LLM-based analysis
 * for nuanced exclusion text interpretation. The pattern-based
 * approach serves as a reliable fallback.
 */

import type { SemanticExclusionImpact, Severity, EvidencePointer } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// EXCLUSION PATTERN DATABASE
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Maps exclusion text patterns (Turkish and English) to the
 * risk scenario codes they affect and their severity.
 */
interface ExclusionPattern {
  /** Regex patterns to match in exclusion text (case-insensitive). */
  patterns: RegExp[]
  /** Scenario codes affected by this exclusion. */
  affectedScenarios: string[]
  /** How severely this exclusion impacts the scenarios. */
  severity: Severity
  /** Human-readable rationale. */
  rationale: string
  rationaleTr: string
}

const EXCLUSION_PATTERNS: ExclusionPattern[] = [
  // ── Flood / Water ────────────────────────────────────────────────────
  {
    patterns: [
      /yer\s*alt[ıi]\s*su/i,
      /underground\s*water/i,
      /sel\s*ve\s*su\s*bask[ıi]n[ıi]/i,
      /flood\s*(?:and\s*)?inundation/i,
      /su\s*bask[ıi]n[ıi]/i,
    ],
    affectedScenarios: ['SCN_FLOOD', 'SCN_ZAS_FLOOD'],
    severity: 'critical',
    rationale: 'Excludes flood/water damage — policyholder bears full flood loss',
    rationaleTr: 'Sel/su hasarını kapsam dışı bırakır — poliçe sahibi tüm sel hasarını üstlenir',
  },
  {
    patterns: [
      /sel\s*teminat[ıi]\s*(?:hariç|kapsam\s*d[ıi][şs][ıi])/i,
      /flood\s*(?:coverage\s*)?(?:excluded|not\s*covered)/i,
    ],
    affectedScenarios: ['SCN_FLOOD', 'SCN_ZAS_FLOOD'],
    severity: 'blocking',
    rationale: 'Explicitly excludes flood coverage — no protection for flood events',
    rationaleTr: 'Sel teminatını açıkça kapsam dışı bırakır — sel olaylarında koruma yoktur',
  },

  // ── Earthquake ───────────────────────────────────────────────────────
  {
    patterns: [
      /deprem\s*(?:teminat[ıi]\s*)?(?:hariç|kapsam\s*d[ıi][şs][ıi])/i,
      /earthquake\s*(?:coverage\s*)?(?:excluded|not\s*covered)/i,
    ],
    affectedScenarios: ['SCN_EARTHQUAKE', 'SCN_EQ_MINOR', 'SCN_EQ_MAJOR', 'SCN_EQ_LANDSLIDE'],
    severity: 'blocking',
    rationale: 'Excludes earthquake coverage — no protection for seismic events',
    rationaleTr: 'Deprem teminatını kapsam dışı bırakır — sismik olaylarda koruma yoktur',
  },
  {
    patterns: [
      /deprem\s*sonucu\s*olu[şs]an\s*heyelan/i,
      /earthquake[- ]?induced\s*landslide/i,
      /heyelan\s*(?:hariç|kapsam\s*d[ıi][şs][ıi])/i,
    ],
    affectedScenarios: ['SCN_EQ_LANDSLIDE'],
    severity: 'high',
    rationale: 'Excludes earthquake-induced landslide damage',
    rationaleTr: 'Deprem kaynaklı heyelan hasarını kapsam dışı bırakır',
  },

  // ── Theft ────────────────────────────────────────────────────────────
  {
    patterns: [
      /h[ıi]rs[ıi]zl[ıi]k\s*(?:teminat[ıi]\s*)?(?:hariç|kapsam\s*d[ıi][şs][ıi])/i,
      /theft\s*(?:coverage\s*)?(?:excluded|not\s*covered)/i,
    ],
    affectedScenarios: ['SCN_THEFT'],
    severity: 'blocking',
    rationale: 'Excludes theft coverage',
    rationaleTr: 'Hırsızlık teminatını kapsam dışı bırakır',
  },
  {
    patterns: [
      /anahtar\s*(?:ile|ile\s+yap[ıi]lan)\s*h[ıi]rs[ıi]zl[ıi]k/i,
      /theft\s*(?:with|using)\s*(?:original\s*)?key/i,
      /kontak\s*anahtar[ıi]/i,
    ],
    affectedScenarios: ['SCN_THEFT'],
    severity: 'high',
    rationale: 'Excludes theft using original keys — reduces theft coverage scope',
    rationaleTr:
      'Orijinal anahtarla yapılan hırsızlığı kapsam dışı bırakır — hırsızlık teminatını daraltır',
  },

  // ── Fire ─────────────────────────────────────────────────────────────
  {
    patterns: [
      /yang[ıi]n\s*(?:teminat[ıi]\s*)?(?:hariç|kapsam\s*d[ıi][şs][ıi])/i,
      /fire\s*(?:coverage\s*)?(?:excluded|not\s*covered)/i,
    ],
    affectedScenarios: ['SCN_FIRE'],
    severity: 'blocking',
    rationale: 'Excludes fire coverage',
    rationaleTr: 'Yangın teminatını kapsam dışı bırakır',
  },
  {
    patterns: [
      /elektrik\s*ar[ıi]za/i,
      /electrical\s*fault/i,
      /k[ıi]sa\s*devre/i,
      /short\s*circuit/i,
    ],
    affectedScenarios: ['SCN_FIRE'],
    severity: 'medium',
    rationale: 'Excludes fire from electrical faults — partial reduction in fire protection',
    rationaleTr:
      'Elektrik arızası kaynaklı yangını kapsam dışı bırakır — yangın teminatını kısmen daraltır',
  },

  // ── Natural Disaster ─────────────────────────────────────────────────
  {
    patterns: [
      /do[ğg]al\s*afet\s*(?:teminat[ıi]\s*)?(?:hariç|kapsam\s*d[ıi][şs][ıi])/i,
      /natural\s*disaster\s*(?:coverage\s*)?(?:excluded|not\s*covered)/i,
    ],
    affectedScenarios: ['SCN_NATURAL_DISASTER', 'SCN_ZAS_STORM'],
    severity: 'high',
    rationale: 'Excludes natural disaster coverage',
    rationaleTr: 'Doğal afet teminatını kapsam dışı bırakır',
  },

  // ── Glass ────────────────────────────────────────────────────────────
  {
    patterns: [
      /cam\s*k[ıi]r[ıi]lmas[ıi]\s*(?:hariç|kapsam\s*d[ıi][şs][ıi])/i,
      /glass\s*(?:breakage\s*)?(?:excluded|not\s*covered)/i,
    ],
    affectedScenarios: ['SCN_GLASS'],
    severity: 'low',
    rationale: 'Excludes glass breakage — relatively minor coverage gap',
    rationaleTr:
      'Cam kırılması teminatını kapsam dışı bırakır — nispeten küçük bir teminat boşluğu',
  },

  // ── Negligence / Intentional ─────────────────────────────────────────
  {
    patterns: [
      /alkol\s*(?:etkisi|kullan[ıi]m[ıi])/i,
      /alcohol\s*(?:influence|use)/i,
      /alkollu\s*(?:ara[çc]\s*kullan[ıi]m[ıi])/i,
      /drunk\s*driving/i,
    ],
    affectedScenarios: ['SCN_PARTIAL_COLLISION', 'SCN_TOTAL_LOSS'],
    severity: 'high',
    rationale: 'Excludes claims while under alcohol influence — standard but impactful exclusion',
    rationaleTr:
      'Alkol etkisi altındaki talepleri kapsam dışı bırakır — standart ama etkili bir istisna',
  },
  {
    patterns: [
      /kas[ıi]t(?:l[ıi])?\s*(?:hasar|zarar)/i,
      /intentional\s*(?:damage|harm)/i,
      /bilerek\s*ve\s*isteyerek/i,
    ],
    affectedScenarios: ['SCN_PARTIAL_COLLISION', 'SCN_TOTAL_LOSS', 'SCN_FIRE'],
    severity: 'info',
    rationale: 'Excludes intentional damage — universal exclusion in all policies',
    rationaleTr: 'Kasıtlı hasarı kapsam dışı bırakır — tüm poliçelerde bulunan evrensel istisna',
  },

  // ── War / Terrorism ──────────────────────────────────────────────────
  {
    patterns: [
      /sava[şs]\s*(?:ve\s*)?ter[öo]r/i,
      /war\s*(?:and\s*)?terrorism/i,
      /ter[öo]r\s*(?:sald[ıi]r[ıi])/i,
    ],
    affectedScenarios: [
      'SCN_PARTIAL_COLLISION',
      'SCN_TOTAL_LOSS',
      'SCN_FIRE',
      'SCN_EARTHQUAKE',
      'SCN_EQ_MAJOR',
    ],
    severity: 'info',
    rationale: 'Excludes war/terrorism — universal exclusion, typically non-insurable',
    rationaleTr: 'Savaş/terör istisnası — evrensel istisna, genellikle sigorta edilemez',
  },

  // ── Wildfire ─────────────────────────────────────────────────────────
  {
    patterns: [
      /orman\s*yang[ıi]n[ıi]\s*(?:hariç|kapsam\s*d[ıi][şs][ıi])/i,
      /wildfire\s*(?:excluded|not\s*covered)/i,
      /forest\s*fire\s*(?:excluded|not\s*covered)/i,
    ],
    affectedScenarios: ['SCN_ZAS_WILDFIRE'],
    severity: 'high',
    rationale: 'Excludes wildfire damage',
    rationaleTr: 'Orman yangını hasarını kapsam dışı bırakır',
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from 'crypto'

/**
 * In-memory LRU-style cache for semantic exclusion texts.
 * Maps SHA-256 hash of the exclusion text to its SemanticExclusionImpact.
 * This prevents re-analyzing identical policy exclusions across thousands of evaluations.
 */
const EXCLUSION_MEMO_CACHE = new Map<string, SemanticExclusionImpact>()
const MAX_CACHE_SIZE = 10000

/**
 * Generates a SHA-256 hash of the exclusion text for fast cache lookups.
 */
function hashExclusion(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

/**
 * Analyzes exclusion texts using pattern-based classification.
 * This is the deterministic fallback — no LLM required.
 * Accelerated with SHA-256 caching for frequently seen identical clauses.
 *
 * @param exclusionTexts - Raw exclusion text strings from the policy
 * @param evidence - Optional evidence pointers for each exclusion text
 * @returns Array of semantic exclusion impacts
 */
export function analyzeExclusions(
  exclusionTexts: string[],
  evidence?: EvidencePointer[][]
): SemanticExclusionImpact[] {
  const results: SemanticExclusionImpact[] = []

  for (let i = 0; i < exclusionTexts.length; i++) {
    const text = exclusionTexts[i]
    const textEvidence = evidence?.[i] ?? []

    // Check cache first to bypass expensive regex scanning
    const hash = hashExclusion(text)
    const cachedItem = EXCLUSION_MEMO_CACHE.get(hash)
    if (cachedItem) {
      // Return a copy but map the new evidence pointers if applicable
      results.push({
        ...cachedItem,
        evidence: textEvidence,
        needsReview: textEvidence.length === 0,
      })
      continue
    }

    const matchedPatterns = findMatchingPatterns(text)

    if (matchedPatterns.length === 0) {
      // No pattern matched — flag for review
      results.push({
        exclusionText: text,
        affectedScenarios: [],
        severity: 'info',
        rationale: 'No matching pattern found — manual review recommended',
        evidence: textEvidence,
        needsReview: true,
      })
      continue
    }

    // Merge all matches for this exclusion text
    const allScenarios = new Set<string>()
    let maxSeverity: Severity = 'info'
    const rationales: string[] = []

    for (const pattern of matchedPatterns) {
      for (const scenario of pattern.affectedScenarios) {
        allScenarios.add(scenario)
      }

      if (severityRank(pattern.severity) > severityRank(maxSeverity)) {
        maxSeverity = pattern.severity
      }

      rationales.push(pattern.rationale)
    }

    const impact: SemanticExclusionImpact = {
      exclusionText: text,
      affectedScenarios: [...allScenarios],
      severity: maxSeverity,
      rationale: rationales.join('; '),
      evidence: textEvidence,
      needsReview: textEvidence.length === 0,
    }

    // Evict oldest item if we exceed max size (basic FIFO mechanism)
    if (EXCLUSION_MEMO_CACHE.size >= MAX_CACHE_SIZE) {
      const firstKey = EXCLUSION_MEMO_CACHE.keys().next().value
      if (firstKey) EXCLUSION_MEMO_CACHE.delete(firstKey)
    }

    // Store in cache without specific evidence (evidence is mapped on recovery)
    EXCLUSION_MEMO_CACHE.set(hash, { ...impact, evidence: [] })
    results.push(impact)
  }

  return results
}

/**
 * Finds all matching exclusion patterns for a text string.
 */
function findMatchingPatterns(text: string): ExclusionPattern[] {
  return EXCLUSION_PATTERNS.filter((pattern) => pattern.patterns.some((regex) => regex.test(text)))
}

/**
 * Numeric ranking for severity levels (higher = more severe).
 */
function severityRank(severity: Severity): number {
  const ranks: Record<Severity, number> = {
    info: 0,
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
    blocking: 5,
  }
  return ranks[severity]
}

/**
 * Filters exclusions to only those that affect scenarios relevant
 * to the given coverage codes.
 */
export function filterExclusionsByRelevance(
  exclusions: SemanticExclusionImpact[],
  relevantScenarioCodes: string[]
): SemanticExclusionImpact[] {
  return exclusions.filter((excl) =>
    excl.affectedScenarios.some((s) => relevantScenarioCodes.includes(s))
  )
}

/**
 * Counts the number of blocking/critical exclusions affecting
 * a specific set of scenario codes.
 */
export function countSevereExclusions(
  exclusions: SemanticExclusionImpact[],
  scenarioCodes?: string[]
): { blocking: number; critical: number; total: number } {
  let blocking = 0
  let critical = 0

  for (const excl of exclusions) {
    const isRelevant =
      !scenarioCodes || excl.affectedScenarios.some((s) => scenarioCodes.includes(s))

    if (!isRelevant) continue

    if (excl.severity === 'blocking') blocking++
    if (excl.severity === 'critical') critical++
  }

  return { blocking, critical, total: blocking + critical }
}
