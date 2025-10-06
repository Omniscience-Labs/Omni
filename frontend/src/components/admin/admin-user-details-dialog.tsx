'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import {
  User,
  CreditCard,
  Activity,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useAdminUserDetails } from '@/hooks/react-query/admin/use-admin-users';
import type { UserSummary } from '@/hooks/react-query/admin/use-admin-users';
import { useAdminCheck } from '@/hooks/use-admin-check';
import { useQueryClient } from '@tanstack/react-query';
import UsageLogs from '@/components/billing/usage-logs';

interface AdminUserDetailsDialogProps {
  user: UserSummary | null;
  isOpen: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export function AdminUserDetailsDialog({
  user,
  isOpen,
  onClose,
  onRefresh,
}: AdminUserDetailsDialogProps) {
  // Admin access check with proper TypeScript typing
  const { data: adminCheck } = useAdminCheck();
  const queryClient = useQueryClient();

  const { data: userDetails, isLoading } = useAdminUserDetails(user?.id || null);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  const handleRefreshData = async () => {
    if (!user?.id) return;
    
    // Invalidate and refetch all queries related to this user
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', 'details', user.id] }),
      queryClient.invalidateQueries({ queryKey: ['admin-user-usage', user.id] }),
      queryClient.invalidateQueries({ queryKey: ['enterprise-users'] }),
      queryClient.invalidateQueries({ queryKey: ['enterprise-status'] }),
    ]);
    
    onRefresh?.();
    toast.success('All data refreshed');
  };

  if (!user) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            User Details - {userDetails?.user?.billing_customers?.[0]?.email || user.email || 'Loading...'}
          </DialogTitle>
          <DialogDescription>
            Manage user account, billing, and perform admin actions
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="space-y-4 p-1">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-64 w-full" />
            </div>
          ) : (
            <Tabs defaultValue="usage" className="w-full">
              <TabsList className="grid w-full grid-cols-3 sticky top-0 z-10">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="usage">Usage Logs</TabsTrigger>
                <TabsTrigger value="activity">Activity</TabsTrigger>
              </TabsList>

            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Account Info
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Email</p>
                      <p className="font-mono text-sm break-all">
                        {userDetails?.user?.billing_customers?.[0]?.email || user.email}
                      </p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Account ID</p>
                      <p className="font-mono text-xs break-all">{user.id}</p>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Joined</p>
                      <p className="text-sm">{formatDate(user.created_at)}</p>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-4 w-4" />
                      Usage Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Monthly Limit</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {formatCurrency(user.credit_balance)}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Used This Month</p>
                        <p className="font-medium text-orange-600">
                          {formatCurrency(user.total_used || 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Remaining</p>
                        <p className="font-medium text-green-600">
                          {formatCurrency((user.credit_balance || 0) - (user.total_used || 0))}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="usage" className="space-y-4">
              {/* Admin Access Control */}
              {!(adminCheck?.isAdmin || adminCheck?.isOmniAdmin) ? (
                <div className="p-8 text-center">
                  <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Admin Access Required</h3>
                  <p className="text-muted-foreground">
                    You need admin privileges to view user usage logs.
                  </p>
                </div>
              ) : (
                <>
                  {/* Admin-Only Warning Banner */}
                  <div className="rounded-lg border border-orange-200 bg-orange-50 dark:border-orange-800 dark:bg-orange-950/50 p-4">
                    <div className="flex items-center gap-2 justify-between">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                        <h4 className="text-sm font-semibold text-orange-800 dark:text-orange-200">
                          Confidential - Admin Access Only
                        </h4>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefreshData}
                        className="gap-2"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Refresh Data
                      </Button>
                    </div>
                    <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                      Detailed usage logs showing tokens, costs, and models used. This data is only visible to {adminCheck?.isOmniAdmin ? 'Omni Admins' : 'Admins'}.
                    </p>
                  </div>

                  {/* Usage Logs Component */}
                  <Card>
                    <CardContent className="p-6">
                      <UsageLogs accountId={user.id} isAdminView={true} />
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            <TabsContent value="activity" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Recent Activity
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {userDetails?.recent_activity?.length > 0 ? (
                    <div className="space-y-2">
                      {userDetails.recent_activity.map((activity) => (
                        <div
                          key={activity.id}
                          className="flex items-center justify-between p-3 border rounded-lg"
                        >
                          <div>
                            <p className="text-sm font-medium">Agent Run</p>
                            <p className="text-xs text-muted-foreground">
                              {formatDate(activity.created_at)} • Thread {activity.thread_id.slice(-8)}
                            </p>
                          </div>
                          <Badge
                            variant={activity.status === 'completed' ? 'default' : 'secondary'}
                          >
                            {activity.status}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No recent activity</p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
          )}
        </div>

        <DialogFooter className="flex-shrink-0">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
