import "server-only";
import { asc } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { debts } from "@/db/schema";
import { daysBetween, todayISO } from "@/lib/dates";

export interface DebtProgress {
  id: number;
  counterparty: string;
  direction: "i_owe" | "owed_to_me";
  currency: string;
  principalMinor: number;
  paidMinor: number;
  outstandingMinor: number;
  progressPercent: number;
  dueDate: string | null;
  daysLeft: number | null;
  overdue: boolean;
  settledAt: string | null;
  note: string | null;
  done: boolean;
}

/**
 * Outstanding amount is the principal minus every transaction tagged with the
 * debt. Direction decides what counts as a payment: repaying something you owe
 * is an expense, while someone repaying you is income.
 */
export function debtProgress(includeSettled = true): DebtProgress[] {
  const rows = db.select().from(debts).orderBy(asc(debts.id)).all();
  if (rows.length === 0) return [];

  const paid = new Map(
    (
      sqlite
        .prepare(
          `SELECT debt_id AS debtId, type, COALESCE(SUM(amount_minor), 0) AS total
           FROM transactions WHERE debt_id IS NOT NULL GROUP BY debt_id, type`,
        )
        .all() as Array<{ debtId: number; type: string; total: number }>
    ).map((r) => [`${r.debtId}:${r.type}`, r.total]),
  );

  const today = todayISO();

  return rows
    .filter((debt) => includeSettled || debt.settledAt === null)
    .map((debt) => {
      const paymentType = debt.direction === "i_owe" ? "expense" : "income";
      const paidMinor = paid.get(`${debt.id}:${paymentType}`) ?? 0;
      const outstandingMinor = Math.max(0, debt.principalMinor - paidMinor);
      const daysLeft = debt.dueDate ? daysBetween(today, debt.dueDate) : null;
      const done = debt.settledAt !== null || outstandingMinor === 0;

      return {
        id: debt.id,
        counterparty: debt.counterparty,
        direction: debt.direction,
        currency: debt.currency,
        principalMinor: debt.principalMinor,
        paidMinor,
        outstandingMinor,
        progressPercent:
          debt.principalMinor > 0 ? Math.min(100, (paidMinor / debt.principalMinor) * 100) : 0,
        dueDate: debt.dueDate,
        daysLeft,
        overdue: !done && daysLeft !== null && daysLeft < 0,
        settledAt: debt.settledAt,
        note: debt.note,
        done,
      } satisfies DebtProgress;
    });
}

export interface DebtSummary {
  iOweMinor: number;
  owedToMeMinor: number;
  /** Currencies present, so the UI can avoid summing across them wrongly. */
  currencies: string[];
  overdueCount: number;
}

/**
 * Totals are grouped per currency rather than converted: a debt is owed in the
 * currency it was agreed in, and converting it would invent precision.
 */
export function debtSummary(): DebtSummary {
  const open = debtProgress(false).filter((d) => !d.done);
  return {
    iOweMinor: open
      .filter((d) => d.direction === "i_owe")
      .reduce((sum, d) => sum + d.outstandingMinor, 0),
    owedToMeMinor: open
      .filter((d) => d.direction === "owed_to_me")
      .reduce((sum, d) => sum + d.outstandingMinor, 0),
    currencies: [...new Set(open.map((d) => d.currency))],
    overdueCount: open.filter((d) => d.overdue).length,
  };
}
