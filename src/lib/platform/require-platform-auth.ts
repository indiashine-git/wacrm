import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

// Defense-in-depth check for every /api/platform/* route. The nginx
// config also gates the whole /platform/ prefix with HTTP Basic Auth
// (throwaway until sub-project 2's real superadmin system replaces
// it), but /api/platform/* is a SEPARATE prefix — nginx location
// matching does not inherit auth across prefixes — so these routes
// must not rely on the reverse proxy alone.
//
// Verifies the same `Authorization: Basic base64(user:pass)` header
// nginx's auth_basic sends through, against PLATFORM_ADMIN_USER /
// PLATFORM_ADMIN_PASSWORD, with a timing-safe comparison.
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function requirePlatformAuth(request: Request): NextResponse | null {
  const expectedUser = process.env.PLATFORM_ADMIN_USER;
  const expectedPass = process.env.PLATFORM_ADMIN_PASSWORD;
  if (!expectedUser || !expectedPass) {
    console.error("[requirePlatformAuth] PLATFORM_ADMIN_USER/PASSWORD not configured");
    return NextResponse.json({ error: "Not configured" }, { status: 500 });
  }

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="wacrm platform"' },
    });
  }

  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
  const separatorIndex = decoded.indexOf(":");
  const user = separatorIndex === -1 ? decoded : decoded.slice(0, separatorIndex);
  const pass = separatorIndex === -1 ? "" : decoded.slice(separatorIndex + 1);

  if (!safeEqual(user, expectedUser) || !safeEqual(pass, expectedPass)) {
    return new NextResponse("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="wacrm platform"' },
    });
  }

  return null;
}
