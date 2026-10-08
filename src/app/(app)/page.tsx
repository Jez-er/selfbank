import Link from "next/link";
import {
  AlertTriangle,
  CalendarClock,
  Goal as GoalIcon,
  HandCoins,
  PiggyBank,
  TrendingDown,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Alert, Badge, Card, CardBody, CardHeader, Dot, EmptyState, Progress } from "@/components/ui";
import { PageHeader } from "@/components/ui";
import { Money } from "@/components/money";
import { StatTile } from "@/components/stat-tile";
import { PeriodPicker } from "@/components/period-picker";
import { BalanceTrend } from "@/components/charts/balance-trend";
import { IncomeExpenseChart } from "@/components/charts/income-expense";
import { CategoryBars } from "@/components/charts/category-bars";
import { accountBalances, totalBalance } from "@/lib/queries/balances";
import {
  balanceTrend,
  categoryBreakdown,
  earliestTransactionDate,
  monthlySeries,
  periodSummary,
} from "@/lib/queries/stats";
import { activeBudgetProgress } from "@/lib/queries/budgets";
import { goalProgress } from "@/lib/queries/goals";
import { debtProgress } from "@/lib/queries/debts";
import { monthForecast } from "@/lib/queries/forecast";
import { pendingRules, upcomingOccurrences } from "@/lib/recurring-runner";
import { missingRateCurrencies } from "@/lib/queries/fx";
import { recentTransactions } from "@/lib/queries/transactions";
import { resolvePeriod } from "@/lib/period";
import { endOfMonthISO, formatDateUk, formatRelativeDayUk, todayISO } from "@/lib/dates";
import { describeRecurrence } from "@/lib/recurring";
import { buildTrendData } from "@/lib/trend";
import { formatMinor } from "@/lib/money";
import { pluralUk } from "@/lib/utils";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const params = await searchParams;
  const period = resolvePeriod(params, earliestTransactionDate());

  const total = totalBalance();
  const currency = total.baseCurrency;
  const summary = periodSummary(period);
  const previous = periodSummary(period.previous);
  const accounts = accountBalances();
  const categories = categoryBreakdown(period);
  const monthly = monthlySeries(period);
  const trend = balanceTrend(period);
  const budgets = activeBudgetProgress();
  const goals = goalProgress().filter((g) => !g.done).slice(0, 3);
  const debts = debtProgress(false).filter((d) => !d.done);
  const upcoming = upcomingOccurrences(14);
  const pending = pendingRules();
  const recent = recentTransactions(5);
  const missingRates = missingRateCurrencies();
  const today = todayISO();

  // The forecast is only meaningful for the current month.
  const showForecast = period.to >= today && period.from <= today;
  const forecast = showForecast ? monthForecast(today) : null;
  const trendData = buildTrendData(trend, forecast, today);

  return (
    <>
      <PageHeader
        title="Дашборд"
        subtitle={period.label}
        action={<PeriodPicker basePath="/" active={period.id} />}
      />

      {missingRates.length > 0 ? (
        <Alert tone="warning" title="Не задані курси валют">
          Баланси у {missingRates.join(", ")} не враховані у загальній сумі.{" "}
          <Link href="/settings" className="underline">
            Задати курс
          </Link>
        </Alert>
      ) : null}

      {pending.length > 0 ? (
        <Alert tone="brand" title={`Очікують підтвердження: ${pending.length}`}>
          <Link href="/recurring" className="underline">
            Переглянути регулярні платежі
          </Link>
        </Alert>
      ) : null}

      {/* A row of stat tiles, not a chart: these are single headline numbers. */}
      <section className="mt-4 grid gap-3 [&>*]:min-w-0 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Загальний баланс"
          value={<Money minor={total.totalMinor} currency={currency} tone="plain" />}
          hint={
            total.unconverted.length > 0
              ? `без ${total.unconverted.join(", ")}`
              : `${accounts.length} ${pluralUk(accounts.length, "рахунок", "рахунки", "рахунків")}`
          }
          icon={<Wallet className="size-4" aria-hidden />}
        />
        <StatTile
          label="Доходи за період"
          value={<Money minor={summary.incomeMinor} currency={currency} tone="plain" />}
          delta={percentChange(summary.incomeMinor, previous.incomeMinor)}
          hint="до минулого періоду"
          icon={<TrendingUp className="size-4" aria-hidden />}
        />
        <StatTile
          label="Витрати за період"
          value={<Money minor={summary.expenseMinor} currency={currency} tone="plain" />}
          delta={percentChange(summary.expenseMinor, previous.expenseMinor)}
          hint="до минулого періоду"
          icon={<TrendingDown className="size-4" aria-hidden />}
        />
        <StatTile
          label="Чистий потік"
          value={<Money minor={summary.netMinor} currency={currency} signed />}
          tone={summary.netMinor >= 0 ? "positive" : "negative"}
          hint={
            summary.savingsRate === null
              ? "немає доходів за період"
              : `норма накопичення ${summary.savingsRate.toFixed(0)}%`
          }
          icon={<PiggyBank className="size-4" aria-hidden />}
        />
      </section>

      <div className="mt-4 grid gap-4 [&>*]:min-w-0 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Динаміка балансу"
            subtitle={
              forecast
                ? `Прогноз на ${formatDateUk(endOfMonthISO(today))}: ${formatMinor(forecast.projectedBalanceMinor, currency)}`
                : period.label
            }
          />
          <CardBody>
            <BalanceTrend data={trendData} currency={currency} hasForecast={forecast !== null} />
            {forecast ? <ForecastExplainer forecast={forecast} currency={currency} /> : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Рахунки"
            action={
              <Link href="/accounts" className="text-xs text-brand hover:underline">
                Усі
              </Link>
            }
          />
          <CardBody>
            {accounts.length === 0 ? (
              <EmptyState
                title="Немає рахунків"
                action={
                  <Link href="/accounts" className="text-sm text-brand underline">
                    Створити рахунок
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-2.5">
                {accounts.map((account) => (
                  <li key={account.id} className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <Dot color={account.color} />
                      <span className="truncate text-sm text-ink">{account.name}</span>
                    </span>
                    <span className="shrink-0 text-right">
                      <Money
                        minor={account.balanceMinor}
                        currency={account.currency}
                        tone="plain"
                        className="block text-sm font-medium"
                      />
                      {account.currency !== currency && account.baseBalanceMinor !== null ? (
                        <span className="tnum block text-[11px] text-ink-3">
                          ≈ {formatMinor(account.baseBalanceMinor, currency)}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 [&>*]:min-w-0 lg:grid-cols-2">
        <Card>
          <CardHeader title="Доходи та витрати" subtitle="За місяцями, у базовій валюті" />
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
          <CardHeader
            title="Витрати за категоріями"
            subtitle={`Усього ${formatMinor(summary.expenseMinor, currency)}`}
          />
          <CardBody>
            <CategoryBars
              data={categories}
              currency={currency}
              hrefBase={`/transactions?from=${period.from}&to=${period.to}&type=expense`}
            />
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 [&>*]:min-w-0 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Бюджети"
            subtitle="Цей місяць"
            action={
              <Link href="/budgets" className="text-xs text-brand hover:underline">
                Усі
              </Link>
            }
          />
          <CardBody>
            {budgets.length === 0 ? (
              <EmptyState
                title="Бюджетів ще немає"
                description="Задайте місячний ліміт на категорію, щоб бачити прогрес."
                action={
                  <Link href="/budgets" className="text-sm text-brand underline">
                    Створити бюджет
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-3">
                {budgets.slice(0, 5).map((budget) => (
                  <li key={budget.id} className="min-w-0">
                    <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <Dot color={budget.categoryColor} />
                        <span className="truncate text-sm text-ink">{budget.categoryName}</span>
                        {budget.state === "over" ? (
                          <Badge tone="negative">
                            <AlertTriangle className="size-3" aria-hidden />
                            перевищено
                          </Badge>
                        ) : budget.state === "warning" ? (
                          <Badge tone="warning">близько ліміту</Badge>
                        ) : null}
                      </span>
                      <span className="tnum text-xs text-ink-3">
                        {formatMinor(budget.spentMinor, currency, { symbol: false })} /{" "}
                        {formatMinor(budget.limitMinor, currency)}
                      </span>
                    </div>
                    <Progress
                      value={budget.usedPercent}
                      tone={
                        budget.state === "over"
                          ? "negative"
                          : budget.state === "warning"
                            ? "warning"
                            : "brand"
                      }
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Найближчі платежі"
            subtitle="14 днів"
            action={
              <Link href="/recurring" className="text-xs text-brand hover:underline">
                Усі
              </Link>
            }
          />
          <CardBody>
            {upcoming.length === 0 ? (
              <EmptyState
                title="Нічого не заплановано"
                icon={<CalendarClock className="size-5" aria-hidden />}
                action={
                  <Link href="/recurring" className="text-sm text-brand underline">
                    Додати регулярний платіж
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-2.5">
                {upcoming.slice(0, 6).map(({ rule, date, overdue }) => (
                  <li key={`${rule.id}-${date}`} className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink">{rule.name}</span>
                      <span className="block text-[11px] text-ink-3">
                        {formatRelativeDayUk(date)} · {describeRecurrence(toSpec(rule))}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <Money
                        minor={rule.amountMinor}
                        currency={rule.currency}
                        tone={rule.type === "income" ? "positive" : "plain"}
                        className="block text-sm"
                        signed={rule.type === "income"}
                      />
                      {overdue ? <Badge tone="warning">прострочено</Badge> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Цілі та борги"
            action={
              <Link href="/goals" className="text-xs text-brand hover:underline">
                Цілі
              </Link>
            }
          />
          <CardBody className="space-y-4">
            {goals.length === 0 && debts.length === 0 ? (
              <EmptyState
                title="Цілей і боргів немає"
                icon={<GoalIcon className="size-5" aria-hidden />}
              />
            ) : null}

            {goals.length > 0 ? (
              <ul className="space-y-3">
                {goals.map((goal) => (
                  <li key={goal.id}>
                    <div className="mb-1 flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm text-ink">{goal.name}</span>
                      <span className="tnum shrink-0 text-xs text-ink-3">
                        {goal.progressPercent.toFixed(0)}%
                      </span>
                    </div>
                    <Progress value={goal.progressPercent} tone="positive" />
                    <p className="tnum mt-1 text-[11px] text-ink-3">
                      {formatMinor(goal.savedMinor, goal.currency)} з{" "}
                      {formatMinor(goal.targetMinor, goal.currency)}
                      {goal.monthlyNeedMinor !== null && goal.remainingMinor > 0
                        ? ` · ${formatMinor(goal.monthlyNeedMinor, goal.currency)}/міс`
                        : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}

            {debts.length > 0 ? (
              <div className="border-t border-border pt-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-3">
                  <HandCoins className="size-3.5" aria-hidden />
                  Борги
                </p>
                <ul className="space-y-1.5">
                  {debts.slice(0, 4).map((debt) => (
                    <li key={debt.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-ink">{debt.counterparty}</span>
                        {debt.overdue ? <Badge tone="negative">прострочено</Badge> : null}
                      </span>
                      <Money
                        minor={debt.outstandingMinor}
                        currency={debt.currency}
                        tone={debt.direction === "i_owe" ? "negative" : "positive"}
                        className="shrink-0"
                      />
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-[11px] text-ink-3">
                  Мінус — я винен, плюс — мені винні
                </p>
              </div>
            ) : null}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Останні операції"
          action={
            <Link href="/transactions" className="text-xs text-brand hover:underline">
              Усі операції
            </Link>
          }
        />
        <CardBody>
          {recent.length === 0 ? (
            <EmptyState
              title="Операцій ще немає"
              description="Додайте першу витрату або надходження."
              action={
                <Link href="/transactions/new" className="text-sm text-brand underline">
                  Додати операцію
                </Link>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {recent.map((tx) => (
                <li key={tx.id} className="flex items-center justify-between gap-3 py-2.5">
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Dot color={tx.categoryColor ?? tx.accountColor} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-ink">
                        {tx.note ?? tx.categoryName ?? labelFor(tx.type)}
                      </span>
                      <span className="block truncate text-[11px] text-ink-3">
                        {formatRelativeDayUk(tx.occurredAt)} · {tx.accountName}
                        {tx.toAccountName ? ` → ${tx.toAccountName}` : ""}
                      </span>
                    </span>
                  </span>
                  <Money
                    minor={tx.type === "expense" ? -tx.amountMinor : tx.amountMinor}
                    currency={tx.currency}
                    tone={tx.type === "transfer" ? "plain" : "auto"}
                    signed={tx.type !== "transfer"}
                    className="shrink-0 text-sm font-medium"
                  />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </>
  );
}

/** The projection is shown with its parts, so the number is never a black box. */
function ForecastExplainer({
  forecast,
  currency,
}: {
  forecast: ReturnType<typeof monthForecast>;
  currency: string;
}) {
  const c = forecast.components;
  if (forecast.daysRemaining === 0) return null;

  return (
    <p className="mt-3 border-t border-border pt-3 text-[11px] leading-relaxed text-ink-3">
      Прогноз на кінець місяця = {formatMinor(c.currentBalanceMinor, currency)} зараз
      {c.plannedIncomeMinor > 0 ? ` + ${formatMinor(c.plannedIncomeMinor, currency)} регулярних доходів` : ""}
      {c.plannedExpenseMinor > 0 ? ` − ${formatMinor(c.plannedExpenseMinor, currency)} регулярних витрат` : ""}
      {" − "}
      {formatMinor(c.estimatedDiscretionaryMinor, currency)} звичайних витрат (середнє за 90 днів ×{" "}
      {forecast.daysRemaining} {pluralUk(forecast.daysRemaining, "день", "дні", "днів")}).
    </p>
  );
}

/**
 * Joins the actual trend with the projection: today is the only point present
 * in both series, which keeps the dashed line attached to the solid one.
 */

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function labelFor(type: string): string {
  return type === "income" ? "Надходження" : type === "transfer" ? "Переказ" : "Витрата";
}

function toSpec(rule: {
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  intervalCount: number;
  startDate: string;
  endDate: string | null;
  dayOfMonth: number | null;
  weekday: number | null;
  monthOfYear: number | null;
}) {
  return rule;
}
