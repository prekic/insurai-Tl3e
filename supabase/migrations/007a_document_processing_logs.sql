-- Migration: Document Processing Logs
-- Purpose: Track the complete journey of each document through the extraction pipeline
-- Created: 2026-01-24

-- ============================================================================
-- DOCUMENT PROCESSING LOGS TABLE
-- ============================================================================
-- Stores the complete processing history for each uploaded document,
-- including all stages, inputs, outputs, timing, and any errors.

CREATE TABLE IF NOT EXISTS public.document_processing_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Document identification
  document_id UUID NOT NULL UNIQUE, -- Unique ID for tracking (generated at upload start)
  policy_id UUID REFERENCES public.policies(id) ON DELETE SET NULL, -- Linked after successful save
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,

  -- File metadata
  filename TEXT NOT NULL,
  file_size INTEGER, -- bytes
  mime_type TEXT,
  page_count INTEGER,

  -- Processing stages (JSONB array of stage objects)
  -- Each stage: { stage, status, started_at, completed_at, duration_ms, input, output, metadata, error }
  stages JSONB NOT NULL DEFAULT '[]'::jsonb,

  -- Overall processing status
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'partial')),

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  total_duration_ms INTEGER,

  -- Error tracking
  error_message TEXT,
  error_stage TEXT,
  error_details JSONB,

  -- Summary data for quick filtering
  ocr_used BOOLEAN DEFAULT FALSE,
  ocr_engine TEXT, -- 'document_ai', 'vision_api', 'tesseract', etc.
  ai_provider TEXT, -- 'openai', 'anthropic'
  extraction_confidence NUMERIC(5,2), -- 0-100

  -- Extracted policy summary (for display before policy_id is linked)
  extracted_summary JSONB, -- { policy_number, provider, type, insured_person }

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- For querying by user
CREATE INDEX IF NOT EXISTS idx_processing_logs_user_id
  ON public.document_processing_logs(user_id);

-- For querying by status
CREATE INDEX IF NOT EXISTS idx_processing_logs_status
  ON public.document_processing_logs(status);

-- For querying by date range
CREATE INDEX IF NOT EXISTS idx_processing_logs_started_at
  ON public.document_processing_logs(started_at DESC);

-- For querying by policy
CREATE INDEX IF NOT EXISTS idx_processing_logs_policy_id
  ON public.document_processing_logs(policy_id);

-- For filtering by OCR usage
CREATE INDEX IF NOT EXISTS idx_processing_logs_ocr_used
  ON public.document_processing_logs(ocr_used);

-- For filtering by AI provider
CREATE INDEX IF NOT EXISTS idx_processing_logs_ai_provider
  ON public.document_processing_logs(ai_provider);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.document_processing_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own processing logs
CREATE POLICY "Users can view their own processing logs"
  ON public.document_processing_logs
  FOR SELECT
  USING (auth.uid() = user_id);

-- Admin users can view all processing logs (service role bypasses RLS)
-- Note: Admin access is handled via service role key in admin routes

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_processing_log_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_processing_log_updated_at
  BEFORE UPDATE ON public.document_processing_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_processing_log_updated_at();

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Function to add a new stage to a processing log
CREATE OR REPLACE FUNCTION add_processing_stage(
  p_document_id UUID,
  p_stage TEXT,
  p_status TEXT,
  p_input JSONB DEFAULT NULL,
  p_output JSONB DEFAULT NULL,
  p_metadata JSONB DEFAULT NULL,
  p_error TEXT DEFAULT NULL,
  p_duration_ms INTEGER DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_stage_obj JSONB;
BEGIN
  v_stage_obj := jsonb_build_object(
    'stage', p_stage,
    'status', p_status,
    'started_at', NOW(),
    'completed_at', CASE WHEN p_status IN ('completed', 'failed', 'skipped') THEN NOW() ELSE NULL END,
    'duration_ms', p_duration_ms,
    'input', p_input,
    'output', p_output,
    'metadata', p_metadata,
    'error', p_error
  );

  UPDATE public.document_processing_logs
  SET stages = stages || v_stage_obj
  WHERE document_id = p_document_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.document_processing_logs IS
  'Tracks the complete processing journey of uploaded insurance documents';

COMMENT ON COLUMN public.document_processing_logs.stages IS
  'JSONB array of processing stages. Each stage has: stage (name), status, started_at, completed_at, duration_ms, input, output, metadata, error';

COMMENT ON COLUMN public.document_processing_logs.document_id IS
  'Unique tracking ID generated at upload start, before policy_id exists';

COMMENT ON COLUMN public.document_processing_logs.extracted_summary IS
  'Quick summary of extracted data for admin display: policy_number, provider, type, insured_person';
