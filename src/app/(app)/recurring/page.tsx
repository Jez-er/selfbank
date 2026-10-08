import type { Metadata } from "next";
import { CalendarClock, Play, Power, Trash2 } from "lucide-react";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader } from "@/components/ui";
import { Money } from "@/components/money";
import { AutoForm } from "@/components/forms/auto-form";
import { Disclosure } from "@/components/disclosure";
import { BareActionForm, RowActionForm } from "@/components/crud";
import {
  deleteRecurring,
  postRecurringNow,
  runRecurringCatchUp,
  saveRecurring,
  toggleRecurringActive,
} from "@/actions/recurring";
import { pendingRules, specOf, upcomingOccurrences } from "@/lib/recurring-runner";
import { describeRecurrence, nextOccurrence } from "@/lib/recurring";
import { categoryTree, listAccounts } from "@/lib/queries/catalog";
import { db } from "@/db";
import { recurringRules } from "@/db/schema";
import { asc } from "drizzle-orm";
import { formatDateUk, formatRelativeDayUk, todayISO, WEEKDAY_NAMES } from "@/lib/dates";
import { minorToInputValue } from "@/lib/money";
import { RECURRING_CRON_ENABLED } from "@/lib/env";
import type { FieldSpec } from "@/components/forms/types";
import type { RecurringRule } from "@/db/schema";

export const metadata: Metadata = { title: "Регулярні платежі" };

