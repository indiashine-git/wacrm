"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Contact, CustomField, MessageTemplate } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatWhatsAppText } from "@/lib/whatsapp/format-text";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  ChevronRight,
  LayoutTemplate,
  Loader2,
  Search,
} from "lucide-react";
import { extractVariableIndices } from "@/lib/whatsapp/template-validators";
import { useTranslations } from "next-intl";

export interface TemplateSendValues {
  body: string[];
  headerText?: string;
  buttonParams?: Record<number, string>;
}

interface TemplatePickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (template: MessageTemplate, values: TemplateSendValues) => void;
  /** This thread's contact -- lets each placeholder map to their real name/phone/email/custom fields, same as the broadcast wizard's Personalize step. */
  contact?: Contact | null;
}

type VariableType = "static" | "field" | "custom_field";

interface VariableMapping {
  type: VariableType;
  /** Static text, or the contact-field key ("name"/"phone"/"email"/"company"), or a custom_field id. */
  value: string;
}

const CONTACT_FIELDS: { value: keyof Contact; label: string }[] = [
  { value: "name", label: "Name" },
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "company", label: "Company" },
];

function emptyMapping(): VariableMapping {
  return { type: "static", value: "" };
}

/** Resolve a mapping to its final string value for this contact -- mirrors the broadcast wizard's substitution logic. */
function resolveMapping(
  mapping: VariableMapping,
  contact: Contact | null | undefined,
  customValues: Map<string, string>,
): string {
  if (mapping.type === "static") return mapping.value;
  if (mapping.type === "field") {
    const raw = contact?.[mapping.value as keyof Contact];
    return typeof raw === "string" ? raw : "";
  }
  return customValues.get(mapping.value) ?? "";
}

function renderBodyPreview(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, raw) => {
    const idx = Number(raw) - 1;
    const value = params[idx];
    return value && value.trim().length > 0 ? value : `{{${raw}}}`;
  });
}

interface UrlButtonSlot {
  index: number;
  text: string;
  url: string;
}

/**
 * Templates may need values for: body variables, a text-header
 * variable, and per-URL-button suffixes. Collect them all so the
 * send-message path doesn't 400 on missing parameters.
 */
function collectVariableSlots(template: MessageTemplate): {
  bodyVars: number[];
  headerVarCount: number;
  urlButtonSlots: UrlButtonSlot[];
} {
  const bodyVars = extractVariableIndices(template.body_text);
  const headerVarCount =
    template.header_type === "text" && template.header_content
      ? extractVariableIndices(template.header_content).length
      : 0;
  const urlButtonSlots: UrlButtonSlot[] = [];
  (template.buttons ?? []).forEach((b, i) => {
    if (b.type === "URL" && extractVariableIndices(b.url).length > 0) {
      urlButtonSlots.push({ index: i, text: b.text, url: b.url });
    }
  });
  return { bodyVars, headerVarCount, urlButtonSlots };
}

