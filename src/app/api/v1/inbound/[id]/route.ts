// ============================================================
// POST /api/v1/inbound/{id} — inbound webhook receiver.
//
// The other side of the platform: v1 routes elsewhere let an
// external system pull/push via an API key; this lets one push TO
// WATU without any WATU-issued credential on their end, only a
// shared secret verified as an HMAC signature -- the same contract
// Shopify/WooCommerce/Zapier-style webhooks use.
//
// Request contract:
//   Header: X-WATU-Signature: hex(HMAC-SHA256(rawBody, secret))
//   Body:   { "event": "contact.upsert", "data": { "phone": "...", ... } }
//
// `event` is a small, deliberately-open switch -- adding a new event
// type (e.g. "order.create") is one case here, not a new endpoint.
// Specific vendor connectors (Shopify, WooCommerce) built later map
// that vendor's own payload shape into this contract before calling
// in, so this route never needs to know about any specific vendor.
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { decrypt } from '@/lib/whatsapp/encryption';
import { findOrCreateContact, resolveAuditUserId, ContactError } from '@/lib/api/v1/contacts';
import { checkRateLimit, rateLimitResponse, RATE_LIMITS } from '@/lib/rate-limit';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Best-effort receive-count/last-received bump. Never blocks the actual webhook processing on failure. */
async function recordReceipt(db: SupabaseClient, webhookId: string, currentCount: number) {
  await db
    .from('inbound_webhooks')
    .update({ last_received_at: new Date().toISOString(), receive_count: currentCount + 1 })
    .eq('id', webhookId);
}

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function timingSafeHexEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminClient();

  const limit = checkRateLimit(`inbound-webhook:${id}`, RATE_LIMITS.inboundWebhook);
  if (!limit.success) return rateLimitResponse(limit);

  const { data: hook, error: hookErr } = await db
    .from('inbound_webhooks')
    .select('id, account_id, secret_encrypted, receive_count')
    .eq('id', id)
    .maybeSingle();
  if (hookErr || !hook) {
    return NextResponse.json({ error: { code: 'not_found', message: 'Unknown webhook' } }, { status: 404 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-watu-signature') ?? '';
  if (!signature) {
    return NextResponse.json({ error: { code: 'unauthorized', message: 'Missing X-WATU-Signature header' } }, { status: 401 });
  }

  let secret: string;
  try {
    secret = decrypt(hook.secret_encrypted as string);
  } catch (err) {
    console.error('[inbound-webhook] secret decrypt failed:', err);
    return NextResponse.json({ error: { code: 'internal', message: 'Internal error' } }, { status: 500 });
  }

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  if (!timingSafeHexEqual(signature, expected)) {
    return NextResponse.json({ error: { code: 'unauthorized', message: 'Signature mismatch' } }, { status: 401 });
  }

  let body: { event?: unknown; data?: unknown } | null = null;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: { code: 'bad_request', message: 'Body must be valid JSON' } }, { status: 400 });
  }

  const event = typeof body?.event === 'string' ? body.event : '';
  const data = (body?.data ?? {}) as Record<string, unknown>;

  try {
    switch (event) {
      case 'contact.upsert': {
        const phone = typeof data.phone === 'string' ? data.phone.trim() : '';
        if (!phone) {
          return NextResponse.json({ error: { code: 'bad_request', message: "data.phone is required" } }, { status: 400 });
        }
        const auditUserId = await resolveAuditUserId(db, hook.account_id as string);
        const { id: contactId, created } = await findOrCreateContact(
          db,
          hook.account_id as string,
          auditUserId,
          {
            phone,
            name: typeof data.name === 'string' ? data.name : undefined,
            email: typeof data.email === 'string' ? data.email : undefined,
            company: typeof data.company === 'string' ? data.company : undefined,
            contactType: data.contact_type === 'customer' ? 'customer' : undefined,
            source: typeof data.source === 'string' ? data.source : undefined,
            consentGiven: typeof data.consent_given === 'boolean' ? data.consent_given : undefined,
          },
        );

        await recordReceipt(db, id, (hook.receive_count as number) ?? 0);

        return NextResponse.json({ data: { contact_id: contactId, created } }, { status: created ? 201 : 200 });
      }
      default:
        return NextResponse.json(
          { error: { code: 'bad_request', message: `Unsupported event "${event}". Supported: contact.upsert` } },
          { status: 400 },
        );
    }
  } catch (err) {
    if (err instanceof ContactError) {
      return NextResponse.json({ error: { code: 'bad_request', message: err.message } }, { status: err.status });
    }
    console.error('[inbound-webhook] processing failed:', err);
    return NextResponse.json({ error: { code: 'internal', message: 'Failed to process webhook' } }, { status: 500 });
  }
}
