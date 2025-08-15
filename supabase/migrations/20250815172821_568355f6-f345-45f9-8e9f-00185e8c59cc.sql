-- TEMP: Relax RLS to unblock uploads quickly

-- Storage policies (documents bucket) - allow any authenticated user
CREATE POLICY "Auth users can select documents (temp)"
ON storage.objects
FOR SELECT
USING (bucket_id = 'documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Auth users can insert documents (temp)"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Auth users can update documents (temp)"
ON storage.objects
FOR UPDATE
USING (bucket_id = 'documents' AND auth.uid() IS NOT NULL);

CREATE POLICY "Auth users can delete documents (temp)"
ON storage.objects
FOR DELETE
USING (bucket_id = 'documents' AND auth.uid() IS NOT NULL);

-- Knowledge base table - allow any authenticated user to manage (temp)
CREATE POLICY "Auth users can view knowledge base (temp)"
ON public.knowledge_base
FOR SELECT
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Auth users can insert knowledge base (temp)"
ON public.knowledge_base
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Auth users can update knowledge base (temp)"
ON public.knowledge_base
FOR UPDATE
USING (auth.uid() IS NOT NULL);

CREATE POLICY "Auth users can delete knowledge base (temp)"
ON public.knowledge_base
FOR DELETE
USING (auth.uid() IS NOT NULL);
