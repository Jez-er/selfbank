import "server-only";
import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "@/db";
import { accounts, recurringRules, transactions } from "@/db/schema";
import { addDaysISO, todayISO, type ISODate } from "./dates";
import { convertMinor, resolveRate, suggestTransferAmount, type RateRow } from "./fx";
import { advanceAfter, nextOccurrence, occurrencesBetween, type RecurrenceSpec } from "./recurring";
import { listRates } from "./queries/fx";
import { getBaseCurrency } from "./queries/settings";
import type { RecurringRule } from "@/db/schema";

/** Guards against a rule with a very old start date flooding the ledger. */
const MAX_CATCH_UP_PER_RULE = 120;

export function specOf(rule: RecurringRule): RecurrenceSpec {
  return {
    frequency: rule.frequency,
    intervalCount: rule.intervalCount,
    startDate: rule.startDate,
    endDate: rule.endDate,
    dayOfMonth: rule.dayOfMonth,
    weekday: rule.weekday,
    monthOfYear: rule.monthOfYear,
  };
}

export interface PostingReport {
  rulesProcessed: number;
  transactionsCreated: number;
  deactivated: number;
}

/**
 * Posts every occurrence that is due on or before `asOf`.
 *
 * Idempotency comes from doing the inserts and the `next_run_at` advance in
 * one SQLite transaction per rule: either the catch-up is recorded and the
 * cursor moves, or neither happens. Running this twice in a row therefore
 * creates nothing the second time, which matters because it runs both on boot
 * and on an hourly timer.
 */
export function postDueRules(asOf: ISODate = todayISO()): PostingReport {
  const due = db
    .select()
    .from(recurringRules)
    .where(
      and(
        eq(recurringRules.active, true),
        eq(recurringRules.autoPost, true),
        lte(recurringRules.nextRunAt, asOf),
      ),
    )
    .orderBy(asc(recurringRules.nextRunAt))
    .all();

  const report: PostingReport = { rulesProcessed: 0, transactionsCreated: 0, deactivated: 0 };
  if (due.length === 0) return report;

  const baseCurrency = getBaseCurrency();
  const rates = listRates();

  for (const rule of due) {
    const outcome = db.transaction((tx) => {
      const spec = specOf(rule);
      const dates = occurrencesBetween(spec, rule.nextRunAt, asOf, MAX_CATCH_UP_PER_RULE);

      if (dates.length === 0) {
        // Nothing owed but the cursor is stale, e.g. the end date has passed.
        if (nextOccurrence(spec, rule.nextRunAt) === null) {
          tx.update(recurringRules)
            .set({ active: false })
            .where(eq(recurringRules.id, rule.id))
            .run();
          return { created: 0, deactivated: true };
        }
        return { created: 0, deactivated: false };
      }

      const account = tx.select().from(accounts).where(eq(accounts.id, rule.accountId)).get();
      if (!account) {
        console.warn(`[selfbank] recurring rule ${rule.id} points at a missing account`);
        return { created: 0, deactivated: false };
      }
      const target =
        rule.type === "transfer" && rule.toAccountId
          ? tx.select().from(accounts).where(eq(accounts.id, rule.toAccountId)).get()
          : null;

      for (const date of dates) {
        tx.insert(transactions)
          .values(
            buildTransaction(
              rule,
              account.currency,
              target?.currency ?? null,
              date,
              baseCurrency,
              rates,
            ),
          )
          .run();
      }

      const last = dates[dates.length - 1]!;
      const next = advanceAfter(spec, last);
      tx.update(recurringRules)
        .set({
          lastPostedAt: last,
          // A finished series keeps its last cursor and goes inactive.
          nextRunAt: next ?? last,
          active: next !== null,
        })
        .where(eq(recurringRules.id, rule.id))
        .run();

      return { created: dates.length, deactivated: next === null };
    });

    report.rulesProcessed += 1;
    report.transactionsCreated += outcome.created;
    if (outcome.deactivated) report.deactivated += 1;
  }

  return report;
}

function buildTransaction(
  rule: RecurringRule,
  currency: string,
  targetCurrency: string | null,
  date: ISODate,
  baseCurrency: string,
  rates: RateRow[],
) {
  const resolved = resolveRate(rates, currency, baseCurrency, date);
  const baseAmountMinor = convertMinor(rule.amountMinor, currency, baseCurrency, resolved.rate);

  let toAmountMinor: number | null = null;
  if (rule.type === "transfer" && targetCurrency) {
    toAmountMinor =
      targetCurrency === currency
        ? rule.amountMinor
        : suggestTransferAmount(rule.amountMinor, currency, targetCurrency, rates, baseCurrency, date)
            .toAmountMinor;
  }

  return {
    type: rule.type,
    accountId: rule.accountId,
    toAccountId: rule.type === "transfer" ? rule.toAccountId : null,
    amountMinor: rule.amountMinor,
    currency,
    toAmountMinor,
    baseAmountMinor,
    fxRate: resolved.rate,
    categoryId: rule.type === "transfer" ? null : rule.categoryId,
    goalId: null,
    debtId: null,
    recurringId: rule.id,
    occurredAt: date,
    note: rule.note ?? rule.name,
  };
}

export interface UpcomingOccurrence {
  rule: RecurringRule;
  date: ISODate;
  /** True when the date has already passed and the rule still needs posting. */
  overdue: boolean;
}

/** Rules that need a manual "post" click, i.e. due but `autoPost` is off. */
export function pendingRules(asOf: ISODate = todayISO()): UpcomingOccurrence[] {
  return db
    .select()
    .from(recurringRules)
    .where(
      and(
        eq(recurringRules.active, true),
        eq(recurringRules.autoPost, false),
        lte(recurringRules.nextRunAt, asOf),
      ),
    )
    .all()
    .map((rule) => ({ rule, date: rule.nextRunAt, overdue: rule.nextRunAt < asOf }));
}

/** Next occurrence of every active rule within `days`, for the dashboard. */
export function upcomingOccurrences(days = 30, asOf: ISODate = todayISO()): UpcomingOccurrence[] {
  const horizon = addDaysISO(asOf, days);
  const rules = db.select().from(recurringRules).where(eq(recurringRules.active, true)).all();

  return rules
    .flatMap((rule) => {
      const date = nextOccurrence(specOf(rule), rule.nextRunAt);
      if (date === null || date > horizon) return [];
      return [{ rule, date, overdue: date < asOf }];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
}
