import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

/**
 * Money is NEVER stored as a float. Every `*Minor` column holds an integer
 * number of minor units (kopiyky, cents...). The number of decimals per
 * currency lives in `lib/money.ts`.
 *
 * Dates that represent a calendar day are TEXT in `YYYY-MM-DD` form, which
 * sorts and compares lexicographically in SQLite. Timestamps are unix ms.
 */

const now = sql`(unixepoch() * 1000)`;

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
});

export const accounts = sqliteTable(
  "accounts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    type: text("type", { enum: ["cash", "card", "savings", "crypto", "other"] })
      .notNull()
      .default("cash"),
    currency: text("currency").notNull(),
    openingBalanceMinor: integer("opening_balance_minor").notNull().default(0),
    color: text("color").notNull().default("#64748b"),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [index("accounts_archived_idx").on(t.archived, t.sortOrder)],
);

export const categories = sqliteTable(
  "categories",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    kind: text("kind", { enum: ["income", "expense"] }).notNull(),
    icon: text("icon").notNull().default("circle"),
    color: text("color").notNull().default("#64748b"),
    parentId: integer("parent_id").references((): AnySQLiteColumn => categories.id, {
      onDelete: "set null",
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [index("categories_kind_idx").on(t.kind, t.archived)],
);

export const goals = sqliteTable("goals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  targetMinor: integer("target_minor").notNull(),
  currency: text("currency").notNull(),
  targetDate: text("target_date"),
  /** When set, progress is the linked account balance instead of tagged transactions. */
  accountId: integer("account_id").references(() => accounts.id, { onDelete: "set null" }),
  note: text("note"),
  archived: integer("archived", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at").notNull().default(now),
});

export const debts = sqliteTable("debts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  counterparty: text("counterparty").notNull(),
  direction: text("direction", { enum: ["i_owe", "owed_to_me"] }).notNull(),
  principalMinor: integer("principal_minor").notNull(),
  currency: text("currency").notNull(),
  dueDate: text("due_date"),
  note: text("note"),
  settledAt: text("settled_at"),
  createdAt: integer("created_at").notNull().default(now),
});

export const recurringRules = sqliteTable(
  "recurring_rules",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name").notNull(),
    // --- transaction template ---
    type: text("type", { enum: ["income", "expense", "transfer"] }).notNull(),
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    toAccountId: integer("to_account_id").references(() => accounts.id, { onDelete: "cascade" }),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    amountMinor: integer("amount_minor").notNull(),
    currency: text("currency").notNull(),
    note: text("note"),
    // --- schedule ---
    frequency: text("frequency", { enum: ["daily", "weekly", "monthly", "yearly"] }).notNull(),
    /** Every N periods. `interval` is reserved in some dialects, so the column is explicit. */
    intervalCount: integer("interval_count").notNull().default(1),
    /** 1-31 for monthly/yearly; 31 means "last day of month". */
    dayOfMonth: integer("day_of_month"),
    /** 0 = Sunday .. 6 = Saturday, for weekly rules. */
    weekday: integer("weekday"),
    monthOfYear: integer("month_of_year"),
    startDate: text("start_date").notNull(),
    endDate: text("end_date"),
    nextRunAt: text("next_run_at").notNull(),
    autoPost: integer("auto_post", { mode: "boolean" }).notNull().default(true),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    lastPostedAt: text("last_posted_at"),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("recurring_due_idx").on(t.active, t.nextRunAt),
    check("recurring_amount_positive", sql`${t.amountMinor} > 0`),
  ],
);

export const transactions = sqliteTable(
  "transactions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    type: text("type", { enum: ["income", "expense", "transfer"] }).notNull(),
    /** Source account. For income this is the account being credited. */
    accountId: integer("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "restrict" }),
    /** Destination account, transfers only. */
    toAccountId: integer("to_account_id").references(() => accounts.id, { onDelete: "restrict" }),
    /** Always a positive magnitude; the sign is implied by `type`. */
    amountMinor: integer("amount_minor").notNull(),
    /** Currency of `accountId`, denormalised so history survives account edits. */
    currency: text("currency").notNull(),
    /** Amount credited to `toAccountId` for cross-currency transfers. */
    toAmountMinor: integer("to_amount_minor"),
    /** Amount in the base currency, frozen at entry time so reports never drift. */
    baseAmountMinor: integer("base_amount_minor").notNull(),
    /** Rate used for `baseAmountMinor`, kept for auditability. */
    fxRate: real("fx_rate").notNull().default(1),
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "set null" }),
    goalId: integer("goal_id").references(() => goals.id, { onDelete: "set null" }),
    debtId: integer("debt_id").references(() => debts.id, { onDelete: "set null" }),
    recurringId: integer("recurring_id").references(() => recurringRules.id, {
      onDelete: "set null",
    }),
    occurredAt: text("occurred_at").notNull(),
    note: text("note"),
    createdAt: integer("created_at").notNull().default(now),
    updatedAt: integer("updated_at").notNull().default(now),
  },
  (t) => [
    index("tx_occurred_idx").on(t.occurredAt),
    index("tx_account_idx").on(t.accountId, t.occurredAt),
    index("tx_to_account_idx").on(t.toAccountId, t.occurredAt),
    index("tx_category_idx").on(t.categoryId, t.occurredAt),
    index("tx_type_idx").on(t.type, t.occurredAt),
    index("tx_goal_idx").on(t.goalId),
    index("tx_debt_idx").on(t.debtId),
    check("tx_amount_positive", sql`${t.amountMinor} > 0`),
    check(
      "tx_transfer_shape",
      sql`(${t.type} = 'transfer' AND ${t.toAccountId} IS NOT NULL AND ${t.toAccountId} <> ${t.accountId})
          OR (${t.type} <> 'transfer' AND ${t.toAccountId} IS NULL)`,
    ),
  ],
);

export const exchangeRates = sqliteTable(
  "exchange_rates",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** Currency being priced; the price is expressed in the base currency. */
    quote: text("quote").notNull(),
    rateToBase: real("rate_to_base").notNull(),
    asOf: text("as_of").notNull(),
    source: text("source", { enum: ["manual", "api"] }).notNull().default("manual"),
  },
  (t) => [
    uniqueIndex("fx_quote_date_unq").on(t.quote, t.asOf),
    index("fx_lookup_idx").on(t.quote, t.asOf),
    check("fx_rate_positive", sql`${t.rateToBase} > 0`),
  ],
);

export const budgets = sqliteTable(
  "budgets",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    /** NULL means a total budget across all expense categories. */
    categoryId: integer("category_id").references(() => categories.id, { onDelete: "cascade" }),
    /** In the base currency. */
    amountMinor: integer("amount_minor").notNull(),
    period: text("period", { enum: ["monthly"] }).notNull().default("monthly"),
    startMonth: text("start_month").notNull(),
    rollover: integer("rollover", { mode: "boolean" }).notNull().default(false),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    createdAt: integer("created_at").notNull().default(now),
  },
  (t) => [
    index("budget_category_idx").on(t.categoryId, t.active),
    check("budget_amount_positive", sql`${t.amountMinor} > 0`),
  ],
);

export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type ExchangeRate = typeof exchangeRates.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type RecurringRule = typeof recurringRules.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type Debt = typeof debts.$inferSelect;
