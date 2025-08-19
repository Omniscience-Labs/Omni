'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  Users, 
  MessageSquare, 
  Bot, 
  Settings, 
  Plus,
  Activity,
  Calendar,
  TrendingUp,
  ArrowRight
} from 'lucide-react';
import { useTeamContext } from '@/hooks/use-team-context';
import { TeamChatHistory } from './team-chat-history';
import { TeamAgents } from './team-agents';
import { TeamMembers } from './team-members';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

interface TeamDashboardProps {
  team: {
    account_id: string;
    name: string;
    slug: string;
    created_at: string;
  };
}

export function TeamDashboard({ team }: TeamDashboardProps) {
  const router = useRouter();
  const { refreshTeamData } = useTeamContext();
  const [teamStats, setTeamStats] = useState({
    memberCount: 0,
    agentCount: 0,
    chatCount: 0,
    activeUsers: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTeamStats();
    refreshTeamData();
  }, [team.account_id]);

  const loadTeamStats = async () => {
    try {
      const supabase = createClient();
      
      // Try to use the helper function if it exists
      const { data: statsData, error: statsError } = await supabase
        .rpc('get_team_stats', { p_account_id: team.account_id });
      
      if (statsData && !statsError) {
        // Use the stats from the helper function
        setTeamStats({
          memberCount: statsData.member_count || 0,
          agentCount: statsData.agent_count || 0,
          chatCount: statsData.thread_count || 0,
          activeUsers: statsData.active_users_7d || 0
        });
      } else {
        // Fallback to manual queries if the function doesn't exist yet
        const { data: membersData } = await supabase
          .schema('basejump')
          .from('account_user')
          .select('*', { count: 'exact' })
          .eq('account_id', team.account_id);

        const { data: agentsData } = await supabase
          .from('agents')
          .select('*', { count: 'exact' })
          .eq('account_id', team.account_id);

        const { count: threadCount } = await supabase
          .from('threads')
          .select('*', { count: 'exact', head: true })
          .eq('account_id', team.account_id);

        setTeamStats({
          memberCount: membersData?.length || 0,
          agentCount: agentsData?.length || 0,
          chatCount: threadCount || 0,
          activeUsers: 0
        });
      }
    } catch (error) {
      console.error('Error loading team stats:', error);
      // Set default values on error
      setTeamStats({
        memberCount: 0,
        agentCount: 0,
        chatCount: 0,
        activeUsers: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const navigateToTeamSettings = () => {
    router.push(`/${team.slug}/settings`);
  };

  const navigateToAgents = () => {
    router.push(`/agents`);
  };

  const startNewChat = () => {
    router.push(`/dashboard`);
  };

  return (
    <div className="space-y-6">
      {/* Team Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-2xl font-bold bg-gradient-to-br from-blue-500 to-purple-600 text-white">
              {team.name.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-3xl font-bold">{team.name}</h1>
            <p className="text-muted-foreground">
              Team Dashboard • {team.slug}
            </p>
            <div className="flex items-center gap-2 mt-2">
              <Badge variant="secondary">
                <Users className="h-3 w-3 mr-1" />
                {teamStats.memberCount} members
              </Badge>
              <Badge variant="outline">
                Created {new Date(team.created_at).toLocaleDateString()}
              </Badge>
            </div>
          </div>
        </div>
        <Button 
          onClick={navigateToTeamSettings}
          variant="outline"
        >
          <Settings className="h-4 w-4 mr-2" />
          Team Settings
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Team Members</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teamStats.memberCount}</div>
            <p className="text-xs text-muted-foreground">
              {teamStats.activeUsers} active this week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Team Agents</CardTitle>
            <Bot className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teamStats.agentCount}</div>
            <p className="text-xs text-muted-foreground">
              Available to all team members
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Chat Threads</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{teamStats.chatCount}</div>
            <p className="text-xs text-muted-foreground">
              Team conversation history
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Activity</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <TrendingUp className="h-6 w-6 text-green-500" />
            </div>
            <p className="text-xs text-muted-foreground">
              Team engagement up this month
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Chat History */}
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5" />
                Recent Team Conversations
              </CardTitle>
              <CardDescription>
                Latest chat threads and discussions within your team
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TeamChatHistory teamId={team.account_id} />
            </CardContent>
          </Card>
        </div>

        {/* Team Quick Actions */}
        <div className="space-y-4">
          {/* Team Members */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Team Members
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TeamMembers teamId={team.account_id} limit={5} />
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full mt-2"
                onClick={() => router.push(`/${team.slug}/settings/members`)}
              >
                View All Members
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardContent>
          </Card>

          {/* Team Agents */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-5 w-5" />
                Team Agents
              </CardTitle>
            </CardHeader>
            <CardContent>
              <TeamAgents teamId={team.account_id} limit={3} />
              <div className="flex gap-2 mt-2">
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="flex-1"
                  onClick={navigateToAgents}
                >
                  View All
                </Button>
                <Button 
                  size="sm"
                  className="flex-1"
                  onClick={navigateToAgents}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Create
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Quick Actions */}
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button 
                className="w-full justify-start"
                variant="outline"
                onClick={startNewChat}
              >
                <MessageSquare className="h-4 w-4 mr-2" />
                Start New Chat
              </Button>
              <Button 
                className="w-full justify-start"
                variant="outline"
                onClick={navigateToAgents}
              >
                <Bot className="h-4 w-4 mr-2" />
                Create Agent
              </Button>
              <Button 
                className="w-full justify-start"
                variant="outline"
                onClick={() => router.push(`/${team.slug}/settings`)}
              >
                <Settings className="h-4 w-4 mr-2" />
                Team Settings
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
