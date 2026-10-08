import "server-only";
import { sqlite } from "@/db";
import { convertMinor } from "@/lib/fx";
import { todayISO } from "@/lib/dates";
import { getBaseCurrency } from "./settings";
import { latestRates } from "./fx";

export interface AccountBalance {
  id: number;
  name: string;
  type: string;
  currency: string;
  color: string;
  archived: boolean;
  sortOrder: number;
  openingBalanceMinor: number;
  /** Balance in the account's own currency. */
  balanceMinor: number;
  /** Same balance converted at today's rate; null when no rate is configured. */
  baseBalanceMinor: number | null;
  transactionCount: number;
}

/**
 * Balances are always derived, never stored: `opening_balance + net movement`.
 * A denormalised running balance would be one more thing to keep in sync, and
 * at personal-finance volumes this query is instant.
 *
 * Each transaction contributes to at most two accounts: the source (negative
 * for expense/transfer, positive for income) and, for transfers, the
 * destination (crediting `to_amount_minor` when the currencies differ).
 */
const BALANCE_SQL = `
  WITH movement AS (
    SELECT account_id AS acc,
           CASE type WHEN 'income' THEN amount_minor ELSE -amount_minor END AS delta
    FROM transactions
    UNION ALL
    SELECT to_account_id AS acc,
           COALESCE(to_amount_minor, amount_minor) AS delta
    FROM transactions
    WHERE type = 'transfer' AND to_account_id IS NOT NULL
  )
  SELECT a.id,
         a.name,
         a.type,
         a.currency,
         a.color,
         a.archived,
         a.sort_order            AS sortOrder,
         a.opening_balance_minor AS openingBalanceMinor,
         a.opening_balance_minor + COALESCE(SUM(m.delta), 0) AS balanceMinor,
         COUNT(m.delta)          AS transactionCount
  FROM accounts a
  LEFT JOIN movement m ON m.acc = a.id
  GROUP BY a.id
  ORDER BY a.archived, a.sort_order, a.id
`;

export function accountBalances(options: { includeArchived?: boolean } = {}): AccountBalance[] {
  const base = getBaseCurrency();
  const rates = latestRates();
  const rows = sqlite.prepare(BALANCE_SQL).all() as Array<{
    id: number;
    name: string;
    type: string;
    currency: string;
    color: string;
    archived: number;
    sortOrder: number;
    openingBalanceMinor: number;
    balanceMinor: number;
    transactionCount: number;
  }>;

  return rows
    .filter((r) => options.includeArchived || r.archived === 0)
    .map((r) => {
      // A balance is a present-day quantity, so it is converted at today's
      // rate - unlike a transaction, which keeps the rate it was entered at.
      const rate = r.currency === base ? 1 : rates.get(r.currency)?.rate;
      return {
        ...r,
        archived: r.archived === 1,
        baseBalanceMinor:
          rate === undefined ? null : convertMinor(r.balanceMinor, r.currency, base, rate),
      };
    });
}

export interface TotalBalance {
  baseCurrency: string;
  totalMinor: number;
  /** Currencies skipped because no rate is configured. */
  unconverted: string[];
  byCurrency: Array<{ currency: string; balanceMinor: number }>;
}

export function totalBalance(): TotalBalance {
  const base = getBaseCurrency();
  const balances = accountBalances();

  const byCurrency = new Map<string, number>();
  for (const account of balances) {
    byCurrency.set(account.currency, (byCurrency.get(account.currency) ?? 0) + account.balanceMinor);
  }

  let totalMinor = 0;
  const unconverted: string[] = [];
  for (const account of balances) {
    if (account.baseBalanceMinor === null) {
      if (!unconverted.includes(account.currency)) unconverted.push(account.currency);
      continue;
    }
    totalMinor += account.baseBalanceMinor;
  }

  return {
    baseCurrency: base,
    totalMinor,
    unconverted,
    byCurrency: [...byCurrency].map(([currency, balanceMinor]) => ({ currency, balanceMinor })),
  };
}

/** Net worth as of a past date, used by the balance-trend chart. */
export function balanceAsOf(date: string): number {
  const row = sqlite
    .prepare(
      `SELECT COALESCE(SUM(CASE type WHEN 'income' THEN base_amount_minor
                                     WHEN 'expense' THEN -base_amount_minor
                                     ELSE 0 END), 0) AS net
       FROM transactions WHERE occurred_at <= ?`,
    )
    .get(date) as { net: number };
  return openingTotalBase() + row.net;
}

/**
 * Sum of opening balances in the base currency. Transfers are excluded from
 * trend maths because moving money between your own accounts does not change
 * net worth (the small FX spread on a cross-currency transfer is ignored).
 */
export function openingTotalBase(): number {
  const base = getBaseCurrency();
  const rates = latestRates();
  const rows = sqlite
    .prepare(`SELECT currency, SUM(opening_balance_minor) AS total FROM accounts GROUP BY currency`)
    .all() as Array<{ currency: string; total: number }>;

  let sum = 0;
  for (const row of rows) {
    const rate = row.currency === base ? 1 : rates.get(row.currency)?.rate;
    if (rate === undefined) continue;
    sum += convertMinor(row.total, row.currency, base, rate);
  }
  return sum;
}

export function todayBalance(): number {
  return balanceAsOf(todayISO());
}
