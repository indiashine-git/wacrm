import { NextResponse } from "next/server";
import { supabasePlatformAdmin } from "@/lib/platform/admin-client";
import { notify } from "@/lib/platform/notify";
import { requirePlatformAuth } from "@/lib/platform/require-platform-auth";

type Action = "approve" | "reject" | "suspend" | "reactivate";

interface Body {
  action: Action;
  reason?: string;
}

const VALID_ACTIONS: Action[] = ["approve", "reject", "suspend", "reactivate"];

export async function POST(
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

  if (!VALID_ACTIONS.includes(body.action)) {
    return NextResponse.json(
      { error: `action must be one of: ${VALID_ACTIONS.join(", ")}` },
      { status: 400 }
    );
  }
  if (body.action === "reject" && !body.reason?.trim()) {
    return NextResponse.json({ error: "A rejection reason is required" }, { status: 400 });
  }

  const admin = supabasePlatformAdmin();

  let update: Record<string, unknown>;
  switch (body.action) {
    case "approve":
    case "reactivate":
      // Reactivate is "approve again" — same target state, whether
      // the account was previously rejected or suspended.
      update = { status: "approved", approved_at: new Date().toISOString(), rejected_reason: null };
      break;
    case "reject":
      update = { status: "rejected", rejected_reason: body.reason };
      break;
    case "suspend":
      update = { status: "suspended" };
      break;
  }

  const { error } = await admin.from("accounts").update(update).eq("id", accountId);
  if (error) {
    console.error("[POST /api/platform/approvals] update error:", error);
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }

  switch (body.action) {
    case "approve":
    case "reactivate":
      await notify("account_approved", { accountId });
      break;
    case "reject":
      await notify("account_rejected", { accountId, reason: body.reason! });
      break;
    case "suspend":
      await notify("account_suspended", { accountId });
      break;
  }

  return NextResponse.json({ ok: true });
}
