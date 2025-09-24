import { promises as fs } from 'fs';
import formidable from 'formidable';
import path from 'path';
import { connectToDatabase } from '@/lib/db/mongodb';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Parse FormData (same as analyze.js)
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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse uploaded file
    const { files } = await parseFormData(req);
    const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
    
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = uploadedFile.filepath || uploadedFile.path;
    const buffer = await fs.readFile(filePath);
    
    // Convert to base64 for database storage
    const base64Data = buffer.toString('base64');
    const mimeType = uploadedFile.mimetype || 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${base64Data}`;
    
    // Store in database
    const { db } = await connectToDatabase();
    const imageDoc = {
      filename: uploadedFile.originalFilename || uploadedFile.name || 'upload.jpg',
      mimeType: mimeType,
      data: base64Data,
      dataUrl: dataUrl,
      size: buffer.length,
      uploadedAt: new Date()
    };
    
    const result = await db.collection('images').insertOne(imageDoc);
    
    // Clean up temporary file
    try {
      await fs.unlink(filePath);
    } catch (e) {
      // Ignore cleanup errors
    }
    
    // Return the data URL for immediate use
    res.status(200).json({ 
      url: dataUrl,
      id: result.insertedId.toString()
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
}