/** Type + Value mapping row -- same shape as the broadcast wizard's Personalize step, one contact resolved instead of many. */
function MappingRow({
  label,
  mapping,
  onChange,
  customFields,
  staticPlaceholder,
}: {
  label: string;
  mapping: VariableMapping;
  onChange: (patch: Partial<VariableMapping>) => void;
  customFields: CustomField[];
  staticPlaceholder: string;
}) {
  return (
    <div className="space-y-1.5 rounded-md border border-border bg-background/50 p-3">
      <Label className="text-xs text-popover-foreground">{label}</Label>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Select
          value={mapping.type}
          onValueChange={(val) => onChange({ type: val as VariableType, value: "" })}
        >
          <SelectTrigger className="w-full border-border bg-muted text-foreground">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="border-border bg-popover">
            <SelectItem value="static" className="text-popover-foreground focus:bg-muted focus:text-popover-foreground">
              Static Value
            </SelectItem>
            <SelectItem value="field" className="text-popover-foreground focus:bg-muted focus:text-popover-foreground">
              Contact Field
            </SelectItem>
            <SelectItem value="custom_field" className="text-popover-foreground focus:bg-muted focus:text-popover-foreground">
              Custom Field
            </SelectItem>
          </SelectContent>
        </Select>

        {mapping.type === "static" ? (
          <Input
            value={mapping.value}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder={staticPlaceholder}
            className="border-border bg-muted text-foreground placeholder:text-muted-foreground"
          />
        ) : mapping.type === "field" ? (
          <Select value={mapping.value || undefined} onValueChange={(val) => onChange({ value: val || "" })}>
            <SelectTrigger className="w-full border-border bg-muted text-foreground">
              <SelectValue placeholder="Select contact field…" />
            </SelectTrigger>
            <SelectContent className="border-border bg-popover">
              {CONTACT_FIELDS.map((f) => (
                <SelectItem key={f.value} value={f.value} className="text-popover-foreground focus:bg-muted focus:text-popover-foreground">
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Select value={mapping.value || undefined} onValueChange={(val) => onChange({ value: val || "" })}>
            <SelectTrigger className="w-full border-border bg-muted text-foreground">
              <SelectValue placeholder={customFields.length === 0 ? "No custom fields" : "Select custom field…"} />
            </SelectTrigger>
            <SelectContent className="border-border bg-popover">
              {customFields.map((f) => (
                <SelectItem key={f.id} value={f.id} className="text-popover-foreground focus:bg-muted focus:text-popover-foreground">
                  {f.field_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );
}

export function TemplatePicker({
  open,
  onOpenChange,
  onSelect,
  contact,
}: TemplatePickerProps) {
  const t = useTranslations("Inbox.templatePicker");

  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [sort, setSort] = useState<"newest" | "oldest" | "name">("newest");
  const [selected, setSelected] = useState<MessageTemplate | null>(null);
  const [headerMapping, setHeaderMapping] = useState<VariableMapping>(emptyMapping());
  const [bodyMappings, setBodyMappings] = useState<VariableMapping[]>([]);
  const [buttonMappings, setButtonMappings] = useState<Record<number, VariableMapping>>({});

  const [customFields, setCustomFields] = useState<CustomField[]>([]);
  const [customValues, setCustomValues] = useState<Map<string, string>>(new Map());

  // This contact's custom-field values -- lets a placeholder map to
  // "Custom Field" the same way the broadcast wizard's Personalize step
  // does, not just the built-in name/phone/email/company.
  useEffect(() => {
    if (!open || !contact) return;
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const [fieldsRes, valuesRes] = await Promise.all([
        supabase.from("custom_fields").select("*").order("field_name"),
        supabase
          .from("contact_custom_values")
          .select("custom_field_id, value")
          .eq("contact_id", contact.id),
      ]);
      if (cancelled) return;
      setCustomFields(fieldsRes.data ?? []);
      const map = new Map<string, string>();
      for (const row of valuesRes.data ?? []) {
        map.set(row.custom_field_id, row.value ?? "");
      }
      setCustomValues(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, contact]);

  const resolvedHeaderText = useMemo(
    () => resolveMapping(headerMapping, contact, customValues),
    [headerMapping, contact, customValues],
  );
  const resolvedParams = useMemo(
    () => bodyMappings.map((m) => resolveMapping(m, contact, customValues)),
    [bodyMappings, contact, customValues],
  );
  const resolvedButtonParams = useMemo(() => {
    const out: Record<number, string> = {};
    for (const [idx, mapping] of Object.entries(buttonMappings)) {
      out[Number(idx)] = resolveMapping(mapping, contact, customValues);
    }
    return out;
  }, [buttonMappings, contact, customValues]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    (async () => {
      setLoading(true);
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        if (!cancelled) {
          setTemplates([]);
          setLoading(false);
        }
        return;
      }

      // Scope by RLS (message_templates_select → is_account_member), NOT by
      // user_id. Templates are account-owned, so filtering on the caller's
      // user_id hid templates that a teammate created — leaving them unable
      // to send approved templates in a shared account.
      const { data, error } = await supabase
        .from("message_templates")
        .select("*")
        .eq("status", "APPROVED")
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        console.error("Failed to fetch templates:", error);
        setTemplates([]);
      } else {
        setTemplates((data as MessageTemplate[]) ?? []);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  function resetSelection() {
    setSelected(null);
    setBodyMappings([]);
    setHeaderMapping(emptyMapping());
    setButtonMappings({});
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetSelection();
    onOpenChange(next);
  }

  function pickTemplate(template: MessageTemplate) {
    const slots = collectVariableSlots(template);
    const noInputsNeeded =
      slots.bodyVars.length === 0 &&
      slots.headerVarCount === 0 &&
      slots.urlButtonSlots.length === 0;
    if (noInputsNeeded) {
      onSelect(template, { body: [] });
      handleOpenChange(false);
      return;
    }
    setSelected(template);
    setBodyMappings(new Array(slots.bodyVars.length).fill(null).map(emptyMapping));
    setHeaderMapping(emptyMapping());
    setButtonMappings({});
  }

  function confirm() {
    if (!selected) return;
    const values: TemplateSendValues = { body: resolvedParams.map((v) => v.trim()) };
    if (resolvedHeaderText.trim()) values.headerText = resolvedHeaderText.trim();
    if (Object.keys(resolvedButtonParams).length > 0) {
      values.buttonParams = Object.fromEntries(
        Object.entries(resolvedButtonParams).map(([k, v]) => [Number(k), v.trim()]),
      );
    }
    onSelect(selected, values);
    handleOpenChange(false);
  }

  const templateCategories = useMemo(
    () => Array.from(new Set(templates.map((tpl) => tpl.category))).sort(),
    [templates],
  );

  const visibleTemplates = useMemo(() => {
    const query = search.trim().toLowerCase();
    let list = templates.filter((tpl) => {
      if (categoryFilter !== "all" && tpl.category !== categoryFilter) return false;
      if (!query) return true;
      return (
        tpl.name.toLowerCase().includes(query) ||
        (tpl.body_text ?? "").toLowerCase().includes(query)
      );
    });
    list = [...list].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      const aTime = new Date(a.created_at).getTime();
      const bTime = new Date(b.created_at).getTime();
      return sort === "oldest" ? aTime - bTime : bTime - aTime;
    });
    return list;
  }, [templates, search, categoryFilter, sort]);

  const slots = useMemo(
    () => (selected ? collectVariableSlots(selected) : null),
    [selected],
  );
  const canConfirm =
    !!selected &&
    !!slots &&
    slots.bodyVars.every((_, i) => (resolvedParams[i] ?? "").trim().length > 0) &&
    (slots.headerVarCount === 0 || resolvedHeaderText.trim().length > 0) &&
    slots.urlButtonSlots.every(
      (s) => (resolvedButtonParams[s.index] ?? "").trim().length > 0,
    );

  function updateHeaderMapping(patch: Partial<VariableMapping>) {
    setHeaderMapping((prev) => ({ ...prev, ...patch }));
  }
  function updateBodyMapping(i: number, patch: Partial<VariableMapping>) {
    setBodyMappings((prev) => prev.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  }
  function updateButtonMapping(index: number, patch: Partial<VariableMapping>) {
    setButtonMappings((prev) => ({
      ...prev,
      [index]: { ...(prev[index] ?? emptyMapping()), ...patch },
    }));
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="border-border bg-popover sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-popover-foreground">
            <LayoutTemplate className="h-4 w-4 text-primary" />
            {selected ? selected.name : t("sendTemplate")}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {selected
              ? t("fillPlaceholders")
              : t("pickTemplate")}
          </DialogDescription>
        </DialogHeader>

        {!selected ? (
          <div className="space-y-2">
            {!loading && templates.length > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[140px] flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={t("searchPlaceholder")}
                    className="h-8 border-border bg-muted pl-8 text-xs text-foreground placeholder:text-muted-foreground"
                  />
                </div>
                <Select value={categoryFilter} onValueChange={(v) => setCategoryFilter(v || "all")}>
                  <SelectTrigger className="h-8 w-32 border-border bg-muted text-xs text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-popover">
                    <SelectItem value="all" className="text-popover-foreground focus:bg-muted focus:text-popover-foreground">
                      {t("allCategories")}
                    </SelectItem>
                    {templateCategories.map((cat) => (
                      <SelectItem key={cat} value={cat} className="text-popover-foreground focus:bg-muted focus:text-popover-foreground">
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={sort} onValueChange={(v) => setSort((v || "newest") as typeof sort)}>
                  <SelectTrigger className="h-8 w-28 border-border bg-muted text-xs text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="border-border bg-popover">
                    <SelectItem value="newest" className="text-popover-foreground focus:bg-muted focus:text-popover-foreground">
                      {t("sortNewest")}
                    </SelectItem>
                    <SelectItem value="oldest" className="text-popover-foreground focus:bg-muted focus:text-popover-foreground">
                      {t("sortOldest")}
                    </SelectItem>
                    <SelectItem value="name" className="text-popover-foreground focus:bg-muted focus:text-popover-foreground">
                      {t("sortName")}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="max-h-[52vh] space-y-2 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                </div>
              ) : templates.length === 0 ? (
                <div className="rounded-md border border-border bg-background/50 p-6 text-center">
                  <p className="text-sm text-popover-foreground">{t("noApprovedTemplates")}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t("noApprovedTemplatesHint")}
                  </p>
                </div>
              ) : visibleTemplates.length === 0 ? (
                <div className="rounded-md border border-border bg-background/50 p-6 text-center">
                  <p className="text-sm text-popover-foreground">{t("noMatches")}</p>
                </div>
              ) : (
                visibleTemplates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => pickTemplate(t)}
                  className="w-full rounded-md border border-border bg-background/50 p-3 text-left transition-colors hover:border-primary/40 hover:bg-popover"
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium text-popover-foreground">
                          {t.name}
                        </p>
                        <Badge className="border border-primary/30 bg-primary/20 text-[10px] text-primary">
                          {t.category}
                        </Badge>
                        {t.language && (
                          <span className="text-[10px] uppercase text-muted-foreground">
                            {t.language}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                        {t.body_text}
                      </p>
                    </div>
                    <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                  </div>
                </button>
              ))
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-background/50 p-3">
              <p className="mb-1 text-xs text-muted-foreground">{t("preview")}</p>
              <p className="whitespace-pre-wrap text-sm text-popover-foreground">
                {formatWhatsAppText(renderBodyPreview(selected.body_text, resolvedParams))}
              </p>
              {selected.footer_text && (
                <p className="mt-2 text-xs italic text-muted-foreground">
                  {selected.footer_text}
                </p>
              )}
            </div>
            {slots && slots.headerVarCount > 0 && (
              <MappingRow
                label="Header {{1}}"
                mapping={headerMapping}
                onChange={updateHeaderMapping}
                customFields={customFields}
                staticPlaceholder={t("headerValuePlaceholder")}
              />
            )}
            {slots?.bodyVars.map((v, i) => (
              <MappingRow
                key={v}
                label={`Body {{${v}}}`}
                mapping={bodyMappings[i] ?? emptyMapping()}
                onChange={(patch) => updateBodyMapping(i, patch)}
                customFields={customFields}
                staticPlaceholder={t("bodyValuePlaceholder", { val: `{{${v}}}` })}
              />
            ))}
            {slots?.urlButtonSlots.map((slot) => (
              <div key={slot.index} className="space-y-1">
                <MappingRow
                  label={`URL button "${slot.text}" — value for {{1}}`}
                  mapping={buttonMappings[slot.index] ?? emptyMapping()}
                  onChange={(patch) => updateButtonMapping(slot.index, patch)}
                  customFields={customFields}
                  staticPlaceholder={t("urlSuffixValuePlaceholder")}
                />
                <p className="text-[10px] text-muted-foreground break-all">
                  {t("finalUrl", {
                    url: slot.url.replace(/\{\{1\}\}/g, resolvedButtonParams[slot.index] || "{{1}}"),
                  })}
                </p>
              </div>
            ))}
          </div>
        )}

        <DialogFooter className="gap-2">
          {selected ? (
            <>
              <Button
                variant="outline"
                onClick={resetSelection}
                className="border-border text-popover-foreground hover:bg-muted"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("back")}
              </Button>
              <Button
                disabled={!canConfirm}
                onClick={confirm}
                className="bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {t("send")}
              </Button>
            </>
          ) : (
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              className="border-border text-popover-foreground hover:bg-muted"
            >
              {t("cancel")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
