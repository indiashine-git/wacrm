// Server-side twin of the wizard's client-side audience resolution
// (src/hooks/use-broadcast-sending.ts). Used only for broadcasts saved
// with `lockAudience: false` — the recipient list wasn't computed at
// save time, so it must be computed here, at fire time, with no
// browser tab involved (manual "Send now" on a still-unresolved draft,
// or the schedule cron). CSV audiences never reach this module: they
// are always locked at save time (see createDraftOrScheduled).

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Contact } from "@/types";
import {
  resolveVariables,
  type VariableMapping,
} from "@/lib/whatsapp/broadcast-variables";

export interface ServerAudienceFilter {
  type: "all" | "tags" | "custom_field" | "csv";
  tagIds?: string[];
  customField?: { fieldId: string; operator: "is" | "is_not" | "contains"; value: string };
  excludeTagIds?: string[];
  /** Drop contacts with consent_given=false from the audience before sending. */
  excludeNoConsent?: boolean;
}

const CUSTOM_VALUE_PAGE = 500;

async function fetchCustomValueIndex(
  db: SupabaseClient,
  contactIds: string[],
): Promise<Map<string, Map<string, string>>> {
  const index = new Map<string, Map<string, string>>();
  if (contactIds.length === 0) return index;

  for (let i = 0; i < contactIds.length; i += CUSTOM_VALUE_PAGE) {
    const slice = contactIds.slice(i, i + CUSTOM_VALUE_PAGE);
    const { data } = await db
      .from("contact_custom_values")
      .select("contact_id, custom_field_id, value")
      .in("contact_id", slice);

    for (const row of data ?? []) {
      const bucket = index.get(row.contact_id) ?? new Map<string, string>();
      bucket.set(row.custom_field_id, row.value ?? "");
      index.set(row.contact_id, bucket);
    }
  }
  return index;
}

/**
 * Resolve `all` / `tags` / `custom_field` audiences to contacts,
 * account-scoped (the caller passes a service-role client, so RLS
 * doesn't do the scoping — every query below is explicit).
 */
export async function resolveAudienceServer(
  db: SupabaseClient,
  accountId: string,
  filter: ServerAudienceFilter,
): Promise<Contact[]> {
  let contacts: Contact[] = [];

  if (filter.type === "all") {
    const { data, error } = await db
      .from("contacts")
      .select("*")
      .eq("account_id", accountId);
    if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
    contacts = data ?? [];
  } else if (filter.type === "tags" && filter.tagIds && filter.tagIds.length > 0) {
    const { data: contactTags, error: tagError } = await db
      .from("contact_tags")
      .select("contact_id")
      .in("tag_id", filter.tagIds);
    if (tagError) throw new Error(`Failed to fetch contact tags: ${tagError.message}`);

    if (contactTags && contactTags.length > 0) {
      const uniqueContactIds = [...new Set(contactTags.map((ct) => ct.contact_id))];
      const { data, error } = await db
        .from("contacts")
        .select("*")
        .eq("account_id", accountId)
        .in("id", uniqueContactIds);
      if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
      contacts = data ?? [];
    }
  } else if (filter.type === "custom_field" && filter.customField) {
    const { fieldId, operator, value } = filter.customField;
    let query = db
      .from("contact_custom_values")
      .select("contact_id")
      .eq("custom_field_id", fieldId);
    if (operator === "is") query = query.eq("value", value);
    else if (operator === "is_not") query = query.neq("value", value);
    else if (operator === "contains") query = query.ilike("value", `%${value}%`);

    const { data: matches, error: matchErr } = await query;
    if (matchErr) throw new Error(`Custom-field filter failed: ${matchErr.message}`);

    const contactIds = [...new Set((matches ?? []).map((m) => m.contact_id))];
    if (contactIds.length > 0) {
      const { data, error } = await db
        .from("contacts")
        .select("*")
        .eq("account_id", accountId)
        .in("id", contactIds);
      if (error) throw new Error(`Failed to fetch contacts: ${error.message}`);
      contacts = data ?? [];
    }
  } else {
    throw new Error(
      `Audience type "${filter.type}" cannot be resolved server-side — it must be locked at save time.`,
    );
  }

  if (filter.excludeTagIds && filter.excludeTagIds.length > 0) {
    const { data: excludeRows } = await db
      .from("contact_tags")
      .select("contact_id")
      .in("tag_id", filter.excludeTagIds);
    const excludedIds = new Set((excludeRows ?? []).map((r) => r.contact_id));
    contacts = contacts.filter((c) => !excludedIds.has(c.id));
  }

  if (filter.excludeNoConsent) {
    contacts = contacts.filter((c) => c.consent_given);
  }

  return contacts;
}

/** `broadcast_recipients` inserts are independent of the send rate. */
const INSERT_BATCH_SIZE = 200;

/**
 * Resolve the audience for a broadcast whose recipients weren't locked
 * at save time, and insert `broadcast_recipients` rows for it (status
 * 'pending', with per-contact template params already resolved — same
 * shape the resume/deliver machinery expects). Returns the recipient
 * count. Throws if nothing matched.
 */
export async function resolveAndInsertRecipients(
  db: SupabaseClient,
  accountId: string,
  broadcastId: string,
  audienceFilter: ServerAudienceFilter,
  templateVariables: Record<string, VariableMapping>,
): Promise<number> {
  const contacts = await resolveAudienceServer(db, accountId, audienceFilter);
  if (contacts.length === 0) {
    throw new Error("No contacts currently match this broadcast's audience.");
  }

  const customValueIndex = await fetchCustomValueIndex(
    db,
    contacts.map((c) => c.id),
  );
  const recipientRows = contacts.map((contact) => ({
    broadcast_id: broadcastId,
    contact_id: contact.id,
    status: "pending" as const,
    template_params: resolveVariables(
      templateVariables,
      contact,
      customValueIndex.get(contact.id),
    ),
  }));

  for (let i = 0; i < recipientRows.length; i += INSERT_BATCH_SIZE) {
    const batch = recipientRows.slice(i, i + INSERT_BATCH_SIZE);
    const { error } = await db.from("broadcast_recipients").insert(batch);
    if (error) {
      throw new Error(`Failed to insert recipient batch: ${error.message}`);
    }
  }

  const { error: countError } = await db
    .from("broadcasts")
    .update({ total_recipients: contacts.length })
    .eq("id", broadcastId);
  if (countError) {
    throw new Error(`Failed to update recipient count: ${countError.message}`);
  }

  return contacts.length;
}
