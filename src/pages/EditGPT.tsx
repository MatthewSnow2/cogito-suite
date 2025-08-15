import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Bot, FileText, Upload, X, Loader2 } from 'lucide-react';

interface CustomGPT {
  id: string;
  name: string;
  description: string;
  instructions: string;
}

interface KnowledgeFile {
  id: string;
  file_name: string;
  file_size: number;
  upload_path: string | null;
  created_at: string;
  processed_at: string | null;
}

const EditGPT = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [gpt, setGpt] = useState<CustomGPT | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    instructions: '',
  });
  const [knowledgeFiles, setKnowledgeFiles] = useState<KnowledgeFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (id && user) {
      fetchGPT();
      fetchKnowledgeFiles();
    }
  }, [id, user]);

  const fetchGPT = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .from('custom_gpts')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      setGpt(data);
      setFormData({
        name: data.name,
        description: data.description || '',
        instructions: data.instructions,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load GPT details",
        variant: "destructive",
      });
      navigate('/');
    } finally {
      setLoading(false);
    }
  };

  const fetchKnowledgeFiles = async () => {
    if (!id) return;

    try {
      const { data, error } = await supabase
        .from('knowledge_base')
        .select('id, file_name, file_size, upload_path, created_at, processed_at')
        .eq('custom_gpt_id', id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setKnowledgeFiles(data || []);
    } catch (error: any) {
      console.error('Error fetching knowledge files:', error);
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !user) return;

    setSaving(true);
    try {
      const { error } = await supabase
        .from('custom_gpts')
        .update({
          name: formData.name,
          description: formData.description,
          instructions: formData.instructions,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: "Success!",
        description: "Your GPT has been updated successfully.",
      });

      navigate('/');
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to update GPT",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;

    if (file.type !== 'application/pdf') {
      toast({
        title: "Error",
        description: "Please upload a PDF file only",
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    try {
      // Upload file to Supabase Storage
      const fileExt = 'pdf';
      const fileName = `${Date.now()}_${file.name}`;
      const filePath = `knowledge/${id}/${fileName}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, file, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        throw new Error(`Storage upload failed: ${uploadError.message}`);
      }

      // Save file record to database
      const { data: kbRow, error: dbError } = await supabase
        .from('knowledge_base')
        .insert({
          custom_gpt_id: id,
          file_name: file.name,
          file_size: file.size,
          upload_path: filePath,
        })
        .select()
        .single();

      if (dbError) {
        console.error('DB insert error (knowledge_base):', dbError);
        throw new Error(`Database insert failed: ${dbError.message}`);
      }

      toast({
        title: "Success!",
        description: "PDF uploaded successfully. Processing started...",
      });

      // Trigger PDF processing in background
      processePDFInBackground(kbRow.id, id, filePath, file.name);

      fetchKnowledgeFiles();
      
      // Reset file input
      e.target.value = '';
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to upload file",
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  const processePDFInBackground = async (knowledgeBaseId: string, customGptId: string, filePath: string, fileName: string) => {
    try {
      console.log('Starting PDF processing...');
      const { data, error } = await supabase.functions.invoke('process-pdf', {
        body: {
          knowledgeBaseId,
          customGptId,
          filePath,
          fileName,
        },
      });

      if (error) {
        console.error('PDF processing error:', error);
        toast({
          title: "Processing Error",
          description: "Failed to process PDF content. File uploaded but may not be searchable.",
          variant: "destructive",
        });
        return;
      }

      console.log('PDF processing completed:', data);
      toast({
        title: "Processing Complete!",
        description: `PDF processed successfully. ${data.chunksProcessed} text chunks extracted.`,
      });

      // Refresh the file list to show updated status
      fetchKnowledgeFiles();
    } catch (error: any) {
      console.error('Background processing error:', error);
      toast({
        title: "Processing Error",
        description: "Failed to process PDF in background.",
        variant: "destructive",
      });
    }
  };

  const handleDeleteFile = async (fileId: string, filePath: string) => {
    try {
      // Delete from storage
      const { error: storageError } = await supabase.storage
        .from('documents')
        .remove([filePath]);

      if (storageError) throw storageError;

      // Delete from database
      const { error: dbError } = await supabase
        .from('knowledge_base')
        .delete()
        .eq('id', fileId);

      if (dbError) throw dbError;

      toast({
        title: "Success",
        description: "File deleted successfully",
      });

      fetchKnowledgeFiles();
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to delete file",
        variant: "destructive",
      });
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-4">
          <Bot className="h-12 w-12 text-primary mx-auto animate-pulse" />
          <p className="text-muted-foreground">Loading GPT details...</p>
        </div>
      </div>
    );
  }

  if (!gpt) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-2xl font-bold text-foreground mb-4">GPT Not Found</h1>
        <Button onClick={() => navigate('/')}>Return to Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Edit GPT</h1>
          <p className="text-muted-foreground mt-1">
            Update your custom GPT assistant settings and knowledge base.
          </p>
        </div>
        <Button variant="outline" onClick={() => navigate('/')}>
          Back to Dashboard
        </Button>
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
                  Update your GPT's name and description.
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
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="A brief description of what this GPT does"
                className="bg-input border-border"
              />
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
                required
                className="bg-input border-border min-h-[300px] font-mono text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Knowledge Base */}
        <Card className="bg-card/50 backdrop-blur-glass border-border/50 shadow-card">
          <CardHeader>
            <div className="flex items-center space-x-3">
              <Upload className="h-6 w-6 text-primary-glow" />
              <div>
                <CardTitle>Knowledge Base</CardTitle>
                <CardDescription>
                  Upload PDF files to enhance your GPT's knowledge.
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
                    Supported format: PDF (max 10MB)
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

            {/* Uploaded Files */}
            {knowledgeFiles.length > 0 && (
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-foreground">Uploaded Files</h4>
                <div className="space-y-2">
                  {knowledgeFiles.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                    >
                      <div className="flex items-center space-x-3">
                        <FileText className="h-5 w-5 text-primary" />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {file.file_name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatFileSize(file.file_size)} • 
                            {file.processed_at ? ' Processed' : ' Processing...'}
                          </p>
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteFile(file.id, file.upload_path || '')}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
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
            disabled={saving}
          >
            Cancel
          </Button>
          <Button 
            type="submit" 
            variant="premium" 
            size="lg"
            disabled={saving || !formData.name.trim() || !formData.instructions.trim()}
          >
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Changes'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default EditGPT;