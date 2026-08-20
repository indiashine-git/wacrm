"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ExternalLink, Send, RefreshCw, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";

interface MetaFlow {
  id: string;
  name: string;
  status: string;
  categories: string[];
}

interface DraftField {
  name: string;
  label: string;
  inputType: "text" | "number" | "email" | "phone";
}

const statusColors: Record<string, string> = {
  PUBLISHED: "bg-emerald-600/20 text-emerald-400 border-emerald-600/30",
  DRAFT: "bg-slate-600/20 text-slate-400 border-slate-600/30",
  DEPRECATED: "bg-red-600/20 text-red-400 border-red-600/30",
};

const CATEGORIES = [
  "LEAD_GENERATION",
  "CONTACT_US",
  "CUSTOMER_SUPPORT",
  "APPOINTMENT_BOOKING",
  "SURVEY",
  "SIGN_UP",
  "SIGN_IN",
  "SHOPPING",
  "OTHER",
];

const INPUT_TYPES: DraftField["inputType"][] = ["text", "number", "email", "phone"];

function emptyField(): DraftField {
  return { name: "", label: "", inputType: "text" };
}

function toScreenId(name: string): string {
  return (
    name
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "SCREEN"
  );
}

export default function MetaFlowsPage() {
  const [loading, setLoading] = useState(true);
  const [flows, setFlows] = useState<MetaFlow[]>([]);

  const [sendTarget, setSendTarget] = useState<MetaFlow | null>(null);
  const [to, setTo] = useState("");
  const [screen, setScreen] = useState("");
  const [flowCta, setFlowCta] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [sending, setSending] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftCategory, setDraftCategory] = useState("LEAD_GENERATION");
  const [draftFooterLabel, setDraftFooterLabel] = useState("Submit");
  const [draftFields, setDraftFields] = useState<DraftField[]>([emptyField()]);
  const [creating, setCreating] = useState(false);

  async function fetchFlows() {
    try {
      setLoading(true);
      const res = await fetch("/api/whatsapp/flows");
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Failed (HTTP ${res.status})`);
      setFlows(data.flows || []);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load flows");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchFlows();
  }, []);

  async function openPreview(flow: MetaFlow) {
    try {
      const res = await fetch(`/api/whatsapp/flows/${flow.id}/preview`);
      const data = await res.json();
      if (!res.ok || !data.previewUrl) {
        throw new Error(data?.error || "No preview available");
      }
      window.open(data.previewUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to open preview");
    }
  }

  function openSendDialog(flow: MetaFlow) {
    setSendTarget(flow);
    setTo("");
    setScreen("");
    setFlowCta("Get Started");
    setBodyText("");
  }

  async function handleSend() {
    if (!sendTarget) return;
    setSending(true);
    try {
      const res = await fetch("/api/whatsapp/flows/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, flowId: sendTarget.id, screen, flowCta, bodyText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Send failed (HTTP ${res.status})`);
      toast.success("Flow sent");
      setSendTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send flow");
    } finally {
      setSending(false);
    }
  }

  function openCreateDialog() {
    setDraftName("");
    setDraftCategory("LEAD_GENERATION");
    setDraftFooterLabel("Submit");
    setDraftFields([emptyField()]);
    setCreateOpen(true);
  }

  function updateField(index: number, patch: Partial<DraftField>) {
    setDraftFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function addField() {
    setDraftFields((prev) => [...prev, emptyField()]);
  }

  function removeField(index: number) {
    setDraftFields((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreate() {
    const fields = draftFields
      .map((f) => ({ ...f, name: f.name.trim(), label: f.label.trim() }))
      .filter((f) => f.name && f.label);
    if (!draftName.trim() || fields.length === 0) return;

    setCreating(true);
    try {
      const res = await fetch("/api/whatsapp/flows/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draftName.trim(),
          categories: [draftCategory],
          screenId: toScreenId(draftName),
          fields,
          footerLabel: draftFooterLabel.trim() || "Submit",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `Create failed (HTTP ${res.status})`);
      toast.success("Flow created and published");
      setCreateOpen(false);
      await fetchFlows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create flow");
    } finally {
      setCreating(false);
    }
  }

  const createDisabled =
    creating ||
    !draftName.trim() ||
    draftFields.filter((f) => f.name.trim() && f.label.trim()).length === 0;

  return (
    <section className="animate-in fade-in-50 space-y-4 duration-200">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Flows</h1>
          <p className="text-sm text-muted-foreground">
            Real Meta WhatsApp Flows — native in-chat forms with actual screens and
            fields, rendered inside WhatsApp itself.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={fetchFlows} disabled={loading}>
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button onClick={openCreateDialog}>
            <Plus className="size-4" />
            Create Flow
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="size-6 animate-spin text-primary" />
        </div>
      ) : flows.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <p className="text-sm text-muted-foreground">No Flows yet.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Click &quot;Create Flow&quot; to publish your first one.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          {flows.map((flow) => (
            <Card key={flow.id}>
              <CardContent className="flex items-start justify-between pt-4">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-medium text-foreground">{flow.name}</h3>
                    <Badge
                      className={`text-xs border ${statusColors[flow.status] || ""}`}
                    >
                      {flow.status}
                    </Badge>
                    {flow.categories.map((cat) => (
                      <span
                        key={cat}
                        className="text-[10px] uppercase text-muted-foreground"
                      >
                        {cat}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">ID: {flow.id}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="sm" onClick={() => openPreview(flow)}>
                    <ExternalLink className="size-3.5" />
                    Preview
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openSendDialog(flow)}
                    disabled={flow.status !== "PUBLISHED"}
                    title={
                      flow.status !== "PUBLISHED"
                        ? "Only published flows can be sent"
                        : undefined
                    }
                  >
                    <Send className="size-3.5" />
                    Send
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Send dialog */}
      <Dialog open={sendTarget !== null} onOpenChange={(open) => !open && setSendTarget(null)}>
        <DialogContent className="bg-popover border-border sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">
              Send &quot;{sendTarget?.name}&quot;
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Opens as a native form inside the customer&apos;s WhatsApp.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Recipient phone (with country code)</Label>
              <Input
                value={to}
                onChange={(e) => setTo(e.target.value)}
                placeholder="919893049006"
                className="bg-muted border-border text-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Entry screen id</Label>
              <Input
                value={screen}
                onChange={(e) => setScreen(e.target.value)}
                placeholder="e.g. GET_QUOTE"
                className="bg-muted border-border text-foreground"
              />
              <p className="text-[11px] text-muted-foreground">
                The first screen&apos;s id from the Flow JSON.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Button label (CTA)</Label>
              <Input
                value={flowCta}
                onChange={(e) => setFlowCta(e.target.value)}
                maxLength={30}
                className="bg-muted border-border text-foreground"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Message body</Label>
              <Textarea
                value={bodyText}
                onChange={(e) => setBodyText(e.target.value)}
                rows={3}
                className="bg-muted border-border text-foreground resize-none"
              />
            </div>
          </div>
          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setSendTarget(null)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              onClick={handleSend}
              disabled={sending || !to.trim() || !screen.trim() || !flowCta.trim() || !bodyText.trim()}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {sending ? <Loader2 className="size-4 animate-spin" /> : "Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-popover border-border sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-popover-foreground">Create Flow</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Builds a single-screen form and publishes it to Meta immediately —
              ready to send as soon as you save.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Name</Label>
                <Input
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  placeholder="e.g. Book a Demo"
                  className="bg-muted border-border text-foreground"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-muted-foreground">Category</Label>
                <Select value={draftCategory} onValueChange={(v) => v && setDraftCategory(v)}>
                  <SelectTrigger className="w-full bg-muted border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover border-border">
                    {CATEGORIES.map((cat) => (
                      <SelectItem
                        key={cat}
                        value={cat}
                        className="text-popover-foreground focus:bg-muted focus:text-popover-foreground"
                      >
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-muted-foreground">Form fields</Label>
                <Button type="button" variant="outline" size="sm" onClick={addField}>
                  <Plus className="size-3" />
                  Add field
                </Button>
              </div>
              <div className="space-y-2">
                {draftFields.map((field, i) => (
                  <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-2">
                    <Input
                      value={field.label}
                      onChange={(e) => {
                        const label = e.target.value;
                        updateField(i, {
                          label,
                          name: field.name || label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_"),
                        });
                      }}
                      placeholder="Field label, e.g. Business name"
                      className="h-8 flex-1 bg-muted border-border text-foreground text-xs"
                    />
                    <Select
                      value={field.inputType}
                      onValueChange={(v) => v && updateField(i, { inputType: v as DraftField["inputType"] })}
                    >
                      <SelectTrigger className="h-8 w-28 bg-muted border-border text-foreground text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover border-border">
                        {INPUT_TYPES.map((t) => (
                          <SelectItem
                            key={t}
                            value={t}
                            className="text-popover-foreground focus:bg-muted focus:text-popover-foreground text-xs"
                          >
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeField(i)}
                      disabled={draftFields.length === 1}
                      className="size-7 text-muted-foreground hover:text-red-400"
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-muted-foreground">Submit button label</Label>
              <Input
                value={draftFooterLabel}
                onChange={(e) => setDraftFooterLabel(e.target.value)}
                maxLength={30}
                className="bg-muted border-border text-foreground"
              />
            </div>
          </div>

          <DialogFooter className="bg-popover border-border">
            <Button
              variant="outline"
              onClick={() => setCreateOpen(false)}
              className="border-border text-muted-foreground hover:bg-muted"
            >
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createDisabled}
              className="bg-primary hover:bg-primary/90 text-primary-foreground"
            >
              {creating ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Publishing...
                </>
              ) : (
                "Create & Publish"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
