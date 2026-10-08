/**
 * Money handling. Every amount in this app is an integer number of minor
 * units; floats only ever appear inside a single expression and are rounded
 * back to an integer before they leave this module.
 */

export type CurrencyCode = string;

export interface CurrencyInfo {
  code: CurrencyCode;
  decimals: number;
  symbol: string;
  name: string;
}

export const CURRENCIES: Record<string, CurrencyInfo> = {
  UAH: { code: "UAH", decimals: 2, symbol: "₴", name: "Гривня" },
  USD: { code: "USD", decimals: 2, symbol: "$", name: "Долар США" },
  EUR: { code: "EUR", decimals: 2, symbol: "€", name: "Євро" },
  GBP: { code: "GBP", decimals: 2, symbol: "£", name: "Фунт стерлінгів" },
  PLN: { code: "PLN", decimals: 2, symbol: "zł", name: "Злотий" },
  CHF: { code: "CHF", decimals: 2, symbol: "Fr", name: "Франк" },
  CZK: { code: "CZK", decimals: 2, symbol: "Kč", name: "Крона" },
  JPY: { code: "JPY", decimals: 0, symbol: "¥", name: "Єна" },
  BTC: { code: "BTC", decimals: 8, symbol: "₿", name: "Bitcoin" },
  USDT: { code: "USDT", decimals: 2, symbol: "₮", name: "Tether" },
};

export const CURRENCY_CODES = Object.keys(CURRENCIES);

const DEFAULT_DECIMALS = 2;

export function currencyInfo(code: CurrencyCode): CurrencyInfo {
  return (
    CURRENCIES[code.toUpperCase()] ?? {
      code: code.toUpperCase(),
      decimals: DEFAULT_DECIMALS,
      symbol: code.toUpperCase(),
      name: code.toUpperCase(),
    }
  );
}

export function decimalsFor(code: CurrencyCode): number {
  return currencyInfo(code).decimals;
}

export function scaleFor(code: CurrencyCode): number {
  return 10 ** decimalsFor(code);
}

/** Half-up away from zero, so -2.5 -> -3 and 2.5 -> 3. */
export function roundHalfUp(value: number): number {
  if (!Number.isFinite(value)) throw new MoneyError("Результат не є скінченним числом");
  // Nudge by an epsilon proportional to the magnitude so values that are
  // mathematically x.5 but stored as x.4999999999 still round up.
  const eps = Math.abs(value) * Number.EPSILON * 8;
  return value < 0 ? -Math.round(-value + eps) : Math.round(value + eps);
}

export class MoneyError extends Error {}

const INVALID_AMOUNT = "Невірний формат суми";

export function toMinor(major: number, code: CurrencyCode): number {
  return roundHalfUp(major * scaleFor(code));
}

export function toMajor(minor: number, code: CurrencyCode): number {
  return minor / scaleFor(code);
}

const GROUP_SEPARATOR = " "; // narrow no-break space
const DECIMAL_SEPARATOR = ",";

export interface FormatOptions {
  /** Append the currency symbol. Default true. */
  symbol?: boolean;
  /** Always show a leading + or -. Default false. */
  signed?: boolean;
  /** Drop the fractional part. Default false. */
  noFraction?: boolean;
  /** Render 12 500 000 as "12,5 млн". Default false. */
  compact?: boolean;
}

/** Deterministic formatter - no Intl, so output never shifts with the host locale/ICU. */
export function formatMinor(
  minor: number,
  code: CurrencyCode,
  options: FormatOptions = {},
): string {
  const { symbol = true, signed = false, noFraction = false, compact = false } = options;
  const info = currencyInfo(code);
  const negative = minor < 0;
  const abs = Math.abs(minor);

  let body: string;
  if (compact) {
    body = formatCompact(abs, info.decimals);
  } else {
    const scale = 10 ** info.decimals;
    const whole = Math.floor(abs / scale);
    const fraction = abs % scale;
    body = groupDigits(String(whole));
    if (!noFraction && info.decimals > 0) {
      body += DECIMAL_SEPARATOR + String(fraction).padStart(info.decimals, "0");
    }
  }

  const sign = negative ? "−" : signed ? "+" : "";
  return symbol ? `${sign}${body} ${info.symbol}` : `${sign}${body}`;
}

