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

          {/* Quick Summary */}
          {results.items && (
            <div style={{ 
              backgroundColor: '#f8f9fa', 
              padding: '15px', 
              borderRadius: '8px', 
              marginBottom: '20px',
              border: '1px solid #e9ecef'
            }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '16px', color: '#495057' }}>
                📊 Quick Summary
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: '15px' }}>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#007bff' }}>
                    {results.items.length}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6c757d' }}>Items Found</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#28a745' }}>
                    {(() => {
                      const validPrices = results.items
                        .map(item => typeof item.price === 'object' ? item.price.value : item.price)
                        .filter(price => price && !isNaN(price) && price > 0);
                      return validPrices.length;
                    })()}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6c757d' }}>Valid Prices</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#fd7e14' }}>
                    {(() => {
                      const confidences = results.items
                        .map(item => item.confidence)
                        .filter(conf => conf != null);
                      if (confidences.length === 0) return 'N/A';
                      const avgConf = confidences.reduce((sum, conf) => sum + conf, 0) / confidences.length;
                      return Math.round(avgConf * 100) + '%';
                    })()}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6c757d' }}>Avg Confidence</div>
                </div>
              </div>
            </div>
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
                {results.items.map((item, index) => {
                  // Handle both old format (price as number) and new format (price as object)
                  const price = typeof item.price === 'object' ? item.price.value : item.price;
                  const currency = typeof item.price === 'object' ? item.price.currency : 'EUR';
                  const rawPrice = typeof item.price === 'object' ? item.price.raw : item.price;
                  const confidence = item.confidence;

                  return (
                    <div key={index} className="item" style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '12px 0',
                      borderBottom: '1px solid #eee'
                    }}>
                      <div style={{ flex: 1 }}>
                        <span className="item-name" style={{ 
                          fontSize: '16px', 
                          fontWeight: '500',
                          display: 'block',
                          marginBottom: '4px'
                        }}>
                          {item.name}
                        </span>
                        {confidence && (
                          <span style={{ 
                            fontSize: '12px', 
                            color: '#888',
                            backgroundColor: confidence > 0.8 ? '#e7f5e7' : confidence > 0.6 ? '#fff3cd' : '#f8d7da',
                            padding: '2px 6px',
                            borderRadius: '3px',
                            marginRight: '8px'
                          }}>
                            {Math.round(confidence * 100)}% confidence
                          </span>
                        )}
                        {rawPrice && typeof item.price === 'object' && (
                          <span style={{ 
                            fontSize: '12px', 
                            color: '#666',
                            fontFamily: 'monospace'
                          }}>
                            Raw: "{rawPrice}"
                          </span>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className="item-price" style={{ 
                          fontSize: '18px', 
                          fontWeight: 'bold',
                          color: price && !isNaN(price) ? '#2d5a3d' : '#d32f2f'
                        }}>
                          {price && !isNaN(price) ? 
                            `${currency === 'EUR' ? '€' : currency + ' '}${Number(price).toFixed(2)}` : 
                            'Invalid Price'
                          }
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Calculate and show total */}
              {(() => {
                const validPrices = results.items
                  .map(item => typeof item.price === 'object' ? item.price.value : item.price)
                  .filter(price => price && !isNaN(price) && price > 0);
                
                const calculatedTotal = validPrices.reduce((sum, price) => sum + Number(price), 0);
                
                return calculatedTotal > 0 && (
                  <div className="total" style={{ 
                    borderTop: '2px solid #2d5a3d',
                    paddingTop: '15px',
                    marginTop: '15px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '20px',
                    fontWeight: 'bold',
                    color: '#2d5a3d'
                  }}>
                    <span>Total ({validPrices.length} items):</span>
                    <span>€{calculatedTotal.toFixed(2)}</span>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div>
              <p>❌ No items detected clearly.</p>
              <p style={{ fontSize: '14px', color: '#666', marginTop: '10px' }}>
                This might happen if the image quality is poor, the receipt format is unusual, or if the text doesn't contain recognizable price patterns.
              </p>
              {!results.text && (
                <p style={{ fontSize: '14px', color: '#a33', marginTop: '10px' }}>
                  ⚠️ No OCR text was returned from the API. Ensure the server's PaddleOCR service is running and reachable.
                </p>
              )}
              {results.text && (
                <div style={{ marginTop: '15px' }}>
                  <p style={{ fontSize: '14px', color: '#666' }}>
                    <strong>Troubleshooting tips:</strong>
                  </p>
                  <ul style={{ fontSize: '13px', color: '#666', marginLeft: '20px', marginTop: '5px' }}>
                    <li>Ensure the receipt has clear, readable text</li>
                    <li>Check if prices are in a recognizable format (e.g., "12.34€", "€15.99")</li>
                    <li>Try a different angle or better lighting</li>
                    <li>Check the raw OCR text above to see what was detected</li>
                  </ul>
                </div>
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
              
              {/* Show item details for debugging */}
              {results.items && results.items.length > 0 && (
                <details style={{ marginTop: '10px' }}>
                  <summary style={{ cursor: 'pointer', color: '#007bff' }}>Item Details</summary>
                  <div style={{ marginTop: '5px', maxHeight: '200px', overflow: 'auto' }}>
                    {results.items.map((item, index) => (
                      <div key={index} style={{ 
                        marginBottom: '8px', 
                        padding: '6px', 
                        backgroundColor: '#f9f9f9', 
                        borderRadius: '3px',
                        fontSize: '11px'
                      }}>
                        <div><strong>Item {index + 1}:</strong> {item.name}</div>
                        {item.price && typeof item.price === 'object' && (
                          <>
                            <div>Raw Price: "{item.price.raw}"</div>
                            <div>Parsed Value: {item.price.value}</div>
                            <div>Currency: {item.price.currency}</div>
                          </>
                        )}
                        {item.confidence && (
                          <div>Confidence: {(item.confidence * 100).toFixed(1)}%</div>
                        )}
                        {item.rowIndex !== undefined && (
                          <div>Row Index: {item.rowIndex}</div>
                        )}
                        {item.nameBox && (
                          <div>Name Box: [{item.nameBox.map(n => n.toFixed(1)).join(', ')}]</div>
                        )}
                        {item.priceBox && (
                          <div>Price Box: [{item.priceBox.map(n => n.toFixed(1)).join(', ')}]</div>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </details>
        </div>
      )}
    </div>
  )
}