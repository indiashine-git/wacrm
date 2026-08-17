import { NextResponse } from "next/server";
import { supabasePlatformAdmin } from "@/lib/platform/admin-client";
import { verifyPassword, createSessionToken, SESSION_COOKIE_NAME } from "@/lib/platform/admin-auth";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = request.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = checkRateLimit(`platform-login:${ip}`, RATE_LIMITS.platformLogin);
  if (!limit.success) return rateLimitResponse(limit);

  let body: { email?: string; password?: string };
  try {
    body = (await request.json()) as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (!body.email || !body.password) {
    return NextResponse.json({ error: "Email and password are required" }, { status: 400 });
  }

  const admin = supabasePlatformAdmin();
  const { data: row } = await admin
    .from("platform_admins")
    .select("id, password_hash")
    .eq("email", body.email)
    .maybeSingle();

  // Same generic message either way — don't let the wire distinguish
  // "unknown email" from "wrong password."
  const invalid = () =>
    NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  if (!row) return invalid();

  const ok = await verifyPassword(body.password, row.password_hash);
  if (!ok) return invalid();

  const token = createSessionToken(row.id);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });
  return response;
}
