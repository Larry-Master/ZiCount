/**
 * ZiCount - Receipt Sharing & Expense Tracking App
 * Main Page Component
 * 
 * This is the primary interface for the receipt sharing application.
 * Users can upload receipt images, view analyzed items, claim items,
 * manage people, and track shared expenses.
 * 
 * Key Features:
 * - Receipt image upload with drag & drop
 * - Google Cloud Document AI integration for receipt analysis
 * - Item claiming system for shared expenses
 * - Debt calculation and settlement
 * - Multi-user support with local storage persistence
 */

import { useRef, useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useReceipts, useReceiptMutations } from '@/lib/hooks/useReceipts';
import { useReceiptUpload } from '@/lib/hooks/useReceiptUpload';
import { apiClient } from '@/lib/api/client';
import ManualReceiptForm from '@/components/ManualReceiptForm';
import ParticipantSelector from '@/components/ui/ParticipantSelector';
import { usePeople } from '@/lib/hooks/usePeople';

// Dynamic component imports with loading states for better UX
import { ComponentLoader } from '@/components/ui/Loading';

const ReceiptDetail = dynamic(() => import('@/components/ReceiptDetail'), {
  loading: () => <ComponentLoader />
});
const ReceiptList = dynamic(() => import('@/components/ReceiptList'), {
  loading: () => <ComponentLoader />
});
const MyClaims = dynamic(() => import('@/components/MyClaims'), {
  loading: () => <ComponentLoader />
});
const PeopleManager = dynamic(() => import('@/components/PeopleManager'), {
  loading: () => <ComponentLoader />
});
const DebtSolver = dynamic(() => import('@/components/DebtSolver'), {
  loading: () => <ComponentLoader />
});

