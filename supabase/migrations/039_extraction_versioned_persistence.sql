-- =============================================================================
-- Migration: 039_extraction_versioned_persistence
-- Purpose: Add versioned persistence columns to the policies table to 
--          track the specific schema and text versions used for extraction.
-- =============================================================================

-- Add versioning columns to track traceability and schema changes
ALTER TABLE policies ADD COLUMN IF NOT EXISTS document_version INTEGER DEFAULT 1;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS canonical_text_version INTEGER DEFAULT 1;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS evidence_span_version INTEGER DEFAULT 1;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS clause_graph_version INTEGER DEFAULT 1;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS extraction_schema_version TEXT DEFAULT 'v1.0.0';

-- Extend the existing policy_versions table to capture these new metadata fields
-- We alter the JSONB columns to ensure they seamlessly accept the new nested structures,
-- but the main change is ensuring the backend triggers capture these version markers.
ALTER TABLE policy_versions ADD COLUMN IF NOT EXISTS extraction_schema_version TEXT;

-- =============================================================================
-- Rollback Instructions
-- =============================================================================
-- ALTER TABLE policies DROP COLUMN IF EXISTS document_version;
-- ALTER TABLE policies DROP COLUMN IF EXISTS canonical_text_version;
-- ALTER TABLE policies DROP COLUMN IF EXISTS evidence_span_version;
-- ALTER TABLE policies DROP COLUMN IF EXISTS clause_graph_version;
-- ALTER TABLE policies DROP COLUMN IF EXISTS extraction_schema_version;
-- ALTER TABLE policy_versions DROP COLUMN IF EXISTS extraction_schema_version;
