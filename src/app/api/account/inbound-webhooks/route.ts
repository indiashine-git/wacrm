// ============================================================
// /api/account/inbound-webhooks
//
//   GET  — list this account's inbound webhook receivers (safe columns only).
//   POST — create a new one (mints a random secret).
//
// Dashboard-only management (cookie session + RLS), mirroring
// /api/account/api-keys. The receiver endpoint itself
// (/api/v1/inbound/[id]) is separate and unauthenticated by session --
// it's verified by HMAC signature instead, since the caller is an
// external system, not a logged-in user.
//
// The plaintext secret is returned exactly once, in the POST response.
// It's stored encrypted (not hashed) because verifying an inbound
// HMAC signature needs the raw secret, unlike API keys which only
// need a hash comparison.
// ============================================================

import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';

import { getCurrentAccount, requireRole, toErrorResponse } from '@/lib/auth/account';
import { encrypt } from '@/lib/whatsapp/encryption';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';

const MAX_NAME_LEN = 80;
const SAFE_COLUMNS = 'id, name, last_received_at, receive_count, created_at';

/**
 * The reverse proxy in front of this app means `request.url`'s own
 * origin is the internal bind address (e.g. http://0.0.0.0:3000), not
 * the real public domain -- confirmed live (a freshly-created webhook
 * URL rendered as https://0.0.0.0:3000/... in the UI). Trust the
 * actual incoming request's forwarded host instead of
 * NEXT_PUBLIC_SITE_URL, which is stale on this deployment (still set
 * to a pre-rebrand domain).
 */
function resolvePublicOrigin(request: Request): string {
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim();
  if (forwardedHost) return `${forwardedProto || 'https'}://${forwardedHost}`;

  const host = request.headers.get('host')?.trim();
  if (host) return `https://${host}`;

  return new URL(request.url).origin;
}

export async function GET() {
  try {
    const ctx = await getCurrentAccount();
    const { data, error } = await ctx.supabase
      .from('inbound_webhooks')
      .select(SAFE_COLUMNS)
      .eq('account_id', ctx.accountId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[GET /api/account/inbound-webhooks] fetch error:', error);
      return NextResponse.json({ error: 'Failed to load inbound webhooks' }, { status: 500 });
    }
    return NextResponse.json({ webhooks: data ?? [] });
  } catch (err) {
    return toErrorResponse(err);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await requireRole('admin');

    const limit = checkRateLimit(`admin:inboundWebhookCreate:${ctx.userId}`, RATE_LIMITS.adminAction);
    if (!limit.success) return rateLimitResponse(limit);

    const body = (await request.json().catch(() => null)) as { name?: unknown } | null;
    const rawName = typeof body?.name === 'string' ? body.name.trim() : '';
    if (!rawName) {
      return NextResponse.json({ error: "'name' is required" }, { status: 400 });
    }
    if (rawName.length > MAX_NAME_LEN) {
      return NextResponse.json({ error: `Name must be ${MAX_NAME_LEN} characters or fewer` }, { status: 400 });
    }

    const secret = randomBytes(32).toString('base64url');

    const { data, error } = await ctx.supabase
      .from('inbound_webhooks')
      .insert({
        account_id: ctx.accountId,
        created_by: ctx.userId,
        name: rawName,
        secret_encrypted: encrypt(secret),
      })
      .select(SAFE_COLUMNS)
      .single();

    if (error || !data) {
      console.error('[POST /api/account/inbound-webhooks] insert error:', error);
      return NextResponse.json({ error: 'Failed to create inbound webhook' }, { status: 500 });
    }

    return NextResponse.json(
      {
        webhook: data,
        secret,
        url: `${resolvePublicOrigin(request)}/api/v1/inbound/${data.id}`,
      },
      { status: 201 },
    );
  } catch (err) {
    return toErrorResponse(err);
  }
}
