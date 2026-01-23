-- ============================================================================
-- OCR PIPELINE DATABASE SCHEMA
-- Migration: 010_ocr_pipeline_schema.sql
-- Description: Complete schema for ensemble OCR microservice architecture
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE document_status AS ENUM (
  'PENDING',
  'INGESTED',
  'RENDERING',
  'PREPROCESSING',
  'LAYOUT_ANALYSIS',
  'OCR_IN_PROGRESS',
  'RECONCILING',
  'NORMALIZING',
  'VALIDATING',
  'EXTRACTING',
  'COMPLETED',
  'QUARANTINED',
  'FAILED'
);

CREATE TYPE document_stage AS ENUM (
  'ingest',
  'render',
  'preprocess',
  'layout',
  'ocr',
  'reconcile',
  'normalize',
  'validate',
  'extract',
  'finalize'
);

CREATE TYPE ocr_engine AS ENUM (
  'abbyy',
  'gcp_docai',
  'azure_di',
  'tesseract'
);

CREATE TYPE preprocess_variant AS ENUM ('A', 'B', 'C', 'D');

CREATE TYPE region_type AS ENUM (
  'text',
  'table',
  'header',
  'footer',
  'qr',
  'barcode',
  'logo',
  'signature',
  'stamp',
  'handwriting'
);

CREATE TYPE validation_severity AS ENUM ('info', 'warn', 'error', 'critical');

CREATE TYPE rulepack_type AS ENUM ('locale', 'policy');

CREATE TYPE pipeline_trace_status AS ENUM ('started', 'completed', 'failed', 'skipped');

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- OCR Documents (separate from insurance policies table)
CREATE TABLE ocr_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL,

  -- Status tracking
  status document_status NOT NULL DEFAULT 'PENDING',
  stage document_stage NOT NULL DEFAULT 'ingest',

  -- Detection results
  detected_locale VARCHAR(10), -- e.g., 'tr-TR'
  detected_region VARCHAR(5),  -- e.g., 'TR'
  detected_policy_type VARCHAR(50), -- e.g., 'motor_kasko'

  -- Rule pack references
  rulepack_locale_id UUID REFERENCES rule_packs(id),
  rulepack_policy_id UUID REFERENCES rule_packs(id),

  -- Quality metrics
  quality_score INTEGER CHECK (quality_score >= 0 AND quality_score <= 100),
  quarantine_reason TEXT,

  -- Object storage keys
  object_keys JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Expected structure:
  -- {
  --   "originalPdf": "s3://...",
  --   "finalText": "s3://...",
  --   "finalDocument": "s3://...",
  --   "auditBundle": "s3://..."
  -- }

  -- Upload hints/overrides
  hints JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Expected structure:
  -- {
  --   "locale": "tr-TR",
  --   "policyType": "motor_kasko",
  --   "forceEngines": ["abbyy", "gcp_docai"]
  -- }

  -- Source file info
  source_filename VARCHAR(255) NOT NULL,
  source_mime VARCHAR(100) NOT NULL DEFAULT 'application/pdf',
  source_size_bytes BIGINT,
  source_checksum VARCHAR(64), -- SHA-256

  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Indexes for common queries
  CONSTRAINT valid_object_keys CHECK (jsonb_typeof(object_keys) = 'object')
);

-- Create indexes
CREATE INDEX idx_ocr_documents_tenant ON ocr_documents(tenant_id);
CREATE INDEX idx_ocr_documents_status ON ocr_documents(status);
CREATE INDEX idx_ocr_documents_stage ON ocr_documents(stage);
CREATE INDEX idx_ocr_documents_locale ON ocr_documents(detected_locale);
CREATE INDEX idx_ocr_documents_policy_type ON ocr_documents(detected_policy_type);
CREATE INDEX idx_ocr_documents_created ON ocr_documents(created_at DESC);

-- ============================================================================
-- PAGE & REGION TABLES
-- ============================================================================

