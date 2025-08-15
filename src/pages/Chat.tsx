import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { Send, Bot, User, Plus, MessageSquare } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

interface Conversation {
  id: string;
  title: string;
  created_at: string;
  custom_gpt_id: string;
}

interface CustomGPT {
  id: string;
  name: string;
  description: string;
}

const Chat = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const [selectedGPT, setSelectedGPT] = useState<string>('');
  const [gpts, setGpts] = useState<CustomGPT[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [gptLoading, setGptLoading] = useState(true);

  useEffect(() => {
    if (user) {
      fetchGPTs();
    }
  }, [user]);

  useEffect(() => {
    const gptId = searchParams.get('gpt');
    if (gptId && gpts.length > 0) {
      setSelectedGPT(gptId);
    }
  }, [searchParams, gpts]);

  useEffect(() => {
    if (selectedGPT) {
      fetchConversations();
    }
  }, [selectedGPT]);

  useEffect(() => {
    if (selectedConversation) {
      fetchMessages();
    }
  }, [selectedConversation]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const fetchGPTs = async () => {
    try {
      const { data, error } = await supabase
        .from('custom_gpts')
        .select('id, name, description')
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
      setGptLoading(false);
    }
  };

  const fetchConversations = async () => {
    if (!selectedGPT) return;

    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('custom_gpt_id', selectedGPT)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setConversations(data || []);
      
      // Auto-select first conversation if exists
      if (data && data.length > 0 && !selectedConversation) {
        setSelectedConversation(data[0].id);
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load conversations",
        variant: "destructive",
      });
    }
  };

  const fetchMessages = async () => {
    if (!selectedConversation) return;

    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', selectedConversation)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setMessages((data || []) as Message[]);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to load messages",
        variant: "destructive",
      });
    }
  };

  const createNewConversation = async () => {
    if (!selectedGPT || !user) return;

    try {
      const { data, error } = await supabase
        .from('conversations')
        .insert({
          custom_gpt_id: selectedGPT,
          user_id: user.id,
          title: 'New Conversation',
        })
        .select()
        .single();

      if (error) throw error;
      
      setConversations(prev => [data, ...prev]);
      setSelectedConversation(data.id);
      setMessages([]);
    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to create new conversation",
        variant: "destructive",
      });
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedConversation || loading) return;

    const userMessage = newMessage.trim();
    setNewMessage('');
    setLoading(true);

    try {
      // Add user message to UI immediately
      const tempUserMessage: Message = {
        id: 'temp-user',
        role: 'user',
        content: userMessage,
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev, tempUserMessage]);

      // Save user message to database
      const { error: userError } = await supabase
        .from('messages')
        .insert({
          conversation_id: selectedConversation,
          role: 'user',
          content: userMessage,
        });

      if (userError) throw userError;

      // Add assistant message placeholder
      const tempAssistantMessage: Message = {
        id: 'temp-assistant',
        role: 'assistant',
        content: '...',
        created_at: new Date().toISOString(),
      };
      setMessages(prev => [...prev.filter(m => m.id !== 'temp-user'), tempUserMessage, tempAssistantMessage]);

      // Get GPT instructions
      const { data: gptData, error: gptError } = await supabase
        .from('custom_gpts')
        .select('instructions')
        .eq('id', selectedGPT)
        .single();

      if (gptError) throw gptError;

      // Call the OpenAI edge function
      const response = await supabase.functions.invoke('generate-response', {
        body: {
          message: userMessage,
          conversationId: selectedConversation,
          customGptId: selectedGPT,
          gptInstructions: gptData.instructions,
        },
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to generate response');
      }

      const { content: assistantResponse } = response.data;

      // Save assistant response to database
      const { error: assistantError } = await supabase
        .from('messages')
        .insert({
          conversation_id: selectedConversation,
          role: 'assistant',
          content: assistantResponse,
        });

      if (assistantError) throw assistantError;

      // Update the temporary message with real response
      setMessages(prev => 
        prev.map(m => 
          m.id === 'temp-assistant' 
            ? { ...m, content: assistantResponse }
            : m
        )
      );

    } catch (error: any) {
      toast({
        title: "Error",
        description: "Failed to send message",
        variant: "destructive",
      });
      setMessages(prev => prev.filter(m => !m.id.startsWith('temp-')));
    } finally {
      setLoading(false);
    }
  };

  if (gptLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center space-y-4">
          <Bot className="h-12 w-12 text-primary mx-auto animate-pulse" />
          <p className="text-muted-foreground">Loading your GPTs...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-chat-background">
      {/* Sidebar */}
      <div className="w-80 bg-sidebar border-r border-sidebar-border flex flex-col">
        {/* GPT Selector */}
        <div className="p-4 border-b border-sidebar-border">
          <Select value={selectedGPT} onValueChange={setSelectedGPT}>
            <SelectTrigger className="bg-sidebar-accent border-sidebar-border">
              <SelectValue placeholder="Select a GPT" />
            </SelectTrigger>
            <SelectContent>
              {gpts.map((gpt) => (
                <SelectItem key={gpt.id} value={gpt.id}>
                  <div className="flex items-center space-x-2">
                    <Bot className="h-4 w-4" />
                    <span>{gpt.name}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Conversations */}
        <div className="flex-1 flex flex-col">
          <div className="p-4 border-b border-sidebar-border">
            <Button 
              onClick={createNewConversation}
              disabled={!selectedGPT}
              className="w-full justify-start"
              variant="premium"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Conversation
            </Button>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2 space-y-2">
              {conversations.map((conversation) => (
                <Card 
                  key={conversation.id}
                  className={`cursor-pointer transition-smooth ${
                    selectedConversation === conversation.id
                      ? 'bg-sidebar-accent border-sidebar-primary'
                      : 'bg-transparent border-transparent hover:bg-sidebar-accent/50'
                  }`}
                  onClick={() => setSelectedConversation(conversation.id)}
                >
                  <CardContent className="p-3">
                    <div className="flex items-center space-x-2">
                      <MessageSquare className="h-4 w-4 text-sidebar-foreground" />
                      <span className="text-sm text-sidebar-foreground truncate">
                        {conversation.title}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 flex flex-col">
        {selectedGPT && selectedConversation ? (
          <>
            {/* Messages */}
            <ScrollArea className="flex-1 p-6">
              <div className="max-w-4xl mx-auto space-y-6">
                {messages.map((message, index) => (
                  <div
                    key={`${message.id}-${index}`}
                    className={`flex items-start space-x-4 ${
                      message.role === 'user' ? 'justify-end' : 'justify-start'
                    }`}
                  >
                    {message.role === 'assistant' && (
                      <div className="flex-shrink-0 p-2 bg-gradient-primary rounded-lg">
                        <Bot className="h-5 w-5 text-primary-foreground" />
                      </div>
                    )}
                    
                    <div
                      className={`max-w-[70%] p-4 rounded-xl ${
                        message.role === 'user'
                          ? 'bg-chat-message-user text-primary-foreground ml-auto'
                          : 'bg-chat-message-assistant text-foreground'
                      }`}
                    >
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    </div>

                    {message.role === 'user' && (
                      <div className="flex-shrink-0 p-2 bg-muted rounded-lg">
                        <User className="h-5 w-5 text-muted-foreground" />
                      </div>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Message Input */}
            <div className="border-t border-border p-6">
              <form onSubmit={sendMessage} className="max-w-4xl mx-auto">
                <div className="flex space-x-4">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type your message..."
                    disabled={loading}
                    className="flex-1 bg-input border-border"
                  />
                  <Button 
                    type="submit" 
                    disabled={loading || !newMessage.trim()}
                    variant="chat"
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <Bot className="h-16 w-16 text-muted-foreground mx-auto" />
              <h3 className="text-xl font-semibold text-foreground">
                {!selectedGPT ? 'Select a GPT to start chatting' : 'Create a new conversation'}
              </h3>
              <p className="text-muted-foreground">
                {!selectedGPT 
                  ? 'Choose one of your custom GPTs from the dropdown above.'
                  : 'Click "New Conversation" to start chatting with your GPT.'}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;