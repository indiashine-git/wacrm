'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SettingsPanelHead } from './settings-panel-head';
import { CommerceProducts } from './commerce-products';

type PaymentProvider = 'none' | 'razorpay' | 'upi';

interface CommerceConfigRow {
  catalog_id: string | null;
  payment_provider: PaymentProvider;
  razorpay_key_id: string | null;
  upi_vpa: string | null;
  upi_payee_name: string | null;
}

export function CommercePanel() {
  const { canEditSettings, accountId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasRazorpaySecret, setHasRazorpaySecret] = useState(false);
  const [hasRazorpayWebhookSecret, setHasRazorpayWebhookSecret] = useState(false);

  const [catalogId, setCatalogId] = useState('');
  const [creatingCatalog, setCreatingCatalog] = useState(false);
  const [provider, setProvider] = useState<PaymentProvider>('none');
  const [razorpayKeyId, setRazorpayKeyId] = useState('');
  const [razorpayKeySecret, setRazorpayKeySecret] = useState('');
  const [razorpayWebhookSecret, setRazorpayWebhookSecret] = useState('');
  const [upiVpa, setUpiVpa] = useState('');
  const [upiPayeeName, setUpiPayeeName] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/commerce/config');
        const data = await res.json();
        const config: CommerceConfigRow | null = data?.config ?? null;
        if (config) {
          setCatalogId(config.catalog_id ?? '');
          setProvider(config.payment_provider ?? 'none');
          setRazorpayKeyId(config.razorpay_key_id ?? '');
          setUpiVpa(config.upi_vpa ?? '');
          setUpiPayeeName(config.upi_payee_name ?? '');
        }
        setHasRazorpaySecret(!!data?.hasRazorpaySecret);
        setHasRazorpayWebhookSecret(!!data?.hasRazorpayWebhookSecret);
      } catch {
        toast.error('Failed to load commerce settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch('/api/commerce/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          catalog_id: catalogId,
          payment_provider: provider,
          razorpay_key_id: razorpayKeyId,
          razorpay_key_secret: razorpayKeySecret,
          razorpay_webhook_secret: razorpayWebhookSecret,
          upi_vpa: upiVpa,
          upi_payee_name: upiPayeeName,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to save');
      toast.success('Commerce settings saved');
      if (razorpayKeySecret.trim()) {
        setHasRazorpaySecret(true);
        setRazorpayKeySecret('');
      }
      if (razorpayWebhookSecret.trim()) {
        setHasRazorpayWebhookSecret(true);
        setRazorpayWebhookSecret('');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save commerce settings');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateCatalog() {
    setCreatingCatalog(true);
    try {
      const res = await fetch('/api/commerce/catalog/create', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create catalog');
      setCatalogId(data.catalogId);
      toast.success('Catalog created and connected');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create catalog', { duration: 8000 });
    } finally {
      setCreatingCatalog(false);
    }
  }

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div>
      <SettingsPanelHead
        title="Commerce"
        description="Send your Meta product catalog in-chat and collect payment for the orders that come back."
      />

      <div className="space-y-4">
        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm">Catalog</CardTitle>
            <CardDescription>
              A catalog is the list of products WhatsApp shows your customers.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {canEditSettings && (
              <Button
                type="button"
                onClick={handleCreateCatalog}
                disabled={creatingCatalog}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {creatingCatalog ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {catalogId.trim() ? 'Create a new catalog' : 'Create my catalog'}
              </Button>
            )}
            {catalogId.trim() && (
              <p className="text-[11px] text-muted-foreground">
                You already have a catalog connected below. Only create a new one if you want to replace it.
              </p>
            )}
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Catalog ID</Label>
              <Input
                value={catalogId}
                onChange={(e) => setCatalogId(e.target.value)}
                placeholder="Created automatically, or paste one from Meta Commerce Manager"
                disabled={!canEditSettings}
                className="bg-muted border-border text-foreground"
              />
            </div>
            {catalogId.trim() && (
              <p className="text-[11px] text-muted-foreground">
                Once you add products below, they can take a few minutes to show up when you send the
                catalog on WhatsApp -- that delay is on Meta&apos;s side, not WATU.
              </p>
            )}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none hover:text-foreground">
                Prefer to do it manually, or the button above didn&apos;t work?
              </summary>
              <ol className="mt-2 list-decimal space-y-1 pl-4">
                <li>
                  Open{' '}
                  <a
                    href="https://business.facebook.com/commerce/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    Meta Commerce Manager
                  </a>{' '}
                  and create a catalog (or pick an existing one).
                </li>
                <li>In that catalog&apos;s settings, connect it to this WhatsApp number.</li>
                <li>
                  Back in Commerce Manager, open <span className="text-foreground">Catalog settings</span>{' '}
                  -- the number under the catalog name is its ID. Copy it and paste it above.
                </li>
              </ol>
            </details>
          </CardContent>
        </Card>

        <Card className="border-border bg-card">
          <CardHeader>
            <CardTitle className="text-sm">Payment method</CardTitle>
            <CardDescription>
              Used to generate a payment link when you turn an order into a payment request.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Provider</Label>
              <Select value={provider} onValueChange={(v) => v && setProvider(v as PaymentProvider)}>
                <SelectTrigger className="w-full bg-muted border-border text-foreground" disabled={!canEditSettings}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border-border">
                  <SelectItem value="none" className="text-popover-foreground">None</SelectItem>
                  <SelectItem value="razorpay" className="text-popover-foreground">Razorpay payment link</SelectItem>
                  <SelectItem value="upi" className="text-popover-foreground">UPI deep link</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {provider === 'razorpay' && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground">Key ID</Label>
                  <Input
                    value={razorpayKeyId}
                    onChange={(e) => setRazorpayKeyId(e.target.value)}
                    placeholder="rzp_live_..."
                    disabled={!canEditSettings}
                    className="bg-background border-border text-foreground"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground">
                    Key secret {hasRazorpaySecret && <span className="text-primary">(saved)</span>}
                  </Label>
                  <Input
                    type="password"
                    value={razorpayKeySecret}
                    onChange={(e) => setRazorpayKeySecret(e.target.value)}
                    placeholder={hasRazorpaySecret ? '••••••••••••••••' : 'Enter secret'}
                    disabled={!canEditSettings}
                    className="bg-background border-border text-foreground"
                  />
                </div>
                <div className="space-y-1.5 border-t border-border pt-3">
                  <Label className="text-muted-foreground">
                    Webhook secret {hasRazorpayWebhookSecret && <span className="text-primary">(saved)</span>}
                  </Label>
                  <Input
                    type="password"
                    value={razorpayWebhookSecret}
                    onChange={(e) => setRazorpayWebhookSecret(e.target.value)}
                    placeholder={hasRazorpayWebhookSecret ? '••••••••••••••••' : 'Enter secret'}
                    disabled={!canEditSettings}
                    className="bg-background border-border text-foreground"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    From Razorpay Dashboard → Settings → Webhooks. Auto-marks an order paid the moment
                    Razorpay confirms it, instead of waiting for someone to tap &quot;Mark as paid&quot;.
                    Point Razorpay&apos;s webhook at:
                  </p>
                  {accountId && (
                    <code className="block break-all rounded bg-background px-2 py-1.5 text-[11px] text-foreground">
                      {`${typeof window !== 'undefined' ? window.location.origin : ''}/api/webhooks/razorpay/${accountId}`}
                    </code>
                  )}
                  <p className="text-[11px] text-muted-foreground">Subscribe it to the <code>payment_link.paid</code> event.</p>
                </div>
              </div>
            )}

            {provider === 'upi' && (
              <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3">
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground">UPI ID (VPA)</Label>
                  <Input
                    value={upiVpa}
                    onChange={(e) => setUpiVpa(e.target.value)}
                    placeholder="yourbusiness@upi"
                    disabled={!canEditSettings}
                    className="bg-background border-border text-foreground"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-muted-foreground">Payee name shown to customer</Label>
                  <Input
                    value={upiPayeeName}
                    onChange={(e) => setUpiPayeeName(e.target.value)}
                    placeholder="Your Business Name"
                    disabled={!canEditSettings}
                    className="bg-background border-border text-foreground"
                  />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {catalogId.trim() && <CommerceProducts catalogId={catalogId.trim()} />}

        {canEditSettings && (
          <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </Button>
        )}
      </div>
    </div>
  );
}
