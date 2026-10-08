"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMonthUk, formatMonthShort } from "@/lib/dates";
import { formatMinor } from "@/lib/money";
import { ChartEmpty, ChartTable, VIZ, VizLegend, VizTooltip, axisProps, compactTick } from "./chart-kit";

export interface MonthlyDatum {
  month: string;
  income: number;
  expense: number;
}

/**
 * Income against expense per month: two distinct series, so they take
 * categorical slots 1 and 2 (blue / orange) rather than green / red - the
 * red-green pair is the worst case for colourblind readers, and a legend plus
 * the tooltip carry the meaning here instead.
 */
export function IncomeExpenseChart({
  data,
  currency,
}: {
  data: MonthlyDatum[];
  currency: string;
}) {
  if (data.length === 0) return <ChartEmpty message="Немає даних за цей період" />;

  return (
    <div>
      <VizLegend
        className="mb-2"
        items={[
          { label: "Доходи", color: VIZ.income },
          { label: "Витрати", color: VIZ.expense },
        ]}
      />

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barGap={2}>
            <CartesianGrid stroke={VIZ.grid} strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="month" {...axisProps} tickFormatter={formatMonthShort} />
            <YAxis {...axisProps} tickFormatter={compactTick(currency)} width={52} />
            <Tooltip
              cursor={{ fill: "var(--color-surface-2)" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const income = Number(payload.find((p) => p.dataKey === "income")?.value ?? 0);
                const expense = Number(payload.find((p) => p.dataKey === "expense")?.value ?? 0);
                return (
                  <VizTooltip
                    label={formatMonthUk(String(label))}
                    rows={[
                      {
                        key: "income",
                        name: "Доходи",
                        value: formatMinor(income, currency),
                        color: VIZ.income,
                      },
                      {
                        key: "expense",
                        name: "Витрати",
                        value: formatMinor(expense, currency),
                        color: VIZ.expense,
                      },
                      {
                        key: "net",
                        name: "Різниця",
                        value: formatMinor(income - expense, currency, { signed: true }),
                      },
                    ]}
                  />
                );
              }}
            />
            {/* Rounded data-ends anchored to the baseline, per the mark spec. */}
            <Bar dataKey="income" fill={VIZ.income} radius={[4, 4, 0, 0]} name="Доходи" />
            <Bar dataKey="expense" fill={VIZ.expense} radius={[4, 4, 0, 0]} name="Витрати" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <ChartTable
        caption="Доходи та витрати за місяцями"
        columns={["Місяць", "Доходи", "Витрати", "Різниця"]}
        rows={data.map((d) => ({
          key: d.month,
          cells: [
            formatMonthUk(d.month),
            formatMinor(d.income, currency),
            formatMinor(d.expense, currency),
            formatMinor(d.income - d.expense, currency, { signed: true }),
          ],
        }))}
      />
    </div>
  );
}
