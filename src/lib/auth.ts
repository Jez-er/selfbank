/**
 * Session tokens. Runtime-neutral (jose works in both the Node and edge
 * runtimes) so `proxy.ts` can verify a session without pulling in bcrypt or
 * better-sqlite3.
 */

import { SignJWT, jwtVerify } from "jose";
import { AUTH_USERNAME, SESSION_TTL_DAYS, authSecret } from "./env";

export interface SessionPayload {
  sub: string;
  iat: number;
  exp: number;
}

export async function signSession(username: string): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + SESSION_TTL_DAYS * 24 * 60 * 60;
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(username)
    .setIssuedAt(issuedAt)
    .setExpirationTime(expiresAt)
    .setIssuer("selfbank")
    .setAudience("selfbank")
    .sign(authSecret());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret(), {
      issuer: "selfbank",
      audience: "selfbank",
      algorithms: ["HS256"],
    });
    // A token signed for a username that no longer matches the configured one
    // must not keep working after the operator changes AUTH_USERNAME.
    if (payload.sub !== AUTH_USERNAME) return null;
    return payload as unknown as SessionPayload;
  } catch {
    return null;
  }
}

export function sessionCookieOptions(request?: { url: string }) {
  const secure = isSecureContext(request?.url);
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure,
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  };
}

/**
 * `secure` cookies are dropped over plain HTTP, which would lock out anyone
 * self-hosting on http://localhost or a LAN address. Only set it when the
 * request actually arrived over HTTPS.
 */
function isSecureContext(url?: string): boolean {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  if (!url) return false;
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}
