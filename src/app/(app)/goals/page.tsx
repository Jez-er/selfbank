import type { Metadata } from "next";
import Link from "next/link";
import { Archive, ArchiveRestore, CheckCircle2, Trash2 } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Progress } from "@/components/ui";
import { Money } from "@/components/money";
import { AutoForm } from "@/components/forms/auto-form";
import { Disclosure } from "@/components/disclosure";
import { RowActionForm } from "@/components/crud";
import { deleteGoal, saveGoal, toggleGoalArchived } from "@/actions/goals";
import { goalProgress } from "@/lib/queries/goals";
import { listAccounts } from "@/lib/queries/catalog";
import { getBaseCurrency } from "@/lib/queries/settings";
import { CURRENCIES, CURRENCY_CODES, formatMinor, minorToInputValue } from "@/lib/money";
import { formatDateUk } from "@/lib/dates";
import { pluralUk } from "@/lib/utils";
import type { FieldSpec } from "@/components/forms/types";

export const metadata: Metadata = { title: "Цілі" };

export default async function GoalsPage() {
  const baseCurrency = getBaseCurrency();
  const goals = goalProgress(true);
  const accounts = listAccounts(true);

  const fields = (goal?: (typeof goals)[number]): FieldSpec[] => [
    ...(goal ? [{ name: "id", type: "hidden" as const, defaultValue: goal.id }] : []),
    {
      name: "name",
      label: "Назва",
      type: "text",
      required: true,
      defaultValue: goal?.name,
      placeholder: "Наприклад: подушка безпеки",
    },
    {
      name: "currency",
      label: "Валюта",
      type: "select",
      defaultValue: goal?.currency ?? baseCurrency,
      options: CURRENCY_CODES.map((code) => ({
        value: code,
        label: `${code} — ${CURRENCIES[code]!.name}`,
      })),
    },
    {
      name: "target",
      label: "Цільова сума",
      type: "amount",
      currency: goal?.currency ?? baseCurrency,
      required: true,
      defaultValue: goal ? minorToInputValue(goal.targetMinor, goal.currency) : "",
    },
    {
      name: "targetDate",
      label: "Дата досягнення",
      type: "date",
      defaultValue: goal?.targetDate ?? "",
      hint: "Необовʼязково — потрібна для розрахунку внеску на місяць",
    },
    {
      name: "accountId",
      label: "Рахунок-джерело прогресу",
      type: "select",
      defaultValue: goal?.accountId ?? "",
      hint: "Якщо вибрати — прогресом стане баланс рахунку, інакше рахуються позначені операції",
      options: [
        { value: "", label: "За позначеними операціями" },
        ...accounts.map((a) => ({ value: String(a.id), label: `${a.name} · ${a.currency}` })),
      ],
    },
    { name: "note", label: "Нотатка", type: "textarea", defaultValue: goal?.note ?? "", wide: true },
  ];

  const active = goals.filter((g) => !g.archived);
  const archived = goals.filter((g) => g.archived);

  return (
    <>
      <PageHeader
        title="Цілі накопичень"
        subtitle="Прогрес рахується або з балансу привʼязаного рахунку, або з операцій, позначених ціллю"
      />

      <Disclosure label="Нова ціль">
        <Card className="max-w-2xl p-5">
          <AutoForm action={saveGoal} fields={fields()} submitLabel="Створити" />
        </Card>
      </Disclosure>

      <div className="mt-5 grid gap-3 [&>*]:min-w-0 lg:grid-cols-2">
        {active.length === 0 ? (
          <Card className="lg:col-span-2">
            <EmptyState
              title="Цілей ще немає"
              description="Наприклад: накопичити 3 зарплати на подушку безпеки."
            />
          </Card>
        ) : null}

        {active.map((goal) => (
          <Card key={goal.id}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  {goal.name}
                  {goal.done ? (
                    <Badge tone="positive">
                      <CheckCircle2 className="size-3" aria-hidden />
                      досягнуто
                    </Badge>
                  ) : null}
                </span>
              }
              subtitle={
                goal.accountName
                  ? `За балансом рахунку «${goal.accountName}»`
                  : "За позначеними операціями"
              }
              action={
                <span className="flex items-center gap-1">
                  <RowActionForm
                    action={toggleGoalArchived}
                    id={goal.id}
                    label="Заархівувати"
                    icon={<Archive className="size-4" aria-hidden />}
                  />
                  <RowActionForm
                    action={deleteGoal}
                    id={goal.id}
                    label="Видалити"
                    icon={<Trash2 className="size-4 text-negative" aria-hidden />}
                    confirm={`Видалити ціль «${goal.name}»? Операції залишаться, зникне лише позначка.`}
                  />
                </span>
              }
            />
            <CardBody className="space-y-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="tnum text-sm">
                  <Money minor={goal.savedMinor} currency={goal.currency} tone="plain" /> з{" "}
                  {formatMinor(goal.targetMinor, goal.currency)}
                </span>
                <span className="tnum text-sm font-medium text-ink">
                  {goal.progressPercent.toFixed(0)}%
                </span>
              </div>
              <Progress value={goal.progressPercent} tone={goal.done ? "positive" : "brand"} />

              <dl className="grid grid-cols-2 gap-2 pt-1 text-xs">
                <div>
                  <dt className="text-ink-3">Залишилось зібрати</dt>
                  <dd className="tnum text-ink">
                    {formatMinor(goal.remainingMinor, goal.currency)}
                  </dd>
                </div>
                {goal.targetDate ? (
                  <div>
                    <dt className="text-ink-3">Термін</dt>
                    <dd className="text-ink">
                      {formatDateUk(goal.targetDate, { year: true })}
                      {goal.daysLeft !== null ? (
                        <span className={goal.daysLeft < 0 ? "text-negative" : "text-ink-3"}>
                          {goal.daysLeft < 0
                            ? " (минув)"
                            : ` · ${goal.daysLeft} ${pluralUk(goal.daysLeft, "день", "дні", "днів")}`}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                ) : null}
                {goal.monthlyNeedMinor !== null && !goal.done ? (
                  <div>
                    <dt className="text-ink-3">Треба відкладати</dt>
                    <dd className="tnum text-ink">
                      {formatMinor(goal.monthlyNeedMinor, goal.currency)}/міс
                    </dd>
                  </div>
                ) : null}
              </dl>

              {goal.note ? <p className="text-xs text-ink-3">{goal.note}</p> : null}

              {!goal.accountId ? (
                <Link
                  href={`/transactions/new?type=income`}
                  className="inline-block text-xs text-brand hover:underline"
                >
                  Додати внесок
                </Link>
              ) : null}

              <Disclosure label="Редагувати" variant="outline">
                <AutoForm action={saveGoal} fields={fields(goal)} submitLabel="Зберегти" />
              </Disclosure>
            </CardBody>
          </Card>
        ))}
      </div>

      {archived.length > 0 ? (
        <section className="mt-7">
          <h2 className="mb-2 text-xs font-medium text-ink-3">Архів</h2>
          <div className="space-y-2">
            {archived.map((goal) => (
              <Card key={goal.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="truncate text-sm text-ink-3">{goal.name}</span>
                <span className="flex items-center gap-2">
                  <span className="tnum text-sm text-ink-3">
                    {formatMinor(goal.savedMinor, goal.currency)}
                  </span>
                  <RowActionForm
                    action={toggleGoalArchived}
                    id={goal.id}
                    label="Відновити"
                    icon={<ArchiveRestore className="size-4" aria-hidden />}
                  />
                </span>
              </Card>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
