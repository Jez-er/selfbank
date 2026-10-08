import "server-only";
import { z } from "zod";
import { sqlite } from "@/db";

/**
 * Full-database backup and restore.
 *
 * The export is a complete dump of every table *including primary keys*, so a
 * restore reproduces the exact previous state - every transaction keeps its
 * category, goal and debt links. That is the difference between a backup and
 * a report, and it is why ids are not stripped.
 *
 * Column lists live here, in dependency order, as the single source of truth
 * shared by export, restore and the merge id-remapping.
 */

export const BACKUP_FORMAT = "selfbank-backup";
export const BACKUP_VERSION = 1;

interface TableSpec {
  name: string;
  columns: string[];
  /** Columns holding a foreign key, mapped to the table they point at. */
  references?: Record<string, string>;
  /**
   * Columns that identify a row independently of its primary key. In merge
   * mode a row matching an existing one on these columns is not inserted -
   * its id is mapped to the existing row instead. That is what makes
   * re-importing the same backup a no-op rather than doubling everything.
   */
  naturalKey?: string[];
}

/** Insert order: a table never appears before something it references. */
export const TABLES: TableSpec[] = [
  { name: "settings", columns: ["key", "value"], naturalKey: ["key"] },
  {
    name: "accounts",
    columns: [
      "id",
      "name",
      "type",
      "currency",
      "opening_balance_minor",
      "color",
      "sort_order",
      "archived",
      "created_at",
    ],
    naturalKey: ["name", "currency"],
  },
  {
    name: "categories",
    columns: ["id", "name", "kind", "icon", "color", "parent_id", "sort_order", "archived"],
    references: { parent_id: "categories" },
    naturalKey: ["name", "kind", "parent_id"],
  },
  {
    name: "exchange_rates",
    columns: ["id", "quote", "rate_to_base", "as_of", "source"],
    naturalKey: ["quote", "as_of"],
  },
  {
    name: "goals",
    columns: [
      "id",
      "name",
      "target_minor",
      "currency",
      "target_date",
      "account_id",
      "note",
      "archived",
      "created_at",
    ],
    references: { account_id: "accounts" },
    naturalKey: ["name", "currency"],
  },
  {
    name: "debts",
    columns: [
      "id",
      "counterparty",
      "direction",
      "principal_minor",
      "currency",
      "due_date",
      "note",
      "settled_at",
      "created_at",
    ],
    naturalKey: ["counterparty", "direction", "principal_minor"],
  },
  {
    name: "recurring_rules",
    columns: [
      "id",
      "name",
      "type",
      "account_id",
      "to_account_id",
      "category_id",
      "amount_minor",
      "currency",
      "note",
      "frequency",
      "interval_count",
      "day_of_month",
      "weekday",
      "month_of_year",
      "start_date",
      "end_date",
      "next_run_at",
      "auto_post",
      "active",
      "last_posted_at",
      "created_at",
    ],
    references: {
      account_id: "accounts",
      to_account_id: "accounts",
      category_id: "categories",
    },
    naturalKey: ["name", "type", "account_id", "amount_minor", "start_date"],
  },
  {
    name: "budgets",
    columns: [
      "id",
      "category_id",
      "amount_minor",
      "period",
      "start_month",
      "rollover",
      "active",
      "created_at",
    ],
    references: { category_id: "categories" },
    naturalKey: ["category_id", "start_month"],
  },
  {
    name: "transactions",
    columns: [
      "id",
      "type",
      "account_id",
      "to_account_id",
      "amount_minor",
      "currency",
      "to_amount_minor",
      "base_amount_minor",
      "fx_rate",
      "category_id",
      "goal_id",
      "debt_id",
      "recurring_id",
      "occurred_at",
      "note",
      "created_at",
      "updated_at",
    ],
    references: {
      account_id: "accounts",
      to_account_id: "accounts",
      category_id: "categories",
      goal_id: "goals",
      debt_id: "debts",
      recurring_id: "recurring_rules",
    },
    naturalKey: ["type", "account_id", "amount_minor", "occurred_at", "note"],
  },
];

export type BackupData = Record<string, Array<Record<string, unknown>>>;

