import { useState, useRef } from 'react';
import ItemCard from '@/components/ItemCard';
import ClaimModal from '@/components/ClaimModal';
import SplitItemModal from '@/components/SplitItemModal';
import ManualReceiptForm from '@/components/ManualReceiptForm';
import UploadedReceiptForm from '@/components/UploadedReceiptForm';
import { formatCurrency } from '@/lib/utils/currency';
import { useClaims, useReceipt } from '@/lib/hooks/useReceipts';
import { usePeople } from '@/lib/hooks/usePeople';
import { getAvatarDisplay } from '@/lib/utils/avatar';

export default function ReceiptDetail({ receipt, receiptId, currentUserId, onItemClaimed, onItemUnclaimed, onBack, onClaimsUpdated, onDelete }) {
  const [showParticipants, setShowParticipants] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [showClaimModal, setShowClaimModal] = useState(false);
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showImageModal, setShowImageModal] = useState(false);
  const { claimItem, unclaimItem, optimisticClaims } = useClaims();
  const { getPerson, people } = usePeople();

  const { receipt: fetchedReceipt, loading: receiptLoading, refetch: refetchReceipt } = useReceipt(receiptId || null);
  const currentReceipt = fetchedReceipt || receipt;

  if (receiptLoading) return <div className="p-6 text-center text-gray-500">Loading receipt...</div>;
  if (!currentReceipt) return <div className="p-6 text-center text-gray-500">Loading receipt...</div>;

  // Check if this is a manual receipt (can be edited)
  const isManualReceipt = currentReceipt.items && currentReceipt.items.length > 0 && 
    currentReceipt.items[0].tags?.includes('manual');

  // Handler functions
  const handleClaimClick = (item) => {
    setSelectedItem(item);
    setShowClaimModal(true);
  };

  const handleClaim = async (item, userId) => {
    // Guard against duplicate claim requests for the same item
    if (!handleClaim.inFlight) handleClaim.inFlight = new Set();
    if (handleClaim.inFlight.has(item.id)) return;
    handleClaim.inFlight.add(item.id);

    try {
      const result = await claimItem(currentReceipt.id, item.id, userId);
      if (result && onItemClaimed) onItemClaimed(result.id || item.id, result.claimedBy || userId, result.claimedAt || new Date().toISOString());
      setShowClaimModal(false);
      setSelectedItem(null);
    } catch (err) {
      console.error('Claim failed:', err);
    } finally {
      handleClaim.inFlight.delete(item.id);
    }
  };

  const handleUnclaim = async (item) => {
    // Guard against duplicate unclaim requests for the same item
    if (!handleUnclaim.inFlight) handleUnclaim.inFlight = new Set();
    if (handleUnclaim.inFlight.has(item.id)) return;
    handleUnclaim.inFlight.add(item.id);

    try {
      const result = await unclaimItem(currentReceipt.id, item.id);
      if (result && onItemUnclaimed) onItemUnclaimed(item.id);
    } catch (err) {
      console.error('Unclaim failed:', err);
    } finally {
      handleUnclaim.inFlight.delete(item.id);
    }
  };

  const handleSplitClick = (item) => {
    setSelectedItem(item);
    setShowSplitModal(true);
  };

  const handleSplit = async (splits) => {
    try {
      if (!selectedItem || !currentReceipt) return;

      // Create new items from splits
      const newItems = splits.map((split, index) => ({
        id: `${selectedItem.id}_split_${index}_${Date.now()}`,
        name: split.name,
        price: split.amount,
        priceEUR: split.amount,
        claimedBy: null,
        claimedAt: null,
        tags: [...(selectedItem.tags || []), 'split'],
        confidence: selectedItem.confidence || 1,
        participant: selectedItem.participant || null
      }));

      // Remove original item and add split items
      const updatedItems = currentReceipt.items
        .filter(item => item.id !== selectedItem.id)
        .concat(newItems);

      // Update receipt with new items (excluding _id and id fields)
      const updatePayload = {
        name: currentReceipt.name,
        totalAmount: currentReceipt.totalAmount,
        uploadedBy: currentReceipt.uploadedBy,
        participants: currentReceipt.participants,
        imageUrl: currentReceipt.imageUrl,
        imageId: currentReceipt.imageId,
        createdAt: currentReceipt.createdAt,
        items: updatedItems,
        discounts: currentReceipt.discounts || []
      };

      const response = await fetch(`/api/receipts/${currentReceipt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatePayload)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to split item');
      }

      // Refresh receipt data
      if (refetchReceipt) await refetchReceipt();
      if (onClaimsUpdated) onClaimsUpdated();

      setShowSplitModal(false);
      setSelectedItem(null);
    } catch (err) {
      console.error('Split failed:', err);
      alert(`Failed to split item: ${err.message}`);
    }
  };

  const getItemStatus = (item) => {
    const optimistic = optimisticClaims && typeof optimisticClaims.get === 'function' ? optimisticClaims.get(item.id) : undefined;
    // if optimistic snapshot exists and has pending flag, prefer it
    if (optimistic) return { ...item, ...optimistic };
    return item;
  };

  // If editing manual receipt, show the form
  if (isEditing && isManualReceipt) {
    return (
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <button 
            className="text-sm text-indigo-600 hover:underline" 
            onClick={() => setIsEditing(false)}
          >
            ← Cancel Edit
          </button>
        </div>
        
        <ManualReceiptForm
          isEditing={true}
          initialData={{
            id: currentReceipt.id,
            name: currentReceipt.name,
            totalAmount: currentReceipt.totalAmount,
            participants: currentReceipt.participants || [],
            uploadedBy: currentReceipt.uploadedBy,
            imageUrl: currentReceipt.imageUrl,
            createdAt: currentReceipt.createdAt
          }}
          currentUserId={currentUserId}
          onCreated={(updatedReceipt) => {
            setIsEditing(false);
            if (refetchReceipt) refetchReceipt();
            if (onClaimsUpdated) onClaimsUpdated();
          }}
          onRefresh={() => {
            if (refetchReceipt) refetchReceipt();
            if (onClaimsUpdated) onClaimsUpdated();
          }}
        />
      </div>
    );
  }

  // If editing uploaded receipt, show the edit form
  if (isEditing && !isManualReceipt) {
    return (
      <div className="p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <button 
            className="text-sm text-indigo-600 hover:underline" 
            onClick={() => setIsEditing(false)}
          >
            ← Cancel Edit
          </button>
        </div>
        
        <UploadedReceiptForm
          receipt={currentReceipt}
          currentUserId={currentUserId}
          onSave={() => {
            setIsEditing(false);
            if (refetchReceipt) refetchReceipt();
            if (onClaimsUpdated) onClaimsUpdated();
          }}
          onCancel={() => setIsEditing(false)}
        />
      </div>
    );
  }

  // Use totalAmount from receipt data (from API)
  const totalAmount = currentReceipt.totalAmount || 0;
  const claimedAmount = (currentReceipt.items || [])
    .filter(item => getItemStatus(item).claimedBy)
    .reduce((sum, item) => {
      const price = typeof item.price === 'object' ? item.price.value : item.price;
      return sum + (parseFloat(price) || 0);
    }, 0);

  const uploaderName = currentReceipt.uploadedBy ? getPerson(currentReceipt.uploadedBy)?.name || 'Unknown' : 'Unknown';

  // Calculate personal costs for current user
  const personalClaimedCosts = (currentReceipt.items || [])
    .filter(item => getItemStatus(item).claimedBy === currentUserId)
    .reduce((sum, item) => {
      const price = typeof item.price === 'object' ? item.price.value : item.price;
      return sum + (parseFloat(price) || 0);
    }, 0);

  let participantCosts = [];
  let participantsList = Array.isArray(currentReceipt.participants) && currentReceipt.participants.length > 0
    ? currentReceipt.participants
    : [];

  if ((!participantsList || participantsList.length === 0) && currentReceipt.items) {
    const derived = Array.from(new Set((currentReceipt.items || []).map(it => it.participant).filter(Boolean)));
    if (derived.length > 0) participantsList = derived;
  }

  // Use the participant list as-is (payer may or may not be included)
  const allParticipants = participantsList;

  if (allParticipants && allParticipants.length > 0) {
    const itemsHaveParticipant = currentReceipt.items && currentReceipt.items.length > 0 && currentReceipt.items.every(it => it.participant);
    if (itemsHaveParticipant) {
      participantCosts = allParticipants.map(pid => {
        const person = getPerson(pid);
        const itemsForPerson = (currentReceipt.items || []).filter(it => it.participant === pid);
        const cost = itemsForPerson.reduce((s, it) => {
          const price = typeof it.price === 'object' ? it.price.value : it.price;
          return s + (parseFloat(price) || 0);
        }, 0);
        return { id: pid, name: person?.name || pid, cost };
      });
    } else {
      // Split the total among the participants (may or may not include payer)
      const split = parseFloat((totalAmount / allParticipants.length).toFixed(2));
      participantCosts = allParticipants.map(pid => {
        const person = getPerson(pid);
        return { id: pid, name: person?.name || pid, cost: split };
      });
    }
  }

  // Calculate personal participant costs for current user
  const personalParticipantCosts = participantCosts.find(p => p.id === currentUserId)?.cost || 0;
  const totalPersonalCosts = personalClaimedCosts + personalParticipantCosts;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        {onBack && (
          <button className="text-sm text-indigo-600 hover:underline" onClick={onBack}>
            ← Back to Receipts
          </button>
        )}
      </div>

      {/* Action buttons */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          className="btn-secondary btn-sm"
          onClick={() => setIsEditing(true)}
        >
          Edit Receipt
        </button>
        <button
          className="btn-danger btn-sm"
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

      <div className="bg-white rounded-lg p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">{currentReceipt.name || `Receipt #${currentReceipt.id}`}</h2>
            <div className="text-sm text-gray-500 mt-1">{new Date(currentReceipt.createdAt).toLocaleDateString('de-DE')}</div>
            {currentReceipt.imageUrl && (
              <div className="mt-4">
                <img 
                  src={currentReceipt.imageUrl} 
                  alt="Receipt" 
                  className="w-full max-w-xs rounded-md object-contain cursor-pointer hover:opacity-90 transition-opacity" 
                  onClick={() => setShowImageModal(true)}
                />
              </div>
            )}

            <div className="mt-4 text-sm text-gray-700">
              <div><span className="font-semibold">Bezahlt von:</span> {uploaderName} <span className="font-semibold">({formatCurrency(totalAmount)})</span></div>
              <div className="mt-1"><span className="font-semibold">Gesamtbetrag:</span> {formatCurrency(totalAmount)}</div>
            </div>

            {participantCosts.length > 0 && (
              <div className="mt-4">
                <button 
                  className="btn-secondary btn-sm mb-3"
                  onClick={() => setShowParticipants(v => !v)}
                >
                  {showParticipants ? 'Teilnehmerliste ausblenden' : 'Teilnehmerliste anzeigen'}
                </button>

                {showParticipants && (
                  <div className="mt-3 bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <h3 className="text-sm font-medium mb-2 text-gray-900 dark:text-gray-100">Teilnehmerliste</h3>
                    <div className="text-sm text-gray-700 dark:text-gray-300 mb-2">
                      <span className="font-semibold">Bezahlt von:</span> {uploaderName} <span className="font-semibold">({formatCurrency(totalAmount)})</span>
                    </div>
                    
                    {participantCosts.length > 0 ? (
                      <div>
                        <div className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-1">Anteilskosten:</div>
                        <ul className="list-disc ml-5 text-sm text-gray-700 dark:text-gray-300">
                          {participantCosts.map(p => (
                            <li key={p.id}>
                              {p.name}: {formatCurrency(p.cost)}
                              {p.id === currentReceipt.uploadedBy && (
                                <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">(hat bereits bezahlt)</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-600 dark:text-gray-400 italic">
                        Keine Teilnehmer ausgewählt.
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="w-full sm:w-48">
            <div className="bg-gray-50 rounded-lg p-3 text-center">
              <div className="text-sm text-gray-500">Total</div>
              <div className="text-lg font-semibold">{formatCurrency(totalAmount)}</div>
              <div className="text-sm text-gray-500 mt-2">Claimed</div>
              <div className="text-lg font-semibold text-indigo-600">{formatCurrency(claimedAmount)}</div>
              <div className="text-sm text-gray-500 mt-2">Remaining</div>
              <div className="text-lg font-semibold">{formatCurrency(totalAmount - claimedAmount)}</div>
              {currentUserId && totalPersonalCosts > 0 && (
                <>
                  <div className="text-sm text-gray-500 mt-2">Personal Costs</div>
                  <div className="text-lg font-semibold text-purple-600">{formatCurrency(totalPersonalCosts)}</div>
                </>
              )}
            </div>
          </div>
        </div>

        {currentReceipt.items && currentReceipt.items.some(it => it.tags?.includes('detected')) && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Items</h3>
            <div className="flex flex-col items-center gap-3 sm:gap-4 max-w-2xl mx-auto">
              {currentReceipt.items.filter(it => it.tags?.includes('detected')).map(item => (
                <div key={item.id} className="w-full max-w-lg">
                  <ItemCard
                    item={getItemStatus(item)}
                    currentUserId={currentUserId}
                    onClaim={() => handleClaimClick(item)}
                    onUnclaim={() => handleUnclaim(item)}
                    onSplit={() => handleSplitClick(item)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {currentReceipt.discounts && currentReceipt.discounts.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Rabatte & Nachlässe</h3>
            <div className="grid gap-3">
              {currentReceipt.discounts.map(discount => (
                <div key={discount.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 pr-2">
                        <h4 className="text-sm font-semibold text-gray-700">{discount.name}</h4>
                        <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full mt-2 inline-block">Rabatt</span>
                      </div>
                      <div className="flex-shrink-0 text-right ml-2">
                        <div className="text-sm font-medium text-red-600">-{formatCurrency(discount.amount)}</div>
                      </div>
                    </div>
                  </div>
                 
                </div>
              ))}
            </div>
          </div>
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

        {showSplitModal && selectedItem && (
          <SplitItemModal
            item={selectedItem}
            onSplit={handleSplit}
            onCancel={() => {
              setShowSplitModal(false);
              setSelectedItem(null);
            }}
          />
        )}

        {/* Image Modal */}
        {showImageModal && currentReceipt.imageUrl && (
          <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4" onClick={() => setShowImageModal(false)}>
            <div className="relative max-w-full max-h-full">
              <button
                className="absolute top-4 right-4 text-white bg-black bg-opacity-50 rounded-full w-8 h-8 flex items-center justify-center hover:bg-opacity-75 z-10"
                onClick={() => setShowImageModal(false)}
              >
                ×
              </button>
              <img 
                src={currentReceipt.imageUrl} 
                alt="Receipt full size" 
                className="max-w-full max-h-full object-contain rounded-lg"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

