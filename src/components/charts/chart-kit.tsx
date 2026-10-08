"use client";

import type { ReactNode } from "react";
import { formatMinor } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Shared chart furniture.
 *
 * Colours come from the `--color-viz-*` tokens (validated with the dataviz
 * checker in both light and dark mode) and are passed to SVG as `var(...)`,
 * so switching theme repaints the charts with no JavaScript involved.
 */

export const VIZ = {
  slot: (n: number) => `var(--color-viz-${((n - 1) % 8) + 1})`,
  income: "var(--color-viz-income)",
  expense: "var(--color-viz-expense)",
  grid: "var(--color-viz-grid)",
  axis: "var(--color-viz-axis)",
} as const;

export const axisProps = {
  stroke: VIZ.axis,
  tick: { fill: VIZ.axis, fontSize: 11 },
  tickLine: false,
  axisLine: false,
} as const;

/** Compact Y-axis labels: 12 500 000 kopiyky -> "125 тис". */
export function compactTick(currency: string) {
  return (value: number) => formatMinor(value, currency, { symbol: false, compact: true });
}

export function VizTooltip({
  label,
  rows,
}: {
  label: ReactNode;
  rows: Array<{ key: string; name: string; value: string; color?: string; muted?: boolean }>;
}) {
  return (
    <div className="pointer-events-none rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-medium text-ink">{label}</p>
      <ul className="space-y-0.5">
        {rows.map((row) => (
          <li key={row.key} className="flex items-center gap-2">
            {row.color ? (
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ backgroundColor: row.color }}
                aria-hidden
              />
            ) : null}
            <span className={cn("text-ink-2", row.muted && "text-ink-3")}>{row.name}</span>
            <span className="tnum ml-auto font-medium text-ink">{row.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Legend. Always rendered for two or more series, so identity never depends on
 * colour alone.
 */
export function VizLegend({
  items,
  className,
}: {
  items: Array<{ label: string; color: string; dashed?: boolean }>;
  className?: string;
}) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-2", className)}>
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          {item.dashed ? (
            <span
              className="h-0.5 w-4 shrink-0"
              style={{
                backgroundImage: `repeating-linear-gradient(to right, ${item.color} 0 4px, transparent 4px 7px)`,
              }}
              aria-hidden
            />
          ) : (
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
          )}
          {item.label}
        </li>
      ))}
    </ul>
  );
}

/** Screen-reader and keyboard-accessible alternative to every chart. */
export function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: Array<{ key: string; cells: ReactNode[] }>;
}) {
  return (
    <details className="mt-3 text-xs">
      <summary className="cursor-pointer text-ink-3 hover:text-ink">Дані таблицею</summary>
      <table className="mt-2 w-full border-collapse">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-left">
            {columns.map((column, index) => (
              <th
                key={column}
                scope="col"
                className={cn("py-1 font-medium text-ink-3", index > 0 && "text-right")}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-border/50 last:border-0">
              {row.cells.map((cell, index) => (
                <td
                  key={index}
                  className={cn("py-1 text-ink-2", index > 0 && "tnum text-right text-ink")}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

export function ChartEmpty({ message }: { message: string }) {
  return (
    <div className="grid h-full min-h-40 place-items-center text-xs text-ink-3">{message}</div>
  );
}
