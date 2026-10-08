import type { Metadata } from "next";
import Link from "next/link";
import { Card, CardBody, CardHeader, Dot, EmptyState, PageHeader } from "@/components/ui";
import { Money } from "@/components/money";
import { StatTile } from "@/components/stat-tile";
import { PeriodPicker } from "@/components/period-picker";
import { IncomeExpenseChart } from "@/components/charts/income-expense";
import { CategoryBars } from "@/components/charts/category-bars";
import {
  averageDailySpend,
  categoryBreakdown,
  earliestTransactionDate,
  monthByCategory,
  monthlySeries,
  periodSummary,
  topExpenses,
} from "@/lib/queries/stats";
import { listCategories } from "@/lib/queries/catalog";
import { getBaseCurrency } from "@/lib/queries/settings";
import { monthForecast } from "@/lib/queries/forecast";
import { resolvePeriod } from "@/lib/period";
import { formatDateUk, formatMonthUk, todayISO } from "@/lib/dates";
import { formatMinor } from "@/lib/money";

export const metadata: Metadata = { title: "Аналітика" };

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = resolvePeriod(params, earliestTransactionDate());
  const currency = getBaseCurrency();

  const summary = periodSummary(period);
  const monthly = monthlySeries(period);
  const categories = categoryBreakdown(period);
  const incomeCategories = categoryBreakdown(period, "income");
  const top = topExpenses(period, 8);
  const matrix = monthByCategory(period);
  const allCategories = listCategories(true);
  const today = todayISO();
  const forecast = period.to >= today && period.from <= today ? monthForecast(today) : null;

  const dayCount = Math.max(1, monthly.length * 30);
  const avgDaily = averageDailySpend(90, period.to);
  const avgMonthlyExpense =
    monthly.length > 0 ? summary.expenseMinor / monthly.length : summary.expenseMinor;

  // Month x category grid: rows are categories, columns months.
  const months = monthly.map((m) => m.month);
  const categoryNames = new Map(allCategories.map((c) => [c.id, c]));
  const matrixRows = buildMatrix(matrix, months);

  return (
    <>
      <PageHeader
        title="Аналітика"
        subtitle={period.label}
        action={<PeriodPicker basePath="/analytics" active={period.id} />}
      />

      <section className="grid gap-3 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Витрати в середньому"
          value={<Money minor={Math.round(avgMonthlyExpense)} currency={currency} tone="plain" />}
          hint="за місяць у цьому періоді"
        />
        <StatTile
          label="Витрати на день"
          value={<Money minor={Math.round(avgDaily)} currency={currency} tone="plain" />}
          hint="середнє за останні 90 днів"
        />
        <StatTile
          label="Операцій"
          value={summary.transactionCount}
          hint={`${dayCount > 0 ? (summary.transactionCount / monthly.length || 0).toFixed(0) : 0} на місяць`}
        />
        <StatTile
          label="Прогноз на кінець місяця"
          value={
            forecast ? (
              <Money minor={forecast.projectedBalanceMinor} currency={currency} tone="plain" />
            ) : (
              "—"
            )
          }
          tone={forecast && forecast.projectedBalanceMinor < 0 ? "negative" : "plain"}
          hint={forecast ? `${forecast.daysRemaining} днів попереду` : "лише для поточного місяця"}
        />
      </section>

      <div className="mt-4 grid gap-4 [&>*]:min-w-0 lg:grid-cols-2">
        <Card>
          <CardHeader title="Доходи та витрати" subtitle="За місяцями" />
          <CardBody>
            <IncomeExpenseChart
              currency={currency}
              data={monthly.map((m) => ({
                month: m.month,
                income: m.incomeMinor,
                expense: m.expenseMinor,
              }))}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Витрати за категоріями" />
          <CardBody>
            <CategoryBars
              data={categories}
              currency={currency}
              limit={10}
              hrefBase={`/transactions?from=${period.from}&to=${period.to}&type=expense`}
            />
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 [&>*]:min-w-0 lg:grid-cols-2">
        <Card>
          <CardHeader title="Джерела доходів" />
          <CardBody>
            <CategoryBars
              data={incomeCategories}
              currency={currency}
              limit={8}
              hrefBase={`/transactions?from=${period.from}&to=${period.to}&type=income`}
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Найбільші витрати" subtitle="Топ-8 за період" />
          <CardBody>
            {top.length === 0 ? (
              <EmptyState title="Витрат немає" />
            ) : (
              <ul className="divide-y divide-border">
                {top.map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Dot color={item.categoryColor ?? "#94a3b8"} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-ink">
                          {item.note ?? item.categoryName ?? "Витрата"}
                        </span>
                        <span className="block text-[11px] text-ink-3">
                          {formatDateUk(item.occurredAt, { year: true })} · {item.accountName}
                        </span>
                      </span>
                    </span>
                    <Money
                      minor={item.baseAmountMinor}
                      currency={currency}
                      tone="plain"
                      className="shrink-0 text-sm font-medium"
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {months.length > 1 && matrixRows.length > 0 ? (
        <Card className="mt-4">
          <CardHeader
            title="Витрати: місяць × категорія"
            subtitle={`У ${currency}, за курсом на дату операції`}
          />
          <CardBody className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="py-2 pr-3 text-xs font-medium text-ink-3">
                    Категорія
                  </th>
                  {months.map((month) => (
                    <th
                      key={month}
                      scope="col"
                      className="py-2 pl-3 text-right text-xs font-medium text-ink-3"
                    >
                      {formatMonthUk(month).split(" ")[0]}
                    </th>
                  ))}
                  <th scope="col" className="py-2 pl-3 text-right text-xs font-medium text-ink-3">
                    Разом
                  </th>
                </tr>
              </thead>
              <tbody>
                {matrixRows.map((row) => {
                  const category = row.categoryId ? categoryNames.get(row.categoryId) : null;
                  return (
                    <tr key={row.categoryId ?? "none"} className="border-b border-border/50">
                      <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                        <span className="flex items-center gap-2">
                          <Dot color={category?.color ?? "#94a3b8"} />
                          <span className="truncate text-ink">
                            {category?.name ?? "Без категорії"}
                          </span>
                        </span>
                      </th>
                      {months.map((month) => (
                        <td key={month} className="tnum py-1.5 pl-3 text-right text-ink-2">
                          {row.byMonth[month]
                            ? formatMinor(row.byMonth[month]!, currency, { symbol: false })
                            : "—"}
                        </td>
                      ))}
                      <td className="tnum py-1.5 pl-3 text-right font-medium text-ink">
                        {formatMinor(row.total, currency, { symbol: false })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardBody>
        </Card>
      ) : null}

      <p className="mt-4 text-xs text-ink-3">
        Потрібні сирі дані?{" "}
        <Link href="/transactions" className="text-brand hover:underline">
          Відфільтруйте операції
        </Link>{" "}
        і вивантажте їх у CSV.
      </p>
    </>
  );
}

interface MatrixRow {
  categoryId: number | null;
  byMonth: Record<string, number>;
  total: number;
}

function buildMatrix(
  cells: Array<{ month: string; categoryId: number | null; totalMinor: number }>,
  months: string[],
): MatrixRow[] {
  const rows = new Map<number | null, MatrixRow>();
  for (const cell of cells) {
    if (!months.includes(cell.month)) continue;
    const row = rows.get(cell.categoryId) ?? {
      categoryId: cell.categoryId,
      byMonth: {},
      total: 0,
    };
    row.byMonth[cell.month] = (row.byMonth[cell.month] ?? 0) + cell.totalMinor;
    row.total += cell.totalMinor;
    rows.set(cell.categoryId, row);
  }
  return [...rows.values()].sort((a, b) => b.total - a.total);
}
