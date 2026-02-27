/**
 * Loss Distribution Sampling Functions
 *
 * Implements statistical loss distributions used in actuarial modeling:
 * - Lognormal: Most common for partial losses (collision, theft, fire)
 * - Pareto: Catastrophic tail risks (earthquake, flood)
 * - Uniform: Simple range-based losses (glass, minor damage)
 *
 * All functions accept a seeded RNG for deterministic simulation.
 */

import type { LossDistributionParams } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// LOGNORMAL DISTRIBUTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Samples from a lognormal distribution using the Box-Muller transform.
 *
 * The lognormal is the standard actuarial distribution for most
 * insurance losses — the log of the loss is normally distributed.
 *
 * @param rng - Seeded PRNG producing uniform [0, 1)
 * @param mu - Mean of the underlying normal distribution (log-scale)
 * @param sigma - Std deviation of the underlying normal (log-scale)
 * @returns Sampled loss amount (always positive)
 *
 * @example
 * ```ts
 * // Partial collision: ~₺15K average
 * sampleLognormal(rng, 9.2, 0.8)
 *
 * // Total loss: ~₺120K average
 * sampleLognormal(rng, 11.5, 0.6)
 * ```
 */
export function sampleLognormal(rng: () => number, mu: number, sigma: number): number {
  // Box-Muller transform: two uniform → one standard normal
  let u1 = rng()
  // Avoid log(0)
  while (u1 === 0) u1 = rng()
  const u2 = rng()

  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2)

  // Transform standard normal → lognormal
  return Math.exp(mu + sigma * z)
}

/**
 * Returns the expected value (mean) of a lognormal distribution.
 * E[X] = exp(μ + σ²/2)
 */
export function lognormalMean(mu: number, sigma: number): number {
  return Math.exp(mu + (sigma * sigma) / 2)
}

/**
 * Returns the variance of a lognormal distribution.
 * Var[X] = (exp(σ²) - 1) * exp(2μ + σ²)
 */
export function lognormalVariance(mu: number, sigma: number): number {
  const s2 = sigma * sigma
  return (Math.exp(s2) - 1) * Math.exp(2 * mu + s2)
}

// ─────────────────────────────────────────────────────────────────────────────
// PARETO DISTRIBUTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Samples from a Pareto distribution using inverse CDF.
 *
 * The Pareto distribution models catastrophic losses with heavy
 * tails — appropriate for earthquake, major flood, etc. where
 * small number of events cause outsized losses.
 *
 * CDF: F(x) = 1 - (xMin/x)^alpha for x >= xMin
 * Inverse CDF: x = xMin / (1 - U)^(1/alpha)
 *
 * @param rng - Seeded PRNG
 * @param alpha - Shape parameter (higher = lighter tail, typically 2-4)
 * @param xMin - Scale parameter (minimum possible loss)
 * @returns Sampled loss amount (>= xMin)
 */
export function samplePareto(rng: () => number, alpha: number, xMin: number): number {
  let u = rng()
  // Avoid division by zero
  while (u === 0) u = rng()

  return xMin / Math.pow(u, 1 / alpha)
}

/**
 * Returns the expected value of a Pareto distribution.
 * E[X] = alpha * xMin / (alpha - 1) for alpha > 1
 * Returns Infinity for alpha <= 1.
 */
export function paretoMean(alpha: number, xMin: number): number {
  if (alpha <= 1) return Infinity
  return (alpha * xMin) / (alpha - 1)
}

// ─────────────────────────────────────────────────────────────────────────────
// UNIFORM DISTRIBUTION
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Samples from a uniform distribution on [min, max).
 *
 * Used for simple loss scenarios where any value in a range
 * is equally likely (e.g., glass damage, minor repairs).
 */
export function sampleUniformLoss(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min)
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC SAMPLER
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Samples a loss amount from a distribution specified by params.
 * This is the main entry point used by the Monte Carlo engine.
 *
 * @param rng - Seeded PRNG
 * @param params - Distribution parameters (type discriminated)
 * @returns Sampled loss amount (non-negative)
 */
export function sampleLoss(rng: () => number, params: LossDistributionParams): number {
  switch (params.type) {
    case 'lognormal':
      return sampleLognormal(rng, params.mu, params.sigma)

    case 'pareto':
      return samplePareto(rng, params.alpha, params.xMin)

    case 'uniform':
      return sampleUniformLoss(rng, params.min, params.max)

    default: {
      // Exhaustive check
      const _exhaustive: never = params
      throw new Error(`Unknown distribution type: ${(_exhaustive as LossDistributionParams).type}`)
    }
  }
}

/**
 * Returns the theoretical expected loss for a distribution.
 * Used for validation and scenario breakdown reporting.
 */
export function expectedLoss(params: LossDistributionParams): number {
  switch (params.type) {
    case 'lognormal':
      return lognormalMean(params.mu, params.sigma)

    case 'pareto':
      return paretoMean(params.alpha, params.xMin)

    case 'uniform':
      return (params.min + params.max) / 2

    default: {
      const _exhaustive: never = params
      throw new Error(`Unknown distribution type: ${(_exhaustive as LossDistributionParams).type}`)
    }
  }
}
