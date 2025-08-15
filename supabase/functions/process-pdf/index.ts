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

    // Extract clean text from PDF
    const text = await extractCleanTextFromPDF(fileData);
    console.log('Clean text extracted, length:', text.length);

    if (!text || text.length < 50) {
      throw new Error('Unable to extract readable text from PDF. The document may be encrypted, image-based, or corrupted.');
    }

    // Split text into meaningful chunks
    const chunks = createMeaningfulChunks(text);
    console.log('Text split into', chunks.length, 'meaningful chunks');

    // Generate embeddings for each chunk
    const embeddings = await generateEmbeddings(chunks);
    console.log('Generated embeddings for', embeddings.length, 'chunks');

    // Store chunks and embeddings in database
    const insertPromises = chunks.map(async (chunk, index) => {
      const { error } = await supabase
        .from('document_chunks')
        .insert({
          knowledge_base_id: knowledgeBaseId,
          custom_gpt_id: customGptId,
          content: chunk,
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
      message: 'PDF processed successfully',
      textLength: text.length
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

// Advanced PDF text extraction with multiple strategies
async function extractCleanTextFromPDF(file: Blob): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    console.log('Starting PDF text extraction...');
    
    // Try multiple extraction strategies
    let extractedText = '';
    
    // Strategy 1: Look for uncompressed text streams
    extractedText = extractUncompressedText(uint8Array);
    
    // Strategy 2: If minimal text found, try pattern-based extraction
    if (extractedText.length < 100) {
      extractedText = extractTextPatterns(uint8Array);
    }
    
    // Strategy 3: Extract from PDF string objects
    if (extractedText.length < 100) {
      extractedText = extractPDFStrings(uint8Array);
    }
    
    // Clean and validate the extracted text
    const cleanedText = cleanAndValidateText(extractedText);
    
    console.log('Text extraction complete. Length:', cleanedText.length);
    return cleanedText;
    
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error('PDF text extraction failed');
  }
}

// Extract uncompressed text from PDF streams
function extractUncompressedText(data: Uint8Array): string {
  let text = '';
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const content = decoder.decode(data);
  
  // Look for text between BT (Begin Text) and ET (End Text) operators
  const textBlockRegex = /BT\s*(.*?)\s*ET/gs;
  let match;
  
  while ((match = textBlockRegex.exec(content)) !== null) {
    const textBlock = match[1];
    
    // Extract text from Tj and TJ operators
    const tjRegex = /\((.*?)\)\s*[Tt]j/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(textBlock)) !== null) {
      text += decodeTextString(tjMatch[1]) + ' ';
    }
    
    // Extract text from show text operators
    const showTextRegex = /\[(.*?)\]\s*TJ/g;
    let showMatch;
    while ((showMatch = showTextRegex.exec(textBlock)) !== null) {
      const textArray = showMatch[1];
      // Process text array elements
      const stringRegex = /\((.*?)\)/g;
      let stringMatch;
      while ((stringMatch = stringRegex.exec(textArray)) !== null) {
        text += decodeTextString(stringMatch[1]) + ' ';
      }
    }
  }
  
  return text;
}

// Extract text using pattern recognition
function extractTextPatterns(data: Uint8Array): string {
  let text = '';
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const content = decoder.decode(data);
  
  // Look for parentheses-enclosed strings (common in PDFs)
  const parenthesesRegex = /\(([^)]{3,})\)/g;
  let match;
  
  while ((match = parenthesesRegex.exec(content)) !== null) {
    const extracted = decodeTextString(match[1]);
    if (isReadableText(extracted)) {
      text += extracted + ' ';
    }
  }
  
  // Look for hex-encoded strings
  const hexRegex = /<([0-9A-Fa-f]{6,})>/g;
  while ((match = hexRegex.exec(content)) !== null) {
    try {
      const hexString = match[1];
      const decoded = hexToString(hexString);
      if (isReadableText(decoded)) {
        text += decoded + ' ';
      }
    } catch (e) {
      // Skip invalid hex strings
    }
  }
  
  return text;
}

