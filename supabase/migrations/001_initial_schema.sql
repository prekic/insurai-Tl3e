-- InsurAI Database Schema
-- Run this in Supabase SQL Editor to set up your database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- POLICIES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS policies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  policy_number TEXT NOT NULL,
  provider TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('kasko', 'traffic', 'home', 'health', 'life', 'dask', 'business')),
  type_tr TEXT NOT NULL,
  coverage NUMERIC NOT NULL DEFAULT 0,
  premium NUMERIC NOT NULL DEFAULT 0,
  deductible NUMERIC DEFAULT 0,
  start_date DATE NOT NULL,
  expiry_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expiring', 'expired', 'pending')),
  insured_person TEXT NOT NULL,
  location TEXT,
  document_type TEXT DEFAULT 'policy',
  upload_date DATE DEFAULT CURRENT_DATE,
  logo TEXT,
  raw_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster user queries
CREATE INDEX IF NOT EXISTS idx_policies_user_id ON policies(user_id);
CREATE INDEX IF NOT EXISTS idx_policies_status ON policies(status);
CREATE INDEX IF NOT EXISTS idx_policies_type ON policies(type);
CREATE INDEX IF NOT EXISTS idx_policies_expiry ON policies(expiry_date);

-- =============================================================================
-- POLICY DOCUMENTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS policy_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_documents_policy_id ON policy_documents(policy_id);

-- =============================================================================
-- POLICY VERSIONS TABLE (for history tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS policy_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  policy_id UUID NOT NULL REFERENCES policies(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  change_type TEXT NOT NULL CHECK (change_type IN ('created', 'updated', 'extracted', 'manual_edit')),
  change_summary TEXT,
  previous_data JSONB,
  new_data JSONB NOT NULL,
  changed_by UUID REFERENCES auth.users(id),
  changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_versions_policy_id ON policy_versions(policy_id);
CREATE INDEX IF NOT EXISTS idx_policy_versions_changed_at ON policy_versions(changed_at DESC);

-- Unique constraint for version numbers per policy
CREATE UNIQUE INDEX IF NOT EXISTS idx_policy_versions_unique ON policy_versions(policy_id, version_number);

-- =============================================================================
-- FULL-TEXT SEARCH
-- =============================================================================

-- Add search vector column to policies
ALTER TABLE policies ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create GIN index for fast full-text search
CREATE INDEX IF NOT EXISTS idx_policies_search ON policies USING GIN(search_vector);

-- Function to update search vector
CREATE OR REPLACE FUNCTION update_policy_search_vector()
RETURNS TRIGGER AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('simple', COALESCE(NEW.policy_number, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.provider, '')), 'A') ||
    setweight(to_tsvector('simple', COALESCE(NEW.insured_person, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.type_tr, '')), 'B') ||
    setweight(to_tsvector('simple', COALESCE(NEW.location, '')), 'C') ||
    setweight(to_tsvector('simple', COALESCE(NEW.raw_data->>'insuranceLine', '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update search vector
DROP TRIGGER IF EXISTS policies_search_vector_update ON policies;
CREATE TRIGGER policies_search_vector_update
  BEFORE INSERT OR UPDATE ON policies
  FOR EACH ROW
  EXECUTE FUNCTION update_policy_search_vector();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS
ALTER TABLE policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE policy_versions ENABLE ROW LEVEL SECURITY;

-- Policies: Users can only see their own policies
DROP POLICY IF EXISTS policies_select_own ON policies;
CREATE POLICY policies_select_own ON policies
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS policies_insert_own ON policies;
CREATE POLICY policies_insert_own ON policies
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS policies_update_own ON policies;
CREATE POLICY policies_update_own ON policies
  FOR UPDATE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS policies_delete_own ON policies;
CREATE POLICY policies_delete_own ON policies
  FOR DELETE USING (auth.uid() = user_id);

-- Policy documents: Same rules as policies
DROP POLICY IF EXISTS policy_documents_select ON policy_documents;
CREATE POLICY policy_documents_select ON policy_documents
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_documents.policy_id AND policies.user_id = auth.uid())
  );

DROP POLICY IF EXISTS policy_documents_insert ON policy_documents;
CREATE POLICY policy_documents_insert ON policy_documents
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_documents.policy_id AND policies.user_id = auth.uid())
  );

