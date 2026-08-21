import type { CustomField } from '@/types';
import { normalizeKey } from '@/lib/contacts/dedupe';
import { parseTagCell } from '@/lib/contacts/parse-contact-csv';

/** Built-in system fields a CSV column can map to (custom fields are added dynamically per-account). */
export const SYSTEM_FIELDS = [
  { key: 'phone', label: 'Phone', required: true, hint: 'Digits with country code, e.g. 919876543210. No spaces/dashes needed.' },
  { key: 'name', label: 'Name', required: false, hint: 'Any text.' },
  { key: 'email', label: 'Email', required: false, hint: 'A valid email address, e.g. name@example.com.' },
  { key: 'company', label: 'Company', required: false, hint: 'Any text.' },
  { key: 'type', label: 'Type', required: false, hint: '"lead" or "customer". Blank defaults to lead.' },
  { key: 'source', label: 'Source', required: false, hint: 'Any text, e.g. Website, Referral, Import.' },
  { key: 'consent', label: 'Consent', required: false, hint: '"yes"/"no" (also accepts y/n, true/false, 1/0). Blank defaults to no.' },
  { key: 'tags', label: 'Tags', required: false, hint: 'Comma or semicolon separated, e.g. VIP, Newsletter.' },
  { key: 'ignore', label: "Don't import", required: false, hint: 'Skip this column entirely.' },
] as const;

export type SystemFieldKey = (typeof SYSTEM_FIELDS)[number]['key'];

export interface CustomFieldTarget {
  key: `custom:${string}`;
  label: string;
  required: false;
  hint: string;
  customFieldId: string;
}

export type ImportFieldTarget = (typeof SYSTEM_FIELDS)[number] | CustomFieldTarget;

export function customFieldTargets(customFields: CustomField[]): CustomFieldTarget[] {
  return customFields.map((f) => ({
    key: `custom:${f.id}` as const,
    label: f.field_name,
    required: false,
    hint: 'Any text.',
    customFieldId: f.id,
  }));
}

/** Best-effort auto-guess of which CSV column maps to which field, by header name. Always user-editable afterward. */
export function guessColumnMapping(
  headers: string[],
  customFields: CustomField[],
): Record<number, string> {
  const mapping: Record<number, string> = {};
  const byNormalizedName = new Map<string, string>();
  for (const f of customFields) {
    byNormalizedName.set(f.field_name.trim().toLowerCase(), `custom:${f.id}`);
  }

  const aliases: Record<string, SystemFieldKey> = {
    phone: 'phone', 'phone number': 'phone', mobile: 'phone', whatsapp: 'phone',
    name: 'name', 'full name': 'name', 'contact name': 'name',
    email: 'email', 'e-mail': 'email',
    company: 'company', organization: 'company', organisation: 'company',
    type: 'type', 'contact type': 'type', stage: 'type',
    source: 'source', 'lead source': 'source',
    consent: 'consent', 'opt-in': 'consent', optin: 'consent',
    tags: 'tags', tag: 'tags', labels: 'tags',
  };

  headers.forEach((h, i) => {
    const key = h.trim().toLowerCase();
    if (aliases[key]) {
      mapping[i] = aliases[key];
    } else if (byNormalizedName.has(key)) {
      mapping[i] = byNormalizedName.get(key)!;
    } else {
      mapping[i] = 'ignore';
    }
  });

  return mapping;
}

export interface MappedRow {
  phone: string;
  name: string;
  email: string;
  company: string;
  type: string;
  source: string;
  consentRaw: string;
  tagNames: string[];
  customValues: Record<string, string>;
}

export interface RowValidation {
  /** Field key -> error message, only for cells that fail validation. */
  errors: Record<string, string>;
  /** True if this row duplicates another row earlier in the same file (by normalized phone). */
  duplicateInFile: boolean;
  /** True if this phone already exists in the account. */
  duplicateInAccount: boolean;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseConsent(raw: string): boolean | 'invalid' {
  const v = raw.trim().toLowerCase();
  if (!v) return false;
  if (['yes', 'y', 'true', '1'].includes(v)) return true;
  if (['no', 'n', 'false', '0'].includes(v)) return false;
  return 'invalid';
}

/** Turn a raw string[] row into a typed MappedRow using the column->field mapping. */
export function applyMapping(
  rawRow: string[],
  columnMapping: Record<number, string>,
): MappedRow {
  const row: MappedRow = {
    phone: '', name: '', email: '', company: '', type: '', source: '',
    consentRaw: '', tagNames: [], customValues: {},
  };
  rawRow.forEach((value, i) => {
    const field = columnMapping[i];
    if (!field || field === 'ignore') return;
    if (field === 'tags') {
      row.tagNames = parseTagCell(value);
    } else if (field.startsWith('custom:')) {
      row.customValues[field.slice('custom:'.length)] = value;
    } else if (field === 'consent') {
      row.consentRaw = value;
    } else if (field in row) {
      (row as unknown as Record<string, string>)[field] = value;
    }
  });
  return row;
}

/** Validate one mapped row. `seenPhones` accumulates as rows are checked, in file order. */
export function validateRow(
  row: MappedRow,
  seenPhones: Set<string>,
  existingPhones: Set<string>,
): RowValidation {
  const errors: Record<string, string> = {};

  const phone = row.phone.trim();
  const normalized = normalizeKey(phone);
  if (!phone) {
    errors.phone = 'Phone is required.';
  } else if (normalized.length < 8) {
    errors.phone = 'Phone looks too short -- include the country code.';
  }

  if (row.email.trim() && !EMAIL_RE.test(row.email.trim())) {
    errors.email = 'Not a valid email address.';
  }

  const type = row.type.trim().toLowerCase();
  if (type && type !== 'lead' && type !== 'customer') {
    errors.type = 'Must be "lead" or "customer".';
  }

  const consent = parseConsent(row.consentRaw);
  if (consent === 'invalid') {
    errors.consent = 'Must be yes/no.';
  }

  const duplicateInFile = !!normalized && seenPhones.has(normalized);
  const duplicateInAccount = !!normalized && !duplicateInFile && existingPhones.has(normalized);
  if (normalized) seenPhones.add(normalized);

  if (duplicateInFile) errors.phone = errors.phone || 'Duplicate phone in this file.';
  else if (duplicateInAccount) errors.phone = errors.phone || 'Already exists in your contacts.';

  return { errors, duplicateInFile, duplicateInAccount };
}
