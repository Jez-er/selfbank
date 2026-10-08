import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { TransactionForm } from "@/components/forms/transaction-form";
import { saveTransaction } from "@/actions/transactions";
import { getTransaction } from "@/lib/queries/transactions";
import { categoryTree, listAccounts, listDebts, listGoals } from "@/lib/queries/catalog";
import { formatMinor, minorToInputValue } from "@/lib/money";

export const metadata: Metadata = { title: "Редагування операції" };

export default async function EditTransactionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const transaction = getTransaction(Number(id));
  if (!transaction) notFound();

  const accounts = listAccounts(true);
  const tree = transaction.type === "transfer" ? [] : categoryTree(transaction.type);
  const categories = tree.flatMap(({ category, children }) => [
    { id: category.id, name: category.name, parentName: null },
    ...children.map((child) => ({ id: child.id, name: child.name, parentName: category.name })),
  ]);

  return (
    <>
      <PageHeader
        title="Редагування операції"
        subtitle={
          <Link href="/transactions" className="text-brand hover:underline">
            ← До списку операцій
          </Link>
        }
      />

      <Card className="max-w-2xl p-5">
        <TransactionForm
          type={transaction.type}
          action={saveTransaction}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
          categories={categories}
          goals={listGoals(true).map((g) => ({
            id: g.id,
            label: `${g.name} · ${formatMinor(g.targetMinor, g.currency)}`,
          }))}
          debts={listDebts(true).map((d) => ({
            id: d.id,
            label: `${d.counterparty} · ${d.direction === "i_owe" ? "я винен" : "мені винні"}`,
          }))}
          defaults={{
            id: transaction.id,
            accountId: transaction.accountId,
            toAccountId: transaction.toAccountId ?? undefined,
            amount: minorToInputValue(transaction.amountMinor, transaction.currency),
            toAmount:
              transaction.toAmountMinor !== null && transaction.toAccountCurrency
                ? minorToInputValue(transaction.toAmountMinor, transaction.toAccountCurrency)
                : undefined,
            categoryId: transaction.categoryId ?? undefined,
            goalId: transaction.goalId ?? undefined,
            debtId: transaction.debtId ?? undefined,
            occurredAt: transaction.occurredAt,
            note: transaction.note ?? undefined,
          }}
          submitLabel="Зберегти зміни"
          cancelHref="/transactions"
        />
      </Card>
    </>
  );
}