-- Pages within a document
CREATE TABLE ocr_pages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doc_id UUID NOT NULL REFERENCES ocr_documents(id) ON DELETE CASCADE,
  page_no INTEGER NOT NULL CHECK (page_no >= 1),

  -- Render keys
  render_key_600dpi VARCHAR(500),
  render_key_900dpi VARCHAR(500),

  -- Preprocessing variants
  variants JSONB NOT NULL DEFAULT '{}'::jsonb,
  -- Expected: {"A": "s3://...", "B": "s3://...", "C": "s3://...", "D": "s3://..."}

  -- Layout analysis result
  layout_key VARCHAR(500),

  -- Page dimensions (in pixels at 600 DPI)
  width INTEGER,
  height INTEGER,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (doc_id, page_no)
);

CREATE INDEX idx_ocr_pages_doc ON ocr_pages(doc_id);

-- Regions detected within pages
CREATE TABLE ocr_regions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doc_id UUID NOT NULL REFERENCES ocr_documents(id) ON DELETE CASCADE,
  page_no INTEGER NOT NULL,

  -- Region classification
  type region_type NOT NULL,

  -- Bounding box
  bbox JSONB NOT NULL,
  -- Expected: {"x": 100, "y": 200, "width": 300, "height": 50, "polygon": [...]}

  -- Cropped image key
  crop_key VARCHAR(500),

  -- Detection confidence
  confidence REAL CHECK (confidence >= 0 AND confidence <= 1),

  -- Additional metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ocr_regions_doc ON ocr_regions(doc_id);
CREATE INDEX idx_ocr_regions_page ON ocr_regions(doc_id, page_no);
CREATE INDEX idx_ocr_regions_type ON ocr_regions(type);

-- ============================================================================
-- OCR RUN TABLES
-- ============================================================================

-- Individual OCR runs (one per engine per region per variant)
CREATE TABLE ocr_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doc_id UUID NOT NULL REFERENCES ocr_documents(id) ON DELETE CASCADE,
  page_no INTEGER NOT NULL,
  region_id UUID NOT NULL REFERENCES ocr_regions(id) ON DELETE CASCADE,

  -- Engine and variant
  engine ocr_engine NOT NULL,
  variant_id preprocess_variant NOT NULL,

  -- Raw output storage
  raw_output_key VARCHAR(500) NOT NULL,

  -- Metrics
  engine_confidence REAL CHECK (engine_confidence >= 0 AND engine_confidence <= 1),
  token_count INTEGER,
  processing_time_ms INTEGER,

  -- Idempotency
  idempotency_key VARCHAR(128) NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (idempotency_key)
);

CREATE INDEX idx_ocr_runs_doc ON ocr_runs(doc_id);
CREATE INDEX idx_ocr_runs_region ON ocr_runs(region_id);
CREATE INDEX idx_ocr_runs_engine ON ocr_runs(engine);

-- OCR Tokens (can be stored in S3 for high volume, or here for simpler queries)
CREATE TABLE ocr_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES ocr_runs(id) ON DELETE CASCADE,
  doc_id UUID NOT NULL REFERENCES ocr_documents(id) ON DELETE CASCADE,
  page_no INTEGER NOT NULL,
  region_id UUID NOT NULL,

  -- Token data
  text TEXT NOT NULL,
  bbox JSONB NOT NULL,
  confidence REAL CHECK (confidence >= 0 AND confidence <= 1),

  -- Position within region
  line_index INTEGER NOT NULL,
  word_index INTEGER NOT NULL,

  -- Character-level alternatives for dispute resolution
  alternatives JSONB,
  -- Expected: [{"text": "O", "confidence": 0.3}, {"text": "0", "confidence": 0.7}]

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ocr_tokens_run ON ocr_tokens(run_id);
CREATE INDEX idx_ocr_tokens_doc ON ocr_tokens(doc_id);
CREATE INDEX idx_ocr_tokens_region ON ocr_tokens(region_id);

