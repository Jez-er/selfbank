import { sqlite } from "@/db";
import { ensureBooted } from "@/lib/boot";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Liveness probe for Docker's HEALTHCHECK: also confirms the database answers. */
export function GET() {
  try {
    // Docker polls this endpoint, so a container nobody has visited yet still
    // gets its scheduler armed.
    ensureBooted();
    sqlite.prepare("SELECT 1").get();
    return Response.json({ status: "ok", time: new Date().toISOString() });
  } catch (error) {
    return Response.json(
      { status: "error", error: error instanceof Error ? error.message : String(error) },
      { status: 503 },
    );
  }
}
