"use client"

import { use, useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { ArrowLeft, Loader2, ChevronDown, ChevronRight } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { formatRelative } from "@/lib/automations/trigger-meta"

interface FlowRun {
  id: string
  to_phone: string
  status: "sent" | "submitted" | "failed"
  submitted_fields: Record<string, string> | null
  sent_at: string
  submitted_at: string | null
  contacts: { name: string | null } | null
}

/**
 * wacrm's own send/submission history for a real Meta WhatsApp Flow --
 * Meta has no run-count or execution-log API for Flows, only publish
 * status. This mirrors the Automations logs page so the two products
 * feel consistent, but every row here comes from wacrm's own
 * flow_sends table, not Meta.
 */
export default function FlowLogsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const router = useRouter()
  const searchParams = useSearchParams()
  const flowName = searchParams.get("name")

  const [runs, setRuns] = useState<FlowRun[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openRunId, setOpenRunId] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/whatsapp/flows/${id}/runs`)
        const data = await res.json()
        if (!res.ok) throw new Error(data?.error || `Failed (HTTP ${res.status})`)
        setRuns(data.runs || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load run log")
      }
    }
    load()
  }, [id])

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3">
        <p className="text-sm text-red-400">{error}</p>
        <Button variant="outline" onClick={() => router.push("/meta-flows")}>
          Back
        </Button>
      </div>
    )
  }

  if (runs === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => router.push("/meta-flows")}
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Back to Flows"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{flowName ?? "Flow"}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Run log — WATU&apos;s own send/submission history (Meta doesn&apos;t provide this for Flows)
          </p>
        </div>
      </div>

      {runs.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40">
          <p className="text-sm text-foreground">No sends yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Send this flow to a contact to see it show up here.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {runs.map((run) => {
            const isOpen = openRunId === run.id
            const statusClass =
              run.status === "submitted"
                ? "border-primary/30 bg-primary/10 text-primary"
                : run.status === "failed"
                  ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-300"
                  : "border-border bg-muted text-muted-foreground"
            return (
              <li key={run.id} className="rounded-xl border border-border bg-card">
                <button
                  type="button"
                  onClick={() => setOpenRunId(isOpen ? null : run.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <Badge variant="outline" className={cn("shrink-0 text-[11px]", statusClass)}>
                    {run.status}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">
                      {run.contacts?.name || run.to_phone}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      Sent {formatRelative(run.sent_at)}
                      {run.submitted_at ? ` · submitted ${formatRelative(run.submitted_at)}` : ""}
                    </div>
                  </div>
                </button>
                {isOpen && (
                  <div className="border-t border-border px-4 py-3">
                    {run.submitted_fields ? (
                      <dl className="space-y-1">
                        {Object.entries(run.submitted_fields).map(([key, value]) => (
                          <div key={key} className="flex gap-2 text-xs">
                            <dt className="shrink-0 text-muted-foreground">{key}:</dt>
                            <dd className="truncate text-foreground">{String(value)}</dd>
                          </div>
                        ))}
                      </dl>
                    ) : (
                      <p className="text-xs text-muted-foreground">Not submitted yet.</p>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
