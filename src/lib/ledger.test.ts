import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { createTestDatabase } from "@/test/db";

// The database path must be set before `@/db` is first imported, so every
// module under test is pulled in dynamically after this call.
createTestDatabase("ledger");

type Mod = {
  db: typeof import("@/db").db;
  sqlite: typeof import("@/db").sqlite;
  schema: typeof import("@/db/schema");
  seed: typeof import("@/db/seed");
  balances: typeof import("@/lib/queries/balances");
  stats: typeof import("@/lib/queries/stats");
  runner: typeof import("@/lib/recurring-runner");
  backup: typeof import("@/lib/backup");
  goals: typeof import("@/lib/queries/goals");
  debts: typeof import("@/lib/queries/debts");
  budgets: typeof import("@/lib/queries/budgets");
};

let m: Mod;

/** ids of fixtures shared across the suites below */
const ids = {
  uah: 0,
  usd: 0,
  food: 0,
  salary: 0,
  goal: 0,
  debt: 0,
};

beforeAll(async () => {
  const dbMod = await import("@/db");
  m = {
    db: dbMod.db,
    sqlite: dbMod.sqlite,
    schema: await import("@/db/schema"),
    seed: await import("@/db/seed"),
    balances: await import("@/lib/queries/balances"),
    stats: await import("@/lib/queries/stats"),
    runner: await import("@/lib/recurring-runner"),
    backup: await import("@/lib/backup"),
    goals: await import("@/lib/queries/goals"),
    debts: await import("@/lib/queries/debts"),
    budgets: await import("@/lib/queries/budgets"),
  };

  const { db, schema } = m;
  m.seed.seedIfEmpty();

  // Two accounts in different currencies, and a USD rate of 40 UAH.
  ids.uah = db
    .insert(schema.accounts)
    .values({ name: "Готівка UAH", currency: "UAH", openingBalanceMinor: 100_000, sortOrder: 10 })
    .returning({ id: schema.accounts.id })
    .get()!.id;
  ids.usd = db
    .insert(schema.accounts)
    .values({ name: "Долари", currency: "USD", openingBalanceMinor: 0, sortOrder: 11 })
    .returning({ id: schema.accounts.id })
    .get()!.id;

  db.insert(schema.exchangeRates)
    .values({ quote: "USD", rateToBase: 40, asOf: "2025-01-01" })
    .run();

  ids.food = db
    .insert(schema.categories)
    .values({ name: "Їжа (тест)", kind: "expense" })
    .returning({ id: schema.categories.id })
    .get()!.id;
  ids.salary = db
    .insert(schema.categories)
    .values({ name: "Зарплата (тест)", kind: "income" })
    .returning({ id: schema.categories.id })
    .get()!.id;
});

function addTx(over: Partial<typeof import("@/db/schema").transactions.$inferInsert>) {
  return m.db
    .insert(m.schema.transactions)
    .values({
      type: "expense",
      accountId: ids.uah,
      amountMinor: 1000,
      currency: "UAH",
      baseAmountMinor: 1000,
      fxRate: 1,
      occurredAt: "2025-06-15",
      ...over,
    } as typeof import("@/db/schema").transactions.$inferInsert)
    .returning({ id: m.schema.transactions.id })
    .get()!.id;
}

