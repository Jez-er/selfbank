"use client";

import Link from "next/link";
import { formatMinor } from "@/lib/money";
import { pluralUk, share } from "@/lib/utils";
import { ChartEmpty } from "./chart-kit";

export interface CategoryDatum {
  categoryId: number | null;
  name: string;
  color: string;
  totalMinor: number;
  count: number;
}

/**
 * Expenses by category as a ranked horizontal bar list.
 *
 * Horizontal because category names are long, and a plain list rather than a
 * pie because comparing arc lengths is the thing readers are worst at. Each
 * bar carries its name and value as direct labels, so the colour is decoration
 * that follows the entity - never the only way to identify a row.
 */
export function CategoryBars({
  data,
  currency,
  limit = 7,
  hrefBase,
}: {
  data: CategoryDatum[];
  currency: string;
  limit?: number;
  /** When set, each row links to the filtered transaction list. */
  hrefBase?: string;
}) {
  if (data.length === 0) return <ChartEmpty message="Витрат за цей період немає" />;

  const total = data.reduce((sum, d) => sum + d.totalMinor, 0);
  const head = data.slice(0, limit);
  const tail = data.slice(limit);

  // The tail folds into one "Other" row rather than growing the palette.
  const rows = [...head];
  if (tail.length > 0) {
    rows.push({
      categoryId: null,
      name: `Інші (${tail.length})`,
      color: "var(--color-ink-3)",
      totalMinor: tail.reduce((sum, d) => sum + d.totalMinor, 0),
      count: tail.reduce((sum, d) => sum + d.count, 0),
    });
  }

  const max = Math.max(...rows.map((r) => r.totalMinor), 1);

  return (
    <ul className="space-y-2.5">
      {rows.map((row) => {
        const percent = share(row.totalMinor, total);
        const body = (
          <>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: row.color }}
                  aria-hidden
                />
                <span className="truncate text-sm text-ink">{row.name}</span>
                <span className="tnum shrink-0 text-xs text-ink-3">{percent.toFixed(0)}%</span>
              </span>
              <span className="tnum shrink-0 text-sm font-medium text-ink">
                {formatMinor(row.totalMinor, currency)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.max(2, (row.totalMinor / max) * 100)}%`,
                  backgroundColor: row.color,
                }}
              />
            </div>
          </>
        );

        return (
          <li key={`${row.categoryId ?? "other"}-${row.name}`}>
            {hrefBase && row.categoryId ? (
              <Link
                href={`${hrefBase}${hrefBase.includes("?") ? "&" : "?"}categoryId=${row.categoryId}`}
                className="block rounded-lg transition-opacity hover:opacity-80"
                title={`${row.count} ${pluralUk(row.count, "операція", "операції", "операцій")}`}
              >
                {body}
              </Link>
            ) : (
              <div title={`${row.count} ${pluralUk(row.count, "операція", "операції", "операцій")}`}>{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
