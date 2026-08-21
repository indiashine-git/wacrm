// ============================================================
// POST /api/webhooks/razorpay/{accountId} — Razorpay payment-link
// auto-confirm (roadmap item 9, parked earlier tonight).
//
// Razorpay signs webhook bodies with a webhook secret distinct from
// the API key/secret pair -- generated separately in their dashboard
// under Settings -> Webhooks, pasted into Settings -> Commerce here.
// Verified the same way as WATU's own inbound webhooks: HMAC-SHA256
// over the raw body.
//
// Listens for `payment_link.paid` and marks the matching order paid
// by razorpay_payment_link_id (captured when the link was created --
// the short_url alone isn't in the webhook payload).
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/whatsapp/encryption'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function timingSafeHexEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

export async function POST(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params
  const db = adminClient()

  const { data: commerce, error: commerceErr } = await db
    .from('commerce_config')
    .select('razorpay_webhook_secret')
    .eq('account_id', accountId)
    .maybeSingle()
  if (commerceErr || !commerce?.razorpay_webhook_secret) {
    return NextResponse.json({ error: { code: 'not_configured', message: 'Razorpay webhook not set up for this account' } }, { status: 404 })
  }

  const rawBody = await request.text()
  const signature = request.headers.get('x-razorpay-signature') ?? ''
  if (!signature) {
    return NextResponse.json({ error: { code: 'unauthorized', message: 'Missing X-Razorpay-Signature header' } }, { status: 401 })
  }

  let secret: string
  try {
    secret = decrypt(commerce.razorpay_webhook_secret)
  } catch (err) {
    console.error('[razorpay-webhook] secret decrypt failed:', err)
    return NextResponse.json({ error: { code: 'internal', message: 'Internal error' } }, { status: 500 })
  }

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
  if (!timingSafeHexEqual(signature, expected)) {
    return NextResponse.json({ error: { code: 'unauthorized', message: 'Signature mismatch' } }, { status: 401 })
  }

  let body: { event?: string; payload?: { payment_link?: { entity?: { id?: string } } } } | null = null
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: { code: 'bad_request', message: 'Body must be valid JSON' } }, { status: 400 })
  }

  if (body?.event !== 'payment_link.paid') {
    // Real, valid Razorpay events we don't act on (e.g. payment_link.expired,
    // payment_link.partially_paid) -- 200 so Razorpay doesn't retry.
    return NextResponse.json({ received: true, handled: false })
  }

  const linkId = body.payload?.payment_link?.entity?.id
  if (!linkId) {
    return NextResponse.json({ error: { code: 'bad_request', message: 'Missing payload.payment_link.entity.id' } }, { status: 400 })
  }

  const { data: order, error: orderErr } = await db
    .from('orders')
    .update({ payment_status: 'paid' })
    .eq('account_id', accountId)
    .eq('razorpay_payment_link_id', linkId)
    .neq('payment_status', 'paid')
    .select('id')
    .maybeSingle()

  if (orderErr) {
    console.error('[razorpay-webhook] update failed:', orderErr)
    return NextResponse.json({ error: { code: 'internal', message: 'Failed to update order' } }, { status: 500 })
  }

  return NextResponse.json({ received: true, handled: !!order, order_id: order?.id ?? null })
}
