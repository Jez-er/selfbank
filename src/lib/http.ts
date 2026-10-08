import { NextResponse } from "next/server";

/**
 * Redirect to a path on the same origin.
 *
 * `NextResponse.redirect()` needs an absolute URL, and the obvious way to get
 * one - `new URL(path, request.url)` - uses the address the *server* was
 * reached on. Inside a container that is `http://0.0.0.0:3000`, so every login
 * would bounce the browser to a host it cannot reach. The same applies behind
 * any reverse proxy.
 *
 * A relative Location header avoids the problem entirely: it is valid per
 * RFC 7231 §7.1.2 and is resolved by the browser against the URL it actually
 * requested, so the app works unchanged on localhost, in Docker and behind a
 * proxy on a custom domain.
 *
 * This is for route handlers only. `proxy.ts` must NOT use it: the proxy layer
 * parses the Location header itself and throws ERR_INVALID_URL on a relative
 * one. It does not need it either - there `request.url` already carries the
 * address the browser used.
 */
export function redirectTo(path: string, status: 303 | 307 | 308 = 303): NextResponse {
  return new NextResponse(null, { status, headers: { location: path } });
}

/** Builds a same-origin path with query parameters, for redirect targets. */
export function pathWithParams(path: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, value);
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

/**
 * Only same-origin relative paths are allowed as redirect targets, so a
 * crafted `next=` parameter cannot be used as an open redirect.
 */
export function safePath(value: string, fallback = "/"): string {
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  return value;
}
