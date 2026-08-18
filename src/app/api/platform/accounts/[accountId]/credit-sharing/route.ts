import { NextResponse } from "next/server";
import { supabasePlatformAdmin } from "@/lib/platform/admin-client";
import { requirePlatformAuth } from "@/lib/platform/require-platform-auth";

interface Body {
  enabled: boolean;
}

/**
 * PATCH /api/platform/accounts/:accountId/credit-sharing
 *
 * Platform-admin-only toggle for accounts.share_meta_credit. This
 * does NOT call any Meta credit-sharing API — that requires a real
 * Solution Partner commercial agreement we don't have configured.
 * It only flips the flag Embedded Signup onboarding reads to decide
 * whether to tell the tenant billing is on the platform vs asking
 * them to add their own Meta payment method.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const authError = requirePlatformAuth(request);
  if (authError) return authError;

  const { accountId } = await params;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled must be a boolean" }, { status: 400 });
  }

  const admin = supabasePlatformAdmin();
  const { error } = await admin
    .from("accounts")
    .update({ share_meta_credit: body.enabled })
    .eq("id", accountId);

  if (error) {
    console.error("[PATCH /api/platform/accounts/:id/credit-sharing] update error:", error);
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
