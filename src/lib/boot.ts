import "server-only";
import { seedIfEmpty } from "@/db/seed";
import { postDueRules } from "@/lib/recurring-runner";
import { RECURRING_CRON_ENABLED } from "./env";

/**
 * One-time process startup: seed an empty database, catch up recurring
 * transactions missed while the container was down, and arm the hourly
 * scheduler.
 *
 * This is deliberately not `instrumentation.ts`. Next compiles that hook for
 * the edge runtime as well, and the edge bundle cannot resolve the native
 * better-sqlite3 binding - a runtime `NEXT_RUNTIME` guard does not help,
 * because the module graph is traced at build time. Running from here keeps
 * everything inside the Node runtime, in the same single process.
 *
 * Callers: the authenticated app layout (so any page view triggers it) and the
 * /api/health route (which Docker polls, so a container with no visitors still
 * boots its scheduler within one health-check interval).
 *
 * Schema migrations are NOT run here - docker/entrypoint.sh applies them
 * before the server starts, so a migration failure stops the container rather
 * than leaving a half-working app serving requests.
 */

// Survives dev-server module reloads, so the cron is armed at most once.
const globalForBoot = globalThis as unknown as { __selfbankBooted?: boolean };

export function ensureBooted(): void {
  if (globalForBoot.__selfbankBooted) return;
  globalForBoot.__selfbankBooted = true;

  try {
    const { seeded } = seedIfEmpty();
    if (seeded) console.log("[selfbank] seeded default categories and accounts");
  } catch (error) {
    console.error("[selfbank] seeding failed:", error);
  }

  if (!RECURRING_CRON_ENABLED) {
    console.log("[selfbank] recurring scheduler disabled (RECURRING_CRON=off)");
    return;
  }

  catchUp("boot");

  // An hourly tick is ample for rules with day granularity, and avoids a
  // second container just to run cron.
  void import("node-cron")
    .then((cron) => {
      cron.schedule("7 * * * *", () => catchUp("cron"));
      console.log("[selfbank] recurring scheduler armed (hourly)");
    })
    .catch((error) => console.error("[selfbank] could not arm scheduler:", error));
}

function catchUp(trigger: string): void {
  try {
    const report = postDueRules();
    if (report.transactionsCreated > 0 || report.deactivated > 0) {
      console.log(
        `[selfbank] recurring (${trigger}): +${report.transactionsCreated} operations, ` +
          `${report.rulesProcessed} rules, ${report.deactivated} deactivated`,
      );
    }
  } catch (error) {
    console.error(`[selfbank] recurring (${trigger}) failed:`, error);
  }
}
