/**
 * Currency conversion. Pure functions only - rate rows are passed in, so this
 * module is trivially testable and has no database dependency.
 *
 * A rate is always "how many units of the base currency one unit of `quote`
 * is worth". The base currency therefore always has an implicit rate of 1.
 */

import { decimalsFor, roundHalfUp } from "./money";

export interface RateRow {
  quote: string;
  rateToBase: number;
  /** YYYY-MM-DD */
  asOf: string;
}

export class MissingRateError extends Error {
  constructor(
    readonly quote: string,
    readonly baseCurrency: string,
  ) {
    super(
      `Немає курсу ${quote} → ${baseCurrency}. Додайте його в Налаштуваннях.`,
    );
    this.name = "MissingRateError";
  }
}

export interface ResolvedRate {
  rate: number;
  /**
   * True when no rate on or before the requested date existed and the closest
   * later rate was used instead. Callers surface this as a warning rather than
   * pretending the number is exact.
   */
  stale: boolean;
  asOf: string | null;
}

/**
 * Newest rate dated on or before `date`. Falls back to the earliest known rate
 * when the transaction predates every rate entry, flagged as `stale`.
 */
export function resolveRate(
  rates: readonly RateRow[],
  quote: string,
  baseCurrency: string,
  date: string,
): ResolvedRate {
  if (quote === baseCurrency) return { rate: 1, stale: false, asOf: null };

  const forQuote = rates.filter((r) => r.quote === quote);
  if (forQuote.length === 0) throw new MissingRateError(quote, baseCurrency);

  let best: RateRow | null = null;
  for (const row of forQuote) {
    // Dates are ISO strings, so lexicographic comparison is chronological.
    if (row.asOf <= date && (best === null || row.asOf > best.asOf)) best = row;
  }
  if (best) return { rate: best.rateToBase, stale: false, asOf: best.asOf };

  let earliest = forQuote[0]!;
  for (const row of forQuote) if (row.asOf < earliest.asOf) earliest = row;
  return { rate: earliest.rateToBase, stale: true, asOf: earliest.asOf };
}

/** Convert a minor amount in `from` into minor units of `to` at `rate` (from -> to). */
export function convertMinor(
  amountMinor: number,
  from: string,
  to: string,
  rate: number,
): number {
  if (from === to && rate === 1) return amountMinor;
  const major = amountMinor / 10 ** decimalsFor(from);
  return roundHalfUp(major * rate * 10 ** decimalsFor(to));
}

/** Convenience wrapper: amount in `currency` expressed in the base currency. */
export function toBaseMinor(
  amountMinor: number,
  currency: string,
  baseCurrency: string,
  rate: number,
): number {
  return convertMinor(amountMinor, currency, baseCurrency, rate);
}

/**
 * Cross rate between two non-base currencies, routed through the base currency:
 * 1 `from` = `rateFrom` base = `rateFrom / rateTo` `to`.
 */
export function crossRate(rateFrom: number, rateTo: number): number {
  if (rateTo === 0) throw new Error("Курс не може бути нулем");
  return rateFrom / rateTo;
}

/** Suggested credited amount for a cross-currency transfer. */
export function suggestTransferAmount(
  amountMinor: number,
  from: string,
  to: string,
  rates: readonly RateRow[],
  baseCurrency: string,
  date: string,
): { toAmountMinor: number; rate: number; stale: boolean } {
  if (from === to) return { toAmountMinor: amountMinor, rate: 1, stale: false };
  const fromRate = resolveRate(rates, from, baseCurrency, date);
  const toRate = resolveRate(rates, to, baseCurrency, date);
  const rate = crossRate(fromRate.rate, toRate.rate);
  return {
    toAmountMinor: convertMinor(amountMinor, from, to, rate),
    rate,
    stale: fromRate.stale || toRate.stale,
  };
}
