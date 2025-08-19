'use client';

import { useState, useEffect } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { createClient } from '@/lib/supabase/client';

interface TeamMembersProps {
  teamId: string;
  limit?: number;
}

interface TeamMember {
  user_id: string;
  account_role: string;
  name?: string;
  email?: string;
}

export function TeamMembers({ teamId, limit = 5 }: TeamMembersProps) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTeamMembers();
  }, [teamId]);

  const loadTeamMembers = async () => {
    try {
      const supabase = createClient();
      
      // Get team members using basejump schema
      const { data: membersData, error } = await supabase
        .schema('basejump')
        .from('account_user')
        .select(`
          user_id,
          account_role
        `)
        .eq('account_id', teamId)
        .limit(limit);

      if (error) throw error;

      // For now, we'll use user_id as the display name
      // In production, you might want to store user profiles in a separate table
      const formattedMembers = (membersData || []).map(member => ({
        user_id: member.user_id,
        account_role: member.account_role,
        email: `user@team.com`, // Placeholder
        name: `Team Member` // Placeholder - you can enhance this with a profiles table
      }));

      setMembers(formattedMembers);
    } catch (error) {
      console.error('Error loading team members:', error);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(part => part.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(limit)].map((_, i) => (
          <div key={i} className="flex items-center space-x-3 animate-pulse">
            <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
            <div className="flex-1">
              <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (members.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground text-sm">
        No team members found
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {members.map((member) => (
        <div key={member.user_id} className="flex items-center justify-between py-1">
          <div className="flex items-center space-x-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">
                {getInitials(member.name || '')}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate">{member.name}</p>
              <p className="text-xs text-muted-foreground truncate">{member.email}</p>
            </div>
          </div>
          <Badge variant={member.account_role === 'owner' ? 'default' : 'secondary'} className="text-xs">
            {member.account_role}
          </Badge>
        </div>
      ))}
    </div>
  );
}
