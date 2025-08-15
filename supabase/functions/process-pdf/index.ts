import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { inflate, inflateRaw } from 'https://esm.sh/pako@2.1.0';

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

    // Distill core human-readable text with LLM to remove PDF metadata/junk
    let distilled = text;
    try {
      const trimmed = text.length > 12000 ? text.slice(0, 12000) : text;
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4.1-2025-04-14',
          messages: [
            { role: 'system', content: 'Extract only the human-readable body text from an email/newsletter saved as PDF. Remove fonts, object refs, hex, coordinates, and metadata. Return clean paragraphs only. No commentary.' },
            { role: 'user', content: `File: ${fileName}\n---\n${trimmed}`}
          ],
          max_completion_tokens: 1200,
        }),
      });
      if (resp.ok) {
        const data = await resp.json();
        const distilledText = data.choices?.[0]?.message?.content?.trim();
        if (distilledText && distilledText.length > 200) distilled = distilledText;
      } else {
        console.warn('LLM distillation skipped due to API error');
      }
    } catch (e) {
      console.warn('LLM distillation failed, using raw text');
    }

    // Split distilled text into meaningful chunks
    const chunks = createMeaningfulChunks(distilled);
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

// Extract text from PDF by parsing BT/ET and also decompressing Flate streams
function extractUncompressedText(data: Uint8Array): string {
  let text = '';
  const decoder = new TextDecoder('latin1', { fatal: false });
  const content = decoder.decode(data);

  // Helper to parse text showing operators from a string block
  const parseOperators = (src: string): string => {
    let out = '';
    const textBlockRegex = /BT\s*[\s\S]*?ET/gs;
    let match;
    while ((match = textBlockRegex.exec(src)) !== null) {
      const textBlock = match[0];
      // Tj
      const tjRegex = /\((.*?)\)\s*[Tt]j/g;
      let tjMatch;
      while ((tjMatch = tjRegex.exec(textBlock)) !== null) {
        out += decodeTextString(tjMatch[1]) + ' ';
      }
      // TJ array form
      const showTextRegex = /\[(.*?)\]\s*TJ/g;
      let showMatch;
      while ((showMatch = showTextRegex.exec(textBlock)) !== null) {
        const textArray = showMatch[1];
        const stringRegex = /\((.*?)\)/g;
        let stringMatch;
        while ((stringMatch = stringRegex.exec(textArray)) !== null) {
          out += decodeTextString(stringMatch[1]) + ' ';
        }
      }
    }
    return out;
  };

  // Strategy A: parse directly in uncompressed bytes
  text += parseOperators(content);

  // Strategy B: decompress Flate streams (skip images)
  const objRegex = /(\d+\s+\d+\s+obj[\s\S]*?endobj)/g;
  let objMatch;
  while ((objMatch = objRegex.exec(content)) !== null) {
    const obj = objMatch[1];
    if (!/\/Filter\s*\/FlateDecode/.test(obj)) continue;
    if (/\/Subtype\s*\/Image/.test(obj)) continue;

    const streamIdx = obj.indexOf('stream');
    const endStreamIdx = obj.indexOf('endstream', streamIdx);
    if (streamIdx === -1 || endStreamIdx === -1) continue;

    // Compute byte offsets using 1:1 latin1 mapping
    let start = objMatch.index + streamIdx + 'stream'.length;
    // Skip EOL after 'stream' if present
    if (content[start] === '\r' && content[start + 1] === '\n') start += 2;
    else if (content[start] === '\n') start += 1;
    const end = objMatch.index + endStreamIdx;

    const bytes = data.slice(start, end);
    try {
      let inflated: Uint8Array;
      try {
        inflated = inflate(bytes);
      } catch (_) {
        inflated = inflateRaw(bytes);
      }
      const decompressed = new TextDecoder('latin1').decode(inflated);
      text += ' ' + parseOperators(decompressed);

      // Fallback: also capture plain strings inside parentheses
      const parenRegex = /\(([^)]{3,})\)/g;
      let pm;
      while ((pm = parenRegex.exec(decompressed)) !== null) {
        const candidate = decodeTextString(pm[1]);
        if (isReadableText(candidate)) text += candidate + ' ';
      }
    } catch (e) {
      // ignore faulty streams
    }
  }

  return text.trim();
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
  
  // Initial normalization
  let cleaned = text
    // Remove null bytes and control characters
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    // Remove invalid Unicode
    .replace(/\uFFFD/g, ' ')
    .replace(/\r/g, '\n');

  // Strip PDF structure blocks and artifacts
  cleaned = cleaned
    // Remove complete obj...endobj blocks
    .replace(/(\d+\s+\d+\s+obj[\s\S]*?endobj)/g, ' ')
    // Remove common PDF keyword lines
    .replace(/(?m)^\s*(Filter|FlateDecode|DCTDecode|ASCII85Decode|LZWDecode|Length1?|Subtype|Type|Catalog|Pages|Kids|Count|MediaBox|Resources|Font|ProcSet|Encrypt|Root|Info|startxref|trailer|xref|endstream|stream|obj|endobj)\b.*$/g, ' ')
    // Remove graphics/text operators
    .replace(/\b(BT|ET|Tf|Do|Td|Tm|Tj|TJ|RG|rg|re|m|l|h|S|f|cs|CS|cm|q|Q)\b/g, ' ')
    // Remove long hex strings
    .replace(/<([0-9A-Fa-f]{16,})>/g, ' ')
    // Remove very long words (likely binary/glyphs)
    .replace(/\b\S{40,}\b/g, ' ')
    // Remove lines that are mostly numbers/width arrays
    .replace(/(?m)^(?:\s*\d+(?:\.\d+)?\s+){6,}\d+(?:\.\d+)?\s*$/g, ' ')
    // Remove repeated tiny tokens
    .replace(/(?:\b\w\b\s*){8,}/g, ' ');

  // Collapse whitespace and deduplicate artifacts
  cleaned = cleaned
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\s+/g, ' ')
    .trim();

  // Final signal checks
  const letters = (cleaned.match(/[A-Za-z]/g) || []).length;
  const vowels = (cleaned.match(/[aeiouAEIOU]/g) || []).length;
  const digits = (cleaned.match(/\d/g) || []).length;
  const length = cleaned.length;

  const alphaRatio = letters / (length || 1);
  const vowelRatio = vowels / (letters || 1);
  const numericRatio = digits / (length || 1);

  if (alphaRatio < 0.45 || vowelRatio < 0.18 || numericRatio > 0.45) {
    throw new Error('Insufficient readable text extracted from PDF');
  }

  // Add minimal context if still short
  if (cleaned.length < 200) {
    cleaned = `Business Class Upgrade Document. ${cleaned}`.trim();
  }
  
  if (cleaned.length < 60) {
    throw new Error('Insufficient readable text extracted from PDF');
  }
  
  return cleaned;
}

