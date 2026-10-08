import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { accounts, categories, debts, goals } from "@/db/schema";

/** Lookup lists for form pickers. Archived entries are excluded by default. */

export function listAccounts(includeArchived = false) {
  const rows = db
    .select()
    .from(accounts)
    .orderBy(asc(accounts.archived), asc(accounts.sortOrder), asc(accounts.id))
    .all();
  return includeArchived ? rows : rows.filter((a) => !a.archived);
}

export function getAccount(id: number) {
  return db.select().from(accounts).where(eq(accounts.id, id)).get();
}

export function listCategories(includeArchived = false) {
  const rows = db
    .select()
    .from(categories)
    .orderBy(asc(categories.kind), asc(categories.sortOrder), asc(categories.id))
    .all();
  return includeArchived ? rows : rows.filter((c) => !c.archived);
}

export interface CategoryTreeNode {
  category: (typeof categories.$inferSelect);
  children: Array<typeof categories.$inferSelect>;
}

/** Top-level categories with their children, for grouped <select> rendering. */
export function categoryTree(kind?: "income" | "expense", includeArchived = false) {
  const all = listCategories(includeArchived).filter((c) => !kind || c.kind === kind);
  const roots = all.filter((c) => c.parentId === null);
  return roots.map<CategoryTreeNode>((category) => ({
    category,
    children: all.filter((c) => c.parentId === category.id),
  }));
}

export function listGoals(includeArchived = false) {
  const rows = db.select().from(goals).orderBy(asc(goals.archived), asc(goals.id)).all();
  return includeArchived ? rows : rows.filter((g) => !g.archived);
}

export function listDebts(includeSettled = false) {
  const rows = db.select().from(debts).orderBy(asc(debts.id)).all();
  return includeSettled ? rows : rows.filter((d) => d.settledAt === null);
}
