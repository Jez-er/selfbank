#!/usr/bin/env node
/**
 * Applies the SQL files in drizzle/ in journal order.
 *
 * Deliberately depends on nothing but better-sqlite3: it has to run inside the
 * production image, where drizzle-kit (a dev dependency) is not installed.
 * Applied migrations are recorded in __selfbank_migrations, and each file runs
 * inside a transaction so a failure leaves no half-applied schema.
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import Database from "better-sqlite3";

const dbPath = process.env.DATABASE_PATH ?? "./data/selfbank.db";
const migrationsDir = process.env.MIGRATIONS_DIR ?? path.join(process.cwd(), "drizzle");

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const journalPath = path.join(migrationsDir, "meta", "_journal.json");
if (!fs.existsSync(journalPath)) {
  console.error(`[migrate] No migration journal at ${journalPath}`);
  process.exit(1);
}

const journal = JSON.parse(fs.readFileSync(journalPath, "utf8"));
const entries = [...(journal.entries ?? [])].sort((a, b) => a.idx - b.idx);

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = OFF"); // re-enabled by the app; table order is irrelevant here

db.exec(`
  CREATE TABLE IF NOT EXISTS __selfbank_migrations (
    tag TEXT PRIMARY KEY,
    applied_at INTEGER NOT NULL
  )
`);

const applied = new Set(
  db.prepare("SELECT tag FROM __selfbank_migrations").all().map((row) => row.tag),
);
const record = db.prepare(
  "INSERT INTO __selfbank_migrations (tag, applied_at) VALUES (?, ?)",
);

let count = 0;
for (const entry of entries) {
  if (applied.has(entry.tag)) continue;

  const file = path.join(migrationsDir, `${entry.tag}.sql`);
  if (!fs.existsSync(file)) {
    console.error(`[migrate] Journal lists ${entry.tag} but ${file} is missing`);
    process.exit(1);
  }

  const statements = fs
    .readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const run = db.transaction(() => {
    for (const statement of statements) db.exec(statement);
    record.run(entry.tag, Date.now());
  });

  try {
    run();
  } catch (error) {
    console.error(`[migrate] Failed on ${entry.tag}: ${error.message}`);
    process.exit(1);
  }

  console.log(`[migrate] Applied ${entry.tag} (${statements.length} statements)`);
  count += 1;
}

db.close();
console.log(
  count === 0
    ? `[migrate] Up to date (${entries.length} migrations, ${dbPath})`
    : `[migrate] Applied ${count} migration(s) to ${dbPath}`,
);
