"use server";

import { revalidatePath } from "next/cache";
import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { categories, transactions } from "@/db/schema";
import { categorySchema } from "@/lib/validation";
import { parseForm, runFormAction, type ActionResult } from "./helpers";

export async function saveCategory(
  _prev: ActionResult | undefined,
  form: FormData,
): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    const input = parseForm(categorySchema, form);

    if (input.parentId && input.parentId === input.id) {
      return { ok: false, errors: { parentId: "Категорія не може бути батьківською для себе" } };
    }
    if (input.parentId) {
      const parent = db.select().from(categories).where(eq(categories.id, input.parentId)).get();
      if (!parent) return { ok: false, errors: { parentId: "Батьківську категорію не знайдено" } };
      if (parent.kind !== input.kind) {
        return { ok: false, errors: { parentId: "Тип має збігатися з батьківською категорією" } };
      }
      if (parent.parentId !== null) {
        // One level of nesting keeps reports and the category picker simple.
        return { ok: false, errors: { parentId: "Підкатегорія не може мати власних підкатегорій" } };
      }
    }

    const values = {
      name: input.name,
      kind: input.kind,
      icon: input.icon,
      color: input.color,
      parentId: input.parentId ?? null,
      archived: input.archived,
    };

    if (input.id) {
      db.update(categories).set(values).where(eq(categories.id, input.id)).run();
    } else {
      const nextOrder = (db.select({ n: count() }).from(categories).get()?.n ?? 0) + 1;
      db.insert(categories).values({ ...values, sortOrder: nextOrder }).run();
    }

    revalidatePath("/categories");
    revalidatePath("/");
    return { ok: true, message: input.id ? "Категорію оновлено" : "Категорію створено" };
  });
}

export async function deleteCategory(form: FormData): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    const id = Number(form.get("id"));
    const used =
      db
        .select({ n: count() })
        .from(transactions)
        .where(eq(transactions.categoryId, id))
        .get()?.n ?? 0;

    // Transactions keep their history: the FK is ON DELETE SET NULL, so they
    // become "Без категорії" rather than disappearing. Say so plainly.
    db.delete(categories).where(eq(categories.id, id)).run();
    revalidatePath("/categories");
    revalidatePath("/");
    return {
      ok: true,
      message:
        used > 0
          ? `Категорію видалено. ${used} операцій тепер без категорії.`
          : "Категорію видалено",
    };
  });
}

export async function toggleCategoryArchived(form: FormData): Promise<ActionResult> {
  return runFormAction((): ActionResult => {
    const id = Number(form.get("id"));
    const category = db.select().from(categories).where(eq(categories.id, id)).get();
    if (!category) return { ok: false, errors: { _form: "Категорію не знайдено" } };
    db.update(categories).set({ archived: !category.archived }).where(eq(categories.id, id)).run();
    revalidatePath("/categories");
    return { ok: true, message: category.archived ? "Відновлено" : "Заархівовано" };
  });
}
