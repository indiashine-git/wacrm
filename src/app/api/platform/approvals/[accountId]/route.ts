import { NextResponse } from "next/server";
import { supabasePlatformAdmin } from "@/lib/platform/admin-client";
import { notify } from "@/lib/platform/notify";

interface Body {
  action: "approve" | "reject";
  reason?: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ accountId: string }> }
) {
  const { accountId } = await params;
  const body = (await request.json()) as Body;

  if (body.action === "reject" && !body.reason?.trim()) {
    return NextResponse.json({ error: "A rejection reason is required" }, { status: 400 });
  }

  const admin = supabasePlatformAdmin();
  const update =
    body.action === "approve"
      ? { status: "approved", approved_at: new Date().toISOString() }
      : { status: "rejected", rejected_reason: body.reason };

  const { error } = await admin.from("accounts").update(update).eq("id", accountId);
  if (error) {
    console.error("[POST /api/platform/approvals] update error:", error);
    return NextResponse.json({ error: "Failed to update account" }, { status: 500 });
  }

  if (body.action === "approve") {
    await notify("account_approved", { accountId });
  } else {
    await notify("account_rejected", { accountId, reason: body.reason! });
  }

  return NextResponse.json({ ok: true });
}
