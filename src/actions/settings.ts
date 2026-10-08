"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { exchangeRates } from "@/db/schema";
import { rateSchema, settingsSchema } from "@/lib/validation";
import { getBaseCurrency, setSetting } from "@/lib/queries/settings";
import { parseForm, runFormAction, type ActionResult } from "./helpers";

export async function saveBaseCurrency(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    const input = parseForm(settingsSchema, form);
    const current = getBaseCurrency();
    if (input.baseCurrency === current) return { ok: true, message: "Без змін" };

    setSetting("base_currency", input.baseCurrency);
    revalidateAll();
    return {
      ok: true,
      message: `Базову валюту змінено на ${input.baseCurrency}`,
      // Historical base amounts were frozen against the old base currency and
      // are not retroactively re-converted; say so rather than hide it.
      warning:
        "Суми вже внесених операцій у базовій валюті залишились перерахованими за попередньою базою. " +
        "Для коректної історії задайте курси нової базової валюти або перевнесіть операції.",
    };
  });
}

export async function saveRate(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    const input = parseForm(rateSchema, form);
    if (input.quote === getBaseCurrency()) {
      return { ok: false, errors: { quote: "Базова валюта завжди має курс 1" } };
    }

    db.insert(exchangeRates)
      .values({ quote: input.quote, rateToBase: input.rate, asOf: input.asOf, source: "manual" })
      // One rate per currency per day: re-entering a date corrects it.
      .onConflictDoUpdate({
        target: [exchangeRates.quote, exchangeRates.asOf],
        set: { rateToBase: input.rate },
      })
      .run();

    revalidateAll();
    return { ok: true, message: `Курс ${input.quote} збережено` };
  });
}

export async function deleteRate(form: FormData): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    const id = Number(form.get("id"));
    db.delete(exchangeRates).where(eq(exchangeRates.id, id)).run();
    revalidateAll();
    return { ok: true, message: "Курс видалено" };
  });
}

function revalidateAll() {
  for (const path of ["/", "/settings", "/accounts", "/transactions", "/analytics", "/budgets"]) {
    revalidatePath(path);
  }
}
