import type { CustomField } from '@/types';
import { SYSTEM_FIELDS } from '@/lib/contacts/import-fields';

/**
 * Always generated live, never a static file -- picks up whatever
 * custom fields the account has right now, so the template is never
 * stale.
 */
export function buildSampleCsv(customFields: CustomField[]): string {
  const systemHeaders = SYSTEM_FIELDS.filter((f) => f.key !== 'ignore').map((f) => f.label.toLowerCase());
  const customHeaders = customFields.map((f) => f.field_name);
  const finalHeaders = [...new Set([...systemHeaders, ...customHeaders])];

  const example: Record<string, string> = {
    phone: '919876543210',
    name: 'Anita Sharma',
    email: 'anita@example.com',
    company: 'Sharma Textiles',
    type: 'lead',
    source: 'Website',
    consent: 'yes',
    tags: 'VIP;Newsletter',
  };
  for (const f of customFields) example[f.field_name] = '';

  const exampleRow = finalHeaders.map((h) => example[h] ?? '');

  const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const lines = [finalHeaders.map(escape).join(','), exampleRow.map(escape).join(',')];
  return lines.join('\n');
}

export function downloadSampleCsv(customFields: CustomField[]) {
  const csv = buildSampleCsv(customFields);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'contacts-import-template.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
