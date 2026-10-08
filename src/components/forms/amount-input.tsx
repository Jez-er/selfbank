"use client";

import { useState } from "react";
import { Input } from "@/components/ui";
import { formatMinor, tryParseAmount } from "@/lib/money";

/**
 * Amount field that doubles as a calculator: the value is parsed with the same
 * `parseAmount` the server uses, and the normalised result is echoed under the
 * input so there is no doubt about what "1 200,50" or "450*3" will be saved as.
 */
export function AmountInput({
  id,
  name,
  currency,
  defaultValue = "",
  required,
  autoFocus,
  placeholder,
}: {
  id?: string;
  name: string;
  currency: string;
  defaultValue?: string;
  required?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const [raw, setRaw] = useState(defaultValue);
  const parsed = raw.trim() === "" ? null : tryParseAmount(raw, currency);
  const isExpression = /[+\-*/()]/.test(raw.trim().replace(/^-/, ""));

  return (
    <div>
      <div className="relative">
        <Input
          id={id}
          name={name}
          value={raw}
          onChange={(event) => setRaw(event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          required={required}
          autoFocus={autoFocus}
          placeholder={placeholder ?? "0,00"}
          aria-describedby={id ? `${id}-preview` : undefined}
          className="tnum pr-14 text-base"
        />
        <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-ink-3">
          {currency}
        </span>
      </div>
      <p id={id ? `${id}-preview` : undefined} className="mt-1 min-h-4 text-xs" aria-live="polite">
        {raw.trim() === "" ? (
          <span className="text-ink-3">Можна вводити вираз: 1200+350</span>
        ) : parsed === null ? (
          <span className="text-negative">Не вдалося розпізнати суму</span>
        ) : (
          <span className={isExpression ? "font-medium text-brand" : "text-ink-3"}>
            = {formatMinor(parsed, currency)}
          </span>
        )}
      </p>
    </div>
  );
}
