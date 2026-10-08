import type { Metadata } from "next";
import Link from "next/link";
import { Copy, Pencil, Repeat, Trash2 } from "lucide-react";
import { Badge, Card, CardBody, Dot, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { Money } from "@/components/money";
import { RowActionForm } from "@/components/crud";
import { TransactionFilters } from "@/components/transaction-filters";
import { deleteTransaction, duplicateTransaction } from "@/actions/transactions";
import { listTransactions } from "@/lib/queries/transactions";
import { listAccounts, listCategories } from "@/lib/queries/catalog";
import { getBaseCurrency } from "@/lib/queries/settings";
import { parseFilters } from "@/lib/filters";
import { formatDateUk, formatRelativeDayUk } from "@/lib/dates";
import { formatMinor } from "@/lib/money";

export const metadata: Metadata = { title: "Транзакції" };

const PAGE_SIZE = 50;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const raw = await searchParams;
  const baseCurrency = getBaseCurrency();
  const filters = parseFilters(raw, baseCurrency);
  const page = Math.max(1, Number(raw.page) || 1);

  const result = listTransactions(filters, {
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });
  const pageCount = Math.max(1, Math.ceil(result.total / PAGE_SIZE));

  const accounts = listAccounts(true);
  const categories = listCategories(true);
  const parentName = new Map(categories.map((c) => [c.id, c.name]));

  // Transactions are grouped by day, which is how people scan a ledger.
  const groups = groupByDay(result.rows);

  return (
    <>
      <PageHeader
        title="Транзакції"
        subtitle={
          <>
            Доходи <Money minor={result.incomeMinor} currency={baseCurrency} tone="plain" /> ·
            витрати <Money minor={result.expenseMinor} currency={baseCurrency} tone="plain" /> ·
            різниця{" "}
            <Money
              minor={result.incomeMinor - result.expenseMinor}
              currency={baseCurrency}
              signed
            />
          </>
        }
        action={
          <Link href="/transactions/new" className={buttonClass({ size: "sm" })}>
            Додати операцію
          </Link>
        }
      />

      <TransactionFilters
        values={{
          from: raw.from,
          to: raw.to,
          type: raw.type,
          accountId: raw.accountId,
          categoryId: raw.categoryId,
          search: raw.search,
          min: raw.min,
          max: raw.max,
        }}
        accounts={accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency }))}
        categories={categories.map((c) => ({
          id: c.id,
          name: c.name,
          kind: c.kind,
          parentName: c.parentId ? (parentName.get(c.parentId) ?? null) : null,
        }))}
        baseCurrency={baseCurrency}
        resultCount={result.total}
      />

      {result.rows.length === 0 ? (
        <Card>
          <EmptyState
            title="Нічого не знайдено"
            description="Спробуйте змінити фільтри або додайте першу операцію."
            action={
              <Link href="/transactions/new" className="text-sm text-brand underline">
                Додати операцію
              </Link>
            }
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map(([date, rows]) => (
            <Card key={date}>
              <div className="flex items-baseline justify-between gap-2 px-5 pt-3 pb-1">
                <h2 className="text-xs font-medium text-ink-3">
                  {formatDateUk(date, { year: true })} · {formatRelativeDayUk(date)}
                </h2>
                <span className="tnum text-xs text-ink-3">
                  {formatMinor(dayNet(rows), baseCurrency, { signed: true })}
                </span>
              </div>
              <CardBody className="pt-0">
                <ul className="divide-y divide-border">
                  {rows.map((tx) => (
                    <li key={tx.id} className="flex items-center gap-3 py-2.5">
                      <Dot color={tx.categoryColor ?? tx.accountColor} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-ink">
                          {tx.note ?? tx.categoryName ?? typeLabel(tx.type)}
                        </p>
                        <p className="flex flex-wrap items-center gap-x-1.5 truncate text-[11px] text-ink-3">
                          <span>{tx.accountName}</span>
                          {tx.toAccountName ? <span>→ {tx.toAccountName}</span> : null}
                          {tx.categoryName ? <span>· {tx.categoryName}</span> : null}
                          {tx.goalName ? <Badge tone="brand">ціль: {tx.goalName}</Badge> : null}
                          {tx.debtName ? <Badge tone="warning">борг: {tx.debtName}</Badge> : null}
                          {tx.recurringId ? (
                            <Badge>
                              <Repeat className="size-3" aria-hidden />
                              регулярна
                            </Badge>
                          ) : null}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <Money
                          minor={tx.type === "expense" ? -tx.amountMinor : tx.amountMinor}
                          currency={tx.currency}
                          tone={tx.type === "transfer" ? "plain" : "auto"}
                          signed={tx.type !== "transfer"}
                          className="block text-sm font-medium"
                        />
                        {tx.currency !== baseCurrency ? (
                          <span className="tnum block text-[11px] text-ink-3">
                            ≈ {formatMinor(tx.baseAmountMinor, baseCurrency)}
                          </span>
                        ) : null}
                        {tx.toAmountMinor !== null && tx.toAccountCurrency !== tx.currency ? (
                          <span className="tnum block text-[11px] text-ink-3">
                            → {formatMinor(tx.toAmountMinor, tx.toAccountCurrency ?? tx.currency)}
                          </span>
                        ) : null}
                      </div>

                      <div className="flex shrink-0 items-center gap-0.5">
                        <Link
                          href={`/transactions/${tx.id}`}
                          className={buttonClass({ variant: "ghost", size: "icon" })}
                          title="Редагувати"
                        >
                          <Pencil className="size-4" aria-hidden />
                        </Link>
                        <RowActionForm
                          action={duplicateTransaction}
                          id={tx.id}
                          label="Дублювати на сьогодні"
                          icon={<Copy className="size-4" aria-hidden />}
                        />
                        <RowActionForm
                          action={deleteTransaction}
                          id={tx.id}
                          label="Видалити"
                          icon={<Trash2 className="size-4 text-negative" aria-hidden />}
                          confirm="Видалити цю операцію?"
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {pageCount > 1 ? (
        <nav className="mt-5 flex items-center justify-center gap-2" aria-label="Сторінки">
          {page > 1 ? (
            <Link
              href={pageHref(raw, page - 1)}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              Назад
            </Link>
          ) : null}
          <span className="text-xs text-ink-3">
            Сторінка {page} з {pageCount}
          </span>
          {page < pageCount ? (
            <Link
              href={pageHref(raw, page + 1)}
              className={buttonClass({ variant: "outline", size: "sm" })}
            >
              Далі
            </Link>
          ) : null}
        </nav>
      ) : null}
    </>
  );
}

function groupByDay<T extends { occurredAt: string }>(rows: T[]): Array<[string, T[]]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = map.get(row.occurredAt);
    if (bucket) bucket.push(row);
    else map.set(row.occurredAt, [row]);
  }
  return [...map.entries()];
}

/** Day total in the base currency; transfers net to zero and are excluded. */
function dayNet(rows: Array<{ type: string; baseAmountMinor: number }>): number {
  return rows.reduce((sum, row) => {
    if (row.type === "income") return sum + row.baseAmountMinor;
    if (row.type === "expense") return sum - row.baseAmountMinor;
    return sum;
  }, 0);
}

function typeLabel(type: string): string {
  return type === "income" ? "Надходження" : type === "transfer" ? "Переказ" : "Витрата";
}

function pageHref(raw: Record<string, string | undefined>, page: number): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    if (value && key !== "page") params.set(key, value);
  }
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/transactions?${query}` : "/transactions";
}
