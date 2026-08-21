'use client';

// Settings -> Integrations: Google Sheets connector (Part 2 -- full
// service-account read/write). Lets automations write rows into a real
// Google Sheet via the "Add Sheet Row" step, and (future) a poll cron
// read rows back in. Distinct from the Apps-Script inbound-webhook
// direction in inbound-webhooks-settings.tsx -- this needs a real
// Google Cloud service account.

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, Sheet, Trash2, XCircle } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/hooks/use-auth';

interface SheetsConfig {
  spreadsheet_id: string;
  sheet_name: string;
  poll_enabled: boolean;
  last_synced_row: number;
  last_tested_at: string | null;
  last_test_error: string | null;
  created_at: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function GoogleSheetsSettings() {
  const { canEditSettings } = useAuth();
  const [config, setConfig] = useState<SheetsConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [removing, setRemoving] = useState(false);

  const [serviceAccountJson, setServiceAccountJson] = useState('');
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [sheetName, setSheetName] = useState('Sheet1');
  const [pollEnabled, setPollEnabled] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/account/google-sheets', { cache: 'no-store' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Failed to load Google Sheets settings');
        return;
      }
      const data = (await res.json()) as { config: SheetsConfig | null };
      setConfig(data.config);
      if (data.config) {
        setSpreadsheetId(data.config.spreadsheet_id);
        setSheetName(data.config.sheet_name);
        setPollEnabled(data.config.poll_enabled);
      }
    } catch {
      toast.error('Network error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleSave() {
    if (!spreadsheetId.trim()) {
      toast.error('Spreadsheet ID is required');
      return;
    }
    if (!config && !serviceAccountJson.trim()) {
      toast.error('Paste your service account JSON key first');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/account/google-sheets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_account_json: serviceAccountJson.trim() || undefined,
          spreadsheet_id: spreadsheetId.trim(),
          sheet_name: sheetName.trim() || 'Sheet1',
          poll_enabled: pollEnabled,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error || 'Failed to save');
        return;
      }
      toast.success('Google Sheets settings saved');
      setServiceAccountJson('');
      await load();
    } catch {
      toast.error('Network error');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    try {
      const res = await fetch('/api/account/google-sheets/test', { method: 'POST' });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error || 'Connection failed');
      } else {
        toast.success(`Connected -- ${payload.rowCount} row(s), header: ${(payload.headerRow || []).join(', ') || '(empty)'}`);
      }
      await load();
    } catch {
      toast.error('Network error');
    } finally {
      setTesting(false);
    }
  }

  async function handleRemove() {
    if (!window.confirm('Remove this Google Sheets connection? Automations using "Add Sheet Row" will start failing.')) return;
    setRemoving(true);
    try {
      const res = await fetch('/api/account/google-sheets', { method: 'DELETE' });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        toast.error(payload.error || 'Failed to remove');
        return;
      }
      toast.success('Removed');
      setConfig(null);
      setServiceAccountJson('');
      setSpreadsheetId('');
      setSheetName('Sheet1');
      setPollEnabled(false);
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
      <CardHeader>
        <CardTitle className="text-sm">Google Sheets</CardTitle>
        <CardDescription>
          Connect a Google Cloud service account so automations can write rows into a real spreadsheet
          via the &quot;Add Sheet Row&quot; step. Free for normal use (Google&apos;s limit: 300 requests/min
          per project, 60/min per user).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {config && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-background/50 p-3 text-xs">
            {config.last_test_error ? (
              <Badge variant="outline" className="gap-1 border-red-500/40 bg-red-500/10 text-red-600 dark:text-red-300">
                <XCircle className="size-3" /> Last test failed
              </Badge>
            ) : config.last_tested_at ? (
              <Badge variant="outline" className="gap-1 border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300">
                <CheckCircle2 className="size-3" /> Connected
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">Not tested yet</Badge>
            )}
            <span className="text-muted-foreground">
              {config.last_tested_at ? `Last checked ${fmtDate(config.last_tested_at)}` : 'Set up but never tested'}
            </span>
            {config.last_test_error && (
              <span className="w-full text-red-600 dark:text-red-300">{config.last_test_error}</span>
            )}
          </div>
        )}

        {canEditSettings ? (
          <>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">
                Service account key (JSON) {config && <span className="text-xs">-- leave blank to keep the current one</span>}
              </Label>
              <Textarea
                value={serviceAccountJson}
                onChange={(e) => setServiceAccountJson(e.target.value)}
                placeholder='{"type": "service_account", "client_email": "...", "private_key": "...", ...}'
                className="min-h-24 font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                Google Cloud Console → IAM & Admin → Service Accounts → Keys → Add key (JSON). Share your
                spreadsheet with the service account&apos;s email as an Editor.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="sheets-id" className="text-muted-foreground">Spreadsheet ID</Label>
                <Input
                  id="sheets-id"
                  value={spreadsheetId}
                  onChange={(e) => setSpreadsheetId(e.target.value)}
                  placeholder="from the sheet URL: /d/<this part>/edit"
                  className="font-mono text-xs"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sheets-tab" className="text-muted-foreground">Sheet / tab name</Label>
                <Input
                  id="sheets-tab"
                  value={sheetName}
                  onChange={(e) => setSheetName(e.target.value)}
                  placeholder="Sheet1"
                />
              </div>
            </div>

            <div className="flex items-center justify-between rounded-md border border-border bg-background/50 p-3">
              <div>
                <p className="text-sm text-foreground">Poll for new rows</p>
                <p className="text-xs text-muted-foreground">Reserved for the upcoming Sheet → WATU sync (not built yet).</p>
              </div>
              <Switch checked={pollEnabled} onCheckedChange={setPollEnabled} disabled />
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="size-4 animate-spin" /> : 'Save'}
              </Button>
              {config && (
                <>
                  <Button variant="outline" onClick={handleTest} disabled={testing}>
                    {testing ? <Loader2 className="size-4 animate-spin" /> : <Sheet className="size-3.5" />}
                    Test connection
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleRemove}
                    disabled={removing}
                    className="border-red-500/40 bg-red-500/10 text-red-600 hover:bg-red-500/20 dark:text-red-300"
                  >
                    {removing ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    Remove
                  </Button>
                </>
              )}
            </div>
          </>
        ) : (
          !config && <p className="text-muted-foreground text-sm">Not configured.</p>
        )}
      </CardContent>
    </Card>
  );
}
