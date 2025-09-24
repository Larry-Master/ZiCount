import { useRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useReceipts } from '@/lib/hooks/useReceipts';
import { apiClient } from '@/lib/api/client';
import ManualReceiptForm from '@/components/ManualReceiptForm';
import { usePeople } from '@/lib/hooks/usePeople';

// Dynamic components with loading spinners
const ReceiptDetail = dynamic(() => import('@/components/ReceiptDetail'), {
  loading: () => <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
});
const ReceiptList = dynamic(() => import('@/components/ReceiptList'), {
  loading: () => <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
});
const MyClaims = dynamic(() => import('@/components/MyClaims'), {
  loading: () => <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
});
const PeopleManager = dynamic(() => import('@/components/PeopleManager'), {
  loading: () => <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
});
const DebtSolver = dynamic(() => import('@/components/DebtSolver'), {
  loading: () => <div className="flex justify-center p-8"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div></div>
});

export default function HomePage() {
  const { people } = usePeople();
  const { receipts, loading: receiptsLoading, refetch: refetchReceipts } = useReceipts();

  const inputRef = useRef(null);

  // State management
  const [selectedImage, setSelectedImage] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [savedReceipt, setSavedReceipt] = useState(null);
  const [error, setError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [currentView, setCurrentView] = useState('receipts'); // 'upload', 'receipts', 'receipt', 'claims', 'people', 'schulden'
  // SSR-safe initializer: read persisted selection from localStorage on client
  const [currentUserId, setCurrentUserId] = useState(() => {
    if (typeof window === 'undefined') return 'user1';
    return localStorage.getItem('currentUserId') || 'user1';
  });

  // wrapper that persists selection to localStorage
  const handleSetCurrentUser = (id) => {
    setCurrentUserId(id);
    try {
      localStorage.setItem('currentUserId', id);
    } catch (e) {
      /* ignore storage errors */
    }
  };

  // keep selection in sync across tabs/windows
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e) => {
      if (e.key === 'currentUserId') {
        if (e.newValue) setCurrentUserId(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Ensure we read persisted value once on client mount (helps when SSR initially rendered a fallback)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem('currentUserId');
      console.debug('localStorage.currentUserId=', stored);
      if (stored) setCurrentUserId(stored);
    } catch (e) {
      console.debug('reading localStorage failed', e);
    }
  }, []);
  const [claimsVersion, setClaimsVersion] = useState(0);
  const [showManualForm, setShowManualForm] = useState(false);
  const [selectedParticipants, setSelectedParticipants] = useState([]);

  // Drag & drop
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e) => {
    e.preventDefault(); setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) onFile(file);
  };

  const onFile = (file) => {
    if (!file) return;
    setSelectedImage(file);
    setImagePreview(null);
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
  };

  const analyzeReceipt = async () => {
    if (!selectedImage) return setError('Please select an image first');
    if (!selectedParticipants.length) return setError('Bitte Teilnehmer auswählen');

    setAnalyzing(true); setError(null);
    try {
      const formData = new FormData();
      formData.append('file', selectedImage);
      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'x-file-name': selectedImage.name || `upload_${Date.now()}.jpg` },
        body: formData,
      });

      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }

      if (!response.ok) throw new Error(data.error || data.raw || `Request failed: ${response.status}`);

      const receipt = {
        name: `Receipt ${new Date().toLocaleDateString('de-DE')}`,
        uploadedBy: currentUserId,
        imageUrl: imagePreview,
        items: (data.items || []).map((item, idx) => ({
          id: `item_${Date.now()}_${idx}`,
          name: item.name,
          price: typeof item.price === 'object' ? item.price.value : item.price,
          priceEUR: typeof item.price === 'object' ? item.price.value : item.price,
          confidence: item.confidence,
          tags: ['detected'],
          claimedBy: null,
          claimedAt: null
        })),
        discounts: data.discounts || [],
        totalAmount: data.totalAmount,
        participants: selectedParticipants,
        text: data.text
      };

      const saveResponse = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(receipt),
      });
      if (!saveResponse.ok) throw new Error('Failed to save receipt');
      const saved = await saveResponse.json();
      saved.items = saved.items.map(item => ({ ...item, receiptId: saved.id }));
      setSavedReceipt(saved);
      setCurrentView('receipt');
      refetchReceipts();
      setClaimsVersion(v => v + 1);
    } catch (err) {
      setError(err.message || 'Unknown error');
    } finally { setAnalyzing(false); }
  };

  const handleDeleteReceipt = async (receiptId) => {
    if (!receiptId) return;
    try {
      if (!confirm('Delete this receipt? This will remove the receipt and all associated claims.')) return;
      await apiClient.deleteReceipt(receiptId);
      refetchReceipts();
      setClaimsVersion(v => v + 1);
      setSavedReceipt(null);
      setCurrentView('receipts');
    } catch (err) {
      setError(err.message || 'Delete failed');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-3 sm:mb-0">🧾 ZiCount</h1>
        <div className="flex space-x-2 items-center">
          <button 
            type="button"
            className="add-receipt-btn"
            onClick={() => setShowManualForm(true)}
          >
            Beleg manuell hinzufügen
          </button>
        </div>
      </header>

      {/* Manual Receipt Modal */}
      {showManualForm && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6 relative">
            <button
              className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 text-2xl"
              onClick={() => setShowManualForm(false)}
              aria-label="Schließen"
            >
              &times;
            </button>
            <ManualReceiptForm 
              currentUserId={currentUserId}
              onCreated={(saved) => { if(saved) { setSavedReceipt(saved); setCurrentView('receipt'); } setShowManualForm(false); }} 
              onRefresh={refetchReceipts} 
            />
          </div>
        </div>
      )}

  {/* Navigation Tabs */}
  <div className="relative mb-6">
    <nav className="nav-tabs">
      {['receipts','upload','receipt','claims','people','schulden'].map(view => {
        const labels = { receipts:'📋 All Receipts', upload:'📷 Upload', receipt:'🧾 Current Receipt', claims:'💰 My Claims', people:'👥 People', schulden:'💸 Schulden' };
        if(view==='receipt' && !savedReceipt) return null;
        return (
          <button
            key={view}
            className={`px-3 py-2 rounded-lg ${currentView===view?'bg-indigo-600 text-white':'bg-gray-200 text-gray-700'}`}
            onClick={() => setCurrentView(view)}
          >
            {labels[view]}
          </button>
        )
      })}
    </nav>
    {/* Mobile scroll hint */}
    <div className="block md:hidden text-center mt-2">
      <div className="text-xs text-gray-400 flex items-center justify-center gap-1">
        <span>← Swipe to see more tabs →</span>
      </div>
    </div>
  </div>

      {/* Views */}
      {currentView === 'receipts' && (
        <ReceiptList
          receipts={receipts}
          loading={receiptsLoading}
          onReceiptSelect={(id) => {
            const r = receipts.find(r => r.id===id);
            if(r) { setSavedReceipt(r); setCurrentView('receipt'); }
          }}
        />
      )}

      {currentView === 'upload' && (
        <div className="bg-white rounded-2xl shadow p-6 max-w-md mx-auto">
          <p className="text-lg text-gray-600 mb-4 text-center font-medium">Receipt Analyzer</p>
          <div
            className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-colors ${isDragging?'border-indigo-500 bg-indigo-50':'border-gray-300 bg-white'}`}
            onClick={() => inputRef.current && inputRef.current.click()}
            onDragOver={handleDragOver}
            onDragEnter={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={e => onFile(e.target.files?.[0])} className="hidden" />
            <div className="text-4xl mb-2">📱</div>
            <p className="text-gray-700 mb-1">{selectedImage ? selectedImage.name : isDragging ? 'Drop image here' : 'Tap to take photo or select image'}</p>
            <p className="text-sm text-gray-400">Supports JPG, PNG • Max 10MB</p>
          </div>

          {/* Participant selection */}
          <div className="mt-4 mb-6">
            <label className="block mb-2 font-semibold text-gray-700">Teilnehmer auswählen</label>
            <div className="grid grid-cols-2 gap-2">
              {people.map(p => (
                <label key={p.id} className="flex items-center space-x-2">
                  <input type="checkbox" value={p.id} checked={selectedParticipants.includes(p.id)}
                    onChange={e => setSelectedParticipants(e.target.checked ? [...selectedParticipants,p.id] : selectedParticipants.filter(id => id!==p.id))}
                    className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                  />
                  <span className="text-gray-700">
                    {p.name}
                    {p.id === currentUserId && (
                      <span className="ml-1 text-xs text-gray-500">(Sie bezahlen)</span>
                    )}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {imagePreview && (
            <div className="relative mb-4">
              <img src={imagePreview} className="rounded-lg w-full object-cover" alt="Preview" />
              <button className="absolute top-2 right-2 text-white bg-black bg-opacity-50 rounded-full px-2 hover:bg-opacity-75" onClick={()=>{setSelectedImage(null); setImagePreview(null); setError(null);}}>✕</button>
            </div>
          )}

          <button onClick={analyzeReceipt} disabled={!selectedImage || analyzing} className="w-full py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors">
            {analyzing ? '🔄 Analyzing...' : '🔍 Analyze Receipt'}
          </button>
        </div>
      )}

      {currentView === 'receipt' && savedReceipt && (
        <ReceiptDetail
          receipt={savedReceipt}
          receiptId={savedReceipt.id}
          currentUserId={currentUserId}
          onItemClaimed={(itemId, claimedBy, claimedAt) => {
            setSavedReceipt(prev => ({ ...prev, items: prev.items.map(it => it.id===itemId ? {...it, claimedBy, claimedAt} : it) }));
            (async()=>{try{const fresh=await apiClient.getReceipt(savedReceipt.id); setSavedReceipt(fresh); refetchReceipts();}catch(e){console.error(e)}})();
          }}
          onItemUnclaimed={(itemId)=>{ setSavedReceipt(prev => ({ ...prev, items: prev.items.map(it => it.id===itemId ? {...it, claimedBy:null, claimedAt:null}:it) })); (async()=>{try{const fresh=await apiClient.getReceipt(savedReceipt.id); setSavedReceipt(fresh); refetchReceipts();}catch(e){console.error(e)}})();}}
          onDelete={()=>handleDeleteReceipt(savedReceipt.id)}
          onClaimsUpdated={()=>{ refetchReceipts(); setClaimsVersion(v=>v+1); }}
          onBack={()=>{ setCurrentView('receipts'); setSavedReceipt(null); }}
        />
      )}

      {currentView === 'claims' && <MyClaims userId={currentUserId} onClaimsUpdated={refetchReceipts} refreshKey={claimsVersion} />}
  {currentView === 'people' && <PeopleManager currentUserId={currentUserId} onCurrentUserChange={handleSetCurrentUser} compact={false} />}
  {currentView === 'schulden' && <DebtSolver />}

      {error && <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg">{error}</div>}
    </div>
  )
}
