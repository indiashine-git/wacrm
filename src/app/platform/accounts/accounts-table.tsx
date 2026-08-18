"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

type AccountStatus = "pending" | "approved" | "rejected" | "suspended";

interface Account {
  id: string;
  name: string;
  status: AccountStatus;
  ownerEmail: string;
  createdAt: string;
  shareMetaCredit: boolean;
}

const STATUS_LABEL: Record<AccountStatus, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  suspended: "Suspended",
};

export function AccountsTable() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/platform/accounts");
    if (!res.ok) {
      setError(
        res.status === 401
          ? "Session expired. Reload the page to sign in again."
          : `Failed to load accounts (${res.status}).`
      );
      setAccounts([]);
      setLoading(false);
      return;
    }
    const body = await res.json();
    setAccounts(body.accounts ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function act(id: string, action: "approve" | "reject" | "suspend" | "reactivate") {
    const reason = reasonById[id];
    if (action === "reject" && !reason?.trim()) {
      alert("A rejection reason is required.");
      return;
    }
    const res = await fetch(`/api/platform/approvals/${id}`, {
      method: "POST",
      body: JSON.stringify(action === "reject" ? { action, reason } : { action }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? `Failed to ${action} this account (${res.status}).`);
      return;
    }
    await load();
  }

  async function toggleCreditSharing(id: string, enabled: boolean) {
    // Optimistic update — flip locally first so the switch feels
    // instant, then reconcile against the server response.
    setAccounts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, shareMetaCredit: enabled } : a))
    );
    const res = await fetch(`/api/platform/accounts/${id}/credit-sharing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error ?? `Failed to update credit sharing (${res.status}).`);
      await load();
    }
  }

  if (loading) return <div>Loading…</div>;
  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (accounts.length === 0) return <p className="text-muted-foreground">No accounts yet.</p>;

  return (
    <div className="space-y-4">
      {accounts.map((account) => (
        <Card key={account.id}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">{account.name}</CardTitle>
              <span className="text-xs font-medium uppercase text-muted-foreground">
                {STATUS_LABEL[account.status]}
              </span>
            </div>
            <p className="text-sm text-muted-foreground">
              {account.ownerEmail} · signed up {new Date(account.createdAt).toLocaleString()}
            </p>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            {account.status === "pending" && (
              <>
                <Button onClick={() => act(account.id, "approve")}>Approve</Button>
                <Input
                  placeholder="Rejection reason"
                  value={reasonById[account.id] ?? ""}
                  onChange={(e) =>
                    setReasonById((prev) => ({ ...prev, [account.id]: e.target.value }))
                  }
                  className="max-w-xs"
                />
                <Button variant="destructive" onClick={() => act(account.id, "reject")}>
                  Reject
                </Button>
              </>
            )}
            {account.status === "approved" && (
              <Button variant="destructive" onClick={() => act(account.id, "suspend")}>
                Suspend
              </Button>
            )}
            {(account.status === "suspended" || account.status === "rejected") && (
              <Button onClick={() => act(account.id, "reactivate")}>Reactivate</Button>
            )}
          </CardContent>
          <CardContent className="flex items-center gap-2 pt-0">
            <Switch
              checked={account.shareMetaCredit}
              onCheckedChange={(checked) => toggleCreditSharing(account.id, checked)}
            />
            <span className="text-sm text-muted-foreground">
              Share platform Meta billing with this tenant (Embedded Signup onboarding)
            </span>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
