/**
 * Receipt Management React Hooks
 * 
 * Custom hooks for managing receipt data state and API interactions.
 * Provides reactive data management with loading states, error handling,
 * and automatic refetching capabilities.
 * 
 * Hooks:
 * - useReceipts: Manages collection of all receipts
 * - useReceipt: Manages individual receipt data by ID
 * 
 * Features:
 * - Automatic data fetching on mount
 * - Loading and error state management  
 * - Manual refetch capability
 * - Memoized callbacks to prevent unnecessary re-renders
 */

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client';

/**
 * Hook for managing all receipts data using React Query
 * Returns a stable API similar to the previous hook
 */
export const useReceipts = () => {
  const query = useQuery({ queryKey: ['receipts'], queryFn: () => apiClient.getReceipts() });
  return {
    receipts: query.data || [],
    loading: query.isLoading,
    error: query.error ? (query.error.message || query.error) : null,
    refetch: query.refetch,
  };
};

/**
 * Hook for managing individual receipt data
 * 
 * @param {string} receiptId - MongoDB ObjectId of the receipt
 * @returns {Object} { receipt: Object|null, loading: boolean, error: string|null, refetch: Function }
 */
export const useReceipt = (receiptId) => {
  const query = useQuery({ queryKey: ['receipt', receiptId], queryFn: () => apiClient.getReceipt(receiptId), enabled: !!receiptId });
  return {
    receipt: query.data || null,
    loading: query.isLoading,
    error: query.error ? (query.error.message || query.error) : null,
    refetch: query.refetch,
  };
};

export const useClaims = () => {
  const queryClient = useQueryClient();

  // claim mutation with optimistic update
  const claimMutation = useMutation({
    mutationFn: ({ receiptId, itemId, userId }) => apiClient.claimItem(receiptId, itemId, userId),
    onMutate: async ({ receiptId, itemId, userId }) => {
      await queryClient.cancelQueries({ queryKey: ['receipt', receiptId] });
      await queryClient.cancelQueries({ queryKey: ['receipts'] });

      const prevReceipt = queryClient.getQueryData({ queryKey: ['receipt', receiptId] });
      const prevReceipts = queryClient.getQueryData({ queryKey: ['receipts'] });

      // Optimistically update single receipt
      if (prevReceipt) {
        const newReceipt = {
          ...prevReceipt,
          items: (prevReceipt.items || []).map(it => it.id === itemId ? { ...it, claimedBy: userId, claimedAt: new Date().toISOString(), pendingClaim: true } : it)
        };
        queryClient.setQueryData({ queryKey: ['receipt', receiptId] }, newReceipt);
      }

      // Update receipts list if present
      if (prevReceipts) {
        const newList = (prevReceipts || []).map(r => {
          if (r.id !== receiptId) return r;
          return {
            ...r,
            items: (r.items || []).map(it => it.id === itemId ? { ...it, claimedBy: userId, pendingClaim: true } : it)
          };
        });
        queryClient.setQueryData({ queryKey: ['receipts'] }, newList);
      }

      return { prevReceipt, prevReceipts };
    },
    onError: (err, variables, context) => {
      // rollback
      if (context?.prevReceipt) {
        queryClient.setQueryData({ queryKey: ['receipt', variables.receiptId] }, context.prevReceipt);
      }
      if (context?.prevReceipts) {
        queryClient.setQueryData({ queryKey: ['receipts'] }, context.prevReceipts);
      }
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['receipt', variables.receiptId] });
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
    }
  });

  const unclaimMutation = useMutation({
    mutationFn: ({ receiptId, itemId }) => apiClient.unclaimItem(itemId),
    onMutate: async ({ receiptId, itemId }) => {
      await queryClient.cancelQueries({ queryKey: ['receipt', receiptId] });
      await queryClient.cancelQueries({ queryKey: ['receipts'] });

      const prevReceipt = queryClient.getQueryData({ queryKey: ['receipt', receiptId] });
      const prevReceipts = queryClient.getQueryData({ queryKey: ['receipts'] });

      if (prevReceipt) {
        const newReceipt = {
          ...prevReceipt,
          items: (prevReceipt.items || []).map(it => it.id === itemId ? { ...it, claimedBy: null, claimedAt: null, pendingUnclaim: true } : it)
        };
        queryClient.setQueryData({ queryKey: ['receipt', receiptId] }, newReceipt);
      }

      if (prevReceipts) {
        const newList = (prevReceipts || []).map(r => {
          if (r.id !== receiptId) return r;
          return {
            ...r,
            items: (r.items || []).map(it => it.id === itemId ? { ...it, claimedBy: null } : it)
          };
        });
        queryClient.setQueryData({ queryKey: ['receipts'] }, newList);
      }

      return { prevReceipt, prevReceipts };
    },
    onError: (err, variables, context) => {
      if (context?.prevReceipt) {
        queryClient.setQueryData({ queryKey: ['receipt', variables.receiptId] }, context.prevReceipt);
      }
      if (context?.prevReceipts) {
        queryClient.setQueryData({ queryKey: ['receipts'] }, context.prevReceipts);
      }
    },
    onSettled: (data, error, variables) => {
      queryClient.invalidateQueries({ queryKey: ['receipt', variables.receiptId] });
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      // If a userId was provided, also invalidate their claims list
      if (variables?.userId) {
        queryClient.invalidateQueries({ queryKey: ['userClaims', variables.userId] });
      }
    }
  });

  const claimItem = useCallback((receiptId, itemId, userId) => {
    return claimMutation.mutateAsync({ receiptId, itemId, userId });
  }, [claimMutation]);

  const unclaimItem = useCallback((receiptId, itemId, userId) => {
    return unclaimMutation.mutateAsync({ receiptId, itemId, userId });
  }, [unclaimMutation]);

  return {
    claims: [],
    optimisticClaims: new Map(),
    loading: claimMutation.isLoading || unclaimMutation.isLoading,
    error: claimMutation.error || unclaimMutation.error || null,
    claimItem,
    unclaimItem,
  };
};

// Hook to fetch claims for a specific user
export const useUserClaims = (userId) => {
  const query = useQuery({ queryKey: ['userClaims', userId], queryFn: () => apiClient.getUserClaims(userId), enabled: !!userId });
  return {
    claims: query.data || [],
    loading: query.isLoading,
    error: query.error ? (query.error.message || query.error) : null,
    refetch: query.refetch,
  };
};
