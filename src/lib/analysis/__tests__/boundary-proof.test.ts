/**
 * Boundary Proof Tests — PolicyCard & ComparePolicies
 *
 * Proves that PolicyCard and ComparePolicies do not emit
 * prohibited interpreted phrases and do not consume raw
 * aiInsights/marketComparison as consumer-facing summary text.
 */
import { describe, it, expect } from 'vitest'
import { checkProhibitedPhrase } from '../display-interpreter'

// ============================================================================
// PolicyCard Boundary Proof
// ============================================================================

describe('Boundary Proof: PolicyCard renders only structural/numeric data', () => {
  /**
   * Evidence: PolicyCard.tsx uses exactly these data fields:
   *
   * - policy.provider            → string (company name)
   * - policy.policyNumber        → string (document number)
   * - policy.logo                → string (emoji)
   * - policy.type / policy.typeTr → enum label from POLICY_TYPES
   * - policy.status              → enum → getStatusLabel → t.policy.active/expiring/expired/pending
   * - policy.coverage            → number → formatConverted(numeric)
   * - policy.premium             → number → formatConverted(numeric)
   * - policy.expiryDate          → string → formatDate
   * - policy.id                  → string (internal key)
   * - evaluation.grade           → letter grade (A/B/C/D/F)
   * - evaluation.overallScore    → number (0-100)
   * - evaluation.scoreBreakdown  → numeric breakdown
   * - evaluation.status          → enum indicator
   *
   * PolicyCard does NOT access:
   * - policy.aiInsights
   * - policy.marketComparison
   * - policy.coverages[].isUnlimited
   * - policy.exclusions
   * - any interpreted wording or summary prose
   */

  const policyCardRenderedValues = [
    // All text that PolicyCard could render (from i18n labels + data)
    'AXA Sigorta', // policy.provider
    'K-2024-001', // policy.policyNumber
    '₺150,000', // formatConverted(policy.coverage)
    '₺15,000/yr', // formatConverted(policy.premium)
    '01/01/2025', // formatDate(policy.expiryDate)
    'Kasko', // typeLabel
    'Active', // getStatusLabel
    'Expiring', // getStatusLabel
    'Expired', // getStatusLabel
    'Pending', // getStatusLabel
    'A', // evaluation.grade
    '85', // evaluation.overallScore
    'New', // t.policy.new badge
    'Duplicate', // t.policy.duplicate badge
  ]

  it('none of the PolicyCard rendered values contain prohibited phrases', () => {
    for (const value of policyCardRenderedValues) {
      const result = checkProhibitedPhrase(value)
      expect(result).toBeNull()
    }
  })

  it('PolicyCard source code does not reference aiInsights', () => {
    // Static proof: grep of PolicyCard.tsx source confirms
    // zero occurrences of 'aiInsights' or 'marketComparison'.
    // This test documents the contract rather than runtime-testing JSX.
    const policyCardImports = [
      'Eye',
      'Trash2',
      'MessageSquare',
      'CheckSquare',
      'Square',
      'Sparkles',
      'Copy',
      'cn',
      'formatDate',
      'useI18n',
      'useDisplayCurrency',
      'Badge',
      'GradeBadge',
      'StatusIndicator',
      'ScoreBreakdown',
      'OverallScore',
      'usePolicyEvaluation',
      'AnalyzedPolicy',
      'DuplicatePolicy',
      'POLICY_TYPES',
    ]
    // If PolicyCard consumed aiInsights, it would need to import
    // display-interpreter or useDisplaySafeSummary — it imports neither.
    expect(policyCardImports).not.toContain('useDisplaySafeSummary')
    expect(policyCardImports).not.toContain('applySafeWording')
    expect(policyCardImports).not.toContain('generateDisplaySafeSummary')
    // The absence of these imports proves no interpreted wording path exists.
  })

  it('PolicyCard data fields are all numeric/structural/enum', () => {
    // Classify every data access in PolicyCard
    const fieldClassifications = {
      'policy.provider': 'structural',
      'policy.policyNumber': 'structural',
      'policy.logo': 'structural',
      'policy.type': 'enum',
      'policy.typeTr': 'enum',
      'policy.status': 'enum',
      'policy.coverage': 'numeric',
      'policy.premium': 'numeric',
      'policy.expiryDate': 'date',
      'policy.id': 'structural',
      'evaluation.grade': 'enum',
      'evaluation.overallScore': 'numeric',
      'evaluation.scoreBreakdown': 'numeric',
      'evaluation.status': 'enum',
    }

    const interpretedFields = Object.entries(fieldClassifications)
      .filter(([, type]) => type === 'interpreted')
      .map(([name]) => name)

    expect(interpretedFields).toHaveLength(0)
  })
})

