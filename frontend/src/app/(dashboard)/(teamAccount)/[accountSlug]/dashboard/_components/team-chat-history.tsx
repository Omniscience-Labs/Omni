'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { 
  MessageSquare, 
  User, 
  Bot, 
  Calendar,
  ExternalLink,
  MoreHorizontal
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface TeamChatHistoryProps {
  teamId: string;
}

interface ChatThread {
  thread_id: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message?: string;
  is_public: boolean;
  project_id?: string;
}

export function TeamChatHistory({ teamId }: TeamChatHistoryProps) {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadTeamChatHistory();
  }, [teamId]);

  const loadTeamChatHistory = async () => {
    try {
      const supabase = createClient();
      
      // Get team chat threads
      const { data: threadsData, error } = await supabase
        .from('threads')
        .select(`
          thread_id,
          created_at,
          updated_at,
          is_public,
          project_id
        `)
        .eq('account_id', teamId)
        .order('updated_at', { ascending: false })
        .limit(10);

      if (error) throw error;

      // Get message counts for each thread
      const threadsWithCounts = await Promise.all(
        (threadsData || []).map(async (thread) => {
          const { count } = await supabase
            .from('messages')
            .select('*', { count: 'exact', head: true })
            .eq('thread_id', thread.thread_id);

          // Get last message
          const { data: lastMessage } = await supabase
            .from('messages')
            .select('content')
            .eq('thread_id', thread.thread_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          return {
            ...thread,
            message_count: count || 0,
            last_message: lastMessage?.content ? 
              (typeof lastMessage.content === 'string' ? 
                lastMessage.content : 
                JSON.stringify(lastMessage.content).substring(0, 100)) 
              : 'No messages'
          };
        })
      );

      setThreads(threadsWithCounts);
    } catch (error) {
      console.error('Error loading team chat history:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);
    
    if (diffInSeconds < 60) return 'just now';
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)} min ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)} hours ago`;
    if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)} days ago`;
    return date.toLocaleDateString();
  };

  const openThread = (threadId: string) => {
    // Navigate to the dashboard with the thread selected
    // You can modify this to open the thread in your chat interface
    router.push(`/dashboard?thread=${threadId}`);
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="flex items-center space-x-3 p-3 border rounded-lg animate-pulse">
            <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
            <div className="flex-1 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (threads.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <MessageSquare className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <h3 className="text-lg font-medium mb-2">No team conversations yet</h3>
        <p className="text-sm mb-4">
          Start chatting with your team agents to see conversation history here.
        </p>
        <Button 
          onClick={() => router.push('/dashboard')}
        >
          Start New Chat
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {threads.map((thread) => (
        <Card 
          key={thread.thread_id} 
          className="hover:shadow-md transition-shadow cursor-pointer"
          onClick={() => openThread(thread.thread_id)}
        >
          <CardContent className="p-4">
            <div className="flex items-start space-x-3">
              <Avatar className="h-10 w-10">
                <AvatarFallback>
                  <MessageSquare className="h-5 w-5" />
                </AvatarFallback>
              </Avatar>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium text-sm">
                      Chat Thread
                    </h4>
                    {thread.is_public && (
                      <Badge variant="secondary" className="text-xs">
                        Public
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Calendar className="h-3 w-3" />
                    {formatTimeAgo(thread.updated_at)}
                  </div>
                </div>
                
                <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                  {thread.last_message && thread.last_message.length > 100 
                    ? `${thread.last_message.substring(0, 100)}...` 
                    : thread.last_message || 'No messages'}
                </p>
                
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <MessageSquare className="h-3 w-3" />
                      {thread.message_count} messages
                    </div>
                  </div>
                  
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      openThread(thread.thread_id);
                    }}
                  >
                    <ExternalLink className="h-3 w-3 mr-1" />
                    Open
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
      
      {threads.length >= 10 && (
        <Button 
          variant="outline" 
          className="w-full"
          onClick={() => router.push('/dashboard')}
        >
          View All Conversations
        </Button>
      )}
    </div>
  );
}
