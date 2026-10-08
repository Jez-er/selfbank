/**
 * Central env access, kept runtime-neutral so `proxy.ts` can import it.
 * Node-only concerns (bcrypt) live in `lib/auth-server.ts`.
 *
 * Anything missing that would silently weaken security - notably AUTH_SECRET -
 * fails loudly instead of falling back to a default.
 */

const INSECURE_SECRETS = new Set([
  "",
  "changeme",
  "change-me",
  "secret",
  "replace-me",
  "please-change-me",
  "generate-me-with-openssl-rand-hex-32",
]);

export const DATABASE_PATH = process.env.DATABASE_PATH ?? "./data/selfbank.db";
export const AUTH_USERNAME = process.env.AUTH_USERNAME ?? "admin";
export const SESSION_TTL_DAYS = Number(process.env.SESSION_TTL_DAYS ?? 30);
export const SESSION_COOKIE = "selfbank_session";
export const RECURRING_CRON_ENABLED = process.env.RECURRING_CRON !== "off";

let cachedSecret: Uint8Array | null = null;

export function authSecret(): Uint8Array {
  if (cachedSecret) return cachedSecret;
  const raw = process.env.AUTH_SECRET ?? "";
  if (INSECURE_SECRETS.has(raw.trim().toLowerCase())) {
    throw new Error(
      "AUTH_SECRET is missing or uses a placeholder value. Generate one with:\n" +
        '  node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }
  if (raw.length < 32) {
    throw new Error(`AUTH_SECRET must be at least 32 characters (got ${raw.length}).`);
  }
  cachedSecret = new TextEncoder().encode(raw);
  return cachedSecret;
}
