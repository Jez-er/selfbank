import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, RotateCcw, Trash2 } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, Progress } from "@/components/ui";
import { Money } from "@/components/money";
import { AutoForm } from "@/components/forms/auto-form";
import { Disclosure } from "@/components/disclosure";
import { RowActionForm } from "@/components/crud";
import { deleteDebt, saveDebt, toggleDebtSettled } from "@/actions/debts";
import { debtProgress } from "@/lib/queries/debts";
import { getBaseCurrency } from "@/lib/queries/settings";
import { CURRENCIES, CURRENCY_CODES, formatMinor, minorToInputValue } from "@/lib/money";
import { formatDateUk } from "@/lib/dates";
import { pluralUk } from "@/lib/utils";
import type { FieldSpec } from "@/components/forms/types";

export const metadata: Metadata = { title: "Борги" };

export default async function DebtsPage() {
  const baseCurrency = getBaseCurrency();
  const debts = debtProgress(true);
  const open = debts.filter((d) => !d.done);
  const closed = debts.filter((d) => d.done);

  const fields = (debt?: (typeof debts)[number]): FieldSpec[] => [
    ...(debt ? [{ name: "id", type: "hidden" as const, defaultValue: debt.id }] : []),
    {
      name: "counterparty",
      label: "Хто",
      type: "text",
      required: true,
      defaultValue: debt?.counterparty,
      placeholder: "Імʼя або назва",
    },
    {
      name: "direction",
      label: "Напрямок",
      type: "select",
      defaultValue: debt?.direction ?? "i_owe",
      options: [
        { value: "i_owe", label: "Я винен" },
        { value: "owed_to_me", label: "Мені винні" },
      ],
    },
    {
      name: "currency",
      label: "Валюта",
      type: "select",
      defaultValue: debt?.currency ?? baseCurrency,
      options: CURRENCY_CODES.map((code) => ({
        value: code,
        label: `${code} — ${CURRENCIES[code]!.name}`,
      })),
    },
    {
      name: "principal",
      label: "Сума боргу",
      type: "amount",
      currency: debt?.currency ?? baseCurrency,
      required: true,
      defaultValue: debt ? minorToInputValue(debt.principalMinor, debt.currency) : "",
    },
    {
      name: "dueDate",
      label: "Повернути до",
      type: "date",
      defaultValue: debt?.dueDate ?? "",
    },
    { name: "note", label: "Нотатка", type: "textarea", defaultValue: debt?.note ?? "", wide: true },
  ];

  // Totals stay per currency: a debt is owed in the currency it was agreed in.
  const byCurrency = new Map<string, { iOwe: number; owedToMe: number }>();
  for (const debt of open) {
    const entry = byCurrency.get(debt.currency) ?? { iOwe: 0, owedToMe: 0 };
    if (debt.direction === "i_owe") entry.iOwe += debt.outstandingMinor;
    else entry.owedToMe += debt.outstandingMinor;
    byCurrency.set(debt.currency, entry);
  }

  return (
    <>
      <PageHeader
        title="Борги"
        subtitle="Погашення — це звичайна операція, позначена цим боргом"
      />

      {byCurrency.size > 0 ? (
        <div className="mb-4 grid gap-3 [&>*]:min-w-0 sm:grid-cols-2">
          {[...byCurrency].map(([currency, totals]) => (
            <Card key={currency} className="p-4">
              <p className="mb-2 text-xs font-medium text-ink-3">Разом у {currency}</p>
              <dl className="flex items-baseline justify-between gap-3 text-sm">
                <div>
                  <dt className="text-ink-3">Я винен</dt>
                  <dd>
                    <Money minor={totals.iOwe} currency={currency} tone="negative" />
                  </dd>
                </div>
                <div className="text-right">
                  <dt className="text-ink-3">Мені винні</dt>
                  <dd>
                    <Money minor={totals.owedToMe} currency={currency} tone="positive" />
                  </dd>
                </div>
              </dl>
            </Card>
          ))}
        </div>
      ) : null}

      <Disclosure label="Новий борг">
        <Card className="max-w-2xl p-5">
          <AutoForm action={saveDebt} fields={fields()} submitLabel="Створити" />
        </Card>
      </Disclosure>

      <div className="mt-5 grid gap-3 [&>*]:min-w-0 lg:grid-cols-2">
        {open.length === 0 ? (
          <Card className="lg:col-span-2">
            <EmptyState title="Активних боргів немає" />
          </Card>
        ) : null}

        {open.map((debt) => (
          <Card key={debt.id}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  {debt.counterparty}
                  <Badge tone={debt.direction === "i_owe" ? "negative" : "positive"}>
                    {debt.direction === "i_owe" ? "я винен" : "мені винні"}
                  </Badge>
                  {debt.overdue ? (
                    <Badge tone="negative">
                      <AlertTriangle className="size-3" aria-hidden />
                      прострочено
                    </Badge>
                  ) : null}
                </span>
              }
              subtitle={
                debt.dueDate
                  ? `До ${formatDateUk(debt.dueDate, { year: true })}${
                      debt.daysLeft !== null && debt.daysLeft >= 0
                        ? ` · ${debt.daysLeft} ${pluralUk(debt.daysLeft, "день", "дні", "днів")}`
                        : ""
                    }`
                  : "Без терміну"
              }
              action={
                <span className="flex items-center gap-1">
                  <RowActionForm
                    action={toggleDebtSettled}
                    id={debt.id}
                    label="Закрити борг"
                    icon={<CheckCircle2 className="size-4" aria-hidden />}
                    confirm={`Позначити борг «${debt.counterparty}» закритим?`}
                  />
                  <RowActionForm
                    action={deleteDebt}
                    id={debt.id}
                    label="Видалити"
                    icon={<Trash2 className="size-4 text-negative" aria-hidden />}
                    confirm={`Видалити борг «${debt.counterparty}»?`}
                  />
                </span>
              }
            />
            <CardBody className="space-y-2">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="tnum text-ink-2">
                  Погашено {formatMinor(debt.paidMinor, debt.currency)} з{" "}
                  {formatMinor(debt.principalMinor, debt.currency)}
                </span>
                <span className="tnum font-medium">
                  <Money
                    minor={debt.outstandingMinor}
                    currency={debt.currency}
                    tone={debt.direction === "i_owe" ? "negative" : "positive"}
                  />
                </span>
              </div>
              <Progress value={debt.progressPercent} tone="positive" />

              {debt.note ? <p className="text-xs text-ink-3">{debt.note}</p> : null}

              <Link
                href={`/transactions/new?type=${debt.direction === "i_owe" ? "expense" : "income"}`}
                className="inline-block text-xs text-brand hover:underline"
              >
                {debt.direction === "i_owe" ? "Записати погашення" : "Записати повернення"}
              </Link>

              <Disclosure label="Редагувати" variant="outline">
                <AutoForm action={saveDebt} fields={fields(debt)} submitLabel="Зберегти" />
              </Disclosure>
            </CardBody>
          </Card>
        ))}
      </div>

      {closed.length > 0 ? (
        <section className="mt-7">
          <h2 className="mb-2 text-xs font-medium text-ink-3">Закриті</h2>
          <div className="space-y-2">
            {closed.map((debt) => (
              <Card key={debt.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="flex min-w-0 items-center gap-2">
                  <CheckCircle2 className="size-4 shrink-0 text-positive" aria-hidden />
                  <span className="truncate text-sm text-ink-3">{debt.counterparty}</span>
                </span>
                <span className="flex items-center gap-2">
                  <span className="tnum text-sm text-ink-3">
                    {formatMinor(debt.principalMinor, debt.currency)}
                  </span>
                  <RowActionForm
                    action={toggleDebtSettled}
                    id={debt.id}
                    label="Відкрити знову"
                    icon={<RotateCcw className="size-4" aria-hidden />}
                  />
                  <RowActionForm
                    action={deleteDebt}
                    id={debt.id}
                    label="Видалити"
                    icon={<Trash2 className="size-4 text-negative" aria-hidden />}
                    confirm={`Видалити борг «${debt.counterparty}»?`}
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
