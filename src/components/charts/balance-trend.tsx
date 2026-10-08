"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDateUk } from "@/lib/dates";
import type { TrendDatum } from "@/lib/trend";
import { formatMinor } from "@/lib/money";
import { ChartEmpty, ChartTable, VIZ, VizLegend, VizTooltip, axisProps, compactTick } from "./chart-kit";

export type { TrendDatum };

/**
 * Net-worth trend as an area (one real series), with the projection drawn as a
 * dashed line of the same hue - the forecast is the same quantity, not a
 * different entity, so it shares the colour and differs by dash pattern.
 */
export function BalanceTrend({
  data,
  currency,
  hasForecast,
}: {
  data: TrendDatum[];
  currency: string;
  hasForecast: boolean;
}) {
  if (data.length === 0) return <ChartEmpty message="Ще немає операцій за цей період" />;

  return (
    <div>
      {hasForecast ? (
        <VizLegend
          className="mb-2"
          items={[
            { label: "Факт", color: VIZ.slot(1) },
            { label: "Прогноз", color: VIZ.slot(1), dashed: true },
          ]}
        />
      ) : null}

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="balance-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={VIZ.slot(1)} stopOpacity={0.22} />
                <stop offset="100%" stopColor={VIZ.slot(1)} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={VIZ.grid} strokeDasharray="2 4" vertical={false} />
            <XAxis
              dataKey="date"
              {...axisProps}
              tickFormatter={(value: string) => formatDateUk(value, { year: false })}
              minTickGap={32}
            />
            <YAxis {...axisProps} tickFormatter={compactTick(currency)} width={52} />
            <Tooltip
              cursor={{ stroke: VIZ.axis, strokeDasharray: "3 3" }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                return (
                  <VizTooltip
                    label={formatDateUk(String(label))}
                    rows={payload
                      .filter((item) => item.value !== null && item.value !== undefined)
                      .map((item) => ({
                        key: String(item.dataKey),
                        name: item.dataKey === "projected" ? "Прогноз" : "Баланс",
                        value: formatMinor(Number(item.value), currency),
                        color: VIZ.slot(1),
                        muted: item.dataKey === "projected",
                      }))}
                  />
                );
              }}
            />
            <Area
              type="monotone"
              dataKey="actual"
              stroke={VIZ.slot(1)}
              strokeWidth={2}
              fill="url(#balance-fill)"
              connectNulls={false}
              dot={false}
              activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--color-surface)" }}
              name="Баланс"
            />
            {hasForecast ? (
              <Line
                type="monotone"
                dataKey="projected"
                stroke={VIZ.slot(1)}
                strokeWidth={2}
                strokeDasharray="4 3"
                dot={false}
                connectNulls
                name="Прогноз"
              />
            ) : null}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <ChartTable
        caption="Динаміка балансу"
        columns={["Дата", "Баланс"]}
        rows={data
          .filter((d) => d.actual !== null)
          .slice(-14)
          .map((d) => ({
            key: d.date,
            cells: [formatDateUk(d.date), formatMinor(d.actual!, currency)],
          }))}
      />
    </div>
  );
}
