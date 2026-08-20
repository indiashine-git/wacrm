"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ExternalLink, Send, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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

const statusColors: Record<string, string> = {
  PUBLISHED: "bg-emerald-600/20 text-emerald-400 border-emerald-600/30",
  DRAFT: "bg-slate-600/20 text-slate-400 border-slate-600/30",
  DEPRECATED: "bg-red-600/20 text-red-400 border-red-600/30",
};

export default function MetaFlowsPage() {
  const [loading, setLoading] = useState(true);
  const [flows, setFlows] = useState<MetaFlow[]>([]);
  const [sendTarget, setSendTarget] = useState<MetaFlow | null>(null);
  const [to, setTo] = useState("");
  const [screen, setScreen] = useState("");
  const [flowCta, setFlowCta] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [sending, setSending] = useState(false);

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
        body: JSON.stringify({
          to,
          flowId: sendTarget.id,
          screen,
          flowCta,
          bodyText,
        }),
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

  return (
    <section className="animate-in fade-in-50 space-y-4 duration-200">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Flows</h1>
          <p className="text-sm text-muted-foreground">
            Real Meta WhatsApp Flows — native in-chat forms with actual screens and
            fields, rendered inside WhatsApp itself. Different from the Chatbot
            builder, which uses ordinary chat messages.
          </p>
        </div>
        <Button variant="outline" onClick={fetchFlows} disabled={loading}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
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
              Flows are created via the Meta API — ask an engineer to publish one for
              your use case.
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
    </section>
  );
}