-- ============================================================================
-- RECONCILIATION TABLES
-- ============================================================================

-- Reconciliation decisions (how tokens from multiple engines were merged)
CREATE TABLE reconcile_decisions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doc_id UUID NOT NULL REFERENCES ocr_documents(id) ON DELETE CASCADE,
  page_no INTEGER NOT NULL,
  region_id UUID NOT NULL REFERENCES ocr_regions(id) ON DELETE CASCADE,

  -- Token span identifier
  token_span_id VARCHAR(50) NOT NULL,

  -- Decision
  chosen_text TEXT NOT NULL,
  candidates JSONB NOT NULL,
  -- Expected: [{"engine": "abbyy", "text": "SİGORTA", "confidence": 0.95, "bbox": {...}}, ...]

  -- Rule that determined the choice
  rule_applied VARCHAR(100) NOT NULL,

  -- Dispute tracking
  is_disputed BOOLEAN NOT NULL DEFAULT FALSE,
  dispute_reason TEXT,
  dispute_severity VARCHAR(20),

  -- Final confidence
  confidence REAL CHECK (confidence >= 0 AND confidence <= 1),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reconcile_doc ON reconcile_decisions(doc_id);
CREATE INDEX idx_reconcile_disputed ON reconcile_decisions(doc_id, is_disputed) WHERE is_disputed = TRUE;

