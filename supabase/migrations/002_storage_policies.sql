-- Storage Bucket Policies for InsurAI
-- Run this AFTER creating the 'documents' bucket in Supabase Storage
--
-- IMPORTANT: First create the bucket manually in Supabase Dashboard:
-- 1. Go to Storage > Create bucket
-- 2. Name: 'documents'
-- 3. Public: false (private bucket)
-- 4. File size limit: 52428800 (50MB)
-- 5. Allowed MIME types: application/pdf,image/png,image/jpeg,image/webp

-- ============================================================================
-- DROP EXISTING POLICIES (if re-running)
-- ============================================================================
DO $$
BEGIN
  -- Drop existing policies if they exist
  DROP POLICY IF EXISTS "Users can upload policy documents" ON storage.objects;
  DROP POLICY IF EXISTS "Users can view their own documents" ON storage.objects;
  DROP POLICY IF EXISTS "Users can update their own documents" ON storage.objects;
  DROP POLICY IF EXISTS "Users can delete their own documents" ON storage.objects;
  DROP POLICY IF EXISTS "Users can upload to their folder" ON storage.objects;
EXCEPTION
  WHEN undefined_object THEN
    -- Policies don't exist, continue
    NULL;
END $$;

-- ============================================================================
-- STORAGE POLICIES - User-scoped with path convention
-- ============================================================================
-- Path format: policy-documents/{user_id}/{policy_id}/{timestamp}.{ext}
-- This ensures users can only access their own files

-- Allow authenticated users to upload documents to their own folder
CREATE POLICY "Users can upload to their folder"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = 'policy-documents' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow users to read their own documents (by path ownership)
CREATE POLICY "Users can view their own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = 'policy-documents' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow users to update their own documents
CREATE POLICY "Users can update their own documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = 'policy-documents' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- Allow users to delete their own documents
CREATE POLICY "Users can delete their own documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = 'policy-documents' AND
  (storage.foldername(name))[2] = auth.uid()::text
);

-- ============================================================================
-- STORAGE HELPER FUNCTIONS
-- ============================================================================

-- Function to generate a secure storage path for a user's policy document
CREATE OR REPLACE FUNCTION public.get_policy_document_path(
  p_user_id UUID,
  p_policy_id UUID,
  p_filename TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_extension TEXT;
  v_safe_filename TEXT;
BEGIN
  -- Extract file extension
  v_extension := COALESCE(
    LOWER(SUBSTRING(p_filename FROM '\.([^.]+)$')),
    'pdf'
  );

  -- Create timestamp-based filename to avoid collisions
  v_safe_filename := EXTRACT(EPOCH FROM NOW())::BIGINT || '.' || v_extension;

  -- Return the full path
  RETURN 'policy-documents/' || p_user_id::TEXT || '/' || p_policy_id::TEXT || '/' || v_safe_filename;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_policy_document_path TO authenticated;

-- ============================================================================
-- STORAGE STATISTICS VIEW (for admin monitoring)
-- ============================================================================

CREATE OR REPLACE VIEW public.storage_stats AS
SELECT
  p.user_id,
  COUNT(pd.id) as document_count,
  COALESCE(SUM(pd.file_size), 0) as total_size_bytes,
  ROUND(COALESCE(SUM(pd.file_size), 0) / 1024.0 / 1024.0, 2) as total_size_mb
FROM public.policies p
LEFT JOIN public.policy_documents pd ON p.id = pd.policy_id
GROUP BY p.user_id;

-- RLS for storage stats (users can only see their own)
ALTER VIEW public.storage_stats SET (security_invoker = on);

COMMENT ON VIEW public.storage_stats IS 'Storage usage statistics per user';