const COMPACT_STEPS = [
  { limit: 1e12, suffix: "трлн" },
  { limit: 1e9, suffix: "млрд" },
  { limit: 1e6, suffix: "млн" },
  { limit: 1e3, suffix: "тис" },
];

function formatCompact(absMinor: number, decimals: number): string {
  const major = absMinor / 10 ** decimals;
  for (const step of COMPACT_STEPS) {
    if (major >= step.limit) {
      const scaled = major / step.limit;
      const text =
        scaled >= 100 ? String(Math.round(scaled)) : scaled.toFixed(1).replace(".", ",");
      return `${text.replace(/,0$/, "")} ${step.suffix}`;
    }
  }
  return groupDigits(String(Math.round(major)));
}

function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, GROUP_SEPARATOR);
}

/**
 * Parse user input into minor units. Accepts plain numbers and simple
 * arithmetic so the amount field doubles as a calculator: "1200+350", "450*3".
 *
 * Separator rules: spaces (incl. NBSP) and apostrophes are thousands
 * separators and are discarded. Both "." and "," act as the decimal
 * separator; when a number contains several, only the last one is decimal and
 * earlier ones are treated as grouping. So "1,5" is one and a half, and
 * thousands should be written with a space ("1 500") - the Ukrainian
 * convention - or grouped ("1,500.00").
 */
export function parseAmount(input: string, code: CurrencyCode): number {
  const cleaned = input.replace(/[\s   ']/g, "").trim();
  if (cleaned.length === 0) throw new MoneyError("Сума не вказана");
  if (!/^[0-9+\-*/().,]+$/.test(cleaned)) {
    throw new MoneyError("Сума містить недопустимі символи");
  }
  const tokens = tokenize(cleaned, code);
  const value = parseExpression(tokens, code);
  if (tokens.length > 0) throw new MoneyError("Невірний вираз суми");
  return value;
}

/** True when the input parses; used to validate without throwing. */
export function tryParseAmount(input: string, code: CurrencyCode): number | null {
  try {
    return parseAmount(input, code);
  } catch {
    return null;
  }
}

type Token = { kind: "number"; minor: number } | { kind: "op"; op: string };

function tokenize(text: string, code: CurrencyCode): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if ("+-*/()".includes(ch)) {
      tokens.push({ kind: "op", op: ch });
      i += 1;
      continue;
    }
    let j = i;
    while (j < text.length && /[0-9.,]/.test(text[j]!)) j += 1;
    tokens.push({ kind: "number", minor: literalToMinor(text.slice(i, j), code) });
    i = j;
  }
  return tokens;
}

const GROUPED_WHOLE = /^\d{1,3}([.,]\d{3})*$/;

/**
 * Turn a single numeric literal into minor units.
 *
 * Separators are resolved before anything else: when a literal has two or
 * more identical separators that each introduce an exact group of three
 * digits ("1,200,500") they are all thousands separators. Otherwise the last
 * separator is the decimal point and everything before it must be valid
 * grouping, so "12..5" is rejected rather than silently read as 12.5.
 */
