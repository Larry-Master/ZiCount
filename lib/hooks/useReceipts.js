import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '@/lib/api/client';

export const useReceipts = () => {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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

  useEffect(() => {
    fetchReceipts();
  }, [fetchReceipts]);

  return { receipts, loading, error, refetch: fetchReceipts };
};

export const useReceipt = (receiptId) => {
  const [receipt, setReceipt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

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
