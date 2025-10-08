import { useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/lib/api/client';
import { conditionalFetch } from '@/lib/utils/http';

export const useReceipts = ({ pollIntervalMs = 15000 } = {}) => {
  const queryClient = useQueryClient();
  const isClient = typeof window !== 'undefined';

  const query = useQuery({
    queryKey: ['receipts'],
    queryFn: async () => {
      const prev = queryClient.getQueryData(['receipts']);
      const data = await conditionalFetch('/api/receipts', prev);
      if (data?.__notModified) return prev || [];
      return data || [];
    },
    staleTime: 5000, // Consider data fresh for 5 seconds
    refetchInterval: isClient ? () => (document.visibilityState === 'visible' ? pollIntervalMs : false) : false,
    refetchOnWindowFocus: true, // Changed from 'always' to true - refetch but respect staleTime
    refetchOnMount: true, // Changed from 'always' to true - refetch but respect staleTime
  });

  return {
    receipts: query.data || [],
    loading: query.isLoading,
    error: query.error ? (query.error.message || query.error) : null,
    refetch: query.refetch,
  };
};

export const useReceiptMutations = () => {
  const queryClient = useQueryClient();

  const deleteMutation = useMutation({
    mutationFn: (receiptId) => apiClient.deleteReceipt(receiptId),
    onMutate: async (receiptId) => {
      await queryClient.cancelQueries({ queryKey: ['receipts'] });
      await queryClient.cancelQueries({ queryKey: ['receipt', receiptId] });

      const prevReceipts = queryClient.getQueryData({ queryKey: ['receipts'] });
      const prevReceipt = queryClient.getQueryData({ queryKey: ['receipt', receiptId] });

      if (prevReceipts) {
        const newList = prevReceipts.filter(r => r.id !== receiptId);
        if (prevReceipts._lastModified) newList._lastModified = prevReceipts._lastModified;
        queryClient.setQueryData({ queryKey: ['receipts'] }, newList);
      }
      queryClient.removeQueries({ queryKey: ['receipt', receiptId] });

      return { prevReceipts, prevReceipt };
    },
    onError: (err, receiptId, context) => {
      if (context?.prevReceipts) queryClient.setQueryData({ queryKey: ['receipts'] }, context.prevReceipts);
      if (context?.prevReceipt) queryClient.setQueryData({ queryKey: ['receipt', receiptId] }, context.prevReceipt);
    },
    onSettled: (data, error, receiptId) => {
      queryClient.invalidateQueries({ queryKey: ['receipts'] });
      queryClient.invalidateQueries({ queryKey: ['receipt', receiptId] });
      queryClient.invalidateQueries({ queryKey: ['userClaims'] });
    }
  });

  return {
    deleteReceiptMutate: (receiptId) => deleteMutation.mutate(receiptId),
    deleting: deleteMutation.isLoading,
    deleteError: deleteMutation.error || null,
  };
};

export const useReceipt = (receiptId, { pollIntervalMs = 7000 } = {}) => {
  const queryClient = useQueryClient();
  const isClient = typeof window !== 'undefined';

  const query = useQuery({
    queryKey: ['receipt', receiptId],
    queryFn: async () => {
      if (!receiptId) return null;
      const prev = queryClient.getQueryData(['receipt', receiptId]);
      const data = await conditionalFetch(`/api/receipts/${receiptId}`, prev);
      if (data?.__notModified) return prev || null;
      return data || null;
    },
    enabled: !!receiptId,
    staleTime: 3000, // Consider data fresh for 3 seconds (faster for active receipt)
    refetchInterval: isClient ? () => (document.visibilityState === 'visible' ? pollIntervalMs : false) : false,
    refetchOnWindowFocus: true, // Changed from 'always' to true - refetch but respect staleTime
    refetchOnMount: true, // Changed from 'always' to true - refetch but respect staleTime
  });

  return {
    receipt: query.data || null,
    loading: query.isLoading,
    error: query.error ? (query.error.message || query.error) : null,
    refetch: query.refetch,
  };
};

export const useClaims = () => {
  const queryClient = useQueryClient();
  const optimisticRef = useRef(new Map());

  const claimMutation = useMutation({
    mutationFn: ({ receiptId, itemId, userId }) => apiClient.claimItem(receiptId, itemId, userId),
    onMutate: async ({ receiptId, itemId, userId }) => {
      const prevReceipt = queryClient.getQueryData({ queryKey: ['receipt', receiptId] });
      const prevReceipts = queryClient.getQueryData({ queryKey: ['receipts'] });
      const prevUserClaims = queryClient.getQueryData({ queryKey: ['userClaims', userId] });

      // Cancel queries
      await queryClient.cancelQueries({ queryKey: ['receipt', receiptId] });
      await queryClient.cancelQueries({ queryKey: ['receipts'] });
      await queryClient.cancelQueries({ queryKey: ['userClaims', userId] });

      const optimisticItem = { claimedBy: userId, claimedAt: new Date().toISOString(), pending: true };

      // Update receipt cache
      if (prevReceipt) {
        queryClient.setQueryData({ queryKey: ['receipt', receiptId] }, {
          ...prevReceipt,
          items: prevReceipt.items?.map(it => it.id === itemId ? { ...it, ...optimisticItem } : it)
        });
      }

      // Update receipts list cache
      if (prevReceipts) {
        queryClient.setQueryData({ queryKey: ['receipts'] }, 
          prevReceipts.map(r => r.id !== receiptId ? r : {
            ...r,
            items: r.items?.map(it => it.id === itemId ? { ...it, ...optimisticItem } : it)
          })
        );
      }

      // Optimistically add to userClaims cache
      if (prevUserClaims && prevReceipt) {
        const item = prevReceipt.items?.find(it => it.id === itemId);
        if (item) {
          const optimisticClaim = {
            id: itemId,
            receiptId,
            itemId,
            userId,
            claimedAt: new Date().toISOString(),
            receiptName: prevReceipt.name,
            name: item.name,
            price: item.price,
            priceEUR: item.priceEUR || item.price,
            tags: item.tags || [],
            confidence: item.confidence,
            pending: true
          };
          queryClient.setQueryData(
            { queryKey: ['userClaims', userId] },
            [...prevUserClaims, optimisticClaim]
          );
        }
      }

      optimisticRef.current.set(itemId, { id: itemId, ...optimisticItem });
      return { prevReceipt, prevReceipts, prevUserClaims };
    },
    onError: (err, { receiptId, itemId, userId }, context) => {
      if (context?.prevReceipt) queryClient.setQueryData({ queryKey: ['receipt', receiptId] }, context.prevReceipt);
      if (context?.prevReceipts) queryClient.setQueryData({ queryKey: ['receipts'] }, context.prevReceipts);
      if (context?.prevUserClaims) queryClient.setQueryData({ queryKey: ['userClaims', userId] }, context.prevUserClaims);
      optimisticRef.current.delete(itemId);
    },
    onSuccess: async (data, { receiptId, itemId, userId }) => {
      console.log('[Claim] Success - updating with server data', data);
      
      // Construct the updated item state from the claim response
      const itemUpdate = {
        claimedBy: userId,
        claimedAt: data.claimedAt || new Date().toISOString(),
        pending: false
      };
      
      // Update receipt cache with server data
      const prevReceipt = queryClient.getQueryData({ queryKey: ['receipt', receiptId] });
      if (prevReceipt) {
        queryClient.setQueryData({ queryKey: ['receipt', receiptId] }, {
          ...prevReceipt,
          items: prevReceipt.items?.map(it => it.id === itemId ? { ...it, ...itemUpdate } : it)
        });
      }
      
      // Update receipts list cache with server data
      const prevReceipts = queryClient.getQueryData({ queryKey: ['receipts'] });
      if (prevReceipts) {
        queryClient.setQueryData({ queryKey: ['receipts'] },
          prevReceipts.map(r => r.id !== receiptId ? r : {
            ...r,
            items: r.items?.map(it => it.id === itemId ? { ...it, ...itemUpdate } : it)
          })
        );
      }
      
      // Clear optimistic state immediately since we have server data
      optimisticRef.current.delete(itemId);
      
      if (userId) {
        // Remove cache to ensure fresh data on next view
        queryClient.removeQueries({ queryKey: ['userClaims', userId] });
      }
      
      // Mark queries as stale for background refresh (but don't trigger immediate refetch)
      queryClient.invalidateQueries({ queryKey: ['receipt', receiptId], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['receipts'], refetchType: 'none' });
    }
  });

  const unclaimMutation = useMutation({
    mutationFn: ({ receiptId, itemId }) => apiClient.unclaimItem(itemId),
    onMutate: async ({ receiptId, itemId, userId }) => {
      // Get all data BEFORE canceling queries
      const prevReceipt = queryClient.getQueryData({ queryKey: ['receipt', receiptId] });
      const prevReceipts = queryClient.getQueryData({ queryKey: ['receipts'] });

      // Extract userId from current item state if not provided
      let claimedByUserId = userId;
      if (!claimedByUserId && prevReceipt) {
        const item = prevReceipt.items?.find(it => it.id === itemId);
        claimedByUserId = item?.claimedBy;
        console.log('[Unclaim] Extracted userId from item:', claimedByUserId);
      }

      const prevUserClaims = claimedByUserId 
        ? queryClient.getQueryData({ queryKey: ['userClaims', claimedByUserId] })
        : null;

      console.log('[Unclaim] Before update - userClaims count:', prevUserClaims?.length);

      // NOW cancel queries
      await queryClient.cancelQueries({ queryKey: ['receipt', receiptId] });
      await queryClient.cancelQueries({ queryKey: ['receipts'] });
      if (claimedByUserId) {
        await queryClient.cancelQueries({ queryKey: ['userClaims', claimedByUserId] });
      }

      const optimisticItem = { claimedBy: null, claimedAt: null, pending: true };

      // Update receipt cache
      if (prevReceipt) {
        queryClient.setQueryData({ queryKey: ['receipt', receiptId] }, {
          ...prevReceipt,
          items: prevReceipt.items?.map(it => it.id === itemId ? { ...it, ...optimisticItem } : it)
        });
      }

      // Update receipts list cache
      if (prevReceipts) {
        queryClient.setQueryData({ queryKey: ['receipts'] },
          prevReceipts.map(r => r.id !== receiptId ? r : {
            ...r,
            items: r.items?.map(it => it.id === itemId ? { ...it, ...optimisticItem } : it)
          })
        );
      }

      // IMPORTANT: Remove userClaims cache immediately instead of updating it
      // This forces a fresh fetch when user visits "My Claims"
      if (claimedByUserId) {
        console.log('[Unclaim] Removing userClaims cache for userId:', claimedByUserId);
        queryClient.removeQueries({ queryKey: ['userClaims', claimedByUserId] });
      }

      optimisticRef.current.set(itemId, { id: itemId, ...optimisticItem });
      return { prevReceipt, prevReceipts, prevUserClaims, claimedByUserId };
    },
    onError: (err, { receiptId, itemId }, context) => {
      console.log('[Unclaim] Error - rolling back');
      if (context?.prevReceipt) queryClient.setQueryData({ queryKey: ['receipt', receiptId] }, context.prevReceipt);
      if (context?.prevReceipts) queryClient.setQueryData({ queryKey: ['receipts'] }, context.prevReceipts);
      if (context?.prevUserClaims && context?.claimedByUserId) {
        // Restore the userClaims cache on error
        queryClient.setQueryData({ queryKey: ['userClaims', context.claimedByUserId] }, context.prevUserClaims);
      }
      optimisticRef.current.delete(itemId);
    },
    onSuccess: async (data, { receiptId, itemId, userId }, context) => {
      const targetUserId = userId || context?.claimedByUserId;
      console.log('[Unclaim] Success - updating with server data for userId:', targetUserId, data);
      
      // Construct the updated item state - unclaimed
      const itemUpdate = {
        claimedBy: null,
        claimedAt: null,
        pending: false
      };
      
      // Update receipt cache with server data
      const prevReceipt = queryClient.getQueryData({ queryKey: ['receipt', receiptId] });
      if (prevReceipt) {
        queryClient.setQueryData({ queryKey: ['receipt', receiptId] }, {
          ...prevReceipt,
          items: prevReceipt.items?.map(it => it.id === itemId ? { ...it, ...itemUpdate } : it)
        });
      }
      
      // Update receipts list cache with server data
      const prevReceipts = queryClient.getQueryData({ queryKey: ['receipts'] });
      if (prevReceipts) {
        queryClient.setQueryData({ queryKey: ['receipts'] },
          prevReceipts.map(r => r.id !== receiptId ? r : {
            ...r,
            items: r.items?.map(it => it.id === itemId ? { ...it, ...itemUpdate } : it)
          })
        );
      }
      
      // Clear optimistic state immediately since we have server data
      optimisticRef.current.delete(itemId);
      
      // userClaims already removed in onMutate
      if (targetUserId) {
        queryClient.removeQueries({ queryKey: ['userClaims', targetUserId] });
      }
      
      // Mark queries as stale for background refresh (but don't trigger immediate refetch)
      queryClient.invalidateQueries({ queryKey: ['receipt', receiptId], refetchType: 'none' });
      queryClient.invalidateQueries({ queryKey: ['receipts'], refetchType: 'none' });
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
    optimisticClaims: optimisticRef.current,
    loading: claimMutation.isLoading || unclaimMutation.isLoading,
    error: claimMutation.error || unclaimMutation.error || null,
    claimItem,
    unclaimItem,
  };
};

export const useUserClaims = (userId, { pollIntervalMs = 10000 } = {}) => {
  const queryClient = useQueryClient();
  const isClient = typeof window !== 'undefined';

  const query = useQuery({
    queryKey: ['userClaims', userId],
    queryFn: async () => {
      if (!userId) return [];
      const response = await fetch(`/api/users/${userId}/claims`);
      if (!response.ok) throw new Error('Failed to fetch claims');
      return response.json();
    },
    enabled: !!userId,
    staleTime: 5000, // Consider data fresh for 5 seconds to avoid immediate refetch
    refetchInterval: isClient ? () => (document.visibilityState === 'visible' ? pollIntervalMs : false) : false,
    refetchOnWindowFocus: 'always', // Always refetch in background when window regains focus
    refetchOnMount: 'always', // Always refetch in background on mount
  });

  return {
    claims: query.data || [],
    loading: query.isLoading,
    error: query.error ? (query.error.message || query.error) : null,
    refetch: query.refetch,
  };
};
