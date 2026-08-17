"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

interface PendingAccount {
  id: string;
  name: string;
  ownerEmail: string;
  createdAt: string;
}

export default function ApprovalsPage() {
  const [accounts, setAccounts] = useState<PendingAccount[]>([]);
  const [reasonById, setReasonById] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const res = await fetch("/api/platform/approvals");
    const body = await res.json();
    setAccounts(body.accounts ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function act(id: string, action: "approve" | "reject") {
    const reason = reasonById[id];
    if (action === "reject" && !reason?.trim()) {
      alert("A rejection reason is required.");
      return;
    }
    await fetch(`/api/platform/approvals/${id}`, {
      method: "POST",
      body: JSON.stringify(action === "approve" ? { action } : { action, reason }),
    });
    await load();
  }

  if (loading) return <div className="p-8">Loading…</div>;

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <h1 className="text-xl font-semibold">Pending account approvals</h1>
      {accounts.length === 0 && (
        <p className="text-muted-foreground">No pending accounts.</p>
      )}
      {accounts.map((account) => (
        <Card key={account.id}>
          <CardHeader>
            <CardTitle className="text-base">{account.name}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {account.ownerEmail} · signed up {new Date(account.createdAt).toLocaleString()}
            </p>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
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
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
