'use client';

// Settings -> Integrations: inbound webhook receivers. The other
// direction from API keys -- lets an external system (Shopify,
// WooCommerce, Zapier, a script) push events INTO WATU without any
// WATU-issued credential on their end, verified by HMAC signature
// instead. See src/app/api/v1/inbound/[id]/route.ts for the receiver.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Copy, Loader2, Plus, Trash2, Webhook } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
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
import { RequireRole } from '@/components/auth/require-role';
import { useAuth } from '@/hooks/use-auth';

interface InboundWebhook {
  id: string;
  name: string;
  last_received_at: string | null;
  receive_count: number;
  created_at: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function InboundWebhooksSettings() {
  const { canEditSettings } = useAuth();
  const [hooks, setHooks] = useState<InboundWebhook[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/account/inbound-webhooks', { cache: 'no-store' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Failed to load inbound webhooks');
        return;
      }
      const data = (await res.json()) as { webhooks: InboundWebhook[] };
      setHooks(data.webhooks);
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(hook: InboundWebhook) {
    if (!window.confirm(`Delete "${hook.name}"? Anything still pointed at this URL will start failing.`)) return;
    setDeleting(hook.id);
    try {
      const res = await fetch(`/api/account/inbound-webhooks/${hook.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Failed to delete');
        return;
      }
      toast.success(`Deleted "${hook.name}"`);
      setHooks((prev) => prev.filter((h) => h.id !== hook.id));
    } catch {
      toast.error('Network error');
    } finally {
      setDeleting(null);
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
          <CardTitle className="text-sm">Inbound webhooks</CardTitle>
          <CardDescription>
            Let another system (Shopify, WooCommerce, Zapier, your own script) create or update contacts
            in WATU by sending a signed request -- no WATU login needed on their end.
          </CardDescription>
        </div>
        {canEditSettings && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            New receiver
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {hooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Webhook className="text-muted-foreground size-6" />
            <p className="text-muted-foreground mt-2 text-sm">No inbound webhooks yet.</p>
          </div>
        ) : (
          <ul className="divide-border divide-y">
            {hooks.map((h) => (
              <li key={h.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">{h.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Created {fmtDate(h.created_at)} &middot;{' '}
                    {h.last_received_at
                      ? `last received ${fmtDate(h.last_received_at)} (${h.receive_count} total)`
                      : 'never received'}
                  </p>
                </div>
                {canEditSettings && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleDelete(h)}
                    disabled={deleting === h.id}
                    className="self-start border-red-500/40 bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-300 sm:self-auto"
                  >
                    {deleting === h.id ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    Delete
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <CreateWebhookDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={load} />
    </Card>
  );
}

function CreateWebhookDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [created, setCreated] = useState<{ url: string; secret: string } | null>(null);

  function reset() {
    setName('');
    setSubmitting(false);
    setCreated(null);
  }

  async function handleCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      toast.error('Name is required');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/account/inbound-webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error || 'Failed to create');
        return;
      }
      setCreated({ url: payload.url, secret: payload.secret });
      onCreated();
    } catch {
      toast.error('Network error');
    } finally {
      setSubmitting(false);
    }
  }

  function appsScriptTemplate(url: string, secret: string): string {
    return `function syncNewRowsToWATU() {
  var WEBHOOK_URL = '${url}';
  var WEBHOOK_SECRET = '${secret}';

  // Expects a header row with (at least) a "phone" column. Optional:
  // name, email, company, source, consent (yes/no).
  var sheet = SpreadsheetApp.getActiveSheet();
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return;
  var headers = data[0].map(function (h) { return String(h).trim().toLowerCase(); });

  var props = PropertiesService.getScriptProperties();
  var lastRow = parseInt(props.getProperty('watu_last_row') || '1', 10);

  for (var i = lastRow; i < data.length; i++) {
    var row = data[i];
    var record = {};
    headers.forEach(function (h, idx) { record[h] = row[idx]; });
    if (!record.phone) continue;

    var payload = {
      event: 'contact.upsert',
      data: {
        phone: String(record.phone),
        name: record.name || undefined,
        email: record.email || undefined,
        company: record.company || undefined,
        source: record.source || 'Google Sheets',
        consent_given: String(record.consent || '').toLowerCase() === 'yes'
      }
    };
    var body = JSON.stringify(payload);
    var signatureBytes = Utilities.computeHmacSha256Signature(body, WEBHOOK_SECRET);
    var signature = signatureBytes.map(function (b) {
      return ('0' + (b & 0xFF).toString(16)).slice(-2);
    }).join('');

    UrlFetchApp.fetch(WEBHOOK_URL, {
      method: 'post',
      contentType: 'application/json',
      payload: body,
      headers: { 'X-WATU-Signature': signature }
    });
  }

  props.setProperty('watu_last_row', String(data.length));
}

// In the Apps Script editor: Triggers (clock icon) -> Add Trigger ->
// syncNewRowsToWATU -> Time-driven -> every 5-10 minutes.`;
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
              <DialogTitle className="text-popover-foreground">Save these now</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                The secret is shown once. If you lose it, delete this receiver and create a new one.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">URL</Label>
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
              <p className="text-xs text-muted-foreground">
                POST JSON to the URL with header{' '}
                <code className="text-[11px]">X-WATU-Signature: hex(HMAC-SHA256(rawBody, secret))</code>. Body:{' '}
                <code className="text-[11px]">{'{"event":"contact.upsert","data":{"phone":"..."}}'}</code>
              </p>

              <details className="rounded-md border border-border bg-background/50 p-3 text-xs">
                <summary className="cursor-pointer select-none font-medium text-foreground">
                  Syncing from a Google Sheet? Copy a ready-made script
                </summary>
                <div className="mt-2 space-y-2">
                  <p className="text-muted-foreground">
                    In your sheet: Extensions → Apps Script, paste this in, then add a time-driven trigger
                    (Triggers → Add Trigger → every 5-10 min) so new rows sync automatically. First row must
                    be headers including at least <code className="text-[11px]">phone</code>.
                  </p>
                  <pre className="max-h-48 overflow-auto rounded bg-background p-2 text-[10px] leading-snug text-foreground">
                    {appsScriptTemplate(created.url, created.secret)}
                  </pre>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => copy(appsScriptTemplate(created.url, created.secret), 'Script')}
                  >
                    <Copy className="size-3.5" />
                    Copy script
                  </Button>
                </div>
              </details>
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
              <DialogTitle className="text-popover-foreground">New inbound webhook</DialogTitle>
              <DialogDescription className="text-muted-foreground">
                Name it after whatever will call it, e.g. "Shopify" or "Zapier".
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="hook-name" className="text-muted-foreground">Name</Label>
              <Input id="hook-name" value={name} maxLength={80} placeholder="e.g. Shopify orders" onChange={(e) => setName(e.target.value)} />
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
                {submitting ? <Loader2 className="size-4 animate-spin" /> : 'Create'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
