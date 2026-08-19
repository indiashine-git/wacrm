// Framework-agnostic (no 'use client', no browser APIs) so both the
// dashboard wizard (client) and server-side audience resolution (cron,
// send-now on an unresolved draft) compute {{1}}, {{2}}… identically.

import type { Contact } from "@/types";

export type VariableMapping =
  | { type: "static"; value: string }
  | { type: "field"; value: string }
  | { type: "custom_field"; value: string };

/**
 * Resolve a template's positional body params for one contact.
 * Keys are typically "1","2",… — numeric-aware sort keeps {{1}} before
 * {{10}}.
 */
export function resolveVariables(
  variables: Record<string, VariableMapping>,
  contact: Contact,
  customValues?: Map<string, string>,
): string[] {
  const keys = Object.keys(variables).sort((a, b) => {
    const an = Number(a);
    const bn = Number(b);
    if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
    return a.localeCompare(b);
  });

  return keys.map((key) => {
    const v = variables[key];
    if (v.type === "static") return v.value;

    if (v.type === "field") {
      const fieldMap: Record<string, string | undefined> = {
        name: contact.name,
        phone: contact.phone,
        email: contact.email,
        company: contact.company,
      };
      return fieldMap[v.value] ?? "";
    }

    return customValues?.get(v.value) ?? "";
  });
}
