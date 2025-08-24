import { promises as fs } from 'fs';
import formidable from 'formidable';
import fetch from 'node-fetch';
import FormData from 'form-data';

export const config = {
  api: {
    bodyParser: false, // we handle multipart ourselves
  },
};

// Parse FormData
function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: 20 * 1024 * 1024, // 20MB limit
      keepExtensions: true,
    });

    form.parse(req, (err, fields, files) => {
      if (err) reject(err);
      else resolve({ fields, files });
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // 1) Parse FormData to get the uploaded file
    const { files } = await parseFormData(req);
    const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file uploaded', debug: { files } });
    }

    const filePath = uploadedFile.filepath || uploadedFile.path;
    if (!filePath) {
      return res.status(400).json({ error: 'Uploaded file missing path', debug: { uploadedFile } });
    }

    const buffer = await fs.readFile(filePath);
    const originalName = req.headers['x-file-name'] || uploadedFile.originalFilename || uploadedFile.name || 'upload.jpg';

  // Use stem for result file check, always append _items.json
  const stem = originalName.replace(/\.[^/.]+$/, "");
  const flaskUrl = process.env.OCR_REMOTE_URL;
  const resultFileName = `${stem}_items.json`;
  const getUrl = `${flaskUrl}?filename=${encodeURIComponent(resultFileName)}`;
  console.log(`[OCR] Checking for result file:`, resultFileName, 'GET URL:', getUrl);
  const getResponse = await fetch(getUrl, { method: 'GET' });
  console.log(`[OCR] GET response status:`, getResponse.status, 'Content-Type:', getResponse.headers.get('content-type'));

    if (getResponse.ok && getResponse.headers.get('content-type')?.includes('application/json')) {
      // Stream the result file directly to client
      console.log(`[OCR] Found cached result, streaming to client.`);
      res.status(getResponse.status);
      getResponse.body.pipe(res);
      return;
    }

    // If not found, upload and run OCR
    console.log(`[OCR] Result not found, uploading image for OCR.`);
    const formData = new FormData();
    formData.append('file', buffer, originalName);

    const postResponse = await fetch(flaskUrl, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders(),
    });
    console.log(`[OCR] POST response status:`, postResponse.status, 'Content-Type:', postResponse.headers.get('content-type'));

    res.status(postResponse.status);
    postResponse.body.pipe(res);

  } catch (err) {
    console.error('Flask OCR failed:', err);
    return res.status(500).json({ error: 'Flask OCR failed', message: err.message });
  }
}
