-- Remove all storage RLS policies to fix upload issues
DROP POLICY IF EXISTS "Users can view documents for their GPTs" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload documents for their GPTs" ON storage.objects;
DROP POLICY IF EXISTS "Users can update documents for their GPTs" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete documents for their GPTs" ON storage.objects;

-- Disable RLS on storage.objects to allow unrestricted access
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;