import { useRef, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useReceipts } from '@/lib/hooks/useReceipts'
import { apiClient } from '@/lib/api/client'
import ManualReceiptForm from '@/components/ManualReceiptForm';
import { usePeople } from '@/lib/hooks/usePeople';

// Dynamic imports for better code splitting and mobile performance
const ReceiptDetail = dynamic(() => import('@/components/ReceiptDetail'), {
  loading: () => <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
})

const ReceiptList = dynamic(() => import('@/components/ReceiptList'), {
  loading: () => <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
})

const MyClaims = dynamic(() => import('@/components/MyClaims'), {
  loading: () => <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
})

const PeopleManager = dynamic(() => import('@/components/PeopleManager'), {
  loading: () => <div className="flex items-center justify-center p-8">
    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
  </div>
})

export default function HomePage() {
  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = e.dataTransfer && e.dataTransfer.files;
    if (files && files.length > 0) onFile(files[0]);
  };
  // State management
  const [selectedImage, setSelectedImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  // Remove unused results state
  const [savedReceipt, setSavedReceipt] = useState(null); // Use for all receipt detail views
  const [error, setError] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [currentView, setCurrentView] = useState('receipts') // 'upload', 'receipts', 'receipt', 'claims', 'people'
  const [currentUserId, setCurrentUserId] = useState('user1') // Default user
  // Always use savedReceipt for current receipt view
  const [claimsVersion, setClaimsVersion] = useState(0)
  const [showManualForm, setShowManualForm] = useState(false);
  const [selectedParticipants, setSelectedParticipants] = useState([]);
  const { people } = usePeople();

  const { receipts, loading: receiptsLoading, refetch: refetchReceipts } = useReceipts()
  const inputRef = useRef(null)

  // File handling functions
  const onFile = (file) => {
    if (!file) return;
    setSelectedImage(file);
    setError(null);
    setImagePreview(null);

    const reader = new FileReader();
    reader.onload = (e) => setImagePreview(e.target.result);
    reader.readAsDataURL(file);
  };

  // Receipt analysis function
  const analyzeReceipt = async () => {
    if (!selectedImage) {
      setError('Please select an image first')
    // Remove unused results state
    }
    if (!selectedParticipants.length) {
      setError('Bitte Teilnehmer auswählen')
      return
    }

    setAnalyzing(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedImage)

      const response = await fetch('/api/analyze', {
        method: 'POST',
        headers: {
          'x-file-name': selectedImage.name || `upload_${Date.now()}.jpg`
        },
        body: formData,
      })

      const text = await response.text()
      let data
      try {
        data = JSON.parse(text)
      } catch (e) {
        data = { raw: text }
      }

      if (!response.ok) throw new Error(data.error || data.raw || `Request failed: ${response.status}`)

      // Transform OCR results into claimable items format
      const receipt = {
        name: `Receipt ${new Date().toLocaleDateString('de-DE')}`,
        uploadedBy: currentUserId,
        imageUrl: imagePreview,
        items: (data.items || []).map((item, index) => ({
          id: `item_${Date.now()}_${index}`,
          name: item.name,
          price: typeof item.price === 'object' ? item.price.value : item.price,
          priceEUR: typeof item.price === 'object' ? item.price.value : item.price,
          confidence: item.confidence,
          tags: ['detected'],
          claimedBy: null,
          claimedAt: null
        })),
        participants: selectedParticipants,
        text: data.text
      }

      // Save receipt to database
      const saveResponse = await fetch('/api/receipts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(receipt),
      })

      if (!saveResponse.ok) {
        throw new Error('Failed to save receipt')
      }

      const savedReceipt = await saveResponse.json()
      
      // Update items with the saved receipt ID
      savedReceipt.items = savedReceipt.items.map(item => ({
        ...item,
        receiptId: savedReceipt.id
      }))

  setSavedReceipt(savedReceipt)
      setCurrentView('receipt')
      refetchReceipts()
      setClaimsVersion(v => v + 1)
    } catch (err) {
      setError(err.message || 'Unknown error')
    } finally {
      setAnalyzing(false)
    }
  }

  // Receipt deletion handler
  const handleDeleteReceipt = async (receiptId) => {
    if (!receiptId) return
    try {
      if (!confirm('Delete this receipt? This will remove the receipt and all associated claims.')) return
      await apiClient.deleteReceipt(receiptId)
      refetchReceipts()
      setClaimsVersion(v => v + 1)
  setSavedReceipt(null)
      setCurrentView('receipts')
    } catch (err) {
      setError(err.message || 'Delete failed')
    }
  }

  return (
    <div className="container">
      {/* App Header */}
      <div className="app-header">
        <h1 className="title">🧾 ZiCount</h1>
        <div className="header-controls">
          <PeopleManager 
            currentUserId={currentUserId}
            onCurrentUserChange={setCurrentUserId}
            compact={true}
          />
        </div>
        <div className="mt-4">
          <button
            className="btn btn-primary"
            onClick={() => setShowManualForm(true)}
          >
            Beleg manuell hinzufügen
          </button>
        </div>
        {showManualForm && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-lg p-6 w-full max-w-md relative">
              <button
                className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-xl"
                onClick={() => setShowManualForm(false)}
                aria-label="Schließen"
              >
                &times;
              </button>
              <ManualReceiptForm onCreated={(saved) => {
                // If the form returns the saved receipt, open it immediately
                if (saved) {
                  setSavedReceipt(saved);
                  setCurrentView('receipt');
                }
                setShowManualForm(false);
              }} onRefresh={refetchReceipts} />
            </div>
          </div>
        )}
        <nav className="nav-tabs">
          <button 
            className={currentView === 'receipts' ? 'active' : ''}
            onClick={() => setCurrentView('receipts')}
          >
            📋 All Receipts
          </button>
          <button 
            className={currentView === 'upload' ? 'active' : ''}
            onClick={() => setCurrentView('upload')}
          >
            📷 Upload
          </button>
          {savedReceipt && (
            <button 
              className={currentView === 'receipt' ? 'active' : ''}
              onClick={() => setCurrentView('receipt')}
            >
              🧾 Current Receipt
            </button>
          )}
          {/* Removed selectedReceiptId and broken JSX */}
          <button 
            className={currentView === 'claims' ? 'active' : ''}
            onClick={() => setCurrentView('claims')}
          >
            💰 My Claims
          </button>
          <button 
            className={currentView === 'people' ? 'active' : ''}
            onClick={() => setCurrentView('people')}
          >
            👥 People
          </button>
        </nav>
      </div>

      {/* Receipts Overview */}
      {currentView === 'receipts' && (
        <div className="receipts-overview">
          <ReceiptList
            receipts={receipts}
            loading={receiptsLoading}
            onReceiptSelect={(receiptId) => {
              const found = receipts.find(r => r.id === receiptId);
              if (found) {
                setSavedReceipt(found);
                setCurrentView('receipt');
              }
            }}
          />
        </div>
      )}

  {/* Removed selected-receipt view */}

      {/* Upload Section */}
      {currentView === 'upload' && (
        <div className="upload-section">
          <div className="upload-card">
            <p className="text-lg text-gray-600 mb-6 text-center">Receipt Analyzer</p>

            <div
              className={`upload-area ${selectedImage ? 'has-file' : ''} ${isDragging ? 'drag-over' : ''}`}
              onClick={() => inputRef.current && inputRef.current.click()}
              onDragOver={handleDragOver}
              onDragEnter={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <input
                ref={inputRef}
                id="image-upload"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={e => onFile(e.target.files && e.target.files[0])}
                style={{ display: 'none' }}
              />

              <div className="upload-content">
                <div className="upload-icon">📱</div>
                <div className="upload-text">
                  {selectedImage ? selectedImage.name : isDragging ? 'Drop image here' : 'Tap to take photo or select image'}
                </div>
                <div className="upload-hint">
                  Supports JPG, PNG • Max 10MB
                </div>
              </div>
            </div>

            {/* Participant selection */}
            <div className="mb-4">
              <label className="block mb-1 font-semibold">Teilnehmer auswählen</label>
              <div className="grid grid-cols-2 gap-2">
                {people.map(p => (
                  <label key={p.id} className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      value={p.id}
                      checked={selectedParticipants.includes(p.id)}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedParticipants([...selectedParticipants, p.id]);
                        } else {
                          setSelectedParticipants(selectedParticipants.filter(id => id !== p.id));
                        }
                      }}
                    />
                    <span>{p.name}</span>
                  </label>
                ))}
              </div>
            </div>

            {imagePreview && (
              <div className="image-preview-container">
                <img src={imagePreview} alt="Receipt preview" className="image-preview" />
                <button 
                  className="remove-image"
                  onClick={() => {
                    setSelectedImage(null);
                    setImagePreview(null);
                    setError(null);
                  }}
                >
                  ✕
                </button>
              </div>
            )}

            <button 
              onClick={analyzeReceipt} 
              disabled={!selectedImage || analyzing} 
              className="btn btn-primary w-full"
            >
              {analyzing ? (
                <div className="loading">
                  <div className="spinner" />
                  Analyzing...
                </div>
              ) : (
                '🔍 Analyze Receipt'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Current Receipt Detail */}
      {currentView === 'receipt' && savedReceipt && (
        <ReceiptDetail
          receipt={savedReceipt}
          receiptId={savedReceipt.id}
          currentUserId={currentUserId}
          onItemClaimed={(itemId, claimedBy, claimedAt) => {
            // optimistic local update
            setSavedReceipt(prev => ({
              ...prev,
              items: prev.items.map(it => it.id === itemId ? { ...it, claimedBy, claimedAt } : it)
            }));
            // fetch fresh receipt to ensure server state (prevents double-delete or stale actions)
            (async () => {
              try {
                const fresh = await apiClient.getReceipt(savedReceipt.id);
                setSavedReceipt(fresh);
                refetchReceipts();
              } catch (err) {
                console.error('Failed to refresh receipt after claim:', err);
              }
            })();
          }}
          onItemUnclaimed={(itemId) => {
            setSavedReceipt(prev => ({
              ...prev,
              items: prev.items.map(it => it.id === itemId ? { ...it, claimedBy: null, claimedAt: null } : it)
            }));
            (async () => {
              try {
                const fresh = await apiClient.getReceipt(savedReceipt.id);
                setSavedReceipt(fresh);
                refetchReceipts();
              } catch (err) {
                console.error('Failed to refresh receipt after unclaim:', err);
              }
            })();
          }}
          onDelete={() => handleDeleteReceipt(savedReceipt.id)}
          onClaimsUpdated={() => { 
            refetchReceipts() 
            setClaimsVersion(v => v + 1) 
          }}
          onBack={() => {
            setCurrentView('receipts');
            setSavedReceipt(null);
          }}
        />
      )}

      {/* My Claims */}
      {currentView === 'claims' && (
        <MyClaims 
          userId={currentUserId} 
          onClaimsUpdated={refetchReceipts}
          refreshKey={claimsVersion}
        />
      )}

      {/* People Management */}
      {currentView === 'people' && (
        <div className="people-section">
          <PeopleManager 
            currentUserId={currentUserId}
            onCurrentUserChange={setCurrentUserId}
            compact={false}
          />
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="error-message">
          <strong>Error:</strong> {error}
        </div>
      )}
    </div>
  )
}
