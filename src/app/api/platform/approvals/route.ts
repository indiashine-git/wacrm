import { NextResponse } from "next/server";
import { supabasePlatformAdmin } from "@/lib/platform/admin-client";
import { requirePlatformAuth } from "@/lib/platform/require-platform-auth";

export async function GET(request: Request) {
  const authError = requirePlatformAuth(request);
  if (authError) return authError;

  const admin = supabasePlatformAdmin();

  const { data: accounts, error } = await admin
    .from("accounts")
    .select("id, name, created_at, owner_user_id")
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[GET /api/platform/approvals] query error:", error);
    return NextResponse.json({ error: "Failed to load pending accounts" }, { status: 500 });
  }

  const withEmails = await Promise.all(
    (accounts ?? []).map(async (account) => {
      const { data } = await admin.auth.admin.getUserById(account.owner_user_id);
      return {
        id: account.id,
        name: account.name,
        ownerEmail: data.user?.email ?? "(unknown)",
        createdAt: account.created_at,
      };
    })
  );

  return NextResponse.json({ accounts: withEmails });
}
