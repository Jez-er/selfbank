import { describe, expect, it } from "vitest";
import { forecast, forecastPath } from "./forecast";

const base = {
  currentBalanceMinor: 1_000_00, // 1000.00
  today: "2025-06-10" as const,
  horizonEnd: "2025-06-30" as const,
  plannedIncomeMinor: 0,
  plannedExpenseMinor: 0,
  avgDailyDiscretionaryMinor: 0,
};

describe("forecast", () => {
  it("counts only the days after today", () => {
    expect(forecast(base).daysRemaining).toBe(20);
    // Made on the final day, there is nothing left to project.
    expect(forecast({ ...base, today: "2025-06-30" }).daysRemaining).toBe(0);
  });

  it("adds planned income and subtracts planned expenses", () => {
    const result = forecast({
      ...base,
      plannedIncomeMinor: 500_00,
      plannedExpenseMinor: 200_00,
    });
    expect(result.projectedBalanceMinor).toBe(1_300_00);
    expect(result.deltaMinor).toBe(300_00);
  });

  it("projects discretionary spend across the remaining days", () => {
    const result = forecast({ ...base, avgDailyDiscretionaryMinor: 25_00 });
    // 25.00 per day x 20 days = 500.00
    expect(result.components.estimatedDiscretionaryMinor).toBe(500_00);
    expect(result.projectedBalanceMinor).toBe(500_00);
  });

  it("can project a negative balance rather than clamping at zero", () => {
    const result = forecast({ ...base, avgDailyDiscretionaryMinor: 100_00 });
    expect(result.projectedBalanceMinor).toBe(-1_000_00);
  });

  it("exposes every component so the UI can explain the number", () => {
    const result = forecast({
      ...base,
      plannedIncomeMinor: 800_00,
      plannedExpenseMinor: 300_00,
      avgDailyDiscretionaryMinor: 10_00,
    });
    const c = result.components;
    expect(
      c.currentBalanceMinor +
        c.plannedIncomeMinor -
        c.plannedExpenseMinor -
        c.estimatedDiscretionaryMinor,
    ).toBe(result.projectedBalanceMinor);
  });

  it("is deterministic", () => {
    const input = { ...base, plannedIncomeMinor: 123_45, avgDailyDiscretionaryMinor: 7_77 };
    expect(forecast(input)).toEqual(forecast(input));
  });
});

describe("forecastPath", () => {
  it("interpolates to the projected balance and lands exactly on it", () => {
    const result = forecast({ ...base, plannedExpenseMinor: 300_00 });
    const dates = ["2025-06-11", "2025-06-20", "2025-06-30"];
    const path = forecastPath(base.currentBalanceMinor, result, dates);
    expect(path).toHaveLength(3);
    expect(path[2]!.balanceMinor).toBe(result.projectedBalanceMinor);
  });

  it("returns nothing when there are no future dates", () => {
    expect(forecastPath(1000, forecast(base), [])).toEqual([]);
  });
});
