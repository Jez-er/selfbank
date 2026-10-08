import { addDaysISO, eachDayISO, endOfMonthISO, type ISODate } from "./dates";
import { forecastPath, type Forecast } from "./forecast";

export interface TrendPointInput {
  date: ISODate;
  balanceMinor: number;
}

export interface TrendDatum {
  date: ISODate;
  /** Actual net worth; null on days that belong to the forecast only. */
  actual: number | null;
  /** Projected net worth; null before today. */
  projected?: number | null;
}

/**
 * Joins the actual balance history with the projection into one series for the
 * chart.
 *
 * The selected period often runs past today - "this month" ends in the future -
 * and those trailing days only repeat the last known balance. They are dropped
 * before the forecast is appended, otherwise the x-axis would double back over
 * dates it had already plotted.
 *
 * Today appears in both series so the dashed projection starts exactly where
 * the solid line ends, with no visual gap.
 */
export function buildTrendData(
  trend: readonly TrendPointInput[],
  forecast: Forecast | null,
  today: ISODate,
): TrendDatum[] {
  const actual = trend.filter((point) => point.date <= today);
  const data: TrendDatum[] = actual.map((point) => ({
    date: point.date,
    actual: point.balanceMinor,
    projected: point.date === today ? point.balanceMinor : null,
  }));

  if (!forecast || forecast.daysRemaining === 0) return data;

  const last = actual[actual.length - 1];
  const startMinor = last?.balanceMinor ?? forecast.components.currentBalanceMinor;

  // The period may have ended before today; anchor the projection anyway.
  if (last?.date !== today) {
    data.push({ date: today, actual: startMinor, projected: startMinor });
  }

  const futureDates = eachDayISO(addDaysISO(today, 1), endOfMonthISO(today));
  for (const point of forecastPath(startMinor, forecast, futureDates)) {
    data.push({ date: point.date, actual: null, projected: point.balanceMinor });
  }

  return data;
}
