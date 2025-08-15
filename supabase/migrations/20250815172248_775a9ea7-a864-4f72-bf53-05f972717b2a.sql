-- Drop existing storage policies that don't match our folder structure
DROP POLICY IF EXISTS "Users can view their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update their own documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete their own documents" ON storage.objects;

-- Create new storage policies that match our actual folder structure: knowledge/{gpt_id}/filename
-- Users can only access documents for GPTs they own

CREATE POLICY "Users can view documents for their GPTs" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] = 'knowledge'
  AND EXISTS (
    SELECT 1 FROM public.custom_gpts 
    WHERE custom_gpts.id::text = (storage.foldername(name))[2]
    AND custom_gpts.user_id = auth.uid()
  )
);

CREATE POLICY "Users can upload documents for their GPTs" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] = 'knowledge'
  AND EXISTS (
    SELECT 1 FROM public.custom_gpts 
    WHERE custom_gpts.id::text = (storage.foldername(name))[2]
    AND custom_gpts.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update documents for their GPTs" 
ON storage.objects 
FOR UPDATE 
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] = 'knowledge'
  AND EXISTS (
    SELECT 1 FROM public.custom_gpts 
    WHERE custom_gpts.id::text = (storage.foldername(name))[2]
    AND custom_gpts.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete documents for their GPTs" 
ON storage.objects 
FOR DELETE 
USING (
  bucket_id = 'documents' 
  AND (storage.foldername(name))[1] = 'knowledge'
  AND EXISTS (
    SELECT 1 FROM public.custom_gpts 
    WHERE custom_gpts.id::text = (storage.foldername(name))[2]
    AND custom_gpts.user_id = auth.uid()
  )
);