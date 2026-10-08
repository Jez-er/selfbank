import type { NextRequest } from "next/server";
import { signSession } from "@/lib/auth";
import {
  clearAttempts,
  recordFailedAttempt,
  throttleStatus,
  verifyCredentials,
} from "@/lib/auth-server";
import { SESSION_COOKIE, SESSION_TTL_DAYS } from "@/lib/env";
import { pathWithParams, redirectTo, safePath } from "@/lib/http";

export const runtime = "nodejs";

/**
 * Form-post login, so it works with JavaScript disabled. Failures redirect
 * back to /login with an error code rather than rendering a separate page.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const username = String(form.get("username") ?? "");
  const password = String(form.get("password") ?? "");
  const next = safePath(String(form.get("next") ?? "/"));
  const ip = clientIp(request);

  const throttle = throttleStatus(ip);
  if (throttle.blocked) return fail("throttled", next);

  let ok = false;
  try {
    ok = verifyCredentials(username, password);
  } catch (error) {
    // Missing AUTH_PASSWORD_HASH / AUTH_SECRET: a configuration problem, not
    // a wrong password, so say so instead of looping on "invalid".
    console.error("[selfbank] login misconfigured:", error);
    return fail("config", next);
  }

  if (!ok) {
    recordFailedAttempt(ip);
    return fail("invalid", next);
  }

  clearAttempts(ip);
  const token = await signSession(username);
  const response = redirectTo(next);
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isHttps(request),
    path: "/",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
  return response;
}

function fail(code: string, next: string) {
  return redirectTo(pathWithParams("/login", { error: code, next: next === "/" ? undefined : next }));
}


function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "local";
}

function isHttps(request: NextRequest): boolean {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  if (request.headers.get("x-forwarded-proto") === "https") return true;
  return new URL(request.url).protocol === "https:";
}
