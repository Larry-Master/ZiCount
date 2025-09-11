import { promises as fs } from 'fs';
import formidable from 'formidable';
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Parse FormData
function parseFormData(req) {
  return new Promise((resolve, reject) => {
    const form = formidable({
      maxFileSize: 20 * 1024 * 1024,
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
    // Environment validation
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      return res.status(500).json({ error: 'Missing GOOGLE_APPLICATION_CREDENTIALS' });
    }
    if (!process.env.DOC_AI_PROJECT_ID || !process.env.DOC_AI_PROCESSOR_ID) {
      return res.status(500).json({ error: 'Missing DOC_AI_PROJECT_ID or DOC_AI_PROCESSOR_ID' });
    }

    // Parse uploaded file
    const { files } = await parseFormData(req);
    const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
    
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = uploadedFile.filepath || uploadedFile.path;
    const buffer = await fs.readFile(filePath);
    const originalName = uploadedFile.originalFilename || uploadedFile.name || 'upload.jpg';

    // Detect MIME type
    const ext = originalName.split('.').pop().toLowerCase();
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

    // Initialize Document AI client
    const client = new DocumentProcessorServiceClient();
    const location = process.env.DOC_AI_LOCATION || 'us';
    const processorName = `projects/${process.env.DOC_AI_PROJECT_ID}/locations/${location}/processors/${process.env.DOC_AI_PROCESSOR_ID}`;

    console.log('Processing document with Google Document AI...');
    
    // Process document with Document AI
    const request = {
      name: processorName,
      rawDocument: {
        content: buffer.toString('base64'),
        mimeType: mimeType,
      },
    };

    const [result] = await client.processDocument(request);
    
    if (!result?.document) {
      return res.status(200).json({
        items: [],
        totalAmount: 0,
        currency: 'EUR'
      });
    }

    const document = result.document;
    const items = [];
    let totalAmount = 0;

    // Extract data using your custom processor structure
    if (document.entities) {
      const itemNames = [];
      const itemPrices = [];
      
      // Collect all items and prices
      for (const entity of document.entities) {
        if (entity.type === 'items') {
          itemNames.push(entity.mentionText?.trim() || '');
        } else if (entity.type === 'prices') {
          let price = 0;
          if (entity.normalizedValue?.moneyValue) {
            const units = parseFloat(entity.normalizedValue.moneyValue.units || 0);
            const nanos = parseFloat(entity.normalizedValue.moneyValue.nanos || 0) / 1000000000;
            price = units + nanos;
          } else {
            // Fallback to parsing the mention text
            const priceText = entity.mentionText?.replace(',', '.');
            price = parseFloat(priceText) || 0;
          }
          itemPrices.push(price);
        } else if (entity.type === 'sum') {
          if (entity.normalizedValue?.moneyValue) {
            const units = parseFloat(entity.normalizedValue.moneyValue.units || 0);
            const nanos = parseFloat(entity.normalizedValue.moneyValue.nanos || 0) / 1000000000;
            totalAmount = units + nanos;
          } else {
            // Fallback to parsing the mention text
            const sumText = entity.mentionText?.replace(',', '.');
            totalAmount = parseFloat(sumText) || 0;
          }
        }
      }
      
      // Match items with prices 1:1
      const maxLength = Math.max(itemNames.length, itemPrices.length);
      for (let i = 0; i < maxLength; i++) {
        const name = itemNames[i];
        const price = itemPrices[i];
        
        if (name && price > 0) {
          items.push({
            id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: name,
            price: price,
            claimed: false
          });
        }
      }
    }

    // If no total was found, calculate from items
    if (totalAmount === 0 && items.length > 0) {
      totalAmount = items.reduce((sum, item) => sum + item.price, 0);
    }

    console.log(`Processing complete: ${items.length} items extracted, total: €${totalAmount.toFixed(2)}`);

    return res.status(200).json({
      items: items,
      totalAmount: totalAmount,
      currency: 'EUR'
    });

  } catch (error) {
    console.error('Document AI processing error:', error);
    return res.status(500).json({
      error: 'Document processing failed',
      message: error.message
    });
  }
}
