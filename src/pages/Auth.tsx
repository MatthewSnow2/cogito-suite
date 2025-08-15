import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Bot, Sparkles, Zap, Brain } from 'lucide-react';

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        toast({
          title: "Welcome back!",
          description: "You've been signed in successfully.",
        });
        window.location.href = '/';
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const redirectUrl = `${window.location.origin}/`;
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        toast({
          title: "Welcome!",
          description: "Your account has been created successfully.",
        });
        window.location.href = '/';
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-hero flex items-center justify-center p-4">
      <div className="w-full max-w-6xl grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
        
        {/* Hero Section */}
        <div className="text-center lg:text-left space-y-6">
          <div className="flex justify-center lg:justify-start">
            <div className="flex items-center space-x-2">
              <Bot className="h-10 w-10 text-primary-glow" />
              <h1 className="text-3xl font-bold text-foreground">GPT Studio</h1>
            </div>
          </div>
          
          <h2 className="text-4xl lg:text-6xl font-bold text-foreground leading-tight">
            Create Your Own
            <span className="text-transparent bg-clip-text bg-gradient-primary block">
              AI Assistants
            </span>
          </h2>
          
          <p className="text-xl text-muted-foreground max-w-lg">
            Build custom GPT models with your own knowledge base. Upload documents, 
            define instructions, and create powerful AI assistants tailored to your needs.
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-lg">
            <div className="flex items-center space-x-2 text-foreground">
              <Sparkles className="h-5 w-5 text-primary-glow" />
              <span className="text-sm">Custom Instructions</span>
            </div>
            <div className="flex items-center space-x-2 text-foreground">
              <Brain className="h-5 w-5 text-primary-glow" />
              <span className="text-sm">Knowledge Base</span>
            </div>
            <div className="flex items-center space-x-2 text-foreground">
              <Zap className="h-5 w-5 text-primary-glow" />
              <span className="text-sm">Real-time Chat</span>
            </div>
          </div>
        </div>

        {/* Auth Form */}
        <div className="flex justify-center lg:justify-end">
          <Card className="w-full max-w-md bg-card/50 backdrop-blur-glass border-border/50 shadow-elegant">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold">Get Started</CardTitle>
              <CardDescription>
                Sign in to your account or create a new one
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="signin" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="signin">Sign In</TabsTrigger>
                  <TabsTrigger value="signup">Sign Up</TabsTrigger>
                </TabsList>
                
                <TabsContent value="signin">
                  <form onSubmit={handleSignIn} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signin-email">Email</Label>
                      <Input
                        id="signin-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email"
                        required
                        className="bg-input border-border"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signin-password">Password</Label>
                      <Input
                        id="signin-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Enter your password"
                        required
                        className="bg-input border-border"
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full" 
                      variant="premium"
                      size="lg"
                      disabled={loading}
                    >
                      {loading ? 'Signing In...' : 'Sign In'}
                    </Button>
                  </form>
                </TabsContent>
                
                <TabsContent value="signup">
                  <form onSubmit={handleSignUp} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="signup-email">Email</Label>
                      <Input
                        id="signup-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter your email"
                        required
                        className="bg-input border-border"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="signup-password">Password</Label>
                      <Input
                        id="signup-password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Create a password"
                        required
                        className="bg-input border-border"
                      />
                    </div>
                    <Button 
                      type="submit" 
                      className="w-full" 
                      variant="premium"
                      size="lg"
                      disabled={loading}
                    >
                      {loading ? 'Creating Account...' : 'Create Account'}
                    </Button>
                  </form>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Auth;