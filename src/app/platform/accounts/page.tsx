import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SESSION_COOKIE_NAME, verifySessionToken } from "@/lib/platform/admin-auth";
import { ModeToggle } from "@/components/layout/mode-toggle";
import { AccountsTable } from "./accounts-table";
import { PlatformSignOutButton } from "./sign-out-button";

export default async function PlatformAccountsPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const adminId = verifySessionToken(token);
  if (!adminId) {
    redirect("/platform/login");
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Tenant accounts</h1>
        <div className="flex items-center gap-2">
          <ModeToggle />
          <PlatformSignOutButton />
        </div>
      </div>
      <AccountsTable />
    </div>
  );
}
