import "server-only";
import { sqlite } from "@/db";
import type { ISODate } from "@/lib/dates";

export interface TransactionFilters {
  from?: ISODate;
  to?: ISODate;
  type?: "income" | "expense" | "transfer";
  accountId?: number;
  categoryId?: number;
  /** Matched against the note, case-insensitively. */
  search?: string;
  /** Inclusive bounds on the base-currency amount, in minor units. */
  minMinor?: number;
  maxMinor?: number;
  goalId?: number;
  debtId?: number;
}

export interface TransactionRow {
  id: number;
  type: "income" | "expense" | "transfer";
  amountMinor: number;
  currency: string;
  toAmountMinor: number | null;
  baseAmountMinor: number;
  occurredAt: ISODate;
  note: string | null;
  accountId: number;
  accountName: string;
  accountColor: string;
  toAccountId: number | null;
  toAccountName: string | null;
  toAccountCurrency: string | null;
  categoryId: number | null;
  categoryName: string | null;
  categoryColor: string | null;
  categoryIcon: string | null;
  goalId: number | null;
  goalName: string | null;
  debtId: number | null;
  debtName: string | null;
  recurringId: number | null;
}

/**
 * Builds the WHERE clause from the active filters. Values are always bound as
 * parameters - never interpolated - so a search string cannot alter the query.
 */
function buildWhere(filters: TransactionFilters): { sql: string; params: unknown[] } {
  const clauses: string[] = [];
  const params: unknown[] = [];

  if (filters.from) {
    clauses.push("t.occurred_at >= ?");
    params.push(filters.from);
  }
  if (filters.to) {
    clauses.push("t.occurred_at <= ?");
    params.push(filters.to);
  }
  if (filters.type) {
    clauses.push("t.type = ?");
    params.push(filters.type);
  }
  if (filters.accountId) {
    // An account appears as either side of a transfer.
    clauses.push("(t.account_id = ? OR t.to_account_id = ?)");
    params.push(filters.accountId, filters.accountId);
  }
  if (filters.categoryId) {
    clauses.push("t.category_id = ?");
    params.push(filters.categoryId);
  }
  if (filters.goalId) {
    clauses.push("t.goal_id = ?");
    params.push(filters.goalId);
  }
  if (filters.debtId) {
    clauses.push("t.debt_id = ?");
    params.push(filters.debtId);
  }
  if (filters.search && filters.search.trim() !== "") {
    // LIKE with an escaped pattern: % and _ in the query are literal.
    const pattern = `%${filters.search.trim().replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
    clauses.push("(t.note LIKE ? ESCAPE '\\' COLLATE NOCASE)");
    params.push(pattern);
  }
  if (filters.minMinor !== undefined) {
    clauses.push("t.base_amount_minor >= ?");
    params.push(filters.minMinor);
  }
  if (filters.maxMinor !== undefined) {
    clauses.push("t.base_amount_minor <= ?");
    params.push(filters.maxMinor);
  }

  return { sql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

const SELECT_COLUMNS = `
  t.id,
  t.type,
  t.amount_minor      AS amountMinor,
  t.currency,
  t.to_amount_minor   AS toAmountMinor,
  t.base_amount_minor AS baseAmountMinor,
  t.occurred_at       AS occurredAt,
  t.note,
  t.account_id        AS accountId,
  a.name              AS accountName,
  a.color             AS accountColor,
  t.to_account_id     AS toAccountId,
  ta.name             AS toAccountName,
  ta.currency         AS toAccountCurrency,
  t.category_id       AS categoryId,
  c.name              AS categoryName,
  c.color             AS categoryColor,
  c.icon              AS categoryIcon,
  t.goal_id           AS goalId,
  g.name              AS goalName,
  t.debt_id           AS debtId,
  d.counterparty      AS debtName,
  t.recurring_id      AS recurringId
`;

const JOINS = `
  FROM transactions t
  JOIN accounts a       ON a.id  = t.account_id
  LEFT JOIN accounts ta ON ta.id = t.to_account_id
  LEFT JOIN categories c ON c.id = t.category_id
  LEFT JOIN goals g      ON g.id = t.goal_id
  LEFT JOIN debts d      ON d.id = t.debt_id
`;

export interface TransactionPage {
  rows: TransactionRow[];
  total: number;
  /** Totals for the whole filtered set, not just the current page. */
  incomeMinor: number;
  expenseMinor: number;
}

export function listTransactions(
  filters: TransactionFilters,
  options: { limit?: number; offset?: number } = {},
): TransactionPage {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 500);
  const offset = Math.max(options.offset ?? 0, 0);
  const where = buildWhere(filters);

  const rows = sqlite
    .prepare(
      `SELECT ${SELECT_COLUMNS} ${JOINS} ${where.sql}
       ORDER BY t.occurred_at DESC, t.id DESC
       LIMIT ? OFFSET ?`,
    )
    .all(...where.params, limit, offset) as TransactionRow[];

  const totals = sqlite
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.base_amount_minor END), 0) AS income,
              COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.base_amount_minor END), 0) AS expense
       ${JOINS} ${where.sql}`,
    )
    .get(...where.params) as { total: number; income: number; expense: number };

  return {
    rows,
    total: totals.total,
    incomeMinor: totals.income,
    expenseMinor: totals.expense,
  };
}

export function getTransaction(id: number): TransactionRow | undefined {
  return sqlite
    .prepare(`SELECT ${SELECT_COLUMNS} ${JOINS} WHERE t.id = ?`)
    .get(id) as TransactionRow | undefined;
}

export function recentTransactions(limit = 5): TransactionRow[] {
  return listTransactions({}, { limit }).rows;
}

/** Every matching row, for CSV export of the current filter selection. */
export function allMatchingTransactions(filters: TransactionFilters): TransactionRow[] {
  const where = buildWhere(filters);
  return sqlite
    .prepare(
      `SELECT ${SELECT_COLUMNS} ${JOINS} ${where.sql} ORDER BY t.occurred_at DESC, t.id DESC`,
    )
    .all(...where.params) as TransactionRow[];
}
