-- Storage Bucket Policies for InsurAI
-- Run this AFTER creating the 'documents' bucket in Supabase Storage

-- ============================================================================
-- STORAGE BUCKET SETUP (run in SQL Editor)
-- ============================================================================
-- Note: Bucket creation cannot be done via SQL. Create manually in dashboard:
-- 1. Go to Storage > Create bucket
-- 2. Name: 'documents'
-- 3. Public: false
-- 4. File size limit: 52428800 (50MB)
-- 5. Allowed MIME types: application/pdf,image/png,image/jpeg

-- ============================================================================
-- STORAGE POLICIES
-- ============================================================================

-- Allow authenticated users to upload documents to their policy folders
CREATE POLICY "Users can upload policy documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents' AND
  (storage.foldername(name))[1] = 'policy-documents'
);

-- Allow users to read documents they own (via policy_documents join)
CREATE POLICY "Users can view their own documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents' AND
  EXISTS (
    SELECT 1 FROM public.policy_documents pd
    JOIN public.policies p ON pd.policy_id = p.id
    WHERE pd.file_path = name AND p.user_id = auth.uid()
  )
);

-- Allow users to update their own documents
CREATE POLICY "Users can update their own documents"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents' AND
  EXISTS (
    SELECT 1 FROM public.policy_documents pd
    JOIN public.policies p ON pd.policy_id = p.id
    WHERE pd.file_path = name AND p.user_id = auth.uid()
  )
);

-- Allow users to delete their own documents
CREATE POLICY "Users can delete their own documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents' AND
  EXISTS (
    SELECT 1 FROM public.policy_documents pd
    JOIN public.policies p ON pd.policy_id = p.id
    WHERE pd.file_path = name AND p.user_id = auth.uid()
  )
);

-- ============================================================================
-- ALTERNATIVE: Simplified upload policy using path convention
-- ============================================================================
-- If you prefer to allow uploads based on user ID in path:
--
-- CREATE POLICY "Users can upload to their folder"
-- ON storage.objects FOR INSERT
-- TO authenticated
-- WITH CHECK (
--   bucket_id = 'documents' AND
--   (storage.foldername(name))[1] = 'policy-documents' AND
--   (storage.foldername(name))[2] = auth.uid()::text
-- );
--
-- This requires changing the upload path format to:
-- policy-documents/{user_id}/{policy_id}/{timestamp}.{ext}
