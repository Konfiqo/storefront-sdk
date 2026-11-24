/**
 * Formats an integer amount of minor units (kuruş, cents, …) as a
 * localised currency string with `Intl.NumberFormat`, using the currency's
 * own number of minor digits (2 for `TRY`, 0 for `JPY`).
 *
 * @example formatMoney(14990, 'TRY', 'tr-TR') // "₺149,90"
 * @throws TypeError when `minor` is not a finite number; RangeError for an
 * unknown currency code (from `Intl`).
 */
export function formatMoney(
  minor: number,
  currency: string,
  locale?: string | string[],
): string {
  if (typeof minor !== 'number' || !Number.isFinite(minor)) {
    throw new TypeError('formatMoney: minor must be a finite number');
  }
  const format = new Intl.NumberFormat(locale, { style: 'currency', currency });
  const digits = format.resolvedOptions().maximumFractionDigits ?? 2;
  return format.format(minor / 10 ** digits);
}
