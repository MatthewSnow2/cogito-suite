import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Bot, MessageSquare, FileText, Clock, MoreVertical } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';

interface CustomGPT {
  id: string;
  name: string;
  description: string;
  instructions: string;
  created_at: string;
  updated_at: string;
}

const Dashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [gpts, setGpts] = useState<CustomGPT[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalGpts: 0,
    totalConversations: 0,
    totalFiles: 0,
  });

  useEffect(() => {
    if (user) {
      fetchGPTs();
      fetchStats();
    }
  }, [user]);

  const fetchGPTs = async () => {
    try {
      const { data, error } = await supabase
        .from('custom_gpts')
        .select('*')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setGpts(data || []);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load your GPTs",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const [gptsResult, conversationsResult, filesResult] = await Promise.all([
        supabase.from('custom_gpts').select('id', { count: 'exact', head: true }),
        supabase.from('conversations').select('id', { count: 'exact', head: true }),
        supabase.from('knowledge_base').select('id', { count: 'exact', head: true }),
      ]);

      setStats({
        totalGpts: gptsResult.count || 0,
        totalConversations: conversationsResult.count || 0,
        totalFiles: filesResult.count || 0,
      });
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  const handleDeleteGPT = async (id: string) => {
    try {
      const { error } = await supabase
        .from('custom_gpts')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setGpts(prev => prev.filter(gpt => gpt.id !== id));
      toast({
        title: "Success",
        description: "GPT deleted successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to delete GPT",
        variant: "destructive",
      });
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="space-y-6">
          <div className="h-8 bg-muted rounded w-1/3 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[...Array(3)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardContent className="p-6">
                  <div className="h-4 bg-muted rounded w-2/3 mb-2" />
                  <div className="h-8 bg-muted rounded w-1/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Dashboard</h1>
          <p className="text-muted-foreground mt-1">
            Welcome back! Manage your custom GPT assistants.
          </p>
        </div>
        <Link to="/create">
          <Button variant="hero" size="lg">
            <Plus className="h-5 w-5" />
            Create New GPT
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="bg-card/50 backdrop-blur-glass border-border/50 shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Bot className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total GPTs</p>
                <p className="text-2xl font-bold text-foreground">{stats.totalGpts}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-glass border-border/50 shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-accent/10 rounded-lg">
                <MessageSquare className="h-6 w-6 text-accent" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Conversations</p>
                <p className="text-2xl font-bold text-foreground">{stats.totalConversations}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 backdrop-blur-glass border-border/50 shadow-card">
          <CardContent className="p-6">
            <div className="flex items-center space-x-4">
              <div className="p-3 bg-primary-glow/10 rounded-lg">
                <FileText className="h-6 w-6 text-primary-glow" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Knowledge Files</p>
                <p className="text-2xl font-bold text-foreground">{stats.totalFiles}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* GPTs Grid */}
      <div>
        <h2 className="text-2xl font-semibold text-foreground mb-6">Your Custom GPTs</h2>
        
        {gpts.length === 0 ? (
          <Card className="bg-card/50 backdrop-blur-glass border-border/50 shadow-card">
            <CardContent className="p-12 text-center">
              <Bot className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">No GPTs yet</h3>
              <p className="text-muted-foreground mb-6">
                Create your first custom GPT assistant to get started.
              </p>
              <Link to="/create">
                <Button variant="premium" size="lg">
                  <Plus className="h-5 w-5" />
                  Create Your First GPT
                </Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {gpts.map((gpt) => (
              <Card key={gpt.id} className="bg-card/50 backdrop-blur-glass border-border/50 shadow-card hover:shadow-elegant transition-smooth">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="p-2 bg-gradient-primary rounded-lg">
                        <Bot className="h-5 w-5 text-primary-foreground" />
                      </div>
                      <div>
                        <CardTitle className="text-lg text-foreground">{gpt.name}</CardTitle>
                        <CardDescription className="text-sm">
                          Updated {formatDate(gpt.updated_at)}
                        </CardDescription>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link to={`/chat?gpt=${gpt.id}`}>
                            <MessageSquare className="h-4 w-4 mr-2" />
                            Chat
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                          <Link to={`/edit/${gpt.id}`}>
                            Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDeleteGPT(gpt.id)}
                          className="text-destructive"
                        >
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-muted-foreground text-sm mb-4">
                    {gpt.description || 'No description provided.'}
                  </p>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center text-xs text-muted-foreground">
                      <Clock className="h-3 w-3 mr-1" />
                      {formatDate(gpt.created_at)}
                    </div>
                    <Link to={`/chat?gpt=${gpt.id}`}>
                      <Button variant="premium" size="sm">
                        <MessageSquare className="h-4 w-4 mr-1" />
                        Chat
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;