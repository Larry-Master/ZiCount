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
    <div className="container">
      <div className="app-header">
        <h2 className="title">My Claims</h2>
        <div>Total: {formatCurrency(totalClaimed)}</div>
      </div>

      <div className="card">
        <div className="nav-tabs">
          <div>
            <span>{claims.length} Items</span>
          </div>
          <div>
            <span>{Object.keys(claimsByReceipt).length} Receipts</span>
          </div>
        </div>
      </div>

      {Object.values(claimsByReceipt).map(receipt => (
        <div key={receipt.receiptId} className="card">
          <div className="title">{receipt.receiptName}</div>
          <div>Total: {formatCurrency(receipt.total)}</div>

          <div className="grid gap-3 mt-4">
            {receipt.items.map(item => (
              <ItemCard
                key={item.id}
                item={{ ...item, claimedBy: item.claimedBy || userId }}
                currentUserId={userId}
                onUnclaim={handleUnclaim}
                isMyClaimsContext={true} // Ensure only 'Unclaim' is shown
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
