import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "./sign-out-button";

type PageStatus = "pending" | "rejected" | "suspended" | "approved" | null;

async function getAccountStatus(): Promise<PageStatus> {
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
  if (
    account?.status === "pending" ||
    account?.status === "rejected" ||
    account?.status === "suspended" ||
    account?.status === "approved"
  ) {
    return account.status;
  }
  return null;
}

const COPY: Record<Exclude<PageStatus, "approved" | null>, { title: string; description: string; showContactLine: boolean }> = {
  pending: {
    title: "Account pending approval",
    description:
      "Your account has been created and is awaiting approval. You'll be able to sign in as soon as it's reviewed.",
    showContactLine: true,
  },
  rejected: {
    title: "Account not approved",
    description:
      "Your account was reviewed and was not approved. If you believe this is a mistake, contact the person who invited you to this workspace.",
    showContactLine: false,
  },
  suspended: {
    title: "Account suspended",
    description:
      "Your account has been suspended. Contact the person who invited you to this workspace for details.",
    showContactLine: false,
  },
};

export default async function PendingApprovalPage() {
  const status = await getAccountStatus();

  // A just-approved user who still has this page cached/bookmarked
  // (or lands here mid-refresh) should go straight to the dashboard
  // rather than see stale "awaiting approval" copy.
  if (status === "approved") {
    redirect("/dashboard");
  }

  const copy = COPY[status ?? "pending"];

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>{copy.title}</CardTitle>
          <CardDescription>{copy.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm text-muted-foreground">
          {copy.showContactLine && (
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
