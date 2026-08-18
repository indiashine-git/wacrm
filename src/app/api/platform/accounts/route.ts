import { NextResponse } from "next/server";
import { supabasePlatformAdmin } from "@/lib/platform/admin-client";
import { requirePlatformAuth } from "@/lib/platform/require-platform-auth";

export async function GET(request: Request) {
  const authError = requirePlatformAuth(request);
  if (authError) return authError;

  const admin = supabasePlatformAdmin();

  const { data: accounts, error } = await admin
    .from("accounts")
    .select("id, name, status, created_at, owner_user_id, share_meta_credit")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[GET /api/platform/accounts] query error:", error);
    return NextResponse.json({ error: "Failed to load accounts" }, { status: 500 });
  }

  const withEmails = await Promise.all(
    (accounts ?? []).map(async (account) => {
      const { data } = await admin.auth.admin.getUserById(account.owner_user_id);
      return {
        id: account.id,
        name: account.name,
        status: account.status,
        ownerEmail: data.user?.email ?? "(unknown)",
        createdAt: account.created_at,
        shareMetaCredit: account.share_meta_credit ?? false,
      };
    })
  );

  return NextResponse.json({ accounts: withEmails });
}
