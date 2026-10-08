import Link from "next/link";
import { Button, Card, Field, Input, Select } from "@/components/ui";

export interface FilterValues {
  from?: string;
  to?: string;
  type?: string;
  accountId?: string;
  categoryId?: string;
  search?: string;
  min?: string;
  max?: string;
}

/**
 * Plain GET form: the filters end up in the query string, so a filtered view
 * can be bookmarked, shared and reloaded, and the page works without JS.
 */
export function TransactionFilters({
  values,
  accounts,
  categories,
  baseCurrency,
  resultCount,
}: {
  values: FilterValues;
  accounts: Array<{ id: number; name: string; currency: string }>;
  categories: Array<{ id: number; name: string; kind: string; parentName: string | null }>;
  baseCurrency: string;
  resultCount: number;
}) {
  const active = Object.entries(values).filter(([, v]) => v && v !== "").length;

  return (
    <Card className="mb-4 p-4">
      <form method="get" action="/transactions" className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Від" htmlFor="from">
            <Input id="from" name="from" type="date" defaultValue={values.from ?? ""} />
          </Field>
          <Field label="До" htmlFor="to">
            <Input id="to" name="to" type="date" defaultValue={values.to ?? ""} />
          </Field>
          <Field label="Тип" htmlFor="type">
            <Select id="type" name="type" defaultValue={values.type ?? ""}>
              <option value="">Усі</option>
              <option value="expense">Витрати</option>
              <option value="income">Доходи</option>
              <option value="transfer">Перекази</option>
            </Select>
          </Field>
          <Field label="Рахунок" htmlFor="accountId">
            <Select id="accountId" name="accountId" defaultValue={values.accountId ?? ""}>
              <option value="">Усі</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Категорія" htmlFor="categoryId">
            <Select id="categoryId" name="categoryId" defaultValue={values.categoryId ?? ""}>
              <option value="">Усі</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parentName ? `${c.parentName} › ${c.name}` : c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Пошук у нотатках" htmlFor="search">
            <Input
              id="search"
              name="search"
              type="search"
              defaultValue={values.search ?? ""}
              placeholder="напр. Сільпо"
            />
          </Field>
          <Field label={`Сума від (${baseCurrency})`} htmlFor="min">
            <Input id="min" name="min" inputMode="decimal" defaultValue={values.min ?? ""} />
          </Field>
          <Field label={`Сума до (${baseCurrency})`} htmlFor="max">
            <Input id="max" name="max" inputMode="decimal" defaultValue={values.max ?? ""} />
          </Field>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" size="sm">
            Застосувати
          </Button>
          {active > 0 ? (
            <Link href="/transactions" className="text-xs text-ink-3 underline">
              Скинути ({active})
            </Link>
          ) : null}
          <span className="flex-1" />
          <span className="text-xs text-ink-3">Знайдено: {resultCount}</span>
          <Link
            href={`/api/transactions/export${toQuery(values)}`}
            className="text-xs text-brand hover:underline"
          >
            Експорт CSV
          </Link>
        </div>
      </form>
    </Card>
  );
}

function toQuery(values: FilterValues): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}
