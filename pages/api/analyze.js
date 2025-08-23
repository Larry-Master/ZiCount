// pages/api/analyze.js

// Disable Next.js body parsing; we handle raw body manually
export const config = {
  api: {
    bodyParser: false,
  },
};

/**
 * Helper: read raw request body
 */
async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/**
 * API Route: POST /api/analyze
 * Accepts file upload (raw bytes) and forwards to remote OCR server as base64 JSON.
 * Works with or without OCR_API_KEY.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Read raw request body
    const rawBody = await getRawBody(req);

    if (!rawBody || rawBody.length === 0) {
      return res.status(400).json({ error: 'Empty request body' });
    }

    const remoteUrl = process.env.OCR_REMOTE_URL;
    if (!remoteUrl) {
      return res.status(500).json({ error: 'OCR_REMOTE_URL not configured' });
    }

    console.log('Forwarding to OCR_REMOTE_URL:', remoteUrl, 'bytes:', rawBody.length);

    // Convert uploaded file to base64
    const imageBase64 = rawBody.toString('base64');
    const payload = { imageBase64 };

    // Send to remote OCR server
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000); // 2 min timeout

    let forwardRes;
    try {
      forwardRes = await fetch(remoteUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'ZiCount/1.0',
          ...(process.env.OCR_API_KEY ? { 'X-API-KEY': process.env.OCR_API_KEY } : {}),
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } catch (fetchErr) {
      clearTimeout(timeout);
      console.error('Error contacting OCR_REMOTE_URL:', fetchErr);
      return res.status(502).json({ error: 'Cannot reach OCR server', message: String(fetchErr) });
    }
    clearTimeout(timeout);

    const respText = await forwardRes.text();
    const contentType = forwardRes.headers.get('content-type') || '';

    if (!forwardRes.ok) {
      return res.status(502).json({
        error: 'Remote OCR failed',
        status: forwardRes.status,
        body: respText,
      });
    }

    // Parse JSON response
    if (contentType.includes('application/json')) {
      try {
        const remoteJson = JSON.parse(respText) || {};

        const transformed = {
          success: true,
          text: remoteJson.text || remoteJson.ocrText || '',
          total: remoteJson.total != null
            ? String(remoteJson.total)
            : remoteJson.total_text || '0.00',
          items: (remoteJson.items || []).map((item, idx) => ({
            id: item.id || `r_${Date.now()}_${idx}`,
            name: item.name || item.description || `Item ${idx + 1}`,
            price: typeof item.price === 'object' ? item.price.value : (item.price || 0),
            quantity: item.quantity || 1,
            confidence: item.confidence || 0.8,
          })),
          vendor: remoteJson.vendor || 'Unknown Store',
          date: remoteJson.date || new Date().toISOString().split('T')[0],
          itemCount: remoteJson.itemCount || (remoteJson.items?.length || 0),
          debug: { ocrEngine: 'remote', remoteUrl },
        };

        return res.status(200).json(transformed);
      } catch (parseErr) {
        console.warn('Failed to parse OCR JSON, returning raw text:', parseErr);
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
