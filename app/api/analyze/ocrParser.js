// Lightweight German receipt parser used by the /api/analyze route.
// It looks for the UID (or similar) header and starts parsing afterwards.
// It extracts items with their correct total price (skips per-kg unit prices)
// and finds the SUMME (total) at the end.

// Exported function: parseGermanReceipt(text) -> { items: [{name, price: number, priceStr, tag}], sum: number|null, sumStr }
export function parseGermanReceipt(text, options = {}) {
  const debugMode = options.debug === true
  if (!text || typeof text !== 'string') return debugMode ? { items: [], sum: null, sumStr: null, debug: { originalText: text } } : { items: [], sum: null, sumStr: null }

  // Normalize and split into lines
  // First, normalize common OCR spacing issues inside numbers (e.g. "1, 78" -> "1,78")
  let norm = text.replace(/[\u00A0]/g, ' ')
  // collapse repeated spaces
  norm = norm.replace(/\s{2,}/g, ' ')
  norm = norm.replace(/\r/g, '')
  // fix spaced decimals like "1, 78" or "1 ,78" or "1 , 78"
  norm = norm.replace(/(\d)\s*[,.]\s*(\d{2})/g, '$1,$2')
  // fix stray spaces inside thousands like "1 234" -> "1234"
  norm = norm.replace(/(\d)\s+(?=\d{3}(\D|$))/g, '$1')

  const rawLines = norm.split('\n').map(l => l.trim()).filter(Boolean)

  const diagnostics = [] // per-line diagnostics for debug

  // Find start index after UID (common: "UID", "UID Nr" etc). If not found, start at 0
  let startIndex = 0
  for (let i = 0; i < rawLines.length; i++) {
    if (/\bUID\b|\bUID\s*Nr\b|\bUID\s*Nr\.|\bUID[:]/i.test(rawLines[i])) {
      startIndex = i + 1
      break
    }
  }

  const items = []
  let lastName = null
  let pendingItem = null // store pending item object when we have name but no price yet
  const pendingNames = [] // collect names awaiting prices when OCR separates names and prices
  const priceBuffer = [] // collect consecutive price-only lines to assign later
  let sawEURMarker = false
  let sum = null
  let sumStr = null
  let sumFoundIndex = -1

  const metaSkip = /handeingabe|e-bon|kundenbeleg|kassenbeleg|datum|uhrzeit|uhr|telefon|tel\b|rechnung|mwst|uid\b/i

  // Helper to find all price-like tokens (e.g. 4,69 or 130.18)
  const findPrices = (line) => {
    if (!line) return []
    // match numbers like 130,18 or 1.234,56 or 25,00
    const m = line.match(/\d{1,3}(?:[\.\s]\d{3})*[.,]\d{2}|\d+[.,]\d{2}/g)
    return m || []
  }

  // Helper to parse German price string to float
  const parsePrice = (s) => {
    if (typeof s !== 'string') return null
    const sanitized = s.replace(/\./g, '').replace(/,/g, '.')
    const n = Number(sanitized)
    return Number.isFinite(n) ? n : null
  }

  // Clean name: remove trailing price tokens, trailing letters A/B/C and stray markers
  const cleanName = (line) => {
    if (!line) return ''
    // remove trailing price-like parts and ending category letters and stars
    let t = line.replace(/\*+$/g, '')
    t = t.replace(/\s+[A-C]$/i, '')
    t = t.replace(/\s*\d+[.,]\d{2}\s*$/g, '')
    // remove stray currency markers
    t = t.replace(/\bEUR\b|\bEur\b|€/g, '')
    return t.trim()
  }

  for (let i = startIndex; i < rawLines.length; i++) {
    const line = rawLines[i]
    if (!line) continue

    // Try to capture the SUMME/total first — don't break immediately, price may be on next line(s)
    if (/\bSUMME\b|\bSUM\b|\bGes\.|\bGes\b/i.test(line)) {
      const prices = findPrices(line)
      if (prices.length) {
        sumStr = prices[prices.length - 1]
        sum = parsePrice(sumStr)
      }
      sumFoundIndex = i
      diagnostics.push({ index: i, line, action: 'found-sum', prices, sumStr })
      // continue parsing to allow lookahead price assignment
      continue
    }

    // Skip known meta lines
    if (metaSkip.test(line)) continue

    // Handle quantity lines like "2 Stk x" optionally followed by a price on the same or next line
    const qtyMatch = line.match(/^(\d+)\s*(?:Stk|Stück|stk|Stk\.)\s*[xX]\s*(.*)$/i)
  if (qtyMatch) {
      const qty = parseInt(qtyMatch[1], 10)
      const rest = qtyMatch[2].trim()
      // If rest contains a price take it, otherwise try next line
      let unitPriceStr = null
      if (rest) {
        const p = findPrices(rest)
        if (p.length) unitPriceStr = p[p.length - 1]
      }
      if (!unitPriceStr) {
        // lookahead for a price-only next line
        const next = rawLines[i + 1]
        if (next) {
          const pnext = findPrices(next)
          if (pnext.length && /^([€€€\s]*\d)/.test(next) || /^\d+[.,]\d{2}$/.test(next)) {
            unitPriceStr = pnext[pnext.length - 1]
            // we will advance the index to skip that price-only line
            i++
          }
        }
      }
      const unitPrice = unitPriceStr ? parsePrice(unitPriceStr) : null
      if (unitPrice != null && lastName) {
        const total = Math.round((unitPrice * qty + Number.EPSILON) * 100) / 100
        items.push({ name: `${lastName} (${qty}x)`, price: total, priceStr: String(total).replace('.', ','), tag: null })
        diagnostics.push({ index: i, line, action: 'qty-assigned', qty, unitPriceStr, total, name: lastName })
        lastName = null
        pendingItem = null
        continue
      }
      diagnostics.push({ index: i, line, action: 'qty-skip', qty, unitPriceStr: unitPriceStr || null })
      // otherwise treat as a generic line and continue
    }

    // Detect an isolated price-only line (maybe with EUR or € or trailing tag). We'll buffer these and
    // assign them later if the receipt shows a price block at the end.
    const priceOnlyMatch = line.replace(/€/g, '').trim().match(/^\d+[.,]\d{2}(?:\s*[A-C])?$/)
    if (priceOnlyMatch) {
      const rawPrice = priceOnlyMatch[0].trim()
      priceBuffer.push({ raw: rawPrice, line, index: i })
      diagnostics.push({ index: i, line, action: 'price-buffered', rawPrice })
      // do not assign immediately; wait for potential block assignment
      continue
    }

    // If we hit the 'EUR' marker which often precedes a block of prices, mark it
    if (/^EUR$/i.test(line)) {
      sawEURMarker = true
      diagnostics.push({ index: i, line, action: 'saw-eur-marker' })
      continue
    }

    // If we reach a non-price line but have a buffered price block, attempt assignment now.
    if (priceBuffer.length > 0) {
      // Build price strings from buffer
      const bufferedPrices = priceBuffer.map(p => {
        // strip trailing tag letters if present
        const m = p.raw.match(/^(\d+[.,]\d{2})/)
        return m ? m[1] : p.raw
      })

      // Assign buffered prices to pending names (in FIFO order)
      let assigned = 0
      while (bufferedPrices.length > 0 && pendingNames.length > 0) {
        const priceStr = bufferedPrices.shift()
        const name = pendingNames.shift()
        const price = parsePrice(priceStr)
        if (price != null) {
          items.push({ name: name || '<unknown>', price, priceStr, tag: null })
          diagnostics.push({ action: 'buffer-assigned', name, price, priceStr })
          assigned++
        } else {
          diagnostics.push({ action: 'buffer-assign-failed', name, priceStr })
        }
      }

      // If there are leftover buffered prices but no pending names, try to append them as unnamed items
      while (bufferedPrices.length > 0) {
        const priceStr = bufferedPrices.shift()
        const price = parsePrice(priceStr)
        if (price != null) {
          items.push({ name: '<unknown>', price, priceStr, tag: null })
          diagnostics.push({ action: 'buffer-assigned-unnamed', price, priceStr })
        }
      }

      priceBuffer.length = 0
      sawEURMarker = false
    }

    const prices = findPrices(line)

    // If no price on this line, treat it as an item name candidate
    if (prices.length === 0) {
      // accept as name candidate only if it contains at least one letter and not a colon or mostly numeric
      const hasLetter = /[A-Za-zÄÖÜäöüß]/.test(line)
      const looksNumeric = /^\s*[\d\W]+\s*$/.test(line)
      const hasColon = /:/.test(line)
      if (hasLetter && !looksNumeric && !hasColon && line.length >= 3) {
        lastName = line
        pendingItem = { name: line }
        pendingNames.push(line)
        diagnostics.push({ index: i, line, action: 'name-candidate', name: line })
      } else {
        diagnostics.push({ index: i, line, action: 'skip-nonitem' })
      }
      continue
    }

    // There is at least one price on the line.
    // If the line contains per-kg markers and only one price, it's likely a per-kg unit price -> skip only if no additional price
    const hasKgUnit = /\bkg\b|\/kg|EUR\/kg|EUR\s*\/\s*kg|kg\s*x/i.test(line)
    if (hasKgUnit && prices.length === 1) {
      // If we also have a lastName/pendingItem, we don't want to drop the total if a later token gives total;
      // but common pattern is: weight line with unit price then a total price appears elsewhere; so skip for now
      // Continue to next line
      diagnostics.push({ index: i, line, action: 'skip-kg-unit', prices })
      continue
    }

    // For lines with multiple prices (e.g. weight/unit/total) we take the last price as total
    const priceStr = prices[prices.length - 1]
    const price = parsePrice(priceStr)

    // Determine the item name: prefer lastName (previous line), otherwise derive from current line
    let name = lastName || ''
    if (!name) {
      name = cleanName(line)
      name = name.replace(/\d+[.,]\d+\s*kg.*$/i, '').replace(/\d+\s*Stk.*$/i, '').trim()
    }

    if (!name) {
      name = line.replace(new RegExp(priceStr.replace('.', '\\.'), 'g'), '').replace(/[A-C]$/i, '').trim()
    }

    name = cleanName(name)

    const tagMatch = line.match(new RegExp(priceStr.replace(',', '\\,') + '\\s*([A-C])', 'i'))
    const tag = tagMatch ? tagMatch[1] : null

    if (price != null && !isNaN(price)) {
      items.push({ name: name || '<unknown>', price, priceStr, tag })
      diagnostics.push({ index: i, line, action: 'item-pushed', name, price, priceStr, tag })
    } else {
      diagnostics.push({ index: i, line, action: 'price-parse-failed', prices })
    }

    lastName = null
    pendingItem = null
  }

  const result = { items, sum, sumStr }
  if (debugMode) {
    result.debug = {
      originalText: text,
      normalizedText: norm,
      rawLines,
      diagnostics
    }
  }

  return result
}

