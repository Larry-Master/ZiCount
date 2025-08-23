// pages/api/analyze.js
import formidable from 'formidable';
import fs from 'fs';
import FormData from 'form-data';

// Disable Next.js body parsing; we handle multipart form data manually
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * API Route: POST /api/analyze
 * Accepts multipart/form-data file upload and forwards to Flask OCR server.
 * Works both locally and on Vercel with OCR_REMOTE_URL.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse multipart form data
    const form = formidable({
      maxFileSize: 50 * 1024 * 1024, // 50MB limit
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);
    const file = files.file?.[0];

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const remoteUrl = process.env.OCR_REMOTE_URL;
    if (!remoteUrl) {
      return res.status(500).json({ error: 'OCR_REMOTE_URL not configured' });
    }

    console.log('Forwarding file to Flask OCR server:', remoteUrl);
    console.log('File details:', { 
      name: file.originalFilename, 
      size: file.size, 
      type: file.mimetype 
    });

    // Create FormData for Flask server
    const formData = new FormData();
    formData.append('file', fs.createReadStream(file.filepath), {
      filename: file.originalFilename || 'receipt.jpg',
      contentType: file.mimetype || 'image/jpeg',
    });

    // Send to Flask OCR server
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min timeout

    let forwardRes;
    try {
      const fetch = (await import('node-fetch')).default;
      forwardRes = await fetch(`${remoteUrl}/analyze`, {
        method: 'POST',
        headers: {
          ...formData.getHeaders(),
          'User-Agent': 'ZiCount/1.0',
          ...(process.env.OCR_API_KEY ? { 'X-API-KEY': process.env.OCR_API_KEY } : {}),
        },
        body: formData,
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      console.error('Error contacting Flask OCR server:', fetchErr);
      return res.status(502).json({ error: 'Cannot reach OCR server', message: String(fetchErr) });
    } finally {
      // Clean up uploaded file
      try {
        fs.unlinkSync(file.filepath);
      } catch (err) {
        console.warn('Failed to cleanup temp file:', err.message);
      }
    }
    clearTimeout(timeout);

    const respText = await forwardRes.text();
    const contentType = forwardRes.headers.get('content-type') || '';

    if (!forwardRes.ok) {
      return res.status(502).json({
        error: 'Flask OCR server failed',
        status: forwardRes.status,
        body: respText,
      });
    }

    // Parse Flask response
    if (contentType.includes('application/json')) {
      try {
        const flaskJson = JSON.parse(respText) || {};
        
        // Handle Flask response format - could be direct JSON or nested in 'result'
        let ocrData = flaskJson;
        if (flaskJson.result) {
          // If Flask returns { result: "JSON_STRING" }, parse the nested JSON
          try {
            ocrData = JSON.parse(flaskJson.result);
          } catch (e) {
            // If result is not JSON, treat it as raw text
            ocrData = { text: flaskJson.result };
          }
        }

        // Transform scanner.py output to frontend format
        const transformed = {
          success: true,
          text: ocrData.text || '',
          total: calculateTotal(ocrData.items || []),
          items: (ocrData.items || []).map((item, idx) => ({
            id: `r_${Date.now()}_${idx}`,
            name: item.name || `Item ${idx + 1}`,
            price: typeof item.price === 'object' ? item.price.value : (item.price || 0),
            quantity: item.quantity || 1,
            confidence: item.confidence || 0.8,
            vatTag: typeof item.price === 'object' ? item.price.vatTag : 'B',
          })),
          vendor: ocrData.vendor || 'Unknown Store',
          date: ocrData.date || new Date().toISOString().split('T')[0],
          itemCount: ocrData.itemCount || (ocrData.items?.length || 0),
          debug: { 
            ocrEngine: 'paddleocr-flask',
            remoteUrl,
            tokenCount: ocrData.meta?.tokenCount || 0
          },
        };

        return res.status(200).json(transformed);
      } catch (parseErr) {
        console.warn('Failed to parse Flask JSON, returning raw text:', parseErr);
        return res.status(200).json({ success: true, text: respText });
      }
    }

    // Non-JSON response
    return res.status(200).json({ success: true, text: respText });

  } catch (err) {
    console.error('Analyze handler error:', err);
    return res.status(500).json({ error: 'Analyze handler error', message: String(err) });
  }
}

/**
 * Calculate total from items array
 */
function calculateTotal(items) {
  if (!Array.isArray(items)) return '0.00';
  
  const total = items.reduce((sum, item) => {
    const price = typeof item.price === 'object' ? item.price.value : (item.price || 0);
    const quantity = item.quantity || 1;
    return sum + (price * quantity);
  }, 0);
  
  return total.toFixed(2);
}
