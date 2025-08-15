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
import { Bot, Lightbulb, FileText, Wand2, Upload, X, Loader2 } from 'lucide-react';

const CreateGPT = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    instructions: '',
  });
  const [uploadedFiles, setUploadedFiles] = useState<Array<{id: string, name: string, size: number}>>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast({
        title: "Error",
        description: "Please upload a PDF file only",
        variant: "destructive",
      });
      return;
    }

    const tempId = Date.now().toString();
    setUploadedFiles(prev => [...prev, {
      id: tempId,
      name: file.name,
      size: file.size
    }]);

    // Reset file input
    e.target.value = '';
  };

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.id !== fileId));
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
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

        {/* Knowledge Base */}
        <Card className="bg-card/50 backdrop-blur-glass border-border/50 shadow-card">
          <CardHeader>
            <div className="flex items-center space-x-3">
              <Upload className="h-6 w-6 text-primary-glow" />
              <div>
                <CardTitle>Knowledge Base (Optional)</CardTitle>
                <CardDescription>
                  Upload PDF files to enhance your GPT's knowledge. You can also add these later.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* File Upload */}
            <div className="space-y-4">
              <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-4" />
                <div className="space-y-2">
                  <p className="text-sm text-foreground">
                    Upload PDF files to add knowledge to your GPT
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Supported format: PDF (max 10MB) - Optional for now
                  </p>
                </div>
                <div className="mt-4">
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={handleFileUpload}
                    disabled={uploading}
                    className="hidden"
                    id="pdf-upload"
                  />
                  <Label
                    htmlFor="pdf-upload"
                    className="cursor-pointer"
                  >
                    <Button 
                      type="button"
                      variant="premium"
                      disabled={uploading}
                      asChild
                    >
                      <span>
                        {uploading ? (
                          <>
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            Uploading...
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 mr-2" />
                            Upload PDF
                          </>
                        )}
                      </span>
                    </Button>
                  </Label>
                </div>
              </div>
            </div>

            {/* Uploaded Files Preview */}
            {uploadedFiles.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-foreground">Files to Upload</h4>
                <div className="space-y-2">
                  {uploadedFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <FileText className="h-5 w-5 text-primary" />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {file.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(file.size)} • Ready to upload
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeFile(file.id)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  Note: Files will be uploaded after creating the GPT. You can also add files later from the edit page.
                </p>
              </div>
            )}
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