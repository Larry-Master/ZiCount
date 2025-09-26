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

import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import { Storage } from '@google-cloud/storage';
import { checkMethod, errorResponse } from '@/lib/utils/apiHelpers';

// Disable Next.js default body parser to handle JSON
export const config = {
  api: {
    bodyParser: true,  // Enable for JSON
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
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      return res.status(500).json({ error: 'Missing Google Cloud credentials. Please set either GOOGLE_APPLICATION_CREDENTIALS or GOOGLE_APPLICATION_CREDENTIALS_JSON' });
    }
    if (!process.env.DOC_AI_PROJECT_ID || !process.env.DOC_AI_PROCESSOR_ID) {
      return res.status(500).json({ error: 'Missing DOC_AI_PROJECT_ID or DOC_AI_PROCESSOR_ID' });
    }

    // Expect gcsUrl in request body instead of file
    const { gcsUrl } = req.body;
    if (!gcsUrl) {
      return res.status(400).json({ error: 'No GCS URL provided' });
    }

    // Initialize Google Cloud Document AI client
    let client;
    
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      // For Vercel deployment - use service account key from environment variable
      const serviceAccountKey = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
      client = new DocumentProcessorServiceClient({
        credentials: serviceAccountKey,
        projectId: serviceAccountKey.project_id
      });
    } else {
      // For local development - use GOOGLE_APPLICATION_CREDENTIALS file path
      client = new DocumentProcessorServiceClient();
    }
    
    // Build processor resource name using environment variables
    const location = process.env.DOC_AI_LOCATION || 'us';
    const processorName = `projects/${process.env.DOC_AI_PROJECT_ID}/locations/${location}/processors/${process.env.DOC_AI_PROCESSOR_ID}`;
    
    // Prepare request for Document AI processing
    const request = {
      name: processorName,
      gcsDocument: {
        gcsUri: gcsUrl,
        mimeType: gcsUrl.includes('.png') ? 'image/png' : 'image/jpeg',
      },
    };

    // Send document to Google Cloud Document AI for processing
    // Wrap the call in a timeout so we can return a helpful 504 when the
    // external processing takes longer than our serverless function allows.
    const processPromise = client.processDocument(request);
    const TIMEOUT_MS = process.env.ANALYZE_TIMEOUT_MS ? parseInt(process.env.ANALYZE_TIMEOUT_MS, 10) : 45000; // 45s default

    const start = Date.now();
    let processResult;
    try {
      processResult = await Promise.race([
        processPromise,
        new Promise((_, reject) => setTimeout(() => reject(new Error('Document AI processing timed out')), TIMEOUT_MS))
      ]);
    } catch (err) {
      const duration = Date.now() - start;
      console.error(`Document AI call failed after ${duration}ms:`, err && err.message ? err.message : err);
      if (err && err.message && err.message.includes('timed out')) {
        // Likely a serverless function timeout / slow external processing
        return res.status(504).json({ error: 'Document AI processing timed out. This can happen with large or complex images on serverless platforms. Try reducing the image size (under ~4MB) or move processing to a service with a longer timeout.' });
      }
      throw err;
    }

    const [result] = processResult;

    // Log approximate size of the Document AI response for diagnostics
    try {
      const approxSize = JSON.stringify(result).length;
      console.info(`Document AI response size: ~${Math.round(approxSize / 1024)}KB`);
    } catch (sizeErr) {
      console.warn('Failed to measure Document AI response size:', sizeErr && sizeErr.message ? sizeErr.message : sizeErr);
    }
    
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
          if (entity.normalizedValue?.moneyValue) {
            totalAmount = parseFloat(entity.normalizedValue.moneyValue.units || 0) + 
              parseFloat(entity.normalizedValue.moneyValue.nanos || 0) / 1000000000;
          } else if (entity.mentionText) {
            // Clean the sum text by removing letters and keeping only numbers, commas, and dots
            const cleanedSumText = entity.mentionText.replace(/[^\d,.-]/g, '').replace(',', '.');
            totalAmount = parseFloat(cleanedSumText) || 0;
          }
        }
      }
      
      // Sort by position to match items with their corresponding prices
      itemsWithPositions.sort((a, b) => a.position - b.position);
      pricesWithPositions.sort((a, b) => a.position - b.position);
      
      // Use all items as detected by Document AI - no merging needed
      const mergedItems = itemsWithPositions;
      
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
    // Try to fetch the image bytes from GCS and delete the object to avoid
    // leaving large files in the bucket. This helps keep GCS as a temporary
    // staging location for Document AI processing only.
    let imageBase64 = null;
    let deletedFromGCS = false;
    try {
      // Parse gs://bucket/filename
      const match = (gcsUrl || '').match(/^gs:\/\/([^/]+)\/(.+)$/);
      if (match) {
        const bucketName = match[1];
        const filename = match[2];

        // Initialize Storage client with the same credential strategy as other endpoints
        let storage;
        if (process.env.NODE_ENV === 'development' && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
          storage = new Storage();
        } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
          const serviceAccountKey = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
          storage = new Storage({ credentials: serviceAccountKey, projectId: serviceAccountKey.project_id });
        } else {
          // If no credentials available, skip fetching/deleting but continue returning the analysis
          storage = null;
        }

        if (storage) {
          const bucket = storage.bucket(bucketName);
          const file = bucket.file(filename);
          // For performance and to avoid exceeding serverless response size
          // limits, do not download and embed the full image by default.
          // Optionally embed only small images when explicitly enabled.
          const EMBED_ENABLED = process.env.EMBED_IMAGE === 'true';
          const EMBED_MAX_BYTES = process.env.EMBED_IMAGE_MAX_BYTES ? parseInt(process.env.EMBED_IMAGE_MAX_BYTES, 10) : 2 * 1024 * 1024; // 2MB default

          try {
            // Fetch metadata first to decide whether to download for embedding
            const [meta] = await file.getMetadata();
            const size = parseInt(meta.size || '0', 10);

            if (EMBED_ENABLED && size > 0 && size <= EMBED_MAX_BYTES) {
              try {
                const [buffer] = await file.download();
                const mimeType = gcsUrl.includes('.png') ? 'image/png' : 'image/jpeg';
                imageBase64 = `data:${mimeType};base64,${buffer.toString('base64')}`;
              } catch (downloadErr) {
                console.warn('Failed to download GCS file for embedding:', downloadErr.message || downloadErr);
                imageBase64 = null;
              }
            } else {
              // Skip embedding large images to keep responses small
              imageBase64 = null;
              if (!EMBED_ENABLED && size > EMBED_MAX_BYTES) {
                console.info(`Skipping embedding large image (${Math.round(size / 1024)}KB). Set EMBED_IMAGE=true and EMBED_IMAGE_MAX_BYTES to override.`);
              }
            }
          } catch (metaErr) {
            console.warn('Failed to get metadata for GCS file:', metaErr && metaErr.message ? metaErr.message : metaErr);
          }

          try {
            await file.delete();
            deletedFromGCS = true;
          } catch (delErr) {
            console.warn('Failed to delete GCS file:', delErr.message || delErr);
            deletedFromGCS = false;
          }
        }
      }
    } catch (err) {
      console.warn('GCS post-processing failed:', err.message || err);
    }

    return res.status(200).json({
      items: items,
      discounts: discounts,
      totalAmount: totalAmount,
      currency: 'EUR',
      imageBase64,
      deletedFromGCS
    });

  } catch (error) {
    errorResponse(res, error, 'Document processing failed');
  }
}