DROP POLICY IF EXISTS policy_documents_delete ON policy_documents;
CREATE POLICY policy_documents_delete ON policy_documents
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_documents.policy_id AND policies.user_id = auth.uid())
  );

-- Policy versions: Same rules
DROP POLICY IF EXISTS policy_versions_select ON policy_versions;
CREATE POLICY policy_versions_select ON policy_versions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_versions.policy_id AND policies.user_id = auth.uid())
  );

DROP POLICY IF EXISTS policy_versions_insert ON policy_versions;
CREATE POLICY policy_versions_insert ON policy_versions
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM policies WHERE policies.id = policy_versions.policy_id AND policies.user_id = auth.uid())
  );

-- =============================================================================
-- STORAGE BUCKET
-- =============================================================================

-- Create storage bucket for documents (run in Supabase Dashboard > Storage)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', false);

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to search policies
CREATE OR REPLACE FUNCTION search_policies(search_query TEXT)
RETURNS SETOF policies AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM policies
  WHERE
    user_id = auth.uid()
    AND (
      search_vector @@ plainto_tsquery('simple', search_query)
      OR policy_number ILIKE '%' || search_query || '%'
      OR provider ILIKE '%' || search_query || '%'
      OR insured_person ILIKE '%' || search_query || '%'
    )
  ORDER BY
    CASE WHEN search_vector @@ plainto_tsquery('simple', search_query)
      THEN ts_rank(search_vector, plainto_tsquery('simple', search_query))
      ELSE 0
    END DESC,
    created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get policy version history
CREATE OR REPLACE FUNCTION get_policy_history(p_policy_id UUID)
RETURNS TABLE (
  version_number INTEGER,
  change_type TEXT,
  change_summary TEXT,
  changed_at TIMESTAMPTZ,
  new_data JSONB
) AS $$
BEGIN
  -- Verify user owns this policy
  IF NOT EXISTS (SELECT 1 FROM policies WHERE id = p_policy_id AND user_id = auth.uid()) THEN
    RAISE EXCEPTION 'Policy not found or access denied';
  END IF;

  RETURN QUERY
  SELECT
    pv.version_number,
    pv.change_type,
    pv.change_summary,
    pv.changed_at,
    pv.new_data
  FROM policy_versions pv
  WHERE pv.policy_id = p_policy_id
  ORDER BY pv.version_number DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to auto-create version on policy update
CREATE OR REPLACE FUNCTION create_policy_version()
RETURNS TRIGGER AS $$
DECLARE
  next_version INTEGER;
BEGIN
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
  FROM policy_versions
  WHERE policy_id = NEW.id;

  -- Create version record
  INSERT INTO policy_versions (
    policy_id,
    version_number,
    change_type,
    change_summary,
    previous_data,
    new_data,
    changed_by
  ) VALUES (
    NEW.id,
    next_version,
    CASE
      WHEN TG_OP = 'INSERT' THEN 'created'
      ELSE 'updated'
    END,
    CASE
      WHEN TG_OP = 'INSERT' THEN 'Policy created'
      ELSE 'Policy updated'
    END,
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW),
    auth.uid()
  );

  -- Update the updated_at timestamp
  NEW.updated_at := NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for auto-versioning
DROP TRIGGER IF EXISTS policies_version_trigger ON policies;
CREATE TRIGGER policies_version_trigger
  AFTER INSERT OR UPDATE ON policies
  FOR EACH ROW
  EXECUTE FUNCTION create_policy_version();

-- =============================================================================
-- UPDATE EXISTING SEARCH VECTORS
-- =============================================================================
UPDATE policies SET search_vector =
  setweight(to_tsvector('simple', COALESCE(policy_number, '')), 'A') ||
  setweight(to_tsvector('simple', COALESCE(provider, '')), 'A') ||
  setweight(to_tsvector('simple', COALESCE(insured_person, '')), 'B') ||
  setweight(to_tsvector('simple', COALESCE(type_tr, '')), 'B') ||
  setweight(to_tsvector('simple', COALESCE(location, '')), 'C');
