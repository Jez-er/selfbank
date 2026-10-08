"use server";

import { revalidatePath } from "next/cache";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, transactions } from "@/db/schema";
import { parseAmount } from "@/lib/money";
import { accountSchema } from "@/lib/validation";
import { parseForm, runFormAction, type ActionResult } from "./helpers";

export async function saveAccount(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    const input = parseForm(accountSchema, form);
    const openingBalanceMinor = parseAmount(input.openingBalance || "0", input.currency);

    if (input.id) {
      const existing = db.select().from(accounts).where(eq(accounts.id, input.id)).get();
      if (!existing) return { ok: false, errors: { _form: "Рахунок не знайдено" } };

      // Changing the currency of an account that already has history would
      // silently reinterpret every past amount, so it is refused.
      if (existing.currency !== input.currency) {
        const used =
          db
            .select({ n: count() })
            .from(transactions)
            .where(eq(transactions.accountId, input.id))
            .get()?.n ?? 0;
        if (used > 0) {
          return {
            ok: false,
            errors: {
              currency: `Не можна змінити валюту: рахунок уже має ${used} операцій. Створіть новий рахунок.`,
            },
          };
        }
      }

      db.update(accounts)
        .set({
          name: input.name,
          type: input.type,
          currency: input.currency,
          openingBalanceMinor,
          color: input.color,
          archived: input.archived,
        })
        .where(eq(accounts.id, input.id))
        .run();
    } else {
      const nextOrder = (db.select({ n: count() }).from(accounts).get()?.n ?? 0) + 1;
      db.insert(accounts)
        .values({
          name: input.name,
          type: input.type,
          currency: input.currency,
          openingBalanceMinor,
          color: input.color,
          archived: input.archived,
          sortOrder: nextOrder,
        })
        .run();
    }

    revalidatePath("/accounts");
    revalidatePath("/");
    revalidatePath("/settings");
    return { ok: true, message: input.id ? "Рахунок оновлено" : "Рахунок створено" };
  });
}

export async function deleteAccount(form: FormData): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    const id = Number(form.get("id"));
    const used =
      db.select({ n: count() }).from(transactions).where(eq(transactions.accountId, id)).get()?.n ??
      0;
    if (used > 0) {
      return {
        ok: false,
        errors: {
          _form: `Рахунок має ${used} операцій і не може бути видалений. Заархівуйте його замість цього.`,
        },
      };
    }
    db.delete(accounts).where(eq(accounts.id, id)).run();
    revalidatePath("/accounts");
    revalidatePath("/");
    return { ok: true, message: "Рахунок видалено" };
  });
}

export async function toggleAccountArchived(form: FormData): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    const id = Number(form.get("id"));
    const account = db.select().from(accounts).where(eq(accounts.id, id)).get();
    if (!account) return { ok: false, errors: { _form: "Рахунок не знайдено" } };
    db.update(accounts).set({ archived: !account.archived }).where(eq(accounts.id, id)).run();
    revalidatePath("/accounts");
    revalidatePath("/");
    return { ok: true, message: account.archived ? "Рахунок відновлено" : "Рахунок заархівовано" };
  });
}
