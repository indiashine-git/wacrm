"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2,
  ShoppingBag,
  ChevronDown,
  ChevronRight,
  Send,
  CreditCard,
  Plus,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

interface CatalogProduct {
  id: string;
  retailer_id?: string;
  name: string;
  image_url?: string;
}

interface OrderItem {
  product_retailer_id: string;
  quantity: number;
  item_price: number;
  currency: string;
}

interface Order {
  id: string;
  contact_id: string | null;
  items: OrderItem[];
  total_amount: number;
  currency: string;
  customer_note: string | null;
  payment_status: "unpaid" | "link_sent" | "paid";
  payment_link: string | null;
  created_at: string;
  contact: { name: string | null; phone: string } | null;
}

const STATUS_CLASSES: Record<Order["payment_status"], string> = {
  unpaid: "border-border bg-muted text-muted-foreground",
  link_sent: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300",
  paid: "border-emerald-600/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300",
};

export default function OrdersPage() {
  const [loading, setLoading] = useState(true);
  const [orders, setOrders] = useState<Order[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [generatingFor, setGeneratingFor] = useState<string | null>(null);

  const [sendOpen, setSendOpen] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [sendBody, setSendBody] = useState("Browse our latest products 👇");
  const [sendRetailerId, setSendRetailerId] = useState("");
  const [sending, setSending] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState<CatalogProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);

  async function fetchOrders() {
    try {
      setLoading(true);
      const supabase = createClient();
      const { data, error } = await supabase
        .from("orders")
        .select("*, contact:contacts(name, phone)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      setOrders((data as Order[]) ?? []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load orders");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchOrders();
  }, []);

  async function handleGeneratePaymentLink(order: Order) {
    setGeneratingFor(order.id);
    try {
      const res = await fetch(`/api/commerce/orders/${order.id}/payment-link`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Failed (HTTP ${res.status})`);
      if (data.warning) {
        toast.warning(`Link generated but not sent: ${data.warning}`);
      } else {
        toast.success("Payment link sent");
      }
      await fetchOrders();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate payment link");
    } finally {
      setGeneratingFor(null);
    }
  }

  async function openSendCatalog() {
    setSendOpen(true);
    setLoadingProducts(true);
    try {
      const res = await fetch("/api/commerce/products");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Failed (HTTP ${res.status})`);
      const products: CatalogProduct[] = data.products ?? [];
      setCatalogProducts(products);
      setSendRetailerId(products[0]?.retailer_id ?? "");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load your products");
    } finally {
      setLoadingProducts(false);
    }
  }

  async function handleSendCatalog() {
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/catalog/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: sendTo,
          bodyText: sendBody,
          thumbnailProductRetailerId: sendRetailerId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Send failed (HTTP ${res.status})`);
      toast.success("Catalog sent");
      setSendOpen(false);
      setSendTo("");
      setSendBody("");
      setSendRetailerId("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send catalog");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Orders</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Orders customers place from your WhatsApp catalog, and payment links you send for them.
          </p>
        </div>
        <Button onClick={openSendCatalog}>
          <Plus className="h-4 w-4" />
          Send catalog
        </Button>
      </header>

      {loading ? (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
            <ShoppingBag className="h-6 w-6 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-base font-medium text-foreground">No orders yet</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Send your catalog to a contact — when they pick products and submit, the order shows up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {orders.map((order) => {
            const isOpen = expanded === order.id;
            return (
              <li key={order.id} className="rounded-xl border border-border bg-card">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : order.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {order.contact?.name || order.contact?.phone || "Unknown contact"}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {order.items.length} item{order.items.length === 1 ? "" : "s"} ·{" "}
                      {new Date(order.created_at).toLocaleString()}
                    </div>
                  </div>
                  <Badge variant="outline" className={cn("shrink-0 text-[11px]", STATUS_CLASSES[order.payment_status])}>
                    {order.payment_status.replace("_", " ")}
                  </Badge>
                  <span className="shrink-0 text-sm font-medium text-foreground">
                    {order.currency} {order.total_amount.toFixed(2)}
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-border px-4 py-3">
                    <ul className="space-y-1">
                      {order.items.map((item, i) => (
                        <li key={i} className="flex justify-between text-xs text-muted-foreground">
                          <span>
                            {item.quantity}x {item.product_retailer_id}
                          </span>
                          <span>
                            {item.currency} {(item.item_price * item.quantity).toFixed(2)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {order.customer_note && (
                      <p className="mt-2 text-xs italic text-muted-foreground">"{order.customer_note}"</p>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleGeneratePaymentLink(order)}
                        disabled={generatingFor === order.id}
                      >
                        {generatingFor === order.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CreditCard className="h-3.5 w-3.5" />
                        )}
                        {order.payment_status === "unpaid" ? "Send payment link" : "Resend payment link"}
                      </Button>
                      {order.payment_link && (
                        <span className="truncate text-xs text-muted-foreground" title={order.payment_link}>
                          {order.payment_link}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="bg-popover border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Send catalog</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Opens your connected Meta catalog inside the customer's WhatsApp — needs a catalog_id set in
              Settings → Commerce first.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Recipient phone (with country code)</Label>
              <Input
                value={sendTo}
                onChange={(e) => setSendTo(e.target.value)}
                placeholder="e.g. 919876543210"
                className="bg-muted border-border text-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Featured product</Label>
              {loadingProducts ? (
                <div className="flex h-9 items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading your products…
                </div>
              ) : catalogProducts.length === 0 ? (
                <p className="text-xs text-red-400">
                  No products yet — add one in Settings → Commerce first.
                </p>
              ) : (
                <Select value={sendRetailerId} onValueChange={(v) => v && setSendRetailerId(v)}>
                  <SelectTrigger className="w-full bg-muted border-border text-foreground">
                    <SelectValue placeholder="Pick a product to feature" />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {catalogProducts.map((p) => (
                      <SelectItem key={p.id} value={p.retailer_id ?? p.id} className="text-popover-foreground">
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <p className="text-[11px] text-muted-foreground">
                Shown as the message's thumbnail — the customer can still browse everything else in your catalog.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Message body</Label>
              <Textarea
                value={sendBody}
                onChange={(e) => setSendBody(e.target.value)}
                rows={3}
                placeholder="Browse our latest products 👇"
                className="bg-muted border-border text-foreground resize-none"
              />
            </div>
          </div>
          <DialogFooter className="bg-popover border-border">
            <Button variant="outline" onClick={() => setSendOpen(false)} className="border-border text-muted-foreground hover:bg-muted">
              Cancel
            </Button>
            <Button
              onClick={handleSendCatalog}
              disabled={sending || !sendTo.trim() || !sendBody.trim() || !sendRetailerId.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
