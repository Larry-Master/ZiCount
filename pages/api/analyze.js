// pages/api/analyze.js
// Single clean forwarder for OCR: accept raw multipart body and proxy it to OCR_REMOTE_URL.
// Constraints: no multer, no extra npm packages. Keep file small and robust.

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const remoteUrl = process.env.OCR_REMOTE_URL;
  const contentType = req.headers['content-type'] || '';

  try {
    // Collect raw request body (we disabled bodyParser above)
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const bodyBuffer = Buffer.concat(chunks);

    if (!bodyBuffer || bodyBuffer.length === 0) {
      return res.status(400).json({ error: 'Empty request body' });
    }

    if (!remoteUrl) {
      return res.status(500).json({ error: 'OCR_REMOTE_URL not configured' });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    try {
      const forwardRes = await fetch(remoteUrl, {
        method: 'POST',
        headers: {
          ...(contentType ? { 'content-type': contentType } : {}),
          'user-agent': 'ZiCount/1.0',
        },
        body: bodyBuffer,
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const respText = await forwardRes.text();
      const respContentType = forwardRes.headers.get('content-type') || '';

      if (!forwardRes.ok) {
        return res.status(502).json({ error: 'Remote OCR failed', status: forwardRes.status, body: respText });
      }

      if (respContentType.includes('application/json')) {
        try {
          const remoteJson = JSON.parse(respText);
          const ocr = remoteJson || {};
          const transformed = {
            success: true,
            text: ocr.text || ocr.ocrText || '',
            total: ocr.total != null ? String(ocr.total) : (ocr.total_text || '0.00'),
            items: (ocr.items || []).map((item, idx) => ({
              id: item.id || `r_${Date.now()}_${idx}`,
              name: item.name || item.description || `Item ${idx + 1}`,
              price: typeof item.price === 'object' ? item.price.value : (item.price || 0),
              quantity: item.quantity || 1,
              confidence: item.confidence || 0.8,
            })),
            vendor: ocr.vendor || 'Unknown Store',
            date: ocr.date || new Date().toISOString().split('T')[0],
            itemCount: ocr.itemCount || (ocr.items?.length || 0),
            debug: { ocrEngine: 'remote', remoteUrl },
          };

          return res.status(200).json(transformed);
        } catch (parseErr) {
          return res.status(200).json({ success: true, text: respText });
        }
      }

      // Non-JSON but OK response — return as text payload
      return res.status(200).json({ success: true, text: respText });
    } catch (err) {
      clearTimeout(timeout);
      return res.status(502).json({ error: 'Error contacting OCR_REMOTE_URL', message: String(err) });
    }
  } catch (err) {
    console.error('Analyze handler error:', String(err));
    return res.status(500).json({ error: 'Analyze handler error', message: String(err) });
  }
}
