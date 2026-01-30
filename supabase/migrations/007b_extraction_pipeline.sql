-- Migration 007: Extraction Pipeline Tables
-- Purpose: Add tables for 3-step extraction pipeline with evidence tracking,
-- contradiction detection, QA scoring, and benchmark packs

-- ============================================================================
-- DOCUMENTS TABLE
-- Stores raw and normalized document text with metadata
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,

  -- Source information
  file_name TEXT NOT NULL,
  file_hash TEXT,  -- SHA-256 for deduplication
  file_size_bytes INTEGER,
  page_count INTEGER,

  -- Text content
  raw_text TEXT NOT NULL,  -- Original extracted text (never modified)
  normalized_text TEXT,     -- Processed text with section markers

  -- Normalization metadata
  normalization_warnings JSONB DEFAULT '[]'::jsonb,
  section_markers JSONB DEFAULT '[]'::jsonb,  -- [{section, startLine, endLine, pageNumber}]

  -- Processing status
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'normalized', 'extracted', 'analyzed', 'failed')),
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- EXTRACTION RUNS TABLE
-- Stores each extraction attempt with full audit trail
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.extraction_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE NOT NULL,

  -- Extraction configuration
  policy_type TEXT NOT NULL CHECK (policy_type IN ('kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business', 'nakliyat', 'unknown')),
  prompt_version TEXT NOT NULL,  -- e.g., "kasko-extract-v2.1"
  model TEXT NOT NULL,           -- e.g., "gpt-4o", "claude-3-5-sonnet"
  provider TEXT NOT NULL,        -- 'openai' or 'anthropic'

  -- Extraction results
  extraction_json JSONB NOT NULL,  -- Full extracted policy data
  evidence_map JSONB DEFAULT '{}'::jsonb,  -- {fieldPath: {quote, location, pageNumber}}

  -- Quality Assessment
  score_json JSONB DEFAULT '{}'::jsonb,  -- {score, failedGates[], passedGates[], details}
  contradictions_json JSONB DEFAULT '[]'::jsonb,  -- [{fieldPath, extractedValue, detectedValue, evidenceQuote, severity}]

  -- Errors and warnings
  errors JSONB DEFAULT '[]'::jsonb,  -- [{type, field, message, severity}]
  warnings JSONB DEFAULT '[]'::jsonb,

  -- Data requests (missing items)
  data_requests JSONB DEFAULT '[]'::jsonb,  -- [{type, description, priority, affectedFields}]

  -- Processing metadata
  processing_time_ms INTEGER,
  token_usage JSONB,  -- {input_tokens, output_tokens, cost_estimate}

  -- Status
  is_latest BOOLEAN DEFAULT true,  -- Only one "latest" per document

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- ANALYSIS RUNS TABLE
-- Stores gap analysis with benchmark citations
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.analysis_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  extraction_run_id UUID REFERENCES public.extraction_runs(id) ON DELETE CASCADE NOT NULL,

  -- Analysis configuration
  benchmark_pack_id UUID,  -- References benchmark_packs if used
  prompt_version TEXT NOT NULL,
  model TEXT NOT NULL,
  provider TEXT NOT NULL,

  -- Analysis results
  gap_register JSONB DEFAULT '[]'::jsonb,  -- [{id, type, description, severity, evidenceQuote, benchmarkRef}]
  negotiation_points JSONB DEFAULT '[]'::jsonb,  -- [{point, rationale, priority, evidenceQuote}]
  draft_endorsements JSONB DEFAULT '[]'::jsonb,  -- [{title, content, reason}]

  -- Citations and evidence
  benchmark_citations JSONB DEFAULT '[]'::jsonb,  -- [{entryId, packId, title, usedFor}]
  evidence_citations JSONB DEFAULT '[]'::jsonb,   -- [{fieldPath, quote, analysisPoint}]

  -- Summary
  summary JSONB DEFAULT '{}'::jsonb,  -- {totalGaps, criticalGaps, estimatedExposure, topRecommendation}

  -- Processing metadata
  processing_time_ms INTEGER,
  token_usage JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- BENCHMARK PACKS TABLE
-- Versioned, curated benchmark data per policy type
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.benchmark_packs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Pack identification
  policy_type TEXT NOT NULL CHECK (policy_type IN ('kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business', 'nakliyat')),
  version TEXT NOT NULL,  -- e.g., "2026-01"
  name TEXT NOT NULL,     -- e.g., "Kasko Benchmark Pack Q1 2026"
  description TEXT,

  -- Pack content
  entries JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- entries[]: {
  --   entryId: string,
  --   title: string,
  --   text: string,
  --   sourceType: 'SEDDK' | 'GenelSart' | 'MarketPractice' | 'Regulation',
  --   dateEffective: string,
  --   category: 'coverage_limit' | 'deductible' | 'exclusion' | 'premium' | 'general',
  --   tags: string[]
  -- }

  -- Metadata
  entry_count INTEGER DEFAULT 0,
  source_documents JSONB DEFAULT '[]'::jsonb,  -- [{name, url, date}]

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,  -- Default pack for this policy type

  -- Timestamps
  effective_date DATE,
  expires_date DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one default per policy type
  CONSTRAINT unique_default_per_type UNIQUE (policy_type, is_default)
    DEFERRABLE INITIALLY DEFERRED
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Documents indexes
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON public.documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_status ON public.documents(status);
CREATE INDEX IF NOT EXISTS idx_documents_file_hash ON public.documents(file_hash);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON public.documents(created_at DESC);

