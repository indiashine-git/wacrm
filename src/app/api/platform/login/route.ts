import { NextResponse } from "next/server";
import { supabasePlatformAdmin } from "@/lib/platform/admin-client";
import { verifyPassword, createSessionToken, SESSION_COOKIE_NAME } from "@/lib/platform/admin-auth";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

// Fixed dummy hash (password "dummy-password-never-matches", generated
// once offline) — verified against on an unknown email so this route
// spends the same scrypt-shaped time whether the email exists or not.
// Without this, an unknown email returns in ~1ms while a real one takes
// the full scrypt cost, letting an attacker enumerate valid admin
// emails purely from response latency despite the identical error
// message below.
const DUMMY_HASH =
  "2bdecee7a73ae3d2424f07142d3f567e:7e60d0f8eaaf27467e1e26b901a803bb6297ec01587053a1ea02bb9477f958fb4b4a3c75b9be229d61567597ab33f59cd9561158c2ae87ca5d115bbc8fdecebb";

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
  // "unknown email" from "wrong password," including via timing: an
  // unknown email still runs a scrypt verify (against DUMMY_HASH, see
  // above) so both paths cost the same.
  const invalid = () =>
    NextResponse.json({ error: "Invalid email or password" }, { status: 401 });

  const ok = await verifyPassword(body.password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !ok) return invalid();

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