-- Reconciled tokens (final merged result)
CREATE TABLE reconciled_tokens (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doc_id UUID NOT NULL REFERENCES ocr_documents(id) ON DELETE CASCADE,
  page_no INTEGER NOT NULL,
  region_id UUID NOT NULL,

  -- Token data
  text TEXT NOT NULL,
  bbox JSONB NOT NULL,
  confidence REAL CHECK (confidence >= 0 AND confidence <= 1),

  -- Source tracking
  source_engines ocr_engine[] NOT NULL,

  -- Position
  line_index INTEGER NOT NULL,
  word_index INTEGER NOT NULL,

  -- Reading order (global across document)
  reading_order INTEGER NOT NULL,

  -- Dispute flag
  is_disputed BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reconciled_tokens_doc ON reconciled_tokens(doc_id);
CREATE INDEX idx_reconciled_tokens_order ON reconciled_tokens(doc_id, reading_order);

-- ============================================================================
-- NORMALIZATION TABLES
-- ============================================================================

-- Normalization transforms applied to document
CREATE TABLE normalization_transforms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doc_id UUID NOT NULL REFERENCES ocr_documents(id) ON DELETE CASCADE,

  -- Stage identifier (e.g., 'locale', 'policy', 'custom')
  stage VARCHAR(50) NOT NULL,

  -- Applied rules
  applied_rules JSONB NOT NULL,
  -- Expected: [{"ruleId": "...", "ruleName": "...", "matches": 5, "examples": [...]}]

  -- Diff storage (optional, for audit)
  diff_key VARCHAR(500),

  -- Checksums for verification
  input_hash VARCHAR(64) NOT NULL,
  output_hash VARCHAR(64) NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_normalization_doc ON normalization_transforms(doc_id);

-- ============================================================================
-- VALIDATION TABLES
-- ============================================================================

-- Validation results
CREATE TABLE validation_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doc_id UUID NOT NULL REFERENCES ocr_documents(id) ON DELETE CASCADE,

  -- Severity and code
  severity validation_severity NOT NULL,
  code VARCHAR(100) NOT NULL,
  message TEXT NOT NULL,

  -- Field reference (nullable for document-level issues)
  field VARCHAR(100),

  -- Evidence
  evidence JSONB,
  -- Expected: {"pageNo": 1, "bbox": {...}, "quote": "...", "context": "..."}

  -- Rule pack reference
  rulepack_id UUID REFERENCES rule_packs(id),
  rule_id VARCHAR(100),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_validation_doc ON validation_results(doc_id);
CREATE INDEX idx_validation_severity ON validation_results(doc_id, severity);
CREATE INDEX idx_validation_field ON validation_results(doc_id, field);

-- ============================================================================
-- EXTRACTION TABLES
-- ============================================================================

-- Extracted fields
CREATE TABLE extracted_fields (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doc_id UUID NOT NULL REFERENCES ocr_documents(id) ON DELETE CASCADE,

  -- Field path (e.g., 'vehicle.plate', 'policy.policyNo')
  field_path VARCHAR(100) NOT NULL,

  -- Values
  value_raw TEXT NOT NULL,
  value_normalized TEXT NOT NULL,

  -- Confidence
  confidence REAL CHECK (confidence >= 0 AND confidence <= 1),

  -- Evidence
  evidence JSONB NOT NULL,
  -- Expected: {
  --   "pageNo": 1,
  --   "bbox": {...},
  --   "quote": "34 ABC 1234",
  --   "sourceTokenIds": ["uuid1", "uuid2"],
  --   "extractionMethod": "regex"
  -- }

  -- Validation status
  validation_status VARCHAR(20) NOT NULL DEFAULT 'uncertain'
    CHECK (validation_status IN ('valid', 'invalid', 'uncertain')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (doc_id, field_path)
);

CREATE INDEX idx_extracted_fields_doc ON extracted_fields(doc_id);
CREATE INDEX idx_extracted_fields_path ON extracted_fields(field_path);

-- ============================================================================
-- RULE PACK TABLES
-- ============================================================================

-- Rule packs (locale and policy)
CREATE TABLE rule_packs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  -- Type and identifier
  type rulepack_type NOT NULL,
  identifier VARCHAR(100) NOT NULL, -- e.g., 'tr-TR' or 'motor_kasko'
  version VARCHAR(20) NOT NULL DEFAULT '1.0.0',

  -- Status
  active BOOLEAN NOT NULL DEFAULT TRUE,

  -- Rules content (JSONB for flexibility)
  rules JSONB NOT NULL,

  -- Metadata
  description TEXT,
  author VARCHAR(100),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (type, identifier, version)
);

CREATE INDEX idx_rule_packs_type ON rule_packs(type);
CREATE INDEX idx_rule_packs_identifier ON rule_packs(identifier);
CREATE INDEX idx_rule_packs_active ON rule_packs(active) WHERE active = TRUE;

-- Rule pack versions (for history)
CREATE TABLE rule_pack_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  pack_id UUID NOT NULL REFERENCES rule_packs(id) ON DELETE CASCADE,
  version VARCHAR(20) NOT NULL,
  rules JSONB NOT NULL,
  changelog TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by VARCHAR(100),

  UNIQUE (pack_id, version)
);

CREATE INDEX idx_rule_pack_versions_pack ON rule_pack_versions(pack_id);

-- ============================================================================
-- AUDIT TABLES
-- ============================================================================

