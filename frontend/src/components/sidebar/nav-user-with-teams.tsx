'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BadgeCheck,
  Bell,
  ChevronDown,
  ChevronsUpDown,
  Command,
  CreditCard,
  Key,
  LogOut,
  Plus,
  Settings,
  User,
  AudioWaveform,
  Sun,
  Moon,
  KeyRound,
  Loader2,
} from 'lucide-react';
import { useAccounts } from '@/hooks/use-accounts';
import { useCurrentAccount } from '@/hooks/use-current-account';
import NewTeamForm from '@/components/basejump/new-team-form';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { createClient } from '@/lib/supabase/client';
import { useTheme } from 'next-themes';
import { isLocalMode } from '@/lib/config';
import { useFeatureFlag } from '@/lib/feature-flags';

export function NavUserWithTeams({
  user,
}: {
  user: {
    name: string;
    email: string;
    avatar: string;
  };
}) {
  const router = useRouter();
  const { isMobile } = useSidebar();
  const { data: accounts } = useAccounts();
  const currentAccount = useCurrentAccount();
  const [showNewTeamDialog, setShowNewTeamDialog] = React.useState(false);
  const [switchingTeam, setSwitchingTeam] = React.useState<string | null>(null);
  const { theme, setTheme } = useTheme();
  const { enabled: customAgentsEnabled, loading: flagLoading } = useFeatureFlag("custom_agents");

  // Prepare personal account and team accounts
  const personalAccount = React.useMemo(
    () => accounts?.find((account) => account.personal_account),
    [accounts],
  );
  const teamAccounts = React.useMemo(
    () => accounts?.filter((account) => !account.personal_account),
    [accounts],
  );

  // Create a default list of teams with logos for the UI (will show until real data loads)
  const defaultTeams = React.useMemo(() => {
    const teams = [];
    
    if (personalAccount) {
      teams.push({
        name: personalAccount.name || 'Personal Account',
        logo: Command,
        plan: 'Personal',
        account_id: personalAccount.account_id,
        slug: personalAccount.slug,
        personal_account: true,
      });
    }
    
    if (teamAccounts?.length) {
      teams.push(...teamAccounts.map((team) => ({
        name: team?.name || 'Team',
        logo: AudioWaveform,
        plan: 'Team',
        account_id: team?.account_id,
        slug: team?.slug,
        personal_account: false,
      })));
    }
    
    return teams;
  }, [personalAccount, teamAccounts]);

  // Use the first team or first entry in defaultTeams as activeTeam
  const [activeTeam, setActiveTeam] = React.useState(() => defaultTeams[0] || {});

  // Update active team when accounts load
  React.useEffect(() => {
    if (accounts?.length) {
      const currentTeam = accounts.find(
        (account) => account.account_id === activeTeam.account_id,
      );
      if (currentTeam) {
        setActiveTeam({
          name: currentTeam.name,
          logo: currentTeam.personal_account ? Command : AudioWaveform,
          plan: currentTeam.personal_account ? 'Personal' : 'Team',
          account_id: currentTeam.account_id,
          slug: currentTeam.slug,
          personal_account: currentTeam.personal_account,
        });
      } else {
        // If current team not found, set first available account as active
        const firstAccount = accounts[0];
        setActiveTeam({
          name: firstAccount.name,
          logo: firstAccount.personal_account ? Command : AudioWaveform,
          plan: firstAccount.personal_account ? 'Personal' : 'Team',
          account_id: firstAccount.account_id,
          slug: firstAccount.slug,
          personal_account: firstAccount.personal_account,
        });
      }
    }
  }, [accounts, activeTeam.account_id]);

  // Handle team selection with visual feedback  
  const handleTeamSwitch = (team: { 
    account_id: string; 
    name: string; 
    slug: string; 
    personal_account: boolean; 
    logo?: any; 
    plan?: string; 
  }) => {
    console.log('Switching to:', team.personal_account ? 'Personal' : `Team: ${team.name}`);
    
    setSwitchingTeam(team.account_id);
    
    // Update sessionStorage to match useCurrentAccount
    if (!team.personal_account) {
      // Store team context
      try {
        sessionStorage.setItem('team_context', JSON.stringify({
          account_id: team.account_id,
          name: team.name,
          slug: team.slug,
          timestamp: Date.now()
        }));
        console.log('🏢 Stored team context:', team.name);
      } catch (error) {
        console.warn('Failed to store team context:', error);
      }
    } else {
      // Clear team context for personal account
      try {
        sessionStorage.removeItem('team_context');
        console.log('👤 Cleared team context for personal account');
      } catch (error) {
        console.warn('Failed to clear team context:', error);
      }
    }
    
    // Navigate to dashboard first, then reload to ensure everything updates
    router.push('/dashboard');
    // Use setTimeout to ensure navigation happens before reload
    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  const handleLogout = async () => {
    try {
      const supabase = createClient();
      if (supabase && supabase.auth) {
        await supabase.auth.signOut();
      }
      router.push('/auth');
    } catch (error) {
      console.error('Error during logout:', error);
      // Still navigate to auth page even if signOut fails
      router.push('/auth');
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((part) => part.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 2);
  };

  if (!activeTeam) {
    return null;
  }

  return (
    <Dialog open={showNewTeamDialog} onOpenChange={setShowNewTeamDialog}>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
                data-team-switcher
              >
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user.avatar} alt={user.name} />
                  <AvatarFallback className="rounded-lg">
                    {getInitials(user.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-medium flex items-center gap-2">
                    {currentAccount?.is_team_context ? currentAccount.name : user.name}
                    {switchingTeam && <Loader2 className="h-3 w-3 animate-spin" />}
                  </span>
                  <span className="truncate text-xs">
                    {currentAccount?.is_team_context ? `Team • ${user.email}` : user.email}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              className="w-(--radix-dropdown-menu-trigger-width) min-w-56"
              side={isMobile ? 'bottom' : 'top'}
              align="start"
              sideOffset={4}
            >
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1.5 py-1.5 text-left text-sm">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src={user.avatar} alt={user.name} />
                    <AvatarFallback className="rounded-lg">
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs">{user.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />

              {/* Teams Section */}
              {personalAccount && (
                <>
                  <DropdownMenuLabel className="text-muted-foreground text-xs">
                    Personal Account
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    key={personalAccount.account_id}
                    onClick={() =>
                      handleTeamSwitch({
                        name: personalAccount.name,
                        logo: Command,
                        plan: 'Personal',
                        account_id: personalAccount.account_id,
                        slug: personalAccount.slug,
                        personal_account: true,
                      })
                    }
                    className="gap-2 p-2"
                    disabled={switchingTeam === personalAccount.account_id}
                  >
                    <div className="flex size-6 items-center justify-center rounded-xs border">
                      {switchingTeam === personalAccount.account_id ? (
                        <Loader2 className="size-4 shrink-0 animate-spin" />
                      ) : (
                        <Command className="size-4 shrink-0" />
                      )}
                    </div>
                    {personalAccount.name}
                    {!currentAccount?.is_team_context && <BadgeCheck className="ml-auto h-4 w-4 text-green-600" />}
                    <DropdownMenuShortcut>⌘1</DropdownMenuShortcut>
                  </DropdownMenuItem>
                </>
              )}

              {teamAccounts?.length > 0 && (
                <>
                  <DropdownMenuLabel className="text-muted-foreground text-xs mt-2">
                    Teams
                  </DropdownMenuLabel>
                  {teamAccounts.map((team, index) => (
                    <DropdownMenuItem
                      key={team.account_id}
                      onClick={() =>
                        handleTeamSwitch({
                          name: team.name,
                          logo: AudioWaveform,
                          plan: 'Team',
                          account_id: team.account_id,
                          slug: team.slug,
                          personal_account: false,
                        })
                      }
                      className="gap-2 p-2"
                      disabled={switchingTeam === team.account_id}
                    >
                      <div className="flex size-6 items-center justify-center rounded-xs border">
                        {switchingTeam === team.account_id ? (
                          <Loader2 className="size-4 shrink-0 animate-spin" />
                        ) : (
                          <AudioWaveform className="size-4 shrink-0" />
                        )}
                      </div>
                      {team.name}
                      {currentAccount?.account_id === team.account_id && <BadgeCheck className="ml-auto h-4 w-4 text-green-600" />}
                      <DropdownMenuShortcut>⌘{index + 2}</DropdownMenuShortcut>
                    </DropdownMenuItem>
                  ))}
                </>
              )}

              {/* Team Settings Link for current team */}
              {currentAccount?.is_team_context && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem 
                    onClick={() => router.push(`/${currentAccount.slug}/settings`)}
                    className="gap-2 p-2 cursor-pointer"
                  >
                    <Settings className="size-4" />
                    <span>Team Settings</span>
                  </DropdownMenuItem>
                </>
              )}
              
              <DropdownMenuSeparator />
              <DialogTrigger asChild>
                <DropdownMenuItem 
                  className="gap-2 p-2"
                  onClick={() => {
                    setShowNewTeamDialog(true)
                  }}
                >
                  <div className="bg-background flex size-6 items-center justify-center rounded-md border">
                    <Plus className="size-4" />
                  </div>
                  <div className="text-muted-foreground font-medium">Add team</div>
                </DropdownMenuItem>
              </DialogTrigger>
              <DropdownMenuSeparator />

              {/* User Settings Section */}
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link href="/settings/billing">
                    <CreditCard className="h-4 w-4" />
                    Billing
                  </Link>
                </DropdownMenuItem>
                {!flagLoading && customAgentsEnabled && (
                  <DropdownMenuItem asChild>
                    <Link href="/settings/api-keys">
                      <Key className="h-4 w-4" />
                      API Keys (Admin)
                    </Link>
                  </DropdownMenuItem>
                )}
                {isLocalMode() && <DropdownMenuItem asChild>
                  <Link href="/settings/env-manager">
                    <KeyRound className="h-4 w-4" />
                    Local .Env Manager
                  </Link>
                </DropdownMenuItem>}
                {/* <DropdownMenuItem asChild>
                  <Link href="/settings">
                    <Settings className="mr-2 h-4 w-4" />
                    Settings
                  </Link>
                </DropdownMenuItem> */}
                <DropdownMenuItem
                  onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                >
                  <div className="flex items-center gap-2">
                    <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
                    <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
                    <span>Theme</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem className='text-destructive focus:text-destructive focus:bg-destructive/10' onClick={handleLogout}>
                <LogOut className="h-4 w-4 text-destructive" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>

      <DialogContent className="sm:max-w-[425px] border-subtle dark:border-white/10 bg-card-bg dark:bg-background-secondary rounded-2xl shadow-custom">
        <DialogHeader>
          <DialogTitle className="text-foreground">
            Create a new team
          </DialogTitle>
          <DialogDescription className="text-foreground/70">
            Create a team to collaborate with others.
          </DialogDescription>
        </DialogHeader>
        <NewTeamForm />
      </DialogContent>
    </Dialog>
  );
}