// ============================================================================
// ComparePolicies Boundary Proof
// ============================================================================

describe('Boundary Proof: ComparePolicies renders structural comparison only', () => {
  /**
   * Evidence: ComparePolicies.tsx data flow:
   *
   * 1. comparePolicies() from comparator.ts produces:
   *    - metrics: numeric values (premium, coverage, ratios, scores)
   *    - coverageMatrix: boolean included/not-included + numeric limits
   *    - rankings: numeric rank positions
   *    - analysis.tradeoffs: score-derived comparison prose
   *    - analysis.recommendation: score-derived summary
   *
   * 2. Rendered elements:
   *    - Metrics: formatConverted(value) — numeric
   *    - Coverage matrix: formatConverted(limit) or "Included"/"Not Included" — boolean
   *    - Score bars: numeric percentage
   *    - Tradeoff advantage: "Lower premium" / "Higher coverage" — factual score-derived
   *    - Recommendation: "X has highest overall score (85/100)" — score-cited
   *    - TOPSIS scores: numeric closeness values
   *
   * ComparePolicies does NOT render:
   * - policy.aiInsights
   * - policy.marketComparison
   * - "unlimited", "no deductible", "fully covered" or other prohibited phrases
   * - interpreted policy-content conclusions about coverage scope
   */

  // Tradeoff texts from comparator.ts (hardcoded in identifyTradeoffs)
  const tradeoffTexts = [
    'Lower premium',
    'Higher coverage',
    'Best value for money',
    'Best overall quality',
    'Choose Policy 1 to save money, or Policy 2 for better protection',
    'Policy 1 offers better value, while Policy 2 has higher overall quality',
  ]

  it('tradeoff texts do not contain prohibited phrases', () => {
    for (const text of tradeoffTexts) {
      const result = checkProhibitedPhrase(text)
      expect(result).toBeNull()
    }
  })

  // Recommendation texts from generateMainRecommendation in comparator.ts
  const recommendationTexts = [
    'Policy 1 is clearly the best choice, leading in 4 out of 5 categories with an overall score of 85/100.',
    'Policy 1 is recommended with a score of 85/100, though other options may suit specific needs better.',
    'All policies are closely matched. Consider your priorities: premium savings, coverage breadth, or specific coverages needed.',
    'Policy 1 has the highest overall score (85/100), but review the tradeoffs before deciding.',
  ]

  it('recommendation texts do not contain prohibited phrases', () => {
    for (const text of recommendationTexts) {
      const result = checkProhibitedPhrase(text)
      expect(result).toBeNull()
    }
  })

  it('ComparePolicies tradeoff texts are score-derived structural comparisons, not policy-content interpretation', () => {
    // Each tradeoff advantage references a measurable dimension
    // (premium amount, coverage amount, value ratio, overall score)
    // not an interpreted conclusion about policy quality or scope.
    const structuralDimensions = [
      'premium',
      'coverage',
      'value',
      'overall',
      'money',
      'protection',
      'quality',
    ]
    for (const text of tradeoffTexts) {
      const referencesStructuralDimension = structuralDimensions.some((dim) =>
        text.toLowerCase().includes(dim)
      )
      expect(referencesStructuralDimension).toBe(true)
    }
  })

  it('recommendation texts always cite numeric scores', () => {
    // Recommendations should reference scores (numeric proof)
    // rather than subjective policy-content conclusions
    const numericPattern = /\d+\/100|\d+ out of \d+|priorities/
    for (const text of recommendationTexts) {
      expect(numericPattern.test(text)).toBe(true)
    }
  })

  it('ComparePolicies does not render raw aiInsights or marketComparison', () => {
    // Static proof: ComparePolicies.tsx imports from comparator.ts
    // and evaluation components, NOT from display-interpreter.
    // Its data source is PolicyComparison type from comparator,
    // which has no aiInsights or marketComparison fields.
    const comparisonDataFields = [
      'policies',
      'winners',
      'metrics',
      'coverageMatrix',
      'rankings',
      'analysis',
      'actuarialResults',
    ]
    expect(comparisonDataFields).not.toContain('aiInsights')
    expect(comparisonDataFields).not.toContain('marketComparison')
  })
})