export interface Backup {
  format: typeof BACKUP_FORMAT;
  version: number;
  exported_at: string;
  base_currency: string;
  counts: Record<string, number>;
  data: BackupData;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

export function exportBackup(): Backup {
  const data: BackupData = {};
  const counts: Record<string, number> = {};

  for (const table of TABLES) {
    // Ordering by the first column (id, or key for settings) keeps two
    // exports of the same database byte-identical.
    const rows = sqlite
      .prepare(
        `SELECT ${table.columns.join(", ")} FROM ${table.name} ORDER BY ${table.columns[0]}`,
      )
      .all() as Array<Record<string, unknown>>;
    data[table.name] = rows;
    counts[table.name] = rows.length;
  }

  const baseCurrency =
    (data.settings?.find((row) => row.key === "base_currency")?.value as string) ?? "UAH";

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exported_at: new Date().toISOString(),
    base_currency: baseCurrency,
    counts,
    data,
  };
}

export function backupFilename(date = new Date()): string {
  return `selfbank-backup-${date.toISOString().slice(0, 10)}.json`;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const rowSchema = z.record(z.string(), z.unknown());

const backupSchema = z.object({
  format: z.literal(BACKUP_FORMAT, {
    error: "Це не файл резервної копії SelfBank",
  }),
  version: z.number().int().positive(),
  exported_at: z.string().optional(),
  base_currency: z.string().optional(),
  data: z.record(z.string(), z.array(rowSchema)),
});

export type ParsedBackup = z.infer<typeof backupSchema>;

export function parseBackup(raw: unknown): ParsedBackup {
  const result = backupSchema.safeParse(raw);
  if (!result.success) {
    throw new BackupError(
      result.error.issues[0]?.message ?? "Файл резервної копії має невірну структуру",
    );
  }
  if (result.data.version > BACKUP_VERSION) {
    throw new BackupError(
      `Копія створена новішою версією (v${result.data.version}), ця збірка розуміє до v${BACKUP_VERSION}.`,
    );
  }
  // Unknown table names are rejected rather than ignored: silently dropping
  // part of a restore is worse than refusing it.
  const known = new Set(TABLES.map((t) => t.name));
  for (const name of Object.keys(result.data.data)) {
    if (!known.has(name)) throw new BackupError(`Невідома таблиця у копії: ${name}`);
  }
  return result.data;
}

export class BackupError extends Error {}

export interface ImportReport {
  mode: "replace" | "merge";
  inserted: Record<string, number>;
  skipped: Record<string, number>;
  /** Rows dropped because a reference in them could not be resolved. */
  unresolved: Record<string, number>;
  total: number;
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/**
 * Restores a backup.
 *
 * `replace` wipes every table and inserts the backup verbatim, preserving ids.
 * `merge` keeps existing data, inserts with fresh ids and rewrites foreign
 * keys through an id map, skipping transactions that look like duplicates.
 *
 * Everything happens in one SQLite transaction, so a malformed row near the
 * end cannot leave the database half-restored. Foreign keys are deferred for
 * the duration and verified before the commit.
 */
export function importBackup(backup: ParsedBackup, mode: "replace" | "merge"): ImportReport {
  const report: ImportReport = { mode, inserted: {}, skipped: {}, unresolved: {}, total: 0 };

  const run = sqlite.transaction(() => {
    if (mode === "replace") {
      // Reverse order so children go before their parents.
      for (const table of [...TABLES].reverse()) {
        sqlite.prepare(`DELETE FROM ${table.name}`).run();
      }
      // Restart AUTOINCREMENT counters so restored ids are not re-issued.
      sqlite.prepare(`DELETE FROM sqlite_sequence`).run();
    }

    /** oldId -> newId per table; only populated in merge mode. */
    const idMap = new Map<string, Map<number, number>>();
    for (const table of TABLES) idMap.set(table.name, new Map());

    for (const table of TABLES) {
      const rows = backup.data[table.name] ?? [];
      let inserted = 0;
      let skipped = 0;
      let unresolved = 0;

      for (const row of rows) {
        const values = { ...row };

        if (mode === "replace") {
          insertRow(table, values);
          inserted += 1;
          continue;
        }

        // Merge: rewrite foreign keys to the ids this database actually uses,
        // then look for a row that already represents the same thing.
        if (!remapReferences(table, values, idMap)) {
          unresolved += 1;
          skipped += 1;
          continue;
        }
        const existingId = findByNaturalKey(table, values);
        const oldId = typeof values.id === "number" ? values.id : undefined;

        if (existingId !== undefined) {
          if (oldId !== undefined) idMap.get(table.name)!.set(oldId, existingId);
          skipped += 1;
          continue;
        }

        delete values.id;
        const info = insertRow(table, values);
        if (oldId !== undefined) {
          idMap.get(table.name)!.set(oldId, Number(info.lastInsertRowid));
        }
        inserted += 1;
      }

      report.inserted[table.name] = inserted;
      report.skipped[table.name] = skipped;
      if (unresolved > 0) report.unresolved[table.name] = unresolved;
      report.total += inserted;
    }

    // Catch any dangling reference before the data is committed.
    const violations = sqlite.prepare(`PRAGMA foreign_key_check`).all();
    if (violations.length > 0) {
      throw new BackupError(
        `Копія містить ${violations.length} посилань на відсутні записи. Імпорт скасовано.`,
      );
    }
  });

  run();
  return report;
}

function insertRow(table: TableSpec, values: Record<string, unknown>) {
  const columns = table.columns.filter((c) => c in values);
  if (columns.length === 0) throw new BackupError(`Порожній рядок у таблиці ${table.name}`);
  const placeholders = columns.map(() => "?").join(", ");
  return sqlite
    .prepare(`INSERT INTO ${table.name} (${columns.join(", ")}) VALUES (${placeholders})`)
    .run(...columns.map((c) => normalise(values[c])));
}

/** SQLite only binds null, number, bigint, string and Buffer. */
function normalise(value: unknown): null | number | string {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" || typeof value === "string") return value;
  throw new BackupError(`Непідтримуване значення у копії: ${JSON.stringify(value)}`);
}

/**
 * Rewrites foreign keys to the ids this database actually assigned.
 *
 * Returns false when a non-null reference cannot be resolved. Such a row is
 * skipped rather than inserted with the link blanked out: nulling a NOT NULL
 * column would fail with a raw SQLite error, and nulling a nullable one would
 * silently lose the relationship.
 */
function remapReferences(
  table: TableSpec,
  values: Record<string, unknown>,
  idMap: Map<string, Map<number, number>>,
): boolean {
  if (!table.references) return true;
  for (const [column, targetTable] of Object.entries(table.references)) {
    const old = values[column];
    if (old === null || old === undefined) continue;
    if (typeof old !== "number") return false;
    const mapped = idMap.get(targetTable)?.get(old);
    if (mapped === undefined) return false;
    values[column] = mapped;
  }
  return true;
}

/**
 * Primary key of an existing row matching this one on the table's natural key,
 * or undefined when it is genuinely new. Tables without a natural key always
 * insert.
 *
 * Nullable key columns are compared with `IS` so that NULL matches NULL -
 * plain `=` would treat two uncategorised transactions as different rows.
 */
function findByNaturalKey(table: TableSpec, values: Record<string, unknown>): number | undefined {
  if (!table.naturalKey || table.naturalKey.length === 0) return undefined;

  const idColumn = table.columns[0]!;
  const conditions = table.naturalKey.map((column) =>
    column === "note"
      ? `IFNULL(${column}, '') IS IFNULL(?, '')`
      : `${column} IS ?`,
  );
  const row = sqlite
    .prepare(
      `SELECT ${idColumn} AS pk FROM ${table.name} WHERE ${conditions.join(" AND ")} LIMIT 1`,
    )
    .get(...table.naturalKey.map((column) => normalise(values[column]))) as
    | { pk: number | string }
    | undefined;

  if (row === undefined) return undefined;
  // `settings` is keyed by text; callers only use the number for id mapping.
  return typeof row.pk === "number" ? row.pk : -1;
}

// ---------------------------------------------------------------------------
// Safety net
// ---------------------------------------------------------------------------

/**
 * Snapshot of the live database, written before a destructive restore.
 * `VACUUM INTO` produces a consistent copy without stopping the app.
 */
export function snapshotDatabase(targetPath: string): void {
  sqlite.prepare(`VACUUM INTO ?`).run(targetPath);
}

/** Row counts used to warn the user about what a replace would destroy. */
export function currentCounts(): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const table of TABLES) {
    const row = sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table.name}`).get() as { n: number };
    counts[table.name] = row.n;
  }
  return counts;
}
