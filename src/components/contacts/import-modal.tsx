'use client';

import { useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import type { CustomField } from '@/types';
import {
  dedupeByPhone,
  isUniqueViolation,
  normalizeKey,
} from '@/lib/contacts/dedupe';
import { parseGenericCsv } from '@/lib/contacts/parse-generic-csv';
import {
  SYSTEM_FIELDS,
  customFieldTargets,
  guessColumnMapping,
  applyMapping,
  validateRow,
  type MappedRow,
  type RowValidation,
} from '@/lib/contacts/import-fields';
import { buildSampleCsv, downloadSampleCsv } from '@/lib/contacts/sample-csv';
import {
  assignImportedContactTags,
  resolveImportTagIds,
  type ContactTagAssignment,
} from '@/lib/contacts/resolve-import-tags';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Download,
  Trash2,
  ArrowLeft,
} from 'lucide-react';

type Step = 'upload' | 'map' | 'preview' | 'result';

interface PreviewRow {
  mapped: MappedRow;
  validation: RowValidation;
}

function truncateFilename(name: string, max = 48): string {
  if (name.length <= max) return name;
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  const base = name.slice(0, name.length - ext.length);
  const keep = max - ext.length - 1;
  return `${base.slice(0, Math.max(keep, 12))}…${ext}`;
}

interface ImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported: () => void;
}

