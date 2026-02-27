/**
 * Seeded Pseudo-Random Number Generator
 *
 * Uses the Mulberry32 algorithm for deterministic random number
 * generation. This ensures Monte Carlo simulations produce
 * identical results when given the same seed — critical for
 * golden regression tests and reproducibility.
 *
 * Mulberry32: fast, well-distributed, 32-bit state, period 2^32.
 */

// ─────────────────────────────────────────────────────────────────────────────
// MULBERRY32 PRNG
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a seeded random number generator using Mulberry32.
 *
 * @param seed - Integer seed value (will be truncated to 32-bit)
 * @returns Function that produces uniform random numbers in [0, 1)
 *
 * @example
 * ```ts
 * const rng = createSeededRNG(42)
 * const r1 = rng() // Always the same value for seed 42
 * const r2 = rng() // Next value in sequence
 * ```
 */
export function createSeededRNG(seed: number): () => number {
  let state = seed | 0 // Truncate to 32-bit integer

  return function mulberry32(): number {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// UTILITY FUNCTIONS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generates a uniform random number in [min, max).
 */
export function sampleUniform(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min)
}

/**
 * Generates a Bernoulli trial (true with probability p).
 */
export function bernoulli(rng: () => number, p: number): boolean {
  return rng() < p
}

/**
 * Shuffles an array in-place using Fisher-Yates algorithm.
 */
export function shuffle<T>(rng: () => number, array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const temp = array[i]
    array[i] = array[j]
    array[j] = temp
  }
  return array
}
