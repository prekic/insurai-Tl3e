-- Migration 061: Document AI OCR cache table (cost-control May 3, 2026)
--
-- Same OCR text is paid for repeatedly: smoke-kasko CI fires on every push to
-- main and re-OCRs all 4 fixtures (~$0.06/run); local stability runs and ad-hoc
-- audits re-OCR the same Tiguan/Golf chunks. PDF bytes → OCR text is a pure
-- function (Document AI is deterministic on identical input), so we can cache
-- by SHA256 of the base64 chunk payload.
--
-- Single-table KV store, no TTL in v1. Manual purge if rows ever get stale.

CREATE TABLE IF NOT EXISTS public.ocr_cache (
  sha256          TEXT PRIMARY KEY,
  text            TEXT NOT NULL,
  page_count      INTEGER,
  confidence      REAL,
  mime_type       TEXT,
  language_hints  JSONB,
  byte_length     INTEGER,
  hit_count       INTEGER DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  last_hit_at     TIMESTAMPTZ
);
-- Note: formFields[] and tables[] from the live Document AI response are NOT
-- cached. On cache hit, the route returns formFields: undefined, tables:
-- undefined. Smoke / stability / standard production callers consume only
-- `text` and `pageCount`; the structured fields are admin-debug tooling.

-- Service-role-only RLS — same pattern as migration 041 admin/system tables.
-- The Express server uses SUPABASE_SERVICE_ROLE_KEY; PostgREST anon/authenticated
-- callers are blocked.
ALTER TABLE public.ocr_cache ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  DROP POLICY IF EXISTS ocr_cache_service_role ON public.ocr_cache;
  CREATE POLICY ocr_cache_service_role ON public.ocr_cache
    FOR ALL USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
END $$;

-- Index for occasional eviction queries (oldest-first / coldest-first).
CREATE INDEX IF NOT EXISTS idx_ocr_cache_created_at ON public.ocr_cache(created_at);
CREATE INDEX IF NOT EXISTS idx_ocr_cache_last_hit_at ON public.ocr_cache(last_hit_at);

COMMENT ON TABLE public.ocr_cache IS
  'Document AI OCR result cache keyed by SHA256 of the base64 PDF chunk. Service-role-only.';
COMMENT ON COLUMN public.ocr_cache.hit_count IS
  'Incremented on every cache hit. Useful for evicting cold rows.';

-- Verification:
--   SELECT count(*) FROM public.ocr_cache;
--   SELECT sha256, byte_length, hit_count, created_at, last_hit_at FROM public.ocr_cache ORDER BY created_at DESC LIMIT 10;
--
-- Rollback (rare):
--   DROP TABLE IF EXISTS public.ocr_cache;
