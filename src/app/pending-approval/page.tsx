import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";

async function getAccountStatus(): Promise<"pending" | "rejected" | "approved" | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("account_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!profile?.account_id) return null;

  const { data: account } = await supabase
    .from("accounts")
    .select("status")
    .eq("id", profile.account_id)
    .maybeSingle();
  if (account?.status === "pending" || account?.status === "rejected" || account?.status === "approved") {
    return account.status;
  }
  return null;
}

export default async function PendingApprovalPage() {
  const status = await getAccountStatus();
  const isRejected = status === "rejected";

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>
            {isRejected ? "Account not approved" : "Account pending approval"}
          </CardTitle>
          <CardDescription>
            {isRejected
              ? "Your account was reviewed and was not approved. If you believe this is a mistake, contact the person who invited you to this workspace."
              : "Your account has been created and is awaiting approval. You'll be able to sign in as soon as it's reviewed."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
          {!isRejected && (
            <p>
              If this is taking longer than expected, contact the person who
              invited you to this workspace.
            </p>
          )}
          <SignOutButton />
        </CardContent>
      </Card>
    </div>
  );
}
