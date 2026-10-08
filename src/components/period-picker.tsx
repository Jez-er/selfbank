import Link from "next/link";
import { PERIOD_PRESETS, type PeriodPresetId } from "@/lib/period";
import { cn } from "@/lib/utils";

/**
 * Period selector. The choice lives in the URL rather than component state, so
 * a filtered view can be bookmarked, shared and reloaded.
 */
export function PeriodPicker({
  basePath,
  active,
}: {
  basePath: string;
  active: PeriodPresetId;
}) {
  return (
    <nav
      className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface p-1"
      aria-label="Період"
    >
      {PERIOD_PRESETS.map((preset) => {
        const current = preset.id === active;
        const href = preset.id === "month" ? basePath : `${basePath}?period=${preset.id}`;
        return (
          <Link
            key={preset.id}
            href={href}
            aria-current={current ? "true" : undefined}
            className={cn(
              "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
              current ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink",
            )}
          >
            {preset.label}
          </Link>
        );
      })}
    </nav>
  );
}
