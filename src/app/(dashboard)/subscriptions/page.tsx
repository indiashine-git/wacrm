"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { CURRENCIES } from "@/lib/currency";
import type { Contact, Subscription, SubscriptionStatus } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Loader2,
  Repeat,
  Plus,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";

const CANCEL_REASONS = [
  "Too expensive",
  "Switched to a competitor",
  "No longer needed",
  "Not satisfied with service",
  "Business closed",
  "Other",
];

const STATUS_CLASSES: Record<SubscriptionStatus, string> = {
  active: "border-emerald-600/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
  cancelled: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300",
  expired: "border-border bg-muted text-muted-foreground",
};

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export default function SubscriptionsPage() {
  const supabase = createClient();
  const { accountId, defaultCurrency } = useAuth();

  const [loading, setLoading] = useState(true);
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [contactId, setContactId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState(defaultCurrency);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [renewalDate, setRenewalDate] = useState("");

  const [cancelling, setCancelling] = useState<Subscription | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelReasonOther, setCancelReasonOther] = useState("");
  const [cancelSaving, setCancelSaving] = useState(false);

  async function load() {
    setLoading(true);
    const [subsRes, contactsRes] = await Promise.all([
      supabase
        .from("subscriptions")
        .select("*, contact:contacts(name, phone)")
        .order("renewal_date", { ascending: true }),
      supabase.from("contacts").select("*").order("name"),
    ]);
    if (subsRes.error) toast.error("Failed to load subscriptions");
    else setSubs((subsRes.data as Subscription[]) ?? []);
    setContacts((contactsRes.data as Contact[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resetForm() {
    setName("");
    setContactId("");
    setAmount("");
    setCurrency(defaultCurrency);
    setStartDate(new Date().toISOString().slice(0, 10));
    setRenewalDate("");
  }

  async function handleCreate() {
    if (!accountId || !name.trim() || !contactId || !renewalDate) {
      toast.error("Name, contact, and renewal date are required");
      return;
    }
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase.from("subscriptions").insert({
        account_id: accountId,
        created_by: user.id,
        contact_id: contactId,
        name: name.trim(),
        amount: parseFloat(amount || "0"),
        currency,
        start_date: startDate,
        renewal_date: renewalDate,
      });
      if (error) throw error;
      toast.success("Subscription added");
      setFormOpen(false);
      resetForm();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save subscription");
    } finally {
      setSaving(false);
    }
  }

  async function confirmCancel() {
    if (!cancelling) return;
    const reason = cancelReason === "Other" ? cancelReasonOther.trim() : cancelReason;
    if (!reason) return;
    setCancelSaving(true);
    try {
      const { error } = await supabase
        .from("subscriptions")
        .update({ status: "cancelled", cancellation_reason: reason })
        .eq("id", cancelling.id);
      if (error) throw error;
      toast.success("Subscription cancelled");
      setCancelling(null);
      setCancelReason("");
      setCancelReasonOther("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to cancel");
    } finally {
      setCancelSaving(false);
    }
  }

  async function handleReactivate(sub: Subscription) {
    const { error } = await supabase
      .from("subscriptions")
      .update({ status: "active", cancellation_reason: null })
      .eq("id", sub.id);
    if (error) {
      toast.error("Failed to reactivate");
      return;
    }
    toast.success("Subscription reactivated");
    await load();
  }

  const upcomingCount = useMemo(
    () => subs.filter((s) => s.status === "active" && daysUntil(s.renewal_date) <= 7 && daysUntil(s.renewal_date) >= 0).length,
    [subs],
  );

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Subscriptions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Recurring services, plans, and AMC/warranty commitments -- anything with a renewal date.
          </p>
        </div>
        <Button onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" />
          New subscription
        </Button>
      </header>

      {upcomingCount > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-600 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {upcomingCount} renewal{upcomingCount === 1 ? "" : "s"} due within 7 days.
        </div>
      )}

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : subs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <Repeat className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-base font-medium text-foreground">No subscriptions yet</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Track a recurring plan, service, or AMC/warranty commitment for a contact.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {subs.map((sub) => {
            const isOpen = expanded === sub.id;
            const days = daysUntil(sub.renewal_date);
            const dueSoon = sub.status === "active" && days <= 7 && days >= 0;
            return (
              <li key={sub.id} className="rounded-xl border border-border bg-card">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : sub.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  {isOpen ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{sub.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {sub.contact?.name || sub.contact?.phone || "Unknown contact"}
                      {sub.status === "active" && (
                        <>
                          {" · "}
                          <span className={dueSoon ? "text-amber-600 dark:text-amber-300 font-medium" : ""}>
                            {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? "renews today" : `renews in ${days}d`}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <Badge variant="outline" className={cn("shrink-0 text-[11px]", STATUS_CLASSES[sub.status])}>
                    {sub.status}
                  </Badge>
                  <span className="shrink-0 text-sm font-medium text-foreground">
                    {sub.currency} {sub.amount.toFixed(2)}
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-border px-4 py-3 space-y-2">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Started</span>
                      <span className="text-foreground">{sub.start_date}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Renewal date</span>
                      <span className="text-foreground">{sub.renewal_date}</span>
                    </div>
                    {sub.cancellation_reason && (
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Cancelled -- reason</span>
                        <span className="text-foreground">{sub.cancellation_reason}</span>
                      </div>
                    )}
                    <div className="mt-3 flex gap-2">
                      {sub.status === "active" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setCancelling(sub)}
                          className="border-red-500/40 text-red-600 hover:bg-red-500/10 dark:text-red-300"
                        >
                          Cancel subscription
                        </Button>
                      ) : sub.status === "cancelled" ? (
                        <Button size="sm" variant="outline" onClick={() => handleReactivate(sub)}>
                          Reactivate
                        </Button>
                      ) : null}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={formOpen} onOpenChange={setFormOpen}>
        <DialogContent className="bg-popover border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">New subscription</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              A recurring plan, service, or AMC/warranty commitment for a contact.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. WATU Pro Plan, AC Unit AMC" className="bg-muted border-border text-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Contact</Label>
              <Select value={contactId} onValueChange={(v) => v && setContactId(v)}>
                <SelectTrigger className="w-full bg-muted border-border text-foreground">
                  <SelectValue placeholder="Select a contact…" />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border max-h-64">
                  {contacts.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-popover-foreground">
                      {c.name || c.phone}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Amount</Label>
                <Input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" inputMode="decimal" className="bg-muted border-border text-foreground" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Currency</Label>
                <Select value={currency} onValueChange={(v) => v && setCurrency(v)}>
                  <SelectTrigger className="w-full bg-muted border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border max-h-64">
                    {CURRENCIES.map((c) => (
                      <SelectItem key={c.code} value={c.code} className="text-popover-foreground">
                        {c.code} -- {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Start date</Label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="bg-muted border-border text-foreground" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Renewal date</Label>
                <Input type="date" value={renewalDate} onChange={(e) => setRenewalDate(e.target.value)} className="bg-muted border-border text-foreground" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} className="border-border text-muted-foreground hover:bg-muted">
              Cancel
            </Button>
            <Button onClick={handleCreate} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add subscription"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!cancelling} onOpenChange={(open) => !open && setCancelling(null)}>
        <DialogContent className="bg-popover border-border sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Why is this being cancelled?</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Helps you see patterns in why customers leave.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={cancelReason} onValueChange={(v) => v && setCancelReason(v)}>
              <SelectTrigger className="w-full bg-muted border-border text-foreground">
                <SelectValue placeholder="Select a reason…" />
              </SelectTrigger>
              <SelectContent className="bg-popover border-border">
                {CANCEL_REASONS.map((r) => (
                  <SelectItem key={r} value={r} className="text-popover-foreground">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {cancelReason === "Other" && (
              <Input value={cancelReasonOther} onChange={(e) => setCancelReasonOther(e.target.value)} placeholder="Describe the reason…" className="bg-muted border-border text-foreground" />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelling(null)} className="border-border text-muted-foreground hover:bg-muted">
              Back
            </Button>
            <Button
              onClick={confirmCancel}
              disabled={cancelSaving || !cancelReason || (cancelReason === "Other" && !cancelReasonOther.trim())}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {cancelSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm cancel"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
