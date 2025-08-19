"use client";

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Globe, 
  Lock, 
  Shield,
  Loader2,
  CheckCircle,
  X,
  Share2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { toast } from 'sonner';

interface TeamInfo {
  team_id: string;
  team_name: string;
  team_slug: string;
  account_role: string;
}

interface AgentShareInfo {
  team_id: string;
  team_name: string;
  team_slug: string;
  shared_at: string;
}

interface TeamSharingDialogProps {
  agent: {
    agent_id: string;
    name: string;
    is_public?: boolean;
    visibility?: string;
  } | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const TeamSharingDialog: React.FC<TeamSharingDialogProps> = ({
  agent,
  isOpen,
  onClose,
  onSuccess
}) => {
  const [visibility, setVisibility] = useState<'private' | 'public' | 'teams'>('private');
  const [selectedTeams, setSelectedTeams] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const queryClient = useQueryClient();
  const supabase = createClient();

  // Fetch user's teams
  const { data: myTeams = [], isLoading: teamsLoading } = useQuery({
    queryKey: ['my-teams'],
    queryFn: async () => {
      const response = await fetch('/api/teams/my-teams', {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });
      if (!response.ok) throw new Error('Failed to fetch teams');
      return response.json() as Promise<TeamInfo[]>;
    },
    enabled: isOpen
  });

  // Fetch current sharing status
  const { data: sharedTeams = [], refetch: refetchSharedTeams } = useQuery({
    queryKey: ['agent-shared-teams', agent?.agent_id],
    queryFn: async () => {
      if (!agent?.agent_id) return [];
      const response = await fetch(`/api/teams/agents/${agent.agent_id}/shared-teams`, {
        headers: {
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });
      if (!response.ok) {
        if (response.status === 403) return []; // Not owner, can't see shares
        throw new Error('Failed to fetch shared teams');
      }
      return response.json() as Promise<AgentShareInfo[]>;
    },
    enabled: isOpen && !!agent?.agent_id
  });

  // Initialize state when agent changes
  useEffect(() => {
    if (agent) {
      // Set initial visibility based on agent data
      if (agent.visibility) {
        setVisibility(agent.visibility as 'private' | 'public' | 'teams');
      } else if (agent.is_public) {
        setVisibility('public');
      } else {
        setVisibility('private');
      }

      // Set selected teams based on current shares
      if (sharedTeams.length > 0) {
        setSelectedTeams(new Set(sharedTeams.map(t => t.team_id)));
        if (!agent.visibility || agent.visibility !== 'teams') {
          setVisibility('teams');
        }
      }
    }
  }, [agent, sharedTeams]);

  // Filter teams where user is owner
  const ownedTeams = myTeams.filter(team => team.account_role === 'owner');

  const handleTeamToggle = (teamId: string, checked: boolean) => {
    const newSelectedTeams = new Set(selectedTeams);
    if (checked) {
      newSelectedTeams.add(teamId);
    } else {
      newSelectedTeams.delete(teamId);
    }
    setSelectedTeams(newSelectedTeams);
  };

  const handleSave = async () => {
    if (!agent) return;
    
    setIsLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const response = await fetch(`/api/teams/agents/${agent.agent_id}/set-visibility`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          visibility,
          team_ids: visibility === 'teams' ? Array.from(selectedTeams) : null
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update agent visibility');
      }

      toast.success(`Agent visibility updated to ${visibility}`);
      
      // Refetch agent data and shared teams
      queryClient.invalidateQueries({ queryKey: ['agents'] });
      queryClient.invalidateQueries({ queryKey: ['agent-shared-teams', agent.agent_id] });
      
      onSuccess?.();
      onClose();
    } catch (error) {
      console.error('Error updating agent visibility:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to update agent visibility');
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnshareFromTeam = async (teamId: string) => {
    if (!agent) return;
    
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const response = await fetch(`/api/teams/agents/${agent.agent_id}/unshare-from-team/${teamId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to unshare agent');
      }

      toast.success('Agent unshared from team');
      refetchSharedTeams();
      
      // Remove from selected teams
      const newSelectedTeams = new Set(selectedTeams);
      newSelectedTeams.delete(teamId);
      setSelectedTeams(newSelectedTeams);
    } catch (error) {
      console.error('Error unsharing agent:', error);
      toast.error('Failed to unshare agent from team');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5" />
            Share Agent: {agent?.name}
          </DialogTitle>
          <DialogDescription>
            Control who can access and use this agent
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="visibility" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="visibility">Visibility Settings</TabsTrigger>
            <TabsTrigger value="current">Current Sharing</TabsTrigger>
          </TabsList>

          <TabsContent value="visibility" className="space-y-6 mt-6">
            <div className="space-y-4">
              <Label className="text-sm font-medium">Choose Visibility</Label>
              
              <RadioGroup value={visibility} onValueChange={(value) => setVisibility(value as any)}>
                <div className="space-y-3">
                  {/* Private Option */}
                  <label className="flex items-start space-x-3 cursor-pointer">
                    <RadioGroupItem value="private" className="mt-1" />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Lock className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">Private</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Only you can access and use this agent
                      </p>
                    </div>
                  </label>

                  {/* Public Option */}
                  <label className="flex items-start space-x-3 cursor-pointer">
                    <RadioGroupItem value="public" className="mt-1" />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">Public</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Anyone can discover and use this agent in the marketplace
                      </p>
                    </div>
                  </label>

                  {/* Teams Option */}
                  <label className="flex items-start space-x-3 cursor-pointer">
                    <RadioGroupItem value="teams" className="mt-1" />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">Share with Teams</span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Share with specific teams you own
                      </p>
                    </div>
                  </label>
                </div>
              </RadioGroup>
            </div>

            {/* Team Selection (shown when teams visibility is selected) */}
            {visibility === 'teams' && (
              <div className="space-y-4">
                <Label className="text-sm font-medium">Select Teams to Share With</Label>
                
                {teamsLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                  </div>
                ) : ownedTeams.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-3 opacity-50" />
                    <p>You don't own any teams to share with.</p>
                    <p className="text-sm mt-2">Create a team first to share agents with team members.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto border rounded-lg p-4">
                    {ownedTeams.map((team) => (
                      <label
                        key={team.team_id}
                        className="flex items-center space-x-3 cursor-pointer hover:bg-muted/50 p-2 rounded"
                      >
                        <Checkbox
                          checked={selectedTeams.has(team.team_id)}
                          onCheckedChange={(checked) => 
                            handleTeamToggle(team.team_id, checked as boolean)
                          }
                        />
                        <div className="flex-1">
                          <div className="font-medium">{team.team_name}</div>
                          <div className="text-sm text-muted-foreground">
                            {team.team_slug}
                          </div>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          Owner
                        </Badge>
                      </label>
                    ))}
                  </div>
                )}

                {selectedTeams.size > 0 && (
                  <div className="text-sm text-muted-foreground">
                    Selected {selectedTeams.size} team{selectedTeams.size !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            )}
          </TabsContent>

          <TabsContent value="current" className="space-y-4 mt-6">
            <Label className="text-sm font-medium">Currently Shared With</Label>
            
            {sharedTeams.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>This agent is not shared with any teams.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {sharedTeams.map((share) => (
                  <div
                    key={share.team_id}
                    className="flex items-center justify-between p-3 border rounded-lg"
                  >
                    <div>
                      <div className="font-medium">{share.team_name}</div>
                      <div className="text-sm text-muted-foreground">
                        Shared on {new Date(share.shared_at).toLocaleDateString()}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleUnshareFromTeam(share.team_id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <CheckCircle className="mr-2 h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
