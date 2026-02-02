import { backendApi } from '@/lib/api-client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// ============================================================================
// TYPES
// ============================================================================

export interface EnterpriseAdminStatus {
  is_admin: boolean;
  is_omni: boolean;
  email: string | null;
  enterprise_mode: boolean;
}

export interface EnterprisePoolStatus {
  credit_balance: number;
  total_loaded: number;
  total_used: number;
  created_at?: string;
  updated_at?: string;
}

export interface EnterpriseUser {
  account_id: string;
  email: string | null;
  monthly_limit: number;
  current_month_usage: number;
  remaining: number;
  is_active: boolean;
  last_reset_at?: string;
  usage_percentage: number;
  created_at?: string;
}

export interface EnterpriseUsageRecord {
  id: string;
  cost: number;
  model_name: string;
  tokens_used: number;
  thread_id?: string;
  message_id?: string;
  created_at: string;
}

export interface EnterpriseCreditLoad {
  id: string;
  amount: number;
  type: 'load' | 'negate';
  description?: string;
  performed_by: string;
  balance_after: number;
  created_at: string;
}

export interface EnterpriseStats {
  pool: {
    balance: number;
    total_loaded: number;
    total_used: number;
  };
  users: {
    total: number;
    active: number;
  };
  usage: {
    total_all_time: number;
    transaction_count: number;
  };
}

// ============================================================================
// HOOKS
// ============================================================================

/**
 * Check if current user is an enterprise admin
 */
export function useEnterpriseAdminCheck() {
  return useQuery({
    queryKey: ['enterprise', 'admin-check'],
    queryFn: async (): Promise<EnterpriseAdminStatus> => {
      const response = await backendApi.get('/admin/enterprise/check-admin');
      return response.data;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: false,
  });
}

/**
 * Get enterprise pool status
 */
export function useEnterprisePoolStatus() {
  return useQuery({
    queryKey: ['enterprise', 'pool-status'],
    queryFn: async (): Promise<EnterprisePoolStatus> => {
      const response = await backendApi.get('/admin/enterprise/pool-status');
      return response.data;
    },
    staleTime: 30 * 1000, // 30 seconds
  });
}

/**
 * Get enterprise users list
 */
export function useEnterpriseUsers(params: {
  page?: number;
  page_size?: number;
  search_email?: string;
  active_only?: boolean;
} = {}) {
  return useQuery({
    queryKey: ['enterprise', 'users', params],
    queryFn: async (): Promise<EnterpriseUser[]> => {
      const searchParams = new URLSearchParams();
      if (params.page) searchParams.set('page', params.page.toString());
      if (params.page_size) searchParams.set('page_size', params.page_size.toString());
      if (params.search_email) searchParams.set('search_email', params.search_email);
      if (params.active_only) searchParams.set('active_only', 'true');
      
      const queryString = searchParams.toString();
      const url = `/admin/enterprise/users${queryString ? `?${queryString}` : ''}`;
      const response = await backendApi.get(url);
      return response.data;
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Get enterprise user details
 */
export function useEnterpriseUserDetails(accountId: string) {
  return useQuery({
    queryKey: ['enterprise', 'user', accountId],
    queryFn: async () => {
      const response = await backendApi.get(`/admin/enterprise/users/${accountId}`);
      return response.data;
    },
    enabled: !!accountId,
  });
}

/**
 * Get user usage history
 */
export function useEnterpriseUserUsage(accountId: string, limit: number = 50) {
  return useQuery({
    queryKey: ['enterprise', 'user-usage', accountId, limit],
    queryFn: async () => {
      const response = await backendApi.get(`/admin/enterprise/users/${accountId}/usage?limit=${limit}`);
      return response.data;
    },
    enabled: !!accountId,
  });
}

/**
 * Get credit load history
 */
export function useEnterpriseCreditHistory(limit: number = 50) {
  return useQuery({
    queryKey: ['enterprise', 'credit-history', limit],
    queryFn: async (): Promise<{ history: EnterpriseCreditLoad[]; count: number }> => {
      const response = await backendApi.get(`/admin/enterprise/credit-history?limit=${limit}`);
      return response.data;
    },
    staleTime: 30 * 1000,
  });
}

/**
 * Get enterprise stats
 */
export function useEnterpriseStats() {
  return useQuery({
    queryKey: ['enterprise', 'stats'],
    queryFn: async (): Promise<EnterpriseStats> => {
      const response = await backendApi.get('/admin/enterprise/stats');
      return response.data;
    },
    staleTime: 60 * 1000, // 1 minute
  });
}

// ============================================================================
// MUTATIONS
// ============================================================================

/**
 * Load credits into enterprise pool
 */
export function useLoadCredits() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { amount: number; description?: string }) => {
      const response = await backendApi.post('/admin/enterprise/load-credits', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enterprise', 'pool-status'] });
      queryClient.invalidateQueries({ queryKey: ['enterprise', 'credit-history'] });
      queryClient.invalidateQueries({ queryKey: ['enterprise', 'stats'] });
    },
  });
}

/**
 * Negate credits from enterprise pool
 */
export function useNegateCredits() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { amount: number; description?: string }) => {
      const response = await backendApi.post('/admin/enterprise/negate-credits', data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enterprise', 'pool-status'] });
      queryClient.invalidateQueries({ queryKey: ['enterprise', 'credit-history'] });
      queryClient.invalidateQueries({ queryKey: ['enterprise', 'stats'] });
    },
  });
}

