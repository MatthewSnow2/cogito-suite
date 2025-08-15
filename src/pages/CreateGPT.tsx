import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Bot, Lightbulb, FileText, Wand2 } from 'lucide-react';

const CreateGPT = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    instructions: '',
  });
  const [loading, setLoading] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('custom_gpts')
        .insert({
          user_id: user.id,
          name: formData.name,
          description: formData.description,
          instructions: formData.instructions,
        })
        .select()
        .single();

      if (error) throw error;

      toast({
        title: "Success!",
        description: "Your custom GPT has been created successfully.",
      });

      navigate(`/chat?gpt=${data.id}`);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to create GPT",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const exampleInstructions = `You are a helpful assistant specialized in [DOMAIN]. 

Your key characteristics:
- [Personality trait 1]
- [Personality trait 2]
- [Expertise area]

When responding:
- Always be [tone/style]
- Focus on [specific approach]
- If you don't know something, [how to handle uncertainty]

Example interaction style:
[Provide a brief example of how the assistant should respond]`;

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="text-center space-y-4">
        <div className="flex justify-center">
          <div className="p-4 bg-gradient-primary rounded-2xl shadow-glow">
            <Wand2 className="h-8 w-8 text-primary-foreground" />
          </div>
        </div>
        <h1 className="text-4xl font-bold text-foreground">Create Custom GPT</h1>
        <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
          Build your own AI assistant with custom instructions and personality. 
          Define how it should behave and what it should know.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic Information */}
        <Card className="bg-card/50 backdrop-blur-glass border-border/50 shadow-card">
          <CardHeader>
            <div className="flex items-center space-x-3">
              <Bot className="h-6 w-6 text-primary" />
              <div>
                <CardTitle>Basic Information</CardTitle>
                <CardDescription>
                  Give your GPT a name and description that reflects its purpose.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name">GPT Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="e.g., Marketing Assistant, Code Reviewer, Writing Coach"
                required
                className="bg-input border-border"
              />
              <p className="text-xs text-muted-foreground">
                Choose a clear, descriptive name for your GPT assistant.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="A brief description of what this GPT does and how it helps"
                className="bg-input border-border"
              />
              <p className="text-xs text-muted-foreground">
                Optional: A short summary that will be displayed in your dashboard.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Instructions */}
        <Card className="bg-card/50 backdrop-blur-glass border-border/50 shadow-card">
          <CardHeader>
            <div className="flex items-center space-x-3">
              <FileText className="h-6 w-6 text-accent" />
              <div>
                <CardTitle>Custom Instructions</CardTitle>
                <CardDescription>
                  Define your GPT's personality, expertise, and behavior patterns.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="instructions">Instructions *</Label>
              <Textarea
                id="instructions"
                value={formData.instructions}
                onChange={(e) => handleInputChange('instructions', e.target.value)}
                placeholder={exampleInstructions}
                required
                className="bg-input border-border min-h-[300px] font-mono text-sm"
              />
              <p className="text-xs text-muted-foreground">
                Be specific about how your GPT should behave, its expertise areas, 
                and response style. The more detailed, the better it will perform.
              </p>
            </div>

            {/* Tips */}
            <div className="bg-muted/30 p-4 rounded-lg">
              <div className="flex items-start space-x-3">
                <Lightbulb className="h-5 w-5 text-primary-glow mt-0.5" />
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-foreground">
                    Tips for great instructions:
                  </h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    <li>• Define the GPT's role and expertise clearly</li>
                    <li>• Specify the tone and communication style</li>
                    <li>• Include examples of ideal responses</li>
                    <li>• Set boundaries on what it should/shouldn't do</li>
                    <li>• Mention any specific formats or structures to follow</li>
                  </ul>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Actions */}
        <div className="flex items-center justify-end space-x-4">
          <Button 
            type="button" 
            variant="outline" 
            onClick={() => navigate('/')}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            variant="premium" 
            size="lg"
            disabled={loading || !formData.name.trim() || !formData.instructions.trim()}
          >
            {loading ? 'Creating...' : 'Create GPT'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CreateGPT;