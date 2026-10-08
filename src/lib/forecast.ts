/**
 * End-of-period cash projection.
 *
 * Deliberately simple and explainable rather than statistical: the result is
 * returned together with its components so the UI can show *why* the number
 * is what it is. A black-box projection would be worse than none for a tool
 * you use to make spending decisions.
 *
 *   projected = balance now
 *             + recurring income still due
 *             - recurring expenses still due
 *             - average daily discretionary spend x days remaining
 *
 * "Discretionary" excludes anything a recurring rule created, so those
 * amounts are not counted twice.
 */

import { daysBetween, type ISODate } from "./dates";

export interface ForecastInput {
  currentBalanceMinor: number;
  today: ISODate;
  horizonEnd: ISODate;
  /** Recurring income scheduled after today, up to and including horizonEnd. */
  plannedIncomeMinor: number;
  plannedExpenseMinor: number;
  /** Mean daily spend on non-recurring expenses, in minor units. */
  avgDailyDiscretionaryMinor: number;
}

export interface Forecast {
  projectedBalanceMinor: number;
  /** Days left after today, so a forecast made on the last day adds nothing. */
  daysRemaining: number;
  deltaMinor: number;
  components: {
    currentBalanceMinor: number;
    plannedIncomeMinor: number;
    plannedExpenseMinor: number;
    estimatedDiscretionaryMinor: number;
  };
}

export function forecast(input: ForecastInput): Forecast {
  const daysRemaining = Math.max(0, daysBetween(input.today, input.horizonEnd));
  const estimatedDiscretionaryMinor = Math.round(
    input.avgDailyDiscretionaryMinor * daysRemaining,
  );

  const deltaMinor =
    input.plannedIncomeMinor - input.plannedExpenseMinor - estimatedDiscretionaryMinor;

  return {
    projectedBalanceMinor: input.currentBalanceMinor + deltaMinor,
    daysRemaining,
    deltaMinor,
    components: {
      currentBalanceMinor: input.currentBalanceMinor,
      plannedIncomeMinor: input.plannedIncomeMinor,
      plannedExpenseMinor: input.plannedExpenseMinor,
      estimatedDiscretionaryMinor,
    },
  };
}

/**
 * Straight-line daily points between today's balance and the projection, for
 * the dashed segment of the balance chart.
 */
export function forecastPath(
  startMinor: number,
  result: Forecast,
  dates: ISODate[],
): Array<{ date: ISODate; balanceMinor: number }> {
  if (dates.length === 0) return [];
  const step = result.deltaMinor / dates.length;
  return dates.map((date, index) => ({
    date,
    balanceMinor: Math.round(startMinor + step * (index + 1)),
  }));
}
