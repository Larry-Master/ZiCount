import { renderHook, act } from '@testing-library/react';
import { useClaims } from '@/lib/hooks/useReceipts';

// Mock API client
jest.mock('@/lib/api/client', () => ({
  apiClient: {
    claimItem: jest.fn(),
    unclaimItem: jest.fn()
  }
}));

describe('useClaims', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('manages optimistic claims correctly', async () => {
  const { apiClient } = require('@/lib/api/client');
    apiClient.claimItem.mockResolvedValue({ id: '1', claimedBy: 'user1' });

    const { result } = renderHook(() => useClaims());

    await act(async () => {
      await result.current.claimItem('receipt1', 'item1', 'user1');
    });

    expect(apiClient.claimItem).toHaveBeenCalledWith('receipt1', 'item1', 'user1');
  });

  test('handles claim failure', async () => {
  const { apiClient } = require('@/lib/api/client');
    apiClient.claimItem.mockRejectedValue(new Error('Claim failed'));

    const { result } = renderHook(() => useClaims());

    await act(async () => {
      try {
        await result.current.claimItem('receipt1', 'item1', 'user1');
      } catch (error) {
        expect(error.message).toBe('Claim failed');
      }
    });

    // Optimistic claim should be removed on failure
    expect(result.current.optimisticClaims.size).toBe(0);
  });

  test('handles unclaim correctly', async () => {
  const { apiClient } = require('@/lib/api/client');
    apiClient.unclaimItem.mockResolvedValue();

    const { result } = renderHook(() => useClaims());

    await act(async () => {
      await result.current.unclaimItem('item1');
    });

    expect(apiClient.unclaimItem).toHaveBeenCalledWith('item1');
  });
});
