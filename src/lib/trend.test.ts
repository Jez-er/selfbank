import { describe, expect, it } from "vitest";
import { forecast } from "./forecast";
import { buildTrendData } from "./trend";

const today = "2025-06-10";

const projection = forecast({
  currentBalanceMinor: 100_00,
  today,
  horizonEnd: "2025-06-30",
  plannedIncomeMinor: 0,
  plannedExpenseMinor: 200_00,
  avgDailyDiscretionaryMinor: 0,
});

/** The whole of June, as the "this month" period produces. */
const wholeMonth = Array.from({ length: 30 }, (_, i) => ({
  date: `2025-06-${String(i + 1).padStart(2, "0")}`,
  balanceMinor: 100_00,
}));

function isStrictlyIncreasing(dates: string[]): boolean {
  return dates.every((date, i) => i === 0 || date > dates[i - 1]!);
}

describe("buildTrendData", () => {
  it("keeps the x-axis strictly increasing when the period runs past today", () => {
    const data = buildTrendData(wholeMonth, projection, today);
    expect(isStrictlyIncreasing(data.map((d) => d.date))).toBe(true);
  });

  it("drops future days of the period rather than plotting them twice", () => {
    const data = buildTrendData(wholeMonth, projection, today);
    const dates = data.map((d) => d.date);
    expect(new Set(dates).size).toBe(dates.length);
    // 10 actual days + 20 projected days
    expect(data.filter((d) => d.actual !== null)).toHaveLength(10);
    expect(data.filter((d) => d.projected != null)).toHaveLength(21); // incl. today
  });

  it("joins the two series at today so the dashed line has no gap", () => {
    const data = buildTrendData(wholeMonth, projection, today);
    const todayPoint = data.find((d) => d.date === today)!;
    expect(todayPoint.actual).toBe(100_00);
    expect(todayPoint.projected).toBe(100_00);
  });

  it("lands on the projected balance at the end of the month", () => {
    const data = buildTrendData(wholeMonth, projection, today);
    const last = data[data.length - 1]!;
    expect(last.date).toBe("2025-06-30");
    expect(last.projected).toBe(projection.projectedBalanceMinor);
  });

  it("returns history only when there is no forecast", () => {
    const data = buildTrendData(wholeMonth, null, today);
    expect(data).toHaveLength(10);
    expect(data.every((d) => d.projected == null || d.date === today)).toBe(true);
  });

  it("anchors the projection when the period ended before today", () => {
    const past = [
      { date: "2025-05-01", balanceMinor: 50_00 },
      { date: "2025-05-31", balanceMinor: 80_00 },
    ];
    const data = buildTrendData(past, projection, today);
    expect(isStrictlyIncreasing(data.map((d) => d.date))).toBe(true);
    const anchor = data.find((d) => d.date === today)!;
    expect(anchor.projected).toBe(80_00);
  });

  it("handles an empty history", () => {
    const data = buildTrendData([], projection, today);
    expect(isStrictlyIncreasing(data.map((d) => d.date))).toBe(true);
    expect(data[0]!.date).toBe(today);
  });
});
