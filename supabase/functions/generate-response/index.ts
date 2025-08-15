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

    // Search for relevant knowledge base content
    const relevantContent = await searchKnowledgeBase(queryEmbedding, customGptId);
    console.log('Found relevant content chunks:', relevantContent.length);

    // Build system message with instructions and context
    let systemMessage = gptInstructions;
    
    if (relevantContent.length > 0) {
      systemMessage += `\n\nRelevant information from your knowledge base:\n${relevantContent.join('\n\n')}`;
      console.log('Added knowledge base context to system message');
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
async function searchKnowledgeBase(queryEmbedding: number[], customGptId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase.rpc('match_documents', {
      query_embedding: queryEmbedding,
      custom_gpt_id: customGptId,
      match_threshold: 0.3,
      match_count: 5
    });

    if (error) {
      console.error('Knowledge base search error:', error);
      return [];
    }

    return data?.map((chunk: any) => chunk.content) || [];
  } catch (error) {
    console.error('Error searching knowledge base:', error);
    return [];
  }
}