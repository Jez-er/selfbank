import type { Metadata } from "next";
import { AlertTriangle, Power, Trash2 } from "lucide-react";
import { Alert, Badge, Card, CardBody, CardHeader, Dot, EmptyState, PageHeader, Progress } from "@/components/ui";
import { Money } from "@/components/money";
import { AutoForm } from "@/components/forms/auto-form";
import { Disclosure } from "@/components/disclosure";
import { RowActionForm } from "@/components/crud";
import { deleteBudget, saveBudget, toggleBudgetActive } from "@/actions/budgets";
import { budgetProgress } from "@/lib/queries/budgets";
import { categoryTree } from "@/lib/queries/catalog";
import { getBaseCurrency } from "@/lib/queries/settings";
import { formatMonthUk, monthKey, todayISO } from "@/lib/dates";
import { formatMinor, minorToInputValue } from "@/lib/money";
import type { FieldSpec } from "@/components/forms/types";

export const metadata: Metadata = { title: "Бюджети" };

export default async function BudgetsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const { month: requested } = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(requested ?? "") ? requested! : monthKey(todayISO());
  const baseCurrency = getBaseCurrency();
  const budgets = budgetProgress(month);

  const categoryOptions = categoryTree("expense").flatMap(({ category, children }) => [
    { value: String(category.id), label: category.name },
    ...children.map((child) => ({
      value: String(child.id),
      label: child.name,
      group: category.name,
    })),
  ]);

  const used = new Set(budgets.map((b) => b.categoryId));
  const totalLimit = budgets.filter((b) => b.active).reduce((sum, b) => sum + b.limitMinor, 0);
  const totalSpent = budgets
    .filter((b) => b.active && b.categoryId !== null)
    .reduce((sum, b) => sum + b.spentMinor, 0);

  const fields = (budget?: (typeof budgets)[number]): FieldSpec[] => [
    ...(budget ? [{ name: "id", type: "hidden" as const, defaultValue: budget.id }] : []),
    {
      name: "categoryId",
      label: "Категорія",
      type: "select",
      defaultValue: budget?.categoryId ?? "",
      hint: "Порожнє — загальний ліміт на всі витрати",
      options: [
        {
          value: "",
          label: "Усі витрати (загальний бюджет)",
          disabled: !budget && used.has(null),
        },
        ...categoryOptions.map((option) => ({
          ...option,
          disabled: !budget && used.has(Number(option.value)),
        })),
      ],
    },
    {
      name: "amount",
      label: `Місячний ліміт (${baseCurrency})`,
      type: "amount",
      currency: baseCurrency,
      required: true,
      defaultValue: budget ? minorToInputValue(budget.limitMinor, baseCurrency) : "",
    },
    {
      name: "startMonth",
      label: "Діє з місяця",
      type: "month",
      defaultValue: budget?.startMonth ?? month,
    },
    {
      name: "rollover",
      label: "Переносити залишок",
      type: "checkbox",
      defaultValue: budget?.rollover ?? false,
      hint: "Невитрачене з минулих місяців додається до ліміту",
      wide: true,
    },
  ];

  return (
    <>
      <PageHeader
        title="Бюджети"
        subtitle={`${formatMonthUk(month)} · усі суми у ${baseCurrency}`}
      />

      {budgets.filter((b) => b.active).length > 0 ? (
        <Card className="mb-4 p-4">
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="text-sm text-ink">Витрачено за категоріями з бюджетом</span>
            <span className="tnum text-sm">
              <Money minor={totalSpent} currency={baseCurrency} tone="plain" /> /{" "}
              {formatMinor(totalLimit, baseCurrency)}
            </span>
          </div>
          <Progress
            value={totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0}
            tone={totalSpent > totalLimit ? "negative" : "brand"}
          />
        </Card>
      ) : null}

      <Disclosure label="Новий бюджет">
        <Card className="max-w-2xl p-5">
          <AutoForm action={saveBudget} fields={fields()} submitLabel="Створити" />
        </Card>
      </Disclosure>

      <div className="mt-5 space-y-3">
        {budgets.length === 0 ? (
          <Card>
            <EmptyState
              title="Бюджетів немає"
              description="Задайте місячний ліміт на категорію — на дашборді зʼявиться прогрес."
            />
          </Card>
        ) : null}

        {budgets.map((budget) => (
          <Card key={budget.id} className={budget.active ? "" : "opacity-60"}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Dot color={budget.categoryColor} />
                  {budget.categoryName}
                  {budget.rollover ? <Badge>з переносом</Badge> : null}
                  {!budget.active ? <Badge>вимкнено</Badge> : null}
                  {budget.state === "over" ? (
                    <Badge tone="negative">
                      <AlertTriangle className="size-3" aria-hidden />
                      перевищено
                    </Badge>
                  ) : budget.state === "warning" ? (
                    <Badge tone="warning">близько ліміту</Badge>
                  ) : null}
                </span>
              }
              subtitle={`Діє з ${formatMonthUk(budget.startMonth)}`}
              action={
                <span className="flex items-center gap-1">
                  <RowActionForm
                    action={toggleBudgetActive}
                    id={budget.id}
                    label={budget.active ? "Вимкнути" : "Увімкнути"}
                    icon={<Power className="size-4" aria-hidden />}
                  />
                  <RowActionForm
                    action={deleteBudget}
                    id={budget.id}
                    label="Видалити"
                    icon={<Trash2 className="size-4 text-negative" aria-hidden />}
                    confirm={`Видалити бюджет «${budget.categoryName}»?`}
                  />
                </span>
              }
            />
            <CardBody className="space-y-2">
              <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
                <span className="tnum text-ink-2">
                  {formatMinor(budget.spentMinor, baseCurrency)} з{" "}
                  {formatMinor(budget.limitMinor, baseCurrency)}
                </span>
                <span className="tnum">
                  {budget.remainingMinor >= 0 ? "залишилось " : "перевитрата "}
                  <Money
                    minor={Math.abs(budget.remainingMinor)}
                    currency={baseCurrency}
                    tone={budget.remainingMinor >= 0 ? "positive" : "negative"}
                  />
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

              <Disclosure label="Редагувати" variant="outline">
                <AutoForm action={saveBudget} fields={fields(budget)} submitLabel="Зберегти" />
              </Disclosure>
            </CardBody>
          </Card>
        ))}
      </div>

      <Alert tone="brand" title="Як рахується">
        Витрати беруться у базовій валюті ({baseCurrency}) за курсом на дату операції, тому зміна
        курсу не переписує минулі місяці.
      </Alert>
    </>
  );
}
