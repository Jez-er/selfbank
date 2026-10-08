import { describe, expect, it } from "vitest";
import { clamp, pluralUk, share } from "./utils";

describe("pluralUk", () => {
  const ops = (n: number) => `${n} ${pluralUk(n, "операція", "операції", "операцій")}`;

  it("uses the singular for numbers ending in 1", () => {
    expect(ops(1)).toBe("1 операція");
    expect(ops(21)).toBe("21 операція");
    expect(ops(101)).toBe("101 операція");
  });

  it("uses the few form for 2-4", () => {
    expect(ops(2)).toBe("2 операції");
    expect(ops(4)).toBe("4 операції");
    expect(ops(22)).toBe("22 операції");
  });

  it("uses the many form for 5-9 and 0", () => {
    expect(ops(0)).toBe("0 операцій");
    expect(ops(5)).toBe("5 операцій");
    expect(ops(9)).toBe("9 операцій");
  });

  it("uses the many form for the teens, which are the exception", () => {
    expect(ops(11)).toBe("11 операцій");
    expect(ops(12)).toBe("12 операцій");
    expect(ops(14)).toBe("14 операцій");
    expect(ops(111)).toBe("111 операцій");
  });

  it("ignores the sign", () => {
    expect(pluralUk(-2, "день", "дні", "днів")).toBe("дні");
  });
});

describe("share", () => {
  it("returns a percentage", () => {
    expect(share(25, 100)).toBe(25);
    expect(share(1, 3)).toBeCloseTo(33.333, 3);
  });

  it("returns zero rather than dividing by zero", () => {
    expect(share(5, 0)).toBe(0);
  });
});

describe("clamp", () => {
  it("bounds a value on both sides", () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(99, 0, 10)).toBe(10);
  });
});
