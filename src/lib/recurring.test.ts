import { describe, expect, it } from "vitest";
import {
  advanceAfter,
  nextOccurrence,
  occurrenceAt,
  occurrencesBetween,
  type RecurrenceSpec,
} from "./recurring";

const monthly = (over: Partial<RecurrenceSpec> = {}): RecurrenceSpec => ({
  frequency: "monthly",
  intervalCount: 1,
  startDate: "2025-01-15",
  ...over,
});

describe("daily rules", () => {
  it("steps by the interval", () => {
    const spec: RecurrenceSpec = { frequency: "daily", intervalCount: 1, startDate: "2025-03-01" };
    expect(nextOccurrence(spec, "2025-03-01")).toBe("2025-03-01");
    expect(nextOccurrence(spec, "2025-03-02")).toBe("2025-03-02");
    expect(advanceAfter(spec, "2025-03-05")).toBe("2025-03-06");
  });

  it("honours an interval of N days", () => {
    const spec: RecurrenceSpec = { frequency: "daily", intervalCount: 10, startDate: "2025-03-01" };
    expect(occurrenceAt(spec, 3)).toBe("2025-03-31");
    // 2025-03-05 is not on the series, so the next one is 2025-03-11.
    expect(nextOccurrence(spec, "2025-03-05")).toBe("2025-03-11");
  });

  it("never returns a date before the start", () => {
    const spec: RecurrenceSpec = { frequency: "daily", intervalCount: 1, startDate: "2025-03-01" };
    expect(nextOccurrence(spec, "2024-01-01")).toBe("2025-03-01");
  });
});

describe("weekly rules", () => {
  it("anchors on the requested weekday", () => {
    // 2025-03-01 is a Saturday; weekday 1 = Monday -> 2025-03-03.
    const spec: RecurrenceSpec = {
      frequency: "weekly",
      intervalCount: 1,
      startDate: "2025-03-01",
      weekday: 1,
    };
    expect(nextOccurrence(spec, "2025-03-01")).toBe("2025-03-03");
    expect(advanceAfter(spec, "2025-03-03")).toBe("2025-03-10");
  });

  it("supports fortnightly", () => {
    const spec: RecurrenceSpec = {
      frequency: "weekly",
      intervalCount: 2,
      startDate: "2025-03-03",
      weekday: 1,
    };
    expect(occurrencesBetween(spec, "2025-03-01", "2025-04-01")).toEqual([
      "2025-03-03",
      "2025-03-17",
      "2025-03-31",
    ]);
  });
});

describe("monthly rules", () => {
  it("repeats on the same day each month", () => {
    expect(occurrencesBetween(monthly(), "2025-01-01", "2025-04-30")).toEqual([
      "2025-01-15",
      "2025-02-15",
      "2025-03-15",
      "2025-04-15",
    ]);
  });

  it("clamps the 31st to each month's last day without drifting", () => {
    const spec = monthly({ startDate: "2025-01-31", dayOfMonth: 31 });
    expect(occurrencesBetween(spec, "2025-01-01", "2025-05-31")).toEqual([
      "2025-01-31",
      "2025-02-28", // short month
      "2025-03-31", // back to the 31st: no drift from February
      "2025-04-30",
      "2025-05-31",
    ]);
  });

  it("clamps the 30th in February and recovers afterwards", () => {
    const spec = monthly({ startDate: "2025-01-30", dayOfMonth: 30 });
    expect(occurrencesBetween(spec, "2025-02-01", "2025-03-31")).toEqual([
      "2025-02-28",
      "2025-03-30",
    ]);
  });

  it("handles leap years", () => {
    const spec = monthly({ startDate: "2024-01-31", dayOfMonth: 31 });
    expect(nextOccurrence(spec, "2024-02-01")).toBe("2024-02-29");
    const feb29 = monthly({ startDate: "2024-02-29", dayOfMonth: 29 });
    expect(nextOccurrence(feb29, "2025-02-01")).toBe("2025-02-28");
  });

  it("supports every N months", () => {
    const spec = monthly({ startDate: "2025-01-10", intervalCount: 3 });
    expect(occurrencesBetween(spec, "2025-01-01", "2025-12-31")).toEqual([
      "2025-01-10",
      "2025-04-10",
      "2025-07-10",
      "2025-10-10",
    ]);
    // A date inside a skipped month jumps to the next real occurrence.
    expect(nextOccurrence(spec, "2025-05-01")).toBe("2025-07-10");
  });

  it("crosses the year boundary", () => {
    const spec = monthly({ startDate: "2025-11-20" });
    expect(occurrencesBetween(spec, "2025-11-01", "2026-02-28")).toEqual([
      "2025-11-20",
      "2025-12-20",
      "2026-01-20",
      "2026-02-20",
    ]);
  });
});

describe("yearly rules", () => {
  it("repeats on the same month and day", () => {
    const spec: RecurrenceSpec = {
      frequency: "yearly",
      intervalCount: 1,
      startDate: "2025-06-15",
    };
    expect(advanceAfter(spec, "2025-06-15")).toBe("2026-06-15");
  });

  it("can target a month before the start month", () => {
    const spec: RecurrenceSpec = {
      frequency: "yearly",
      intervalCount: 1,
      startDate: "2025-06-15",
      monthOfYear: 3,
      dayOfMonth: 1,
    };
    // 2025-03-01 is before the start, so the series begins in 2026.
    expect(nextOccurrence(spec, "2025-06-15")).toBe("2026-03-01");
  });
});

describe("end date", () => {
  it("stops the series", () => {
    const spec = monthly({ endDate: "2025-03-31" });
    expect(nextOccurrence(spec, "2025-03-01")).toBe("2025-03-15");
    expect(nextOccurrence(spec, "2025-04-01")).toBeNull();
    expect(advanceAfter(spec, "2025-03-15")).toBeNull();
  });

  it("is respected by range enumeration", () => {
    const spec = monthly({ endDate: "2025-02-28" });
    expect(occurrencesBetween(spec, "2025-01-01", "2025-12-31")).toEqual([
      "2025-01-15",
      "2025-02-15",
    ]);
  });
});

describe("catch-up after downtime", () => {
  it("enumerates every missed occurrence in order", () => {
    // The app was off for five months; all five postings are owed.
    const spec = monthly({ startDate: "2025-01-05" });
    const missed = occurrencesBetween(spec, "2025-01-05", "2025-05-20");
    expect(missed).toEqual([
      "2025-01-05",
      "2025-02-05",
      "2025-03-05",
      "2025-04-05",
      "2025-05-05",
    ]);
  });

  it("advances past a long gap in one call", () => {
    const spec = monthly({ startDate: "2020-01-15" });
    expect(nextOccurrence(spec, "2025-07-20")).toBe("2025-08-15");
  });

  it("is idempotent: advancing from the same posted date is stable", () => {
    const spec = monthly({ startDate: "2025-01-15" });
    const first = advanceAfter(spec, "2025-01-15");
    expect(first).toBe("2025-02-15");
    expect(advanceAfter(spec, "2025-01-15")).toBe(first);
  });
});
