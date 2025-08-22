import { formatCurrency, parsePrice, calculateTotal, isWithinGraceWindow } from '@/lib/utils/currency';

describe('Currency Utils', () => {
  describe('formatCurrency', () => {
    test('formats German currency correctly', () => {
      expect(formatCurrency(12.34)).toBe('12,34 €');
      expect(formatCurrency(1234.56)).toBe('1.234,56 €');
      expect(formatCurrency(0)).toBe('0,00 €');
    });

    test('handles different currencies', () => {
      expect(formatCurrency(12.34, 'USD')).toBe('12,34 $');
    });
  });

  describe('parsePrice', () => {
    test('parses various price formats', () => {
      expect(parsePrice('12,34')).toBe(12.34);
      expect(parsePrice('12.34')).toBe(12.34);
      expect(parsePrice('€12,34')).toBe(12.34);
      expect(parsePrice('12,34€')).toBe(12.34);
      expect(parsePrice(15.99)).toBe(15.99);
    });

    test('handles invalid inputs', () => {
      expect(parsePrice('')).toBe(0);
      expect(parsePrice(null)).toBe(0);
      expect(parsePrice('invalid')).toBe(0);
    });
  });

  describe('calculateTotal', () => {
    test('calculates total from items', () => {
      const items = [
        { price: 10.50 },
        { price: { value: 5.25 } },
        { price: '3,99' }
      ];
      expect(calculateTotal(items)).toBe(19.74);
    });

    test('handles empty array', () => {
      expect(calculateTotal([])).toBe(0);
    });
  });

  describe('isWithinGraceWindow', () => {
    test('returns true always (grace period removed)', () => {
      const anyTime = new Date(Date.now() - 60000).toISOString(); // any timestamp
      expect(isWithinGraceWindow(anyTime)).toBe(true);
    });

    test('returns true for null input (grace period removed)', () => {
      expect(isWithinGraceWindow(null)).toBe(true);
    });
  });
});
