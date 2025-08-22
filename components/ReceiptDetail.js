import { useState, useEffect } from 'react';
import ItemCard from './ItemCard';
import ClaimModal from './ClaimModal';
import { formatCurrency, calculateTotal } from '@/lib/utils/currency';
import { useClaims, useReceipt } from '@/lib/hooks/useReceipts';
import { usePeople } from '@/lib/hooks/usePeople';
import { apiClient } from '@/lib/api/client';

export default function ReceiptDetail({ receipt, receiptId, currentUserId, onItemClaimed, onItemUnclaimed, onBack, onClaimsUpdated, onDelete }) {
  const [selectedItem, setSelectedItem] = useState(null);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { claimItem, unclaimItem, optimisticClaims } = useClaims();
  const { getPerson } = usePeople();
  
  // Use the hook to fetch receipt if receiptId is provided
  const { receipt: fetchedReceipt, loading: receiptLoading, refetch: refetchReceipt } = useReceipt(receiptId || null);
  
  // Use the fetched receipt if available, otherwise use the passed receipt
  const currentReceipt = fetchedReceipt || receipt;

  if (receiptLoading) {
    return <div>Loading receipt...</div>;
  }

  if (!currentReceipt) {
    return <div>Loading receipt...</div>;
  }

  const handleClaimClick = (item) => {
    setSelectedItem(item);
    setShowClaimModal(true);
  };

  const handleClaim = async (item, userId) => {
    try {
      const result = await claimItem(currentReceipt.id, item.id, userId);
      // Update parent/local receipt state if callback provided so UI stays in sync
      if (result && onItemClaimed) {
        onItemClaimed(result.id || item.id, result.claimedBy || userId, result.claimedAt || new Date().toISOString());
      }
      // Refresh receipt data and notify parent
      if (refetchReceipt) {
        refetchReceipt();
      }
      if (onClaimsUpdated) {
        onClaimsUpdated();
      }
      setShowClaimModal(false);
      setSelectedItem(null);
    } catch (err) {
      console.error('Claim failed:', err);
    }
  };

  const handleUnclaim = async (item) => {
    try {
      const result = await unclaimItem(item.id);
      if (result && onItemUnclaimed) {
        onItemUnclaimed(item.id);
      }
      // Refresh receipt data and notify parent
      if (refetchReceipt) {
        refetchReceipt();
      }
      if (onClaimsUpdated) {
        onClaimsUpdated();
      }
    } catch (err) {
      console.error('Unclaim failed:', err);
    }
  };

  const getItemStatus = (item) => {
    const optimistic = optimisticClaims.get(item.id);
    if (optimistic) return optimistic;
    return item;
  };

  const totalAmount = calculateTotal(currentReceipt.items || []);
  const claimedAmount = (currentReceipt.items || [])
    .filter(item => getItemStatus(item).claimedBy)
    .reduce((sum, item) => {
      const price = typeof item.price === 'object' ? item.price.value : item.price;
      return sum + (parseFloat(price) || 0);
    }, 0);

  const uploaderName = currentReceipt.uploadedBy ? getPerson(currentReceipt.uploadedBy)?.name || 'Unknown' : 'Unknown';

  return (
    <div className="receipt-detail">
      {onBack && (
        <button className="back-button" onClick={onBack}>
          ← Back to Receipts
        </button>
      )}
      
      <div className="receipt-header">
        <h2>{currentReceipt.name || `Receipt #${currentReceipt.id}`}</h2>
        <div className="receipt-meta">
          <span>{new Date(currentReceipt.createdAt).toLocaleDateString('de-DE')}</span>
          <span className="uploader">Uploaded by {uploaderName}</span>
          {currentReceipt.imageUrl && (
            <img 
              src={currentReceipt.imageUrl} 
              alt="Receipt" 
              className="receipt-thumbnail"
            />
          )}
        </div>
        {/* Delete button */}
        <div className="receipt-actions">
          <button
            className="delete-button"
            onClick={async () => {
              if (!confirm('Delete this receipt? This will remove the receipt and all associated claims.')) return;
              setDeleting(true);
              try {
                await apiClient.deleteReceipt(currentReceipt.id);
                if (onClaimsUpdated) onClaimsUpdated();
                // Prefer onBack/onDelete ordering so parent can navigate/refresh
                if (onBack) onBack();
                if (typeof onDelete === 'function') onDelete();
              } catch (err) {
                console.error('Delete failed:', err);
                alert(err.message || 'Delete failed');
              } finally {
                setDeleting(false);
              }
            }}
            disabled={deleting}
          >
            {deleting ? 'Deleting...' : 'Delete Receipt'}
          </button>
        </div>
      </div>

      <div className="receipt-summary">
        <div className="summary-item">
          <span>Total:</span>
          <span className="amount">{formatCurrency(totalAmount)}</span>
        </div>
        <div className="summary-item">
          <span>Claimed:</span>
          <span className="amount claimed">{formatCurrency(claimedAmount)}</span>
        </div>
        <div className="summary-item">
          <span>Remaining:</span>
          <span className="amount remaining">{formatCurrency(totalAmount - claimedAmount)}</span>
        </div>
      </div>

      <div className="items-grid">
        {(currentReceipt.items || []).map(item => (
          <ItemCard
            key={item.id}
            item={getItemStatus(item)}
            currentUserId={currentUserId}
            onClaim={() => handleClaimClick(item)}
            onUnclaim={() => handleUnclaim(item)}
          />
        ))}
      </div>

      {showClaimModal && selectedItem && (
        <ClaimModal
          item={selectedItem}
          currentUserId={currentUserId}
          onClaim={(userId) => handleClaim(selectedItem, userId)}
          onCancel={() => {
            setShowClaimModal(false);
            setSelectedItem(null);
          }}
        />
      )}
    </div>
  );
}