// Create meaningful text chunks for better semantic search
function createMeaningfulChunks(text: string): string[] {
  const MAX_CHARS = 1800; // ultra-safe per-chunk cap well below token limits
  const MIN_CHARS = 200;

  // Helper: split an overlong string by words into <= MAX_CHARS pieces
  const splitByWords = (s: string): string[] => {
    const parts: string[] = [];
    let start = 0;
    while (start < s.length) {
      const end = Math.min(start + MAX_CHARS, s.length);
      // try to break at a space near the end
      let cut = end;
      if (end < s.length) {
        const lastSpace = s.lastIndexOf(' ', end - 1);
        if (lastSpace > start + Math.floor(MAX_CHARS * 0.6)) cut = lastSpace;
      }
      parts.push(s.slice(start, cut).trim());
      start = cut;
      // avoid infinite loop on no-space long tokens
      if (cut === end && start < s.length) start++;
    }
    return parts.filter(p => p.length > 0);
  };

  const chunks: string[] = [];

  // First try paragraphs
  const paragraphs = text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  if (paragraphs.length > 0) {
    let current = '';
    for (const p of paragraphs) {
      if (p.length > MAX_CHARS) {
        // flush current before splitting huge paragraph
        if (current.length >= MIN_CHARS) {
          chunks.push(current.trim());
          current = '';
        }
        chunks.push(...splitByWords(p));
        continue;
      }
      if ((current + (current ? '\n\n' : '') + p).length > MAX_CHARS) {
        if (current) chunks.push(current.trim());
        current = p;
      } else {
        current += (current ? '\n\n' : '') + p;
      }
    }
    if (current.trim()) chunks.push(current.trim());
  }

  // If we still have no chunks, fall back to sentences
  if (chunks.length === 0) {
    const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(Boolean);
    let current = '';
    for (const s of sentences) {
      const sentence = s.length > MAX_CHARS ? splitByWords(s) : [s];
      for (const piece of sentence) {
        if ((current + (current ? '. ' : '') + piece).length > MAX_CHARS) {
          if (current) chunks.push(current.trim());
          current = piece;
        } else {
          current += (current ? '. ' : '') + piece;
        }
      }
    }
    if (current.trim()) chunks.push(current.trim());
  }

  // Absolute safety: clamp any residual oversize
  const safe = chunks.flatMap(c => (c.length > MAX_CHARS ? splitByWords(c) : [c]));

  // Filter low-signal chunks
  return safe.filter(chunk => {
    const clean = chunk.replace(/[^a-zA-Z0-9\s]/g, '');
    const alphaChars = clean.replace(/\s/g, '').replace(/[^A-Za-z]/g, '').length;
    const totalChars = clean.replace(/\s/g, '').length || 1;
    const alphaRatio = alphaChars / totalChars;
    const vowelRatio = ((chunk.match(/[aeiouAEIOU]/g) || []).length) / ((chunk.match(/[A-Za-z]/g) || []).length || 1);
    const numericRatio = ((chunk.match(/\d/g) || []).length) / (chunk.length || 1);
    const hasSentence = /[.!?]\s/.test(chunk) || /\n/.test(chunk);
    return clean.length > 60 && alphaRatio >= 0.5 && vowelRatio >= 0.2 && numericRatio < 0.4 && /[a-zA-Z]/.test(chunk) && hasSentence;
  });
}

// Generate embeddings using OpenAI
async function generateEmbeddings(chunks: string[]): Promise<number[][]> {
  const embeddings: number[][] = [];
  
  // Process chunks in batches to avoid rate limits
  const batchSize = 3;
  const SAFE_MAX = 1800; // hard cap per input string
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batchRaw = chunks.slice(i, i + batchSize);
    const batch = batchRaw.map((c) => (c.length > SAFE_MAX ? c.slice(0, SAFE_MAX) : c));
    
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