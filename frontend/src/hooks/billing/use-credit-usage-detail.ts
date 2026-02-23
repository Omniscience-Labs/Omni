import { useQuery } from '@tanstack/react-query';
import { backendApi } from '@/lib/api-client';
import { accountStateKeys } from './use-account-state';

export interface UsageRecord {
  time: string;
  type_display: string;
  prompt_tokens: number;
  completion_tokens: number;
  tool_cost: number;
  total_cost: number;
  credits: number;
}

export interface ThreadUsageDetail {
  thread_id: string;
  project_id: string | null;
  project_name: string;
  total_requests: number;
  total_credits: number;
  total_cost: number;
  usage_records: UsageRecord[];
}

export interface DayUsage {
  date: string;
  date_display: string;
  total_credits: number;
  total_cost: number;
  threads: ThreadUsageDetail[];
}

export interface CreditUsageDetailResponse {
  daily_usage: DayUsage[];
  summary: {
    total_credits_used: number;
    total_cost: number;
    start_date: string;
    end_date: string;
  };
}

interface UseCreditUsageDetailParams {
  days?: number;
  startDate?: Date;
  endDate?: Date;
}

export function useCreditUsageDetail({
  days,
  startDate,
  endDate,
}: UseCreditUsageDetailParams = {}) {
  return useQuery<CreditUsageDetailResponse>({
    queryKey: [
      ...accountStateKeys.all,
      'credit-usage-detail',
      days,
      startDate?.toISOString(),
      endDate?.toISOString(),
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (startDate && endDate) {
        params.append('start_date', startDate.toISOString());
        params.append('end_date', endDate.toISOString());
      } else if (days) {
        params.append('days', days.toString());
      } else {
        params.append('days', '30');
      }
      const response = await backendApi.get(
        `/billing/credit-usage-detail?${params.toString()}`
      );
      if (response.error) {
        throw new Error(response.error.message);
      }
      return response.data;
    },
    staleTime: 30000,
  });
}