export default async function RecurringPage() {
  const rules = db.select().from(recurringRules).orderBy(asc(recurringRules.nextRunAt)).all();
  const accounts = listAccounts(true);
  const pending = pendingRules();
  const upcoming = upcomingOccurrences(30);
  const today = todayISO();

  const accountOptions = accounts.map((a) => ({
    value: String(a.id),
    label: `${a.name} · ${a.currency}`,
  }));
  const categoryOptions = (["expense", "income"] as const).flatMap((kind) =>
    categoryTree(kind).flatMap(({ category, children }) => [
      { value: String(category.id), label: category.name, group: kind === "expense" ? "Витрати" : "Доходи" },
      ...children.map((child) => ({
        value: String(child.id),
        label: `${category.name} › ${child.name}`,
        group: kind === "expense" ? "Витрати" : "Доходи",
      })),
    ]),
  );

  const fields = (rule?: RecurringRule): FieldSpec[] => {
    const currency =
      accounts.find((a) => a.id === rule?.accountId)?.currency ?? accounts[0]?.currency ?? "UAH";
    return [
      ...(rule ? [{ name: "id", type: "hidden" as const, defaultValue: rule.id }] : []),
      {
        name: "name",
        label: "Назва",
        type: "text",
        required: true,
        defaultValue: rule?.name,
        placeholder: "Наприклад: Netflix",
      },
      {
        name: "type",
        label: "Тип",
        type: "select",
        defaultValue: rule?.type ?? "expense",
        options: [
          { value: "expense", label: "Витрата" },
          { value: "income", label: "Дохід" },
          { value: "transfer", label: "Переказ" },
        ],
      },
      {
        name: "accountId",
        label: "Рахунок",
        type: "select",
        required: true,
        defaultValue: rule?.accountId ?? accounts[0]?.id,
        options: accountOptions,
      },
      {
        name: "toAccountId",
        label: "Рахунок призначення",
        type: "select",
        defaultValue: rule?.toAccountId ?? "",
        hint: "Лише для переказів",
        options: [{ value: "", label: "—" }, ...accountOptions],
      },
      {
        name: "categoryId",
        label: "Категорія",
        type: "select",
        defaultValue: rule?.categoryId ?? "",
        options: [{ value: "", label: "Без категорії" }, ...categoryOptions],
      },
      {
        name: "amount",
        label: "Сума",
        type: "amount",
        currency: rule?.currency ?? currency,
        required: true,
        defaultValue: rule ? minorToInputValue(rule.amountMinor, rule.currency) : "",
      },
      {
        name: "frequency",
        label: "Періодичність",
        type: "select",
        defaultValue: rule?.frequency ?? "monthly",
        options: [
          { value: "daily", label: "Щодня" },
          { value: "weekly", label: "Щотижня" },
          { value: "monthly", label: "Щомісяця" },
          { value: "yearly", label: "Щороку" },
        ],
      },
      {
        name: "intervalCount",
        label: "Кожні N періодів",
        type: "number",
        min: 1,
        max: 365,
        defaultValue: rule?.intervalCount ?? 1,
      },
      {
        name: "dayOfMonth",
        label: "День місяця",
        type: "number",
        min: 1,
        max: 31,
        defaultValue: rule?.dayOfMonth ?? "",
        hint: "31 означає останній день місяця",
      },
      {
        name: "weekday",
        label: "День тижня",
        type: "select",
        defaultValue: rule?.weekday ?? "",
        hint: "Лише для щотижневих",
        options: [
          { value: "", label: "—" },
          ...WEEKDAY_NAMES.map((label, index) => ({ value: String(index), label })),
        ],
      },
      {
        name: "startDate",
        label: "Початок",
        type: "date",
        required: true,
        defaultValue: rule?.startDate ?? today,
      },
      {
        name: "endDate",
        label: "Завершення",
        type: "date",
        defaultValue: rule?.endDate ?? "",
        hint: "Необовʼязково",
      },
      {
        name: "note",
        label: "Нотатка",
        type: "textarea",
        defaultValue: rule?.note ?? "",
        wide: true,
      },
      {
        name: "autoPost",
        label: "Проводити автоматично",
        type: "checkbox",
        defaultValue: rule?.autoPost ?? true,
        hint: "Вимкніть, щоб підтверджувати кожну операцію вручну",
        wide: true,
      },
    ];
  };

  return (
    <>
      <PageHeader
        title="Регулярні платежі"
        subtitle="Створюють операції за розкладом — підписки, зарплата, оренда"
        action={<BareActionForm action={runRecurringCatchUp} label="Провести зараз" />}
      />

      {!RECURRING_CRON_ENABLED ? (
        <Alert tone="warning" title="Автоматичне проведення вимкнено">
          Змінна RECURRING_CRON=off. Операції створюються лише кнопкою «Провести зараз».
        </Alert>
      ) : null}

      {pending.length > 0 ? (
        <Card className="mb-4">
          <CardHeader
            title={`Очікують підтвердження: ${pending.length}`}
            subtitle="Ці правила не проводяться автоматично"
          />
          <CardBody>
            <ul className="space-y-2">
              {pending.map(({ rule, date, overdue }) => (
                <li key={rule.id} className="flex items-center justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ink">{rule.name}</span>
                    <span className="text-[11px] text-ink-3">
                      {formatDateUk(date, { year: true })}
                      {overdue ? " · прострочено" : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    <Money minor={rule.amountMinor} currency={rule.currency} tone="plain" />
                    <RowActionForm
                      action={postRecurringNow}
                      id={rule.id}
                      label="Провести"
                      variant="primary"
                      icon={<Play className="size-4" aria-hidden />}
                    />
                  </span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <Disclosure label="Нове правило">
        <Card className="max-w-3xl p-5">
          <AutoForm action={saveRecurring} fields={fields()} submitLabel="Створити" />
        </Card>
      </Disclosure>

      {upcoming.length > 0 ? (
        <Card className="mt-5">
          <CardHeader title="Найближчі 30 днів" />
          <CardBody>
            <ul className="space-y-1.5">
              {upcoming.map(({ rule, date, overdue }) => (
                <li key={`${rule.id}-${date}`} className="flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-2 text-sm">
                    <CalendarClock className="size-3.5 shrink-0 text-ink-3" aria-hidden />
                    <span className="truncate text-ink">{rule.name}</span>
                    <span className="shrink-0 text-[11px] text-ink-3">
                      {formatRelativeDayUk(date)}
                    </span>
                    {overdue ? <Badge tone="warning">прострочено</Badge> : null}
                  </span>
                  <Money
                    minor={rule.type === "expense" ? -rule.amountMinor : rule.amountMinor}
                    currency={rule.currency}
                    signed={rule.type !== "transfer"}
                    tone={rule.type === "transfer" ? "plain" : "auto"}
                    className="shrink-0 text-sm"
                  />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <div className="mt-5 space-y-3">
        {rules.length === 0 ? (
          <Card>
            <EmptyState
              title="Правил ще немає"
              description="Додайте підписку чи зарплату — операції створюватимуться самі."
            />
          </Card>
        ) : null}

        {rules.map((rule) => {
          const next = nextOccurrence(specOf(rule), rule.nextRunAt);
          return (
            <Card key={rule.id} className={rule.active ? "" : "opacity-60"}>
              <CardHeader
                title={
                  <span className="flex items-center gap-2">
                    {rule.name}
                    <Badge tone={rule.type === "income" ? "positive" : "neutral"}>
                      {rule.type === "income"
                        ? "дохід"
                        : rule.type === "transfer"
                          ? "переказ"
                          : "витрата"}
                    </Badge>
                    {!rule.active ? <Badge>вимкнено</Badge> : null}
                    {!rule.autoPost ? <Badge tone="warning">вручну</Badge> : null}
                  </span>
                }
                subtitle={
                  <>
                    {describeRecurrence(specOf(rule))}
                    {rule.active && next ? ` · наступний ${formatDateUk(next, { year: true })}` : ""}
                    {rule.lastPostedAt
                      ? ` · востаннє ${formatDateUk(rule.lastPostedAt, { year: true })}`
                      : ""}
                  </>
                }
                action={
                  <span className="flex items-center gap-2">
                    <Money
                      minor={rule.amountMinor}
                      currency={rule.currency}
                      tone="plain"
                      className="text-base font-semibold"
                    />
                    <RowActionForm
                      action={toggleRecurringActive}
                      id={rule.id}
                      label={rule.active ? "Вимкнути" : "Увімкнути"}
                      icon={<Power className="size-4" aria-hidden />}
                    />
                    <RowActionForm
                      action={deleteRecurring}
                      id={rule.id}
                      label="Видалити"
                      icon={<Trash2 className="size-4 text-negative" aria-hidden />}
                      confirm={`Видалити правило «${rule.name}»? Уже створені операції залишаться.`}
                    />
                  </span>
                }
              />
              <CardBody>
                <Disclosure label="Редагувати" variant="outline">
                  <AutoForm action={saveRecurring} fields={fields(rule)} submitLabel="Зберегти" />
                </Disclosure>
              </CardBody>
            </Card>
          );
        })}
      </div>

      <Alert tone="brand" title="Як це працює">
        Правила перевіряються при старті застосунку та щогодини. Якщо контейнер був вимкнений,
        пропущені операції дозаповнюються одноразово — без дублікатів.
      </Alert>
    </>
  );
}
