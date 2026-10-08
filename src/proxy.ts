/**
 * Edge gate: bounces unauthenticated browsers to /login before a page is
 * rendered. This is a convenience, not the security boundary - every server
 * action and route handler verifies the session itself via `auth-server.ts`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/env";
import { verifySession } from "@/lib/auth";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/api/health"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const session = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  // Note the asymmetry with the route handlers in app/api, which must send a
  // RELATIVE Location header: there `request.url` is the address the Node
  // server was reached on (0.0.0.0:3000 inside a container). Here it is the
  // address the browser used, because the proxy layer resolves it from the
  // request's Host header - and it also rejects a relative Location outright.
  if (session && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }
  if (isPublic || session) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Неавторизований запит" }, { status: 401 });
  }

  const loginUrl = new URL("/login", request.url);
  // Remember where the user was headed so login can send them back.
  if (pathname !== "/") loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
