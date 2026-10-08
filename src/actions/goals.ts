"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { goals } from "@/db/schema";
import { parseAmount } from "@/lib/money";
import { goalSchema } from "@/lib/validation";
import { parseForm, runFormAction, type ActionResult } from "./helpers";

export async function saveGoal(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    const input = parseForm(goalSchema, form);
    const targetMinor = parseAmount(input.target, input.currency);
    if (targetMinor <= 0) return { ok: false, errors: { target: "Цільова сума має бути > 0" } };

    const values = {
      name: input.name,
      targetMinor,
      currency: input.currency,
      targetDate: input.targetDate ?? null,
      accountId: input.accountId ?? null,
      note: input.note ?? null,
      archived: input.archived,
    };

    if (input.id) {
      db.update(goals).set(values).where(eq(goals.id, input.id)).run();
    } else {
      db.insert(goals).values(values).run();
    }

    revalidatePath("/goals");
    revalidatePath("/");
    return { ok: true, message: input.id ? "Ціль оновлено" : "Ціль створено" };
  });
}

export async function deleteGoal(form: FormData): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    // Transactions tagged with this goal keep their history: the FK is
    // ON DELETE SET NULL, so only the tag is cleared.
    db.delete(goals).where(eq(goals.id, Number(form.get("id")))).run();
    revalidatePath("/goals");
    revalidatePath("/");
    return { ok: true, message: "Ціль видалено" };
  });
}

export async function toggleGoalArchived(form: FormData): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    const id = Number(form.get("id"));
    const goal = db.select().from(goals).where(eq(goals.id, id)).get();
    if (!goal) return { ok: false, errors: { _form: "Ціль не знайдено" } };
    db.update(goals).set({ archived: !goal.archived }).where(eq(goals.id, id)).run();
    revalidatePath("/goals");
    return { ok: true, message: goal.archived ? "Ціль відновлено" : "Ціль заархівовано" };
  });
}
