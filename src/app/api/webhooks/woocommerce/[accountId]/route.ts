// ============================================================
// POST /api/webhooks/woocommerce/{accountId} — WooCommerce order sync
// (roadmap item 10, WooCommerce slice).
//
// WooCommerce signs each webhook delivery with a secret set in
// WP Admin -> WooCommerce -> Settings -> Advanced -> Webhooks, as
// base64(HMAC-SHA256(rawBody, secret)) in the `X-WC-Webhook-Signature`
// header -- base64, not hex, unlike Razorpay/WATU's own webhooks.
//
// Listens for the `order.created` / `order.updated` topics (set up as
// two separate WooCommerce webhook entries pointing at this same URL
// with the same secret) and upserts into `orders`, keyed by
// `woocommerce_order_id` so repeat deliveries (WooCommerce resends on
// every status change) update the same row instead of duplicating it.
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decrypt } from '@/lib/whatsapp/encryption'
import { findOrCreateContact, resolveAuditUserId } from '@/lib/api/v1/contacts'

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

function timingSafeBase64Equal(a: string, b: string): boolean {
  let bufA: Buffer, bufB: Buffer
  try {
    bufA = Buffer.from(a, 'base64')
    bufB = Buffer.from(b, 'base64')
  } catch {
    return false
  }
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

const PAID_STATUSES = new Set(['processing', 'completed'])

interface WooLineItem {
  product_id?: number
  sku?: string
  name?: string
  quantity?: number
  price?: number | string
}

interface WooOrder {
  id?: number
  status?: string
  currency?: string
  total?: string
  customer_note?: string
  line_items?: WooLineItem[]
  billing?: {
    first_name?: string
    last_name?: string
    phone?: string
    email?: string
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params
  const db = adminClient()

  const { data: config, error: configErr } = await db
    .from('woocommerce_config')
    .select('webhook_secret_encrypted')
    .eq('account_id', accountId)
    .maybeSingle()
  if (configErr || !config) {
    return NextResponse.json({ error: { code: 'not_configured', message: 'WooCommerce not set up for this account' } }, { status: 404 })
  }

  const rawBody = await request.text()
  const signature = request.headers.get('x-wc-webhook-signature') ?? ''
  if (!signature) {
    return NextResponse.json({ error: { code: 'unauthorized', message: 'Missing X-WC-Webhook-Signature header' } }, { status: 401 })
  }

  let secret: string
  try {
    secret = decrypt(config.webhook_secret_encrypted)
  } catch (err) {
    console.error('[woocommerce-webhook] secret decrypt failed:', err)
    return NextResponse.json({ error: { code: 'internal', message: 'Internal error' } }, { status: 500 })
  }

  const expected = createHmac('sha256', secret).update(rawBody).digest('base64')
  if (!timingSafeBase64Equal(signature, expected)) {
    return NextResponse.json({ error: { code: 'unauthorized', message: 'Signature mismatch' } }, { status: 401 })
  }

  let order: WooOrder | null = null
  try {
    order = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: { code: 'bad_request', message: 'Body must be valid JSON' } }, { status: 400 })
  }

  const topic = request.headers.get('x-wc-webhook-topic') ?? ''
  // WooCommerce's initial "ping" delivery (sent when the webhook is
  // first created) and any topic we don't act on -- 200 so WooCommerce
  // doesn't disable the webhook after repeated non-2xx responses.
  if (!order?.id || !['order.created', 'order.updated'].includes(topic)) {
    return NextResponse.json({ received: true, handled: false })
  }

  // Supabase JS has no atomic increment via .update(); read-modify-write
  // is fine here -- this is a low-frequency admin-facing counter, not a
  // correctness-critical value.
  const { data: counterRow } = await db
    .from('woocommerce_config')
    .select('receive_count')
    .eq('account_id', accountId)
    .maybeSingle()
  await db
    .from('woocommerce_config')
    .update({
      last_received_at: new Date().toISOString(),
      receive_count: (counterRow?.receive_count ?? 0) + 1,
    })
    .eq('account_id', accountId)

  let contactId: string | null = null
  const phone = order.billing?.phone?.trim()
  if (phone) {
    try {
      const auditUserId = await resolveAuditUserId(db, accountId)
      const name = [order.billing?.first_name, order.billing?.last_name].filter(Boolean).join(' ') || null
      const result = await findOrCreateContact(db, accountId, auditUserId, {
        phone,
        name,
        email: order.billing?.email ?? null,
        source: 'WooCommerce',
      })
      contactId = result.id
    } catch (err) {
      // A malformed phone shouldn't drop the order -- record it without
      // a linked contact rather than failing the whole webhook.
      console.error('[woocommerce-webhook] contact resolve failed:', err)
    }
  }

  const items = (order.line_items ?? []).map((li) => ({
    product_retailer_id: li.sku || (li.product_id != null ? String(li.product_id) : ''),
    quantity: li.quantity ?? 1,
    item_price: typeof li.price === 'string' ? parseFloat(li.price) : (li.price ?? 0),
    currency: order.currency ?? 'INR',
  }))

  const payload = {
    account_id: accountId,
    contact_id: contactId,
    woocommerce_order_id: String(order.id),
    items,
    total_amount: order.total ? parseFloat(order.total) : 0,
    currency: order.currency ?? 'INR',
    customer_note: order.customer_note || null,
    payment_status: PAID_STATUSES.has(order.status ?? '') ? 'paid' : 'unpaid',
  }

  const { data: upserted, error: upsertErr } = await db
    .from('orders')
    .upsert(payload, { onConflict: 'account_id,woocommerce_order_id' })
    .select('id')
    .maybeSingle()

  if (upsertErr) {
    console.error('[woocommerce-webhook] order upsert failed:', upsertErr)
    return NextResponse.json({ error: { code: 'internal', message: 'Failed to record order' } }, { status: 500 })
  }

  return NextResponse.json({ received: true, handled: true, order_id: upserted?.id ?? null })
}
