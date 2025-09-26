import { useState } from 'react';
import { usePeople } from '@/lib/hooks/usePeople';
import { getAvatarDisplay } from '@/lib/utils/avatar';

export default function ManualReceiptForm({ onCreated, onRefresh, currentUserId, isEditing = false, initialData = null }) {
  const [name, setName] = useState(initialData?.name || '');
  const [total, setTotal] = useState(initialData?.totalAmount?.toString() || '');
  const [selectedPeople, setSelectedPeople] = useState(initialData?.participants || []);
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(initialData?.imageUrl || null);
  const [paidBy, setPaidBy] = useState(initialData?.uploadedBy || currentUserId || (typeof window !== 'undefined' ? localStorage.getItem('currentUserId') || null : null));
  // date is no longer collected from the user; use current date automatically
  const [loading, setLoading] = useState(false);

  const { people } = usePeople();
  // prefer prop currentUserId, fallback to localStorage
  const runtimeCurrentUserId = currentUserId || (typeof window !== 'undefined' ? localStorage.getItem('currentUserId') || null : null);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation: Ensure at least one participant is selected
    if (selectedPeople.length === 0) {
      alert('Bitte wähle mindestens eine Person für die Aufteilung aus.');
      return;
    }

    setLoading(true);

    try {
      const totalValue = parseFloat((total || '0').toString().replace(',', '.')) || 0;
      
      // Use only the selected people for cost calculation
      const perPerson = selectedPeople.length > 0 ? parseFloat((totalValue / selectedPeople.length).toFixed(2)) : totalValue;

      // Handle image upload if selected
      let imageUrl = imagePreview;
      if (selectedImage) {
        // Use FormData like the analyze endpoint
        const formData = new FormData();
        formData.append('file', selectedImage);
        
        const uploadRes = await fetch('/api/upload', {
          method: 'POST',
          body: formData
        });
        
        if (!uploadRes.ok) {
          throw new Error('Failed to upload image');
        }
        
        const uploadData = await uploadRes.json();
        imageUrl = uploadData.url;
      }

      const items = selectedPeople.length > 0
        ? selectedPeople.map((personId, idx) => ({
            id: isEditing ? `manual_item_${initialData.id}_${idx}` : `manual_item_${Date.now()}_${idx}`,
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
            id: isEditing ? `manual_item_${initialData.id}_0` : `manual_item_${Date.now()}_0`,
            name: name || 'Manual item',
            price: totalValue,
            priceEUR: totalValue,
            claimedBy: null,
            claimedAt: null,
            tags: ['manual'],
            confidence: 1
          }];

      // Use selected people directly as participants
      const participants = selectedPeople;

      const receipt = {
        name: name || `Manual ${new Date().toLocaleDateString('de-DE')}`,
        createdAt: isEditing ? initialData.createdAt : new Date().toISOString(),
        imageUrl: imageUrl,
        items,
        totalAmount: totalValue, // Include the total amount for manual receipts
        uploadedBy: paidBy,
        participants,
        text: ''
      };

      const url = isEditing ? `/api/receipts/${initialData.id}` : '/api/receipts';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(receipt)
      });

      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || `Failed to ${isEditing ? 'update' : 'save'} receipt`);
      }

      const saved = await res.json();
      
      if (!isEditing) {
        setName(''); 
        setTotal(''); 
        setSelectedPeople([]);
        setSelectedImage(null);
        setImagePreview(null);
      }
      
      onRefresh?.();
      onCreated?.(saved);
    } catch (err) {
      console.error(`${isEditing ? 'Update' : 'Save'} manual receipt failed:`, err);
      alert(err?.message || `Failed to ${isEditing ? 'update' : 'save'} receipt`);
    } finally {
      setLoading(false);
    }
  };

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    try {
      console.log(`Original file size: ${Math.round(file.size / 1024)}KB`);
      
      // Compress image for database storage (manual receipts only)
      const compressedFile = await compressImageForStorage(file);
      
      setSelectedImage(compressedFile);
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(compressedFile);
      
    } catch (error) {
      console.error('Image compression failed:', error);
      // Fall back to original file if compression fails
      setSelectedImage(file);
      const reader = new FileReader();
      reader.onload = (e) => setImagePreview(e.target.result);
      reader.readAsDataURL(file);
    }
  };

  // Helper function to compress images for database storage
  const compressImageForStorage = (file, options = {}) => {
    // Aim for ~3MB by default (user is OK with 2-5MB images)
    const targetBytes = options.targetBytes || 3 * 1024 * 1024; // ~3MB
    const maxDimension = options.maxDimension || 2048; // max width/height
    const minQuality = options.minQuality || 0.6;

    return new Promise((resolve, reject) => {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);
      img.onload = async () => {
        try {
          let { width, height } = img;

          // Resize to maxDimension maintaining aspect ratio
          if (width > height) {
            if (width > maxDimension) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            }
          } else {
            if (height > maxDimension) {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, width);
          canvas.height = Math.max(1, height);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

          // Iteratively try qualities until under targetBytes or minQuality reached
          let quality = 0.8;
          let blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));

          while (blob && blob.size > targetBytes && quality > minQuality) {
            quality = Math.max(minQuality, quality - 0.1);
            // create a fresh blob at lower quality
            // eslint-disable-next-line no-await-in-loop
            blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', quality));
          }

          // If still too large and image is still big, attempt to scale down further
          if (blob && blob.size > targetBytes && Math.max(canvas.width, canvas.height) > 640) {
            const scaleFactor = Math.sqrt(targetBytes / blob.size) * 0.9; // conservative
            const newW = Math.max(1, Math.floor(canvas.width * scaleFactor));
            const newH = Math.max(1, Math.floor(canvas.height * scaleFactor));
            const canvas2 = document.createElement('canvas');
            canvas2.width = newW;
            canvas2.height = newH;
            const ctx2 = canvas2.getContext('2d');
            ctx2.drawImage(img, 0, 0, newW, newH);
            quality = Math.max(minQuality, quality - 0.05);
            blob = await new Promise(res => canvas2.toBlob(res, 'image/jpeg', quality));
          }

          const outName = (file.name || 'upload').replace(/\.[^/.]+$/, '') + '.jpg';
          const compressedFile = new File([blob], outName, { type: 'image/jpeg', lastModified: Date.now() });
          console.log(`Compressed for storage: ${Math.round(file.size / 1024)}KB → ${Math.round(compressedFile.size / 1024)}KB (quality=${quality})`);
          URL.revokeObjectURL(objectUrl);
          resolve(compressedFile);
        } catch (err) {
          URL.revokeObjectURL(objectUrl);
          reject(err);
        }
      };
      img.onerror = (e) => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('Failed to load image for compression'));
      };
      img.src = objectUrl;
    });
  };

  const handleImageRemove = () => {
    setSelectedImage(null);
    setImagePreview(initialData?.imageUrl || null);
  };

  return (
    <form onSubmit={handleSubmit} className="p-4 sm:p-6 bg-white dark:bg-gray-800 rounded-2xl shadow-lg max-w-md mx-auto">
      <h2 className="text-xl font-bold mb-4 text-gray-800 dark:text-white">
        {isEditing ? 'Beleg bearbeiten' : 'Beleg manuell hinzufügen'}
      </h2>

      <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Belegname</label>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Belegname"
        className="mb-4 p-3 border border-gray-300 rounded-lg w-full focus:ring-2 focus:ring-indigo-500 focus:outline-none text-gray-900 dark:text-white dark:bg-gray-800 dark:border-gray-600 dark:placeholder-gray-400"
        required
      />

      <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-1">Betrag</label>
      <div className="flex mb-4">
        <input
          value={total}
          onChange={(e) => setTotal(e.target.value.replace(/[^\d,.]/g, ''))}
          placeholder="Betrag"
          inputMode="decimal"
          className="flex-1 p-3 border border-gray-300 rounded-l-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-gray-900 dark:text-white dark:bg-gray-800 dark:border-gray-600 dark:placeholder-gray-400"
          required
        />
        <span className="px-3 flex items-center bg-gray-100 border border-l-0 border-gray-300 rounded-r-lg text-gray-700 dark:bg-gray-700 dark:border-gray-600 dark:text-gray-300">€</span>
      </div>

      {/* Paid by dropdown */}
      <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Bezahlt von</label>
      <select
        value={paidBy}
        onChange={(e) => setPaidBy(e.target.value)}
        className="paid-by-dropdown mb-4"
        required
      >
        {people.map(person => (
          <option key={person.id} value={person.id}>
            {person.name} {person.id === runtimeCurrentUserId ? '(ich)' : ''}
          </option>
        ))}
      </select>

      {/* Image Upload Section */}
      <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-2">Bild hinzufügen (optional)</label>
      <div className="mb-4">
        {imagePreview ? (
          <div className="relative">
            <img 
              src={imagePreview} 
              alt="Receipt preview" 
              className="w-full h-32 object-cover rounded-lg border border-gray-300"
            />
            <button
              type="button"
              onClick={handleImageRemove}
              className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-sm hover:bg-red-600"
            >
              ×
            </button>
          </div>
        ) : (
          <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors">
            <input
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
              id="image-upload"
            />
            <label
              htmlFor="image-upload"
              className="cursor-pointer flex flex-col items-center gap-2"
            >
              <div className="text-gray-400 dark:text-gray-500">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
              </div>
              <span className="text-sm text-gray-600 dark:text-gray-300">Bild auswählen</span>
            </label>
          </div>
        )}
      </div>

  {/* date is set automatically; no input shown */}

      <label className="block text-sm font-medium text-gray-600 dark:text-gray-300 mb-3">Personen auswählen</label>
      <div className="grid grid-cols-2 gap-2 mb-6">
        {people.map((p) => (
          <div 
            key={`${p.id}-${paidBy}`}
            className={`participant-card ${selectedPeople.includes(p.id) ? 'participant-card-selected' : ''}`}
            onClick={() => {
              if (selectedPeople.includes(p.id)) {
                setSelectedPeople(selectedPeople.filter(id => id !== p.id));
              } else {
                setSelectedPeople([...selectedPeople, p.id]);
              }
            }}
          >
            <input
              type="checkbox"
              value={p.id}
              checked={selectedPeople.includes(p.id)}
              onChange={(e) => {
                e.stopPropagation();
                // Handle checkbox change - same logic as parent div click
                if (selectedPeople.includes(p.id)) {
                  setSelectedPeople(selectedPeople.filter(id => id !== p.id));
                } else {
                  setSelectedPeople([...selectedPeople, p.id]);
                }
              }}
              className="participant-checkbox"
            />
            <div className="participant-avatar" style={{ backgroundColor: p.color }}>
              {getAvatarDisplay(p)}
            </div>
            <div className="participant-info">
              <span className="participant-name">{p.name}</span>
              {p.id === paidBy && (
                <span className="participant-badge">(bezahlt)</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {selectedPeople.length === 0 && (
        <div className="mb-4 text-sm text-red-500 bg-red-50 dark:bg-red-900/20 p-2 rounded border border-red-200 dark:border-red-800">
          ⚠️ Keine Personen ausgewählt. Wähle mindestens eine Person für die Aufteilung aus.
        </div>
      )}

      <button
        type="submit"
        disabled={loading || selectedPeople.length === 0}
        className={`btn-primary w-full ${selectedPeople.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {loading ? (isEditing ? 'Aktualisieren...' : 'Speichern...') : (isEditing ? 'Beleg aktualisieren' : 'Beleg hinzufügen')}
      </button>
    </form>
  );
}