describe("balances", () => {
  it("starts from the opening balance", () => {
    const uah = m.balances.accountBalances().find((a) => a.id === ids.uah)!;
    expect(uah.balanceMinor).toBe(100_000);
  });

  it("applies income and expense to the owning account", () => {
    addTx({ type: "income", categoryId: ids.salary, amountMinor: 50_000, baseAmountMinor: 50_000 });
    addTx({ type: "expense", categoryId: ids.food, amountMinor: 20_000, baseAmountMinor: 20_000 });

    const uah = m.balances.accountBalances().find((a) => a.id === ids.uah)!;
    expect(uah.balanceMinor).toBe(100_000 + 50_000 - 20_000);
  });

  it("debits the source and credits the target of a cross-currency transfer", () => {
    // 4000.00 UAH out, 100.00 USD in, at 40 UAH per USD.
    addTx({
      type: "transfer",
      accountId: ids.uah,
      toAccountId: ids.usd,
      amountMinor: 400_000,
      baseAmountMinor: 400_000,
      toAmountMinor: 10_000,
      categoryId: null,
    });

    const list = m.balances.accountBalances();
    const uah = list.find((a) => a.id === ids.uah)!;
    const usd = list.find((a) => a.id === ids.usd)!;

    expect(uah.balanceMinor).toBe(100_000 + 50_000 - 20_000 - 400_000);
    expect(usd.balanceMinor).toBe(10_000);
    // 100.00 USD at today's rate of 40 = 4000.00 UAH
    expect(usd.baseBalanceMinor).toBe(400_000);
  });

  it("reports an unconverted currency instead of silently treating it as zero", () => {
    const { db, schema } = m;
    const plnId = db
      .insert(schema.accounts)
      .values({ name: "Злоті", currency: "PLN", openingBalanceMinor: 5_000, sortOrder: 99 })
      .returning({ id: schema.accounts.id })
      .get()!.id;

    const pln = m.balances.accountBalances().find((a) => a.id === plnId)!;
    expect(pln.baseBalanceMinor).toBeNull();
    expect(m.balances.totalBalance().unconverted).toContain("PLN");

    db.delete(schema.accounts).where(eq(schema.accounts.id, plnId)).run();
  });

  it("excludes transfers from income and expense totals", () => {
    const summary = m.stats.periodSummary({ from: "2025-06-01", to: "2025-06-30" });
    expect(summary.incomeMinor).toBe(50_000);
    expect(summary.expenseMinor).toBe(20_000);
    expect(summary.netMinor).toBe(30_000);
    expect(summary.savingsRate).toBeCloseTo(60, 5);
  });
});

describe("recurring posting", () => {
  it("catches up missed occurrences and is idempotent", () => {
    const { db, schema } = m;
    db.insert(schema.recurringRules)
      .values({
        name: "Підписка",
        type: "expense",
        accountId: ids.uah,
        categoryId: ids.food,
        amountMinor: 9_900,
        currency: "UAH",
        frequency: "monthly",
        intervalCount: 1,
        dayOfMonth: 5,
        startDate: "2025-01-05",
        nextRunAt: "2025-01-05",
        autoPost: true,
        active: true,
      })
      .run();

    // Five occurrences are owed: Jan-May on the 5th.
    const first = m.runner.postDueRules("2025-05-20");
    expect(first.transactionsCreated).toBe(5);

    // Running again posts nothing: the cursor already moved past them.
    const second = m.runner.postDueRules("2025-05-20");
    expect(second.transactionsCreated).toBe(0);

    const posted = m.sqlite
      .prepare(`SELECT occurred_at FROM transactions WHERE recurring_id IS NOT NULL ORDER BY 1`)
      .all() as Array<{ occurred_at: string }>;
    expect(posted.map((r) => r.occurred_at)).toEqual([
      "2025-01-05",
      "2025-02-05",
      "2025-03-05",
      "2025-04-05",
      "2025-05-05",
    ]);
  });

  it("deactivates a rule once its end date has passed", () => {
    const { db, schema } = m;
    db.insert(schema.recurringRules)
      .values({
        name: "Курс англійської",
        type: "expense",
        accountId: ids.uah,
        amountMinor: 1_000,
        currency: "UAH",
        frequency: "monthly",
        intervalCount: 1,
        dayOfMonth: 10,
        startDate: "2025-01-10",
        endDate: "2025-02-28",
        nextRunAt: "2025-01-10",
        autoPost: true,
        active: true,
      })
      .run();

    const report = m.runner.postDueRules("2025-06-01");
    expect(report.transactionsCreated).toBe(2); // Jan and Feb only
    expect(report.deactivated).toBeGreaterThanOrEqual(1);
  });
});

