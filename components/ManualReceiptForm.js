import { useState } from 'react';
import { usePeople } from '@/lib/hooks/usePeople';

export default function ManualReceiptForm({ onCreated, onRefresh }) {
  const [name, setName] = useState('');
  const [total, setTotal] = useState('');
  const [selectedPeople, setSelectedPeople] = useState([]);
  const [date, setDate] = useState('');
  const [loading, setLoading] = useState(false);
  const { people } = usePeople();
  // Get current user from localStorage or context if available
    const currentUserId = typeof window !== 'undefined' ? localStorage.getItem('currentUserId') || 'user1' : 'user1';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    // Convert comma to dot for decimal
    const totalValue = parseFloat(total.replace(',', '.'));
    // Split cost among selected people
    const perPerson = selectedPeople.length > 0 ? parseFloat((totalValue / selectedPeople.length).toFixed(2)) : totalValue;
    const items = selectedPeople.map((personId, idx) => ({
      id: `manual_item_${Date.now()}_${idx}`,
      name: name,
      price: perPerson,
      priceEUR: perPerson,
      claimedBy: null,
      claimedAt: null,
      tags: ['manual'],
      confidence: 1,
      participant: personId
    }));
    const receipt = {
      name,
      createdAt: date ? new Date(date).toISOString() : new Date().toISOString(),
      imageUrl: null,
      items,
      uploadedBy: currentUserId,
      participants: selectedPeople,
      text: '',
    };

    try {
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
      // reset form
      setName(''); setTotal(''); setSelectedPeople([]); setDate('');
      if (onRefresh) onRefresh();
      if (onCreated) onCreated(saved);
    } catch (err) {
      // Minimal error handling in the form
      console.error('Save manual receipt failed:', err);
      alert(err?.message || 'Failed to save receipt');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 bg-white rounded shadow">
      <h2 className="text-lg font-bold mb-2">Beleg manuell hinzufügen</h2>
      <input value={name} onChange={e => setName(e.target.value)} placeholder="Belegname" className="mb-2 p-2 border w-full" required />
      <div className="mb-2 flex items-center">
        <input
          value={total}
          onChange={e => {
            // Allow only numbers, comma, and dot
            const val = e.target.value.replace(/[^\d,.]/g, '');
            setTotal(val);
          }}
          placeholder="Betrag (€)"
          inputMode="decimal"
          className="p-2 border w-full"
          required
        />
        <span className="ml-2 text-gray-600">€</span>
      </div>
      <input value={date} onChange={e => setDate(e.target.value)} type="date" className="mb-2 p-2 border w-full" />
      <div className="mb-2">
        <label className="block mb-1">Personen auswählen</label>
        <div className="grid grid-cols-2 gap-2">
          {people.map(p => (
            <label key={p.id} className="flex items-center space-x-2">
              <input
                type="checkbox"
                value={p.id}
                checked={selectedPeople.includes(p.id)}
                onChange={e => {
                  if (e.target.checked) {
                    setSelectedPeople([...selectedPeople, p.id]);
                  } else {
                    setSelectedPeople(selectedPeople.filter(id => id !== p.id));
                  }
                }}
              />
              <span>{p.name}</span>
            </label>
          ))}
        </div>
      </div>
      <button type="submit" disabled={loading} className="bg-blue-500 text-white px-4 py-2 rounded">{loading ? 'Speichern...' : 'Beleg hinzufügen'}</button>
    </form>
  );
}
