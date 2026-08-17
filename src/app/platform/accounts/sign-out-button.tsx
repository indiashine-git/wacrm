"use client";

import { useRouter } from "next/navigation";

export function PlatformSignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    await fetch("/api/platform/logout", { method: "POST" });
    router.push("/platform/login");
  }

  return (
    <button type="button" onClick={handleSignOut} className="text-sm text-muted-foreground underline">
      Sign out
    </button>
  );
}
