/**
 * Calendar helpers over ISO `YYYY-MM-DD` strings.
 *
 * All arithmetic goes through Date.UTC rather than local Date objects: a
 * "day" here is a calendar day, and using local time would shift dates by one
 * across DST boundaries and for anyone running the container in another zone.
 */

export type ISODate = string;

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string" || !ISO_RE.test(value)) return false;
  const { year, month, day } = splitISO(value);
  return month >= 1 && month <= 12 && day >= 1 && day <= lastDayOfMonth(year, month);
}

export function assertISO(value: string): ISODate {
  if (!isISODate(value)) throw new Error(`Невірна дата: ${value}`);
  return value;
}

export function splitISO(iso: ISODate): { year: number; month: number; day: number } {
  return {
    year: Number(iso.slice(0, 4)),
    month: Number(iso.slice(5, 7)),
    day: Number(iso.slice(8, 10)),
  };
}

export function makeISO(year: number, month: number, day: number): ISODate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function todayISO(): ISODate {
  const now = new Date();
  return makeISO(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

export function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function addDaysISO(iso: ISODate, days: number): ISODate {
  const { year, month, day } = splitISO(iso);
  const d = new Date(Date.UTC(year, month - 1, day + days));
  return makeISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Adds months, clamping the day to the target month's length (Jan 31 + 1m = Feb 28). */
export function addMonthsISO(iso: ISODate, months: number): ISODate {
  const { year, month, day } = splitISO(iso);
  const total = (year * 12 + (month - 1)) + months;
  const targetYear = Math.floor(total / 12);
  const targetMonth = (total % 12) + 1;
  return makeISO(targetYear, targetMonth, Math.min(day, lastDayOfMonth(targetYear, targetMonth)));
}

export function addYearsISO(iso: ISODate, years: number): ISODate {
  return addMonthsISO(iso, years * 12);
}

export function startOfMonthISO(iso: ISODate): ISODate {
  const { year, month } = splitISO(iso);
  return makeISO(year, month, 1);
}

export function endOfMonthISO(iso: ISODate): ISODate {
  const { year, month } = splitISO(iso);
  return makeISO(year, month, lastDayOfMonth(year, month));
}

/** `YYYY-MM` bucket key, used by budgets and monthly reports. */
export function monthKey(iso: ISODate): string {
  return iso.slice(0, 7);
}

export function monthKeyToRange(key: string): { from: ISODate; to: ISODate } {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return { from: makeISO(year, month, 1), to: makeISO(year, month, lastDayOfMonth(year, month)) };
}

/** 0 = Sunday .. 6 = Saturday */
export function weekdayISO(iso: ISODate): number {
  const { year, month, day } = splitISO(iso);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function daysBetween(from: ISODate, to: ISODate): number {
  const a = splitISO(from);
  const b = splitISO(to);
  const ms =
    Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day);
  return Math.round(ms / 86_400_000);
}

export function eachDayISO(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let cursor = from; cursor <= to; cursor = addDaysISO(cursor, 1)) out.push(cursor);
  return out;
}

export function eachMonthKey(from: ISODate, to: ISODate): string[] {
  const out: string[] = [];
  let cursor = startOfMonthISO(from);
  const end = startOfMonthISO(to);
  while (cursor <= end) {
    out.push(monthKey(cursor));
    cursor = addMonthsISO(cursor, 1);
  }
  return out;
}

const MONTHS_GENITIVE = [
  "січня",
  "лютого",
  "березня",
  "квітня",
  "травня",
  "червня",
  "липня",
  "серпня",
  "вересня",
  "жовтня",
  "листопада",
  "грудня",
];

const MONTHS_NOMINATIVE = [
  "Січень",
  "Лютий",
  "Березень",
  "Квітень",
  "Травень",
  "Червень",
  "Липень",
  "Серпень",
  "Вересень",
  "Жовтень",
  "Листопад",
  "Грудень",
];

const WEEKDAYS_SHORT = ["нд", "пн", "вт", "ср", "чт", "пт", "сб"];

export function formatDateUk(iso: ISODate, options: { year?: boolean } = {}): string {
  const { year, month, day } = splitISO(iso);
  const showYear = options.year ?? year !== splitISO(todayISO()).year;
  return `${day} ${MONTHS_GENITIVE[month - 1]}${showYear ? ` ${year}` : ""}`;
}

export function formatMonthUk(key: string): string {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  return `${MONTHS_NOMINATIVE[month - 1]} ${year}`;
}

export function formatMonthShort(key: string): string {
  const month = Number(key.slice(5, 7));
  return MONTHS_NOMINATIVE[month - 1]!.slice(0, 3);
}

export function weekdayShortUk(iso: ISODate): string {
  return WEEKDAYS_SHORT[weekdayISO(iso)]!;
}

/** "сьогодні" / "вчора" / a formatted date, for transaction lists. */
export function formatRelativeDayUk(iso: ISODate): string {
  const today = todayISO();
  const diff = daysBetween(iso, today);
  if (diff === 0) return "сьогодні";
  if (diff === 1) return "вчора";
  if (diff === -1) return "завтра";
  return formatDateUk(iso);
}

export const WEEKDAY_NAMES = [
  "Неділя",
  "Понеділок",
  "Вівторок",
  "Середа",
  "Четвер",
  "П’ятниця",
  "Субота",
];
