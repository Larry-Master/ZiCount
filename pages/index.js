import { useRef, useState, useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useReceipts } from '@/lib/hooks/useReceipts'
import { apiClient } from '@/lib/api/client'

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
  // State management
  const [selectedImage, setSelectedImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [currentView, setCurrentView] = useState('receipts') // 'upload', 'receipts', 'receipt', 'claims', 'people'
  const [currentUserId, setCurrentUserId] = useState('user1') // Default user
  const [selectedReceiptId, setSelectedReceiptId] = useState(null)
  const [claimsVersion, setClaimsVersion] = useState(0)

  const { receipts, loading: receiptsLoading, refetch: refetchReceipts } = useReceipts()
  const inputRef = useRef(null)

  // File handling functions
  const onFile = (file) => {
    if (!file) return
    setSelectedImage(file)
    setResults(null)
    setError(null)
    setImagePreview(null)

    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target.result)
    reader.readAsDataURL(file)
  }

  const handleFileChange = (e) => {
    const file = e.target.files && e.target.files[0]
    onFile(file)
  }

  // Drag and drop handlers
  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const files = e.dataTransfer && e.dataTransfer.files
    if (files && files.length > 0) onFile(files[0])
  }

  // Receipt analysis function
  const analyzeReceipt = async () => {
    if (!selectedImage) {
      setError('Please select an image first')
      return
    }

    setAnalyzing(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', selectedImage)

      const response = await fetch('/api/analyze', {
        method: 'POST',
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

      setResults(savedReceipt)
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
      setSelectedReceiptId(null)
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
          {results && (
            <button 
              className={currentView === 'receipt' ? 'active' : ''}
              onClick={() => setCurrentView('receipt')}
            >
              🧾 Current Receipt
            </button>
          )}
          {selectedReceiptId && (
            <button 
              className={currentView === 'selected-receipt' ? 'active' : ''}
              onClick={() => setCurrentView('selected-receipt')}
            >
              🧾 Selected Receipt
            </button>
          )}
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
              setSelectedReceiptId(receiptId)
              setCurrentView('selected-receipt')
            }}
          />
        </div>
      )}

      {/* Selected Receipt Detail */}
      {currentView === 'selected-receipt' && selectedReceiptId && (
        <ReceiptDetail
          receiptId={selectedReceiptId}
          currentUserId={currentUserId}
          onBack={() => setCurrentView('receipts')}
          onClaimsUpdated={() => { 
            refetchReceipts() 
            setClaimsVersion(v => v + 1) 
          }}
          onDelete={() => handleDeleteReceipt(selectedReceiptId)}
        />
      )}

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
                onChange={handleFileChange}
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

            {imagePreview && (
              <div className="image-preview-container">
                <img src={imagePreview} alt="Receipt preview" className="image-preview" />
                <button 
                  className="remove-image"
                  onClick={() => {
                    setSelectedImage(null)
                    setImagePreview(null)
                    setResults(null)
                    setError(null)
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
      {currentView === 'receipt' && results && (
        <ReceiptDetail
          receipt={results}
          currentUserId={currentUserId}
          onItemClaimed={(itemId, claimedBy, claimedAt) => {
            setResults(prev => ({
              ...prev,
              items: prev.items.map(it => it.id === itemId ? { ...it, claimedBy, claimedAt } : it)
            }))
          }}
          onItemUnclaimed={(itemId) => {
            setResults(prev => ({
              ...prev,
              items: prev.items.map(it => it.id === itemId ? { ...it, claimedBy: null, claimedAt: null } : it)
            }))
          }}
          onDelete={() => handleDeleteReceipt(results.id)}
          onClaimsUpdated={() => { 
            refetchReceipts() 
            setClaimsVersion(v => v + 1) 
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
