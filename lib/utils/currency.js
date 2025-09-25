/**
 * Currency Utilities for ZiCount
 * 
 * Provides standardized currency formatting, parsing, and calculation functions
 * with support for German/European number formats and various input types.
 * 
 * Features:
 * - Locale-aware formatting (German format with EUR currency)
 * - Robust price parsing from strings and objects
 * - Total calculation for item collections
 * - Grace period utilities for claim modifications
 */

/**
 * Format numeric amount as localized currency string
 * 
 * @param {number} amount - Numeric amount to format
 * @param {string} currency - Currency code (default: 'EUR')
 * @returns {string} Formatted currency string (e.g., "12,50 €")
 */
export const formatCurrency = (amount, currency = 'EUR') => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

/**
 * Parse price from various input formats to numeric value
 * 
 * Handles:
 * - Numbers (passthrough)
 * - String prices with currency symbols
 * - German decimal separator (comma)
 * - Object prices with nested value properties
 * 
 * @param {number|string|Object} priceString - Price in various formats
 * @returns {number} Parsed numeric price or 0 if invalid
 */
export const parsePrice = (priceString) => {
  if (typeof priceString === 'number') return priceString;
  if (!priceString) return 0;
  
  // Clean and standardize price string format
  const cleanPrice = priceString.toString()
    .replace(/[^\d,.-]/g, '') // Remove currency symbols and letters
    .replace(',', '.'); // Convert German decimal separator to standard format
  
  const parsed = parseFloat(cleanPrice);
  return isNaN(parsed) ? 0 : parsed;
};

/**
 * Calculate total amount for a collection of items
 * 
 * @param {Array} items - Array of item objects with price properties
 * @returns {number} Sum of all item prices
 */
export const calculateTotal = (items) => {
  return items.reduce((total, item) => {
    const price = item.price?.value ?? item.price;
    return total + parsePrice(price);
  }, 0);
};

/**
 * Check if a claim is within the grace period for modifications
 * Currently disabled - allows unclaiming at any time
 * 
 * @param {Date} claimedAt - Timestamp when item was claimed
 * @returns {boolean} Always true (grace period disabled)
 */
export const isWithinGraceWindow = (claimedAt) => {
  // Grace period removed: allow unclaim anytime
  return true;
};
