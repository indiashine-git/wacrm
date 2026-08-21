// ============================================================
// DELETE /api/account/inbound-webhooks/[id] — remove a receiver.
//
// Hard delete: unlike API keys there's no roster value in keeping a
// removed inbound webhook visible, and its receive_count/timestamps
// aren't referenced anywhere else. Admin+, enforced here and by the
// inbound_webhooks_delete RLS policy.
// ============================================================

import { NextResponse } from 'next/server';

import { requireRole, toErrorResponse } from '@/lib/auth/account';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireRole('admin');

    const limit = checkRateLimit(`admin:inboundWebhookDelete:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const { id } = await params;

    const { data, error } = await ctx.supabase
      .from('inbound_webhooks')
      .delete()
      .eq('id', id)
      .eq('account_id', ctx.accountId)
      .select('id')
      .maybeSingle();

    if (error) {
      console.error('[DELETE /api/account/inbound-webhooks/[id]] error:', error);
      return NextResponse.json({ error: 'Failed to delete inbound webhook' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Inbound webhook not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return toErrorResponse(err);
  }
}
