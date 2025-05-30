'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Send, Loader2, Sparkles, Settings2, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useAgentBuilderChat } from '@/hooks/react-query/agents/use-agents';
import { AgentBuilderConfig } from '@/hooks/react-query/agents/utils';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AgentBuilderChatProps {
  agentId: string;
  onConfigUpdate: (config: AgentBuilderConfig) => void;
  onComplete?: (config: AgentBuilderConfig) => void;
  currentConfig: AgentBuilderConfig;
}

export function AgentBuilderChat({ agentId, onConfigUpdate, onComplete, currentConfig }: AgentBuilderChatProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: "Hi! I'm here to help you create a custom AI agent. What kind of agent would you like to build? Tell me about what you want it to do.",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('purpose');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { sendMessage, cancelStream } = useAgentBuilderChat();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userMessage = input.trim();
    setInput('');
    setIsStreaming(true);

    // Add user message
    const newUserMessage: Message = {
      role: 'user',
      content: userMessage,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, newUserMessage]);

    let assistantMessage = '';
    let messageAdded = false;

    try {
      await sendMessage(
        {
          message: userMessage,
          agent_id: agentId,
          conversation_history: messages.map(m => ({
            role: m.role,
            content: m.content
          })),
          partial_config: currentConfig
        },
        {
          onData: (data) => {
            if (data.type === 'content' && data.content) {
              assistantMessage += data.content;
              
              if (!messageAdded) {
                setMessages(prev => [...prev, {
                  role: 'assistant',
                  content: assistantMessage,
                  timestamp: new Date()
                }]);
                messageAdded = true;
              } else {
                setMessages(prev => {
                  const updated = [...prev];
                  updated[updated.length - 1].content = assistantMessage;
                  return updated;
                });
              }
            } else if (data.type === 'config' && data.config) {
              onConfigUpdate(data.config);
              if (data.next_step) {
                setCurrentStep(data.next_step);
              }
            } else if (data.type === 'error') {
              toast.error(data.error || 'An error occurred');
            }
          },
          onComplete: () => {
            if (currentStep === 'complete' && onComplete) {
              onComplete(currentConfig);
            }
          },
          onError: (error) => {
            toast.error('Failed to get response. Please try again.');
          }
        }
      );
    } catch (error) {
      console.error('Error in agent builder chat:', error);
      toast.error('Failed to get response. Please try again.');
    } finally {
      setIsStreaming(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cancelStream();
    };
  }, [cancelStream]);

  const getStepBadge = () => {
    const steps = {
      purpose: { label: 'Understanding Purpose', icon: Sparkles },
      name: { label: 'Naming Agent', icon: Settings2 },
      description: { label: 'Adding Description', icon: Settings2 },
      instructions: { label: 'Writing Instructions', icon: Settings2 },
      tools: { label: 'Configuring Tools', icon: Settings2 },
      complete: { label: 'Complete', icon: Check }
    };

    const step = steps[currentStep as keyof typeof steps] || steps.purpose;
    const Icon = step.icon;

    return (
      <Badge variant="secondary" className="flex items-center gap-1">
        <Icon className="h-3 w-3" />
        {step.label}
      </Badge>
    );
  };

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Agent Builder Assistant</h3>
          {getStepBadge()}
        </div>
      </div>

      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message, index) => (
            <div
              key={index}
              className={cn(
                "flex",
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              <Card className={cn(
                "max-w-[80%]",
                message.role === 'user' 
                  ? 'bg-primary text-primary-foreground' 
                  : 'bg-muted'
              )}>
                <CardContent className="p-3">
                  <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                  <p className={cn(
                    "text-xs mt-1",
                    message.role === 'user' 
                      ? 'text-primary-foreground/70' 
                      : 'text-muted-foreground'
                  )}>
                    {message.timestamp.toLocaleTimeString()}
                  </p>
                </CardContent>
              </Card>
            </div>
          ))}
          {isStreaming && (
            <div className="flex justify-start">
              <Card className="bg-muted">
                <CardContent className="p-3">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </CardContent>
              </Card>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      <form onSubmit={handleSubmit} className="p-4 border-t">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type your message..."
            disabled={isStreaming}
            className="flex-1"
          />
          <Button type="submit" disabled={!input.trim() || isStreaming}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
} 