import { describe, expect, it } from "vitest";
import {
  MissingRateError,
  convertMinor,
  crossRate,
  resolveRate,
  suggestTransferAmount,
  type RateRow,
} from "./fx";

const rates: RateRow[] = [
  { quote: "USD", rateToBase: 38.0, asOf: "2025-01-01" },
  { quote: "USD", rateToBase: 41.5, asOf: "2025-06-01" },
  { quote: "USD", rateToBase: 42.0, asOf: "2025-09-01" },
  { quote: "EUR", rateToBase: 45.0, asOf: "2025-06-01" },
];

describe("resolveRate", () => {
  it("returns 1 for the base currency without needing a row", () => {
    expect(resolveRate([], "UAH", "UAH", "2025-07-01")).toEqual({
      rate: 1,
      stale: false,
      asOf: null,
    });
  });

  it("picks the newest rate on or before the date", () => {
    expect(resolveRate(rates, "USD", "UAH", "2025-07-15")).toEqual({
      rate: 41.5,
      stale: false,
      asOf: "2025-06-01",
    });
    expect(resolveRate(rates, "USD", "UAH", "2025-06-01")).toMatchObject({ rate: 41.5 });
    expect(resolveRate(rates, "USD", "UAH", "2025-12-31")).toMatchObject({ rate: 42.0 });
  });

  it("flags a fallback when the date predates every rate", () => {
    expect(resolveRate(rates, "USD", "UAH", "2024-05-01")).toEqual({
      rate: 38.0,
      stale: true,
      asOf: "2025-01-01",
    });
  });

  it("throws loudly rather than defaulting to zero or one", () => {
    expect(() => resolveRate(rates, "PLN", "UAH", "2025-07-01")).toThrow(MissingRateError);
    try {
      resolveRate(rates, "PLN", "UAH", "2025-07-01");
    } catch (error) {
      expect((error as MissingRateError).quote).toBe("PLN");
    }
  });
});

describe("convertMinor", () => {
  it("converts between same-decimal currencies", () => {
    // 100.00 USD at 41.5 = 4150.00 UAH
    expect(convertMinor(10000, "USD", "UAH", 41.5)).toBe(415000);
  });

  it("rounds to the target currency's precision", () => {
    expect(convertMinor(333, "USD", "UAH", 41.5)).toBe(13820); // 3.33 * 41.5 = 138.195
    expect(convertMinor(1, "USD", "UAH", 41.5)).toBe(42); // 0.01 * 41.5 = 0.415
  });

  it("handles differing decimal counts in both directions", () => {
    // 1.00 USD at 0.000015 BTC/USD -> 0.00001500 BTC
    expect(convertMinor(100, "USD", "BTC", 0.000015)).toBe(1500);
    // 1.00000000 BTC at 2_500_000 UAH -> 2 500 000.00 UAH
    expect(convertMinor(100000000, "BTC", "UAH", 2_500_000)).toBe(250_000_000);
    // 100.00 USD at 41.5 into JPY-like 0-decimal output
    expect(convertMinor(10000, "USD", "JPY", 15.3)).toBe(1530);
  });

  it("is a no-op for an identical currency at rate 1", () => {
    expect(convertMinor(12345, "UAH", "UAH", 1)).toBe(12345);
  });
});

describe("cross-currency transfers", () => {
  it("routes the rate through the base currency", () => {
    expect(crossRate(41.5, 45.0)).toBeCloseTo(0.9222, 4);
  });

  it("suggests the credited amount", () => {
    // 1000.00 UAH -> USD at 41.5 UAH per USD
    const result = suggestTransferAmount(100000, "UAH", "USD", rates, "UAH", "2025-07-01");
    expect(result.toAmountMinor).toBe(2410); // 24.10 USD
    expect(result.stale).toBe(false);
  });

  it("converts between two non-base currencies", () => {
    // 100.00 USD -> EUR: 100 * 41.5 / 45 = 92.22 EUR
    const result = suggestTransferAmount(10000, "USD", "EUR", rates, "UAH", "2025-07-01");
    expect(result.toAmountMinor).toBe(9222);
  });

  it("propagates the stale flag", () => {
    const result = suggestTransferAmount(10000, "USD", "UAH", rates, "UAH", "2024-01-01");
    expect(result.stale).toBe(true);
  });

  it("is an identity for same-currency transfers", () => {
    expect(suggestTransferAmount(10000, "USD", "USD", [], "UAH", "2025-07-01")).toEqual({
      toAmountMinor: 10000,
      rate: 1,
      stale: false,
    });
  });
});