export function ImportModal({ open, onOpenChange, onImported }: ImportModalProps) {
  const supabase = createClient();
  const { accountId, canEditSettings } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);

  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<number, string>>({});

  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [existingPhones, setExistingPhones] = useState<Set<string>>(new Set());
  const [bulkConsent, setBulkConsent] = useState(false);

  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<{
    imported: number;
    leads: number;
    customers: number;
    skipped: number;
    failed: number;
    tagsAssigned: number;
  } | null>(null);

  const mappingTargets = useMemo(
    () => [...SYSTEM_FIELDS, ...customFieldTargets(customFields)],
    [customFields],
  );

  function reset() {
    setStep('upload');
    setFile(null);
    setHeaders([]);
    setRawRows([]);
    setColumnMapping({});
    setPreviewRows([]);
    setBulkConsent(false);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleOpenChange(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected || !accountId) return;
    setFile(selected);
    setResult(null);

    const text = await selected.text();
    const { headers: parsedHeaders, rows } = parseGenericCsv(text);
    if (parsedHeaders.length === 0 || rows.length === 0) {
      toast.error('Could not find any rows in that file.');
      return;
    }

    const { data: fields } = await supabase
      .from('custom_fields')
      .select('*')
      .eq('account_id', accountId);
    const cf = fields ?? [];
    setCustomFields(cf);

    setHeaders(parsedHeaders);
    setRawRows(rows);
    setColumnMapping(guessColumnMapping(parsedHeaders, cf));
    setStep('map');
  }

  function proceedToPreview() {
    const hasPhone = Object.values(columnMapping).includes('phone');
    if (!hasPhone) {
      toast.error('Map at least one column to Phone before continuing.');
      return;
    }
    buildPreview(columnMapping);
  }

  async function buildPreview(mapping: Record<number, string>) {
    if (!accountId) return;
    const { data: existingRows } = await supabase
      .from('contacts')
      .select('phone_normalized')
      .eq('account_id', accountId);
    const existing = new Set(
      (existingRows ?? [])
        .map((r) => (r as { phone_normalized: string | null }).phone_normalized)
        .filter((p): p is string => !!p),
    );
    setExistingPhones(existing);

    const seen = new Set<string>();
    const built = rawRows.map((raw) => {
      const mapped = applyMapping(raw, mapping);
      const validation = validateRow(mapped, seen, existing);
      return { mapped, validation };
    });
    setPreviewRows(built);
    setStep('preview');
  }

  function revalidateAll(rows: PreviewRow[]): PreviewRow[] {
    const seen = new Set<string>();
    return rows.map(({ mapped }) => ({
      mapped,
      validation: validateRow(mapped, seen, existingPhones),
    }));
  }

  function updateCell(index: number, patch: Partial<MappedRow>) {
    setPreviewRows((prev) => {
      const next = prev.map((r, i) => (i === index ? { ...r, mapped: { ...r.mapped, ...patch } } : r));
      return revalidateAll(next);
    });
  }

  function deleteRow(index: number) {
    setPreviewRows((prev) => revalidateAll(prev.filter((_, i) => i !== index)));
  }

  const errorRowCount = previewRows.filter((r) => Object.keys(r.validation.errors).length > 0).length;
  const importableCount = previewRows.length - errorRowCount;

  async function handleImport() {
    if (!accountId || previewRows.length === 0) return;
    setImporting(true);

    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) throw new Error('Not authenticated');

      const importable = previewRows.filter((r) => Object.keys(r.validation.errors).length === 0);
      const skipped = previewRows.length - importable.length;
      let imported = 0;
      let failed = 0;
      let leads = 0;
      let customers = 0;

      const nowIso = new Date().toISOString();
      const tagAssignments: ContactTagAssignment[] = [];
      const customValueRows: { contact_id: string; custom_field_id: string; value: string }[] = [];

      const allTagNames = importable.flatMap((r) => r.mapped.tagNames);
      let tagIdByKey = new Map<string, string>();
      let skippedNames: string[] = [];
      if (allTagNames.length > 0) {
        ({ tagIdByKey, skippedNames } = await resolveImportTagIds(supabase, {
          accountId,
          userId: user.id,
          tagNames: allTagNames,
          canCreateTags: canEditSettings,
        }));
      }

      const chunkSize = 50;
      for (let i = 0; i < importable.length; i += chunkSize) {
        const chunk = importable.slice(i, i + chunkSize);
        const rows = chunk.map(({ mapped }) => {
          const type = (mapped.type.trim().toLowerCase() === 'customer' ? 'customer' : 'lead') as
            | 'lead'
            | 'customer';
          const rowConsent = mapped.consentRaw.trim()
            ? ['yes', 'y', 'true', '1'].includes(mapped.consentRaw.trim().toLowerCase())
            : bulkConsent;
          return {
            user_id: user.id,
            account_id: accountId,
            phone: mapped.phone.trim(),
            name: mapped.name.trim() || null,
            email: mapped.email.trim() || null,
            company: mapped.company.trim() || null,
            contact_type: type,
            source: mapped.source.trim() || 'Import',
            consent_given: rowConsent,
            consent_source: rowConsent ? 'import' : null,
            consent_at: rowConsent ? nowIso : null,
          };
        });

        const { data, error } = await supabase.from('contacts').insert(rows).select('id, contact_type');

        if (error) {
          for (let j = 0; j < rows.length; j++) {
            const row = rows[j];
            const source = chunk[j];
            const { data: singleData, error: singleErr } = await supabase
              .from('contacts')
              .insert(row)
              .select('id, contact_type')
              .single();
            if (!singleErr && singleData) {
              imported++;
              if (singleData.contact_type === 'customer') customers++;
              else leads++;
              if (source.mapped.tagNames.length > 0) {
                tagAssignments.push({ contactId: singleData.id, tagNames: source.mapped.tagNames });
              }
              for (const [fieldId, value] of Object.entries(source.mapped.customValues)) {
                if (value.trim()) customValueRows.push({ contact_id: singleData.id, custom_field_id: fieldId, value: value.trim() });
              }
            } else if (isUniqueViolation(singleErr)) {
              // Raced with another insert since our existence check.
            } else {
              failed++;
            }
          }
        } else {
          const inserted = data ?? [];
          imported += inserted.length;
          for (let j = 0; j < inserted.length; j++) {
            const source = chunk[j];
            if (!source) continue;
            if (inserted[j].contact_type === 'customer') customers++;
            else leads++;
            if (source.mapped.tagNames.length > 0) {
              tagAssignments.push({ contactId: inserted[j].id, tagNames: source.mapped.tagNames });
            }
            for (const [fieldId, value] of Object.entries(source.mapped.customValues)) {
              if (value.trim()) customValueRows.push({ contact_id: inserted[j].id, custom_field_id: fieldId, value: value.trim() });
            }
          }
        }
      }

      if (customValueRows.length > 0) {
        await supabase.from('contact_custom_values').insert(customValueRows);
      }

      let tagsAssigned = 0;
      try {
        tagsAssigned = await assignImportedContactTags(supabase, tagAssignments, tagIdByKey);
      } catch {
        toast.warning('Contacts imported, but tag assignment failed.');
      }

      setResult({ imported, leads, customers, skipped, failed, tagsAssigned });
      setStep('result');
      if (imported > 0) {
        toast.success(`Imported ${imported} contact${imported === 1 ? '' : 's'}`);
        onImported();
      }
      if (skippedNames.length > 0) {
        const sample = skippedNames.slice(0, 3).join(', ');
        toast.info(`Some tags weren't created: ${sample}${skippedNames.length > 3 ? ` (+${skippedNames.length - 3} more)` : ''}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[min(90vh,760px)] flex-col gap-0 overflow-hidden border-border/80 bg-popover p-0 text-popover-foreground sm:max-w-3xl">
        <div className="shrink-0 space-y-3 border-b border-border/80 px-6 pt-6 pb-4">
          <DialogHeader className="gap-1.5">
            <DialogTitle className="text-lg text-popover-foreground">Import contacts</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              {step === 'upload' && 'Upload a CSV, then map its columns to fields -- no fixed header names required.'}
              {step === 'map' && 'Tell us which column is which. We guessed based on your headers -- check and adjust.'}
              {step === 'preview' && `Review every row before importing. Fix a cell by clicking it, or remove a row.`}
              {step === 'result' && 'Import complete.'}
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                role="button"
                tabIndex={0}
                onClick={() => fileInputRef.current?.click()}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
                className={cn(
                  'group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed p-6 transition-all',
                  file ? 'border-primary/35 bg-primary/[0.04]' : 'hover:border-primary/40 border-border/80 bg-background/40 hover:bg-background/70',
                )}
              >
                {file ? (
                  <>
                    <div className="bg-primary/15 ring-primary/25 flex size-10 items-center justify-center rounded-lg ring-1">
                      <FileText className="text-primary size-5" />
                    </div>
                    <p className="max-w-full truncate px-2 text-sm font-medium text-popover-foreground" title={file.name}>
                      {truncateFilename(file.name)}
                    </p>
                  </>
                ) : (
                  <>
                    <div className="flex size-10 items-center justify-center rounded-lg bg-muted/80 ring-1 ring-border/80 transition-colors group-hover:bg-muted">
                      <Upload className="size-5 text-muted-foreground group-hover:text-foreground" />
                    </div>
                    <p className="text-sm text-muted-foreground">Click to choose a CSV file</p>
                  </>
                )}
              </div>
              <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileChange} className="hidden" />

              <Button
                type="button"
                variant="outline"
                onClick={() => downloadSampleCsv(customFields)}
                className="border-border text-muted-foreground hover:bg-muted"
              >
                <Download className="size-4" />
                Download sample CSV
              </Button>

              <div className="rounded-lg border border-border bg-background/50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Field format guide
                </p>
                <dl className="space-y-1.5 text-xs">
                  {SYSTEM_FIELDS.filter((f) => f.key !== 'ignore').map((f) => (
                    <div key={f.key} className="flex gap-2">
                      <dt className="w-16 shrink-0 font-medium text-foreground">
                        {f.label}
                        {f.required && <span className="text-red-400"> *</span>}
                      </dt>
                      <dd className="text-muted-foreground">{f.hint}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          )}

          {step === 'map' && (
            <div className="space-y-3">
              <div className="overflow-hidden rounded-xl border border-border">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border bg-background/60">
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">CSV column</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Example value</th>
                      <th className="px-3 py-2 text-left font-medium text-muted-foreground">Maps to</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {headers.map((h, i) => (
                      <tr key={i} className="bg-popover/40">
                        <td className="px-3 py-2 font-medium text-popover-foreground">{h || `Column ${i + 1}`}</td>
                        <td className="max-w-[10rem] truncate px-3 py-2 text-muted-foreground" title={rawRows[0]?.[i]}>
                          {rawRows[0]?.[i] || '—'}
                        </td>
                        <td className="px-3 py-2">
                          <Select
                            value={columnMapping[i] ?? 'ignore'}
                            onValueChange={(v) => v && setColumnMapping((prev) => ({ ...prev, [i]: v }))}
                          >
                            <SelectTrigger className="h-8 w-full bg-muted border-border text-foreground">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-popover border-border">
                              {mappingTargets.map((t) => (
                                <SelectItem key={t.key} value={t.key} className="text-popover-foreground">
                                  {t.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground">{rawRows.length} row(s) found in this file.</p>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-primary">
                  <CheckCircle className="size-3.5" /> {importableCount} ready to import
                </span>
                {errorRowCount > 0 && (
                  <span className="inline-flex items-center gap-1 rounded-md bg-red-500/10 px-2 py-1 text-red-500">
                    <AlertTriangle className="size-3.5" /> {errorRowCount} need fixing (won&apos;t be imported as-is)
                  </span>
                )}
              </div>

              <div className="max-h-[22rem] overflow-auto rounded-xl border border-border">
                <table className="w-full min-w-[52rem] text-xs">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b border-border">
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground">Phone *</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground">Name</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground">Email</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground">Company</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground">Type</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground">Source</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground">Consent</th>
                      <th className="px-2 py-2 text-left font-medium text-muted-foreground">Tags</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/70">
                    {previewRows.map((row, i) => {
                      const err = row.validation.errors;
                      const cellCls = (key: string) =>
                        cn('h-7 border-0 bg-transparent text-xs', err[key] && 'ring-1 ring-red-500 bg-red-500/10');
                      return (
                        <tr key={i} className="bg-popover/40">
                          <td className="px-1 py-1" title={err.phone}>
                            <Input value={row.mapped.phone} onChange={(e) => updateCell(i, { phone: e.target.value })} className={cellCls('phone')} />
                          </td>
                          <td className="px-1 py-1">
                            <Input value={row.mapped.name} onChange={(e) => updateCell(i, { name: e.target.value })} className={cellCls('name')} />
                          </td>
                          <td className="px-1 py-1" title={err.email}>
                            <Input value={row.mapped.email} onChange={(e) => updateCell(i, { email: e.target.value })} className={cellCls('email')} />
                          </td>
                          <td className="px-1 py-1">
                            <Input value={row.mapped.company} onChange={(e) => updateCell(i, { company: e.target.value })} className={cellCls('company')} />
                          </td>
                          <td className="px-1 py-1" title={err.type}>
                            <Input value={row.mapped.type} onChange={(e) => updateCell(i, { type: e.target.value })} placeholder="lead" className={cellCls('type')} />
                          </td>
                          <td className="px-1 py-1">
                            <Input value={row.mapped.source} onChange={(e) => updateCell(i, { source: e.target.value })} className={cellCls('source')} />
                          </td>
                          <td className="px-1 py-1" title={err.consent}>
                            <Input value={row.mapped.consentRaw} onChange={(e) => updateCell(i, { consentRaw: e.target.value })} placeholder="no" className={cellCls('consent')} />
                          </td>
                          <td className="px-1 py-1 text-muted-foreground">
                            {row.mapped.tagNames.join(', ') || '—'}
                          </td>
                          <td className="px-1 py-1">
                            <button type="button" onClick={() => deleteRow(i)} className="text-muted-foreground hover:text-red-500" aria-label="Remove row">
                              <Trash2 className="size-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <label className="flex items-start gap-2 rounded-md border border-border bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={bulkConsent}
                  onChange={(e) => setBulkConsent(e.target.checked)}
                  className="mt-0.5 size-3.5 accent-primary"
                />
                <span>
                  I confirm the contacts in this file (that don&apos;t already have a Consent column value) have
                  agreed to be contacted on WhatsApp. Meta can restrict numbers that message people without consent.
                </span>
              </label>
            </div>
          )}

          {step === 'result' && result && (
            <div className="rounded-xl border border-border bg-background/50 p-4">
              <p className="text-sm font-medium text-popover-foreground">Import complete</p>
              <div className="mt-3 flex flex-wrap gap-3">
                {result.imported > 0 && (
                  <div className="text-primary flex items-center gap-1.5 text-sm">
                    <CheckCircle className="size-4 shrink-0" />
                    {result.imported} imported ({result.leads} lead{result.leads === 1 ? '' : 's'}, {result.customers} customer{result.customers === 1 ? '' : 's'})
                  </div>
                )}
                {result.tagsAssigned > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-cyan-400">
                    <CheckCircle className="size-4 shrink-0" />
                    {result.tagsAssigned} tags assigned
                  </div>
                )}
                {result.skipped > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-amber-400">
                    <AlertTriangle className="size-4 shrink-0" />
                    {result.skipped} skipped (had errors)
                  </div>
                )}
                {result.failed > 0 && (
                  <div className="flex items-center gap-1.5 text-sm text-red-400">
                    <XCircle className="size-4 shrink-0" />
                    {result.failed} failed
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-0 shrink-0 gap-2 border-t border-border/80 bg-background/50 px-6 py-4 sm:justify-between">
          <div>
            {(step === 'map' || step === 'preview') && (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep(step === 'map' ? 'upload' : 'map')}
                className="text-muted-foreground hover:bg-muted"
              >
                <ArrowLeft className="size-4" />
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)} className="border-border text-muted-foreground hover:bg-muted">
              {step === 'result' ? 'Close' : 'Cancel'}
            </Button>
            {step === 'map' && (
              <Button type="button" onClick={proceedToPreview} className="bg-primary hover:bg-primary/90 text-primary-foreground">
                Preview
              </Button>
            )}
            {step === 'preview' && (
              <Button
                type="button"
                disabled={importableCount === 0 || importing}
                onClick={handleImport}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                {importing && <Loader2 className="size-4 animate-spin" />}
                Import {importableCount} contact{importableCount === 1 ? '' : 's'}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Re-exported so a caller (e.g. a "Download template" link elsewhere) can build the same CSV without opening the modal.
export { buildSampleCsv };
