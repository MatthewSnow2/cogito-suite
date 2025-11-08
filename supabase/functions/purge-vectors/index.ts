import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';
import { getCorsHeaders, handleCorsPreflightRequest } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface PurgeRequest {
  customGptId: string;
  knowledgeBaseId?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest(req);
  }

  const corsHeaders = getCorsHeaders(req);

  try {
    const { customGptId, knowledgeBaseId }: PurgeRequest = await req.json();

    if (!customGptId) {
      return new Response(JSON.stringify({ success: false, error: 'customGptId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Purging vectors for custom_gpt_id:', customGptId, knowledgeBaseId ? `and knowledge_base_id ${knowledgeBaseId}` : '');

    let query = supabase.from('document_chunks').delete();
    query = query.eq('custom_gpt_id', customGptId);
    if (knowledgeBaseId) {
      query = query.eq('knowledge_base_id', knowledgeBaseId);
    }

    // Return the ids of deleted chunks to count
    const { data: deleted, error } = await query.select('id');

    if (error) {
      console.error('Error deleting document chunks:', error);
      throw error;
    }

    const deletedCount = deleted?.length || 0;
    console.log(`Deleted ${deletedCount} chunks`);

    return new Response(JSON.stringify({ success: true, deletedCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in purge-vectors function:', error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
