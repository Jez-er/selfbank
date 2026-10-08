import { SESSION_COOKIE } from "@/lib/env";
import { redirectTo } from "@/lib/http";

export const runtime = "nodejs";

export async function POST() {
  const response = redirectTo("/login");
  response.cookies.delete(SESSION_COOKIE);
  return response;
}
