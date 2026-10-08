import "server-only";
import { endOfMonthISO, todayISO, type ISODate } from "@/lib/dates";
import { forecast, type Forecast } from "@/lib/forecast";
import { occurrencesBetween } from "@/lib/recurring";
import { specOf } from "@/lib/recurring-runner";
import { convertMinor, resolveRate } from "@/lib/fx";
import { db } from "@/db";
import { recurringRules } from "@/db/schema";
import { eq } from "drizzle-orm";
import { todayBalance } from "./balances";
import { averageDailyDiscretionarySpend } from "./stats";
import { getBaseCurrency } from "./settings";
import { listRates } from "./fx";

/** Trailing window used to estimate everyday spending. */
const SPEND_WINDOW_DAYS = 90;

/** Recurring income and expense still scheduled between tomorrow and `to`. */
export function plannedRecurring(
  from: ISODate,
  to: ISODate,
): { incomeMinor: number; expenseMinor: number } {
  const baseCurrency = getBaseCurrency();
  const rates = listRates();
  const rules = db.select().from(recurringRules).where(eq(recurringRules.active, true)).all();

  let incomeMinor = 0;
  let expenseMinor = 0;

  for (const rule of rules) {
    // Transfers move money between own accounts: they do not change net worth.
    if (rule.type === "transfer") continue;

    for (const date of occurrencesBetween(specOf(rule), from, to)) {
      const { rate } = resolveRate(rates, rule.currency, baseCurrency, date);
      const amount = convertMinor(rule.amountMinor, rule.currency, baseCurrency, rate);
      if (rule.type === "income") incomeMinor += amount;
      else expenseMinor += amount;
    }
  }

  return { incomeMinor, expenseMinor };
}

export function monthForecast(asOf: ISODate = todayISO()): Forecast {
  const horizonEnd = endOfMonthISO(asOf);
  const tomorrow = nextDay(asOf);
  const planned = tomorrow > horizonEnd
    ? { incomeMinor: 0, expenseMinor: 0 }
    : plannedRecurring(tomorrow, horizonEnd);

  return forecast({
    currentBalanceMinor: todayBalance(),
    today: asOf,
    horizonEnd,
    plannedIncomeMinor: planned.incomeMinor,
    plannedExpenseMinor: planned.expenseMinor,
    avgDailyDiscretionaryMinor: averageDailyDiscretionarySpend(SPEND_WINDOW_DAYS, asOf),
  });
}

function nextDay(iso: ISODate): ISODate {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