describe("goals and debts", () => {
  it("tracks goal progress from tagged transactions", () => {
    const { db, schema } = m;
    ids.goal = db
      .insert(schema.goals)
      .values({ name: "На ноутбук", targetMinor: 100_000, currency: "UAH" })
      .returning({ id: schema.goals.id })
      .get()!.id;

    addTx({ type: "income", amountMinor: 30_000, baseAmountMinor: 30_000, goalId: ids.goal });
    addTx({ type: "income", amountMinor: 20_000, baseAmountMinor: 20_000, goalId: ids.goal });

    const goal = m.goals.goalProgress().find((g) => g.id === ids.goal)!;
    expect(goal.savedMinor).toBe(50_000);
    expect(goal.remainingMinor).toBe(50_000);
    expect(goal.progressPercent).toBeCloseTo(50, 5);
    expect(goal.done).toBe(false);
  });

  it("counts repayments of a debt I owe as expenses", () => {
    const { db, schema } = m;
    ids.debt = db
      .insert(schema.debts)
      .values({
        counterparty: "Петро",
        direction: "i_owe",
        principalMinor: 60_000,
        currency: "UAH",
      })
      .returning({ id: schema.debts.id })
      .get()!.id;

    addTx({ type: "expense", amountMinor: 25_000, baseAmountMinor: 25_000, debtId: ids.debt });

    const debt = m.debts.debtProgress().find((d) => d.id === ids.debt)!;
    expect(debt.paidMinor).toBe(25_000);
    expect(debt.outstandingMinor).toBe(35_000);

    const summary = m.debts.debtSummary();
    expect(summary.iOweMinor).toBe(35_000);
  });
});

describe("budgets", () => {
  it("reports over-spend against a category limit", () => {
    const { db, schema } = m;
    db.insert(schema.budgets)
      .values({ categoryId: ids.food, amountMinor: 15_000, startMonth: "2025-06" })
      .run();

    const progress = m.budgets.budgetProgress("2025-06").find((b) => b.categoryId === ids.food)!;
    // 200.00 spent on food in June against a 150.00 limit.
    expect(progress.spentMinor).toBe(20_000);
    expect(progress.limitMinor).toBe(15_000);
    expect(progress.state).toBe("over");
    expect(progress.remainingMinor).toBeLessThan(0);
  });
});

