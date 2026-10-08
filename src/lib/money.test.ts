import { describe, expect, it } from "vitest";
import {
  MoneyError,
  formatMinor,
  minorToInputValue,
  parseAmount,
  roundHalfUp,
  toMajor,
  toMinor,
} from "./money";

describe("parseAmount", () => {
  it("parses plain decimals", () => {
    expect(parseAmount("1200", "UAH")).toBe(120000);
    expect(parseAmount("1200.50", "UAH")).toBe(120050);
    expect(parseAmount("0.07", "UAH")).toBe(7);
    expect(parseAmount("5", "UAH")).toBe(500);
  });

  it("treats spaces and apostrophes as thousands separators", () => {
    expect(parseAmount("1 200,50", "UAH")).toBe(120050);
    expect(parseAmount("1 200,50", "UAH")).toBe(120050);
    expect(parseAmount("1'200.50", "UAH")).toBe(120050);
    expect(parseAmount("12 345 678", "UAH")).toBe(1234567800);
  });

  it("uses the last separator as the decimal point", () => {
    expect(parseAmount("1,200.50", "UAH")).toBe(120050);
    expect(parseAmount("1.200,50", "UAH")).toBe(120050);
    // A single comma is decimal, per the documented rule.
    expect(parseAmount("1,5", "UAH")).toBe(150);
  });

  it("reads repeated identical separators as grouping", () => {
    expect(parseAmount("1,200,500", "UAH")).toBe(120050000);
    expect(parseAmount("1.200.500", "UAH")).toBe(120050000);
    expect(parseAmount("1 200 500", "UAH")).toBe(120050000);
  });

  it("respects per-currency decimals", () => {
    expect(parseAmount("1200.50", "JPY")).toBe(1201); // 0 decimals, rounds
    expect(parseAmount("0.00000001", "BTC")).toBe(1); // 8 decimals
    expect(parseAmount("1.5", "BTC")).toBe(150000000);
  });

  it("rounds precision the currency cannot hold", () => {
    expect(parseAmount("1.005", "UAH")).toBe(101);
    expect(parseAmount("1.004", "UAH")).toBe(100);
    expect(parseAmount("2.999", "UAH")).toBe(300);
  });

  it("evaluates calculator expressions exactly", () => {
    expect(parseAmount("1200+350", "UAH")).toBe(155000);
    expect(parseAmount("1200-350.25", "UAH")).toBe(84975);
    expect(parseAmount("450*3", "UAH")).toBe(135000);
    expect(parseAmount("900/2", "UAH")).toBe(45000);
    expect(parseAmount("100+200*3", "UAH")).toBe(70000); // precedence
    expect(parseAmount("(100+200)*3", "UAH")).toBe(90000);
    expect(parseAmount("19.99*3", "UAH")).toBe(5997);
  });

  it("accumulates many additions without float drift", () => {
    const expression = Array.from({ length: 300 }, () => "0.01").join("+");
    expect(parseAmount(expression, "UAH")).toBe(300);
  });

  it("rejects junk", () => {
    expect(() => parseAmount("", "UAH")).toThrow(MoneyError);
    expect(() => parseAmount("abc", "UAH")).toThrow(MoneyError);
    expect(() => parseAmount("12..5", "UAH")).toThrow(MoneyError);
    expect(() => parseAmount("1+", "UAH")).toThrow(MoneyError);
    expect(() => parseAmount("1)", "UAH")).toThrow(MoneyError);
    expect(() => parseAmount("100/0", "UAH")).toThrow(MoneyError);
  });
});

describe("formatMinor", () => {
  const plain = (s: string) => s.replace(/[  ]/g, " ");

  it("groups thousands and uses a decimal comma", () => {
    expect(plain(formatMinor(1234567, "UAH"))).toBe("12 345,67 ₴");
    expect(plain(formatMinor(500, "UAH"))).toBe("5,00 ₴");
    expect(plain(formatMinor(0, "UAH"))).toBe("0,00 ₴");
  });

  it("renders negatives with a true minus sign", () => {
    expect(plain(formatMinor(-120050, "UAH"))).toBe("−1 200,50 ₴");
  });

  it("can show an explicit plus", () => {
    expect(plain(formatMinor(500, "UAH", { signed: true }))).toBe("+5,00 ₴");
    expect(plain(formatMinor(-500, "UAH", { signed: true }))).toBe("−5,00 ₴");
  });

  it("honours zero-decimal and high-precision currencies", () => {
    expect(plain(formatMinor(1201, "JPY"))).toBe("1 201 ¥");
    expect(plain(formatMinor(150000000, "BTC"))).toBe("1,50000000 ₿");
  });

  it("supports symbol-less and compact output", () => {
    expect(plain(formatMinor(1234567, "UAH", { symbol: false }))).toBe("12 345,67");
    expect(plain(formatMinor(1250000000, "UAH", { compact: true }))).toBe("12,5 млн ₴");
    expect(plain(formatMinor(150000, "UAH", { compact: true }))).toBe("1,5 тис ₴");
    expect(plain(formatMinor(1234567, "UAH", { noFraction: true }))).toBe("12 345 ₴");
  });
});

describe("conversions", () => {
  it("round-trips minor and major units", () => {
    expect(toMinor(1200.5, "UAH")).toBe(120050);
    expect(toMajor(120050, "UAH")).toBe(1200.5);
    expect(toMinor(0.1 + 0.2, "UAH")).toBe(30); // the classic float case
  });

  it("rounds half away from zero", () => {
    expect(roundHalfUp(2.5)).toBe(3);
    expect(roundHalfUp(-2.5)).toBe(-3);
    expect(roundHalfUp(2.4)).toBe(2);
    expect(roundHalfUp(1.005 * 100)).toBe(101); // 100.49999999999999 in binary
  });

  it("builds editable input values", () => {
    expect(minorToInputValue(120050, "UAH")).toBe("1200.50");
    expect(minorToInputValue(7, "UAH")).toBe("0.07");
    expect(minorToInputValue(1201, "JPY")).toBe("1201");
  });
});
