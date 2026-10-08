/**
 * Recurrence maths, kept pure so every edge case is testable without a
 * database: short months, leap days, skipped periods, interval counts.
 *
 * The occurrence series is defined as a function of an index `k` anchored on
 * `startDate`, never by repeatedly advancing the previous date. That matters
 * for monthly rules: stepping Jan 31 -> Feb 28 -> Mar 28 would drift, while
 * `month(start) + k * interval` with the day clamped per month gives
 * Jan 31, Feb 28, Mar 31 as intended.
 */

import {
  addDaysISO,
  assertISO,
  lastDayOfMonth,
  makeISO,
  splitISO,
  weekdayISO,
  type ISODate,
} from "./dates";

export type Frequency = "daily" | "weekly" | "monthly" | "yearly";

export interface RecurrenceSpec {
  frequency: Frequency;
  /** Every N periods; must be >= 1. */
  intervalCount: number;
  startDate: ISODate;
  endDate?: ISODate | null;
  /** 1-31 for monthly/yearly. A value past the month's end clamps to its last day. */
  dayOfMonth?: number | null;
  /** 0 = Sunday .. 6 = Saturday, weekly rules only. */
  weekday?: number | null;
  /** 1-12, yearly rules only. */
  monthOfYear?: number | null;
}

const MAX_STEPS = 10_000;

/** The k-th occurrence of the series (k >= 0), ignoring `endDate`. */
export function occurrenceAt(spec: RecurrenceSpec, k: number): ISODate {
  const interval = Math.max(1, Math.trunc(spec.intervalCount));
  const start = splitISO(assertISO(spec.startDate));

  switch (spec.frequency) {
    case "daily":
      return addDaysISO(spec.startDate, k * interval);

    case "weekly": {
      const anchor = weeklyAnchor(spec);
      return addDaysISO(anchor, k * interval * 7);
    }

    case "monthly": {
      const day = spec.dayOfMonth ?? start.day;
      const total = start.year * 12 + (start.month - 1) + k * interval;
      const year = Math.floor(total / 12);
      const month = (total % 12) + 1;
      return makeISO(year, month, Math.min(day, lastDayOfMonth(year, month)));
    }

    case "yearly": {
      const month = spec.monthOfYear ?? start.month;
      const day = spec.dayOfMonth ?? start.day;
      const year = start.year + k * interval;
      return makeISO(year, month, Math.min(day, lastDayOfMonth(year, month)));
    }
  }
}

/** First date on or after `startDate` that falls on the rule's weekday. */
function weeklyAnchor(spec: RecurrenceSpec): ISODate {
  if (spec.weekday === null || spec.weekday === undefined) return spec.startDate;
  const startWeekday = weekdayISO(spec.startDate);
  const shift = (((spec.weekday - startWeekday) % 7) + 7) % 7;
  return addDaysISO(spec.startDate, shift);
}

/**
 * First occurrence on or after `from`, or null once the series has ended.
 * `from` is inclusive, so passing a due date returns that same date.
 */
export function nextOccurrence(spec: RecurrenceSpec, from: ISODate): ISODate | null {
  const interval = Math.max(1, Math.trunc(spec.intervalCount));
  let k = Math.max(0, estimateIndex(spec, from, interval));

  // Walk forward to the first occurrence at or past `from`...
  let steps = 0;
  while (occurrenceAt(spec, k) < from) {
    k += 1;
    if ((steps += 1) > MAX_STEPS) return null;
  }
  // ...then back, so an over-estimate still yields the *first* match.
  while (k > 0 && occurrenceAt(spec, k - 1) >= from) k -= 1;

  const result = occurrenceAt(spec, k);
  if (spec.endDate && result > spec.endDate) return null;
  return result;
}

function estimateIndex(spec: RecurrenceSpec, from: ISODate, interval: number): number {
  const start = splitISO(spec.startDate);
  const target = splitISO(from);

  switch (spec.frequency) {
    case "daily": {
      const days = daysApart(spec.startDate, from);
      return Math.ceil(days / interval);
    }
    case "weekly": {
      const days = daysApart(weeklyAnchor(spec), from);
      return Math.ceil(days / (interval * 7));
    }
    case "monthly": {
      const months =
        (target.year * 12 + target.month) - (start.year * 12 + start.month);
      return Math.floor(months / interval);
    }
    case "yearly":
      return Math.floor((target.year - start.year) / interval);
  }
}

function daysApart(from: ISODate, to: ISODate): number {
  const a = splitISO(from);
  const b = splitISO(to);
  return Math.round(
    (Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86_400_000,
  );
}

/**
 * Every occurrence in [from, to], capped at `limit`. Used both to catch up
 * missed postings and to preview upcoming payments on the dashboard.
 */
export function occurrencesBetween(
  spec: RecurrenceSpec,
  from: ISODate,
  to: ISODate,
  limit = 500,
): ISODate[] {
  const out: ISODate[] = [];
  let cursor: ISODate | null = nextOccurrence(spec, from);
  while (cursor && cursor <= to && out.length < limit) {
    out.push(cursor);
    cursor = nextOccurrence(spec, addDaysISO(cursor, 1));
  }
  return out;
}

/** Occurrence strictly after `date`, i.e. the value to store in `next_run_at`. */
export function advanceAfter(spec: RecurrenceSpec, date: ISODate): ISODate | null {
  return nextOccurrence(spec, addDaysISO(date, 1));
}

export function describeRecurrence(spec: RecurrenceSpec): string {
  const n = Math.max(1, Math.trunc(spec.intervalCount));
  const every = n === 1 ? "" : `кажні ${n} `;
  switch (spec.frequency) {
    case "daily":
      return n === 1 ? "щодня" : `${every}дні`;
    case "weekly": {
      const names = ["неділі", "понеділка", "вівторка", "середи", "четверга", "п’ятниці", "суботи"];
      const day = spec.weekday === null || spec.weekday === undefined ? "" : ` у ${names[spec.weekday]}`;
      return (n === 1 ? "щотижня" : `${every}тижні`) + day;
    }
    case "monthly": {
      const day = spec.dayOfMonth ?? splitISO(spec.startDate).day;
      const dayText = day >= 31 ? "в останній день місяця" : `${day}-го числа`;
      return `${n === 1 ? "щомісяця" : `${every}місяці`} ${dayText}`;
    }
    case "yearly":
      return n === 1 ? "щороку" : `${every}роки`;
  }
}
