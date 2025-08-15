import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Trash2, Loader2 } from 'lucide-react';

interface ResetKnowledgeProps {
  customGptId: string;
  onReset?: () => void;
}

export const ResetKnowledge = ({ customGptId, onReset }: ResetKnowledgeProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('reset-knowledge', {
        body: { customGptId },
      });

      if (error) throw error;

      if (data.success) {
        toast({
          title: "Knowledge Base Reset",
          description: `Deleted ${data.deleted.chunks} chunks, ${data.deleted.knowledgeBaseRows} files, and ${data.deleted.storageFiles} storage items.`,
        });
        onReset?.();
      } else {
        throw new Error(data.error || 'Reset failed');
      }
    } catch (error: any) {
      toast({
        title: "Reset Failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="border-destructive">
      <CardHeader>
        <CardTitle className="text-destructive flex items-center gap-2">
          <Trash2 className="h-5 w-5" />
          Reset Knowledge Base
        </CardTitle>
        <CardDescription>
          This will permanently delete all uploaded files, embeddings, and knowledge data for this GPT.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button 
          variant="destructive" 
          onClick={handleReset}
          disabled={loading}
          className="w-full"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Resetting...
            </>
          ) : (
            <>
              <Trash2 className="h-4 w-4 mr-2" />
              Reset Everything
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};