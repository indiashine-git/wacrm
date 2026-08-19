// ============================================================
// GET /api/whatsapp/broadcast/cron
//
// Fires every `scheduled` broadcast whose scheduled_at has passed.
// Meant to be hit on a schedule (system crontab / external pinger) —
// requires a shared secret via the `x-cron-secret` header, matching
// `AUTOMATION_CRON_SECRET` (reused from the automations cron rather
// than a second secret to manage).
//
// Each due broadcast is fired via the same claim-before-send machinery
// the manual "Send now" / resume paths use, so a broadcast that's
// somehow already mid-send (claimed) is skipped rather than
// double-sent, and one broadcast's failure never blocks the rest.
// ============================================================

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/flows/admin-client";
import { BroadcastError } from "@/lib/whatsapp/broadcast-core";
import { fireBroadcastAndWait } from "@/lib/whatsapp/broadcast-fire";

export const maxDuration = 300;

// Broadcasts can have many recipients each — capped lower than the
// automations cron's 50 so one invocation can't try to sequentially
// deliver an unbounded amount of work within maxDuration. Whatever's
// left over is picked up on the next tick (every 5 min).
const BATCH_LIMIT = 20;

export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "cron not configured" }, { status: 503 });
  }
  const supplied = request.headers.get("x-cron-secret") ?? "";
  const suppliedBuf = Buffer.from(supplied);
  const expectedBuf = Buffer.from(expected);
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = supabaseAdmin();
  const { data: due, error } = await admin
    .from("broadcasts")
    .select("id, account_id")
    .eq("status", "scheduled")
    .lte("scheduled_at", new Date().toISOString())
    .order("scheduled_at", { ascending: true })
    .limit(BATCH_LIMIT);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!due || due.length === 0) return NextResponse.json({ fired: 0, results: [] });

  const results: { broadcastId: string; ok: boolean; error?: string }[] = [];
  for (const row of due) {
    try {
      await fireBroadcastAndWait(admin, row.account_id, row.id);
      results.push({ broadcastId: row.id, ok: true });
    } catch (err) {
      const message =
        err instanceof BroadcastError
          ? err.message
          : err instanceof Error
            ? err.message
            : "Unknown error";
      console.error(`[broadcast-cron] failed to fire ${row.id}:`, message);
      results.push({ broadcastId: row.id, ok: false, error: message });
    }
  }

  return NextResponse.json({
    fired: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    results,
  });
}
