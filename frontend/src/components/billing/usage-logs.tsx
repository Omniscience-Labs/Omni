'use client';

import { useEffect, useState, useMemo } from 'react';
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ExternalLink, Loader2 } from 'lucide-react';
import { isLocalMode } from '@/lib/config';
import { useAvailableModels } from '@/hooks/react-query/subscriptions/use-model';

interface UsageLogEntry {
  message_id: string;
  thread_id: string;
  created_at: string;
  content: {
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
    };
    model: string;
  };
  total_tokens: number;
  estimated_cost: number | string;
  project_id: string;
}

interface DailyUsage {
  date: string;
  logs: UsageLogEntry[];
  totalTokens: number;
  totalCost: number;
  requestCount: number;
  models: string[];
}

interface Props {
  accountId: string;
}

export default function UsageLogs({ accountId }: Props) {
  const [usageLogs, setUsageLogs] = useState<UsageLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Use React Query hook instead of manual fetching
  const {
    data: modelsData,
    isLoading: isLoadingModels,
    error: modelsError,
  } = useAvailableModels();

  const ITEMS_PER_PAGE = 1000;

  // Helper function to normalize model names for better matching
  const normalizeModelName = (name: string): string => {
    return name
      .toLowerCase()
      .replace(/[-_.]/g, '') // Remove hyphens, underscores, dots
      .replace(/\s+/g, '') // Remove spaces
      .replace(/latest$/, '') // Remove 'latest' suffix
      .replace(/preview$/, '') // Remove 'preview' suffix
      .replace(/\d{8}$/, ''); // Remove date suffixes like 20250514
  };

  // Helper function to find matching pricing for a model
  const findModelPricing = (
    modelName: string,
    pricingData: Record<string, { input: number; output: number }>,
  ) => {
    // Direct match first
    if (pricingData[modelName]) {
      return pricingData[modelName];
    }

    // Try normalized matching
    const normalizedTarget = normalizeModelName(modelName);

    for (const [pricingKey, pricingValue] of Object.entries(pricingData)) {
      const normalizedKey = normalizeModelName(pricingKey);

      // Exact normalized match
      if (normalizedKey === normalizedTarget) {
        return pricingValue;
      }

      // Partial matches - check if one contains the other
      if (
        normalizedKey.includes(normalizedTarget) ||
        normalizedTarget.includes(normalizedKey)
      ) {
        return pricingValue;
      }

      // Try matching without provider prefix from pricing key
      const keyWithoutProvider = pricingKey.replace(/^[^\/]+\//, '');
      const normalizedKeyWithoutProvider =
        normalizeModelName(keyWithoutProvider);

      if (
        normalizedKeyWithoutProvider === normalizedTarget ||
        normalizedKeyWithoutProvider.includes(normalizedTarget) ||
        normalizedTarget.includes(normalizedKeyWithoutProvider)
      ) {
        return pricingValue;
      }

      // Try matching the end part of the pricing key with the model name
      const pricingKeyParts = pricingKey.split('/');
      const lastPart = pricingKeyParts[pricingKeyParts.length - 1];
      const normalizedLastPart = normalizeModelName(lastPart);

      if (
        normalizedLastPart === normalizedTarget ||
        normalizedLastPart.includes(normalizedTarget) ||
        normalizedTarget.includes(normalizedLastPart)
      ) {
        return pricingValue;
      }
    }

    console.log(`No pricing match found for: "${modelName}"`);
    return null;
  };

  // Create pricing lookup from models data
  const modelPricing = useMemo(() => {
    if (!modelsData?.models) {
      return {};
    }

    const pricing: Record<string, { input: number; output: number }> = {};
    modelsData.models.forEach((model) => {
      if (
        model.input_cost_per_million_tokens &&
        model.output_cost_per_million_tokens
      ) {
        // Use the model.id as the key, which should match the model names in usage logs
        pricing[model.id] = {
          input: model.input_cost_per_million_tokens,
          output: model.output_cost_per_million_tokens,
        };

        // Also try to match by display_name and short_name if they exist
        if (model.display_name && model.display_name !== model.id) {
          pricing[model.display_name] = {
            input: model.input_cost_per_million_tokens,
            output: model.output_cost_per_million_tokens,
          };
        }

        if (model.short_name && model.short_name !== model.id) {
          pricing[model.short_name] = {
            input: model.input_cost_per_million_tokens,
            output: model.output_cost_per_million_tokens,
          };
        }
      }
    });

    console.log(
      'Pricing lookup ready with',
      Object.keys(pricing).length,
      'entries',
    );
    return pricing;
  }, [modelsData, isLoadingModels, modelsError]);

  const calculateTokenCost = (
    promptTokens: number,
    completionTokens: number,
    model: string,
  ): number | string => {
    // Use the more lenient matching function
    const costs = findModelPricing(model, modelPricing);

    if (costs) {
      // Convert from per-million to per-token costs
      return (
        (promptTokens / 1000000) * costs.input +
        (completionTokens / 1000000) * costs.output
      );
    }

    // Return "unknown" instead of fallback cost
    return 'unknown';
  };

  const fetchUsageLogs = async (
    pageNum: number = 0,
    append: boolean = false,
  ) => {
    try {
      if (!append) setLoading(true);
      else setLoadingMore(true);

      const supabase = createClient();

      // First, get all thread IDs for this user
      const { data: threads, error: threadsError } = await supabase
        .from('threads')
        .select('thread_id')
        .eq('account_id', accountId);

      if (threadsError) throw threadsError;

      if (!threads || threads.length === 0) {
        setUsageLogs([]);
        setLoading(false);
        setLoadingMore(false);
        setHasMore(false);
        return;
      }

      const threadIds = threads.map((t) => t.thread_id);

      // Then fetch usage messages with pagination, including thread project info
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select(
          `
          message_id, 
          thread_id, 
          created_at, 
          content,
          threads!inner(project_id)
        `,
        )
        .in('thread_id', threadIds)
        .eq('type', 'assistant_response_end')
        .order('created_at', { ascending: false })
        .range(pageNum * ITEMS_PER_PAGE, (pageNum + 1) * ITEMS_PER_PAGE - 1);

      if (messagesError) throw messagesError;

      const processedLogs: UsageLogEntry[] = (messages || []).map((message) => {
        const usage = message.content?.usage || {
          prompt_tokens: 0,
          completion_tokens: 0,
        };
        const model = message.content?.model || 'unknown';
        const totalTokens = usage.prompt_tokens + usage.completion_tokens;
        const estimatedCost = calculateTokenCost(
          usage.prompt_tokens,
          usage.completion_tokens,
          model,
        );

        return {
          message_id: message.message_id,
          thread_id: message.thread_id,
          created_at: message.created_at,
          content: {
            usage,
            model,
          },
          total_tokens: totalTokens,
          estimated_cost: estimatedCost,
          project_id: message.threads?.[0]?.project_id || 'unknown',
        };
      });

      if (append) {
        setUsageLogs((prev) => [...prev, ...processedLogs]);
      } else {
        setUsageLogs(processedLogs);
      }

      setHasMore(processedLogs.length === ITEMS_PER_PAGE);
    } catch (err) {
      console.error('Error fetching usage logs:', err);
      setError(
        err instanceof Error ? err.message : 'Failed to fetch usage logs',
      );
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    // Only fetch usage logs after models data is loaded
    if (!isLoadingModels && modelsData) {
      fetchUsageLogs(0, false);
    }
  }, [accountId, isLoadingModels, modelsData]);

  const loadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchUsageLogs(nextPage, true);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatCost = (cost: number | string) => {
    if (typeof cost === 'string') {
      return cost;
    }
    return `$${cost.toFixed(4)}`;
  };

  const formatDateOnly = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const handleThreadClick = (threadId: string, projectId: string) => {
    // Navigate to the thread using the correct project_id
    const threadUrl = `/projects/${projectId}/thread/${threadId}`;
    window.open(threadUrl, '_blank');
  };

  // Group usage logs by date
  const groupLogsByDate = (logs: UsageLogEntry[]): DailyUsage[] => {
    const grouped = logs.reduce(
      (acc, log) => {
        const date = new Date(log.created_at).toDateString();

        if (!acc[date]) {
          acc[date] = {
            date,
            logs: [],
            totalTokens: 0,
            totalCost: 0,
            requestCount: 0,
            models: [],
          };
        }

        acc[date].logs.push(log);
        acc[date].totalTokens += log.total_tokens;
        acc[date].totalCost +=
          typeof log.estimated_cost === 'number' ? log.estimated_cost : 0;
        acc[date].requestCount += 1;

        if (!acc[date].models.includes(log.content.model)) {
          acc[date].models.push(log.content.model);
        }

        return acc;
      },
      {} as Record<string, DailyUsage>,
    );

    return Object.values(grouped).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  };

  if (isLocalMode()) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Usage Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-muted/30 border border-border rounded-lg text-center">
            <p className="text-sm text-muted-foreground">
              Usage logs are not available in local development mode
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading || isLoadingModels) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Usage Logs</CardTitle>
          <CardDescription>Loading your token usage history...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || modelsError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Usage Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
            <p className="text-sm text-destructive">
              Error:{' '}
              {error ||
                (modelsError instanceof Error
                  ? modelsError.message
                  : 'Failed to load data')}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const dailyUsage = groupLogsByDate(usageLogs);
  const totalUsage = usageLogs.reduce(
    (sum, log) =>
      sum + (typeof log.estimated_cost === 'number' ? log.estimated_cost : 0),
    0,
  );

  return (
    <div className="space-y-6">
      {/* Usage Logs Accordion */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Usage Logs</CardTitle>
          <CardDescription>
            Your token usage organized by day, sorted by most recent
          </CardDescription>
        </CardHeader>
        <CardContent>
          {dailyUsage.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground">No usage logs found.</p>
            </div>
          ) : (
            <>
              <Accordion type="single" collapsible className="w-full">
                {dailyUsage.map((day) => (
                  <AccordionItem key={day.date} value={day.date}>
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex justify-between items-center w-full mr-4">
                        <div className="text-left">
                          <div className="font-semibold">
                            {formatDateOnly(day.date)}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {day.requestCount} request
                            {day.requestCount !== 1 ? 's' : ''} •{' '}
                            {day.models.join(', ')}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-mono font-semibold">
                            {formatCost(day.totalCost)}
                          </div>
                          <div className="text-sm text-muted-foreground font-mono">
                            {day.totalTokens.toLocaleString()} tokens
                          </div>
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="rounded-md border mt-4">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Time</TableHead>
                              <TableHead>Model</TableHead>
                              <TableHead className="text-right">
                                Compute
                              </TableHead>
                              <TableHead className="text-right">Cost</TableHead>
                              <TableHead className="text-center">
                                Thread
                              </TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {day.logs.map((log) => (
                              <TableRow key={log.message_id}>
                                <TableCell className="font-mono text-sm">
                                  {new Date(
                                    log.created_at,
                                  ).toLocaleTimeString()}
                                </TableCell>
                                <TableCell>
                                  <Badge className="font-mono text-xs">
                                    {log.content.model}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right font-mono font-medium text-sm">
                                  {log.total_tokens.toLocaleString()}
                                </TableCell>
                                <TableCell className="text-right font-mono font-medium text-sm">
                                  {formatCost(log.estimated_cost)}
                                </TableCell>
                                <TableCell className="text-center">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() =>
                                      handleThreadClick(
                                        log.thread_id,
                                        log.project_id,
                                      )
                                    }
                                    className="h-8 w-8 p-0"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>

              {hasMore && (
                <div className="flex justify-center pt-6">
                  <Button
                    onClick={loadMore}
                    disabled={loadingMore}
                    variant="outline"
                  >
                    {loadingMore ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      'Load More'
                    )}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
