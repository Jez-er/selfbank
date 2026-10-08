import {
  addDaysISO,
  addMonthsISO,
  endOfMonthISO,
  formatMonthUk,
  startOfMonthISO,
  todayISO,
  type ISODate,
} from "./dates";

export type PeriodPresetId = "month" | "prev-month" | "quarter" | "year" | "all" | "custom";

export interface ResolvedPeriod {
  id: PeriodPresetId;
  from: ISODate;
  to: ISODate;
  label: string;
  /** Equal-length window immediately before `from`, for "vs previous" deltas. */
  previous: { from: ISODate; to: ISODate };
}

export const PERIOD_PRESETS: Array<{ id: PeriodPresetId; label: string }> = [
  { id: "month", label: "Цей місяць" },
  { id: "prev-month", label: "Минулий місяць" },
  { id: "quarter", label: "3 місяці" },
  { id: "year", label: "Рік" },
  { id: "all", label: "Весь час" },
];

const EARLIEST = "1970-01-01";

/**
 * Turns URL search params into a date range. Keeping the period in the URL
 * means a filtered dashboard can be bookmarked and shared.
 */
export function resolvePeriod(
  params: { period?: string; from?: string; to?: string },
  earliest: ISODate | null = null,
): ResolvedPeriod {
  const today = todayISO();
  const id = (params.period ?? "month") as PeriodPresetId;

  if (id === "custom" && params.from && params.to) {
    const from = params.from <= params.to ? params.from : params.to;
    const to = params.from <= params.to ? params.to : params.from;
    return withPrevious("custom", from, to, `${from} — ${to}`);
  }

  switch (id) {
    case "prev-month": {
      const anchor = addMonthsISO(startOfMonthISO(today), -1);
      return withPrevious(
        id,
        anchor,
        endOfMonthISO(anchor),
        formatMonthUk(anchor.slice(0, 7)),
      );
    }
    case "quarter": {
      const from = startOfMonthISO(addMonthsISO(today, -2));
      return withPrevious(id, from, today, "Останні 3 місяці");
    }
    case "year": {
      const from = startOfMonthISO(addMonthsISO(today, -11));
      return withPrevious(id, from, today, "Останні 12 місяців");
    }
    case "all": {
      const from = earliest ?? startOfMonthISO(today);
      return withPrevious(id, from, today, "Весь час");
    }
    case "month":
    default: {
      const from = startOfMonthISO(today);
      return withPrevious("month", from, endOfMonthISO(today), formatMonthUk(from.slice(0, 7)));
    }
  }
}

function withPrevious(
  id: PeriodPresetId,
  from: ISODate,
  to: ISODate,
  label: string,
): ResolvedPeriod {
  const lengthDays = Math.max(
    1,
    Math.round(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000,
    ) + 1,
  );
  const prevTo = addDaysISO(from, -1);
  const prevFrom = addDaysISO(prevTo, -(lengthDays - 1));
  return {
    id,
    from,
    to,
    label,
    previous: { from: prevFrom < EARLIEST ? EARLIEST : prevFrom, to: prevTo },
  };
}

/** Builds a URL that keeps existing params and swaps the period. */
export function periodHref(
  basePath: string,
  periodId: PeriodPresetId,
  extra: Record<string, string | undefined> = {},
): string {
  const params = new URLSearchParams();
  if (periodId !== "month") params.set("period", periodId);
  for (const [key, value] of Object.entries(extra)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `${basePath}?${query}` : basePath;
}
