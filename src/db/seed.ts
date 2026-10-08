import { count } from "drizzle-orm";
import { db } from "./index";
import { accounts, categories, settings } from "./schema";

/** Settings keys with their defaults; read via `lib/queries/settings.ts`. */
export const DEFAULT_SETTINGS: Record<string, string> = {
  base_currency: "UAH",
  schema_version: "1",
};

/**
 * Validated categorical palette (see globals.css). Colours are handed out in
 * slot order so a fresh install charts safely; users may override per category.
 */
export const VIZ_SLOTS = [
  "#2a78d6",
  "#eb6834",
  "#1baf7a",
  "#eda100",
  "#e87ba4",
  "#008300",
  "#4a3aa7",
  "#e34948",
] as const;

const slot = (i: number) => VIZ_SLOTS[i % VIZ_SLOTS.length]!;

const DEFAULT_EXPENSE_CATEGORIES: Array<[string, string, string]> = [
  ["Продукти", "shopping-cart", slot(0)],
  ["Кафе та ресторани", "utensils", slot(1)],
  ["Транспорт", "bus", slot(2)],
  ["Житло та комуналка", "home", slot(3)],
  ["Здоров’я", "heart-pulse", slot(7)],
  ["Одяг", "shirt", slot(4)],
  ["Розваги", "gamepad-2", slot(6)],
  ["Підписки та зв’язок", "wifi", slot(5)],
  ["Освіта", "graduation-cap", slot(2)],
  ["Подарунки та донати", "gift", slot(4)],
  ["Інше", "circle-ellipsis", slot(1)],
];

const DEFAULT_INCOME_CATEGORIES: Array<[string, string, string]> = [
  ["Зарплата", "wallet", slot(5)],
  ["Фріланс", "laptop", slot(0)],
  ["Проценти та дивіденди", "trending-up", slot(6)],
  ["Подарунки", "gift", slot(3)],
  ["Інше", "circle-ellipsis", slot(2)],
];

/**
 * Populates an empty database. Safe to call on every boot: each section is
 * skipped when its table already has rows, so user edits are never clobbered.
 */
export function seedIfEmpty(): { seeded: boolean } {
  return db.transaction((tx) => {
    let seeded = false;

    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      tx.insert(settings).values({ key, value }).onConflictDoNothing().run();
    }

    const categoryCount = tx.select({ n: count() }).from(categories).get()?.n ?? 0;
    if (categoryCount === 0) {
      seeded = true;
      DEFAULT_EXPENSE_CATEGORIES.forEach(([name, icon, color], index) => {
        tx.insert(categories).values({ name, kind: "expense", icon, color, sortOrder: index }).run();
      });
      DEFAULT_INCOME_CATEGORIES.forEach(([name, icon, color], index) => {
        tx.insert(categories).values({ name, kind: "income", icon, color, sortOrder: index }).run();
      });
    }

    const accountCount = tx.select({ n: count() }).from(accounts).get()?.n ?? 0;
    if (accountCount === 0) {
      seeded = true;
      const base = DEFAULT_SETTINGS.base_currency!;
      tx.insert(accounts)
        .values({ name: "Готівка", type: "cash", currency: base, color: slot(0), sortOrder: 0 })
        .run();
      tx.insert(accounts)
        .values({ name: "Картка", type: "card", currency: base, color: slot(2), sortOrder: 1 })
        .run();
    }

    return { seeded };
  });
}
