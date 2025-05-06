'use client';

import {
  useQuery,
  useMutation,
  UseQueryOptions,
  UseMutationOptions,
  QueryKey,
} from '@tanstack/react-query';
import { toast } from 'sonner';

type QueryKeyValue = readonly unknown[];
type QueryKeyFunction = (...args: any[]) => QueryKeyValue;
type QueryKeyItem = QueryKeyValue | QueryKeyFunction;

export const createQueryKeys = <T extends Record<string, QueryKeyItem>>(
  keys: T,
): T => keys;

export function createQueryHook<
  TData,
  TError = Error,
  TQueryKey extends QueryKey = QueryKey,
>(
  queryKey: TQueryKey,
  queryFn: () => Promise<TData>,
  options?: Omit<
    UseQueryOptions<TData, TError, TData, TQueryKey>,
    'queryKey' | 'queryFn'
  >,
) {
  return (
    customOptions?: Omit<
      UseQueryOptions<TData, TError, TData, TQueryKey>,
      'queryKey' | 'queryFn'
    >,
  ) => {
    return useQuery<TData, TError, TData, TQueryKey>({
      queryKey,
      queryFn,
      ...options,
      ...customOptions,
    });
  };
}

export function createMutationHook<
  TData,
  TVariables,
  TError = Error,
  TContext = unknown,
>(
  mutationFn: (variables: TVariables) => Promise<TData>,
  options?: Omit<
    UseMutationOptions<TData, TError, TVariables, TContext>,
    'mutationFn'
  >,
) {
  return (
    customOptions?: Omit<
      UseMutationOptions<TData, TError, TVariables, TContext>,
      'mutationFn'
    >,
  ) => {
    return useMutation<TData, TError, TVariables, TContext>({
      mutationFn,
      onError: (error, variables, context) => {
        toast.error(
          `An error occurred: ${error instanceof Error ? error.message : String(error)}`,
        );
        options?.onError?.(error, variables, context);
        customOptions?.onError?.(error, variables, context);
      },
      ...options,
      ...customOptions,
    });
  };
}
