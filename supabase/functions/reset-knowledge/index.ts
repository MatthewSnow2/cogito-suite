import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.55.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ResetRequest {
  customGptId: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { customGptId }: ResetRequest = await req.json();

    if (!customGptId) {
      return new Response(JSON.stringify({ success: false, error: 'customGptId is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Resetting knowledge for custom_gpt_id:', customGptId);

    // 1) Collect KB rows to remove files
    const { data: kbRows, error: kbFetchErr } = await supabase
      .from('knowledge_base')
      .select('id, upload_path')
      .eq('custom_gpt_id', customGptId);

    if (kbFetchErr) throw kbFetchErr;

    const paths = (kbRows || [])
      .map((r) => r.upload_path)
      .filter((p): p is string => !!p);

    // 2) Delete storage files
    let removedFiles: string[] = [];
    if (paths.length > 0) {
      const { data: removed, error: storageErr } = await supabase
        .storage
        .from('documents')
        .remove(paths);
      if (storageErr) {
        console.error('Storage remove error:', storageErr);
      } else {
        removedFiles = removed?.map((r: any) => r.path) || [];
      }
    }

    // 3) Delete document chunks
    const { data: deletedChunks, error: chunksErr } = await supabase
      .from('document_chunks')
      .delete()
      .eq('custom_gpt_id', customGptId)
      .select('id');

    if (chunksErr) throw chunksErr;

    // 4) Delete KB rows
    const { data: deletedKb, error: kbDelErr } = await supabase
      .from('knowledge_base')
      .delete()
      .eq('custom_gpt_id', customGptId)
      .select('id');

    if (kbDelErr) throw kbDelErr;

    return new Response(JSON.stringify({
      success: true,
      deleted: {
        chunks: deletedChunks?.length || 0,
        knowledgeBaseRows: deletedKb?.length || 0,
        storageFiles: removedFiles.length,
      },
      removedFiles,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Error in reset-knowledge function:', error);
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
