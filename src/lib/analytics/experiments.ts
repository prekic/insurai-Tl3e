/**
 * A/B Testing Framework
 * Experiment management and variant assignment
 */

import type {
  Experiment,
  ExperimentVariant,
  ExperimentAssignment,
  ExperimentResults,
  ExperimentStatus,
} from '@/types/analytics'
import { analytics } from './tracker'

// =============================================================================
// Storage
// =============================================================================

const EXPERIMENTS_KEY = 'insurai_experiments'
const ASSIGNMENTS_KEY = 'insurai_experiment_assignments'

/**
 * Generate unique ID
 */
function generateId(): string {
  return `exp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/**
 * Hash function for consistent assignment
 */
function hashString(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash)
}

// =============================================================================
// Experiment Manager Class
// =============================================================================

class ExperimentManager {
  private experiments: Map<string, Experiment> = new Map()
  private assignments: Map<string, ExperimentAssignment> = new Map()
  private initialized: boolean = false

  /**
   * Initialize the experiment manager
   */
  initialize(): void {
    if (this.initialized) return

    this.loadFromStorage()
    this.initialized = true
  }

  private loadFromStorage(): void {
    if (typeof localStorage === 'undefined') return

    try {
      // Load experiments
      const expStored = localStorage.getItem(EXPERIMENTS_KEY)
      if (expStored) {
        const exps = JSON.parse(expStored) as Experiment[]
        for (const exp of exps) {
          this.experiments.set(exp.id, exp)
        }
      }

      // Load assignments
      const assignStored = localStorage.getItem(ASSIGNMENTS_KEY)
      if (assignStored) {
        const assigns = JSON.parse(assignStored) as ExperimentAssignment[]
        for (const assign of assigns) {
          const key = `${assign.experimentId}_${assign.sessionId}`
          this.assignments.set(key, assign)
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  private saveToStorage(): void {
    if (typeof localStorage === 'undefined') return

    try {
      localStorage.setItem(
        EXPERIMENTS_KEY,
        JSON.stringify(Array.from(this.experiments.values()))
      )
      localStorage.setItem(
        ASSIGNMENTS_KEY,
        JSON.stringify(Array.from(this.assignments.values()))
      )
    } catch {
      // Storage full or unavailable
    }
  }

  /**
   * Create a new experiment
   */
  createExperiment(params: {
    name: string
    description?: string
    variants: Omit<ExperimentVariant, 'id'>[]
    targetAudience?: Experiment['targetAudience']
    metrics?: string[]
  }): Experiment {
    this.initialize()

    const experiment: Experiment = {
      id: generateId(),
      name: params.name,
      description: params.description,
      status: 'draft',
      variants: params.variants.map((v, i) => ({
        ...v,
        id: `var_${i}_${Math.random().toString(36).slice(2, 7)}`,
      })),
      targetAudience: params.targetAudience,
      metrics: params.metrics ?? [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }

    this.experiments.set(experiment.id, experiment)
    this.saveToStorage()

    return experiment
  }

  /**
   * Start an experiment
   */
  startExperiment(experimentId: string): Experiment | null {
    const experiment = this.experiments.get(experimentId)
    if (!experiment) return null

    experiment.status = 'running'
    experiment.startDate = Date.now()
    experiment.updatedAt = Date.now()

    this.experiments.set(experimentId, experiment)
    this.saveToStorage()

    return experiment
  }

  /**
   * Stop an experiment
   */
  stopExperiment(experimentId: string): Experiment | null {
    const experiment = this.experiments.get(experimentId)
    if (!experiment) return null

    experiment.status = 'completed'
    experiment.endDate = Date.now()
    experiment.updatedAt = Date.now()

    this.experiments.set(experimentId, experiment)
    this.saveToStorage()

    return experiment
  }

  /**
   * Update experiment status
   */
  updateExperimentStatus(experimentId: string, status: ExperimentStatus): Experiment | null {
    const experiment = this.experiments.get(experimentId)
    if (!experiment) return null

    experiment.status = status
    experiment.updatedAt = Date.now()

    if (status === 'running' && !experiment.startDate) {
      experiment.startDate = Date.now()
    }
    if (status === 'completed' && !experiment.endDate) {
      experiment.endDate = Date.now()
    }

    this.experiments.set(experimentId, experiment)
    this.saveToStorage()

    return experiment
  }

  /**
   * Get experiment by ID
   */
  getExperiment(experimentId: string): Experiment | null {
    this.initialize()
    return this.experiments.get(experimentId) ?? null
  }

  /**
   * Get all experiments
   */
  getAllExperiments(): Experiment[] {
    this.initialize()
    return Array.from(this.experiments.values())
  }

  /**
   * Get running experiments
   */
  getRunningExperiments(): Experiment[] {
    return this.getAllExperiments().filter(e => e.status === 'running')
  }

  /**
   * Get variant for a user/session
   */
  getVariant(experimentId: string, sessionId: string, userId?: string): ExperimentVariant | null {
    this.initialize()

    const experiment = this.experiments.get(experimentId)
    if (!experiment || experiment.status !== 'running') {
      return null
    }

    // Check for existing assignment
    const assignmentKey = `${experimentId}_${sessionId}`
    const existing = this.assignments.get(assignmentKey)
    if (existing) {
      return experiment.variants.find(v => v.id === existing.variantId) ?? null
    }

    // Check target audience
    if (experiment.targetAudience) {
      const hash = hashString(`${experimentId}_${sessionId}`)
      const percentage = (hash % 100) + 1
      if (percentage > experiment.targetAudience.percentage) {
        return null // Not in target audience
      }
    }

    // Assign variant based on weights
    const variant = this.assignVariant(experiment, sessionId)
    if (!variant) return null

    // Store assignment
    const assignment: ExperimentAssignment = {
      experimentId,
      variantId: variant.id,
      assignedAt: Date.now(),
      userId,
      sessionId,
    }

    this.assignments.set(assignmentKey, assignment)
    this.saveToStorage()

    // Track assignment
    analytics.track({
      category: 'experiment',
      action: 'assignment',
      label: experiment.name,
      metadata: {
        experimentId,
        variantId: variant.id,
        variantName: variant.name,
      },
    })

    return variant
  }

  private assignVariant(experiment: Experiment, sessionId: string): ExperimentVariant | null {
    if (experiment.variants.length === 0) return null

    // Use consistent hashing for deterministic assignment
    const hash = hashString(`${experiment.id}_${sessionId}`)
    const totalWeight = experiment.variants.reduce((sum, v) => sum + v.weight, 0)
    const target = hash % totalWeight

    let cumulative = 0
    for (const variant of experiment.variants) {
      cumulative += variant.weight
      if (target < cumulative) {
        return variant
      }
    }

    return experiment.variants[0]
  }

  /**
   * Track conversion for an experiment
   */
  trackConversion(
    experimentId: string,
    sessionId: string,
    metricName: string,
    value: number = 1
  ): void {
    const assignmentKey = `${experimentId}_${sessionId}`
    const assignment = this.assignments.get(assignmentKey)
    if (!assignment) return

    const experiment = this.experiments.get(experimentId)
    if (!experiment) return

    analytics.track({
      category: 'experiment',
      action: 'conversion',
      label: metricName,
      value,
      metadata: {
        experimentId,
        experimentName: experiment.name,
        variantId: assignment.variantId,
        metricName,
      },
    })
  }

  /**
   * Get experiment results
   */
  async getResults(experimentId: string): Promise<ExperimentResults | null> {
    const experiment = this.experiments.get(experimentId)
    if (!experiment) return null

    // Get all assignments for this experiment
    const assignments = Array.from(this.assignments.values())
      .filter(a => a.experimentId === experimentId)

    // Group by variant
    const variantAssignments = new Map<string, ExperimentAssignment[]>()
    for (const assignment of assignments) {
      const existing = variantAssignments.get(assignment.variantId) ?? []
      existing.push(assignment)
      variantAssignments.set(assignment.variantId, existing)
    }

    const variantResults = experiment.variants.map(variant => ({
      variantId: variant.id,
      variantName: variant.name,
      participants: variantAssignments.get(variant.id)?.length ?? 0,
      metrics: {} as Record<string, { count: number; sum: number }>,
      conversionRate: 0,
    }))

    return {
      experimentId,
      startDate: experiment.startDate ?? experiment.createdAt,
      endDate: experiment.endDate,
      totalParticipants: assignments.length,
      variantResults: variantResults.map(vr => ({
        ...vr,
        metrics: {},
      })),
    }
  }

  /**
   * Delete an experiment
   */
  deleteExperiment(experimentId: string): boolean {
    const deleted = this.experiments.delete(experimentId)

    // Remove assignments
    for (const [key, assignment] of this.assignments) {
      if (assignment.experimentId === experimentId) {
        this.assignments.delete(key)
      }
    }

    this.saveToStorage()
    return deleted
  }

  /**
   * Clear all experiment data
   */
  clearAll(): void {
    this.experiments.clear()
    this.assignments.clear()

    try {
      localStorage.removeItem(EXPERIMENTS_KEY)
      localStorage.removeItem(ASSIGNMENTS_KEY)
    } catch {
      // Ignore
    }
  }
}

// =============================================================================
// Singleton Instance
// =============================================================================

export const experiments = new ExperimentManager()

// =============================================================================
// Convenience Functions
// =============================================================================

/**
 * Create a simple A/B test with two variants
 */
export function createABTest(
  name: string,
  options?: {
    description?: string
    controlWeight?: number
    treatmentWeight?: number
    metrics?: string[]
  }
): Experiment {
  return experiments.createExperiment({
    name,
    description: options?.description,
    variants: [
      { name: 'Control', weight: options?.controlWeight ?? 50 },
      { name: 'Treatment', weight: options?.treatmentWeight ?? 50 },
    ],
    metrics: options?.metrics,
  })
}

/**
 * Get variant for current session
 */
export function getVariant(experimentId: string): ExperimentVariant | null {
  const sessionId = sessionStorage.getItem('insurai_session')
  if (!sessionId) return null

  try {
    const session = JSON.parse(sessionId) as { id: string }
    return experiments.getVariant(experimentId, session.id)
  } catch {
    return null
  }
}

/**
 * Check if user is in treatment group
 */
export function isInTreatment(experimentId: string): boolean {
  const variant = getVariant(experimentId)
  return variant?.name === 'Treatment'
}

/**
 * Track experiment conversion
 */
export function trackConversion(
  experimentId: string,
  metricName: string = 'conversion',
  value: number = 1
): void {
  const sessionId = sessionStorage.getItem('insurai_session')
  if (!sessionId) return

  try {
    const session = JSON.parse(sessionId) as { id: string }
    experiments.trackConversion(experimentId, session.id, metricName, value)
  } catch {
    // Ignore
  }
}
