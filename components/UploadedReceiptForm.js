import { useState } from 'react';
import { usePeople } from '@/lib/hooks/usePeople';
import { getAvatarDisplay } from '@/lib/utils/avatar';

export default function UploadedReceiptForm({ receipt, currentUserId, onSave, onCancel }) {
  const { people } = usePeople();
  const [editingParticipants, setEditingParticipants] = useState(receipt.participants || []);
  const [editingPayer, setEditingPayer] = useState(receipt.uploadedBy);
  const [editingName, setEditingName] = useState(receipt.name || '');
  const [editingTotalAmount, setEditingTotalAmount] = useState(receipt.totalAmount?.toString() || '');

  const toggleParticipant = (personId) => {
    setEditingParticipants(prev => 
      prev.includes(personId) 
        ? prev.filter(id => id !== personId)
        : [...prev, personId]
    );
  };

  const handleSave = async () => {

    try {
      const totalValue = parseFloat((editingTotalAmount || '0').toString().replace(',', '.')) || 0;
      
      const response = await fetch(`/api/receipts/${receipt.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: editingName,
          totalAmount: totalValue,
          participants: editingParticipants,
          uploadedBy: editingPayer
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update receipt');
      }
      
      onSave();
    } catch (err) {
      console.error('Update failed:', err);
      alert(err?.message || 'Failed to update receipt');
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-6">Edit Receipt</h2>
      
      {/* Receipt Name - Read Only */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Receipt Name
        </label>
        <input
          type="text"
          value={editingName}
          onChange={(e) => setEditingName(e.target.value)}
          className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          placeholder="Enter receipt name"
        />
      </div>

      {/* Total Amount - Editable */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">
          Betrag
        </label>
        <div className="flex">
          <input
            value={editingTotalAmount}
            onChange={(e) => setEditingTotalAmount(e.target.value.replace(/[^\d,.]/g, ''))}
            placeholder="Betrag"
            inputMode="decimal"
            className="flex-1 p-3 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-gray-900 dark:text-white dark:bg-gray-800 dark:border-gray-600 dark:placeholder-gray-400"
            required
          />
          <span className="px-3 flex items-center bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300">€</span>
        </div>
      </div>

      {/* Payer Selection - Use existing styling */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">
          Bezahlt von
        </label>
        <select
          value={editingPayer}
          onChange={(e) => setEditingPayer(e.target.value)}
          className="paid-by-dropdown mb-4"
        >
          {people.map(person => (
            <option key={person.id} value={person.id}>
              {person.name} {person.id === currentUserId ? '(ich)' : ''}
            </option>
          ))}
        </select>
      </div>

      {/* Participants Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-3">
          Personen auswählen
        </label>
        <div className="grid grid-cols-2 gap-2">
          {people.map(person => (
            <div
              key={`${person.id}-${editingPayer}`}
              className={`participant-card ${editingParticipants.includes(person.id) ? 'participant-card-selected' : ''}`}
              onClick={() => toggleParticipant(person.id)}
            >
              <input
                type="checkbox"
                checked={editingParticipants.includes(person.id)}
                onChange={(e) => {
                  e.stopPropagation();
                  toggleParticipant(person.id);
                }}
                className="participant-checkbox"
              />
              <div className="participant-avatar" style={{ backgroundColor: person.color }}>
                {getAvatarDisplay(person)}
              </div>
              <div className="participant-info">
                <span className="participant-name">{person.name}</span>
                {person.id === editingPayer && (
                  <span className="participant-badge">(bezahlt)</span>
                )}
              </div>
            </div>
          ))}
        </div>
        {editingParticipants.length === 0 && (
          <div className="mt-2 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800">
            ⚠️ Keine Personen ausgewählt. Wähle mindestens eine Person für die Aufteilung aus.
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          className={`btn-primary ${editingParticipants.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
          disabled={editingParticipants.length === 0}
        >
          Save Changes
        </button>
        <button
          onClick={onCancel}
          className="btn-secondary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}