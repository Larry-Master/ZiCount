import { useState, useEffect } from 'react';
import { formatCurrency, calculateTotal } from '@/lib/utils/currency';
import { apiClient } from '@/lib/api/client';

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

  const handleUnclaim = async (itemId) => {
    try {
      await apiClient.unclaimItem(itemId);
      setClaims(prev => prev.filter(claim => claim.id !== itemId));
      // Notify parent component to refresh data
      if (onClaimsUpdated) {
        onClaimsUpdated();
      }
    } catch (err) {
      console.error('Unclaim failed:', err);
    }
  };

  if (loading) return <div>Loading your claims...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!claims.length) return <div>No claims yet</div>;

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
    <div className="my-claims">
      <div className="claims-header">
        <h2>My Claims</h2>
        <div className="total-claimed">
          Total: {formatCurrency(totalClaimed)}
        </div>
      </div>

      <div className="claims-summary">
        <div className="summary-stats">
          <div className="stat">
            <span className="stat-value">{claims.length}</span>
            <span className="stat-label">Items</span>
          </div>
          <div className="stat">
            <span className="stat-value">{Object.keys(claimsByReceipt).length}</span>
            <span className="stat-label">Receipts</span>
          </div>
        </div>
      </div>

      <div className="claims-by-receipt">
        {Object.values(claimsByReceipt).map(receipt => (
          <div key={receipt.receiptId} className="receipt-group">
            <div className="receipt-group-header">
              <h3>{receipt.receiptName}</h3>
              <span className="receipt-total">
                {formatCurrency(receipt.total)}
              </span>
            </div>
            
            <div className="receipt-items">
              {receipt.items.map(item => {
                return (
                  <div key={item.id} className="claim-item">
                    <div className="item-info">
                      <div className="item-name">{item.name}</div>
                      <div className="item-meta">
                        <span className="item-price">
                          {formatCurrency(parseFloat(item.price) || 0)}
                        </span>
                        <span className="claim-time">
                          {new Date(item.claimedAt).toLocaleString('de-DE')}
                        </span>
                      </div>
                      {item.tags && (
                        <div className="item-tags">
                          {item.tags.map(tag => (
                            <span key={tag} className="tag">{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    <div className="item-actions">
                      <button 
                        className="unclaim-button"
                        onClick={() => handleUnclaim(item.id)}
                      >
                        Unclaim
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
