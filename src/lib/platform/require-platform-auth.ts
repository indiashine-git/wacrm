import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME, verifySessionToken } from "./admin-auth";

// Defense-in-depth check for every /api/platform/* route. The nginx
// config also gates the whole /platform/ prefix with HTTP Basic Auth
// (an outer layer, unrelated credentials), but /api/platform/* is a
// SEPARATE prefix — nginx location matching does not inherit auth
// across prefixes — so these routes must not rely on the reverse
// proxy alone.
//
// Verifies the signed session cookie set by POST /api/platform/login
// against a real platform_admins row (migration 043). Superseded the
// original throwaway PLATFORM_ADMIN_USER/PASSWORD shared-credential
// check.
function getSessionCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE_NAME) return rest.join("=");
  }
  return null;
}

export function requirePlatformAuth(request: Request): NextResponse | null {
  const token = getSessionCookie(request);
  const adminId = verifySessionToken(token);
  if (!adminId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return null;
}
