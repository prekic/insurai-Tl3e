import { AnalyzedPolicy, ClauseGraph, ClauseRelationship } from '@/types/policy'

/**
 * Resolves relationships between policy clauses based on the extracted clauseGraph
 * and applies precedence rules to override or merge coverages and conditions.
 */
export function resolveClauseRelationships(
  policy: AnalyzedPolicy,
  extractedGraph?: {
    edges: Array<{
      sourceId: string
      targetId?: string | null
      relationshipType: string
      description?: string
      isCandidate?: boolean
    }>
  }
): AnalyzedPolicy {
  // 1. Convert extracted raw edges to typed ClauseRelationships
  const targetGraph: ClauseGraph = {
    nodes: {},
    edges: [],
  }

  if (extractedGraph?.edges && Array.isArray(extractedGraph.edges)) {
    targetGraph.edges = extractedGraph.edges.map((edge) => ({
      sourceId: edge.sourceId,
      targetId: edge.targetId ?? null,
      relationshipType: edge.relationshipType as import('@/types/policy').RelationshipType,
      description: edge.description ?? undefined,
      isCandidate: edge.isCandidate ?? false,
      precedenceWeight: getPrecedenceWeight(edge.relationshipType),
    }))
  }

  // Handle graph overrides and modifications to the policy object
  const updatedPolicy = { ...policy }

  // Check for safe/unsafe resolutions and potential contradictions
  // Iterate strictly by precedence weight (highest overrides lowest)
  const sortedEdges = [...targetGraph.edges].sort(
    (a, b) => (b.precedenceWeight ?? 0) - (a.precedenceWeight ?? 0)
  )

  for (const edge of sortedEdges) {
    if (edge.isCandidate || !edge.targetId) {
      // Add a warning insight for candidate relationships
      if (!updatedPolicy.aiInsights) updatedPolicy.aiInsights = []
      updatedPolicy.aiInsights.push(
        `⚠️ Unresolved relationship: ${edge.sourceId} affects ${
          edge.targetId ?? 'unknown'
        } (${edge.relationshipType}). Please review.`
      )
      continue
    }

    // Apply specific relationship updates
    switch (edge.relationshipType) {
      case 'endorsement_override':
        applyEndorsementOverride(updatedPolicy, edge)
        break
      case 'carve_out':
        applyCarveOut(updatedPolicy, edge)
        break
      case 'sublimit':
        // A sublimit relates to another coverage. We might just note it in description for now.
        annotateTargetCoverage(
          updatedPolicy,
          edge.targetId,
          `Includes sublimit from ${edge.sourceId}: ${edge.description || 'See details'}`
        )
        break
      case 'deductible_trigger':
        annotateTargetCoverage(
          updatedPolicy,
          edge.targetId,
          `Has deductible trigger from ${edge.sourceId}: ${edge.description || 'See details'}`
        )
        break
      case 'conditional_restriction':
        annotateTargetCoverage(
          updatedPolicy,
          edge.targetId,
          `Conditional restriction applied: ${edge.description || edge.sourceId}`
        )
        break
      // Others like coverage_inclusion, service_benefit_linkage can be logged or treated lightly
      default:
        break
    }
  }

  // Attach the final graph to the policy if we extend the type in the future
  // For now, it lives in the ether or database mappings but we applied the effects.
  return updatedPolicy
}

/**
 * Defines precedence rules for resolving conflicts.
 * Higher weight = higher precedence.
 */
function getPrecedenceWeight(type: string): number {
  switch (type) {
    case 'endorsement_override':
      return 100 // Endorsements override everything
    case 'carve_out':
      return 80 // Carve-outs override general inclusions
    case 'sublimit':
      return 60 // Sublimits override general limits
    case 'conditional_restriction':
      return 40 // Restrictions limit scope
    case 'deductible_trigger':
      return 30
    case 'coverage_inclusion':
      return 20
    case 'service_benefit_linkage':
      return 10
    default:
      return 0
  }
}

function applyEndorsementOverride(policy: AnalyzedPolicy, edge: ClauseRelationship) {
  const target = policy.coverages.find((c) => c.name.toLowerCase() === edge.targetId?.toLowerCase())
  if (target) {
    target.description = `[Endorsement Override: ${edge.sourceId}] ${target.description || ''} ${edge.description || ''}`
  } else {
    // If it overrides something general, add it to special conditions
    policy.specialConditions = policy.specialConditions || []
    policy.specialConditions.push(
      `[Endorsement Override: ${edge.sourceId} on ${edge.targetId}] ${edge.description || ''}`
    )
  }
}

function applyCarveOut(policy: AnalyzedPolicy, edge: ClauseRelationship) {
  const target = policy.coverages.find((c) => c.name.toLowerCase() === edge.targetId?.toLowerCase())
  if (target) {
    target.description = `[Carve-out: ${edge.sourceId}] ${target.description || ''} ${edge.description || ''}`
  }
}

function annotateTargetCoverage(policy: AnalyzedPolicy, targetId: string, annotation: string) {
  const target = policy.coverages.find((c) => c.name.toLowerCase() === targetId.toLowerCase())
  if (target) {
    target.description = target.description ? `${target.description} | ${annotation}` : annotation
  } else {
    // Target might not be a coverage, maybe an exclusion or insight. Adding to special condition.
    policy.specialConditions = policy.specialConditions || []
    policy.specialConditions.push(`[${targetId}] ${annotation}`)
  }
}
