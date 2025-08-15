// Enhanced German receipt parser for OCR.space Engine 2 output
export function parseGermanReceipt(text) {
  console.log('=== Starting OCR parsing ===');
  console.log('Raw OCR text length:', text.length);
  
  const items = [];
  let totalSum = null;
  
  // Clean and split the text into lines and elements
  const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
  const allElements = text.split(/[\t\s]+/).map(el => el.trim()).filter(el => el.length > 0);
  
  console.log('Total lines:', lines.length);
  console.log('Total elements:', allElements.length);
  
  // First, find the total sum - look for pattern like "130, 18" or "130,18" followed by "EUR"
  for (let i = 0; i < allElements.length - 1; i++) {
    const current = allElements[i];
    const next = allElements[i + 1];
    
    // Match patterns like "130, 18", "130,18", "130.18"
    if (current.match(/^\d{1,3}[,.\s]+\d{1,2}$/) && next === 'EUR') {
      const cleanTotal = current.replace(/[,\s]/g, '.').replace(/\.\.+/g, '.');
      const parsedTotal = parseFloat(cleanTotal);
      if (parsedTotal > 10 && parsedTotal < 1000) {
        totalSum = parsedTotal;
        console.log(`Found total sum: €${totalSum}`);
        break;
      }
    }
  }
  
  // Process each line to find items and prices
  for (const line of lines) {
    const lineElements = line.split(/[\t\s]+/).filter(el => el.trim().length > 0);
    
    // Skip header lines and metadata
    if (line.match(/^(REWE|EDEKA|ALDI|LIDL|KAUFLAND|PENNY|NETTO)/i)) continue;
    if (line.match(/^(Glashüttenstr|UID|Nr\.|Datum|Uhrzeit|Geg\.|EC-Cash)/i)) continue;
    if (line.match(/^(GOOGLEPLAY|V\d+|Kundenbeleg|\*\s*\*)/i)) continue;
    if (line.match(/^\d{2}\.\s*\d{2}:\d{2}:\d{2}/)) continue; // Date/time patterns
    
    // Look for price patterns with tax categories (A, B, C)
    const priceWithTaxMatch = line.match(/(\d+[,.]?\d*)\s+[ABC]\s*$/);
    if (priceWithTaxMatch) {
      const price = parseFloat(priceWithTaxMatch[1].replace(',', '.'));
      
      // Extract item name from the beginning of the line
      const itemMatch = line.match(/^([A-ZÄÖÜ][A-ZÄÖÜ\s\.]+?)(?=\s+\d+[,.]?\d*\s+[ABC])/);
      if (itemMatch) {
        let itemName = itemMatch[1].trim();
        
        // Clean up item name
        itemName = itemName
          .replace(/^\d+\s*/, '') // Remove leading numbers
          .replace(/[,.]$/, '') // Remove trailing punctuation
          .replace(/\s{2,}/g, ' ') // Normalize spaces
          .trim();
        
        if (itemName.length >= 3 && price >= 0.10 && price <= 100) {
          // Check for duplicates
          const isDuplicate = items.some(item => 
            item.name.toLowerCase() === itemName.toLowerCase() && 
            Math.abs(item.price - price) < 0.01
          );
          
          if (!isDuplicate) {
            items.push({
              name: itemName,
              price: price
            });
            console.log(`Found item: "${itemName}" - €${price.toFixed(2)}`);
          }
        }
      }
    }
  }
  
  // Alternative parsing method - look for standalone price patterns
  if (items.length < 3) {
    console.log('Trying alternative parsing method...');
    
    // Look for price patterns like "4,69", "1,52", etc.
    const priceMatches = text.match(/\d+[,.]?\d{1,2}(?=\s*[ABC]?\s)/g);
    const itemMatches = text.match(/[A-ZÄÖÜ][A-ZÄÖÜ\s\.]{2,}(?=\s+\d+[,.]?\d*)/g);
    
    if (priceMatches && itemMatches) {
      console.log('Found price patterns:', priceMatches.length);
      console.log('Found item patterns:', itemMatches.length);
      
      // Try to match items with prices based on proximity
      const words = text.split(/\s+/);
      
      for (let i = 0; i < words.length - 1; i++) {
        const word = words[i];
        const nextWord = words[i + 1];
        
        // Look for item names (uppercase, multiple words)
        if (word.match(/^[A-ZÄÖÜ]{3,}/) && !word.match(/^\d+$/)) {
          let itemName = word;
          let j = i + 1;
          
          // Collect additional words that are part of the item name
          while (j < words.length && words[j].match(/^[A-ZÄÖÜ]{2,}/) && !words[j].match(/^\d+[,.]?\d*$/)) {
            itemName += ' ' + words[j];
            j++;
          }
          
          // Look for a price within the next few words
          for (let k = j; k < Math.min(words.length, j + 5); k++) {
            const priceCandidate = words[k];
            if (priceCandidate.match(/^\d+[,.]?\d{1,2}$/) && !priceCandidate.match(/^\d{4,}$/)) {
              const price = parseFloat(priceCandidate.replace(',', '.'));
              
              if (price >= 0.10 && price <= 100) {
                // Check if next word is a tax category
                const hasValidContext = k + 1 < words.length && 
                  (words[k + 1].match(/^[ABC]$/) || words[k + 1].match(/^(EUR|kg|x)$/));
                
                if (hasValidContext || price > 1.0) {
                  const isDuplicate = items.some(item => 
                    item.name.toLowerCase() === itemName.toLowerCase() && 
                    Math.abs(item.price - price) < 0.01
                  );
                  
                  if (!isDuplicate && itemName.length >= 3) {
                    items.push({
                      name: itemName.trim(),
                      price: price
                    });
                    console.log(`Alternative method found: "${itemName}" - €${price.toFixed(2)}`);
                  }
                }
                break;
              }
            }
          }
        }
      }
    }
  }
  
  // Remove obvious false positives
  const filteredItems = items.filter(item => {
    // Remove items that are likely metadata
    if (item.name.match(/^(EUR|KG|STK|X|\d+)$/i)) return false;
    if (item.name.match(/^(Handeingabe|E-Bon|GOOGLEPLAY)$/i)) return false;
    if (item.name.length < 3) return false;
    
    return true;
  });
  
  // Sort items by price (descending) and limit to reasonable number
  filteredItems.sort((a, b) => b.price - a.price);
  const finalItems = filteredItems.slice(0, 25); // Limit to max 25 items
  
  console.log(`=== Parsing complete ===`);
  console.log(`Found ${finalItems.length} items`);
  console.log(`Total sum: €${totalSum || 'not found'}`);
  
  return {
    items: finalItems,
    total: totalSum,
    itemCount: finalItems.length
  };
}
