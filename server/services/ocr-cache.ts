/**
 * OCR CR result cache.
 *
 * OCR s deterministic on identical input — the same base64 PDF chunk
 * produces the same OCR text every call. Caching by SHA256 of the chunk
 * eliminates redundant OCR illing for repeated CI runs (smoke,
 * stability) on the same fixtures and shields against per-day quotas on
 * Google's OCR ree tier.
 *
 * Storage: `ocr_cache` table (migration 061), service-role-only RLS.
 * Key: SHA256 hex of the base64 documentBase64 string.
 * Value: extracted OCR text + a few metadata fields.
 */

import crypto from 'node:crypto'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { logger } from '../lib/logger.js'
import { pgErr } from '../lib/pg-err.js'

const log = logger.child('OcrCache')

let supabase: SupabaseClient | null = null

function getSupabase(): SupabaseClient | null {
  if (supabase && process.env.NODE_ENV !== 'test') return supabase

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) return null

  supabase = createClient(url, key)
  return supabase
}

/**
 * Compute the SHA256 hex of a base64 string. Used as the cache key.
 * Hashing the base64 (not the decoded bytes) is intentional — keeps the cache
 * key generation cheap and matches the route handler's natural input shape.
 */
export function hashOcrInput(documentBase64: string): string {
  return crypto.createHash('sha256').update(documentBase64).digest('hex')
}

export interface CachedOcrResult {
  text: string
  pageCount: number | null
  confidence: number | null
}

/**
 * Look up a cached OCR result. Returns null on miss, on database error, or
 * when Supabase is not configured. The caller falls through to the live
 * OCR all in any of those cases — cache lookup must never block
 * the OCR pipeline.
 *
 * Side effect on hit: increments hit_count and bumps last_hit_at. The update
 * is fire-and-forget — failure to update the bookkeeping does not invalidate
 * the cached value we already have in hand.
 */
export async function lookupOcrCache(sha256: string): Promise<CachedOcrResult | null> {
  const client = getSupabase()
  if (!client) return null

  const { data, error } = await client
    .from('ocr_cache')
    .select('text, page_count, confidence')
    .eq('sha256', sha256)
    .maybeSingle()

  if (error) {
    log.warn('Lookup failed — falling through to live OCR', pgErr(error))
    return null
  }
  if (!data) return null

  // Bookkeeping bump (last_hit_at). Fire-and-forget — failure to update the
  // bookkeeping does not invalidate the cache value we already have.
  client
    .from('ocr_cache')
    .update({ last_hit_at: new Date().toISOString() })
    .eq('sha256', sha256)
    .then(({ error: updErr }) => {
      if (updErr) log.warn('Hit-count bump failed', pgErr(updErr))
    })

  return {
    text: data.text as string,
    pageCount: (data.page_count as number) ?? null,
    confidence: (data.confidence as number) ?? null,
  }
}

/**
 * Store an OCR result in the cache. ON CONFLICT DO NOTHING semantics — if
 * two concurrent OCR requests for the same SHA fire at once, the second
 * INSERT silently no-ops instead of erroring.
 *
 * Fire-and-forget on the caller side: a store failure does not invalidate
 * the live OCR result we already have to return to the user.
 */
export async function storeOcrCache(
  sha256: string,
  text: string,
  pageCount: number | null,
  confidence: number | null,
  mimeType: string | undefined,
  languageHints: unknown
): Promise<void> {
  const client = getSupabase()
  if (!client) return

  const { error } = await client.from('ocr_cache').upsert(
    {
      sha256,
      text,
      page_count: pageCount,
      confidence,
      mime_type: mimeType ?? null,
      language_hints: languageHints ?? null,
      byte_length: Buffer.byteLength(text, 'utf8'),
    },
    { onConflict: 'sha256', ignoreDuplicates: true }
  )

  if (error) {
    log.warn('Store failed — cache miss next time', pgErr(error))
  }
}
