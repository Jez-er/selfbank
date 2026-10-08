import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeftRight, Minus, Plus } from "lucide-react";
import { Card, PageHeader } from "@/components/ui";
import { TransactionForm } from "@/components/forms/transaction-form";
import { saveTransaction } from "@/actions/transactions";
import { categoryTree, listAccounts, listDebts, listGoals } from "@/lib/queries/catalog";
import { todayISO } from "@/lib/dates";
import { formatMinor } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Нова операція" };

type OperationType = "income" | "expense" | "transfer";

const TABS: Array<{ id: OperationType; label: string; icon: typeof Plus; tone: string }> = [
  { id: "expense", label: "Витрата", icon: Minus, tone: "text-negative" },
  { id: "income", label: "Дохід", icon: Plus, tone: "text-positive" },
  { id: "transfer", label: "Переказ", icon: ArrowLeftRight, tone: "text-brand" },
];

/**
 * Tabs are plain links carrying `?type=`, not client state: the category list
 * is filtered per operation type on the server, and the page keeps working
 * without JavaScript.
 */
export default async function NewTransactionPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; account?: string }>;
}) {
  const params = await searchParams;
  const type: OperationType =
    params.type === "income" || params.type === "transfer" ? params.type : "expense";

  const accounts = listAccounts();
  const tree = type === "transfer" ? [] : categoryTree(type);
  const categories = tree.flatMap(({ category, children }) => [
    { id: category.id, name: category.name, parentName: null },
    ...children.map((child) => ({
      id: child.id,
      name: child.name,
      parentName: category.name,
    })),
  ]);

  const goals = listGoals().map((g) => ({
    id: g.id,
    label: `${g.name} · ${formatMinor(g.targetMinor, g.currency)}`,
  }));
  const debts = listDebts().map((d) => ({
    id: d.id,
    label: `${d.counterparty} · ${d.direction === "i_owe" ? "я винен" : "мені винні"}`,
  }));

  const preselected = Number(params.account);

  return (
    <>
      <PageHeader
        title="Нова операція"
        subtitle="Додайте надходження, витрату або переказ між рахунками"
      />

      <div
        className="mb-4 inline-flex rounded-xl border border-border bg-surface p-1"
        role="tablist"
        aria-label="Тип операції"
      >
        {TABS.map((tab) => {
          const active = tab.id === type;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.id}
              href={`/transactions/new?type=${tab.id}`}
              role="tab"
              aria-selected={active}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors",
                active ? "bg-surface-2 text-ink" : "text-ink-3 hover:text-ink",
              )}
            >
              <Icon className={cn("size-4", active && tab.tone)} aria-hidden />
              {tab.label}
            </Link>
          );
        })}
      </div>

      <Card className="max-w-2xl p-5">
        <TransactionForm
          key={type}
          type={type}
          action={saveTransaction}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
          categories={categories}
          goals={goals}
          debts={debts}
          defaults={{
            occurredAt: todayISO(),
            accountId: Number.isInteger(preselected) && preselected > 0 ? preselected : undefined,
          }}
          submitLabel={type === "transfer" ? "Переказати" : "Додати"}
        />
      </Card>
    </>
  );
}
