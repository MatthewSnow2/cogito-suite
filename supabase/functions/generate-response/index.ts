import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface GenerateRequest {
  message: string;
  conversationId: string;
  customGptId: string;
  gptInstructions: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { message, conversationId, customGptId, gptInstructions }: GenerateRequest = await req.json();
    
    console.log('Generating response for:', { customGptId, conversationId });

    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Generate embedding for the user's message
    const queryEmbedding = await generateQueryEmbedding(message);
    console.log('Generated query embedding');

    // Check if user is explicitly asking about knowledge/documents
    const isKnowledgeQuery = /\b(knowledge|document|file|statement|pdf|uploaded|reference)\b/i.test(message);
    console.log('Is knowledge query:', isKnowledgeQuery);

    // Search for relevant knowledge base content
    const relevantContent = await searchKnowledgeBase(queryEmbedding, customGptId, isKnowledgeQuery);
    console.log('Found relevant content chunks:', relevantContent.length);

    // Build system message with instructions and context
    let systemMessage = gptInstructions;
    
    // Always inform about knowledge search when user asks about knowledge/documents
    if (isKnowledgeQuery) {
      systemMessage += `\n\n🔍 KNOWLEDGE BASE SEARCH PERFORMED: I searched your uploaded documents for relevant information.`;
    }
    
    if (relevantContent.length > 0) {
      systemMessage += `\n\nRelevant information from your knowledge base:\n${relevantContent.join('\n\n')}`;
      console.log('Added knowledge base context to system message');
    } else if (isKnowledgeQuery) {
      const { data: kbFiles } = await supabase
        .from('knowledge_base')
        .select('file_name, created_at, file_size, processed_at')
        .eq('custom_gpt_id', customGptId)
        .order('created_at', { ascending: false })
        .limit(5);
      if (kbFiles && kbFiles.length > 0) {
        const fileDetails = kbFiles.map((f: any) => {
          const uploadDate = new Date(f.created_at).toLocaleDateString();
          const fileSize = f.file_size ? `${(f.file_size / 1024).toFixed(1)}KB` : 'Unknown size';
          const status = f.processed_at ? 'Processed' : 'Processing';
          return `• ${f.file_name} (${fileSize}, uploaded ${uploadDate}, ${status})`;
        }).join('\n');
        systemMessage += `\n\n⚠️ NO RELEVANT CONTENT FOUND: I searched your uploaded documents but couldn't find text that matches your query.\n\nYour uploaded files:\n${fileDetails}\n\nThis may be because: 1) The PDF is scanned/image-based rather than text-searchable, 2) The content doesn't closely match your question, or 3) The document needs to be re-uploaded as a text-based PDF.`;
        console.log('Added detailed file information for knowledge query');
      }
    } else {
      const { data: kbFiles } = await supabase
        .from('knowledge_base')
        .select('file_name')
        .eq('custom_gpt_id', customGptId)
        .order('created_at', { ascending: false })
        .limit(5);
      if (kbFiles && kbFiles.length > 0) {
        const fileList = kbFiles.map((f: any) => f.file_name).join(', ');
        systemMessage += `\n\nNote: Uploaded documents available: ${fileList}. If the user's question refers to these files, acknowledge their presence and offer to search them.`;
        console.log('Added fallback file list to system message');
      }
    }

    // Build messages for OpenAI
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: systemMessage
      },
      {
        role: 'user',
        content: message
      }
    ];

    console.log('Calling OpenAI API...');

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-2025-08-07',
        messages: messages,
        max_completion_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', errorData);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    console.log('OpenAI response received');

    const assistantMessage = data.choices[0].message.content;

    return new Response(JSON.stringify({ 
      content: assistantMessage,
      success: true,
      usedKnowledgeBase: relevantContent.length > 0
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in generate-response function:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      success: false 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Generate embedding for search query
async function generateQueryEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error('Failed to generate query embedding');
  }

  const data = await response.json();
  return data.data[0].embedding;
}

// Search knowledge base for relevant content
async function searchKnowledgeBase(queryEmbedding: number[], customGptId: string, isKnowledgeQuery: boolean = false): Promise<string[]> {
  try {
    // Use more aggressive search when user explicitly asks about knowledge
    const threshold = isKnowledgeQuery ? 0.1 : 0.3;
    const count = isKnowledgeQuery ? 8 : 5;
    
    console.log(`Searching with threshold: ${threshold}, count: ${count}`);
    
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      custom_gpt_id: customGptId,
      match_threshold: threshold,
      match_count: count
    });

    if (error) {
      console.error('Knowledge base search error:', error);
      return [];
    }

    const results = data?.map((chunk: any) => `[Similarity: ${(chunk.similarity * 100).toFixed(1)}%] ${chunk.content}`) || [];
    console.log(`Knowledge search returned ${results.length} chunks`);
    
    return results;
  } catch (error) {
    console.error('Error searching knowledge base:', error);
    return [];
  }
}