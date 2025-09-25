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

import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api/client';

/**
 * Hook for managing all receipts data
 * 
 * @returns {Object} { receipts: Array, loading: boolean, error: string|null, refetch: Function }
 */
export const useReceipts = () => {
  const [receipts, setReceipts] = useState([]);    // Array of receipt objects
  const [loading, setLoading] = useState(false);   // Loading state for UI feedback
  const [error, setError] = useState(null);        // Error message for user display

  // Memoized fetch function to prevent unnecessary effect triggers
  const fetchReceipts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getReceipts();
      setReceipts(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch receipts on component mount
  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  return { receipts, loading, error, refetch: fetchReceipts };
};

/**
 * Hook for managing individual receipt data
 * 
 * @param {string} receiptId - MongoDB ObjectId of the receipt
 * @returns {Object} { receipt: Object|null, loading: boolean, error: string|null, refetch: Function }
 */
export const useReceipt = (receiptId) => {
  const [receipt, setReceipt] = useState(null);    // Individual receipt object
  const [loading, setLoading] = useState(false);   // Loading state
  const [error, setError] = useState(null);        // Error state

  const fetchReceipt = useCallback(async () => {
    if (!receiptId) return;
    
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient.getReceipt(receiptId);
      setReceipt(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [receiptId]);

  useEffect(() => {
    fetchReceipt();
  }, [fetchReceipt]);

  return { receipt, loading, error, refetch: fetchReceipt };
};

export const useClaims = () => {
  const [claims, setClaims] = useState([]);
  const [optimisticClaims, setOptimisticClaims] = useState(new Map());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const addOptimisticClaim = useCallback((item) => {
    setOptimisticClaims(prev => new Map(prev).set(item.id, {
      ...item,
      claimedAt: new Date().toISOString(),
      pending: true
    }));
  }, []);

  const removeOptimisticClaim = useCallback((itemId) => {
    setOptimisticClaims(prev => {
      const next = new Map(prev);
      next.delete(itemId);
      return next;
    });
  }, []);

  const claimItem = useCallback(async (receiptId, itemId, userId) => {
    try {
      // Find item for optimistic update
      const tempItem = { id: itemId, claimedBy: userId, receiptId };
      addOptimisticClaim(tempItem);

      const result = await apiClient.claimItem(receiptId, itemId, userId);
      
      // Update actual claims
      setClaims(prev => [...prev.filter(c => c.id !== itemId), result]);
      removeOptimisticClaim(itemId);
      
      return result;
    } catch (err) {
      removeOptimisticClaim(itemId);
      throw err;
    }
  }, [addOptimisticClaim, removeOptimisticClaim]);

  const unclaimItem = useCallback(async (itemId) => {
    try {
      await apiClient.unclaimItem(itemId);
      setClaims(prev => prev.filter(c => c.id !== itemId));
      removeOptimisticClaim(itemId);
    } catch (err) {
      throw err;
    }
  }, [removeOptimisticClaim]);

  return {
    claims,
    optimisticClaims,
    loading,
    error,
    claimItem,
    unclaimItem,
  };
};
