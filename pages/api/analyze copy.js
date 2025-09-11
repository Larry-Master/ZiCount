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

// Simple OCR text parsing for receipts - only items with prices
function parseReceiptText(text) {
  const items = [];
  let totalAmount = 0;

  const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);
  console.log(`Processing ${rawLines.length} lines from OCR`);

  // Heuristics: ignore store header until we see first price pattern
  const pricePattern = /(\d+[,\.]\d{2})\s*[A-Z]?$/;
  let startedItems = false;

  // Helper to decide if a line looks like an item candidate
  const isNonItemNoise = (line) => {
    return /^(eur|uid|www\.|markt:|kasse:|bon-nr|bed\.|sie haben|nr\.:|trace-nr|beleg-nr|datum:|uhrzeit:|kontaktlos|kartenzahlung)$/i.test(line) ||
           line.includes('UID') ||
           line.includes('@') ||
           /^\d+$/.test(line) ||
           /^[A-Z]= \d+\.\d+%$/.test(line) || // tax rate legend
           /^\*+$/.test(line);
  };

  // We'll keep a stack of potential item names (most recent at end)
  let candidateLines = []; // [{text, line, used:false}]
  // Price detected before item name (OCR sometimes swaps order). We hold it for one line.
  let deferredPrice = null; // { value:number }
  let splitQtyPending = null; // { qty:number }
  let lastItem = null;

  const pushCandidate = (line, idx) => {
    if (candidateLines.length && candidateLines[candidateLines.length - 1].text === line) return;
    candidateLines.push({ text: line, line: idx, used: false });
    console.log(`📝 Push candidate: ${line}`);
    if (candidateLines.length > 12) candidateLines.shift();
  };

  const claimNearestCandidate = (priceIndex) => {
    // search backwards for first unused candidate within window
    for (let i = candidateLines.length - 1; i >= 0; i--) {
      const c = candidateLines[i];
      if (!c.used && priceIndex - c.line <= 6) { // window of 6 lines
        c.used = true;
        console.log(`↘️  Using candidate: ${c.text}`);
        return c.text;
      }
    }
    return null;
  };

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    // Payment / footer section detection
    if (/\b(summe|total|geg\.|rückgeld|bar|karte|ec-cash|maestro|visa)\b/i.test(line)) {
      if (/\bsumme\b/i.test(line)) {
        const totalMatch = line.match(/(\d+[,\.]\d{2})/);
        if (totalMatch) {
          totalAmount = parseFloat(totalMatch[1].replace(',', '.'));
          console.log(`Found explicit total: €${totalAmount.toFixed(2)}`);
        }
      }
      console.log(`Stopping at footer trigger line: "${line}"`);
      break;
    }

    // Quantity multiplier single-line pattern (2 Stk x 0,79)
    const qtyMatch = line.match(/^(\d+)\s*(stk|x|st|stück)\s*x?\s*(\d+[,\.]\d{2})/i);
    if (qtyMatch) {
      const qty = parseInt(qtyMatch[1], 10);
      const unit = parseFloat(qtyMatch[3].replace(',', '.'));
      const total = parseFloat((qty * unit).toFixed(2));
      startedItems = true;
  const cand = claimNearestCandidate(i);
      if (cand) {
        items.push({
          id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: cand,
          price: total,
          claimed: false
        });
        lastItem = items[items.length - 1];
        console.log(`✅ Qty line inline -> '${cand}' = ${qty} * ${unit.toFixed(2)} = €${total.toFixed(2)}`);
      } else {
        console.log(`⚠️ Qty inline without candidate: ${line}`);
      }
      continue;
    }

    // Split quantity line (e.g., "2 Stk x" then next standalone price line is unit price)
    const splitQty = line.match(/^(\d+)\s*(stk|x|st|stück)\s*x?$/i);
    if (splitQty) {
      splitQtyPending = { qty: parseInt(splitQty[1], 10) };
      console.log(`⏳ Split quantity pending: ${splitQtyPending.qty}`);
      continue;
    }

    // Detect a price-only line (with optional tax letter)
  const priceWithTax = line.match(/^(\d+[,\.]\d{2})\s+([A-Z])$/);
  const priceOnly = !priceWithTax && line.match(/^(\d+[,\.]\d{2})$/);

  if (priceWithTax || priceOnly) {
      const priceVal = parseFloat((priceWithTax ? priceWithTax[1] : priceOnly[1]).replace(',', '.'));
      startedItems = true; // we are inside item section
      // EARLY: ignore unit price annotation tied to previous split quantity (before any deferral logic)
      if (splitQtyPending && lastItem && Math.abs(lastItem.price - splitQtyPending.qty * priceVal) < 0.011) {
        console.log(`ℹ️  Ignored unit price annotation ${priceVal.toFixed(2)} for previous qty ${splitQtyPending.qty}`);
        splitQtyPending = null;
        continue;
      }
  let cand = claimNearestCandidate(i);
      if (!cand) {
        // Lookahead: if next line is a plausible item name, defer pairing to avoid back-matching store info
        const next = rawLines[i + 1];
        if (next && !isNonItemNoise(next) && !/(^\d+[,\.]\d{2})/.test(next) && next.length > 1) {
          if (!pricePattern.test(next)) {
            deferredPrice = { value: priceVal };
            console.log(`⏸️  Deferred price €${priceVal.toFixed(2)} waiting for next line '${next}'`);
            continue; // process next line to bind
          }
        }
        // Backward fallback if not deferrable
        console.log(`⚠️ Orphan price €${priceVal.toFixed(2)} searching backwards`);
        for (let j = i - 1; j >= 0 && j >= i - 4 && !cand; j--) {
          const prev = rawLines[j];
          if (!isNonItemNoise(prev) && !pricePattern.test(prev) && prev.length > 1) {
            const already = items.some(it => it.name === prev && Math.abs(it.price - priceVal) < 0.001);
            if (!already) { cand = prev; break; }
          }
        }
      }
      splitQtyPending = null;
  if (cand) {
        const duplicate = items.some(it => it.name === cand && Math.abs(it.price - priceVal) < 0.001);
        if (!duplicate) {
          items.push({
            id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: cand,
            price: priceVal,
            claimed: false
          });
          lastItem = items[items.length - 1];
          console.log(`✅ Pair: ${cand} -> €${priceVal.toFixed(2)}`);
        } else {
          console.log(`🔁 Skipped duplicate item-price pair: ${cand} €${priceVal.toFixed(2)}`);
        }
      } else {
        console.log(`⚠️ Price without any candidate kept (ignored): ${priceVal.toFixed(2)}`);
      }
      continue;
    }

    // Same-line item + price + tax (rare in this OCR sample but keep support)
    const inlineMatch = line.match(/^(.+?)\s+(\d+[,\.]\d{2})\s+([A-Z])$/);
    if (inlineMatch) {
      const name = inlineMatch[1].trim();
      const priceVal = parseFloat(inlineMatch[2].replace(',', '.'));
      startedItems = true;
      if (name && priceVal > 0) {
        const duplicate = items.some(it => it.name === name && Math.abs(it.price - priceVal) < 0.001);
        if (!duplicate) {
          items.push({
            id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name,
            price: priceVal,
            claimed: false
          });
          console.log(`✅ Inline item: ${name} €${priceVal.toFixed(2)}`);
        } else {
          console.log(`🔁 Skip duplicate inline item ${name}`);
        }
      }
  // clear stack as we've consumed the line fully
  // mark all candidates used to avoid retroactive pairing (line consumed)
  candidateLines.forEach(c => { if (c.line === i) c.used = true; });
      continue;
    }

    // Potential item candidate
    if (!isNonItemNoise(line) && !pricePattern.test(line)) {
      // skip obvious store header tokens
      if (/^rewe$/i.test(line)) { console.log('Store name ignored'); continue; }
      // Ignore shop header lines before we start encountering prices
      if (!startedItems) {
        // Ignore if looks like address (ends with number) or contains postal code or company suffix
        if (/\d{5}/.test(line) || /strasse|straße|ohg|gmbh|platz|münchen/i.test(line) || /\d+$/.test(line)) {
          console.log(`Header/address ignored: ${line}`);
          continue;
        }
        // Ignore short all-caps tokens (likely city / branding) prior to items
        if (/^[A-ZÄÖÜ]{2,6}$/.test(line)) { console.log(`Short all-caps ignored pre-items: ${line}`); continue; }
      }
      if (deferredPrice) {
        const priceVal = deferredPrice.value;
        deferredPrice = null;
        const duplicate = items.some(it => it.name === line && Math.abs(it.price - priceVal) < 0.001);
        if (!duplicate) {
          items.push({
            id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: line,
            price: priceVal,
            claimed: false
          });
          console.log(`✅ Deferred pair: ${line} -> €${priceVal.toFixed(2)}`);
        } else {
          console.log(`🔁 Skip duplicate deferred pair ${line}`);
        }
      } else {
  pushCandidate(line, i);
      }
      continue;
    }
  }

  const dangling = candidateLines.filter(c => !c.used);
  if (dangling.length) {
    console.log(`Discard ${dangling.length} dangling candidate(s) without price.`);
  }

  if (totalAmount === 0 && items.length > 0) {
    totalAmount = items.reduce((s, it) => s + it.price, 0);
    console.log(`Computed total from items: €${totalAmount.toFixed(2)}`);
  }

  console.log(`Final result: ${items.length} items extracted (heuristic parser)`);
  return { items, totalAmount };
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

    console.log('Processing document with Document AI...');
    console.log('Processor:', processorName);
    
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
      console.log('No document returned from Document AI');
      return res.status(200).json({
        items: [],
        totalAmount: 0,
        currency: 'EUR'
      });
    }

    const document = result.document;
    console.log(`Document processed successfully`);
    console.log(`Entities found: ${(document.entities || []).length}`);
    console.log(`Text length: ${(document.text || '').length}`);

    let items = [];
    let totalAmount = 0;

    // Try structured data first (if entities exist)
    if (document.entities && document.entities.length > 0) {
      console.log('Processing structured entities...');
      
      // Process line items
      const lineItems = document.entities.filter(e => e.type === 'line_item');
      const totalEntities = document.entities.filter(e => e.type === 'total_amount');
      
      for (const entity of lineItems) {
        let name = '';
        let price = 0;
        
        if (entity.properties) {
          for (const prop of entity.properties) {
            if (prop.type === 'line_item/description') {
              name = prop.mentionText?.trim() || '';
            } else if (prop.type === 'line_item/amount' && prop.normalizedValue?.moneyValue) {
              const units = parseFloat(prop.normalizedValue.moneyValue.units || 0);
              const nanos = parseFloat(prop.normalizedValue.moneyValue.nanos || 0) / 1000000000;
              price = units + nanos;
            }
          }
        }
        
        if (name && price > 0) {
          items.push({
            id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            name: name,
            price: price,
            claimed: false
          });
        }
      }
      
      // Get total amount
      for (const entity of totalEntities) {
        if (entity.normalizedValue?.moneyValue) {
          const units = parseFloat(entity.normalizedValue.moneyValue.units || 0);
          const nanos = parseFloat(entity.normalizedValue.moneyValue.nanos || 0) / 1000000000;
          totalAmount = units + nanos;
          break;
        }
      }
    }

    // If no structured data or no items found, use OCR text parsing
    if (items.length === 0 && document.text) {
      console.log('Falling back to OCR text parsing...');
      const ocrResult = parseReceiptText(document.text);
      items = ocrResult.items;
      totalAmount = ocrResult.totalAmount;
    }

    console.log(`Final result: ${items.length} items, total: €${totalAmount.toFixed(2)}`);

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
