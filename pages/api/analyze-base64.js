/**
 * Receipt Analysis API Endpoint - Base64 Version
 * 
 * This endpoint accepts base64 image data directly instead of FormData
 * to bypass Vercel's 4.5MB body size limit for multipart uploads.
 * The base64 approach uses JSON which compresses better.
 */

import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import { checkMethod, errorResponse } from '@/lib/utils/apiHelpers';

// Configure for JSON payloads instead of multipart
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb', // Allow larger JSON payloads
    },
  },
};

export default async function handler(req, res) {
  if (!checkMethod(req, res, 'POST')) return;

  try {
    // Validate required environment variables
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      return res.status(500).json({ error: 'Missing Google Cloud credentials' });
    }
    if (!process.env.DOC_AI_PROJECT_ID || !process.env.DOC_AI_PROCESSOR_ID) {
      return res.status(500).json({ error: 'Missing DOC_AI_PROJECT_ID or DOC_AI_PROCESSOR_ID' });
    }

    const { imageData, mimeType, filename } = req.body;
    
    if (!imageData) {
      return res.status(400).json({ error: 'No image data provided' });
    }

    console.log(`Processing image: ${filename}, MIME: ${mimeType}`);
    
    // Convert base64 to buffer for size checking
    const buffer = Buffer.from(imageData, 'base64');
    
    // Check if image exceeds Google's 20MB limit
    const maxSize = 20 * 1024 * 1024;
    if (buffer.length > maxSize) {
      return res.status(400).json({ 
        error: `Image too large (${Math.round(buffer.length / 1024 / 1024)}MB). Maximum size is 20MB.` 
      });
    }

    console.log(`Image size: ${Math.round(buffer.length / 1024)}KB - processing with Document AI`);

    // Initialize Google Cloud Document AI client
    let client;
    
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      const serviceAccountKey = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
      client = new DocumentProcessorServiceClient({
        credentials: serviceAccountKey,
        projectId: serviceAccountKey.project_id
      });
    } else {
      client = new DocumentProcessorServiceClient();
    }
    
    // Build processor resource name
    const location = process.env.DOC_AI_LOCATION || 'us';
    const processorName = `projects/${process.env.DOC_AI_PROJECT_ID}/locations/${location}/processors/${process.env.DOC_AI_PROCESSOR_ID}`;
    
    // Prepare request for Document AI processing
    const request = {
      name: processorName,
      rawDocument: {
        content: imageData, // Use base64 data directly
        mimeType: mimeType || 'image/jpeg',
      },
    };

    // Send document to Google Cloud Document AI for processing
    const [result] = await client.processDocument(request);
    
    if (!result?.document) {
      return res.status(200).json({
        items: [],
        totalAmount: 0,
        currency: 'EUR'
      });
    }

    // Process the Document AI response (same logic as original analyze.js)
    const document = result.document;
    const items = [];
    const discounts = [];
    let totalAmount = 0;

    if (document.entities) {
      const itemsWithPositions = [];
      const pricesWithPositions = [];
      const discountTitles = [];
      const discountAmounts = [];
      
      for (const entity of document.entities) {
        const position = entity.pageAnchor?.pageRefs?.[0]?.boundingPoly?.normalizedVertices?.[0]?.y || 0;
        
        if (entity.type === 'items') {
          const itemName = entity.mentionText?.trim() || '';
          const correctedName = itemName
            .replace(/(\d+[,\.]\d+)1(\s|$)/g, '$1l$2')
            .replace(/\b11(\s|$)/g, '1l$1')
          
          itemsWithPositions.push({
            name: correctedName,
            position: position
          });
        } else if (entity.type === 'prices') {
          const price = entity.normalizedValue?.moneyValue
            ? parseFloat(entity.normalizedValue.moneyValue.units || 0) + 
              parseFloat(entity.normalizedValue.moneyValue.nanos || 0) / 1000000000
            : parseFloat(entity.mentionText?.replace(',', '.')) || 0;
          
          pricesWithPositions.push({
            price: price,
            position: position
          });
        } else if (entity.type === 'discount_title') {
          discountTitles.push(entity.mentionText?.trim() || 'Rabatt');
        } else if (entity.type === 'discount_amount') {
          const discountAmount = entity.normalizedValue?.moneyValue
            ? parseFloat(entity.normalizedValue.moneyValue.units || 0) + 
              parseFloat(entity.normalizedValue.moneyValue.nanos || 0) / 1000000000
            : parseFloat(entity.mentionText?.replace(',', '.')) || 0;
          discountAmounts.push(Math.abs(discountAmount));
        } else if (entity.type === 'sum') {
          if (entity.normalizedValue?.moneyValue) {
            totalAmount = parseFloat(entity.normalizedValue.moneyValue.units || 0) + 
              parseFloat(entity.normalizedValue.moneyValue.nanos || 0) / 1000000000;
          } else if (entity.mentionText) {
            const cleanedSumText = entity.mentionText.replace(/[^\d,.-]/g, '').replace(',', '.');
            totalAmount = parseFloat(cleanedSumText) || 0;
          }
        }
      }
      
      // Sort by position to match items with prices
      itemsWithPositions.sort((a, b) => a.position - b.position);
      pricesWithPositions.sort((a, b) => a.position - b.position);
      
      const usedPrices = new Set();
      
      // Match items with prices using proximity
      for (const itemData of itemsWithPositions) {
        let closestPrice = null;
        let closestDistance = Infinity;
        let closestIndex = -1;
        
        for (let i = 0; i < pricesWithPositions.length; i++) {
          if (usedPrices.has(i)) continue;
          
          const priceData = pricesWithPositions[i];
          const distance = Math.abs(itemData.position - priceData.position);
          
          if (distance < closestDistance) {
            closestDistance = distance;
            closestPrice = priceData;
            closestIndex = i;
          }
        }
        
        if (closestPrice && closestDistance < 0.1) {
          usedPrices.add(closestIndex);
          
          const name = itemData.name;
          const price = closestPrice.price;
          
          if (name && price !== undefined) {
            if (price < 0) {
              discounts.push({
                id: `discount_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: name,
                amount: Math.abs(price),
                type: 'discount'
              });
            } else if (price > 0) {
              items.push({
                id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                name: name,
                price: price,
                claimed: false,
                tags: ['detected']
              });
            }
          }
        }
      }
      
      // Handle remaining unused prices
      for (let i = 0; i < pricesWithPositions.length; i++) {
        if (usedPrices.has(i)) continue;
        
        const priceData = pricesWithPositions[i];
        
        if (priceData.price < 0) {
          discounts.push({
            id: `discount_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: 'Rabatt',
            amount: Math.abs(priceData.price),
            type: 'discount'
          });
        } else if (priceData.price > 0) {
          items.push({
            id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: 'Nicht erkannter Artikel',
            price: priceData.price,
            claimed: false,
            tags: ['detected', 'unrecognized']
          });
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
    
    console.log(`Analysis complete: ${items.length} items, total: ${totalAmount}`);
    
    return res.status(200).json({
      items: items,
      discounts: discounts,
      totalAmount: totalAmount,
      currency: 'EUR'
    });

  } catch (error) {
    console.error('Document processing failed:', error);
    errorResponse(res, error, 'Document processing failed');
  }
}