import { useState } from 'react';
import { formatCurrency, parsePrice } from '@/lib/utils/currency';
import { usePeople } from '@/lib/hooks/usePeople';


export default function ClaimModal({ item, onClaim, onCancel, currentUserId }) {
  const { people, getPerson } = usePeople();
  const [selectedUserId, setSelectedUserId] = useState(currentUserId || '');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUserId) return;
    // Trigger claim but don't await it so UI can update optimistically.
    try {
      const res = onClaim(selectedUserId);
      // If the caller returned a promise, handle failure quietly (we don't await for UI)
      if (res && typeof res.then === 'function') {
        res.catch(err => console.error('Claim failed:', err));
      }
    } catch (err) {
      console.error('Claim failed:', err);
    }
    // Close modal immediately
    if (onCancel) onCancel();
  };

  const price = typeof item.price === 'object' ? item.price.value : item.price;
  const selectedPerson = getPerson(selectedUserId);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onCancel}>
      <div className="w-full sm:w-[520px] bg-white rounded-t-xl sm:rounded-xl p-4 sm:p-6 shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Claim Item</h3>
            <div className="text-sm text-gray-500">{item.name}</div>
          </div>
          <div className="text-right">
            <div className="text-sm font-semibold">{formatCurrency(parsePrice(price))}</div>
            <button aria-label="Close" onClick={onCancel} className="mt-2 text-gray-400 hover:text-gray-600">✕</button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">Claim for</label>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {people.map(person => (
              <button
                key={person.id}
                type="button"
                onClick={() => setSelectedUserId(person.id)}
                className={`person-select-btn ${selectedUserId === person.id ? 'person-select-btn-active' : ''} flex flex-col items-center gap-2 p-3 rounded-lg border focus:outline-none transition-all`}
              >
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ backgroundColor: person.color }}>{person.name.charAt(0).toUpperCase()}</div>
                <div className="text-xs text-gray-700 truncate">{person.name}</div>
                {person.id === currentUserId && <div className="text-[10px] text-indigo-600">(me)</div>}
              </button>
            ))}
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button type="button" onClick={onCancel} disabled={loading} className="btn-secondary w-full">
              Cancel
            </button>
            <button type="submit" disabled={loading || !selectedUserId} className="btn-primary w-full">
              {loading ? 'Claiming...' : `Claim for ${selectedPerson?.name || 'User'}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
