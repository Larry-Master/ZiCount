// Simplified OCR analysis API with remote HTTPS endpoint support
// Constraints: No SSH libs, no multer - use OCR_REMOTE_URL for processing

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
}

// Parse multipart form data without multer
async function parseFormData(req) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.includes('multipart/form-data')) {
    throw new Error('Content-Type must be multipart/form-data');
  }

  const boundary = contentType.split('boundary=')[1];
  if (!boundary) {
    throw new Error('No boundary found in multipart data');
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  
  const buffer = Buffer.concat(chunks);
  const textData = buffer.toString('binary');
  
  // Simple multipart parsing (for single file upload)
  const parts = textData.split('--' + boundary);
  
  for (const part of parts) {
    if (part.includes('Content-Disposition: form-data') && part.includes('filename=')) {
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd === -1) continue;
      
      const headers = part.substring(0, headerEnd);
      const filenameMatch = headers.match(/filename="([^"]+)"/);
      const nameMatch = headers.match(/name="([^"]+)"/);
      
      if (filenameMatch && nameMatch) {
        const filename = filenameMatch[1];
        const fieldName = nameMatch[1];
        
        // Extract binary data
        const dataStart = headerEnd + 4; // Skip \r\n\r\n
        const dataEnd = part.lastIndexOf('\r\n');
        const fileData = Buffer.from(part.substring(dataStart, dataEnd), 'binary');
        
        return {
          fieldName,
          filename,
          data: fileData,
          size: fileData.length
        };
      }
    }
  }
  
  throw new Error('No file found in multipart data');
}


export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse uploaded file
    const fileInfo = await parseFormData(req);
    
    if (!fileInfo) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

 

    // Check if file is an image
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    const fileExt = fileInfo.filename.toLowerCase().split('.').pop();
    const isValidImage = ['jpg', 'jpeg', 'png', 'webp'].includes(fileExt);
    
    if (!isValidImage) {
      return res.status(400).json({ error: 'Invalid file type. Please upload an image (JPG, PNG, WebP).' });
    }

    console.log(`Processing image: ${fileInfo.filename} (${fileInfo.size} bytes)`);

    // Try to use external OCR service
    const ocrRemoteUrl = process.env.OCR_REMOTE_URL;
    
    if (ocrRemoteUrl) {
      try {
        console.log('Sending to external OCR service...');
        
        // Create form data for remote service
        const formData = new FormData();
        const blob = new Blob([fileInfo.data], { type: `image/${fileExt}` });
        formData.append('file', blob, fileInfo.filename);

        const response = await fetch(ocrRemoteUrl, {
          method: 'POST',
          body: formData,
          headers: {
            'User-Agent': 'ZiCount/1.0',
          },
          timeout: 120000, // 2 minutes timeout
        });

        if (response.ok) {
          const ocrResult = await response.json();
          
          // Transform remote OCR result to our format
          const transformedResult = {
            success: true,
            text: ocrResult.text || ocrResult.ocrText || '',
            total: ocrResult.total || "0.00",
            items: (ocrResult.items || []).map((item, index) => ({
              id: `item_${Date.now()}_${index}`,
              name: item.name || `Item ${index + 1}`,
              price: typeof item.price === 'object' ? item.price.value : (item.price || 0),
              quantity: item.quantity || 1,
              confidence: item.confidence || 0.8
            })),
            vendor: ocrResult.vendor || "Unknown Store",
            date: ocrResult.date || new Date().toISOString().split('T')[0],
            itemCount: ocrResult.itemCount || (ocrResult.items?.length || 0),
            debug: { ocrEngine: 'remote', remoteUrl: ocrRemoteUrl }
          };

          console.log(`OCR completed: ${transformedResult.items.length} items found`);
          return res.status(200).json(transformedResult);
        } else {
          console.warn(`Remote OCR service failed: ${response.status} ${response.statusText}`);
        }
      } catch (fetchError) {
        console.warn('Remote OCR service error:', fetchError.message);
      }
    }

    // Fallback to mock analysis
    console.log('Using fallback analysis...');
    const fallbackResult = getFallbackAnalysis(fileInfo.filename);
    fallbackResult.debug = { ocrEngine: 'fallback', reason: 'remote_service_unavailable' };
    
    return res.status(200).json(fallbackResult);

  } catch (error) {
    console.error('Analysis error:', error);
    
    // Return fallback even on errors
    try {
      const fallbackResult = getFallbackAnalysis('unknown.jpg');
      fallbackResult.debug = { ocrEngine: 'fallback', reason: 'error_occurred', error: error.message };
      return res.status(200).json(fallbackResult);
    } catch (fallbackError) {
      return res.status(500).json({ 
        error: 'Analysis failed', 
        message: error.message 
      });
    }
  }
}
