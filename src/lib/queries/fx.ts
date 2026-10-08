import "server-only";
import { asc, desc } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { exchangeRates } from "@/db/schema";
import { resolveRate, type RateRow, type ResolvedRate } from "@/lib/fx";
import { todayISO } from "@/lib/dates";
import { getBaseCurrency } from "./settings";

export function listRates(): RateRow[] {
  return db
    .select({
      quote: exchangeRates.quote,
      rateToBase: exchangeRates.rateToBase,
      asOf: exchangeRates.asOf,
    })
    .from(exchangeRates)
    .orderBy(asc(exchangeRates.quote), desc(exchangeRates.asOf))
    .all();
}

export function listRateRows() {
  return db
    .select()
    .from(exchangeRates)
    .orderBy(desc(exchangeRates.asOf), asc(exchangeRates.quote))
    .all();
}

/** Latest rate per quote currency, for the settings screen and balance totals. */
export function latestRates(): Map<string, { rate: number; asOf: string }> {
  const rows = sqlite
    .prepare(
      `SELECT quote, rate_to_base AS rate, MAX(as_of) AS as_of
       FROM exchange_rates GROUP BY quote`,
    )
    .all() as Array<{ quote: string; rate: number; as_of: string }>;
  return new Map(rows.map((r) => [r.quote, { rate: r.rate, asOf: r.as_of }]));
}

export function resolveRateFor(quote: string, date = todayISO()): ResolvedRate {
  return resolveRate(listRates(), quote, getBaseCurrency(), date);
}

/** Currencies in use by accounts that have no rate at all yet. */
export function missingRateCurrencies(): string[] {
  const base = getBaseCurrency();
  const rows = sqlite
    .prepare(
      `SELECT DISTINCT a.currency AS currency
       FROM accounts a
       WHERE a.currency <> ?
         AND NOT EXISTS (SELECT 1 FROM exchange_rates r WHERE r.quote = a.currency)`,
    )
    .all(base) as Array<{ currency: string }>;
  return rows.map((r) => r.currency);
}
