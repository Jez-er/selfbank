"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { debts } from "@/db/schema";
import { parseAmount } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import { debtSchema } from "@/lib/validation";
import { parseForm, runFormAction, type ActionResult } from "./helpers";

export async function saveDebt(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    const input = parseForm(debtSchema, form);
    const principalMinor = parseAmount(input.principal, input.currency);
    if (principalMinor <= 0) {
      return { ok: false, errors: { principal: "Сума має бути більшою за нуль" } };
    }

    const values = {
      counterparty: input.counterparty,
      direction: input.direction,
      principalMinor,
      currency: input.currency,
      dueDate: input.dueDate ?? null,
      note: input.note ?? null,
    };

    if (input.id) {
      db.update(debts).set(values).where(eq(debts.id, input.id)).run();
    } else {
      db.insert(debts).values(values).run();
    }

    revalidatePath("/debts");
    revalidatePath("/");
    return { ok: true, message: input.id ? "Борг оновлено" : "Борг створено" };
  });
}

export async function deleteDebt(form: FormData): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    db.delete(debts).where(eq(debts.id, Number(form.get("id")))).run();
    revalidatePath("/debts");
    revalidatePath("/");
    return { ok: true, message: "Борг видалено" };
  });
}

/** Marks a debt settled without creating a transaction (e.g. forgiven, or offset). */
export async function toggleDebtSettled(form: FormData): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    const id = Number(form.get("id"));
    const debt = db.select().from(debts).where(eq(debts.id, id)).get();
    if (!debt) return { ok: false, errors: { _form: "Борг не знайдено" } };
    db.update(debts)
      .set({ settledAt: debt.settledAt ? null : todayISO() })
      .where(eq(debts.id, id))
      .run();
    revalidatePath("/debts");
    revalidatePath("/");
    return { ok: true, message: debt.settledAt ? "Борг знову активний" : "Борг закрито" };
  });
}
