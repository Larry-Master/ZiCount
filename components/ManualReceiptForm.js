import { useState } from 'react';
import { usePeople } from '@/lib/hooks/usePeople';

export default function ManualReceiptForm({ onCreated, onRefresh }) {
  const [name, setName] = useState('');
  const [total, setTotal] = useState('');
  const [selectedPeople, setSelectedPeople] = useState([]);
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);

  const { people } = usePeople();
  const currentUserId = typeof window !== 'undefined' ? localStorage.getItem('currentUserId') || 'user1' : 'user1';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const totalValue = parseFloat((total || '0').toString().replace(',', '.')) || 0;
      const perPerson = selectedPeople.length > 0 ? parseFloat((totalValue / selectedPeople.length).toFixed(2)) : totalValue;

      const items = selectedPeople.length > 0
        ? selectedPeople.map((personId, idx) => ({
            id: `manual_item_${Date.now()}_${idx}`,
            name: name || 'Manual item',
            price: perPerson,
            priceEUR: perPerson,
            claimedBy: null,
            claimedAt: null,
            tags: ['manual'],
            confidence: 1,
            participant: personId
          }))
        : [{
            id: `manual_item_${Date.now()}_0`,
            name: name || 'Manual item',
            price: totalValue,
            priceEUR: totalValue,
            claimedBy: null,
            claimedAt: null,
            tags: ['manual'],
            confidence: 1
          }];

      const receipt = {
        name: name || `Manual ${new Date().toLocaleDateString('de-DE')}`,
        createdAt: date ? new Date(date).toISOString() : new Date().toISOString(),
        imageUrl: null,
        items,
        uploadedBy: currentUserId,
        participants: selectedPeople,
        text: ''
      };

      const res = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(receipt)
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || 'Failed to save receipt');
      }

      const saved = await res.json();
      setName(''); setTotal(''); setSelectedPeople([]); setDate('');
      onRefresh?.();
      onCreated?.(saved);
    } catch (err) {
      console.error('Save manual receipt failed:', err);
      alert(err?.message || 'Failed to save receipt');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 sm:p-6 bg-white rounded-2xl shadow-lg max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4 text-gray-800">Beleg manuell hinzufügen</h2>

      <label className="block text-sm font-medium text-gray-600 mb-1">Belegname</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Belegname"
        className="mb-4 p-3 border border-gray-300 rounded-lg w-full focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        required
      />

      <label className="block text-sm font-medium text-gray-600 mb-1">Betrag</label>
      <div className="flex mb-4">
        <input
          value={total}
          onChange={(e) => setTotal(e.target.value.replace(/[^\d,.]/g, ''))}
          placeholder="Betrag"
          inputMode="decimal"
          className="flex-1 p-3 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          required
        />
        <span className="px-3 flex items-center bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-gray-700">€</span>
      </div>

      <label className="block text-sm font-medium text-gray-600 mb-1">Datum</label>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="mb-4 p-3 border border-gray-300 rounded-lg w-full focus:ring-2 focus:ring-indigo-500 focus:outline-none"
      />

      <label className="block text-sm font-medium text-gray-600 mb-2">Personen auswählen</label>
      <div className="grid grid-cols-2 gap-2 mb-6">
        {people.map((p) => (
          <label key={p.id} className="flex items-center space-x-2 p-2 border border-gray-200 rounded-lg hover:bg-gray-50">
            <input
              type="checkbox"
              value={p.id}
              checked={selectedPeople.includes(p.id)}
              onChange={(e) => {
                if (e.target.checked) setSelectedPeople([...selectedPeople, p.id]);
                else setSelectedPeople(selectedPeople.filter((id) => id !== p.id));
              }}
              className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700">{p.name}</span>
          </label>
        ))}
      </div>

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-indigo-600 text-white py-3 rounded-lg font-semibold hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-colors"
      >
        {loading ? 'Speichern...' : 'Beleg hinzufügen'}
      </button>
    </form>
  );
}
