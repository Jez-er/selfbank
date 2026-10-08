"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Alert, Field, Input, Select, Textarea } from "@/components/ui";
import type { ActionResult } from "@/lib/validation";
import { AmountInput } from "./amount-input";
import { SubmitButton } from "./auto-form";

export interface AccountOption {
  id: number;
  name: string;
  currency: string;
}

export interface CategoryOption {
  id: number;
  name: string;
  parentName: string | null;
}

export interface TagOption {
  id: number;
  label: string;
}

export interface TransactionDefaults {
  id?: number;
  accountId?: number;
  toAccountId?: number;
  amount?: string;
  toAmount?: string;
  categoryId?: number;
  goalId?: number;
  debtId?: number;
  occurredAt: string;
  note?: string;
}

/**
 * The add/edit form for all three operation types.
 *
 * The amount field needs the selected account's currency (decimals differ per
 * currency), and a transfer needs to know whether the two accounts share a
 * currency before it can offer a credited-amount field - both of which depend
 * on live selections, so this part is a client component.
 */
export function TransactionForm({
  type,
  action,
  accounts,
  categories,
  goals,
  debts,
  defaults,
  submitLabel,
  cancelHref,
}: {
  type: "income" | "expense" | "transfer";
  action: (prev: ActionResult | undefined, form: FormData) => Promise<ActionResult>;
  accounts: AccountOption[];
  categories: CategoryOption[];
  goals: TagOption[];
  debts: TagOption[];
  defaults: TransactionDefaults;
  submitLabel: string;
  cancelHref?: string;
}) {
  const [state, formAction] = useActionState(action, undefined);

  const [accountId, setAccountId] = useState(
    String(defaults.accountId ?? accounts[0]?.id ?? ""),
  );
  const [toAccountId, setToAccountId] = useState(
    String(defaults.toAccountId ?? accounts.find((a) => String(a.id) !== accountId)?.id ?? ""),
  );

  const account = accounts.find((a) => String(a.id) === accountId);
  const toAccount = accounts.find((a) => String(a.id) === toAccountId);
  const currency = account?.currency ?? "UAH";
  const crossCurrency =
    type === "transfer" && toAccount !== undefined && toAccount.currency !== currency;

  // A successful save resets the inputs so the next operation can be typed in.
  const formKey = state?.ok ? `saved-${state.message}-${Date.now()}` : "form";

  if (accounts.length === 0) {
    return (
      <Alert tone="warning" title="Спочатку створіть рахунок">
        Операцію нікуди записати.{" "}
        <Link href="/accounts" className="underline">
          Перейти до рахунків
        </Link>
      </Alert>
    );
  }
  if (type === "transfer" && accounts.length < 2) {
    return (
      <Alert tone="warning" title="Для переказу потрібні два рахунки">
        <Link href="/accounts" className="underline">
          Додати ще один рахунок
        </Link>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-4" key={formKey}>
      <input type="hidden" name="type" value={type} />
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}

      {state?.errors?._form ? <Alert tone="negative">{state.errors._form}</Alert> : null}
      {state?.ok && state.message ? (
        <Alert tone="positive">
          {state.message}
          {state.warning ? <p className="mt-1 text-xs">{state.warning}</p> : null}
        </Alert>
      ) : null}

      <Field
        label={type === "transfer" ? "Сума списання" : "Сума"}
        htmlFor="f-amount"
        error={state?.errors?.amount}
      >
        <AmountInput
          id="f-amount"
          name="amount"
          currency={currency}
          defaultValue={defaults.amount ?? ""}
          required
          autoFocus
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label={type === "transfer" ? "З рахунку" : "Рахунок"}
          htmlFor="f-account"
          error={state?.errors?.accountId}
        >
          <Select
            id="f-account"
            name="accountId"
            value={accountId}
            onChange={(event) => setAccountId(event.target.value)}
            required
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.currency}
              </option>
            ))}
          </Select>
        </Field>

        {type === "transfer" ? (
          <Field label="На рахунок" htmlFor="f-to-account" error={state?.errors?.toAccountId}>
            <Select
              id="f-to-account"
              name="toAccountId"
              value={toAccountId}
              onChange={(event) => setToAccountId(event.target.value)}
              required
            >
              {accounts
                .filter((a) => String(a.id) !== accountId)
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.currency}
                  </option>
                ))}
            </Select>
          </Field>
        ) : (
          <Field label="Категорія" htmlFor="f-category" error={state?.errors?.categoryId}>
            <Select
              id="f-category"
              name="categoryId"
              defaultValue={defaults.categoryId ? String(defaults.categoryId) : ""}
            >
              <option value="">Без категорії</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parentName ? `${c.parentName} › ${c.name}` : c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      {crossCurrency ? (
        <Field
          label={`Сума зачислення (${toAccount!.currency})`}
          htmlFor="f-to-amount"
          hint="Залиште порожнім, щоб перерахувати за курсом на дату операції"
          error={state?.errors?.toAmount}
        >
          <AmountInput
            id="f-to-amount"
            name="toAmount"
            currency={toAccount!.currency}
            defaultValue={defaults.toAmount ?? ""}
          />
        </Field>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Дата" htmlFor="f-date" error={state?.errors?.occurredAt}>
          <Input
            id="f-date"
            name="occurredAt"
            type="date"
            defaultValue={defaults.occurredAt}
            required
          />
        </Field>

        {type !== "transfer" && (goals.length > 0 || debts.length > 0) ? (
          <Field
            label="Прив’язати до"
            htmlFor="f-link"
            hint="Необов’язково: ціль накопичення або борг"
          >
            <LinkSelect goals={goals} debts={debts} defaults={defaults} />
          </Field>
        ) : null}
      </div>

      <Field label="Нотатка" htmlFor="f-note" error={state?.errors?.note}>
        <Textarea
          id="f-note"
          name="note"
          defaultValue={defaults.note ?? ""}
          placeholder="Наприклад: продукти у Сільпо"
        />
      </Field>

      <div className="flex flex-wrap items-center gap-2 pt-1">
        <SubmitButton label={submitLabel} />
        {cancelHref ? (
          <Link href={cancelHref} className="text-sm text-ink-3 underline">
            Скасувати
          </Link>
        ) : null}
        {state?.ok ? (
          <Link href="/" className="text-sm text-brand underline">
            На дашборд
          </Link>
        ) : null}
      </div>
    </form>
  );
}

/**
 * Goals and debts share one picker: a transaction is a contribution to a goal
 * or a repayment of a debt, never both.
 */
function LinkSelect({
  goals,
  debts,
  defaults,
}: {
  goals: TagOption[];
  debts: TagOption[];
  defaults: TransactionDefaults;
}) {
  const initial = defaults.goalId
    ? `goal:${defaults.goalId}`
    : defaults.debtId
      ? `debt:${defaults.debtId}`
      : "";
  const [value, setValue] = useState(initial);
  const [kind, id] = value.split(":");

  return (
    <>
      <Select value={value} onChange={(event) => setValue(event.target.value)}>
        <option value="">Нічого</option>
        {goals.length > 0 ? (
          <optgroup label="Цілі">
            {goals.map((g) => (
              <option key={g.id} value={`goal:${g.id}`}>
                {g.label}
              </option>
            ))}
          </optgroup>
        ) : null}
        {debts.length > 0 ? (
          <optgroup label="Борги">
            {debts.map((d) => (
              <option key={d.id} value={`debt:${d.id}`}>
                {d.label}
              </option>
            ))}
          </optgroup>
        ) : null}
      </Select>
      <input type="hidden" name="goalId" value={kind === "goal" ? id : ""} />
      <input type="hidden" name="debtId" value={kind === "debt" ? id : ""} />
    </>
  );
}
