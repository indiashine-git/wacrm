'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Timer } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const OPTIONS = [
  { value: '0', label: 'Never (default)' },
  { value: '15', label: '15 minutes' },
  { value: '30', label: '30 minutes' },
  { value: '60', label: '1 hour' },
  { value: '120', label: '2 hours' },
  { value: '480', label: '8 hours' },
];

/** Account-wide: sign everyone out automatically after this many minutes of no mouse/keyboard/touch activity. */
export function IdleTimeoutCard() {
  const { account, canEditSettings, refreshProfile } = useAuth();
  const [value, setValue] = useState('0');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (account) setValue(String(account.idle_timeout_minutes ?? 0));
  }, [account]);

  async function handleChange(next: string) {
    if (!account) return;
    setValue(next);
    setSaving(true);
    try {
      const supabase = createClient();
      const minutes = Number(next);
      const { error } = await supabase
        .from('accounts')
        .update({ idle_timeout_minutes: minutes > 0 ? minutes : null })
        .eq('id', account.id);
      if (error) throw error;
      toast.success('Auto sign-out updated');
      await refreshProfile();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update auto sign-out');
      setValue(String(account.idle_timeout_minutes ?? 0));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          <Timer className="h-4 w-4 text-muted-foreground" />
          Auto sign-out
        </CardTitle>
        <CardDescription>
          Sign everyone in this account out automatically after this much time with no activity --
          no clicks, typing, or scrolling. Applies to the whole team.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Select value={value} onValueChange={(v) => v && handleChange(v)} disabled={!canEditSettings || saving}>
          <SelectTrigger className="w-full max-w-xs bg-muted border-border text-foreground">
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <SelectValue />}
          </SelectTrigger>
          <SelectContent className="bg-popover border-border">
            {OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} className="text-popover-foreground">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardContent>
    </Card>
  );
}
