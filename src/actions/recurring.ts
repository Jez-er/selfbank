"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, recurringRules } from "@/db/schema";
import { parseAmount } from "@/lib/money";
import { nextOccurrence } from "@/lib/recurring";
import { postDueRules, specOf } from "@/lib/recurring-runner";
import { todayISO } from "@/lib/dates";
import { pluralUk } from "@/lib/utils";
import { recurringSchema } from "@/lib/validation";
import { parseForm, runFormAction, type ActionResult } from "./helpers";

export async function saveRecurring(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    const input = parseForm(recurringSchema, form);

    const account = db.select().from(accounts).where(eq(accounts.id, input.accountId)).get();
    if (!account) return { ok: false, errors: { accountId: "Рахунок не знайдено" } };

    const amountMinor = parseAmount(input.amount, account.currency);
    if (amountMinor <= 0) return { ok: false, errors: { amount: "Сума має бути більшою за нуль" } };

    const spec = {
      frequency: input.frequency,
      intervalCount: input.intervalCount,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      dayOfMonth: input.dayOfMonth ?? null,
      weekday: input.weekday ?? null,
      monthOfYear: input.monthOfYear ?? null,
    };

    const firstRun = nextOccurrence(spec, input.startDate);
    if (firstRun === null) {
      return { ok: false, errors: { endDate: "З такими датами правило не має жодного запуску" } };
    }

    const values = {
      name: input.name,
      type: input.type,
      accountId: input.accountId,
      toAccountId: input.type === "transfer" ? (input.toAccountId ?? null) : null,
      categoryId: input.type === "transfer" ? null : (input.categoryId ?? null),
      amountMinor,
      currency: account.currency,
      note: input.note ?? null,
      frequency: input.frequency,
      intervalCount: input.intervalCount,
      dayOfMonth: input.dayOfMonth ?? null,
      weekday: input.weekday ?? null,
      monthOfYear: input.monthOfYear ?? null,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      autoPost: input.autoPost,
      active: input.active,
    };

    if (input.id) {
      const existing = db.select().from(recurringRules).where(eq(recurringRules.id, input.id)).get();
      if (!existing) return { ok: false, errors: { _form: "Правило не знайдено" } };

      // Editing the schedule re-derives the cursor, but never backwards past
      // what was already posted - otherwise saving would duplicate history.
      const floor = existing.lastPostedAt
        ? nextOccurrence(spec, addDay(existing.lastPostedAt))
        : firstRun;
      db.update(recurringRules)
        .set({ ...values, nextRunAt: floor ?? firstRun })
        .where(eq(recurringRules.id, input.id))
        .run();
    } else {
      db.insert(recurringRules).values({ ...values, nextRunAt: firstRun }).run();
    }

    revalidatePath("/recurring");
    revalidatePath("/");
    return { ok: true, message: input.id ? "Правило оновлено" : "Правило створено" };
  });
}

/** The day after an ISO date, so a re-derived cursor skips what was posted. */
function addDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export async function deleteRecurring(form: FormData): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    // Already-posted transactions survive: their `recurring_id` is set to NULL.
    db.delete(recurringRules).where(eq(recurringRules.id, Number(form.get("id")))).run();
    revalidatePath("/recurring");
    revalidatePath("/");
    return { ok: true, message: "Правило видалено" };
  });
}

export async function toggleRecurringActive(form: FormData): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    const id = Number(form.get("id"));
    const rule = db.select().from(recurringRules).where(eq(recurringRules.id, id)).get();
    if (!rule) return { ok: false, errors: { _form: "Правило не знайдено" } };

    // Re-activating a rule that slept through its schedule should not post a
    // backlog, so the cursor jumps to the next future occurrence.
    const nextRunAt = rule.active
      ? rule.nextRunAt
      : (nextOccurrence(specOf(rule), todayISO()) ?? rule.nextRunAt);

    db.update(recurringRules)
      .set({ active: !rule.active, nextRunAt })
      .where(eq(recurringRules.id, id))
      .run();
    revalidatePath("/recurring");
    revalidatePath("/");
    return { ok: true, message: rule.active ? "Правило вимкнено" : "Правило увімкнено" };
  });
}

/** Posts a single due rule that has auto-posting switched off. */
export async function postRecurringNow(form: FormData): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    const id = Number(form.get("id"));
    const rule = db.select().from(recurringRules).where(eq(recurringRules.id, id)).get();
    if (!rule) return { ok: false, errors: { _form: "Правило не знайдено" } };

    // postDueRules only looks at auto-post rules, so flip the flag for the
    // duration of this one run and restore it afterwards.
    db.update(recurringRules).set({ autoPost: true }).where(eq(recurringRules.id, id)).run();
    let created = 0;
    try {
      created = postDueRules().transactionsCreated;
    } finally {
      db.update(recurringRules)
        .set({ autoPost: rule.autoPost })
        .where(eq(recurringRules.id, id))
        .run();
    }

    revalidatePath("/recurring");
    revalidatePath("/");
    revalidatePath("/transactions");
    return { ok: true, message: `Проведено операцій: ${created}` };
  });
}

/** Manual catch-up button on the recurring page. */
export async function runRecurringCatchUp(): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    const report = postDueRules();
    revalidatePath("/recurring");
    revalidatePath("/");
    revalidatePath("/transactions");
    return {
      ok: true,
      message:
        report.transactionsCreated === 0
          ? "Немає операцій до проведення"
          : `Проведено ${report.transactionsCreated} ${pluralUk(report.transactionsCreated, "операцію", "операції", "операцій")} ` +
            `за ${report.rulesProcessed} ${pluralUk(report.rulesProcessed, "правилом", "правилами", "правилами")}`,
    };
  });
}
