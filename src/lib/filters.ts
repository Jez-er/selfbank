import { isISODate } from "./dates";
import { parseAmount } from "./money";
import type { TransactionFilters } from "./queries/transactions";

export interface RawFilters {
  from?: string;
  to?: string;
  type?: string;
  accountId?: string;
  categoryId?: string;
  search?: string;
  min?: string;
  max?: string;
}

/**
 * Turns URL search params into typed filters, discarding anything malformed.
 * Nothing here is interpolated into SQL - the query layer binds every value as
 * a parameter - but invalid input is dropped so a typo does not silently
 * return an empty list.
 */
export function parseFilters(raw: RawFilters, baseCurrency: string): TransactionFilters {
  const filters: TransactionFilters = {};

  if (raw.from && isISODate(raw.from)) filters.from = raw.from;
  if (raw.to && isISODate(raw.to)) filters.to = raw.to;
  if (raw.type === "income" || raw.type === "expense" || raw.type === "transfer") {
    filters.type = raw.type;
  }

  const accountId = Number(raw.accountId);
  if (Number.isInteger(accountId) && accountId > 0) filters.accountId = accountId;

  const categoryId = Number(raw.categoryId);
  if (Number.isInteger(categoryId) && categoryId > 0) filters.categoryId = categoryId;

  if (raw.search && raw.search.trim() !== "") filters.search = raw.search.trim().slice(0, 120);

  const min = safeAmount(raw.min, baseCurrency);
  if (min !== null) filters.minMinor = min;
  const max = safeAmount(raw.max, baseCurrency);
  if (max !== null) filters.maxMinor = max;

  return filters;
}

function safeAmount(value: string | undefined, currency: string): number | null {
  if (!value || value.trim() === "") return null;
  try {
    return parseAmount(value, currency);
  } catch {
    return null;
  }
}

/** Only the filters that were actually set, for round-tripping into links. */
export function activeRawFilters(raw: RawFilters): RawFilters {
  return Object.fromEntries(
    Object.entries(raw).filter(([, value]) => value !== undefined && value !== ""),
  );
}