function literalToMinor(literal: string, code: CurrencyCode): number {
  if (!/^[0-9.,]+$/.test(literal)) throw new MoneyError(INVALID_AMOUNT);

  const separators = [...literal.matchAll(/[.,]/g)].map((m) => m.index);
  let whole: string;
  let fraction: string;

  if (separators.length === 0) {
    whole = literal;
    fraction = "";
  } else if (allThousandsSeparators(literal, separators)) {
    whole = literal.replace(/[.,]/g, "");
    fraction = "";
  } else {
    const lastSep = separators[separators.length - 1]!;
    whole = literal.slice(0, lastSep);
    fraction = literal.slice(lastSep + 1);
    if (fraction === "" || !/^\d+$/.test(fraction)) throw new MoneyError(INVALID_AMOUNT);
    // Grouping is only checked when the whole part actually carries a
    // separator; "1200.50" has a plain whole part and is perfectly fine.
    if (/[.,]/.test(whole) && !GROUPED_WHOLE.test(whole)) throw new MoneyError(INVALID_AMOUNT);
    whole = whole.replace(/[.,]/g, "");
  }

  if (whole === "" && fraction === "") throw new MoneyError(INVALID_AMOUNT);
  if (whole !== "" && !/^\d+$/.test(whole)) throw new MoneyError(INVALID_AMOUNT);

  const decimals = decimalsFor(code);
  // The minor value is assembled from digit strings, never by multiplying a
  // float, so "0.07" can not land on 6.999999.
  const padded = (fraction + "0".repeat(decimals)).slice(0, decimals);
  const dropped = fraction.slice(decimals);
  const wholeMinor = (whole === "" ? 0 : Number(whole)) * 10 ** decimals;
  let minor = wholeMinor + (padded === "" ? 0 : Number(padded));
  // Round away precision the currency cannot hold ("1.005" in UAH -> 1.01).
  if (dropped.length > 0 && Number(dropped[0]) >= 5) minor += 1;
  if (!Number.isSafeInteger(minor)) throw new MoneyError("Сума занадто велика");
  return minor;
}

function allThousandsSeparators(literal: string, separators: number[]): boolean {
  if (separators.length < 2) return false;
  const first = literal[separators[0]!];
  if (!separators.every((i) => literal[i] === first)) return false;
  // Every separator must be followed by exactly three digits.
  return separators.every((i, n) => {
    const nextSep = separators[n + 1] ?? literal.length;
    return nextSep - i - 1 === 3;
  });
}

/** expression := term (('+' | '-') term)* */
function parseExpression(tokens: Token[], code: CurrencyCode): number {
  let value = parseTerm(tokens, code);
  while (tokens[0]?.kind === "op" && (tokens[0].op === "+" || tokens[0].op === "-")) {
    const { op } = tokens.shift() as { kind: "op"; op: string };
    const rhs = parseTerm(tokens, code);
    value = op === "+" ? value + rhs : value - rhs;
  }
  return value;
}

/** term := factor (('*' | '/') factor)* - the right operand is a plain scalar. */
function parseTerm(tokens: Token[], code: CurrencyCode): number {
  let value = parseFactor(tokens, code);
  while (tokens[0]?.kind === "op" && (tokens[0].op === "*" || tokens[0].op === "/")) {
    const { op } = tokens.shift() as { kind: "op"; op: string };
    const scalarMinor = parseFactor(tokens, code);
    const scalar = toMajor(scalarMinor, code);
    if (op === "/" && scalar === 0) throw new MoneyError("Ділення на нуль");
    value = roundHalfUp(op === "*" ? value * scalar : value / scalar);
  }
  return value;
}

/** factor := '-'? ( number | '(' expression ')' ) */
function parseFactor(tokens: Token[], code: CurrencyCode): number {
  const head = tokens[0];
  if (!head) throw new MoneyError("Незавершений вираз суми");
  if (head.kind === "op") {
    if (head.op === "-") {
      tokens.shift();
      return -parseFactor(tokens, code);
    }
    if (head.op === "+") {
      tokens.shift();
      return parseFactor(tokens, code);
    }
    if (head.op === "(") {
      tokens.shift();
      const inner = parseExpression(tokens, code);
      const close = tokens.shift();
      if (!close || close.kind !== "op" || close.op !== ")") {
        throw new MoneyError("Незакрита дужка");
      }
      return inner;
    }
    throw new MoneyError("Невірний вираз суми");
  }
  tokens.shift();
  return head.minor;
}

/** Input value for a number field, e.g. 123456 -> "1234.56". */
export function minorToInputValue(minor: number, code: CurrencyCode): string {
  const decimals = decimalsFor(code);
  if (decimals === 0) return String(minor);
  const negative = minor < 0;
  const abs = Math.abs(minor);
  const scale = 10 ** decimals;
  const text = `${Math.floor(abs / scale)}.${String(abs % scale).padStart(decimals, "0")}`;
  return negative ? `-${text}` : text;
}
