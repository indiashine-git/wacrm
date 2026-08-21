'use client';

// Settings -> Integrations: WooCommerce order sync. WooCommerce sends
// order.created/order.updated webhooks straight to us (self-hosted, no
// approval process needed) -- we generate the secret, the admin pastes
// it into two webhook entries in their WP Admin. See
// src/app/api/webhooks/woocommerce/[accountId]/route.ts for the receiver.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Loader2, ShoppingCart, Trash2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/hooks/use-auth';

interface WooConfig {
  store_url: string;
  last_received_at: string | null;
  receive_count: number;
  webhook_url: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function WooCommerceSettings() {
  const { canEditSettings } = useAuth();
  const [config, setConfig] = useState<WooConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/account/woocommerce', { cache: 'no-store' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Failed to load WooCommerce settings');
        return;
      }
      const data = (await res.json()) as { config: WooConfig | null };
      setConfig(data.config);
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleRemove() {
    if (!window.confirm('Remove the WooCommerce connection? New orders will stop syncing until you set it up again.')) return;
    setRemoving(true);
    try {
      const res = await fetch('/api/account/woocommerce', { method: 'DELETE' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Failed to remove');
        return;
      }
      toast.success('Removed');
      setConfig(null);
    } catch {
      toast.error('Network error');
    } finally {
      setRemoving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="text-primary size-6 animate-spin" />
      </div>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-start justify-between gap-2">
        <div>
          <CardTitle className="text-sm">WooCommerce</CardTitle>
          <CardDescription>
            Sync orders from a self-hosted WooCommerce store as they&apos;re placed -- no app review needed,
            works with any store today.
          </CardDescription>
        </div>
        {canEditSettings && !config && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>Connect</Button>
        )}
      </CardHeader>
      <CardContent>
        {config ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background/50 p-3 text-xs">
              <ShoppingCart className="text-muted-foreground size-3.5" />
              <span className="text-foreground">{config.store_url}</span>
              <span className="text-muted-foreground">
                {config.last_received_at
                  ? `last order ${fmtDate(config.last_received_at)} (${config.receive_count} total)`
                  : 'no orders received yet'}
              </span>
            </div>
            {canEditSettings && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleRemove}
                disabled={removing}
                className="border-red-500/40 bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-300"
              >
                {removing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                Remove
              </Button>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <ShoppingCart className="text-muted-foreground size-6" />
            <p className="text-muted-foreground mt-2 text-sm">Not connected.</p>
          </div>
        )}
      </CardContent>

      <ConnectDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />
    </Card>
  );
}

function ConnectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [storeUrl, setStoreUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ url: string; secret: string } | null>(null);

  function reset() {
    setStoreUrl('');
    setSubmitting(false);
    setCreated(null);
  }

  async function handleCreate() {
    const trimmed = storeUrl.trim();
    if (!trimmed) {
      toast.error('Store URL is required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/account/woocommerce', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_url: trimmed }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error || 'Failed to connect');
        return;
      }
      setCreated({ url: payload.webhook_url, secret: payload.secret });
      onCreated();
    } catch {
      toast.error('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Copy failed');
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="border-border bg-popover sm:max-w-lg">
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-popover-foreground">Set up in WooCommerce</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                The secret is shown once. If you lose it, remove this connection and reconnect.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Delivery URL</Label>
                <div className="flex gap-2">
                  <Input readOnly value={created.url} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                  <Button type="button" variant="outline" onClick={() => copy(created.url, 'URL')}>
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Secret</Label>
                <div className="flex gap-2">
                  <Input readOnly value={created.secret} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                  <Button type="button" variant="outline" onClick={() => copy(created.secret, 'Secret')}>
                    <Copy className="size-4" />
                  </Button>
                </div>
              </div>
              <div className="rounded-md border border-border bg-background/50 p-3 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">In WP Admin: WooCommerce → Settings → Advanced → Webhooks</p>
                <p className="mt-1">Add two webhooks (same Delivery URL and Secret for both):</p>
                <ul className="mt-1 list-disc space-y-0.5 pl-4">
                  <li>Topic: <code className="text-[11px]">Order created</code></li>
                  <li>Topic: <code className="text-[11px]">Order updated</code></li>
                </ul>
                <p className="mt-1">Set Status to Active and API version to WP REST API Integration v3.</p>
              </div>
            </div>
            <DialogFooter>
              <Button
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="text-popover-foreground">Connect WooCommerce</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Enter your store&apos;s URL. You&apos;ll set up the webhook in WordPress next.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="woo-store-url" className="text-muted-foreground">Store URL</Label>
              <Input
                id="woo-store-url"
                value={storeUrl}
                placeholder="https://yourstore.com"
                onChange={(e) => setStoreUrl(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
                className="border-border text-muted-foreground hover:bg-muted"
              >
                Cancel
              </Button>
              <Button onClick={handleCreate} disabled={submitting}>
                {submitting ? <Loader2 className="size-4 animate-spin" /> : 'Connect'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
