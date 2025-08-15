import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const openAIApiKey = Deno.env.get('OPENAI_API_KEY')!;

const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ProcessRequest {
  knowledgeBaseId: string;
  customGptId: string;
  filePath: string;
  fileName: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { knowledgeBaseId, customGptId, filePath, fileName }: ProcessRequest = await req.json();
    
    console.log('Processing PDF:', { knowledgeBaseId, customGptId, filePath, fileName });

    // Download PDF from storage
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('documents')
      .download(filePath);

    if (downloadError) {
      throw new Error(`Failed to download file: ${downloadError.message}`);
    }

    console.log('PDF downloaded, size:', fileData.size);

    // Convert PDF to text using simple extraction (basic approach)
    const text = await extractTextFromPDF(fileData);
    console.log('Text extracted, length:', text.length);

    // Split text into chunks
    const chunks = splitTextIntoChunks(text, 800, 200);
    console.log('Text split into', chunks.length, 'chunks');

    // Generate embeddings for each chunk
    const embeddings = await generateEmbeddings(chunks);
    console.log('Generated embeddings for', embeddings.length, 'chunks');

    // Store chunks and embeddings in database
    const insertPromises = chunks.map(async (chunk, index) => {
      // Clean each chunk before storing
      const cleanedChunk = cleanTextForDatabase(chunk);
      
      const { error } = await supabase
        .from('document_chunks')
        .insert({
          knowledge_base_id: knowledgeBaseId,
          custom_gpt_id: customGptId,
          content: cleanedChunk,
          chunk_index: index,
          embedding: embeddings[index],
        });

      if (error) {
        console.error('Error inserting chunk:', error);
        throw error;
      }
    });

    await Promise.all(insertPromises);
    console.log('All chunks stored successfully');

    // Update knowledge_base record as processed
    const { error: updateError } = await supabase
      .from('knowledge_base')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', knowledgeBaseId);

    if (updateError) {
      throw updateError;
    }

    return new Response(JSON.stringify({ 
      success: true,
      chunksProcessed: chunks.length,
      message: 'PDF processed successfully'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in process-pdf function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Basic PDF text extraction (simplified approach)
async function extractTextFromPDF(file: Blob): Promise<string> {
  try {
    // For now, we'll use a simple approach that works with basic PDFs
    // In production, you'd want to use a proper PDF parsing library
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // Convert to string and extract basic text (very basic PDF parsing)
    let text = '';
    const decoder = new TextDecoder('utf-8', { fatal: false });
    const content = decoder.decode(uint8Array);
    
    // Extract text between common PDF text markers
    const textRegex = /\((.*?)\)/g;
    let match;
    while ((match = textRegex.exec(content)) !== null) {
      text += match[1] + ' ';
    }
    
    // Also try to extract direct text content
    const lines = content.split('\n');
    for (const line of lines) {
      if (line.trim() && !line.includes('%') && !line.includes('<<') && !line.includes('>>')) {
        const cleanLine = line.replace(/[^\w\s.,!?;:()\-]/g, '').trim();
        if (cleanLine.length > 3) {
          text += cleanLine + ' ';
        }
      }
    }
    
    // Clean the text to remove null bytes and other problematic characters
    text = cleanTextForDatabase(text);
    
    // Fallback: if no text extracted, return filename as content
    if (!text.trim()) {
      text = `This document contains content that cannot be automatically extracted. Document name: ${file.name || 'PDF Document'}`;
    }
    
    return text.trim();
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    return `Error processing PDF content. Document may be encrypted or in an unsupported format.`;
  }
}

// Clean text to remove problematic characters that can't be stored in PostgreSQL
function cleanTextForDatabase(text: string): string {
  return text
    // Remove null bytes and other control characters
    .replace(/\0/g, '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Remove invalid Unicode sequences
    .replace(/\uFFFD/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

// Split text into overlapping chunks
function splitTextIntoChunks(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  let currentChunk = '';
  
  for (const sentence of sentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;
    
    // If adding this sentence would exceed chunk size, save current chunk
    if (currentChunk.length + trimmedSentence.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      
      // Start new chunk with overlap
      const words = currentChunk.split(' ');
      const overlapWords = words.slice(-Math.floor(overlap / 10)); // Approximate overlap
      currentChunk = overlapWords.join(' ') + ' ' + trimmedSentence;
    } else {
      currentChunk += (currentChunk ? ' ' : '') + trimmedSentence;
    }
  }
  
  // Add the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  // Ensure we have at least one chunk
  if (chunks.length === 0) {
    chunks.push(text.substring(0, chunkSize));
  }
  
  return chunks;
}

// Generate embeddings using OpenAI
async function generateEmbeddings(chunks: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  
  // Process chunks in batches to avoid rate limits
  const batchSize = 10;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'text-embedding-3-small',
        input: batch,
      }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Embeddings API error: ${error}`);
    }
    
    const data = await response.json();
    for (const item of data.data) {
      embeddings.push(item.embedding);
    }
    
    // Small delay between batches
    if (i + batchSize < chunks.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return embeddings;
}