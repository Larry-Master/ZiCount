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

    setLoading(true);
    try {
      await onClaim(selectedUserId);
    } catch (err) {
      console.error('Claim failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const price = typeof item.price === 'object' ? item.price.value : item.price;
  const selectedPerson = getPerson(selectedUserId);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Claim Item</h3>
          <button className="close-button" onClick={onCancel}>×</button>
        </div>

        <div className="modal-body">
          <div className="item-preview">
            <h4>{item.name}</h4>
            <div className="price">{formatCurrency(parsePrice(price))}</div>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label>Claim for:</label>
              <div className="people-selector">
                {people.map(person => (
                  <label key={person.id} className="person-option">
                    <input
                      type="radio"
                      name="claimUser"
                      value={person.id}
                      checked={selectedUserId === person.id}
                      onChange={(e) => setSelectedUserId(e.target.value)}
                    />
                    <div className="person-card">
                      <div
                        className="person-avatar small"
                        style={{ backgroundColor: person.color }}
                      >
                        {person.name.charAt(0).toUpperCase()}
                      </div>
                      <span className="person-name">{person.name}</span>
                      {person.id === currentUserId && (
                        <span className="me-indicator">(me)</span>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button 
                type="button" 
                className="cancel-button" 
                onClick={onCancel}
                disabled={loading}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="claim-button"
                disabled={loading || !selectedUserId}
              >
                {loading ? 'Claiming...' : `Claim for ${selectedPerson?.name || 'User'}`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
