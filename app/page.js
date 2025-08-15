'use client'

import { useRef, useState } from 'react'
export default function HomePage() {
  const [selectedImage, setSelectedImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [isDragging, setIsDragging] = useState(false)

  const inputRef = useRef(null)

  const onFile = (file) => {
    if (!file) return
    setSelectedImage(file)
    setResults(null)
    setError(null)

    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target.result)
    reader.readAsDataURL(file)
  }

  const handleFileChange = (e) => {
    const file = e.target.files && e.target.files[0]
    onFile(file)
  }

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

  const analyzeReceipt = async () => {
    if (!selectedImage) {
      setError('Please select an image first')
      return
    }

    setAnalyzing(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('image', selectedImage)

      const response = await fetch('/api/analyze', { method: 'POST', body: formData })
      const data = await response.json()

      if (!response.ok) throw new Error(data.error || 'Failed to analyze image')

      setResults(data)
    } catch (err) {
      setError(err.message || 'Unknown error')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="container">
      <div className="card">
        <h1 className="title">🧾 ZiCount</h1>
        <p className="subtitle">Receipt Analyzer</p>

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
            onChange={handleFileChange}
            style={{ display: 'none' }}
          />

          <div className="upload-text">
            {selectedImage ? selectedImage.name : isDragging ? 'Drop image here' : 'Click or drag an image'}
          </div>
        </div>

        {imagePreview && (
          <div>
            <img src={imagePreview} alt="Receipt preview" className="image-preview" />
          </div>
        )}

        <button onClick={analyzeReceipt} disabled={!selectedImage || analyzing} className="btn btn-primary">
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

      {error && (
        <div className="error">
          <strong>Error:</strong> {error}
        </div>
      )}

      {results && (
        <div className="card">
          <h2 className="results-title">📋 Analysis Results</h2>
          
          {results.processedImageSize && (
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>
              Processed image: {results.processedImageSize}
            </p>
          )}

          {results.items && results.items.length > 0 ? (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>
                  � Items ({results.itemCount})
                </h3>
                {results.items.map((item, index) => (
                  <div key={index} className="item">
                    <span className="item-name">{item.name}</span>
                    <span className="item-price">€{item.price.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {results.total && (
                <div className="total">
                  <span>Total:</span>
                  <span>€{results.total.toFixed(2)}</span>
                </div>
              )}
              
              {results.text && (
                <details style={{ marginTop: '15px' }}>
                  <summary style={{ cursor: 'pointer', color: '#007bff' }}>View raw OCR text</summary>
                  <div className="raw-text">{results.text}</div>
                </details>
              )}
            </div>
          ) : (
            <div>
              <p>🤔 No items detected clearly.</p>
              {results.text && (
                <details style={{ marginTop: '15px' }}>
                  <summary style={{ cursor: 'pointer', color: '#007bff' }}>View raw OCR text</summary>
                  <div className="raw-text">{results.text}</div>
                </details>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