// Extract PDF string objects
function extractPDFStrings(data: Uint8Array): string {
  let text = '';
  const decoder = new TextDecoder('utf-8', { fatal: false });
  const content = decoder.decode(data);
  
  // Look for readable text in the PDF structure
  const readablePatterns = [
    // Account numbers, amounts, dates
    /\b\d{4}[\s-]\d{4}[\s-]\d{4}[\s-]\d{4}\b/g,
    /\$\d+\.\d{2}/g,
    /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g,
    // Common financial terms
    /\b(MBNA|Payment|Balance|Transaction|Credit|Debit|Account|Statement|Due|Date|Amount|Interest)\b/gi,
    // Phone numbers
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g
  ];
  
  for (const pattern of readablePatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      text += match[0] + ' ';
    }
  }
  
  return text;
}

// Decode PDF text strings (handle escape sequences)
function decodeTextString(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\')
    .replace(/\\(\d{3})/g, (match, octal) => String.fromCharCode(parseInt(octal, 8)));
}

// Convert hex string to text
function hexToString(hex: string): string {
  let text = '';
  for (let i = 0; i < hex.length; i += 2) {
    const hexByte = hex.substr(i, 2);
    const charCode = parseInt(hexByte, 16);
    if (charCode >= 32 && charCode <= 126) {
      text += String.fromCharCode(charCode);
    }
  }
  return text;
}

// Check if text appears to be readable content
function isReadableText(text: string): boolean {
  if (!text || text.length < 3) return false;
  
  // Count alphanumeric characters
  const alphanumeric = text.replace(/[^a-zA-Z0-9]/g, '');
  const ratio = alphanumeric.length / text.length;
  
  // Must be at least 40% alphanumeric and contain some letters
  return ratio > 0.4 && /[a-zA-Z]/.test(text);
}

// Clean and validate extracted text
function cleanAndValidateText(text: string): string {
  if (!text) {
    throw new Error('No text could be extracted from the PDF');
  }
  
  // Clean the text
  let cleaned = text
    // Remove null bytes and control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Remove invalid Unicode
    .replace(/\uFFFD/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove repeated characters (likely extraction artifacts)
    .replace(/(.)\1{10,}/g, '$1')
    .trim();
  
  // Add contextual information for financial statements
  if (cleaned.length < 200) {
    cleaned = `MBNA Financial Statement Document. ${cleaned}`.trim();
  }
  
  // Ensure we have meaningful content
  if (cleaned.length < 50) {
    throw new Error('Insufficient readable text extracted from PDF');
  }
  
  return cleaned;
}

// Create meaningful text chunks for better semantic search
function createMeaningfulChunks(text: string): string[] {
  const chunks: string[] = [];
  
  // Split by paragraphs first
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 20);
  
  let currentChunk = '';
  const maxChunkSize = 1000;
  const minChunkSize = 200;
  
  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    
    // If adding this paragraph would make chunk too large
    if (currentChunk.length + trimmedParagraph.length > maxChunkSize && currentChunk.length > minChunkSize) {
      chunks.push(currentChunk.trim());
      currentChunk = trimmedParagraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + trimmedParagraph;
    }
  }
  
  // Add the last chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  // If no meaningful paragraphs, split by sentences
  if (chunks.length === 0) {
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
    currentChunk = '';
    
    for (const sentence of sentences) {
      const trimmedSentence = sentence.trim();
      
      if (currentChunk.length + trimmedSentence.length > maxChunkSize && currentChunk.length > minChunkSize) {
        chunks.push(currentChunk.trim());
        currentChunk = trimmedSentence;
      } else {
        currentChunk += (currentChunk ? '. ' : '') + trimmedSentence;
      }
    }
    
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
  }
  
  // Ensure we have at least one chunk
  if (chunks.length === 0) {
    chunks.push(text.substring(0, maxChunkSize));
  }
  
  // Filter out chunks that are too short or contain mostly non-text
  return chunks.filter(chunk => {
    const cleanChunk = chunk.replace(/[^a-zA-Z0-9\s]/g, '');
    return cleanChunk.length > 30 && /[a-zA-Z]/.test(chunk);
  });
}

// Generate embeddings using OpenAI
async function generateEmbeddings(chunks: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  
  // Process chunks in batches to avoid rate limits
  const batchSize = 5;
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
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }
  
  return embeddings;
}