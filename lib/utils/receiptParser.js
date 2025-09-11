// Receipt parsing utility implementing the provided regex strategy.
// Exports a single parseReceipt(text) function returning { items, calculatedSum, extractedTotal, rawTotal, removedQuantityBlocks }

function normalizeInput(text) {
  if (!text || typeof text !== 'string') return '';
  // Normalize line endings and trim trailing spaces per line
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(l => l.replace(/\s+$/,'').replace(/\t/g,' '))
    .join('\n');
}

// Precompile regexes (JS version of provided patterns)
const singleLineQuantityPattern = /(^\s*\d+\s*(?:Stk|Stück|Stücke)?\b.*?x.*?\d{1,3},\d{2}\s*$)/gim;
const twoLineQuantityPattern = /(^\s*\d+\s*(?:Stk|Stück|Stücke)?\b.*?x\s*$)\n(\s*\d{1,3},\d{2}\s*$)/gim;

// Item extractor (JS can't use inline flags; pass flags to RegExp)
// Mirrors: ^(?!\s*(?:SUMME|Gesamtbetrag|Gesamt|EUR|Brutto|Steuer)\b)(name...)(optional middle)\n price
const itemRegex = /^(?!\s*(?:SUMME|Gesamtbetrag|Gesamt|EUR|Brutto|Steuer)\b)(?<name>[A-ZÄÖÜẞ0-9][A-ZÄÖÜäöüß0-9%&().,:\/+\- '" ]{1,120}?)(?:\n(?:(?!\b(?:Stk|Stück|x|kg|g|l|ml|SUMME|Gesamt)\b)[\s\S])*?)?\n\s*(?<price>\d{1,3},\d{2})(?:\s*[A-Za-z])?\b/gmi;

// Total extractor
const totalRegex = /^(?:SUMME|Gesamtbetrag|Gesamt|Total)\b[^\S\n]*\n?(?:EUR\s*)?\s*(?<total>\d{1,3},\d{2})\b/gim;

function stripQuantityBlocks(text) {
  let removed = [];
  // Two-line first (so we don't break their pairing)
  text = text.replace(twoLineQuantityPattern, (m, l1, l2) => { removed.push(l1 + '\n' + l2); return ''; });
  text = text.replace(singleLineQuantityPattern, (m) => { removed.push(m); return ''; });
  return { text, removed };
}

function toNumber(priceStr) {
  if (!priceStr) return null;
  return parseFloat(priceStr.replace(/\./g,'').replace(',', '.'));
}

function parseReceipt(rawText) {
  const normalized = normalizeInput(rawText);
  const { text: cleaned, removed } = stripQuantityBlocks(normalized);

  const items = [];
  const seen = new Set(); // Avoid duplicates by name+price line span signature
  let match;
  while ((match = itemRegex.exec(cleaned)) !== null) {
    const nameRaw = match.groups?.name || '';
    const priceRaw = match.groups?.price || '';
    const name = nameRaw.replace(/\s+/g, ' ').trim();
    const price = toNumber(priceRaw);
    if (!name || price == null) continue;
    const signature = name + '|' + price.toFixed(2) + '|' + match.index;
    if (seen.has(signature)) continue;
    seen.add(signature);
    // Basic sanity: ignore if name looks like total keywords
    if (/^(SUMME|GESAMT|TOTAL)$/i.test(name)) continue;
    items.push({ name, price });
  }

  // Extract (first) total
  let extractedTotal = null;
  let rawTotal = null;
  const totalMatch = totalRegex.exec(cleaned);
  if (totalMatch) {
    rawTotal = totalMatch.groups?.total || null;
    extractedTotal = toNumber(rawTotal);
  }

  const calculatedSum = Number(items.reduce((acc, it) => acc + (it.price || 0), 0).toFixed(2));

  return { items, calculatedSum, extractedTotal, rawTotal, removedQuantityBlocks: removed };
}

module.exports = { parseReceipt };
