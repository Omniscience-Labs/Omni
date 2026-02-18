'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import type { DateRange } from 'react-day-picker';
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
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { DateRangePicker } from '@/components/ui/date-range-picker';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle, ChevronDown, ChevronRight, ExternalLink, TrendingDown } from 'lucide-react';
import { useCreditUsageDetail } from '@/hooks/billing/use-credit-usage-detail';
import { formatCredits } from '@/lib/utils/credit-formatter';
import { isEnterpriseMode } from '@/lib/config';
import type { DayUsage, ThreadUsageDetail, UsageRecord } from '@/hooks/billing/use-credit-usage-detail';

function TypeBadge({ typeDisplay }: { typeDisplay: string }) {
  const isTool = typeDisplay.startsWith('Tool - ');
  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${
        isTool ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
      }`}
    >
      {typeDisplay}
    </span>
  );
}

function ThreadRow({
  thread,
  useDollars,
  onThreadClick,
}: {
  thread: ThreadUsageDetail;
  useDollars: boolean;
  onThreadClick: (threadId: string, projectId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const totalDisplay = useDollars
    ? `$${thread.total_cost.toFixed(2)}`
    : formatCredits(thread.total_credits);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-lg border bg-card">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors rounded-lg"
          >
            <div className="flex items-center gap-2 min-w-0">
              {open ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="font-medium truncate">{thread.project_name}</span>
              <button
                type="button"
                className="p-1 -m-1 rounded hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  onThreadClick(thread.thread_id, thread.project_id);
                }}
              >
                <ExternalLink className="h-3 w-3 shrink-0 text-muted-foreground" />
              </button>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <span className="font-medium tabular-nums">{totalDisplay}</span>
              <span className="text-xs text-muted-foreground">
                {formatCredits(thread.total_credits)} credits
              </span>
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="border-t px-4 pb-4 pt-2">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-b">
                  <TableHead className="w-[100px]">Time</TableHead>
                  <TableHead className="w-[140px]">Type</TableHead>
                  <TableHead className="text-right">Prompt</TableHead>
                  <TableHead className="text-right">Completion</TableHead>
                  <TableHead className="text-right">Tool</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {thread.usage_records.map((record: UsageRecord, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-sm">{record.time}</TableCell>
                    <TableCell>
                      <TypeBadge typeDisplay={record.type_display} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {record.prompt_tokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {record.completion_tokens.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {record.tool_cost > 0
                        ? useDollars
                          ? `$${record.tool_cost.toFixed(2)}`
                          : formatCredits(Math.round(record.tool_cost * 100))
                        : '0'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {useDollars ? `$${record.total_cost.toFixed(2)}` : formatCredits(record.credits)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatCredits(record.credits)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function DaySection({
  day,
  useDollars,
  onThreadClick,
}: {
  day: DayUsage;
  useDollars: boolean;
  onThreadClick: (threadId: string, projectId: string | null) => void;
}) {
  const [open, setOpen] = useState(true);
  const totalDisplay = useDollars
    ? `$${day.total_cost.toFixed(2)}`
    : formatCredits(day.total_credits);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-xl border bg-card overflow-hidden">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between p-4 hover:bg-muted/30 transition-colors"
          >
            <div className="flex items-center gap-2">
              {open ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="font-semibold">{day.date_display}</span>
            </div>
            <div className="flex flex-col items-end">
              <span className="font-semibold tabular-nums">{totalDisplay}</span>
              <span className="text-xs text-muted-foreground">
                {formatCredits(day.total_credits)} credits
              </span>
            </div>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="space-y-2 px-4 pb-4">
            {day.threads.map((thread) => (
              <ThreadRow
                key={thread.thread_id}
                thread={thread}
                useDollars={useDollars}
                onThreadClick={onThreadClick}
              />
            ))}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export default function DailyUsageLogs() {
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(new Date().setDate(new Date().getDate() - 29)),
    to: new Date(),
  });

  const { data, isLoading, error } = useCreditUsageDetail({
    startDate: dateRange?.from,
    endDate: dateRange?.to,
  });

  const useDollars = isEnterpriseMode();

  const handleThreadClick = (threadId: string, projectId: string | null) => {
    if (projectId) {
      window.open(`/projects/${projectId}/thread/${threadId}`, '_blank');
    }
  };

  const handleDateRangeUpdate = (values: { range: DateRange }) => {
    setDateRange(values.range);
  };

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Daily Usage Logs</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>
              {error.message || 'Failed to load usage details'}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Daily Usage Logs</CardTitle>
                <CardDescription className="mt-1">
                  Per-cost breakdown of prompt and tool usage by project
                </CardDescription>
              </div>
              <Skeleton className="h-10 w-[280px]" />
            </div>
          </CardHeader>
        </Card>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const dailyUsage = data?.daily_usage || [];
  const summary = data?.summary;

  return (
    <div className="space-y-6 min-w-0 max-w-full">
      {summary && (
        <Card className="w-full">
          <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base sm:text-lg">Total Usage</CardTitle>
              <CardDescription className="mt-1 sm:mt-2 text-xs sm:text-sm">
                {dateRange.from && dateRange.to
                  ? `${format(dateRange.from, 'MMM dd, yyyy')} - ${format(dateRange.to, 'MMM dd, yyyy')}`
                  : 'Selected period'}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <TrendingDown className="h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground flex-shrink-0" />
              <div>
                <div className="text-xl sm:text-3xl font-semibold">
                  {useDollars
                    ? `$${summary.total_cost.toFixed(2)}`
                    : formatCredits(summary.total_credits_used)}
                </div>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  {useDollars ? 'Amount consumed' : 'Credits consumed'}
                </p>
              </div>
            </div>
          </CardHeader>
        </Card>
      )}

      <Card className="p-0 bg-transparent shadow-none border-none">
        <CardHeader className="px-0">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <CardTitle className="text-base sm:text-lg">Daily Usage Logs</CardTitle>
              <CardDescription className="mt-1 sm:mt-2 text-xs sm:text-sm">
                Per-cost breakdown of prompt and tool usage within each project
              </CardDescription>
            </div>
            <DateRangePicker
              initialDateFrom={dateRange.from}
              initialDateTo={dateRange.to}
              onUpdate={handleDateRangeUpdate}
              align="end"
            />
          </div>
        </CardHeader>
        <CardContent className="px-0">
          {dailyUsage.length === 0 ? (
            <div className="text-center py-12 rounded-xl border bg-muted/20">
              <p className="text-muted-foreground text-sm">
                {dateRange.from && dateRange.to
                  ? `No usage found between ${format(dateRange.from, 'MMM dd, yyyy')} and ${format(
                      dateRange.to,
                      'MMM dd, yyyy'
                    )}.`
                  : 'No usage found.'}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {dailyUsage.map((day) => (
                <DaySection
                  key={day.date}
                  day={day}
                  useDollars={useDollars}
                  onThreadClick={handleThreadClick}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
