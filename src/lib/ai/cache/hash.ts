/**
 * Content hashing utilities for cache keys
 * Uses Web Crypto API for fast, consistent hashing
 */

/**
 * Generate a SHA-256 hash of the input content
 * Returns a hex string suitable for cache keys
 */
export async function hashContent(content: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(content)

  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

  return hashHex
}

/**
 * Generate a hash from a File or Blob
 * Useful for OCR caching where the input is binary
 */
export async function hashFile(file: File | Blob): Promise<string> {
  const arrayBuffer = await file.arrayBuffer()
  const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

  return hashHex
}

/**
 * Generate a composite cache key from multiple inputs
 */
export async function generateCacheKey(
  type: string,
  ...inputs: (string | number | boolean | undefined | null)[]
): Promise<string> {
  const normalizedInputs = inputs
    .filter(i => i !== undefined && i !== null)
    .map(i => String(i))
    .join('|')

  const hash = await hashContent(`${type}:${normalizedInputs}`)

  // Return first 16 chars of hash (64 bits) - sufficient for uniqueness
  return `${type}_${hash.slice(0, 16)}`
}

/**
 * Synchronous hash for small strings (using simple djb2)
 * Use for quick operations where async is not practical
 */
export function quickHash(str: string): string {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

/**
 * Estimate the byte size of a JavaScript value
 */
export function estimateSize(value: unknown): number {
  const str = JSON.stringify(value)
  // Account for UTF-8 encoding
  return new Blob([str]).size
}
