import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { DATABASE_PATH } from "@/lib/env";
import * as schema from "./schema";

function open() {
  const dir = path.dirname(DATABASE_PATH);
  fs.mkdirSync(dir, { recursive: true });

  const sqlite = new Database(DATABASE_PATH);
  // WAL survives crashes better and lets reads run alongside a write.
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("synchronous = NORMAL");
  return sqlite;
}

// Next's dev server re-evaluates modules on edit; without this the process
// would accumulate open database handles.
const globalForDb = globalThis as unknown as {
  __selfbankSqlite?: Database.Database;
};

export const sqlite = globalForDb.__selfbankSqlite ?? open();
if (process.env.NODE_ENV !== "production") globalForDb.__selfbankSqlite = sqlite;

export const db = drizzle(sqlite, { schema });
export { schema };