describe("backup round-trip", () => {
  it("restores an identical database in replace mode", () => {
    const before = m.backup.exportBackup();
    const report = m.backup.importBackup(m.backup.parseBackup(before), "replace");
    expect(report.total).toBeGreaterThan(0);

    const after = m.backup.exportBackup();
    // The envelope carries a timestamp, so only the payload is compared.
    expect(JSON.stringify(after.data)).toBe(JSON.stringify(before.data));
    expect(after.counts).toEqual(before.counts);
  });

  it("keeps foreign-key links intact through a restore", () => {
    const linked = m.sqlite
      .prepare(
        `SELECT COUNT(*) AS n FROM transactions
         WHERE goal_id IS NOT NULL OR debt_id IS NOT NULL OR recurring_id IS NOT NULL`,
      )
      .get() as { n: number };
    expect(linked.n).toBeGreaterThan(0);
    expect(m.sqlite.prepare(`PRAGMA foreign_key_check`).all()).toEqual([]);
  });

  it("skips duplicates in merge mode", () => {
    const before = m.backup.exportBackup();
    const countsBefore = m.backup.currentCounts();

    const report = m.backup.importBackup(m.backup.parseBackup(before), "merge");

    // Every transaction already exists, so all of them are skipped.
    expect(report.skipped.transactions).toBe(countsBefore.transactions);
    expect(report.inserted.transactions).toBe(0);
    expect(m.backup.currentCounts().transactions).toBe(countsBefore.transactions);
  });

  it("inserts genuinely new rows in merge mode and rewires their links", () => {
    const before = m.backup.exportBackup();
    const countsBefore = m.backup.currentCounts();

    // A backup from another device: one account and one transaction, with ids
    // that collide with the ones already here. Every other table is empty, as
    // a real export from a fresh instance would be.
    const foreign = structuredClone(before);
    for (const table of Object.keys(foreign.data)) foreign.data[table] = [];
    foreign.data.accounts = [
      {
        id: 999,
        name: "Рахунок з іншого пристрою",
        type: "card",
        currency: "UAH",
        opening_balance_minor: 0,
        color: "#111111",
        sort_order: 50,
        archived: 0,
        created_at: Date.now(),
      },
    ];
    foreign.data.transactions = [
      {
        id: 999,
        type: "expense",
        account_id: 999,
        to_account_id: null,
        amount_minor: 7_777,
        currency: "UAH",
        to_amount_minor: null,
        base_amount_minor: 7_777,
        fx_rate: 1,
        category_id: null,
        goal_id: null,
        debt_id: null,
        recurring_id: null,
        occurred_at: "2025-07-07",
        note: "Операція з іншого пристрою",
        created_at: Date.now(),
        updated_at: Date.now(),
      },
    ];

    const report = m.backup.importBackup(m.backup.parseBackup(foreign), "merge");
    expect(report.inserted.accounts).toBe(1);
    expect(report.inserted.transactions).toBe(1);
    expect(m.backup.currentCounts().transactions).toBe(countsBefore.transactions + 1);

    // The id 999 collided with nothing: the row got a fresh id and its
    // account_id was rewritten to the newly inserted account.
    const row = m.sqlite
      .prepare(
        `SELECT t.id, t.account_id, a.name AS accountName
         FROM transactions t JOIN accounts a ON a.id = t.account_id
         WHERE t.note = ?`,
      )
      .get("Операція з іншого пристрою") as { id: number; account_id: number; accountName: string };
    expect(row.accountName).toBe("Рахунок з іншого пристрою");
    expect(row.id).not.toBe(999);
    expect(m.sqlite.prepare(`PRAGMA foreign_key_check`).all()).toEqual([]);
  });

  it("skips a row whose reference cannot be resolved instead of failing", () => {
    const countsBefore = m.backup.currentCounts();

    // A hand-edited file: the transaction points at an account the file does
    // not contain. Blanking the link would violate NOT NULL, so the row is
    // dropped and reported.
    const broken = {
      format: "selfbank-backup",
      version: 1,
      data: {
        transactions: [
          {
            id: 1,
            type: "expense",
            account_id: 4242,
            to_account_id: null,
            amount_minor: 100,
            currency: "UAH",
            to_amount_minor: null,
            base_amount_minor: 100,
            fx_rate: 1,
            category_id: null,
            goal_id: null,
            debt_id: null,
            recurring_id: null,
            occurred_at: "2025-08-08",
            note: "Осиротіла операція",
            created_at: Date.now(),
            updated_at: Date.now(),
          },
        ],
      },
    };

    const report = m.backup.importBackup(m.backup.parseBackup(broken), "merge");
    expect(report.unresolved.transactions).toBe(1);
    expect(report.inserted.transactions ?? 0).toBe(0);
    expect(m.backup.currentCounts().transactions).toBe(countsBefore.transactions);
  });

  it("rejects a file that is not a SelfBank backup", () => {
    expect(() => m.backup.parseBackup({ hello: "world" })).toThrow();
    expect(() =>
      m.backup.parseBackup({ format: "selfbank-backup", version: 99, data: {} }),
    ).toThrow(/новішою версією/);
    expect(() =>
      m.backup.parseBackup({ format: "selfbank-backup", version: 1, data: { bogus: [] } }),
    ).toThrow(/Невідома таблиця/);
  });
});
