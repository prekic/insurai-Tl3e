-- ============================================================================
-- Migration: 009_ocr_analytics
-- Description: OCR Analytics tables for confidence scoring, pattern learning, and statistics
-- Date: 2026-01-22
-- ============================================================================

-- ============================================================================
-- OCR EXECUTIONS TABLE
-- Records individual OCR pipeline executions
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ocr_executions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Document and user context
  document_id TEXT NOT NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  policy_id UUID REFERENCES public.policies(id) ON DELETE SET NULL,

  -- Pipeline configuration
  pipeline_type TEXT NOT NULL CHECK (pipeline_type IN ('full', 'standard', 'quick')),

  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Status
  success BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,

  -- Size metrics
  input_size INTEGER NOT NULL,
  output_size INTEGER NOT NULL,
  reduction_percent NUMERIC(5,2),

  -- Chunk metrics
  total_chunks INTEGER NOT NULL DEFAULT 1,
  chunks_passed_qa INTEGER NOT NULL DEFAULT 0,
  chunks_retried INTEGER NOT NULL DEFAULT 0,
  chunks_failed INTEGER NOT NULL DEFAULT 0,

  -- Confidence scoring
  confidence_score NUMERIC(5,2) NOT NULL,
  confidence_grade CHAR(1) NOT NULL CHECK (confidence_grade IN ('A', 'B', 'C', 'D', 'F')),
  confidence_breakdown JSONB,

  -- Sanitizer statistics (stored as JSONB for flexibility)
  sanitizer_stats JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Pattern detection
  patterns_detected INTEGER NOT NULL DEFAULT 0,
  new_patterns_learned INTEGER NOT NULL DEFAULT 0,
  pattern_ids TEXT[], -- References to learned_patterns

  -- Full pipeline result (optional, for debugging)
  full_result JSONB,

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_ocr_executions_document_id ON public.ocr_executions(document_id);
CREATE INDEX IF NOT EXISTS idx_ocr_executions_user_id ON public.ocr_executions(user_id);
CREATE INDEX IF NOT EXISTS idx_ocr_executions_started_at ON public.ocr_executions(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ocr_executions_success ON public.ocr_executions(success);
CREATE INDEX IF NOT EXISTS idx_ocr_executions_confidence_grade ON public.ocr_executions(confidence_grade);
CREATE INDEX IF NOT EXISTS idx_ocr_executions_pipeline_type ON public.ocr_executions(pipeline_type);

-- ============================================================================
-- LEARNED PATTERNS TABLE
-- Stores garbage patterns discovered during OCR cleanup
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.learned_patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Pattern identification
  pattern_hash TEXT NOT NULL UNIQUE, -- Hash for deduplication
  pattern_text TEXT NOT NULL,
  pattern_regex TEXT, -- If pattern can be expressed as regex

  -- Classification
  pattern_type TEXT NOT NULL CHECK (pattern_type IN (
    'barcode', 'control_char', 'spaced_fragment', 'garbage_line',
    'high_ascii', 'special_cluster', 'repetitive', 'unknown'
  )),
  pattern_category TEXT NOT NULL CHECK (pattern_category IN (
    'scanner_artifact', 'ocr_error', 'encoding_issue',
    'document_noise', 'watermark', 'other'
  )),

  -- Description
  description TEXT,

  -- Statistics
  occurrence_count INTEGER NOT NULL DEFAULT 1,
  failure_count INTEGER NOT NULL DEFAULT 0,
  retry_success_count INTEGER NOT NULL DEFAULT 0,

  -- Confidence (0.0 - 1.0)
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.3,

  -- Examples (max 5)
  examples TEXT[] DEFAULT '{}',

  -- Source documents (max 10 document IDs)
  source_documents TEXT[] DEFAULT '{}',

  -- Promotion status
  promoted_to_rule BOOLEAN NOT NULL DEFAULT false,
  promoted_at TIMESTAMPTZ,
  rule_id TEXT, -- Reference to sanitizer rule if promoted

  -- Tags
  tags TEXT[] DEFAULT '{}',

  -- Timestamps
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_learned_patterns_pattern_type ON public.learned_patterns(pattern_type);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_pattern_category ON public.learned_patterns(pattern_category);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_confidence ON public.learned_patterns(confidence DESC);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_occurrence_count ON public.learned_patterns(occurrence_count DESC);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_failure_count ON public.learned_patterns(failure_count DESC);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_promoted ON public.learned_patterns(promoted_to_rule);
CREATE INDEX IF NOT EXISTS idx_learned_patterns_last_seen ON public.learned_patterns(last_seen DESC);

-- ============================================================================
-- OCR AGGREGATED STATISTICS TABLE
-- Pre-computed aggregates for dashboard performance
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ocr_statistics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Aggregation period
  period_type TEXT NOT NULL CHECK (period_type IN ('hour', 'day', 'week', 'month')),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,

  -- Execution counts
  total_executions INTEGER NOT NULL DEFAULT 0,
  successful_executions INTEGER NOT NULL DEFAULT 0,
  failed_executions INTEGER NOT NULL DEFAULT 0,

  -- Duration stats (ms)
  avg_duration INTEGER,
  min_duration INTEGER,
  max_duration INTEGER,

  -- Size stats
  total_chars_processed BIGINT NOT NULL DEFAULT 0,
  total_chars_output BIGINT NOT NULL DEFAULT 0,
  avg_reduction_percent NUMERIC(5,2),

  -- Confidence stats
  avg_confidence NUMERIC(5,2),
  min_confidence NUMERIC(5,2),
  max_confidence NUMERIC(5,2),
  grade_distribution JSONB DEFAULT '{"A":0,"B":0,"C":0,"D":0,"F":0}'::jsonb,

  -- QA stats
  total_chunks INTEGER NOT NULL DEFAULT 0,
  chunks_passed_first_try INTEGER NOT NULL DEFAULT 0,
  chunks_passed_after_retry INTEGER NOT NULL DEFAULT 0,
  chunks_failed INTEGER NOT NULL DEFAULT 0,

  -- Sanitizer stats (aggregated)
  total_lines_removed INTEGER NOT NULL DEFAULT 0,
  total_garbage_lines_removed INTEGER NOT NULL DEFAULT 0,
  total_fragments_merged INTEGER NOT NULL DEFAULT 0,
  total_control_chars_removed INTEGER NOT NULL DEFAULT 0,

  -- Pattern stats
  total_patterns_detected INTEGER NOT NULL DEFAULT 0,
  new_patterns_learned INTEGER NOT NULL DEFAULT 0,

  -- Pipeline type breakdown
  by_pipeline_type JSONB DEFAULT '{"full":0,"standard":0,"quick":0}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique constraint on period
CREATE UNIQUE INDEX IF NOT EXISTS idx_ocr_statistics_period
  ON public.ocr_statistics(period_type, period_start);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ocr_statistics_period_start ON public.ocr_statistics(period_start DESC);
CREATE INDEX IF NOT EXISTS idx_ocr_statistics_period_type ON public.ocr_statistics(period_type);

-- ============================================================================
-- QA GATE RESULTS TABLE
-- Detailed QA gate results per chunk (optional, for deep analysis)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ocr_qa_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Link to execution
  execution_id UUID NOT NULL REFERENCES public.ocr_executions(id) ON DELETE CASCADE,

  -- Chunk info
  chunk_index INTEGER NOT NULL,
  chunk_id TEXT NOT NULL,

  -- Gate results
  gate_id TEXT NOT NULL CHECK (gate_id IN (
    'no_artifacts', 'data_preserved', 'no_barcode_patterns',
    'no_spaced_fragments', 'no_control_chars', 'min_content_ratio',
    'reasonable_length'
  )),
  gate_passed BOOLEAN NOT NULL,
  gate_message TEXT,
  gate_details JSONB,

  -- Attempt tracking
  attempt_number INTEGER NOT NULL DEFAULT 1,
  is_retry BOOLEAN NOT NULL DEFAULT false,

  -- Timing
  processing_time_ms INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_ocr_qa_results_execution_id ON public.ocr_qa_results(execution_id);
CREATE INDEX IF NOT EXISTS idx_ocr_qa_results_gate_id ON public.ocr_qa_results(gate_id);
CREATE INDEX IF NOT EXISTS idx_ocr_qa_results_gate_passed ON public.ocr_qa_results(gate_passed);
CREATE INDEX IF NOT EXISTS idx_ocr_qa_results_chunk_index ON public.ocr_qa_results(chunk_index);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS
ALTER TABLE public.ocr_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.learned_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_statistics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ocr_qa_results ENABLE ROW LEVEL SECURITY;

-- Policies: Allow admins full access
-- Note: In production, create proper admin role checks

-- OCR Executions: Users can see their own executions
CREATE POLICY "Users can view their own OCR executions"
  ON public.ocr_executions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert OCR executions"
  ON public.ocr_executions
  FOR INSERT
  WITH CHECK (true);

-- Learned Patterns: Read-only for authenticated users
CREATE POLICY "Authenticated users can view learned patterns"
  ON public.learned_patterns
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can manage learned patterns"
  ON public.learned_patterns
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Statistics: Read-only for authenticated users
CREATE POLICY "Authenticated users can view OCR statistics"
  ON public.ocr_statistics
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "System can manage OCR statistics"
  ON public.ocr_statistics
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- QA Results: Users can see results for their executions
CREATE POLICY "Users can view QA results for their executions"
  ON public.ocr_qa_results
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.ocr_executions e
      WHERE e.id = execution_id AND e.user_id = auth.uid()
    )
  );

