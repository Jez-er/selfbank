import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { requireSessionOr401 } from "@/lib/auth-server";
import { snapshotDatabase } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The raw SQLite file - the most faithful backup there is.
 *
 * `VACUUM INTO` writes a consistent snapshot while the app keeps serving, so
 * this never ships a torn WAL-mid-write copy of the live file.
 */
export async function GET() {
  const { response } = await requireSessionOr401();
  if (response) return response;

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "selfbank-snapshot-"));
  const file = path.join(dir, "snapshot.db");

  try {
    snapshotDatabase(file);
    const bytes = fs.readFileSync(file);
    const name = `selfbank-${new Date().toISOString().slice(0, 10)}.db`;
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": "application/vnd.sqlite3",
        "content-disposition": `attachment; filename="${name}"`,
        "content-length": String(bytes.byteLength),
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    console.error("[selfbank] sqlite snapshot failed:", error);
    return Response.json({ error: "Не вдалося створити копію БД" }, { status: 500 });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
