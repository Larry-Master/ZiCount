/**
 * Netlify Function: Image Upload
 */

const { MongoClient } = require('mongodb');
const multipart = require('parse-multipart-data');

exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Parse multipart form data
    const boundary = event.headers['content-type']?.split('boundary=')[1];
    if (!boundary) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No boundary found in content-type' }),
      };
    }

    const parts = multipart.parse(Buffer.from(event.body, 'base64'), boundary);
    const filePart = parts.find(part => part.name === 'file');
    
    if (!filePart) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'No file uploaded' }),
      };
    }

    const buffer = filePart.data;
    const filename = filePart.filename || 'upload.jpg';
    const mimeType = filePart.type || 'image/jpeg';
    
    // Check MongoDB size limits
    const base64Size = Math.ceil(buffer.length * 1.33);
    const maxMongoSize = 12 * 1024 * 1024; // 12MB
    
    if (base64Size > maxMongoSize) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: `Image too large for database storage (${Math.round(base64Size / 1024 / 1024)}MB when encoded). Maximum size is ~12MB.` 
        }),
      };
    }
    
    // Convert to base64
    const base64Data = buffer.toString('base64');
    const dataUrl = `data:${mimeType};base64,${base64Data}`;
    
    // Connect to MongoDB
    const client = new MongoClient(process.env.MONGODB_URI);
    await client.connect();
    const db = client.db();
    
    const imageDoc = {
      filename: filename,
      mimeType: mimeType,
      data: base64Data,
      dataUrl: dataUrl,
      size: buffer.length,
      uploadedAt: new Date()
    };
    
    const result = await db.collection('images').insertOne(imageDoc);
    await client.close();
    
    return {
      statusCode: 200,
      body: JSON.stringify({ 
        url: dataUrl,
        id: result.insertedId.toString()
      }),
    };

  } catch (error) {
    console.error('Upload failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Upload failed' }),
    };
  }
};