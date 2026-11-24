import { describe, expect, it } from 'vitest';
import { formatMoney } from './index';

const norm = (s: string) => s.replace(/\s/g, ' ');

describe('formatMoney', () => {
  it('formats minor units with the currency digits', () => {
    expect(formatMoney(14990, 'TRY', 'tr-TR')).toBe('₺149,90');
    expect(formatMoney(0, 'TRY', 'tr-TR')).toBe('₺0,00');
    expect(formatMoney(123456789, 'TRY', 'tr-TR')).toBe('₺1.234.567,89');
    expect(formatMoney(14990, 'USD', 'en-US')).toBe('$149.90');
    expect(norm(formatMoney(14990, 'EUR', 'de-DE'))).toBe('149,90 €');
    expect(formatMoney(1500, 'JPY', 'en-US')).toBe('¥1,500');
  });

  it('rejects a non-finite amount and an unknown currency', () => {
    expect(() => formatMoney(Number.NaN, 'TRY', 'tr-TR')).toThrow(TypeError);
    expect(() => formatMoney(1, 'NOPE!', 'tr-TR')).toThrow(RangeError);
  });
});
