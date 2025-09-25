import { promises as fs } from 'fs';
import path from 'path';
import { connectToDatabase } from '@/lib/db/mongodb';
import { parseFormData } from '@/lib/utils/formData';
import { checkMethod, errorResponse } from '@/lib/utils/apiHelpers';

export const config = {
  api: {
    bodyParser: false,
    // Allow reasonable sizes for image storage
    responseLimit: '20mb',
    sizeLimit: '20mb',
  },
};



export default async function handler(req, res) {
  if (!checkMethod(req, res, 'POST')) return;

  try {
    // Parse uploaded file
    const { files } = await parseFormData(req, { maxFileSize: 20 * 1024 * 1024 });
    const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
    
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = uploadedFile.filepath || uploadedFile.path;
    const buffer = await fs.readFile(filePath);
    
    // Check if the image will exceed MongoDB's 16MB document limit when base64 encoded
    // Base64 encoding increases size by ~33%, so we need to be conservative
    const base64Size = Math.ceil(buffer.length * 1.33);
    const maxMongoSize = 12 * 1024 * 1024; // 12MB to leave room for other document data
    
    if (base64Size > maxMongoSize) {
      return res.status(400).json({ 
        error: `Image too large for database storage (${Math.round(base64Size / 1024 / 1024)}MB when encoded). Maximum size is ~12MB. Please compress the image before uploading.` 
      });
    }
    
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
    errorResponse(res, error, 'Upload failed');
  }
}