/**
 * Update user monthly limit
 */
export function useUpdateUserLimit() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (data: { accountId: string; monthly_limit: number }) => {
      const response = await backendApi.post(
        `/admin/enterprise/users/${data.accountId}/limit`,
        { monthly_limit: data.monthly_limit }
      );
      return response.data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['enterprise', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['enterprise', 'user', variables.accountId] });
    },
  });
}

/**
 * Deactivate user
 */
export function useDeactivateUser() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (accountId: string) => {
      const response = await backendApi.post(`/admin/enterprise/users/${accountId}/deactivate`);
      return response.data;
    },
    onSuccess: (_, accountId) => {
      queryClient.invalidateQueries({ queryKey: ['enterprise', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['enterprise', 'user', accountId] });
      queryClient.invalidateQueries({ queryKey: ['enterprise', 'stats'] });
    },
  });
}

/**
 * Reactivate user
 */
export function useReactivateUser() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async (accountId: string) => {
      const response = await backendApi.post(`/admin/enterprise/users/${accountId}/reactivate`);
      return response.data;
    },
    onSuccess: (_, accountId) => {
      queryClient.invalidateQueries({ queryKey: ['enterprise', 'users'] });
      queryClient.invalidateQueries({ queryKey: ['enterprise', 'user', accountId] });
      queryClient.invalidateQueries({ queryKey: ['enterprise', 'stats'] });
    },
  });
}

/**
 * Manually trigger monthly reset
 */
export function useResetMonthlyUsage() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async () => {
      const response = await backendApi.post('/admin/enterprise/reset-monthly-usage');
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['enterprise'] });
    },
  });
}

// ============================================================================
// REFRESH HELPERS
// ============================================================================

export function useRefreshEnterpriseData() {
  const queryClient = useQueryClient();
  
  return {
    refreshPoolStatus: () => {
      queryClient.invalidateQueries({ queryKey: ['enterprise', 'pool-status'] });
    },
    refreshUsers: () => {
      queryClient.invalidateQueries({ queryKey: ['enterprise', 'users'] });
    },
    refreshStats: () => {
      queryClient.invalidateQueries({ queryKey: ['enterprise', 'stats'] });
    },
    refreshAll: () => {
      queryClient.invalidateQueries({ queryKey: ['enterprise'] });
    },
  };
}
