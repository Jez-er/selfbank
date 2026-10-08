import type { Metadata } from "next";
import { Database, Download, Trash2 } from "lucide-react";
import { Alert, Badge, Card, CardBody, CardHeader, EmptyState, PageHeader, buttonClass } from "@/components/ui";
import { AutoForm } from "@/components/forms/auto-form";
import { RowActionForm } from "@/components/crud";
import { ImportForm } from "@/components/import-form";
import { deleteRate, saveBaseCurrency, saveRate } from "@/actions/settings";
import { listRateRows, latestRates, missingRateCurrencies } from "@/lib/queries/fx";
import { getBaseCurrency } from "@/lib/queries/settings";
import { currentCounts } from "@/lib/backup";
import { listAccounts } from "@/lib/queries/catalog";
import { CURRENCIES, CURRENCY_CODES } from "@/lib/money";
import { formatDateUk, todayISO } from "@/lib/dates";
import { AUTH_USERNAME } from "@/lib/env";
import type { FieldSpec } from "@/components/forms/types";

export const metadata: Metadata = { title: "Налаштування" };

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ imported?: string; importError?: string }>;
}) {
  const { imported, importError } = await searchParams;
  const baseCurrency = getBaseCurrency();
  const rates = listRateRows();
  const latest = latestRates();
  const missing = missingRateCurrencies();
  const counts = currentCounts();
  const accountCurrencies = [...new Set(listAccounts(true).map((a) => a.currency))].filter(
    (c) => c !== baseCurrency,
  );

  const rateFields: FieldSpec[] = [
    {
      name: "quote",
      label: "Валюта",
      type: "select",
      defaultValue: accountCurrencies[0] ?? "USD",
      options: CURRENCY_CODES.filter((c) => c !== baseCurrency).map((code) => ({
        value: code,
        label: `${code} — ${CURRENCIES[code]!.name}`,
      })),
    },
    {
      name: "rate",
      label: `Скільки ${baseCurrency} за 1 одиницю`,
      type: "text",
      required: true,
      placeholder: "41.50",
      hint: "Десятковий дріб, напр. 41.5",
    },
    { name: "asOf", label: "Дата курсу", type: "date", required: true, defaultValue: todayISO() },
  ];

  return (
    <>
      <PageHeader title="Налаштування" />

      {imported ? <Alert tone="positive" title="Імпорт завершено">{imported}</Alert> : null}
      {importError ? <Alert tone="negative" title="Імпорт не вдався">{importError}</Alert> : null}

      <div className="grid gap-4 [&>*]:min-w-0 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Базова валюта"
            subtitle="У ній рахуються всі звіти, бюджети та загальний баланс"
          />
          <CardBody>
            <AutoForm
              action={saveBaseCurrency}
              compact
              fields={[
                {
                  name: "baseCurrency",
                  label: "Валюта",
                  type: "select",
                  defaultValue: baseCurrency,
                  options: CURRENCY_CODES.map((code) => ({
                    value: code,
                    label: `${code} — ${CURRENCIES[code]!.name}`,
                  })),
                },
              ]}
              submitLabel="Зберегти"
            />
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Доступ" subtitle="Налаштовується змінними середовища" />
          <CardBody className="space-y-2 text-sm">
            <p className="flex justify-between gap-2">
              <span className="text-ink-3">Логін</span>
              <span className="text-ink">{AUTH_USERNAME}</span>
            </p>
            <p className="text-xs leading-relaxed text-ink-3">
              Пароль зберігається як bcrypt-хеш у змінній <code>AUTH_PASSWORD_HASH</code>. Щоб його
              змінити, виконайте <code>npm run hash-password</code> і перезапустіть контейнер. У
              файлі <code>.env</code> знаки <code>$</code> у хеші треба екранувати як{" "}
              <code>\$</code>.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Курси валют"
          subtitle={`Скільки ${baseCurrency} коштує одна одиниця валюти. Операція назавжди запамʼятовує курс на свою дату.`}
        />
        <CardBody className="space-y-4">
          {missing.length > 0 ? (
            <Alert tone="warning" title="Немає курсу">
              Для {missing.join(", ")} курс не заданий — баланси в цих валютах не входять у
              загальну суму.
            </Alert>
          ) : null}

          <AutoForm action={saveRate} fields={rateFields} submitLabel="Додати курс" />

          {rates.length === 0 ? (
            <EmptyState title="Курсів ще немає" />
          ) : (
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th scope="col" className="py-2 text-xs font-medium text-ink-3">
                    Валюта
                  </th>
                  <th scope="col" className="py-2 text-right text-xs font-medium text-ink-3">
                    Курс
                  </th>
                  <th scope="col" className="py-2 text-right text-xs font-medium text-ink-3">
                    Дата
                  </th>
                  <th scope="col" className="py-2" />
                </tr>
              </thead>
              <tbody>
                {rates.map((rate) => (
                  <tr key={rate.id} className="border-b border-border/50">
                    <td className="py-1.5">
                      <span className="flex items-center gap-2">
                        {rate.quote}
                        {latest.get(rate.quote)?.asOf === rate.asOf ? (
                          <Badge tone="brand">актуальний</Badge>
                        ) : null}
                      </span>
                    </td>
                    <td className="tnum py-1.5 text-right text-ink">
                      {rate.rateToBase} {baseCurrency}
                    </td>
                    <td className="py-1.5 text-right text-ink-3">
                      {formatDateUk(rate.asOf, { year: true })}
                    </td>
                    <td className="py-1.5 text-right">
                      <RowActionForm
                        action={deleteRate}
                        id={rate.id}
                        label="Видалити"
                        icon={<Trash2 className="size-4 text-negative" aria-hidden />}
                        className="inline-block"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <div className="mt-4 grid gap-4 [&>*]:min-w-0 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Експорт даних"
            subtitle="Повна копія всіх таблиць разом з ідентифікаторами — відновлює стан один в один"
          />
          <CardBody className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              {Object.entries(counts).map(([table, n]) => (
                <div key={table} className="flex justify-between gap-2">
                  <dt className="text-ink-3">{TABLE_LABELS[table] ?? table}</dt>
                  <dd className="tnum text-ink">{n}</dd>
                </div>
              ))}
            </dl>

            <div className="flex flex-wrap gap-2">
              <a href="/api/backup/export" className={buttonClass({ size: "sm" })} download>
                <Download className="size-4" aria-hidden />
                JSON-копія
              </a>
              <a
                href="/api/backup/sqlite"
                className={buttonClass({ variant: "outline", size: "sm" })}
                download
              >
                <Database className="size-4" aria-hidden />
                Файл бази
              </a>
            </div>
            <p className="text-xs leading-relaxed text-ink-3">
              JSON зручно читати й переносити між версіями. Файл бази — найточніша копія: його
              достатньо покласти на місце <code>selfbank.db</code> у томі Docker.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Імпорт даних" subtitle="Завантажте JSON-копію, створену експортом" />
          <CardBody>
            <ImportForm counts={counts} />
          </CardBody>
        </Card>
      </div>
    </>
  );
}

const TABLE_LABELS: Record<string, string> = {
  settings: "Налаштування",
  accounts: "Рахунки",
  categories: "Категорії",
  exchange_rates: "Курси",
  goals: "Цілі",
  debts: "Борги",
  recurring_rules: "Регулярні правила",
  budgets: "Бюджети",
  transactions: "Операції",
};
