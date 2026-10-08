import "server-only";
import { sqlite } from "@/db";
import { addDaysISO, eachMonthKey, type ISODate } from "@/lib/dates";
import { openingTotalBase } from "./balances";

export interface Period {
  from: ISODate;
  to: ISODate;
}

/**
 * All figures here are in the base currency and come from
 * `transactions.base_amount_minor`, which was frozen at entry time. Reports
 * therefore never change retroactively when an exchange rate is updated.
 *
 * Transfers are excluded from income and expense totals: moving money between
 * your own accounts is not spending.
 */

export interface PeriodSummary {
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
  /** Share of income that was not spent, 0-100; null when there was no income. */
  savingsRate: number | null;
  transactionCount: number;
}

export function periodSummary(period: Period): PeriodSummary {
  const row = sqlite
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'income'  THEN base_amount_minor END), 0) AS income,
         COALESCE(SUM(CASE WHEN type = 'expense' THEN base_amount_minor END), 0) AS expense,
         COUNT(*) AS cnt
       FROM transactions
       WHERE occurred_at BETWEEN ? AND ? AND type IN ('income', 'expense')`,
    )
    .get(period.from, period.to) as { income: number; expense: number; cnt: number };

  const netMinor = row.income - row.expense;
  return {
    incomeMinor: row.income,
    expenseMinor: row.expense,
    netMinor,
    savingsRate: row.income > 0 ? (netMinor / row.income) * 100 : null,
    transactionCount: row.cnt,
  };
}

export interface CategorySlice {
  categoryId: number | null;
  name: string;
  color: string;
  icon: string;
  totalMinor: number;
  count: number;
}

export function categoryBreakdown(
  period: Period,
  kind: "expense" | "income" = "expense",
): CategorySlice[] {
  return sqlite
    .prepare(
      `SELECT t.category_id              AS categoryId,
              COALESCE(c.name, 'Без категорії') AS name,
              COALESCE(c.color, '#94a3b8')      AS color,
              COALESCE(c.icon, 'circle')        AS icon,
              SUM(t.base_amount_minor)   AS totalMinor,
              COUNT(*)                   AS count
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       WHERE t.type = ? AND t.occurred_at BETWEEN ? AND ?
       GROUP BY t.category_id
       ORDER BY totalMinor DESC`,
    )
    .all(kind, period.from, period.to) as CategorySlice[];
}

export interface MonthlyPoint {
  month: string;
  incomeMinor: number;
  expenseMinor: number;
  netMinor: number;
}

export function monthlySeries(period: Period): MonthlyPoint[] {
  const rows = sqlite
    .prepare(
      `SELECT substr(occurred_at, 1, 7) AS month,
              COALESCE(SUM(CASE WHEN type = 'income'  THEN base_amount_minor END), 0) AS income,
              COALESCE(SUM(CASE WHEN type = 'expense' THEN base_amount_minor END), 0) AS expense
       FROM transactions
       WHERE occurred_at BETWEEN ? AND ? AND type IN ('income', 'expense')
       GROUP BY month`,
    )
    .all(period.from, period.to) as Array<{ month: string; income: number; expense: number }>;

  const found = new Map(rows.map((r) => [r.month, r]));
  // Months with no activity still need a point, or the chart would imply the
  // gap did not exist.
  return eachMonthKey(period.from, period.to).map((month) => {
    const row = found.get(month);
    const incomeMinor = row?.income ?? 0;
    const expenseMinor = row?.expense ?? 0;
    return { month, incomeMinor, expenseMinor, netMinor: incomeMinor - expenseMinor };
  });
}

export interface TrendPoint {
  date: ISODate;
  balanceMinor: number;
}

/**
 * Net-worth trend. Starts from the balance the day before the period and adds
 * each day's net movement, so the line is continuous even on days with no
 * transactions.
 */
export function balanceTrend(period: Period, maxPoints = 120): TrendPoint[] {
  const before = sqlite
    .prepare(
      `SELECT COALESCE(SUM(CASE type WHEN 'income' THEN base_amount_minor
                                     WHEN 'expense' THEN -base_amount_minor
                                     ELSE 0 END), 0) AS net
       FROM transactions WHERE occurred_at < ?`,
    )
    .get(period.from) as { net: number };

  const daily = sqlite
    .prepare(
      `SELECT occurred_at AS date,
              SUM(CASE type WHEN 'income' THEN base_amount_minor
                            WHEN 'expense' THEN -base_amount_minor
                            ELSE 0 END) AS net
       FROM transactions
       WHERE occurred_at BETWEEN ? AND ?
       GROUP BY occurred_at
       ORDER BY occurred_at`,
    )
    .all(period.from, period.to) as Array<{ date: string; net: number }>;

  const deltas = new Map(daily.map((d) => [d.date, d.net]));
  let running = openingTotalBase() + before.net;

  const points: TrendPoint[] = [];
  for (let cursor = period.from; cursor <= period.to; cursor = addDaysISO(cursor, 1)) {
    running += deltas.get(cursor) ?? 0;
    points.push({ date: cursor, balanceMinor: running });
  }

  return downsample(points, maxPoints);
}

/**
 * Keeps charts readable over long ranges by thinning the series, always
 * retaining the first and last point so the endpoints stay accurate.
 */
function downsample<T>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return points;
  const step = Math.ceil(points.length / maxPoints);
  const out = points.filter((_, i) => i % step === 0);
  const last = points[points.length - 1]!;
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

export interface TopExpense {
  id: number;
  amountMinor: number;
  baseAmountMinor: number;
  currency: string;
  occurredAt: string;
  note: string | null;
  categoryName: string | null;
  categoryColor: string | null;
  accountName: string;
}

export function topExpenses(period: Period, limit = 5): TopExpense[] {
  return sqlite
    .prepare(
      `SELECT t.id,
              t.amount_minor      AS amountMinor,
              t.base_amount_minor AS baseAmountMinor,
              t.currency,
              t.occurred_at       AS occurredAt,
              t.note,
              c.name              AS categoryName,
              c.color             AS categoryColor,
              a.name              AS accountName
       FROM transactions t
       LEFT JOIN categories c ON c.id = t.category_id
       JOIN accounts a ON a.id = t.account_id
       WHERE t.type = 'expense' AND t.occurred_at BETWEEN ? AND ?
       ORDER BY t.base_amount_minor DESC
       LIMIT ?`,
    )
    .all(period.from, period.to, limit) as TopExpense[];
}

/** Average spend per day over the trailing window, used by the forecast. */
export function averageDailySpend(windowDays: number, endDate: ISODate): number {
  const from = addDaysISO(endDate, -windowDays + 1);
  const row = sqlite
    .prepare(
      `SELECT COALESCE(SUM(base_amount_minor), 0) AS total
       FROM transactions
       WHERE type = 'expense' AND occurred_at BETWEEN ? AND ?`,
    )
    .get(from, endDate) as { total: number };
  return row.total / windowDays;
}

/** Spend per day excluding anything created by a recurring rule. */
export function averageDailyDiscretionarySpend(windowDays: number, endDate: ISODate): number {
  const from = addDaysISO(endDate, -windowDays + 1);
  const row = sqlite
    .prepare(
      `SELECT COALESCE(SUM(base_amount_minor), 0) AS total
       FROM transactions
       WHERE type = 'expense' AND recurring_id IS NULL AND occurred_at BETWEEN ? AND ?`,
    )
    .get(from, endDate) as { total: number };
  return row.total / windowDays;
}

export interface MonthCategoryCell {
  month: string;
  categoryId: number | null;
  totalMinor: number;
}

export function monthByCategory(period: Period): MonthCategoryCell[] {
  return sqlite
    .prepare(
      `SELECT substr(occurred_at, 1, 7) AS month,
              category_id               AS categoryId,
              SUM(base_amount_minor)    AS totalMinor
       FROM transactions
       WHERE type = 'expense' AND occurred_at BETWEEN ? AND ?
       GROUP BY month, category_id`,
    )
    .all(period.from, period.to) as MonthCategoryCell[];
}

/** Earliest transaction date, so pickers and charts don't show empty history. */
export function earliestTransactionDate(): ISODate | null {
  const row = sqlite
    .prepare(`SELECT MIN(occurred_at) AS first FROM transactions`)
    .get() as { first: string | null };
  return row.first;
}
