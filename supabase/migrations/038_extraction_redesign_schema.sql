-- =============================================================================
-- Migration: 038_extraction_redesign_schema
-- Purpose: Add traceability columns to the policies table to support 
--          the High-Trust Policy Extraction Redesign.
-- =============================================================================

-- Add canonical text to store the exact text used by the LLM for extraction
ALTER TABLE policies ADD COLUMN IF NOT EXISTS canonical_text TEXT;

-- Add span maps to store coordinates mapping JSON output fields to character spans
-- in the canonical_text and original PDF bounding boxes, ensuring auditability
ALTER TABLE policies ADD COLUMN IF NOT EXISTS span_maps JSONB DEFAULT '{}'::jsonb;

-- Add a graph representation of conditions and overrides 
-- (e.g., to map deductibles to specific sub-coverages or exclusionary clauses)
ALTER TABLE policies ADD COLUMN IF NOT EXISTS clause_graph JSONB DEFAULT '{}'::jsonb;

-- Flag to distinguish policies extracted under the new universal schema
-- versus legacy extractions
ALTER TABLE policies ADD COLUMN IF NOT EXISTS is_universal_schema BOOLEAN DEFAULT FALSE;

-- Create an index to quickly filter for policies using the new schema
CREATE INDEX IF NOT EXISTS idx_policies_universal_schema ON policies(is_universal_schema);

-- Add safety metadata for the new deterministic validation layer
ALTER TABLE policies ADD COLUMN IF NOT EXISTS validation_errors JSONB DEFAULT '[]'::jsonb;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS validation_warnings JSONB DEFAULT '[]'::jsonb;
ALTER TABLE policies ADD COLUMN IF NOT EXISTS safety_score INTEGER;

-- =============================================================================
-- Rollback Instructions (if needed)
-- =============================================================================
-- ALTER TABLE policies DROP COLUMN IF EXISTS canonical_text;
-- ALTER TABLE policies DROP COLUMN IF EXISTS span_maps;
-- ALTER TABLE policies DROP COLUMN IF EXISTS clause_graph;
-- DROP INDEX IF EXISTS idx_policies_universal_schema;
-- ALTER TABLE policies DROP COLUMN IF EXISTS is_universal_schema;
-- ALTER TABLE policies DROP COLUMN IF EXISTS validation_errors;
-- ALTER TABLE policies DROP COLUMN IF EXISTS validation_warnings;
-- ALTER TABLE policies DROP COLUMN IF EXISTS safety_score;
