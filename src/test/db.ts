import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

/**
 * Creates an empty, migrated database in the OS temp directory and points
 * DATABASE_PATH at it. Must be called before `@/db` is imported, which is why
 * integration tests use dynamic imports.
 */
export function createTestDatabase(label: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `selfbank-${label}-`));
  const dbPath = path.join(dir, "test.db");

  const migrationsDir = path.resolve(import.meta.dirname, "../../drizzle");
  const journal = JSON.parse(
    fs.readFileSync(path.join(migrationsDir, "meta", "_journal.json"), "utf8"),
  ) as { entries: Array<{ idx: number; tag: string }> };

  const db = new Database(dbPath);
  db.pragma("foreign_keys = OFF");
  for (const entry of [...journal.entries].sort((a, b) => a.idx - b.idx)) {
    const sql = fs.readFileSync(path.join(migrationsDir, `${entry.tag}.sql`), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) db.exec(trimmed);
    }
  }
  db.close();

  process.env.DATABASE_PATH = dbPath;
  process.env.AUTH_SECRET = "test-secret-at-least-32-characters-long";
  return dbPath;
}
