/**
 * Receipt Analysis API Endpoint
 * 
 * This API endpoint processes uploaded receipt images using Google Cloud Document AI
 * to extract items, prices, discounts, and total amounts. It uses optical character
 * recognition (OCR) and natural language processing to parse receipt data.
 * 
 * Features:
 * - Processes JPEG and PNG receipt images
 * - Extracts individual items with prices
 * - Identifies discounts and promotional offers
 * - Calculates total amounts
 * - Handles common OCR errors (e.g., "11" -> "1l" for liter measurements)
 */

import { promises as fs } from 'fs';
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import { parseFormData } from '@/lib/utils/formData';
import { checkMethod, errorResponse } from '@/lib/utils/apiHelpers';

// Disable Next.js default body parser to handle file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};



/**
 * Main API handler for receipt analysis
 * Processes uploaded receipt images and extracts structured data
 */
export default async function handler(req, res) {
  // Only accept POST requests for file uploads
  if (!checkMethod(req, res, 'POST')) return;

  try {
    // Validate required environment variables for Google Cloud Document AI
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      return res.status(500).json({ error: 'Missing GOOGLE_APPLICATION_CREDENTIALS' });
    }
    if (!process.env.DOC_AI_PROJECT_ID || !process.env.DOC_AI_PROCESSOR_ID) {
      return res.status(500).json({ error: 'Missing DOC_AI_PROJECT_ID or DOC_AI_PROCESSOR_ID' });
    }

    // Parse the uploaded file from multipart form data
    const { files } = await parseFormData(req);
    const uploadedFile = Array.isArray(files.file) ? files.file[0] : files.file;
    
    if (!uploadedFile) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Read the uploaded file into memory
    const filePath = uploadedFile.filepath || uploadedFile.path;
    let buffer = await fs.readFile(filePath);
    const originalName = uploadedFile.originalFilename || uploadedFile.name || 'upload.jpg';

    // Determine MIME type based on file extension
    const ext = originalName.split('.').pop().toLowerCase();
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';

    // Check if image exceeds 20MB limit
    const maxSize = 20 * 1024 * 1024; // 20MB in bytes
    if (buffer.length > maxSize) {
      return res.status(400).json({ 
        error: `File too large (${Math.round(buffer.length / 1024 / 1024)}MB). Maximum size is 20MB. Please compress your image or use a smaller file.` 
      });
    }

    // Initialize Google Cloud Document AI client
    const client = new DocumentProcessorServiceClient();
    
    // Build processor resource name using environment variables
    const location = process.env.DOC_AI_LOCATION || 'us';
    const processorName = `projects/${process.env.DOC_AI_PROJECT_ID}/locations/${location}/processors/${process.env.DOC_AI_PROCESSOR_ID}`;
    
    // Prepare request for Document AI processing
    const request = {
      name: processorName,
      rawDocument: {
        content: buffer.toString('base64'), // Convert image to base64
        mimeType: mimeType,
      },
    };

    // Send document to Google Cloud Document AI for processing
    const [result] = await client.processDocument(request);
    
    // Handle case where no document was processed
    if (!result?.document) {
      return res.status(200).json({
        items: [],
        totalAmount: 0,
        currency: 'EUR'
      });
    }

    // Initialize data structures for extracted information
    const document = result.document;
    const items = [];           // Individual receipt items
    const discounts = [];       // Discounts and promotional offers
    let totalAmount = 0;        // Total receipt amount

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
          // Fix common OCR errors for volume measurements
          const correctedName = itemName
            .replace(/(\d+[,\.]\d+)1(\s|$)/g, '$1l$2')  // 0,331 -> 0,33l
            .replace(/\b11(\s|$)/g, '1l$1')             // 11 -> 1l
          
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
          // Only use sum from Document AI, never calculate fallback
          console.log('Sum entity found:', entity.mentionText, entity.normalizedValue?.moneyValue);
          if (entity.normalizedValue?.moneyValue) {
            totalAmount = parseFloat(entity.normalizedValue.moneyValue.units || 0) + 
              parseFloat(entity.normalizedValue.moneyValue.nanos || 0) / 1000000000;
            console.log('Sum from normalized value:', totalAmount);
          } else if (entity.mentionText) {
            // Clean the sum text by removing letters and keeping only numbers, commas, and dots
            const cleanedSumText = entity.mentionText.replace(/[^\d,.-]/g, '').replace(',', '.');
            totalAmount = parseFloat(cleanedSumText) || 0;
            console.log('Sum from cleaned mention text:', cleanedSumText, '->', totalAmount);
          }
        }
      }
      
      // Sort by position to match items with their corresponding prices
      itemsWithPositions.sort((a, b) => a.position - b.position);
      pricesWithPositions.sort((a, b) => a.position - b.position);
      
      // Use all items as detected by Document AI - no merging needed
      const mergedItems = itemsWithPositions;
      
      console.log('Items after processing:', mergedItems.map(item => item.name));
      console.log('Prices after processing:', pricesWithPositions.map(price => price.price));
      
      // Match items with prices using proximity-based matching
      const usedPrices = new Set();
      
      // First pass: match items with their closest prices
      for (const itemData of mergedItems) {
        let closestPrice = null;
        let closestDistance = Infinity;
        let closestIndex = -1;
        
        // Find the closest unused price to this item
        for (let i = 0; i < pricesWithPositions.length; i++) {
          if (usedPrices.has(i)) continue; // Skip already used prices
          
          const priceData = pricesWithPositions[i];
          const distance = Math.abs(itemData.position - priceData.position);
          
          if (distance < closestDistance) {
            closestDistance = distance;
            closestPrice = priceData;
            closestIndex = i;
          }
        }
        
        // If we found a reasonable match (not too far apart), use it
        if (closestPrice && closestDistance < 0.1) { // Reasonable proximity threshold
          usedPrices.add(closestIndex);
          
          const name = itemData.name;
          const price = closestPrice.price;
          
          console.log(`Matched item "${name}" with price ${price} (distance: ${closestDistance})`);
          
          if (name && price !== undefined) {
            // Edge case: if price is negative, it's a discount
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
        }
      }
      
      // Second pass: handle any remaining unused prices
      for (let i = 0; i < pricesWithPositions.length; i++) {
        if (usedPrices.has(i)) continue; // Skip already used prices
        
        const priceData = pricesWithPositions[i];
        
        if (priceData.price < 0) {
          // Unused negative price becomes a discount
          discounts.push({
            id: `discount_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: 'Rabatt',
            amount: Math.abs(priceData.price),
            type: 'discount'
          });
        } else if (priceData.price > 0) {
          // Unused positive price becomes an unrecognized item
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
    return res.status(200).json({
      items: items,
      discounts: discounts,
      totalAmount: totalAmount,
      currency: 'EUR'
    });

  } catch (error) {
    errorResponse(res, error, 'Document processing failed');
  }
}
