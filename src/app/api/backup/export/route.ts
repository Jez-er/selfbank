import { requireSessionOr401 } from "@/lib/auth-server";
import { backupFilename, exportBackup } from "@/lib/backup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Full JSON dump of every table, downloaded as a file. */
export async function GET() {
  const { response } = await requireSessionOr401();
  if (response) return response;

  const backup = exportBackup();
  // Pretty-printed: a backup is something you may want to read or diff.
  const body = JSON.stringify(backup, null, 2);

  return new Response(body, {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${backupFilename()}"`,
      "cache-control": "no-store",
    },
  });
}
