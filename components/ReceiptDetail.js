import { useState } from 'react';
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

  const { receipt: fetchedReceipt, loading: receiptLoading, refetch: refetchReceipt } = useReceipt(receiptId || null);
  const currentReceipt = fetchedReceipt || receipt;

  if (receiptLoading) return <div className="p-6 text-center text-gray-500">Loading receipt...</div>;
  if (!currentReceipt) return <div className="p-6 text-center text-gray-500">Loading receipt...</div>;

  const handleClaimClick = (item) => {
    setSelectedItem(item);
    setShowClaimModal(true);
  };

  const handleClaim = async (item, userId) => {
    try {
      const result = await claimItem(currentReceipt.id, item.id, userId);
      if (result && onItemClaimed) onItemClaimed(result.id || item.id, result.claimedBy || userId, result.claimedAt || new Date().toISOString());
      if (refetchReceipt) refetchReceipt();
      if (onClaimsUpdated) onClaimsUpdated();
      setShowClaimModal(false);
      setSelectedItem(null);
    } catch (err) {
      console.error('Claim failed:', err);
    }
  };

  const handleUnclaim = async (item) => {
    try {
      const result = await unclaimItem(item.id);
      if (result && onItemUnclaimed) onItemUnclaimed(item.id);
      if (refetchReceipt) refetchReceipt();
      if (onClaimsUpdated) onClaimsUpdated();
    } catch (err) {
      console.error('Unclaim failed:', err);
    }
  };

  const getItemStatus = (item) => {
    const optimistic = optimisticClaims?.get ? optimisticClaims.get(item.id) : undefined;
    return optimistic || item;
  };

  // Use totalAmount from receipt data (from API) instead of calculating
  const totalAmount = currentReceipt.totalAmount || calculateTotal(currentReceipt.items || []);
  const claimedAmount = (currentReceipt.items || [])
    .filter(item => getItemStatus(item).claimedBy)
    .reduce((sum, item) => {
      const price = typeof item.price === 'object' ? item.price.value : item.price;
      return sum + (parseFloat(price) || 0);
    }, 0);

  const uploaderName = currentReceipt.uploadedBy ? getPerson(currentReceipt.uploadedBy)?.name || 'Unknown' : 'Unknown';

  let participantCosts = [];
  let participantsList = Array.isArray(currentReceipt.participants) && currentReceipt.participants.length > 0
    ? currentReceipt.participants
    : [];

  if ((!participantsList || participantsList.length === 0) && currentReceipt.items) {
    const derived = Array.from(new Set((currentReceipt.items || []).map(it => it.participant).filter(Boolean)));
    if (derived.length > 0) participantsList = derived;
  }

  if (participantsList && participantsList.length > 0) {
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
      const split = parseFloat((totalAmount / participantsList.length).toFixed(2));
      participantCosts = participantsList.map(pid => {
        const person = getPerson(pid);
        return { id: pid, name: person?.name || pid, cost: split };
      });
    }
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-4">
        {onBack && (
          <button className="text-sm text-indigo-600 hover:underline" onClick={onBack}>
            ← Back to Receipts
          </button>
        )}

        <div className="flex items-center gap-3">
          <button
            className="text-sm text-red-600 hover:underline"
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

      <div className="bg-white border border-gray-100 rounded-lg p-4 sm:p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-lg font-semibold text-gray-900">{currentReceipt.name || `Receipt #${currentReceipt.id}`}</h2>
            <div className="text-sm text-gray-500 mt-1">{new Date(currentReceipt.createdAt).toLocaleDateString('de-DE')}</div>
            {currentReceipt.imageUrl && (
              <img src={currentReceipt.imageUrl} alt="Receipt" className="mt-4 w-full max-w-xs rounded-md object-contain" />
            )}

            <div className="mt-4 text-sm text-gray-700">
              <div><span className="font-semibold">Bezahlt von:</span> {uploaderName} <span className="font-semibold">({formatCurrency(totalAmount)})</span></div>
              <div className="mt-1"><span className="font-semibold">Gesamtbetrag:</span> {formatCurrency(totalAmount)}</div>
            </div>

            {participantCosts.length > 0 && (
              <div className="mt-4">
                <button className="text-sm text-indigo-600 hover:underline" onClick={() => setShowParticipants(v => !v)}>
                  {showParticipants ? 'Teilnehmerliste ausblenden' : 'Teilnehmerliste anzeigen'}
                </button>

                {showParticipants && (
                  <div className="mt-3 bg-gray-50 border border-gray-100 rounded-lg p-4">
                    <h3 className="text-sm font-medium mb-2">Teilnehmerliste</h3>
                    <div className="text-sm text-gray-700 mb-2"><span className="font-semibold">Bezahlt von:</span> {uploaderName} <span className="font-semibold">({formatCurrency(totalAmount)})</span></div>
                    <ul className="list-disc ml-5 text-sm text-gray-700">
                      {participantCosts
                        .filter(p => p.id !== currentReceipt.uploadedBy)
                        .map(p => (
                          <li key={p.id}>
                            {p.name}: {formatCurrency(p.cost)}
                          </li>
                        ))}
                    </ul>
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
            </div>
          </div>
        </div>

        {currentReceipt.items && currentReceipt.items.some(it => it.tags?.includes('detected')) && (
          <div className="mt-6 grid gap-3">
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
        )}

        {currentReceipt.discounts && currentReceipt.discounts.length > 0 && (
          <div className="mt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Rabatte & Nachlässe</h3>
            <div className="grid gap-3">
              {currentReceipt.discounts.map(discount => (
                <div key={discount.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 pr-2">
                        <h4 className="text-sm font-semibold text-gray-700">{discount.name}</h4>
                        <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full mt-2 inline-block">Rabatt</span>
                      </div>
                      <div className="flex-shrink-0 text-right ml-2">
                        <div className="text-sm font-medium text-red-600">-{formatCurrency(discount.amount)}</div>
                        <div className="mt-1 text-xs text-gray-500">Nicht anteilbar</div>
                      </div>
                    </div>
                  </div>
                  <div className="ml-4 flex-shrink-0">
                    <span className="px-3 py-1.5 rounded-md text-sm font-semibold bg-gray-100 text-gray-500 cursor-default">
                      Rabatt
                    </span>
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
      </div>
    </div>
  );
}

