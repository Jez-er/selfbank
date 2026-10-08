import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Card } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * A single headline number. The dataviz guidance is explicit that one value
 * belongs in a stat tile, not a one-bar chart - so the dashboard leads with a
 * row of these.
 */
export function StatTile({
  label,
  value,
  hint,
  delta,
  tone = "plain",
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** Percentage change against the previous period. */
  delta?: number | null;
  tone?: "plain" | "positive" | "negative" | "brand";
  icon?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-ink-3">{label}</p>
        {icon ? <span className="text-ink-3">{icon}</span> : null}
      </div>
      <p
        className={cn(
          "tnum mt-1.5 text-xl font-semibold tracking-tight",
          tone === "positive" && "text-positive",
          tone === "negative" && "text-negative",
          tone === "brand" && "text-brand",
        )}
      >
        {value}
      </p>
      <div className="mt-1 flex items-center gap-2 text-xs">
        {delta !== undefined && delta !== null && Number.isFinite(delta) ? (
          <span
            className={cn(
              "inline-flex items-center gap-0.5",
              delta > 0 ? "text-positive" : delta < 0 ? "text-negative" : "text-ink-3",
            )}
          >
            {delta > 0 ? (
              <ArrowUp className="size-3" aria-hidden />
            ) : delta < 0 ? (
              <ArrowDown className="size-3" aria-hidden />
            ) : null}
            {Math.abs(delta).toFixed(0)}%
          </span>
        ) : null}
        {hint ? <span className="truncate text-ink-3">{hint}</span> : null}
      </div>
    </Card>
  );
}
