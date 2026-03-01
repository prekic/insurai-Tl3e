/**
 * Web Worker for Actuarial Engine Monte Carlo Simulations
 *
 * Offloads long-running simulations to a background thread to prevent
 * UI jank during complex policy evaluations.
 */

import { calculateEOOP } from './layer-c/monte-carlo'
import type {
  ActuarialPolicyInput,
  RiskScenario,
  MonteCarloConfig,
  SemanticExclusionImpact,
  EOOPResult,
} from './types'

export interface ActuarialWorkerMessage {
  policy: ActuarialPolicyInput
  scenarios: RiskScenario[]
  config?: Partial<MonteCarloConfig>
  semanticExclusions?: SemanticExclusionImpact[]
}

export interface ActuarialWorkerResponse {
  result: EOOPResult
  error?: string
}

self.onmessage = (event: MessageEvent<ActuarialWorkerMessage>) => {
  try {
    const { policy, scenarios, config, semanticExclusions } = event.data
    const result = calculateEOOP(policy, scenarios, config, semanticExclusions)
    self.postMessage({ result } as ActuarialWorkerResponse)
  } catch (err: any) {
    self.postMessage({ error: err.message } as ActuarialWorkerResponse)
  }
}
