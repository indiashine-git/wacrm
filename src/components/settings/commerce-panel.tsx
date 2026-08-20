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

type PaymentProvider = 'none' | 'razorpay' | 'upi';

interface CommerceConfigRow {
  catalog_id: string | null;
  payment_provider: PaymentProvider;
  razorpay_key_id: string | null;
  upi_vpa: string | null;
  upi_payee_name: string | null;
}

export function CommercePanel() {
  const { canEditSettings } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasRazorpaySecret, setHasRazorpaySecret] = useState(false);

  const [catalogId, setCatalogId] = useState('');
  const [provider, setProvider] = useState<PaymentProvider>('none');
  const [razorpayKeyId, setRazorpayKeyId] = useState('');
  const [razorpayKeySecret, setRazorpayKeySecret] = useState('');
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save commerce settings');
    } finally {
      setSaving(false);
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
              Create a product catalog in Meta Commerce Manager, connect it to this WhatsApp number, then
              paste its catalog_id here.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <Label className="text-muted-foreground">Catalog ID</Label>
            <Input
              value={catalogId}
              onChange={(e) => setCatalogId(e.target.value)}
              placeholder="e.g. 123456789012345"
              disabled={!canEditSettings}
              className="bg-muted border-border text-foreground"
            />
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

        {canEditSettings && (
          <Button onClick={handleSave} disabled={saving} className="bg-primary hover:bg-primary/90 text-primary-foreground">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
          </Button>
        )}
      </div>
    </div>
  );
}
