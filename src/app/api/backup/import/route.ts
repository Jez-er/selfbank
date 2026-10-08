import fs from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { requireSessionOr401 } from "@/lib/auth-server";
import { BackupError, importBackup, parseBackup, snapshotDatabase } from "@/lib/backup";
import { DATABASE_PATH } from "@/lib/env";
import { pathWithParams, redirectTo } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Refuse absurd uploads before reading them into memory. */
const MAX_BYTES = 64 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const { response } = await requireSessionOr401();
  if (response) return response;

  const form = await request.formData();
  const file = form.get("file");
  const mode = form.get("mode") === "merge" ? "merge" : "replace";

  if (!(file instanceof File) || file.size === 0) {
    return back("Виберіть файл резервної копії", "error");
  }
  if (file.size > MAX_BYTES) {
    return back("Файл занадто великий (максимум 64 МБ)", "error");
  }

  let parsed;
  try {
    parsed = parseBackup(JSON.parse(await file.text()));
  } catch (error) {
    const message =
      error instanceof BackupError
        ? error.message
        : "Не вдалося прочитати файл: це має бути JSON-копія SelfBank";
    return back(message, "error");
  }

  // A replace wipes everything, so snapshot the current state first. This is
  // the difference between a mistake and a disaster.
  let snapshotName: string | null = null;
  if (mode === "replace") {
    try {
      snapshotName = writeSafetySnapshot();
    } catch (error) {
      console.error("[selfbank] pre-import snapshot failed:", error);
      return back("Не вдалося створити страхувальну копію перед заміною. Імпорт скасовано.", "error");
    }
  }

  try {
    const report = importBackup(parsed, mode);
    for (const p of ["/", "/transactions", "/accounts", "/categories", "/budgets", "/recurring", "/goals", "/debts", "/analytics", "/settings"]) {
      revalidatePath(p);
    }

    const unresolved = Object.values(report.unresolved).reduce((a, b) => a + b, 0);
    const parts = [`Імпортовано записів: ${report.total}`];
    if (mode === "merge") {
      const skipped = Object.values(report.skipped).reduce((a, b) => a + b, 0);
      parts.push(`пропущено дублікатів: ${skipped}`);
    }
    if (unresolved > 0) parts.push(`пропущено через втрачені зв’язки: ${unresolved}`);
    if (snapshotName) parts.push(`страхувальна копія: ${snapshotName}`);

    return back(parts.join(", "), "ok");
  } catch (error) {
    const message =
      error instanceof BackupError ? error.message : "Імпорт не вдався, зміни скасовано";
    console.error("[selfbank] import failed:", error);
    return back(snapshotName ? `${message}. Страхувальна копія: ${snapshotName}` : message, "error");
  }
}

/** Writes a timestamped snapshot next to the database, in `backups/`. */
function writeSafetySnapshot(): string {
  const dir = path.join(path.dirname(DATABASE_PATH), "backups");
  fs.mkdirSync(dir, { recursive: true });
  const name = `pre-import-${new Date().toISOString().replace(/[:.]/g, "-")}.db`;
  snapshotDatabase(path.join(dir, name));
  return name;
}

function back(message: string, status: "ok" | "error") {
  return redirectTo(
    pathWithParams("/settings", { [status === "ok" ? "imported" : "importError"]: message }),
  );
}
