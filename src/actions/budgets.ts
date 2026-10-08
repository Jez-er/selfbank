"use server";

import { revalidatePath } from "next/cache";
import { eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { budgets } from "@/db/schema";
import { parseAmount } from "@/lib/money";
import { budgetSchema } from "@/lib/validation";
import { getBaseCurrency } from "@/lib/queries/settings";
import { parseForm, runFormAction, type ActionResult } from "./helpers";

export async function saveBudget(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    const input = parseForm(budgetSchema, form);
    // Budgets are always denominated in the base currency, so comparing them
    // with `base_amount_minor` sums needs no conversion.
    const amountMinor = parseAmount(input.amount, getBaseCurrency());
    if (amountMinor <= 0) return { ok: false, errors: { amount: "Сума має бути більшою за нуль" } };

    // One budget per category (and one overall) keeps the dashboard unambiguous.
    const duplicate = db
      .select({ id: budgets.id })
      .from(budgets)
      .where(
        input.categoryId === null || input.categoryId === undefined
          ? isNull(budgets.categoryId)
          : eq(budgets.categoryId, input.categoryId),
      )
      .all()
      .filter((row) => row.id !== input.id);
    if (duplicate.length > 0) {
      return {
        ok: false,
        errors: {
          categoryId:
            input.categoryId == null
              ? "Загальний бюджет уже існує - відредагуйте його"
              : "Для цієї категорії бюджет уже існує",
        },
      };
    }

    const values = {
      categoryId: input.categoryId ?? null,
      amountMinor,
      period: "monthly" as const,
      startMonth: input.startMonth,
      rollover: input.rollover,
      active: input.active,
    };

    if (input.id) {
      db.update(budgets).set(values).where(eq(budgets.id, input.id)).run();
    } else {
      db.insert(budgets).values(values).run();
    }

    revalidatePath("/budgets");
    revalidatePath("/");
    return { ok: true, message: input.id ? "Бюджет оновлено" : "Бюджет створено" };
  });
}

export async function deleteBudget(form: FormData): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    db.delete(budgets).where(eq(budgets.id, Number(form.get("id")))).run();
    revalidatePath("/budgets");
    revalidatePath("/");
    return { ok: true, message: "Бюджет видалено" };
  });
}

export async function toggleBudgetActive(form: FormData): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    const id = Number(form.get("id"));
    const budget = db.select().from(budgets).where(eq(budgets.id, id)).get();
    if (!budget) return { ok: false, errors: { _form: "Бюджет не знайдено" } };
    db.update(budgets).set({ active: !budget.active }).where(eq(budgets.id, id)).run();
    revalidatePath("/budgets");
    revalidatePath("/");
    return { ok: true, message: budget.active ? "Бюджет вимкнено" : "Бюджет увімкнено" };
  });
}
