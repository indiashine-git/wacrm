/**
 * Header-agnostic CSV parse for the import wizard's column-mapping
 * step -- unlike the old fixed-header parser, this makes no assumption
 * about what the columns are called. The mapping step decides which
 * CSV column feeds which contact field.
 */

export interface GenericCsvResult {
  headers: string[];
  /** Raw string values, one array per row, same length/order as `headers`. */
  rows: string[][];
}

/** Simple CSV line parse (handles quoted fields, embedded commas). */
export function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  values.push(current.trim());
  return values;
}

export function parseGenericCsv(text: string): GenericCsvResult {
  const lines = text.replace(/^﻿/, '').trim().split(/\r?\n/);
  if (lines.length < 1) return { headers: [], rows: [] };

  const headers = parseCsvLine(lines[0]).map((h) => h.replace(/["']/g, '').trim());
  const rows: string[][] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const values = parseCsvLine(line).map((v) => v.replace(/["']/g, '').trim());
    // Pad/truncate to header length so every row is a clean fixed-width
    // array regardless of a ragged source file.
    while (values.length < headers.length) values.push('');
    rows.push(values.slice(0, headers.length));
  }

  return { headers, rows };
}
