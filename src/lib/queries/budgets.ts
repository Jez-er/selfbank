import "server-only";
import { asc } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { budgets } from "@/db/schema";
import { monthKey, monthKeyToRange, todayISO } from "@/lib/dates";

export interface BudgetProgress {
  id: number;
  categoryId: number | null;
  categoryName: string;
  categoryColor: string;
  /** Limit in the base currency, minor units. */
  limitMinor: number;
  spentMinor: number;
  remainingMinor: number;
  /** 0-100+, where values over 100 mean the limit was exceeded. */
  usedPercent: number;
  active: boolean;
  rollover: boolean;
  startMonth: string;
  state: "ok" | "warning" | "over";
}

const WARNING_THRESHOLD = 80;

/**
 * Budget usage for one month. Budgets and `base_amount_minor` are both in the
 * base currency, so no conversion is needed here.
 *
 * A budget with `rollover` carries unspent room forward from the months since
 * `start_month`, which is why its effective limit can exceed `amount_minor`.
 */
export function budgetProgress(month = monthKey(todayISO())): BudgetProgress[] {
  const range = monthKeyToRange(month);
  const rows = db.select().from(budgets).orderBy(asc(budgets.id)).all();
  if (rows.length === 0) return [];

  const spentByCategory = new Map<number | null, number>();
  const spendRows = sqlite
    .prepare(
      `SELECT category_id AS categoryId, SUM(base_amount_minor) AS total
       FROM transactions
       WHERE type = 'expense' AND occurred_at BETWEEN ? AND ?
       GROUP BY category_id`,
    )
    .all(range.from, range.to) as Array<{ categoryId: number | null; total: number }>;
  let totalSpend = 0;
  for (const row of spendRows) {
    spentByCategory.set(row.categoryId, row.total);
    totalSpend += row.total;
  }

  const categoryNames = new Map(
    (
      sqlite.prepare(`SELECT id, name, color FROM categories`).all() as Array<{
        id: number;
        name: string;
        color: string;
      }>
    ).map((c) => [c.id, c]),
  );

  return rows
    .filter((budget) => budget.startMonth <= month)
    .map((budget) => {
      const spentMinor =
        budget.categoryId === null ? totalSpend : (spentByCategory.get(budget.categoryId) ?? 0);
      const limitMinor = budget.rollover
        ? budget.amountMinor + rolloverCredit(budget, month)
        : budget.amountMinor;
      const remainingMinor = limitMinor - spentMinor;
      const usedPercent = limitMinor > 0 ? (spentMinor / limitMinor) * 100 : 0;
      const category = budget.categoryId === null ? null : categoryNames.get(budget.categoryId);

      return {
        id: budget.id,
        categoryId: budget.categoryId,
        categoryName: category?.name ?? "Усі витрати",
        categoryColor: category?.color ?? "#64748b",
        limitMinor,
        spentMinor,
        remainingMinor,
        usedPercent,
        active: budget.active,
        rollover: budget.rollover,
        startMonth: budget.startMonth,
        state: usedPercent > 100 ? "over" : usedPercent >= WARNING_THRESHOLD ? "warning" : "ok",
      } satisfies BudgetProgress;
    });
}

/**
 * Unspent room from every completed month since the budget started. Negative
 * months (overspend) reduce the credit, so rollover cannot be gamed by
 * alternating over- and under-spending.
 */
function rolloverCredit(budget: typeof budgets.$inferSelect, month: string): number {
  const months = completedMonthsBetween(budget.startMonth, month);
  if (months.length === 0) return 0;

  let credit = 0;
  for (const past of months) {
    const range = monthKeyToRange(past);
    const row = sqlite
      .prepare(
        `SELECT COALESCE(SUM(base_amount_minor), 0) AS total
         FROM transactions
         WHERE type = 'expense' AND occurred_at BETWEEN ? AND ?
           ${budget.categoryId === null ? "" : "AND category_id = ?"}`,
      )
      .get(
        ...(budget.categoryId === null
          ? [range.from, range.to]
          : [range.from, range.to, budget.categoryId]),
      ) as { total: number };
    credit += budget.amountMinor - row.total;
  }
  return credit;
}

function completedMonthsBetween(startMonth: string, currentMonth: string): string[] {
  const out: string[] = [];
  let cursor = startMonth;
  while (cursor < currentMonth) {
    out.push(cursor);
    const year = Number(cursor.slice(0, 4));
    const monthNumber = Number(cursor.slice(5, 7));
    cursor =
      monthNumber === 12
        ? `${year + 1}-01`
        : `${year}-${String(monthNumber + 1).padStart(2, "0")}`;
  }
  return out;
}

export function activeBudgetProgress(month = monthKey(todayISO())): BudgetProgress[] {
  return budgetProgress(month).filter((b) => b.active);
}
