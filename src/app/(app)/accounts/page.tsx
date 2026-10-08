import type { Metadata } from "next";
import Link from "next/link";
import { Archive, ArchiveRestore, Plus, Trash2 } from "lucide-react";
import { Badge, Card, CardBody, CardHeader, Dot, EmptyState, PageHeader } from "@/components/ui";
import { Money } from "@/components/money";
import { AutoForm } from "@/components/forms/auto-form";
import { Disclosure } from "@/components/disclosure";
import { RowActionForm } from "@/components/crud";
import { deleteAccount, saveAccount, toggleAccountArchived } from "@/actions/accounts";
import { accountBalances, totalBalance } from "@/lib/queries/balances";
import { getBaseCurrency } from "@/lib/queries/settings";
import { CURRENCIES, CURRENCY_CODES, formatMinor, minorToInputValue } from "@/lib/money";
import { pluralUk } from "@/lib/utils";
import type { FieldSpec } from "@/components/forms/types";

export const metadata: Metadata = { title: "Рахунки" };

const ACCOUNT_TYPES: Record<string, string> = {
  cash: "Готівка",
  card: "Картка",
  savings: "Накопичення",
  crypto: "Крипто",
  other: "Інше",
};

function accountFields(
  baseCurrency: string,
  account?: {
    id: number;
    name: string;
    type: string;
    currency: string;
    openingBalanceMinor: number;
    color: string;
  },
): FieldSpec[] {
  return [
    ...(account ? [{ name: "id", type: "hidden" as const, defaultValue: account.id }] : []),
    {
      name: "name",
      label: "Назва",
      type: "text",
      required: true,
      defaultValue: account?.name,
      placeholder: "Наприклад: Монобанк",
    },
    {
      name: "type",
      label: "Тип",
      type: "select",
      defaultValue: account?.type ?? "card",
      options: Object.entries(ACCOUNT_TYPES).map(([value, label]) => ({ value, label })),
    },
    {
      name: "currency",
      label: "Валюта",
      type: "select",
      defaultValue: account?.currency ?? baseCurrency,
      hint: account ? "Не змінюється, якщо є операції" : undefined,
      options: CURRENCY_CODES.map((code) => ({
        value: code,
        label: `${code} — ${CURRENCIES[code]!.name}`,
      })),
    },
    {
      name: "openingBalance",
      label: "Початковий баланс",
      type: "amount",
      currency: account?.currency ?? baseCurrency,
      defaultValue: account ? minorToInputValue(account.openingBalanceMinor, account.currency) : "0",
      hint: "Скільки було на рахунку до першої операції",
    },
    { name: "color", label: "Колір", type: "color", defaultValue: account?.color ?? "#2a78d6" },
  ];
}

export default async function AccountsPage() {
  const baseCurrency = getBaseCurrency();
  const accounts = accountBalances({ includeArchived: true });
  const total = totalBalance();
  const active = accounts.filter((a) => !a.archived);
  const archived = accounts.filter((a) => a.archived);

  return (
    <>
      <PageHeader
        title="Рахунки"
        subtitle={
          <>
            Разом: <Money minor={total.totalMinor} currency={baseCurrency} tone="plain" />
            {total.unconverted.length > 0 ? ` (без ${total.unconverted.join(", ")})` : ""}
          </>
        }
      />

      <Disclosure label="Новий рахунок">
        <Card className="max-w-2xl p-5">
          <AutoForm action={saveAccount} fields={accountFields(baseCurrency)} submitLabel="Створити" />
        </Card>
      </Disclosure>

      <div className="mt-5 space-y-3">
        {active.length === 0 ? (
          <Card>
            <EmptyState
              title="Немає рахунків"
              description="Створіть перший рахунок, щоб почати вести облік."
              icon={<Plus className="size-5" aria-hidden />}
            />
          </Card>
        ) : null}

        {active.map((account) => (
          <Card key={account.id}>
            <CardHeader
              title={
                <span className="flex items-center gap-2">
                  <Dot color={account.color} />
                  {account.name}
                  <Badge>{ACCOUNT_TYPES[account.type] ?? account.type}</Badge>
                </span>
              }
              subtitle={`${account.transactionCount} ${pluralUk(account.transactionCount, "операція", "операції", "операцій")} · початковий баланс ${formatMinor(account.openingBalanceMinor, account.currency)}`}
              action={
                <span className="text-right">
                  <Money
                    minor={account.balanceMinor}
                    currency={account.currency}
                    tone="plain"
                    className="block text-base font-semibold"
                  />
                  {account.currency !== baseCurrency ? (
                    <span className="tnum block text-[11px] text-ink-3">
                      {account.baseBalanceMinor === null
                        ? "курс не задано"
                        : `≈ ${formatMinor(account.baseBalanceMinor, baseCurrency)}`}
                    </span>
                  ) : null}
                </span>
              }
            />
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/transactions?accountId=${account.id}`}
                  className="text-xs text-brand hover:underline"
                >
                  Операції
                </Link>
                <Link
                  href={`/transactions/new?account=${account.id}`}
                  className="text-xs text-brand hover:underline"
                >
                  Додати операцію
                </Link>
                <span className="flex-1" />
                <RowActionForm
                  action={toggleAccountArchived}
                  id={account.id}
                  label="Заархівувати"
                  icon={<Archive className="size-4" aria-hidden />}
                />
                <RowActionForm
                  action={deleteAccount}
                  id={account.id}
                  label="Видалити"
                  variant="ghost"
                  icon={<Trash2 className="size-4 text-negative" aria-hidden />}
                  confirm={`Видалити рахунок «${account.name}»?`}
                />
              </div>

              <Disclosure label="Редагувати" variant="outline">
                <AutoForm
                  action={saveAccount}
                  fields={accountFields(baseCurrency, account)}
                  submitLabel="Зберегти"
                />
              </Disclosure>
            </CardBody>
          </Card>
        ))}
      </div>

      {archived.length > 0 ? (
        <section className="mt-7">
          <h2 className="mb-2 text-xs font-medium text-ink-3">Архів</h2>
          <div className="space-y-2">
            {archived.map((account) => (
              <Card key={account.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <span className="flex min-w-0 items-center gap-2">
                  <Dot color={account.color} />
                  <span className="truncate text-sm text-ink-3">{account.name}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Money
                    minor={account.balanceMinor}
                    currency={account.currency}
                    tone="plain"
                    className="text-sm text-ink-3"
                  />
                  <RowActionForm
                    action={toggleAccountArchived}
                    id={account.id}
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
