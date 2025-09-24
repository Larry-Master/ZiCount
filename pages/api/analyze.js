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
    // Environment validation - support both file path and JSON string
    const hasCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    if (!hasCredentials) {
      return res.status(500).json({ error: 'Missing GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS_JSON' });
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

    // Initialize Document AI client with proper credential handling
    let client;
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      // Production: use JSON credentials
      const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
      client = new DocumentProcessorServiceClient({ credentials });
    } else {
      // Local development: use file path
      client = new DocumentProcessorServiceClient();
    }
    
    const location = process.env.DOC_AI_LOCATION || 'us';
    const processorName = `projects/${process.env.DOC_AI_PROJECT_ID}/locations/${location}/processors/${process.env.DOC_AI_PROCESSOR_ID}`;
    
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
    const discounts = [];
    let totalAmount = 0;

    // Extract data directly from Document AI entities
    if (document.entities) {
      const itemsWithPositions = [];
      const pricesWithPositions = [];
      const discountTitles = [];
      const discountAmounts = [];
      
      // Collect all entities with their positions
      for (const entity of document.entities) {
        const position = entity.pageAnchor?.pageRefs?.[0]?.boundingPoly?.normalizedVertices?.[0]?.y || 0;
        
        if (entity.type === 'items') {
          const itemName = entity.mentionText?.trim() || '';
          // Fix common OCR error: "0,331" should be "0,33l" (liter) and "11" should be "1l"
          const correctedName = itemName
            .replace(/(\d+[,\.]\d+)1(\s|$)/g, '$1l$2')  // 0,331 -> 0,33l
            .replace(/\b11(\s|$)/g, '1l$1')             // 11 -> 1l (OCR often reads "1l" as "11")
                      // standalone 1 -> 1l
          
          itemsWithPositions.push({
            name: correctedName,
            position: position
          });
        } else if (entity.type === 'prices') {
          let price = 0;
          if (entity.normalizedValue?.moneyValue) {
            const units = parseFloat(entity.normalizedValue.moneyValue.units || 0);
            const nanos = parseFloat(entity.normalizedValue.moneyValue.nanos || 0) / 1000000000;
            price = units + nanos;
          } else {
            const priceText = entity.mentionText?.replace(',', '.');
            price = parseFloat(priceText) || 0;
          }
          
          pricesWithPositions.push({
            price: price,
            position: position
          });
        } else if (entity.type === 'discount_title') {
          discountTitles.push(entity.mentionText?.trim() || 'Rabatt');
        } else if (entity.type === 'discount_amount') {
          let discountAmount = 0;
          if (entity.normalizedValue?.moneyValue) {
            const units = parseFloat(entity.normalizedValue.moneyValue.units || 0);
            const nanos = parseFloat(entity.normalizedValue.moneyValue.nanos || 0) / 1000000000;
            discountAmount = units + nanos;
          } else {
            const discountText = entity.mentionText?.replace(',', '.');
            discountAmount = parseFloat(discountText) || 0;
          }
          discountAmounts.push(Math.abs(discountAmount));
        } else if (entity.type === 'sum') {
          if (entity.normalizedValue?.moneyValue) {
            const units = parseFloat(entity.normalizedValue.moneyValue.units || 0);
            const nanos = parseFloat(entity.normalizedValue.moneyValue.nanos || 0) / 1000000000;
            totalAmount = units + nanos;
          } else {
            const sumText = entity.mentionText?.replace(',', '.');
            totalAmount = parseFloat(sumText) || 0;
          }
        }
      }
      
      // Sort by position to match items with their corresponding prices
      itemsWithPositions.sort((a, b) => a.position - b.position);
      pricesWithPositions.sort((a, b) => a.position - b.position);
      
      // Smart filtering: merge items that are very close together (split item names)
      const mergedItems = [];
      for (let i = 0; i < itemsWithPositions.length; i++) {
        const currentItem = itemsWithPositions[i];
        const nextItem = itemsWithPositions[i + 1];
        
        if (nextItem && Math.abs(currentItem.position - nextItem.position) < 0.005) {
          // Items are very close, likely split parts of the same item
          const mergedName = `${nextItem.name} ${currentItem.name}`;
          
          mergedItems.push({
            name: mergedName,
            position: currentItem.position // Use first item's position
          });
          
          i++; // Skip the next item since we merged it
        } else {
          mergedItems.push(currentItem);
        }
      }
      
      // Match items with prices by array position (first item with first price, etc.)
      const maxItems = Math.max(mergedItems.length, pricesWithPositions.length);
      
      for (let i = 0; i < maxItems; i++) {
        const itemData = mergedItems[i];
        const priceData = pricesWithPositions[i];
        
        if (itemData && priceData) {
          const name = itemData.name;
          const price = priceData.price;
          
          if (name && price !== undefined) {
            // Edge case: if item name is present but price is negative, it's a discount
            if (price < 0) {
              discounts.push({
                id: `discount_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: name,
                amount: Math.abs(price),
                type: 'discount'
              });
            } else if (price > 0) {
              // Regular item
              items.push({
                id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: name,
                price: price,
                claimed: false,
                tags: ['detected']
              });
            }
          }
        } else if (itemData && !priceData) {
          // Item without price - could be a header or description
        } else if (!itemData && priceData) {
          // Price without item - might be discounts or additional fees
          if (priceData.price < 0) {
            discounts.push({
              id: `discount_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              name: 'Rabatt',
              amount: Math.abs(priceData.price),
              type: 'discount'
            });
          }
        }
      }

      // Process explicit discount entities
      const maxDiscountLength = Math.max(discountTitles.length, discountAmounts.length);
      for (let i = 0; i < maxDiscountLength; i++) {
        const title = discountTitles[i] || 'Rabatt';
        const amount = discountAmounts[i];
        
        if (amount > 0) {
          discounts.push({
            id: `discount_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: title,
            amount: amount,
            type: 'discount'
          });
        }
      }
    }
    return res.status(200).json({
      items: items,
      discounts: discounts,
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
