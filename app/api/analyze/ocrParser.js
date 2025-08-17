// Enhanced German receipt parser for OCR.space returns text
export function parseGermanReceipt(text) {
  text = text || ''
  const items = []
  let total = null

  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  
  // First, look for the SUMME total
  for (const line of lines) {
    const summeMatch = line.match(/SUMME\s+EUR\s+([\d,.]+)/i)
    if (summeMatch) {
      total = parseFloat(summeMatch[1].replace(',', '.'))
      break
    }
  }

  // Parse REWE-style receipt: look for patterns with prices and tax classes
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    
    // Pattern 1: Item name followed by price and tax class on same line
    // Example: "SUESSKARTOFFEL 4,69 A" or "GEFLUEGELROLLE 2, 18"
    const sameLinePattern = line.match(/^([A-ZÄÖÜ][A-ZÄÖÜ\s\.\-\d]{2,}?)\s+([\d,]+\.?\d{0,2})\s*[ABC]?\s*$/i)
    if (sameLinePattern) {
      const name = sameLinePattern[1].trim()
      const priceStr = sameLinePattern[2].replace(/\s/g, '').replace(',', '.')
      const price = parseFloat(priceStr)
      
      if (name && !Number.isNaN(price) && price > 0 && price < 100) {
        // Skip weight/quantity lines
        if (!name.match(/^\d+[,.]?\d*\s*(kg|x|Stk)/i)) {
          items.push({ name, price })
        }
        continue
      }
    }
    
    // Pattern 2: Item name on one line, price on next line(s)
    // Look for standalone prices that might belong to previous item names
    const priceMatch = line.match(/^([\d,]+\.?\d{0,2})\s*[ABC]?\s*$/i)
    if (priceMatch && i > 0) {
      const priceStr = priceMatch[1].replace(/\s/g, '').replace(',', '.')
      const price = parseFloat(priceStr)
      
      if (!Number.isNaN(price) && price > 0 && price < 100) {
        // Look back for item name in previous lines
        for (let j = i - 1; j >= Math.max(0, i - 3); j--) {
          const prevLine = lines[j]
          
          // Check if previous line looks like an item name
          if (prevLine.match(/^[A-ZÄÖÜ][A-ZÄÖÜ\s\.\-\d]{2,}$/i) && 
              !prevLine.match(/^\d+[,.]?\d*\s*(kg|x|Stk|EUR)/i) &&
              !prevLine.match(/^(REWE|Glashüttenstr|UID|Datum|Uhrzeit|SUMME)/i)) {
            
            // Check if we haven't already used this price
            const existingItem = items.find(item => Math.abs(item.price - price) < 0.01)
            if (!existingItem) {
              items.push({ name: prevLine.trim(), price })
              break
            }
          }
        }
      }
    }
    
    // Pattern 3: Multi-word items with quantity and price
    // Example: "2 Stk x 1,09" or "GEFLUEGELROLLE 2 Stk x 1,09"
    const quantityPattern = line.match(/^(.+?)\s*(\d+)\s*Stk\s*x\s*([\d,]+\.?\d{0,2})/i)
    if (quantityPattern) {
      const name = quantityPattern[1].trim() || 'Item'
      const quantity = parseInt(quantityPattern[2])
      const unitPrice = parseFloat(quantityPattern[3].replace(',', '.'))
      const totalPrice = quantity * unitPrice
      
      if (name && !Number.isNaN(totalPrice) && totalPrice > 0) {
        items.push({ name: `${name} (${quantity}x)`, price: totalPrice })
        continue
      }
    }
  }

  // Remove duplicates and invalid items
  const uniqueItems = []
  for (const item of items) {
    const isDuplicate = uniqueItems.some(existing => 
      existing.name.toLowerCase() === item.name.toLowerCase() && 
      Math.abs(existing.price - item.price) < 0.01
    )
    
    if (!isDuplicate && item.name.length > 1 && item.price > 0) {
      uniqueItems.push(item)
    }
  }

  // If we didn't find many items, try a more aggressive approach
  if (uniqueItems.length < 5) {
    const allText = text.replace(/\n/g, ' ')
    const words = allText.split(/\s+/)
    
    for (let i = 0; i < words.length - 1; i++) {
      const word = words[i]
      const nextWord = words[i + 1]
      
      // Look for word followed by price pattern
      if (word.length > 2 && nextWord.match(/^\d+[,.]?\d{1,2}$/)) {
        const name = word.replace(/[^A-Za-zÄÖÜäöüß\- ]/g, '').trim()
        const price = parseFloat(nextWord.replace(',', '.'))
        
        if (name && !Number.isNaN(price) && price > 0 && price < 50) {
          const isDuplicate = uniqueItems.some(existing => 
            existing.name.toLowerCase() === name.toLowerCase() && 
            Math.abs(existing.price - price) < 0.01
          )
          
          if (!isDuplicate) {
            uniqueItems.push({ name, price })
          }
        }
      }
    }
  }

  // Sort by price (highest first) and limit results
  uniqueItems.sort((a, b) => b.price - a.price)
  
  return { 
    items: uniqueItems.slice(0, 25), 
    total, 
    itemCount: uniqueItems.length 
  }
}
