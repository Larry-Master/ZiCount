import { promises as fs } from 'fs';
import crypto from 'crypto';
import formidable from 'formidable';

export const config = {
  api: {
    bodyParser: false, // we handle multipart ourselves
  },
};


// Parse FormData
function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: 10 * 1024 * 1024, // 10MB limit
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
    console.log('Formidable files:', files);
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
    // 2) Send file to Flask OCR API
    const flaskUrl = process.env.OCR_REMOTE_URL;
    const FormData = require('form-data');
    const formData = new FormData();
    formData.append('file', buffer, originalName);

    const fetch = (await import('node-fetch')).default;
    const flaskResponse = await fetch(flaskUrl, {
      method: 'POST',
      body: formData,
      headers: formData.getHeaders(),
    });
    const flaskResult = await flaskResponse.json();

    if (!flaskResponse.ok) {
      return res.status(500).json({ error: flaskResult.error || 'Flask OCR failed', message: flaskResult.error });
    }

    // 3) Return result from Flask
    return res.status(200).json(flaskResult);
  } catch (err) {
    console.error('Flask OCR failed:', err);
    return res.status(500).json({ error: 'Flask OCR failed', message: err.message });
  }
}
