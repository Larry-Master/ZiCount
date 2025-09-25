/**
 * Netlify Function: Receipt Analysis
 */

const { DocumentProcessorServiceClient } = require('@google-cloud/documentai');
const multipart = require('parse-multipart-data');

exports.handler = async (event, context) => {
  // Only handle POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  try {
    // Validate environment variables
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Missing Google Cloud credentials' }),
      };
    }
    if (!process.env.DOC_AI_PROJECT_ID || !process.env.DOC_AI_PROCESSOR_ID) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Missing DOC_AI_PROJECT_ID or DOC_AI_PROCESSOR_ID' }),
      };
    }

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
    
    // Determine MIME type
    const ext = filename.split('.').pop().toLowerCase();
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

    // Check file size (Google's 20MB limit)
    const maxSize = 20 * 1024 * 1024;
    if (buffer.length > maxSize) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: `Image too large (${Math.round(buffer.length / 1024 / 1024)}MB). Maximum size is 20MB.` 
        }),
      };
    }

    // Initialize Google Cloud Document AI client
    const serviceAccountKey = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    const client = new DocumentProcessorServiceClient({
      credentials: serviceAccountKey,
      projectId: serviceAccountKey.project_id
    });
    
    // Build processor resource name
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
      return {
        statusCode: 200,
        body: JSON.stringify({
          items: [],
          totalAmount: 0,
          currency: 'EUR'
        }),
      };
    }

    // Extract data from Document AI response (same logic as original)
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
            .replace(/\b11(\s|$)/g, '1l$1');
          
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
      
      // Sort by position and match items with prices
      itemsWithPositions.sort((a, b) => a.position - b.position);
      pricesWithPositions.sort((a, b) => a.position - b.position);
      
      const usedPrices = new Set();
      
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

    return {
      statusCode: 200,
      body: JSON.stringify({
        items: items,
        discounts: discounts,
        totalAmount: totalAmount,
        currency: 'EUR'
      }),
    };

  } catch (error) {
    console.error('Document processing failed:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Document processing failed' }),
    };
  }
};