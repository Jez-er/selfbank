import { formatMinor, type FormatOptions } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * Money display. Amounts are tabular-figure aligned, and the sign is always
 * rendered as text - colour alone never carries "income" or "expense".
 */
export function Money({
  minor,
  currency,
  className,
  tone = "auto",
  ...options
}: {
  minor: number;
  currency: string;
  className?: string;
  /** `auto` colours by sign; `plain` leaves it in body ink. */
  tone?: "auto" | "plain" | "positive" | "negative";
} & FormatOptions) {
  const resolved =
    tone === "auto" ? (minor > 0 ? "positive" : minor < 0 ? "negative" : "plain") : tone;

  return (
    <span
      className={cn(
        "tnum",
        resolved === "positive" && "text-positive",
        resolved === "negative" && "text-negative",
        className,
      )}
    >
      {formatMinor(minor, currency, options)}
    </span>
  );
}