CREATE POLICY "System can insert QA results"
  ON public.ocr_qa_results
  FOR INSERT
  WITH CHECK (true);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to aggregate statistics for a period
CREATE OR REPLACE FUNCTION aggregate_ocr_statistics(
  p_period_type TEXT,
  p_period_start TIMESTAMPTZ,
  p_period_end TIMESTAMPTZ
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.ocr_statistics (
    period_type,
    period_start,
    period_end,
    total_executions,
    successful_executions,
    failed_executions,
    avg_duration,
    min_duration,
    max_duration,
    total_chars_processed,
    total_chars_output,
    avg_reduction_percent,
    avg_confidence,
    min_confidence,
    max_confidence,
    grade_distribution,
    total_chunks,
    chunks_passed_first_try,
    chunks_passed_after_retry,
    chunks_failed,
    total_lines_removed,
    total_garbage_lines_removed,
    total_fragments_merged,
    total_control_chars_removed,
    total_patterns_detected,
    new_patterns_learned,
    by_pipeline_type
  )
  SELECT
    p_period_type,
    p_period_start,
    p_period_end,
    COUNT(*),
    COUNT(*) FILTER (WHERE success = true),
    COUNT(*) FILTER (WHERE success = false),
    AVG(duration_ms)::INTEGER,
    MIN(duration_ms),
    MAX(duration_ms),
    SUM(input_size),
    SUM(output_size),
    AVG(reduction_percent),
    AVG(confidence_score),
    MIN(confidence_score),
    MAX(confidence_score),
    jsonb_build_object(
      'A', COUNT(*) FILTER (WHERE confidence_grade = 'A'),
      'B', COUNT(*) FILTER (WHERE confidence_grade = 'B'),
      'C', COUNT(*) FILTER (WHERE confidence_grade = 'C'),
      'D', COUNT(*) FILTER (WHERE confidence_grade = 'D'),
      'F', COUNT(*) FILTER (WHERE confidence_grade = 'F')
    ),
    SUM(total_chunks),
    SUM(chunks_passed_qa - chunks_retried),
    SUM(chunks_retried - chunks_failed),
    SUM(chunks_failed),
    SUM((sanitizer_stats->>'linesRemoved')::INTEGER),
    SUM((sanitizer_stats->>'garbageLinesRemoved')::INTEGER),
    SUM((sanitizer_stats->>'spacedFragmentsMerged')::INTEGER),
    SUM((sanitizer_stats->>'controlCharsRemoved')::INTEGER),
    SUM(patterns_detected),
    SUM(new_patterns_learned),
    jsonb_build_object(
      'full', COUNT(*) FILTER (WHERE pipeline_type = 'full'),
      'standard', COUNT(*) FILTER (WHERE pipeline_type = 'standard'),
      'quick', COUNT(*) FILTER (WHERE pipeline_type = 'quick')
    )
  FROM public.ocr_executions
  WHERE started_at >= p_period_start AND started_at < p_period_end
  ON CONFLICT (period_type, period_start) DO UPDATE SET
    total_executions = EXCLUDED.total_executions,
    successful_executions = EXCLUDED.successful_executions,
    failed_executions = EXCLUDED.failed_executions,
    avg_duration = EXCLUDED.avg_duration,
    min_duration = EXCLUDED.min_duration,
    max_duration = EXCLUDED.max_duration,
    total_chars_processed = EXCLUDED.total_chars_processed,
    total_chars_output = EXCLUDED.total_chars_output,
    avg_reduction_percent = EXCLUDED.avg_reduction_percent,
    avg_confidence = EXCLUDED.avg_confidence,
    min_confidence = EXCLUDED.min_confidence,
    max_confidence = EXCLUDED.max_confidence,
    grade_distribution = EXCLUDED.grade_distribution,
    total_chunks = EXCLUDED.total_chunks,
    chunks_passed_first_try = EXCLUDED.chunks_passed_first_try,
    chunks_passed_after_retry = EXCLUDED.chunks_passed_after_retry,
    chunks_failed = EXCLUDED.chunks_failed,
    total_lines_removed = EXCLUDED.total_lines_removed,
    total_garbage_lines_removed = EXCLUDED.total_garbage_lines_removed,
    total_fragments_merged = EXCLUDED.total_fragments_merged,
    total_control_chars_removed = EXCLUDED.total_control_chars_removed,
    total_patterns_detected = EXCLUDED.total_patterns_detected,
    new_patterns_learned = EXCLUDED.new_patterns_learned,
    by_pipeline_type = EXCLUDED.by_pipeline_type,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- Function to update pattern confidence
CREATE OR REPLACE FUNCTION update_pattern_confidence()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate confidence based on failure rate and occurrence count
  IF NEW.occurrence_count >= 2 THEN
    NEW.confidence := LEAST(1.0,
      (NEW.failure_count::NUMERIC / NEW.occurrence_count) * 0.6 +
      CASE WHEN NEW.failure_count > 0
        THEN (NEW.retry_success_count::NUMERIC / NEW.failure_count) * 0.3
        ELSE 0 END +
      CASE WHEN NEW.occurrence_count >= 10 THEN 0.1 ELSE 0 END
    );
  END IF;

  NEW.updated_at := NOW();
  NEW.last_seen := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update pattern confidence
CREATE TRIGGER trigger_update_pattern_confidence
  BEFORE UPDATE ON public.learned_patterns
  FOR EACH ROW
  EXECUTE FUNCTION update_pattern_confidence();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.ocr_executions IS 'Records individual OCR pipeline execution results';
COMMENT ON TABLE public.learned_patterns IS 'Stores garbage patterns discovered during OCR cleanup for pattern learning';
COMMENT ON TABLE public.ocr_statistics IS 'Pre-computed aggregated statistics for OCR dashboard';
COMMENT ON TABLE public.ocr_qa_results IS 'Detailed QA gate results per chunk for analysis';

COMMENT ON FUNCTION aggregate_ocr_statistics IS 'Aggregates OCR execution statistics for a given time period';
COMMENT ON FUNCTION update_pattern_confidence IS 'Automatically updates pattern confidence based on occurrence and failure rates';
