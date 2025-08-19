'use client';

import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Bot, Globe, Lock, Users } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';

interface TeamAgentsProps {
  teamId: string;
  limit?: number;
}

interface TeamAgent {
  agent_id: string;
  name: string;
  description?: string;
  is_public: boolean;
  visibility?: string;
  created_at: string;
}

export function TeamAgents({ teamId, limit = 3 }: TeamAgentsProps) {
  const [agents, setAgents] = useState<TeamAgent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTeamAgents();
  }, [teamId]);

  const loadTeamAgents = async () => {
    try {
      const supabase = createClient();
      
      // Get agents owned by the team
      const { data: teamAgents, error: teamError } = await supabase
        .from('agents')
        .select('agent_id, name, description, is_public, created_at')
        .eq('account_id', teamId)
        .limit(limit)
        .order('created_at', { ascending: false });

      if (teamError) throw teamError;

      // Get agents shared with the team
      const { data: sharedAgents, error: sharedError } = await supabase
        .from('team_agents')
        .select(`
          agent_id,
          agents!inner(
            agent_id,
            name,
            description,
            is_public,
            created_at
          )
        `)
        .eq('team_account_id', teamId)
        .limit(Math.max(0, limit - (teamAgents?.length || 0)));

      if (sharedError) throw sharedError;

      // Combine and format agents
      const allAgents = [
        ...(teamAgents || []),
        ...(sharedAgents?.map(sa => sa.agents) || [])
      ];

      // Check visibility settings for each agent
      const agentsWithVisibility = await Promise.all(
        allAgents.map(async (agent) => {
          const { data: visibilityData } = await supabase
            .from('agent_visibility_settings')
            .select('visibility')
            .eq('agent_id', agent.agent_id)
            .single();

          return {
            ...agent,
            visibility: visibilityData?.visibility || (agent.is_public ? 'public' : 'private')
          };
        })
      );

      setAgents(agentsWithVisibility.slice(0, limit));
    } catch (error) {
      console.error('Error loading team agents:', error);
    } finally {
      setLoading(false);
    }
  };

  const getVisibilityIcon = (visibility: string) => {
    switch (visibility) {
      case 'public':
        return <Globe className="h-3 w-3" />;
      case 'teams':
        return <Users className="h-3 w-3" />;
      default:
        return <Lock className="h-3 w-3" />;
    }
  };

  const getVisibilityColor = (visibility: string) => {
    switch (visibility) {
      case 'public':
        return 'default';
      case 'teams':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(limit)].map((_, i) => (
          <div key={i} className="flex items-center space-x-3 animate-pulse">
            <div className="w-10 h-10 bg-gray-200 rounded-lg"></div>
            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-1"></div>
              <div className="h-3 bg-gray-200 rounded w-1/2"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (agents.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-sm">
        <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
        No team agents yet
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {agents.map((agent) => (
        <div key={agent.agent_id} className="flex items-start space-x-3">
          <Avatar className="h-10 w-10">
            <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-600">
              <Bot className="h-5 w-5 text-white" />
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium truncate">{agent.name}</p>
              <Badge variant={getVisibilityColor(agent.visibility || 'private')} className="text-xs">
                {getVisibilityIcon(agent.visibility || 'private')}
                <span className="ml-1">{agent.visibility || 'private'}</span>
              </Badge>
            </div>
            {agent.description && (
              <p className="text-xs text-muted-foreground line-clamp-2">
                {agent.description}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