export default function HomePage() {
  // Custom hooks for data management
  const { people } = usePeople();
  const { receipts, loading: receiptsLoading, refetch: refetchReceipts } = useReceipts();
  const { deleteReceiptMutate, deleting } = useReceiptMutations();
  const [removedReceipts, setRemovedReceipts] = useState(() => new Set());
  const { selectedImage, imagePreview, analyzing, error: uploadError, handleFile, analyzeReceipt, clearSelection } = useReceiptUpload();

  // Page-level error state (some handlers in this page call setError)
  const [error, setError] = useState(null);

  // Sync upload hook errors into the page-level error so UI shows them
  useEffect(() => {
    if (uploadError) setError(uploadError);
  }, [uploadError]);

  // File input reference for programmatic access
  const inputRef = useRef(null);

  // Component state management
  const [savedReceipt, setSavedReceipt] = useState(null);       // Processed and saved receipt data
  const [isDragging, setIsDragging] = useState(false);          // Drag & drop visual feedback
  const [currentView, setCurrentView] = useState('receipts');   // Current active view/tab
  
  // SSR-safe user selection with localStorage persistence
  const [currentUserId, setCurrentUserId] = useState(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('currentUserId') || null;
  });

  // Wrapper function to persist user selection to localStorage
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
      if (stored) setCurrentUserId(stored);
    } catch (e) {
      // Ignore localStorage errors
    }
  }, []);
  const [claimsVersion, setClaimsVersion] = useState(0);
  const [showManualForm, setShowManualForm] = useState(false);
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const [paidBy, setPaidBy] = useState(currentUserId || '');
  const [receiptTitle, setReceiptTitle] = useState(`Receipt ${new Date().toLocaleDateString('de-DE')}`);

  // Update paidBy when currentUserId changes
  useEffect(() => {
    if (currentUserId && !paidBy) {
      setPaidBy(currentUserId);
    }
  }, [currentUserId, paidBy]);

  // Ensure paidBy defaults to a valid person when the people list becomes
  // available (covers the case where the creator isn't selected but they
  // chose a payer from the dropdown — we want a controlled value).
  useEffect(() => {
    if ((!paidBy || paidBy === '') && people && people.length > 0) {
      setPaidBy(currentUserId || people[0].id);
    }
  }, [people, currentUserId, paidBy]);

  // Reusable function to refresh receipt data after item changes
  const refreshReceiptData = async () => {
    if (!savedReceipt?.id) return;
    try {
      const fresh = await apiClient.getReceipt(savedReceipt.id);
      setSavedReceipt(fresh);
      refetchReceipts();
    } catch (e) {
      console.error('Failed to refresh receipt data:', e);
    }
  };

  // Drag & drop
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e) => {
    e.preventDefault(); 
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  };

  const handleAnalyzeReceipt = async () => {
    if (!selectedParticipants.length) {
      // Use the error state from the upload hook
      return;
    }

    const receiptData = {
      title: receiptTitle,
      paidBy: paidBy,
      participants: selectedParticipants
    };

    const receipt = await analyzeReceipt(receiptData);
    if (receipt) {
      const saveResponse = await fetch('/api/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(receipt),
      });
      
      if (saveResponse.ok) {
        const saved = await saveResponse.json();
        saved.items = saved.items.map(item => ({ ...item, receiptId: saved.id }));
        setSavedReceipt(saved);
        setCurrentView('receipt');
        refetchReceipts();
        setClaimsVersion(v => v + 1);
      }
    }
  };

  const handleDeleteReceipt = async (receiptId) => {
    if (!receiptId) return;
    try {
      if (!confirm('Delete this receipt? This will remove the receipt and all associated claims.')) return;
  // Optimistic delete: updates the receipts cache immediately and will
  // rollback if the server call fails. Do not trigger an immediate
  // refetch here (it can race with conditional GET headers and briefly
  // repopulate a deleted receipt). Mutation's onSettled will invalidate
  // the queries which triggers a controlled refetch.
  // Fire optimistic mutate so onMutate runs immediately and UI updates
  // without waiting for the server response.
  // Mark as removed locally so the overview doesn't show it while
  // the optimistic mutation and any background refetch run.
  setRemovedReceipts(prev => new Set([...prev, receiptId]));
  deleteReceiptMutate(receiptId);
  // Update UI immediately
  setSavedReceipt(null);
  setCurrentView('receipts');
  setClaimsVersion(v => v + 1);
    } catch (err) {
      setError(err.message || 'Delete failed');
    }
  };

  // When the receipts list updates from the server, remove any ids
  // from `removedReceipts` that no longer exist in the server result.
  useEffect(() => {
    if (!removedReceipts || removedReceipts.size === 0) return;
    setRemovedReceipts(prev => {
      const next = new Set(prev);
      for (const id of prev) {
        if (!receipts.find(r => r.id === id)) next.delete(id);
      }
      return next;
    });
  }, [receipts]);

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
        <div className="bg-white rounded-2xl shadow-lg w-full max-w-md sm:max-w-lg p-6 relative max-h-[85vh] overflow-auto">
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
        const labels = { 
          receipts:'📋 Receipts', 
          upload:'📷 Upload', 
          receipt:'🧾 Receipt', 
          claims:'💰 Claims', 
          people:'👥 People', 
          schulden:'💸 Debts' 
        };
        if(view==='receipt' && !savedReceipt) return null;
        return (
          <button
            key={view}
            className={`nav-btn ${currentView===view ? 'nav-btn-active' : 'nav-btn-inactive'}`}
            onClick={() => {
              setCurrentView(view);
              setError(null); // Clear any existing errors when switching views
            }}
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
        (() => {
          const visibleReceipts = receipts.filter(r => !removedReceipts.has(r.id));
          return (
            <ReceiptList
              receipts={visibleReceipts}
              loading={receiptsLoading}
              currentUserId={currentUserId}
              onReceiptSelect={(id) => {
                const r = visibleReceipts.find(r => r.id===id);
                if(r) { setSavedReceipt(r); setCurrentView('receipt'); }
              }}
            />
          );
        })()
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
            <input ref={inputRef} type="file" accept="image/*" onChange={e => handleFile(e.target.files?.[0])} className="sr-only" />
            <div className="text-4xl mb-2">📱</div>
            <p className="text-gray-700 mb-1">{selectedImage ? selectedImage.name : isDragging ? 'Drop image here' : 'Tap to take photo or select image'}</p>
            <p className="text-sm text-gray-400">Supports various Image types • Max 20MB</p>
            {selectedImage && selectedImage.size > 0 && (
              <p className="text-xs text-gray-500 mt-1">
                File size: {Math.round(selectedImage.size / 1024)}KB
                {selectedImage.size > 4 * 1024 * 1024 && (
                  <span className="text-amber-600 ml-1">⚠️ Large file - may cause upload issues</span>
                )}
              </p>
            )}
          </div>

          {/* Receipt title input */}
          <div className="mt-4 mb-4">
            <label className="block mb-2 font-semibold text-gray-700">Beleg Titel</label>
            <input
              type="text"
              value={receiptTitle}
              onChange={(e) => setReceiptTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="z.B. Einkauf Supermarkt"
            />
          </div>

          {/* Paid by dropdown */}
          <div className="mt-4 mb-4">
            <label className="block mb-2 font-semibold text-gray-700">Bezahlt von</label>
            <select
              value={paidBy}
              onChange={(e) => setPaidBy(e.target.value)}
              className="paid-by-dropdown"
            >
              {people.map(person => (
                <option key={person.id} value={person.id}>
                  {person.name} {person.id === currentUserId ? '(ich)' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Participant selection */}
          <ParticipantSelector
            selectedParticipants={selectedParticipants}
            onSelectionChange={setSelectedParticipants}
            paidBy={paidBy}
            currentUserId={currentUserId}
            className="mt-4 mb-6"
            required
          />

          {imagePreview && (
            <div className="relative mb-4">
              <img src={imagePreview} className="rounded-lg w-full object-cover" alt="Preview" />
              <button className="absolute top-2 right-2 text-white bg-black bg-opacity-50 rounded-full px-2 hover:bg-opacity-75" onClick={() => clearSelection()}>✕</button>
            </div>
          )}

          <button onClick={handleAnalyzeReceipt} disabled={!selectedImage || analyzing} className="btn-primary w-full">
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
            // Apply optimistic update locally. Do NOT trigger an immediate
            // server refresh here — that causes the UI to wait on network
            // roundtrips and leads to the visible 2s delay.
            setSavedReceipt(prev => ({ ...prev, items: prev.items.map(it => it.id===itemId ? {...it, claimedBy, claimedAt} : it) }));
          }}
          onItemUnclaimed={(itemId) => { 
            // Optimistically update UI; background mutation/invalidation will
            // reconcile with the server. Avoid immediate refresh to prevent UI lag.
            setSavedReceipt(prev => ({ ...prev, items: prev.items.map(it => it.id===itemId ? {...it, claimedBy:null, claimedAt:null}:it) })); 
          }}
          onDelete={()=>handleDeleteReceipt(savedReceipt.id)}
          onClaimsUpdated={()=>{ refetchReceipts(); setClaimsVersion(v=>v+1); }}
          onBack={()=>{ setCurrentView('receipts'); setSavedReceipt(null); }}
        />
      )}

      {currentView === 'claims' && (
        <MyClaims
          userId={currentUserId}
          refreshKey={claimsVersion}
          onClaimsUpdated={async () => {
            try {
              // Refetch receipts list cache
              await refetchReceipts();
              // If a receipt is currently opened in detail, refresh it too
              await refreshReceiptData();
              setClaimsVersion(v => v + 1);
            } catch (e) {
              console.error('Failed to refresh after claims update', e);
            }
          }}
        />
      )}
  {currentView === 'people' && (
    <PeopleManager 
      currentUserId={currentUserId} 
      onCurrentUserChange={handleSetCurrentUser} 
      onDataChanged={() => {
        refetchReceipts();
        setClaimsVersion(v => v + 1);
      }}
      compact={false} 
    />
  )}
  {currentView === 'schulden' && <DebtSolver />}

      {error && <div className="mt-4 p-3 bg-red-100 text-red-700 rounded-lg">{error}</div>}
    </div>
  )
}
