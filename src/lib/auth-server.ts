/**
 * Node-only half of authentication: password verification, cookie plumbing
 * and the per-IP login throttle.
 */

import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { AUTH_USERNAME, SESSION_COOKIE } from "./env";
import { signSession, verifySession } from "./auth";

/** A bcrypt hash: $2a/$2b/$2y, a two-digit cost, then 53 chars of salt+digest. */
const BCRYPT_SHAPE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

/**
 * Reads AUTH_PASSWORD_HASH, tolerating the two ways a bcrypt hash gets
 * mangled in transit.
 *
 * `.env` files are expanded by dotenv, which treats `$2b$12$...` as variable
 * references and silently replaces them with empty strings - the symptom is a
 * correct password being rejected. Escaping them as `\$2b\$12\$...` is the
 * documented fix, so an escaped hash is un-escaped here; that also keeps the
 * same value working when it is passed straight through `docker run -e`.
 *
 * Anything that still is not a bcrypt hash raises a configuration error
 * instead of failing every login with "wrong password".
 */
function configuredHash(): string {
  const raw = process.env.AUTH_PASSWORD_HASH;
  if (raw && raw.length > 0) {
    const hash = raw.trim().replace(/\\\$/g, "$");
    if (!BCRYPT_SHAPE.test(hash)) {
      throw new Error(
        "AUTH_PASSWORD_HASH не схожий на bcrypt-хеш. Якщо він у .env, екрануйте знаки $ " +
          'як \\$ (наприклад AUTH_PASSWORD_HASH="\\$2b\\$12\\$...") - інакше dotenv ' +
          "підставляє замість них порожні значення. Згенерувати заново: npm run hash-password.",
      );
    }
    return hash;
  }

  const plain = process.env.AUTH_PASSWORD;
  if (!plain) {
    throw new Error(
      "Не задано пароль. Встановіть AUTH_PASSWORD_HASH (див. `npm run hash-password`) або AUTH_PASSWORD.",
    );
  }
  return cachedPlainHash(plain);
}

let plainCache: { plain: string; hash: string } | null = null;
let warned = false;

function cachedPlainHash(plain: string): string {
  if (plainCache?.plain === plain) return plainCache.hash;
  if (!warned) {
    warned = true;
    console.warn(
      "[selfbank] AUTH_PASSWORD is set in plaintext. Prefer AUTH_PASSWORD_HASH (npm run hash-password).",
    );
  }
  const hash = bcrypt.hashSync(plain, 12);
  plainCache = { plain, hash };
  return hash;
}

/**
 * Compares both the username and the password. The password is always hashed
 * even when the username is wrong, so a wrong username and a wrong password
 * take the same amount of time.
 */
export function verifyCredentials(username: string, password: string): boolean {
  const hash = configuredHash();
  const passwordOk = bcrypt.compareSync(password, hash);
  const usernameOk = timingSafeEqual(username, AUTH_USERNAME);
  return passwordOk && usernameOk;
}

function timingSafeEqual(a: string, b: string): boolean {
  const length = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < length; i += 1) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Login throttle. In-memory is the right scope here: a single-user,
// single-process self-hosted app with no shared cache to coordinate with.
// ---------------------------------------------------------------------------

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 60_000;
const attempts = new Map<string, { count: number; firstAt: number }>();

export function throttleStatus(ip: string): { blocked: boolean; retryAfterMs: number } {
  const entry = attempts.get(ip);
  if (!entry) return { blocked: false, retryAfterMs: 0 };

  const elapsed = Date.now() - entry.firstAt;
  if (elapsed > LOCKOUT_MS) {
    attempts.delete(ip);
    return { blocked: false, retryAfterMs: 0 };
  }
  if (entry.count >= MAX_ATTEMPTS) {
    return { blocked: true, retryAfterMs: LOCKOUT_MS - elapsed };
  }
  return { blocked: false, retryAfterMs: 0 };
}

export function recordFailedAttempt(ip: string): void {
  const entry = attempts.get(ip);
  if (!entry || Date.now() - entry.firstAt > LOCKOUT_MS) {
    attempts.set(ip, { count: 1, firstAt: Date.now() });
    return;
  }
  entry.count += 1;
}

export function clearAttempts(ip: string): void {
  attempts.delete(ip);
}

// ---------------------------------------------------------------------------
// Cookie helpers
// ---------------------------------------------------------------------------

export async function startSession(username: string, secure: boolean): Promise<void> {
  const token = await signSession(username);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: Number(process.env.SESSION_TTL_DAYS ?? 30) * 24 * 60 * 60,
  });
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function currentSession() {
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
}

/**
 * Guard for server components, server actions and route handlers.
 *
 * `proxy.ts` already redirects unauthenticated browsers, but this is the check
 * that actually protects data: proxy rules are easy to get subtly wrong, and
 * every mutation should verify the session itself.
 */
export async function requireSession() {
  const session = await currentSession();
  if (!session) redirect("/login");
  return session;
}

/** Same guard for route handlers, which should answer 401 rather than redirect. */
export async function requireSessionOr401() {
  const session = await currentSession();
  if (!session) {
    return {
      session: null,
      response: new Response(JSON.stringify({ error: "Неавторизований запит" }), {
        status: 401,
        headers: { "content-type": "application/json; charset=utf-8" },
      }),
    };
  }
  return { session, response: null };
}
