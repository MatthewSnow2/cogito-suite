-- Add pgvector extension for embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- Create document_chunks table for storing processed PDF content
CREATE TABLE public.document_chunks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  knowledge_base_id UUID NOT NULL REFERENCES public.knowledge_base(id) ON DELETE CASCADE,
  custom_gpt_id UUID NOT NULL REFERENCES public.custom_gpts(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  embedding VECTOR(1536),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.document_chunks ENABLE ROW LEVEL SECURITY;

-- Create policies for document_chunks
CREATE POLICY "Users can view chunks for their GPTs" 
ON public.document_chunks 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.custom_gpts 
    WHERE custom_gpts.id = document_chunks.custom_gpt_id 
    AND custom_gpts.user_id = auth.uid()
  )
);

CREATE POLICY "Users can create chunks for their GPTs" 
ON public.document_chunks 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.custom_gpts 
    WHERE custom_gpts.id = document_chunks.custom_gpt_id 
    AND custom_gpts.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete chunks for their GPTs" 
ON public.document_chunks 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.custom_gpts 
    WHERE custom_gpts.id = document_chunks.custom_gpt_id 
    AND custom_gpts.user_id = auth.uid()
  )
);

-- Create index for vector similarity search
CREATE INDEX ON public.document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create function for similarity search
CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding VECTOR(1536),
  custom_gpt_id UUID,
  match_threshold FLOAT DEFAULT 0.8,
  match_count INT DEFAULT 3
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    document_chunks.id,
    document_chunks.content,
    1 - (document_chunks.embedding <=> query_embedding) AS similarity
  FROM document_chunks
  WHERE document_chunks.custom_gpt_id = match_documents.custom_gpt_id
    AND 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY document_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;