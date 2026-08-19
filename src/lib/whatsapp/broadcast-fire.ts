// Fires a `draft` or `scheduled` broadcast: resolves its audience if it
// wasn't locked at save time, then hands off to the exact same claim →
// plan → deliver machinery the resume/retry path already uses (issue
// #472) — so a scheduled send and a manual "Send now" behave
// identically, including the single-writer claim that makes
// double-sending impossible even if the cron and a button click race.

import type { SupabaseClient } from "@supabase/supabase-js";

import { BroadcastError, deliverBroadcast, finalizeBroadcastStatus, type BroadcastPlan } from "@/lib/whatsapp/broadcast-core";
import {
  claimBroadcastDelivery,
  markBroadcastSending,
  planBroadcastResume,
  releaseBroadcastDelivery,
} from "@/lib/whatsapp/broadcast-resume";
import {
  resolveAndInsertRecipients,
  type ServerAudienceFilter,
} from "@/lib/whatsapp/broadcast-audience-server";
import type { VariableMapping } from "@/lib/whatsapp/broadcast-variables";

export interface PreparedFire {
  plan: BroadcastPlan;
  resolvedNow: number | null;
  remaining: number;
  unsendable: number;
}

/**
 * Claims the delivery lock, resolving the audience first if it wasn't
 * locked at save time, and plans the send — everything up to but not
 * including the actual Meta calls. Throws {@link BroadcastError} on any
 * failure, and the delivery lock is released automatically before
 * throwing (so a failed prepare never leaves a broadcast stuck locked).
 *
 * On success, the caller owns the claim and MUST eventually call
 * {@link deliverBroadcast} followed by
 * {@link releaseBroadcastDelivery} — inline (cron) or inside `after()`
 * (an HTTP route responding fast), same contract as the resume route.
 */
export async function prepareFire(
  db: SupabaseClient,
  accountId: string,
  broadcastId: string,
): Promise<PreparedFire> {
  const { data: broadcast, error: bcError } = await db
    .from("broadcasts")
    .select("id, status, total_recipients, audience_filter, template_variables")
    .eq("id", broadcastId)
    .eq("account_id", accountId)
    .maybeSingle();

  if (bcError || !broadcast) {
    throw new BroadcastError("not_found", "Broadcast not found", 404);
  }
  if (broadcast.status !== "draft" && broadcast.status !== "scheduled") {
    throw new BroadcastError(
      "invalid_state",
      `Broadcast is "${broadcast.status}" — only a draft or scheduled broadcast can be fired.`,
      409,
    );
  }

  const claimed = await claimBroadcastDelivery(db, accountId, broadcastId);
  if (!claimed) {
    throw new BroadcastError(
      "already_running",
      "A delivery pass is already running for this broadcast.",
      409,
    );
  }

  try {
    let resolvedNow: number | null = null;
    if (!broadcast.total_recipients || broadcast.total_recipients === 0) {
      const filter = broadcast.audience_filter as ServerAudienceFilter;
      if (!filter || filter.type === "csv") {
        // A CSV audience is always locked at save time (see
        // createDraftOrScheduled) — zero recipients here means an old,
        // pre-fix draft whose CSV list was never persisted. Nothing to
        // recompute; surface a clear, actionable error instead of
        // silently "sending" to no one.
        throw new BroadcastError(
          "no_recipients",
          "This draft has no saved recipient list (it predates scheduling support, or its audience matched no one). Edit it and reselect the audience, then send or schedule again.",
          400,
        );
      }
      resolvedNow = await resolveAndInsertRecipients(
        db,
        accountId,
        broadcastId,
        filter,
        (broadcast.template_variables ?? {}) as Record<string, VariableMapping>,
      );
    }

    const { plan, remaining, unsendable } = await planBroadcastResume(
      db,
      accountId,
      broadcastId,
      "pending",
    );

    await markBroadcastSending(db, broadcastId);

    return { plan, resolvedNow, remaining, unsendable };
  } catch (err) {
    await releaseBroadcastDelivery(db, broadcastId).catch(() => {});
    throw err;
  }
}

/**
 * Convenience for callers with no reason to split prepare/deliver
 * across a fast HTTP response (the schedule cron) — prepares and
 * delivers in one awaited call, always releasing the claim.
 */
export async function fireBroadcastAndWait(
  db: SupabaseClient,
  accountId: string,
  broadcastId: string,
): Promise<PreparedFire> {
  const prepared = await prepareFire(db, accountId, broadcastId);
  try {
    await deliverBroadcast(db, prepared.plan);
  } catch (err) {
    console.error(
      "[broadcast-fire] delivery threw:",
      err instanceof Error ? err.message : err,
    );
    await finalizeBroadcastStatus(db, broadcastId).catch(() => {});
  } finally {
    await releaseBroadcastDelivery(db, broadcastId);
  }
  return prepared;
}
