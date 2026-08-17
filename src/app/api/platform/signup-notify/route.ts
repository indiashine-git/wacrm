// Fire-and-forget notification that a new account needs approval.
// Called by the client immediately after a successful
// supabase.auth.signUp(). Deliberately NOT session-based: wacrm's
// live config requires email confirmation before a session exists
// (ENABLE_EMAIL_AUTOCONFIRM=false), so there is no cookie session to
// read at this point — signUp() still returns `data.user.id` for the
// newly-created (unconfirmed) auth user, and the handle_new_user
// trigger has already created the profile + pending account
// synchronously as part of the signUp() call. This route resolves
// that account via the service-role client instead.
import { NextResponse } from "next/server";
import { supabasePlatformAdmin } from "@/lib/platform/admin-client";
import { notify } from "@/lib/platform/notify";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = request.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return "unknown";
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const limit = checkRateLimit(`signup-notify:${ip}`, RATE_LIMITS.signupNotify);
  if (!limit.success) return rateLimitResponse(limit);

  const body = (await request.json()) as { userId?: string };
  if (!body.userId || !UUID_RE.test(body.userId)) {
    return NextResponse.json({ error: "Invalid userId" }, { status: 400 });
  }

  const admin = supabasePlatformAdmin();
  const { data: profile } = await admin
    .from("profiles")
    .select("account_id")
    .eq("user_id", body.userId)
    .maybeSingle();

  if (profile?.account_id) {
    await notify("signup_pending", { accountId: profile.account_id });
  }

  return NextResponse.json({ ok: true });
}
