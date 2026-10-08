"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, transactions } from "@/db/schema";
import { parseAmount } from "@/lib/money";
import { convertMinor, resolveRate, suggestTransferAmount } from "@/lib/fx";
import { getBaseCurrency } from "@/lib/queries/settings";
import { listRates } from "@/lib/queries/fx";
import { transactionSchema } from "@/lib/validation";
import { parseForm, runFormAction, type ActionResult } from "./helpers";

/** Every page that shows money has to be revalidated after a write. */
const AFFECTED_PATHS = [
  "/",
  "/transactions",
  "/accounts",
  "/budgets",
  "/goals",
  "/debts",
  "/analytics",
];

function revalidateMoney() {
  for (const path of AFFECTED_PATHS) revalidatePath(path);
}

export async function saveTransaction(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    const input = parseForm(transactionSchema, form);

    const account = db.select().from(accounts).where(eq(accounts.id, input.accountId)).get();
    if (!account) return { ok: false, errors: { accountId: "Рахунок не знайдено" } };

    const amountMinor = parseAmount(input.amount, account.currency);
    if (amountMinor <= 0) {
      return { ok: false, errors: { amount: "Сума має бути більшою за нуль" } };
    }

    const baseCurrency = getBaseCurrency();
    const rates = listRates();

    // The rate is resolved for the transaction's own date and stored with it,
    // so editing a rate later never rewrites historical reports.
    const resolved = resolveRate(rates, account.currency, baseCurrency, input.occurredAt);
    const baseAmountMinor = convertMinor(amountMinor, account.currency, baseCurrency, resolved.rate);

    let toAmountMinor: number | null = null;
    if (input.type === "transfer" && input.toAccountId) {
      const target = db.select().from(accounts).where(eq(accounts.id, input.toAccountId)).get();
      if (!target) return { ok: false, errors: { toAccountId: "Рахунок не знайдено" } };

      if (target.currency === account.currency) {
        toAmountMinor = amountMinor;
      } else if (input.toAmount && input.toAmount.trim() !== "") {
        // An explicit credited amount wins: the user knows what the bank
        // actually converted at.
        toAmountMinor = parseAmount(input.toAmount, target.currency);
      } else {
        toAmountMinor = suggestTransferAmount(
          amountMinor,
          account.currency,
          target.currency,
          rates,
          baseCurrency,
          input.occurredAt,
        ).toAmountMinor;
      }
      if (toAmountMinor <= 0) {
        return { ok: false, errors: { toAmount: "Сума зачислення має бути більшою за нуль" } };
      }
    }

    const values = {
      type: input.type,
      accountId: input.accountId,
      toAccountId: input.type === "transfer" ? (input.toAccountId ?? null) : null,
      amountMinor,
      currency: account.currency,
      toAmountMinor,
      baseAmountMinor,
      fxRate: resolved.rate,
      categoryId: input.type === "transfer" ? null : (input.categoryId ?? null),
      goalId: input.goalId ?? null,
      debtId: input.debtId ?? null,
      occurredAt: input.occurredAt,
      note: input.note ?? null,
      updatedAt: Date.now(),
    };

    if (input.id) {
      const existing = db.select().from(transactions).where(eq(transactions.id, input.id)).get();
      if (!existing) return { ok: false, errors: { _form: "Транзакцію не знайдено" } };
      db.update(transactions).set(values).where(eq(transactions.id, input.id)).run();
    } else {
      db.insert(transactions).values(values).run();
    }

    revalidateMoney();
    return {
      ok: true,
      message: input.id ? "Транзакцію оновлено" : "Транзакцію додано",
      warning: resolved.stale
        ? `Курс ${account.currency} на ${input.occurredAt} не задано, використано найближчий (${resolved.asOf}).`
        : undefined,
    };
  });
}

export async function deleteTransaction(form: FormData): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    const id = Number(form.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return { ok: false, errors: { _form: "Невірний ідентифікатор" } };
    }
    db.delete(transactions).where(eq(transactions.id, id)).run();
    revalidateMoney();
    return { ok: true, message: "Транзакцію видалено" };
  });
}

/** Copies a transaction to today, for repeat purchases. */
export async function duplicateTransaction(form: FormData): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    const id = Number(form.get("id"));
    const source = db.select().from(transactions).where(eq(transactions.id, id)).get();
    if (!source) return { ok: false, errors: { _form: "Транзакцію не знайдено" } };

    const { id: _omit, createdAt: _c, updatedAt: _u, ...rest } = source;
    db.insert(transactions)
      .values({ ...rest, occurredAt: new Date().toISOString().slice(0, 10), recurringId: null })
      .run();
    revalidateMoney();
    return { ok: true, message: "Створено копію" };
  });
}
