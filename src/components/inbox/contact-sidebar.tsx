"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import type { Contact, Deal, ContactNote, Tag, CustomField, ContactCustomValue } from "@/types";
import {
  Phone,
  Mail,
  Copy,
  Check,
  Tag as TagIcon,
  DollarSign,
  StickyNote,
  Plus,
  Calendar,
  ListChecks,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@/components/ui/tabs";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { format } from "date-fns";
import { useTranslations } from "next-intl";

interface ContactSidebarProps {
  contact: Contact | null;
}

export function ContactSidebar({ contact }: ContactSidebarProps) {
  const tSidebar = useTranslations("Inbox.sidebar");
  const tThread = useTranslations("Inbox.messageThread");

  const { accountId } = useAuth();
  const [copied, setCopied] = useState(false);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [tags, setTags] = useState<(Tag & { contact_tag_id: string })[]>([]);
  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<ContactCustomValue[]>([]);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  const fetchContactData = useCallback(async () => {
    if (!contact || !accountId) return;

    const supabase = createClient();

    const [dealsRes, notesRes, tagsRes, fieldsRes, valuesRes] = await Promise.all([
      supabase
        .from("deals")
        .select("*, stage:pipeline_stages(*)")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_notes")
        .select("*")
        .eq("contact_id", contact.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("contact_tags")
        .select("id, tag_id, tags(*)")
        .eq("contact_id", contact.id),
      supabase
        .from("custom_fields")
        .select("*")
        .eq("account_id", accountId),
      supabase
        .from("contact_custom_values")
        .select("*")
        .eq("contact_id", contact.id),
    ]);

    if (dealsRes.data) setDeals(dealsRes.data);
    if (notesRes.data) setNotes(notesRes.data);
    if (tagsRes.data) {
      const mapped = tagsRes.data
        .filter((ct: Record<string, unknown>) => ct.tags)
        .map((ct: Record<string, unknown>) => ({
          ...(ct.tags as Tag),
          contact_tag_id: ct.id as string,
        }));
      setTags(mapped);
    }
    if (fieldsRes.data) setCustomFields(fieldsRes.data);
    if (valuesRes.data) setCustomValues(valuesRes.data);
  }, [contact, accountId]);

  // Load on contact change. setContactData/setTags run inside async
  // Supabase callbacks, not synchronously in the effect body.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchContactData();
  }, [fetchContactData]);

  const handleCopyPhone = useCallback(async () => {
    if (!contact?.phone) return;
    await navigator.clipboard.writeText(contact.phone);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    // Dep is the whole `contact` object (not `contact?.phone`) so the
    // React Compiler's inference agrees with the manual dep list —
    // fixes the `preserve-manual-memoization` lint error.
  }, [contact]);

  const handleAddNote = useCallback(async () => {
    if (!contact || !newNote.trim()) return;
    if (!accountId) return;
    setAddingNote(true);

    const supabase = createClient();
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const user = session?.user;

    const { data, error } = await supabase
      .from("contact_notes")
      .insert({
        contact_id: contact.id,
        account_id: accountId,
        user_id: user?.id,
        note_text: newNote.trim(),
      })
      .select()
      .single();

    if (!error && data) {
      setNotes((prev) => [data, ...prev]);
      setNewNote("");
    }
    setAddingNote(false);
  }, [contact, newNote, accountId]);

  // Filled-in custom field rows only — an account can have dozens of
  // field definitions but most contacts only carry a handful. Showing
  // every empty definition would bury the ones that actually matter.
  const filledCustomFields = useMemo(() => {
    const valueByFieldId = new Map(customValues.map((v) => [v.custom_field_id, v.value]));
    return customFields
      .map((field) => ({ field, value: valueByFieldId.get(field.id) }))
      .filter((row): row is { field: CustomField; value: string } => Boolean(row.value));
  }, [customFields, customValues]);

  if (!contact) {
    return (
      <div className="flex h-full w-70 items-center justify-center border-l border-border bg-card">
        <p className="text-sm text-muted-foreground">{tThread("selectConversation")}</p>
      </div>
    );
  }

  const displayName = contact.name || contact.phone;
  const initials = displayName.charAt(0).toUpperCase();

  return (
    <div className="flex h-full w-70 flex-col border-l border-border bg-card">
      {/* Identity block — always visible, stays put above the tabs so
          the essentials (who, phone, email) never scroll out of view. */}
      <div className="shrink-0 border-b border-border p-4">
        <div className="flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted text-lg font-semibold text-foreground">
            {contact.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={contact.avatar_url}
                alt={displayName}
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <h3 className="mt-3 text-sm font-semibold text-foreground">
            {displayName}
          </h3>
          {contact.company && (
            <p className="text-xs text-muted-foreground">{contact.company}</p>
          )}
        </div>

        <div className="mt-3 space-y-1">
          <button
            onClick={handleCopyPhone}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
          >
            <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate text-left">{contact.phone}</span>
            {copied ? (
              <Check className="h-3 w-3 shrink-0 text-primary" />
            ) : (
              <Copy className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
          </button>
          <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
            <Mail className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{contact.email || tSidebar("noEmail")}</span>
          </div>
          <div className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
            <Calendar className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {tSidebar("memberSince")} {format(new Date(contact.created_at), "MMM yyyy")}
            </span>
          </div>
        </div>
      </div>

      <Tabs defaultValue="overview" className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList variant="line" className="shrink-0 justify-start gap-0 border-b border-border px-2">
          <TabsTrigger value="overview" className="flex-1 text-xs">
            {tSidebar("tabOverview")}
          </TabsTrigger>
          <TabsTrigger value="details" className="flex-1 text-xs">
            {tSidebar("tabDetails")}
          </TabsTrigger>
          <TabsTrigger value="notes" className="flex-1 text-xs">
            {tSidebar("tabNotes")}
          </TabsTrigger>
        </TabsList>

        <ScrollArea className="min-h-0 flex-1">
          <TabsContent value="overview" className="space-y-4 p-4">
            {/* Tags */}
            <div>
              <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <TagIcon className="h-3 w-3" />
                {tSidebar("tags")}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {tags.length === 0 ? (
                  <p className="px-1 text-xs text-muted-foreground">{tSidebar("noTags")}</p>
                ) : (
                  tags.map((tag) => (
                    <span
                      key={tag.contact_tag_id}
                      className="rounded-full px-2 py-0.5 text-[10px] font-medium"
                      style={{
                        backgroundColor: `${tag.color}20`,
                        color: tag.color,
                      }}
                    >
                      {tag.name}
                    </span>
                  ))
                )}
              </div>
            </div>

            {/* Deals — compact by default, click to expand for the full
                breakdown. Avoids a wall of deal metadata for contacts
                with several deals while still surfacing it on demand. */}
            <div>
              <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <DollarSign className="h-3 w-3" />
                {tSidebar("deals")}
              </div>
              <div className="mt-2">
                {deals.length === 0 ? (
                  <p className="px-1 text-xs text-muted-foreground">{tSidebar("noDeals")}</p>
                ) : (
                  <Accordion className="space-y-1.5">
                    {deals.map((deal) => (
                      <AccordionItem
                        key={deal.id}
                        value={deal.id}
                        className="overflow-hidden rounded-lg bg-muted"
                      >
                        <AccordionTrigger className="px-3 py-2 text-sm font-medium text-foreground hover:no-underline">
                          <span className="flex min-w-0 flex-1 items-center justify-between gap-2 pr-2">
                            <span className="truncate text-left">{deal.title}</span>
                            {deal.stage && (
                              <span
                                className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px]"
                                style={{
                                  backgroundColor: `${deal.stage.color}20`,
                                  color: deal.stage.color,
                                }}
                              >
                                {deal.stage.name}
                              </span>
                            )}
                          </span>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-1 px-3 pb-3 text-xs text-muted-foreground">
                          <div className="flex justify-between">
                            <span>{tSidebar("dealValue")}</span>
                            <span className="font-medium text-foreground">
                              {deal.currency ?? "$"}
                              {deal.value.toLocaleString()}
                            </span>
                          </div>
                          {deal.stage && (
                            <div className="flex justify-between">
                              <span>{tSidebar("dealStage")}</span>
                              <span className="text-foreground">{deal.stage.name}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span>{tSidebar("dealCreated")}</span>
                            <span className="text-foreground">
                              {format(new Date(deal.created_at), "MMM d, yyyy")}
                            </span>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="details" className="space-y-4 p-4">
            <div>
              <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <ListChecks className="h-3 w-3" />
                {tSidebar("customFields")}
              </div>
              <div className="mt-2 space-y-1">
                {filledCustomFields.length === 0 ? (
                  <p className="px-1 text-xs text-muted-foreground">
                    {tSidebar("noCustomFields")}
                  </p>
                ) : (
                  filledCustomFields.map(({ field, value }) => (
                    <div
                      key={field.id}
                      className="flex items-center justify-between gap-2 rounded-lg bg-muted px-3 py-2 text-xs"
                    >
                      <span className="shrink-0 text-muted-foreground">{field.field_name}</span>
                      <span className="truncate text-right font-medium text-foreground">
                        {value}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="notes" className="space-y-3 p-4">
            <div className="flex items-center gap-2 px-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <StickyNote className="h-3 w-3" />
              {tSidebar("notes")}
            </div>
            <div className="flex gap-2">
              <textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder={tSidebar("addNotePlaceholder")}
                rows={2}
                className="flex-1 resize-none rounded-lg border border-border bg-muted px-3 py-2 text-xs text-foreground placeholder-muted-foreground outline-none focus:border-primary/50"
              />
              <Button
                size="sm"
                className="h-auto bg-primary px-2 hover:bg-primary/90"
                onClick={handleAddNote}
                disabled={!newNote.trim() || addingNote}
              >
                <Plus className="h-3 w-3" />
              </Button>
            </div>

            <div className="space-y-2">
              {notes.length === 0 ? (
                <p className="px-1 text-xs text-muted-foreground">{tSidebar("noNotes")}</p>
              ) : (
                notes.map((note) => (
                  <div key={note.id} className="rounded-lg bg-muted px-3 py-2">
                    <p className="whitespace-pre-wrap text-xs text-muted-foreground">
                      {note.note_text}
                    </p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {format(new Date(note.created_at), "MMM d, yyyy HH:mm")}
                    </p>
                  </div>
                ))
              )}
            </div>
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}
