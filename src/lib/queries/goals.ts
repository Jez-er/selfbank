import "server-only";
import { asc } from "drizzle-orm";
import { db, sqlite } from "@/db";
import { goals } from "@/db/schema";
import { daysBetween, todayISO } from "@/lib/dates";
import { accountBalances } from "./balances";

export interface GoalProgress {
  id: number;
  name: string;
  currency: string;
  targetMinor: number;
  savedMinor: number;
  remainingMinor: number;
  progressPercent: number;
  targetDate: string | null;
  daysLeft: number | null;
  /** How much to put aside each month to finish on time; null without a date. */
  monthlyNeedMinor: number | null;
  accountId: number | null;
  accountName: string | null;
  note: string | null;
  archived: boolean;
  done: boolean;
}

/**
 * Progress comes from one of two sources, chosen per goal:
 *   - a linked account: the goal tracks that account's balance;
 *   - otherwise: the sum of transactions tagged with this goal, where income
 *     and transfers in count as contributions and expenses as withdrawals.
 */
export function goalProgress(includeArchived = false): GoalProgress[] {
  const rows = db.select().from(goals).orderBy(asc(goals.archived), asc(goals.id)).all();
  if (rows.length === 0) return [];

  const balances = new Map(accountBalances({ includeArchived: true }).map((a) => [a.id, a]));

  const tagged = new Map(
    (
      sqlite
        .prepare(
          `SELECT goal_id AS goalId,
                  COALESCE(SUM(CASE type WHEN 'expense' THEN -amount_minor
                                         ELSE amount_minor END), 0) AS total
           FROM transactions WHERE goal_id IS NOT NULL GROUP BY goal_id`,
        )
        .all() as Array<{ goalId: number; total: number }>
    ).map((r) => [r.goalId, r.total]),
  );

  const today = todayISO();

  return rows
    .filter((goal) => includeArchived || !goal.archived)
    .map((goal) => {
      const linked = goal.accountId === null ? null : balances.get(goal.accountId);
      const savedMinor = linked ? linked.balanceMinor : (tagged.get(goal.id) ?? 0);
      const remainingMinor = Math.max(0, goal.targetMinor - savedMinor);
      const daysLeft = goal.targetDate ? daysBetween(today, goal.targetDate) : null;
      const monthsLeft = daysLeft === null ? null : Math.max(1, Math.ceil(daysLeft / 30.44));

      return {
        id: goal.id,
        name: goal.name,
        currency: goal.currency,
        targetMinor: goal.targetMinor,
        savedMinor,
        remainingMinor,
        progressPercent:
          goal.targetMinor > 0 ? Math.min(100, (savedMinor / goal.targetMinor) * 100) : 0,
        targetDate: goal.targetDate,
        daysLeft,
        monthlyNeedMinor:
          monthsLeft === null ? null : Math.ceil(remainingMinor / monthsLeft),
        accountId: goal.accountId,
        accountName: linked?.name ?? null,
        note: goal.note,
        archived: goal.archived,
        done: savedMinor >= goal.targetMinor,
      } satisfies GoalProgress;
    });
}
