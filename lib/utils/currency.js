export const formatCurrency = (amount, currency = 'EUR') => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

export const parsePrice = (priceString) => {
  if (typeof priceString === 'number') return priceString;
  if (!priceString) return 0;
  
  // Handle various price formats
  const cleanPrice = priceString.toString()
    .replace(/[^\d,.-]/g, '') // Remove currency symbols and letters
    .replace(',', '.'); // German decimal separator
  
  const parsed = parseFloat(cleanPrice);
  return isNaN(parsed) ? 0 : parsed;
};

export const calculateTotal = (items) => {
  return items.reduce((total, item) => {
    const price = typeof item.price === 'object' ? item.price.value : item.price;
    return total + parsePrice(price);
  }, 0);
};

export const isWithinGraceWindow = (claimedAt) => {
  // Grace period removed: allow unclaim anytime
  return true;
};