-- Pipeline trace (execution history)
CREATE TABLE pipeline_traces (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doc_id UUID NOT NULL REFERENCES ocr_documents(id) ON DELETE CASCADE,

  -- Stage info
  stage document_stage NOT NULL,
  status pipeline_trace_status NOT NULL,

  -- Timing
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Error info (if failed)
  error_message TEXT,
  error_stack TEXT,

  -- Metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Retry tracking
  attempt_number INTEGER NOT NULL DEFAULT 1,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pipeline_traces_doc ON pipeline_traces(doc_id);
CREATE INDEX idx_pipeline_traces_stage ON pipeline_traces(doc_id, stage);
CREATE INDEX idx_pipeline_traces_status ON pipeline_traces(status);

-- Audit bundles (references to complete audit packages)
CREATE TABLE audit_bundles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doc_id UUID NOT NULL REFERENCES ocr_documents(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL,

  -- Bundle storage
  bundle_key VARCHAR(500) NOT NULL,
  bundle_version VARCHAR(20) NOT NULL DEFAULT '1.0',

  -- Checksums
  checksums JSONB NOT NULL,
  -- Expected: {"originalPdf": "sha256:...", "finalText": "sha256:...", "finalDocument": "sha256:..."}

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (doc_id)
);

CREATE INDEX idx_audit_bundles_tenant ON audit_bundles(tenant_id);

-- ============================================================================
-- DEAD LETTER QUEUE TABLE
-- ============================================================================

-- Dead letter entries (for messages that failed processing)
CREATE TABLE dead_letter_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  doc_id UUID REFERENCES ocr_documents(id) ON DELETE SET NULL,

  -- Queue info
  queue_name VARCHAR(100) NOT NULL,
  message_type VARCHAR(100) NOT NULL,

  -- Message content
  message_body JSONB NOT NULL,

  -- Failure info
  error_message TEXT NOT NULL,
  error_stack TEXT,
  attempt_count INTEGER NOT NULL,
  last_attempt_at TIMESTAMPTZ NOT NULL,

  -- Resolution
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at TIMESTAMPTZ,
  resolved_by VARCHAR(100),
  resolution_notes TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dlq_doc ON dead_letter_entries(doc_id);
CREATE INDEX idx_dlq_queue ON dead_letter_entries(queue_name);
CREATE INDEX idx_dlq_unresolved ON dead_letter_entries(resolved) WHERE resolved = FALSE;

-- ============================================================================
-- FUNCTIONS & TRIGGERS
-- ============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ocr_documents_updated_at
  BEFORE UPDATE ON ocr_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_rule_packs_updated_at
  BEFORE UPDATE ON rule_packs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE ocr_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_regions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconcile_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciled_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE normalization_transforms ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE extracted_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_traces ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_bundles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dead_letter_entries ENABLE ROW LEVEL SECURITY;

-- Rule packs are shared across tenants (no RLS)

-- Tenant isolation policies (example - adjust based on your auth setup)
CREATE POLICY tenant_isolation_ocr_documents ON ocr_documents
  FOR ALL
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

CREATE POLICY tenant_isolation_ocr_pages ON ocr_pages
  FOR ALL
  USING (doc_id IN (SELECT id FROM ocr_documents WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid));

CREATE POLICY tenant_isolation_ocr_regions ON ocr_regions
  FOR ALL
  USING (doc_id IN (SELECT id FROM ocr_documents WHERE tenant_id = current_setting('app.current_tenant_id', true)::uuid));

-- Add similar policies for other tables...

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE ocr_documents IS 'Main OCR document tracking table - one row per uploaded document';
COMMENT ON TABLE ocr_pages IS 'Individual pages within a document with render and variant info';
COMMENT ON TABLE ocr_regions IS 'Detected regions (text blocks, tables, etc.) within pages';
COMMENT ON TABLE ocr_runs IS 'Individual OCR engine runs with idempotency tracking';
COMMENT ON TABLE ocr_tokens IS 'Tokens extracted by OCR engines (can be moved to S3 for scale)';
COMMENT ON TABLE reconcile_decisions IS 'Decisions made when reconciling tokens from multiple engines';
COMMENT ON TABLE reconciled_tokens IS 'Final merged tokens after reconciliation';
COMMENT ON TABLE normalization_transforms IS 'Record of normalization rules applied';
COMMENT ON TABLE validation_results IS 'Validation issues found during processing';
COMMENT ON TABLE extracted_fields IS 'Structured fields extracted from the document';
COMMENT ON TABLE rule_packs IS 'Locale and policy-specific rule configurations';
COMMENT ON TABLE pipeline_traces IS 'Execution trace for each pipeline stage';
COMMENT ON TABLE audit_bundles IS 'Complete audit packages for document processing';
COMMENT ON TABLE dead_letter_entries IS 'Failed messages for manual review';
