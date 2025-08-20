"use client"

import { useRef, useState } from 'react'

export default function HomePage() {
  const [selectedImage, setSelectedImage] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [isDragging, setIsDragging] = useState(false)
  const [showOcrText, setShowOcrText] = useState(false)

  const inputRef = useRef(null)

  const onFile = (file) => {
    if (!file) return
    setSelectedImage(file)
    setResults(null)
    setError(null)
    setImagePreview(null) // Reset image preview when a new file is selected

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
    setShowOcrText(false) // Reset the OCR text visibility

    try {
      const formData = new FormData();
      formData.append('file', selectedImage);

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        data = { raw: text };
      }

      if (!response.ok) throw new Error(data.error || data.raw || `Request failed: ${response.status}`);

      setResults(data);
    } catch (err) {
      setError(err.message || 'Unknown error');
    } finally {
      setAnalyzing(false);
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
            capture="environment"
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
          {(results.originalImageSize || results.processedImageSize) && (
            <p style={{ fontSize: '14px', color: '#666', marginBottom: '15px' }}>
              {results.originalImageSize && results.processedImageSize ? (
                <>
                  Image: {Math.round(results.originalImageSize / 1024)}KB → {Math.round(results.processedImageSize / (1024))}KB
                  {results.debug?.compressionRatio && ` (${results.debug.compressionRatio}% compressed)`}
                </>
              ) : (
                `Processed image: ${results.processedImageSize}`
              )}
            </p>
          )}

          {/* Always show OCR text button first */}
          {results.text && (
            <div style={{ marginBottom: '20px' }}>
              <button 
                onClick={() => setShowOcrText(!showOcrText)}
                style={{ 
                  cursor: 'pointer', 
                  color: '#007bff', 
                  background: 'none', 
                  border: '1px solid #007bff', 
                  padding: '8px 16px',
                  borderRadius: '4px',
                  fontSize: '14px' 
                }}
              >
                {showOcrText ? 'Hide' : 'Show'} Raw OCR Text
              </button>
              {showOcrText && (
                <div className="raw-text" style={{ 
                  marginTop: '10px', 
                  padding: '10px', 
                  background: '#f5f5f5', 
                  border: '1px solid #ddd', 
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  maxHeight: '300px',
                  overflow: 'auto'
                }}>
                  {results.text}
                </div>
              )}
            </div>
          )}

          {results.items && results.items.length > 0 ? (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '18px', marginBottom: '10px' }}>Items ({results.itemCount})</h3>
                {results.items.map((item, index) => (
                  <div key={index} className="item">
                    <span className="item-name">{item.name}</span>
                    <span className="item-price">€{item.price?.toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {results.total != null && (
                <div className="total">
                  <span>Total:</span>
                  <span>€{results.total?.toFixed(2)}</span>
                </div>
              )}
            </div>
          ) : (
            <div>
              <p>❌ No items detected clearly.</p>
              <p style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>
                This might happen if the image quality is poor or the receipt format is unusual.
              </p>
              {!results.text && (
                <p style={{ fontSize: '14px', color: '#a33', marginTop: '10px' }}>
                  ⚠️ No OCR text was returned from the API. Ensure the server's PaddleOCR service is running and reachable.
                </p>
              )}
            </div>
          )}

          {/* Debug info */}
          <details style={{ marginTop: '15px', fontSize: '12px', color: '#666' }}>
            <summary style={{ cursor: 'pointer' }}>Debug Info</summary>
              <div style={{ marginTop: '5px', fontFamily: 'monospace' }}>
              <p>OCR Engine: {results.debug?.ocrEngine || 'PaddleOCR'}</p>
              <p>OCR Exit Code: {results.debug?.ocrExitCode || 'Unknown'}</p>
              <p>Processing Time: {results.debug?.processingTimeMs || 'Unknown'}ms</p>
              <p>Text Length: {results.text?.length || 0} characters</p>
              <p>Items Found: {results.items?.length || 0}</p>
            </div>
          </details>
        </div>
      )}
    </div>
  )
}