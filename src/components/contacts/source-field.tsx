'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { SOURCE_PRESETS } from '@/lib/contacts/source-presets';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const CREATE_NEW = '__create_new__';

/** Dropdown of common presets + this account's previously-used sources, with a "Create new" free-text fallback. */
export function SourceField({
  accountId,
  value,
  onChange,
}: {
  accountId: string | null;
  value: string;
  onChange: (value: string) => void;
}) {
  const [existingSources, setExistingSources] = useState<string[]>([]);
  const [creatingNew, setCreatingNew] = useState(false);

  useEffect(() => {
    if (!accountId) return;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('contacts')
        .select('source')
        .eq('account_id', accountId)
        .not('source', 'is', null);
      const names = new Set<string>();
      for (const row of data ?? []) {
        const s = (row as { source: string | null }).source;
        if (s?.trim()) names.add(s.trim());
      }
      setExistingSources([...names].sort());
    })();
  }, [accountId]);

  const options = useMemo(() => {
    const all = new Set<string>([...SOURCE_PRESETS, ...existingSources]);
    return [...all].sort();
  }, [existingSources]);

  useEffect(() => {
    // A value that isn't one of the known options (typed via "Create
    // new" on a previous open, or set outside this component) should
    // render as the free-text box, not silently fall back to blank.
    setCreatingNew(!!value && !options.includes(value));
  }, [value, options]);

  if (creatingNew) {
    return (
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Instagram DM"
        className="bg-muted border-border text-foreground placeholder:text-muted-foreground"
        autoFocus
      />
    );
  }

  return (
    <Select
      value={value || undefined}
      onValueChange={(v) => {
        if (v === CREATE_NEW) {
          setCreatingNew(true);
          onChange('');
          return;
        }
        onChange(v || '');
      }}
    >
      <SelectTrigger className="w-full bg-muted border-border text-foreground">
        <SelectValue placeholder="Select a source…" />
      </SelectTrigger>
      <SelectContent className="bg-popover border-border">
        {options.map((opt) => (
          <SelectItem key={opt} value={opt} className="text-popover-foreground">
            {opt}
          </SelectItem>
        ))}
        <SelectItem value={CREATE_NEW} className="text-primary font-medium">
          + Create new…
        </SelectItem>
      </SelectContent>
    </Select>
  );
}
