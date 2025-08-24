import { useState, useEffect } from 'react';
import ItemCard from '@/components/ItemCard';
import ClaimModal from '@/components/ClaimModal';
import { formatCurrency, calculateTotal } from '@/lib/utils/currency';
import { useClaims, useReceipt } from '@/lib/hooks/useReceipts';
import { usePeople } from '@/lib/hooks/usePeople';

export default function ReceiptDetail({ receipt, receiptId, currentUserId, onItemClaimed, onItemUnclaimed, onBack, onClaimsUpdated, onDelete }) {
  const [showParticipants, setShowParticipants] = useState(false);
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

  // Calculate total and claimed amounts
  const totalAmount = calculateTotal(currentReceipt.items || []);
  const claimedAmount = (currentReceipt.items || [])
    .filter(item => getItemStatus(item).claimedBy)
    .reduce((sum, item) => {
      const price = typeof item.price === 'object' ? item.price.value : item.price;
      return sum + (parseFloat(price) || 0);
    }, 0);

  const uploaderName = currentReceipt.uploadedBy ? getPerson(currentReceipt.uploadedBy)?.name || 'Unknown' : 'Unknown';

  // Calculate per-participant cost for this receipt
  let participantCosts = [];

  // Determine participants: prefer explicit list, otherwise derive from item.participant fields
  let participantsList = Array.isArray(currentReceipt.participants) && currentReceipt.participants.length > 0
    ? currentReceipt.participants
    : [];

  if ((!participantsList || participantsList.length === 0) && currentReceipt.items) {
    const derived = Array.from(new Set((currentReceipt.items || []).map(it => it.participant).filter(Boolean)));
    if (derived.length > 0) participantsList = derived;
  }

  if (participantsList && participantsList.length > 0) {
    // If every item has a participant, treat this as a manual split and sum per participant
    const itemsHaveParticipant = currentReceipt.items && currentReceipt.items.length > 0 && currentReceipt.items.every(it => it.participant);

    if (itemsHaveParticipant) {
      participantCosts = participantsList.map(pid => {
        const person = getPerson(pid);
        const itemsForPerson = (currentReceipt.items || []).filter(it => it.participant === pid);
        const cost = itemsForPerson.reduce((s, it) => {
          const price = typeof it.price === 'object' ? it.price.value : it.price;
          return s + (parseFloat(price) || 0);
        }, 0);
        return { id: pid, name: person?.name || pid, cost };
      });
    } else {
      // Uploaded receipts or mixed: split total equally across participantsList
      const split = parseFloat((totalAmount / participantsList.length).toFixed(2));
      participantCosts = participantsList.map(pid => {
        const person = getPerson(pid);
        return { id: pid, name: person?.name || pid, cost: split };
      });
    }
  }

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
          {currentReceipt.imageUrl && (
            <img 
              src={currentReceipt.imageUrl} 
              alt="Receipt" 
              className="receipt-thumbnail"
            />
          )}
          <div className="mt-2">
            <span className="font-semibold">Bezahlt von:</span> {uploaderName} <span className="font-semibold">({formatCurrency(totalAmount)})</span>
          </div>
          <div className="mt-2">
            <span className="font-semibold">Gesamtbetrag:</span> {formatCurrency(totalAmount)}
          </div>
          {/* Always show Teilnehmerliste button for receipts with participants, regardless of type */}
          {participantCosts.length > 0 && (
            <div className="mt-2">
              <button
                className="btn btn-secondary"
                onClick={() => setShowParticipants(v => !v)}
              >
                {showParticipants ? 'Teilnehmerliste ausblenden' : 'Teilnehmerliste anzeigen'}
              </button>
              {showParticipants && (
                <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
                  <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
                    <button
                      className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-xl"
                      onClick={() => setShowParticipants(false)}
                      aria-label="Schließen"
                    >
                      &times;
                    </button>
                    <h3 className="text-lg font-bold mb-2">Teilnehmerliste</h3>
                    <div className="mb-2">
                      <span className="font-semibold">Bezahlt von:</span> {uploaderName} <span className="font-semibold">({formatCurrency(totalAmount)})</span>
                    </div>
                    <ul className="list-disc ml-6">
                      {participantCosts.map(p => (
                        <li key={p.id}>
                          {p.name}: {formatCurrency(p.cost)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        {/* Delete button - parent handles actual delete + refresh */}
        <div className="receipt-actions">
          <button
            className="delete-button"
            onClick={async () => {
              if (typeof onDelete !== 'function') return;
              setDeleting(true);
              try {
                await onDelete();
                if (onBack) onBack();
              } catch (err) {
                console.error('Delete failed:', err);
                alert(err?.message || 'Delete failed');
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

      {/* Only show ItemCards for claimable items (detected, not manual) */}
      {currentReceipt.items && currentReceipt.items.some(it => it.tags?.includes('detected')) && (
        <>
          <div className="items-grid">
            {currentReceipt.items.filter(it => it.tags?.includes('detected')).map(item => (
              <ItemCard
                key={item.id}
                item={getItemStatus(item)}
                currentUserId={currentUserId}
                onClaim={() => handleClaimClick(item)}
                onUnclaim={() => handleUnclaim(item)}
              />
            ))}
          </div>
          {/* NOTE: Teilnehmerliste modal is rendered above in the receipt header area so we avoid duplicating it here. */}
        </>
      )}

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
