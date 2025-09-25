import { useState, useEffect } from 'react';
import { formatCurrency, calculateTotal } from '@/lib/utils/currency';
import { apiClient } from '@/lib/api/client';
import ItemCard from '@/components/ItemCard';

export default function MyClaims({ userId, onClaimsUpdated, refreshKey }) {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchClaims = async () => {
      if (!userId) return;

      setLoading(true);
      setError(null);
      try {
        const data = await apiClient.getUserClaims(userId);
        setClaims(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchClaims();
  }, [userId, refreshKey]);

  const handleUnclaim = async (item) => {
    if (!item.claimedBy || item.claimedBy !== userId) {
      console.error('Cannot unclaim an item not claimed by the current user.');
      return;
    }

    try {
      await apiClient.unclaimItem(item.id);
      setClaims(prev => prev.filter(claim => claim.id !== item.id));
      // Notify parent component to refresh data
      if (onClaimsUpdated) {
        onClaimsUpdated();
      }
    } catch (err) {
      console.error('Unclaim failed:', err);
    }
  };

  if (loading) return <div className="container">Loading your claims...</div>;
  if (error) return <div className="container">Error: {error}</div>;
  if (!claims.length) return <div className="container">No claims yet</div>;

  const totalClaimed = calculateTotal(claims);
  const claimsByReceipt = claims.reduce((acc, claim) => {
    const receiptId = claim.receiptId;
    if (!acc[receiptId]) {
      acc[receiptId] = {
        receiptId,
        receiptName: claim.receiptName || `Receipt #${receiptId}`,
        items: [],
        total: 0
      };
    }
    acc[receiptId].items.push(claim);
    acc[receiptId].total += parseFloat(claim.price) || 0;
    return acc;
  }, {});

  return (
    <div className="p-4 sm:p-6">
      {/* Header section */}
      <div className="bg-white rounded-lg p-4 shadow-sm mb-6">
        <h2 className="text-xl font-bold text-gray-900 mb-2">My Claims</h2>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="flex items-center gap-4 text-sm text-gray-600">
            <div className="flex items-center gap-1">
              <span className="font-medium">{claims.length}</span>
              <span>Items</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-medium">{Object.keys(claimsByReceipt).length}</span>
              <span>Receipts</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-500">Total Claimed</div>
            <div className="text-xl font-bold text-indigo-600">{formatCurrency(totalClaimed)}</div>
          </div>
        </div>
      </div>

      {/* Claims by receipt */}
      <div className="space-y-4">
        {Object.values(claimsByReceipt).map(receipt => (
          <div key={receipt.receiptId} className="bg-white rounded-lg shadow-sm overflow-hidden">
            {/* Receipt header */}
            <div className="bg-gray-50 px-4 py-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                <h3 className="font-semibold text-gray-900 truncate">
                  {receipt.receiptName}
                </h3>
                <div className="text-sm">
                  <span className="text-gray-500">Receipt Total: </span>
                  <span className="font-medium text-gray-900">{formatCurrency(receipt.total)}</span>
                </div>
              </div>
            </div>

            {/* Items grid */}
            <div className="p-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {receipt.items.map(item => (
                  <ItemCard
                    key={item.id}
                    item={{ ...item, claimedBy: item.claimedBy || userId }}
                    currentUserId={userId}
                    onUnclaim={handleUnclaim}
                    isMyClaimsContext={true}
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