-- Extraction runs indexes
CREATE INDEX IF NOT EXISTS idx_extraction_runs_document_id ON public.extraction_runs(document_id);
CREATE INDEX IF NOT EXISTS idx_extraction_runs_policy_type ON public.extraction_runs(policy_type);
CREATE INDEX IF NOT EXISTS idx_extraction_runs_is_latest ON public.extraction_runs(document_id, is_latest) WHERE is_latest = true;
CREATE INDEX IF NOT EXISTS idx_extraction_runs_created_at ON public.extraction_runs(created_at DESC);

-- Analysis runs indexes
CREATE INDEX IF NOT EXISTS idx_analysis_runs_extraction_id ON public.analysis_runs(extraction_run_id);
CREATE INDEX IF NOT EXISTS idx_analysis_runs_benchmark_pack ON public.analysis_runs(benchmark_pack_id);

-- Benchmark packs indexes
CREATE INDEX IF NOT EXISTS idx_benchmark_packs_policy_type ON public.benchmark_packs(policy_type);
CREATE INDEX IF NOT EXISTS idx_benchmark_packs_active ON public.benchmark_packs(policy_type, is_active) WHERE is_active = true;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Update timestamps trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to documents
DROP TRIGGER IF EXISTS update_documents_updated_at ON public.documents;
CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Apply to benchmark_packs
DROP TRIGGER IF EXISTS update_benchmark_packs_updated_at ON public.benchmark_packs;
CREATE TRIGGER update_benchmark_packs_updated_at
  BEFORE UPDATE ON public.benchmark_packs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to mark previous runs as not latest
CREATE OR REPLACE FUNCTION mark_previous_runs_not_latest()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_latest = true THEN
    UPDATE public.extraction_runs
    SET is_latest = false
    WHERE document_id = NEW.document_id
      AND id != NEW.id
      AND is_latest = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS extraction_runs_latest_trigger ON public.extraction_runs;
CREATE TRIGGER extraction_runs_latest_trigger
  BEFORE INSERT OR UPDATE ON public.extraction_runs
  FOR EACH ROW EXECUTE FUNCTION mark_previous_runs_not_latest();

-- Update entry_count on benchmark_packs
CREATE OR REPLACE FUNCTION update_benchmark_entry_count()
RETURNS TRIGGER AS $$
BEGIN
  NEW.entry_count = jsonb_array_length(COALESCE(NEW.entries, '[]'::jsonb));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS benchmark_packs_entry_count_trigger ON public.benchmark_packs;
CREATE TRIGGER benchmark_packs_entry_count_trigger
  BEFORE INSERT OR UPDATE ON public.benchmark_packs
  FOR EACH ROW EXECUTE FUNCTION update_benchmark_entry_count();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.extraction_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analysis_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_packs ENABLE ROW LEVEL SECURITY;

-- Documents: Users can only access their own documents
CREATE POLICY "Users can view their own documents"
  ON public.documents FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own documents"
  ON public.documents FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own documents"
  ON public.documents FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own documents"
  ON public.documents FOR DELETE
  USING (auth.uid() = user_id);

-- Extraction runs: Access through document ownership
CREATE POLICY "Users can view extraction runs for their documents"
  ON public.extraction_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_id AND d.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert extraction runs for their documents"
  ON public.extraction_runs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.id = document_id AND d.user_id = auth.uid()
    )
  );

-- Analysis runs: Access through extraction run -> document ownership
CREATE POLICY "Users can view analysis runs for their extractions"
  ON public.analysis_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.extraction_runs er
      JOIN public.documents d ON d.id = er.document_id
      WHERE er.id = extraction_run_id AND d.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert analysis runs for their extractions"
  ON public.analysis_runs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.extraction_runs er
      JOIN public.documents d ON d.id = er.document_id
      WHERE er.id = extraction_run_id AND d.user_id = auth.uid()
    )
  );

-- Benchmark packs: Read-only for all authenticated users
CREATE POLICY "Authenticated users can view active benchmark packs"
  ON public.benchmark_packs FOR SELECT
  USING (auth.role() = 'authenticated' AND is_active = true);

-- Service role has full access (for admin operations)
CREATE POLICY "Service role has full access to documents"
  ON public.documents FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role has full access to extraction_runs"
  ON public.extraction_runs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role has full access to analysis_runs"
  ON public.analysis_runs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role has full access to benchmark_packs"
  ON public.benchmark_packs FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.documents IS 'Stores raw and normalized document text for the extraction pipeline';
COMMENT ON TABLE public.extraction_runs IS 'Audit trail of extraction attempts with evidence tracking';
COMMENT ON TABLE public.analysis_runs IS 'Gap analysis results with benchmark citations';
COMMENT ON TABLE public.benchmark_packs IS 'Versioned curated benchmark data per policy type';

COMMENT ON COLUMN public.extraction_runs.evidence_map IS 'Maps field paths to source quotes and locations: {fieldPath: {quote, location, pageNumber}}';
COMMENT ON COLUMN public.extraction_runs.contradictions_json IS 'Detected mismatches between extraction and source: [{fieldPath, extractedValue, detectedValue, evidenceQuote, severity}]';
COMMENT ON COLUMN public.extraction_runs.data_requests IS 'Missing items checklist: [{type, description, priority, affectedFields}]';
COMMENT ON COLUMN public.benchmark_packs.entries IS 'Curated benchmark entries: [{entryId, title, text, sourceType, dateEffective, category, tags}]';
