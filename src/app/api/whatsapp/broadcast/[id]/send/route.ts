// ============================================================
// POST /api/whatsapp/broadcast/[id]/send
//
// Fires a `draft` or `scheduled` broadcast now, from the detail page's
// "Send now" button. Resolves the audience server-side first if it
// wasn't locked at save time. Mirrors the resume route's fast-response
// shape: 202 as soon as the pass is claimed and planned, delivery runs
// in `after()`.
// ============================================================

import { NextResponse } from "next/server";
import { after } from "next/server";

import { requireRole, toErrorResponse } from "@/lib/auth/account";
import { BroadcastError, deliverBroadcast, finalizeBroadcastStatus } from "@/lib/whatsapp/broadcast-core";
import { releaseBroadcastDelivery } from "@/lib/whatsapp/broadcast-resume";
import { prepareFire } from "@/lib/whatsapp/broadcast-fire";
import { supabaseAdmin } from "@/lib/flows/admin-client";
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from "@/lib/rate-limit";

export const maxDuration = 300;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, accountId, userId } = await requireRole("agent");

    const limit = checkRateLimit(`broadcast-send:${userId}`, RATE_LIMITS.broadcast);
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await params;

    const prepared = await prepareFire(supabase, accountId, id);

    const admin = supabaseAdmin();
    after(async () => {
      try {
        await deliverBroadcast(admin, prepared.plan);
      } catch (err) {
        console.error(
          "[broadcast-send] delivery threw:",
          err instanceof Error ? err.message : err,
        );
        await finalizeBroadcastStatus(admin, id).catch(() => {});
      } finally {
        await releaseBroadcastDelivery(admin, id);
      }
    });

    return NextResponse.json(
      {
        success: true,
        broadcast_id: id,
        resolved: prepared.resolvedNow,
        sending: prepared.plan.planned.length,
        remaining: prepared.remaining,
        unsendable: prepared.unsendable,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof BroadcastError) {
      return NextResponse.json(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }
    console.error("Error in broadcast send POST:", error);
    return toErrorResponse(error);
  }
}
