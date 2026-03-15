import { InsightBundle, InsightDetail, InsightCategory } from '@/types/analysis'
import { ExtractedPolicyData } from '@/lib/ai/extraction-schema'

const INSIGHT_MODEL_VERSION = '1.0.0'

function generateId(): string {
  return Math.random().toString(36).substring(2, 9)
}

/**
 * Deterministic insight engine.
 * Filters raw AI insights and adds structural insights.
 */
export function generateInsightBundle(data: ExtractedPolicyData): InsightBundle {
  const generatedAt = new Date().toISOString()
  const insights: InsightDetail[] = []

  // 1. Process AI Generated Insights from Evidence
  if (data.evidence?.insights) {
    for (const rawInsight of data.evidence.insights) {
      const insight = processRawAiInsight(rawInsight, generatedAt)
      if (insight) {
        insights.push(insight)
      }
    }
  }

  // 2. Deterministic Structural Insights

  // Market Value Check for KASKO
  if (data.policyType === 'kasko') {
    const hasMarketValue = data.coverages?.some((c) => c.isMarketValue)
    if (hasMarketValue) {
      insights.push({
        id: generateId(),
        type: 'positive_confirmed',
        severity: 'medium',
        text_internal: 'Policy covers vehicle at market value (Rayiç Değer).',
        basisType: 'policy_fact',
        displayEligibility: true,
        generatedByRule: 'DETERMINISTIC_RAYIC_DEGER',
        generatedAt,
      })
    } else {
      insights.push({
        id: generateId(),
        type: 'unresolved_data_gap',
        severity: 'high',
        text_internal: 'Could not explicitly confirm market value (Rayiç Değer) protection.',
        basisType: 'unresolved',
        displayEligibility: true,
        generatedByRule: 'MISSING_RAYIC_DEGER',
        generatedAt,
      })
    }
  }

  // Deductible check
  const deductibles = data.coverages?.filter((c) => c.deductible !== null && c.deductible > 0) || []
  if (deductibles.length > 0) {
    insights.push({
      id: generateId(),
      type: 'caution_confirmed',
      severity: 'medium',
      text_internal: `Policy contains ${deductibles.length} coverages with specific deductibles.`,
      basisType: 'policy_fact',
      displayEligibility: true,
      generatedByRule: 'DETERMINISTIC_DEDUCTIBLE_COUNT',
      generatedAt,
    })
  } else if (data.coverages && data.coverages.length > 0) {
    // Only conditionally state no deductibles if we are highly confident
    insights.push({
      id: generateId(),
      type: 'positive_conditional',
      severity: 'medium',
      text_internal:
        'No specific exclusions or deductibles were identified, but general conditions apply.',
      basisType: 'conditional_policy_fact',
      displayEligibility: true, // Conditionally safe wording
      generatedByRule: 'DETERMINISTIC_NO_DEDUCTIBLE_CONDITIONAL',
      generatedAt,
    })
  }

  return {
    insights,
    bundleVersion: INSIGHT_MODEL_VERSION,
    generatedAt,
  }
}

/**
 * Scans raw AI insights for prohibited dangerous terms (Display Suppression Policy).
 * Applies fallback categorization or blocks entirely.
 */
function processRawAiInsight(
  raw: { text: string; textEn: string; quote: string },
  generatedAt: string
): InsightDetail | null {
  const textLower = raw.textEn.toLowerCase()
  const displaySafe = enforceDisplaySuppression(textLower)

  // Determine Category based on sentiment/danger
  let type: InsightCategory = 'positive_conditional'
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'low'

  if (
    textLower.includes('not covered') ||
    textLower.includes('excluded') ||
    textLower.includes('warning') ||
    textLower.includes('caution')
  ) {
    type = 'caution_conditional'
    severity = 'medium'
  }

  if (displaySafe.blocked) {
    return {
      id: generateId(),
      type,
      severity: 'high',
      text_internal: `[SUPPRESSED] Original: ${raw.textEn}`,
      basisType: 'unresolved',
      displayEligibility: false,
      blockingReason: displaySafe.reason,
      generatedByRule: 'AI_RAW_FILTERED',
      generatedAt,
      // We could map the raw quote into EvidenceRefs if we had the full evidence model available here
    }
  }

  return {
    id: generateId(),
    type,
    severity,
    text_internal: raw.textEn,
    basisType: 'conditional_policy_fact',
    displayEligibility: true,
    generatedByRule: 'AI_RAW_ALLOWED',
    generatedAt,
  }
}

function enforceDisplaySuppression(text: string): { blocked: boolean; reason?: string } {
  const displayDangerWords = [
    'fully covered',
    'tam kapsamlı',
    'tamamen kapsar',
    'no deductible',
    'muafiyetsiz',
    'guaranteed',
    'aracınızın tam değeri ödenir',
  ]

  for (const word of displayDangerWords) {
    if (text.includes(word)) {
      return {
        blocked: true,
        reason: `Violation of Suppression Policy: contains prohibited phrase '${word}'`,
      }
    }
  }

  return { blocked: false }
}
