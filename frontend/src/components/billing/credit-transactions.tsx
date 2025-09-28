'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Clock,
  Infinity,
  Plus,
  Minus,
  RefreshCw,
  Info,
} from 'lucide-react';
import { useTransactions, useTransactionsSummary, useUsageLogs, useBillingStatus, useSubscriptionInfo } from '@/hooks/react-query/billing/use-transactions';
import { cn } from '@/lib/utils';
// UsageLogs component was removed by upstream - functionality moved to transactions

interface Props {
  accountId?: string;
}

export default function CreditTransactions({ accountId }: Props) {
  const [offset, setOffset] = useState(0);
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);
  const limit = 50;
  
  const isEnterpriseMode = process.env.NEXT_PUBLIC_ENTERPRISE_MODE === 'true';
  
  // Enterprise mode functionality integrated into transactions view
  
  // Use appropriate hooks based on mode
  const transactionsQuery = useTransactions(limit, offset, typeFilter);
  const usageLogsQuery = useUsageLogs(Math.floor(offset / limit), limit);
  const billingStatusQuery = useBillingStatus();
  
  // Select the right data source based on enterprise mode
  const { data, isLoading, error, refetch } = isEnterpriseMode ? usageLogsQuery : transactionsQuery;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatAmount = (amount: number) => {
    const absAmount = Math.abs(amount);
    const formatted = `$${absAmount.toFixed(2)}`;
    return amount >= 0 ? `+${formatted}` : `-${formatted}`;
  };

  const formatBalance = (balance: number) => {
    return `$${balance.toFixed(2)}`;
  };

  const getTransactionIcon = (type: string, amount: number) => {
    if (amount > 0) {
      return <Plus className="h-4 w-4 text-green-500" />;
    }
    if (type === 'usage') {
      return <Minus className="h-4 w-4 text-orange-500" />;
    }
    if (type === 'expired') {
      return <Clock className="h-4 w-4 text-red-500" />;
    }
    return <Minus className="h-4 w-4 text-red-500" />;
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
    };

    const badge = badges[type] || { label: type, variant: 'outline' };
    return <Badge variant={badge.variant as any}>{badge.label}</Badge>;
  };

  const handlePrevPage = () => {
    setOffset(Math.max(0, offset - limit));
  };

  const handleNextPage = () => {
    const hasMore = (data as any)?.pagination?.has_more;
    if (hasMore) {
      setOffset(offset + limit);
    }
  };

  if (isLoading && offset === 0) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Credit Transactions</CardTitle>
            <CardDescription>Loading your transaction history...</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Credit Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {error.message || 'Failed to load transactions'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // Enterprise vs non-enterprise data handling
  const currentBalance = isEnterpriseMode ? null : (data as any)?.current_balance;
  const transactions = isEnterpriseMode ? [] : (data as any)?.transactions || [];
  const billingStatus = billingStatusQuery.data;
  

  return (
    <div className="space-y-6">
      {/* Enterprise Balance Summary Card */}
      {isEnterpriseMode && billingStatus?.enterprise_info && (
        <Card>
          <CardHeader>
            <CardTitle>Enterprise Usage Summary</CardTitle>
            <CardDescription>Your monthly usage limits and current spending</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="text-2xl font-bold">
                  ${billingStatus.enterprise_info.current_usage?.toFixed(2) || '0.00'}
                </div>
                <p className="text-xs text-muted-foreground">Current Month Usage</p>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <DollarSign className="h-4 w-4 text-green-500" />
                  <span className="text-lg font-semibold">
                    ${billingStatus.enterprise_info.remaining?.toFixed(2) || '0.00'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Remaining This Month</p>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-blue-500" />
                  <span className="text-lg font-semibold">
                    ${billingStatus.enterprise_info.monthly_limit?.toFixed(2) || '0.00'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Monthly Limit</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Non-Enterprise Balance Summary Card */}
      {!isEnterpriseMode && currentBalance && (
        <Card>
          <CardHeader>
            <CardTitle>Current Balance</CardTitle>
            <CardDescription>Your credit balance breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div>
                <div className="text-2xl font-bold">
                  {formatBalance(currentBalance.total)}
                </div>
                <p className="text-xs text-muted-foreground">Total Balance</p>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-orange-500" />
                  <span className="text-lg font-semibold">
                    {formatBalance(currentBalance.expiring)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Expiring Credits</p>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <Infinity className="h-4 w-4 text-blue-500" />
                  <span className="text-lg font-semibold">
                    {formatBalance(currentBalance.non_expiring)}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">Non-Expiring Credits</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {isEnterpriseMode ? (
        // Enterprise mode: Show hierarchical usage table
        <Card className='p-0 px-0 bg-transparent shadow-none border-none'>
          <CardHeader className='px-0'>
            <CardTitle>Enterprise Usage Logs</CardTitle>
            <CardDescription>Detailed usage breakdown by date and project</CardDescription>
          </CardHeader>
          <CardContent className='px-0'>
            {(() => {
              const usageData = data as any;
              const hierarchicalUsage = usageData?.hierarchical_usage || {};
              const usageDates = Object.keys(hierarchicalUsage).sort().reverse();
              
              if (usageDates.length === 0) {
                return (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No usage data found for the selected period.</p>
                  </div>
                );
              }
              
              return (
                <div className="space-y-6">
                  {usageDates.map((date) => {
                    const dateData = hierarchicalUsage[date];
                    const projects = Object.values(dateData.projects || {});
                    
                    return (
                      <div key={date} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="text-lg font-semibold">
                            {new Date(date).toLocaleDateString('en-US', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </h3>
                          <div className="text-right">
                            <div className="text-sm text-muted-foreground">Total Cost</div>
                            <div className="text-lg font-bold">${dateData.total_cost?.toFixed(4) || '0.0000'}</div>
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          {projects.map((project: any) => (
                            <div key={project.thread_id} className="border-l-2 border-blue-200 pl-4">
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <h4 className="font-medium">{project.project_title || 'Untitled Project'}</h4>
                                  <p className="text-sm text-muted-foreground">
                                    Thread ID: {project.thread_id?.slice(0, 8)}...
                                  </p>
                                </div>
                                <div className="text-right">
                                  <div className="text-sm text-muted-foreground">Thread Cost</div>
                                  <div className="font-semibold">${project.thread_cost?.toFixed(4) || '0.0000'}</div>
                                </div>
                              </div>
                              
                              <div className="ml-4">
                                <Table>
                                  <TableHeader>
                                    <TableRow>
                                      <TableHead className="w-[120px]">Time</TableHead>
                                      <TableHead className="w-[100px]">Model</TableHead>
                                      <TableHead className="w-[80px]">Type</TableHead>
                                      <TableHead className="w-[100px]">Tokens</TableHead>
                                      <TableHead className="w-[100px]">Tool</TableHead>
                                      <TableHead className="w-[80px] text-right">Cost</TableHead>
                                    </TableRow>
                                  </TableHeader>
                                  <TableBody>
                                    {project.usage_details?.map((detail: any) => (
                                      <TableRow key={detail.id}>
                                        <TableCell className="font-mono text-xs">
                                          {new Date(detail.created_at).toLocaleTimeString('en-US', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                            second: '2-digit'
                                          })}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                          {detail.model_name || 'N/A'}
                                        </TableCell>
                                        <TableCell>
                                          <Badge variant="outline" className="text-xs">
                                            {detail.usage_type || 'token'}
                                          </Badge>
                                        </TableCell>
                                        <TableCell className="text-xs">
                                          {detail.usage_type === 'tool' ? (
                                            <span className="text-orange-600">
                                              Tool: {detail.tool_tokens || 0}
                                            </span>
                                          ) : (
                                            <span>
                                              P: {detail.prompt_tokens || 0} | C: {detail.completion_tokens || 0}
                                            </span>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-xs">
                                          {detail.tool_name ? (
                                            <span className="text-blue-600">{detail.tool_name}</span>
                                          ) : (
                                            <span className="text-muted-foreground">-</span>
                                          )}
                                        </TableCell>
                                        <TableCell className="text-right font-mono text-xs">
                                          ${detail.cost?.toFixed(4) || '0.0000'}
                                        </TableCell>
                                      </TableRow>
                                    ))}
                                  </TableBody>
                                </Table>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Pagination for enterprise usage */}
                  {data?.page !== undefined && (
                    <div className="flex items-center justify-between mt-4">
                      <p className="text-sm text-muted-foreground">
                        Page {data.page + 1} • {data.items_per_page} items per page
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setOffset(Math.max(0, offset - limit))}
                          disabled={offset === 0}
                        >
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setOffset(offset + limit)}
                          disabled={!data?.has_more}
                        >
                          Next
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      ) : (
        // Non-enterprise mode: Show traditional transaction table
        <Card className='p-0 px-0 bg-transparent shadow-none border-none'>
          <CardHeader className='px-0'>
            <CardTitle>Transaction History</CardTitle>
            <CardDescription>All credit additions and deductions</CardDescription>
          </CardHeader>
          <CardContent className='px-0'>
            {
            // Non-enterprise mode: Show traditional transaction table
            transactions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">
                  {typeFilter ? `No ${typeFilter} transactions found.` : 'No transactions found.'}
                </p>
              </div>
            ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[180px]">Date</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-center">Credit Type</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead className="text-right">Balance After</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell className="font-mono text-xs">
                          {formatDate(tx.created_at)}
                        </TableCell>
                        <TableCell>
                          {getTransactionBadge(tx.type)}
                        </TableCell>
                        <TableCell className="text-sm">
                          <div className="flex items-center gap-2">
                            {getTransactionIcon(tx.type, tx.amount)}
                            {tx.description || 'No description'}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          {tx.is_expiring !== undefined && (
                            <div className="flex items-center justify-center gap-1">
                              {tx.is_expiring ? (
                                <>
                                  <Clock className="h-3 w-3 text-orange-500" />
                                  <span className="text-xs text-muted-foreground">Expiring</span>
                                </>
                              ) : (
                                <>
                                  <Infinity className="h-3 w-3 text-blue-500" />
                                  <span className="text-xs text-muted-foreground">Permanent</span>
                                </>
                              )}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className={cn(
                          "text-right font-mono font-semibold",
                          tx.amount >= 0 ? "text-green-600" : "text-red-600"
                        )}>
                          {formatAmount(tx.amount)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {formatBalance(tx.balance_after)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {data?.pagination && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-muted-foreground">
                    Showing {offset + 1}-{Math.min(offset + limit, (data as any)?.pagination?.total || 0)} of {(data as any)?.pagination?.total || 0} transactions
                  </p>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handlePrevPage}
                      disabled={offset === 0}
                    >
                      Previous
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleNextPage}
                      disabled={!(data as any)?.pagination?.has_more}
                    >
                      Next
                    </Button>
                  </div>
                </div>
              )}
            </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
} 