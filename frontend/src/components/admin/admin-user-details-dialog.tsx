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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  User,
  CreditCard,
  History,
  DollarSign,
  Calendar,
  Activity,
  AlertCircle,
  CheckCircle,
  RefreshCw,
  Clock,
  Infinity,
  Plus,
  Minus,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useAdminUserDetails, useRefreshUserData } from '@/hooks/react-query/admin/use-admin-users';
import {
  useUserBillingSummary,
  useUserTransactions,
  useAdjustCredits,
} from '@/hooks/react-query/admin/use-admin-billing';
import type { UserSummary } from '@/hooks/react-query/admin/use-admin-users';
import { useAdminCheck } from '@/hooks/use-admin-check';
import { useQueryClient } from '@tanstack/react-query';

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
  // Transaction pagination and filtering state
  const [transactionsOffset, setTransactionsOffset] = useState(0);
  const [transactionsTypeFilter, setTransactionsTypeFilter] = useState<string | undefined>(undefined);
  const transactionsLimit = 20;

  // Admin access check with proper TypeScript typing
  const { data: adminCheck } = useAdminCheck();
  const queryClient = useQueryClient();

  const { data: userDetails, isLoading } = useAdminUserDetails(user?.id || null);
  const { data: billingSummary } = useUserBillingSummary(user?.id || null);
  const { data: transactionsData, isLoading: transactionsLoading } = useUserTransactions(
    user?.id || null, 
    transactionsLimit, 
    transactionsOffset,
    transactionsTypeFilter
  );

  // Debug logging to see what data is actually being returned
  if (billingSummary) {
    console.log('🔍 [Admin Debug] Billing Summary:', billingSummary);
    console.log('🔍 [Admin Debug] Credit Account:', billingSummary.credit_account);
  }
  if (transactionsData) {
    console.log('🔍 [Admin Debug] Transactions Data:', transactionsData);
    console.log('🔍 [Admin Debug] Transaction Count:', transactionsData.transactions?.length || 0);
  }

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
      queryClient.invalidateQueries({ queryKey: ['admin', 'billing', 'user', user.id] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'billing', 'transactions', user.id] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', 'list'] }),
      queryClient.invalidateQueries({ queryKey: ['admin', 'users', 'stats'] }),
    ]);
    
    // Force refetch immediately
    await queryClient.refetchQueries({ queryKey: ['admin', 'billing', 'user', user.id] });
    
    onRefresh?.();
    toast.success('All data refreshed');
  };

  const getSubscriptionBadgeVariant = (status?: string) => {
    switch (status) {
      case 'active':
        return 'default';
      case 'cancelled':
        return 'destructive';
      case 'past_due':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  const getTransactionColor = (type: string) => {
    switch (type) {
      case 'usage':
        return 'text-red-600';
      case 'admin_grant':
        return 'text-green-600';
      case 'tier_grant':
        return 'text-blue-600';
      case 'purchase':
        return 'text-purple-600';
      case 'refund':
        return 'text-orange-600';
      default:
        return 'text-muted-foreground';
    }
  };

  const getTransactionBadge = (type: string) => {
    const badges: Record<string, { label: string; variant: any }> = {
      'tier_grant': { label: 'Tier Grant', variant: 'default' },
      'purchase': { label: 'Purchase', variant: 'default' },
      'admin_grant': { label: 'Admin Grant', variant: 'secondary' },
      'promotional': { label: 'Promotional', variant: 'secondary' },
      'usage': { label: 'Usage', variant: 'outline' },
      'refund': { label: 'Refund', variant: 'secondary' },
      'adjustment': { label: 'Adjustment', variant: 'outline' },
      'expired': { label: 'Expired', variant: 'destructive' },
      'tier_upgrade': { label: 'Tier Upgrade', variant: 'default' },
      'expiration': { label: 'Expiration', variant: 'destructive' },
    };

    const badge = badges[type] || { label: type, variant: 'outline' };
    return <Badge variant={badge.variant as any}>{badge.label}</Badge>;
  };

  const getTransactionIcon = (type: string, amount: number) => {
    if (amount > 0) {
      return <Plus className="h-4 w-4 text-green-500" />;
    }
    if (type === 'usage') {
      return <Minus className="h-4 w-4 text-orange-500" />;
    }
    if (type === 'expired' || type === 'expiration') {
      return <Clock className="h-4 w-4 text-red-500" />;
    }
    return <Minus className="h-4 w-4 text-red-500" />;
  };

  const handlePrevTransactionsPage = () => {
    setTransactionsOffset(Math.max(0, transactionsOffset - transactionsLimit));
  };

  const handleNextTransactionsPage = () => {
    if (transactionsData && transactionsData.transactions.length === transactionsLimit) {
      setTransactionsOffset(transactionsOffset + transactionsLimit);
    }
  };

  if (!user) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            User Details - {user.email}
            {(adminCheck?.isAdmin || adminCheck?.isOmniAdmin) && (
              <Badge variant="destructive" className="text-xs">
                Admin Only
              </Badge>
            )}
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
            <Tabs defaultValue="transactions" className="w-full">
              <TabsList className="grid w-full grid-cols-3 sticky top-0 z-10">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="transactions">Transactions</TabsTrigger>
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
                      Credit Summary
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Current Balance</p>
                      <p className="text-2xl font-bold text-green-600">
                        {formatCurrency(billingSummary?.credit_account?.total || user.credit_balance)}
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-muted-foreground">Expiring</p>
                        <p className="font-medium text-orange-600">
                          {formatCurrency(billingSummary?.credit_account?.expiring || 0)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Non-Expiring</p>
                        <p className="font-medium text-blue-600">
                          {formatCurrency(billingSummary?.credit_account?.non_expiring || 0)}
                        </p>
                      </div>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">Subscription</p>
                      <Badge
                        variant={getSubscriptionBadgeVariant(user.subscription_status)}
                        className="capitalize"
                      >
                        {user.subscription_status || 'None'}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="transactions" className="space-y-4">
              {/* Admin Access Control */}
              {!(adminCheck?.isAdmin || adminCheck?.isOmniAdmin) ? (
                <div className="p-8 text-center">
                  <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Admin Access Required</h3>
                  <p className="text-muted-foreground">
                    You need admin privileges to view user transaction details.
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
                      You are viewing sensitive financial information for this user. This data is only visible to {adminCheck?.isOmniAdmin ? 'Omni Admins' : 'Admins'}.
                    </p>
                  </div>

                  {/* Balance Summary */}
              {billingSummary && (
                <div className="grid gap-4 md:grid-cols-3">
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-2xl font-bold">
                        {formatCurrency(billingSummary.credit_account?.total || 0)}
                      </div>
                      <p className="text-xs text-muted-foreground">Total Balance</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-orange-500" />
                        <span className="text-lg font-semibold">
                          {formatCurrency(billingSummary.credit_account?.expiring || 0)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">Expiring Credits</p>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <div className="flex items-center gap-2">
                        <Infinity className="h-4 w-4 text-blue-500" />
                        <span className="text-lg font-semibold">
                          {formatCurrency(billingSummary.credit_account?.non_expiring || 0)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">Non-Expiring Credits</p>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* Transaction Filter */}
              <div className="flex items-center gap-4">
                <Label htmlFor="transaction-filter" className="text-sm font-medium">
                  Filter by type:
                </Label>
                <Select
                  value={transactionsTypeFilter || 'all'}
                  onValueChange={(value) => {
                    setTransactionsTypeFilter(value === 'all' ? undefined : value);
                    setTransactionsOffset(0);
                  }}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="All Transactions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Transactions</SelectItem>
                    <SelectItem value="usage">Usage</SelectItem>
                    <SelectItem value="purchase">Purchase</SelectItem>
                    <SelectItem value="tier_grant">Tier Grant</SelectItem>
                    <SelectItem value="admin_grant">Admin Grant</SelectItem>
                    <SelectItem value="refund">Refund</SelectItem>
                    <SelectItem value="adjustment">Adjustment</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Transactions Table */}
              <Card>
                <CardContent className="p-0">
                  {transactionsLoading ? (
                    <div className="p-8 text-center text-muted-foreground">
                      <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-2" />
                      Loading transactions...
                    </div>
                  ) : !transactionsData || transactionsData.transactions?.length === 0 ? (
                    <div className="p-8 text-center text-muted-foreground">
                      No transactions found
                    </div>
                  ) : (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Date</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                            <TableHead className="text-right">Balance After</TableHead>
                            <TableHead className="text-center">Credits Type</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {transactionsData.transactions.map((transaction: any) => (
                            <TableRow key={transaction.id}>
                              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                {formatDate(transaction.created_at)}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-2">
                                  {getTransactionIcon(transaction.type, transaction.amount)}
                                  {getTransactionBadge(transaction.type)}
                                </div>
                              </TableCell>
                              <TableCell className="max-w-xs truncate">
                                {transaction.description || 'No description'}
                              </TableCell>
                              <TableCell className="text-right">
                                <span className={`font-semibold ${getTransactionColor(transaction.type)}`}>
                                  {transaction.amount > 0 ? '+' : ''}
                                  {formatCurrency(Math.abs(transaction.amount))}
                                </span>
                              </TableCell>
                              <TableCell className="text-right font-medium">
                                {formatCurrency(transaction.balance_after)}
                              </TableCell>
                              <TableCell className="text-center">
                                {transaction.is_expiring ? (
                                  <Badge variant="outline" className="gap-1">
                                    <Clock className="h-3 w-3" />
                                    Expiring
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="gap-1">
                                    <Infinity className="h-3 w-3" />
                                    Non-Expiring
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>

                      {/* Pagination */}
                      <div className="flex items-center justify-between border-t p-4">
                        <div className="text-sm text-muted-foreground">
                          Showing {transactionsOffset + 1} - {transactionsOffset + transactionsData.transactions.length} transactions
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handlePrevTransactionsPage}
                            disabled={transactionsOffset === 0}
                          >
                            <ChevronLeft className="h-4 w-4 mr-1" />
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleNextTransactionsPage}
                            disabled={!transactionsData || transactionsData.transactions.length < transactionsLimit}
                          >
                            Next
                            <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    </>
                  )}
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
