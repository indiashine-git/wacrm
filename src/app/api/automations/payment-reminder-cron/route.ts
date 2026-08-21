import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { sendPaymentLinkMessage } from '@/lib/commerce/send-payment-link-message'

/**
 * Roadmap item 8: automated payment reminders for unpaid orders --
 * the DoubleTick-parity feature discussed earlier tonight ("pending
 * balance reminders"). Runs once daily; nudges any order whose
 * payment link has sat unpaid for 48h+ with a single reminder
 * (payment_reminder_sent_at gates it from firing twice). Resending
 * the link manually resets that gate (see the payment-link route).
 */
const REMINDER_AFTER_HOURS = 48

export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  const supplied = request.headers.get('x-cron-secret') ?? ''
  const suppliedBuf = Buffer.from(supplied)
  const expectedBuf = Buffer.from(expected)
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = supabaseAdmin()
  const cutoff = new Date(Date.now() - REMINDER_AFTER_HOURS * 60 * 60 * 1000).toISOString()

  const { data: orders, error } = await admin
    .from('orders')
    .select('id, account_id, conversation_id, total_amount, currency, payment_link')
    .eq('payment_status', 'link_sent')
    .not('payment_link', 'is', null)
    .not('conversation_id', 'is', null)
    .is('payment_reminder_sent_at', null)
    .lte('link_sent_at', cutoff)

  if (error) {
    console.error('[payment-reminder-cron] fetch failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!orders?.length) return NextResponse.json({ reminded: 0 })

  let reminded = 0
  for (const order of orders) {
    try {
      await sendPaymentLinkMessage(admin, order.account_id, {
        conversationId: order.conversation_id,
        orderId: order.id,
        amount: Number(order.total_amount),
        currency: order.currency || 'INR',
        paymentLink: order.payment_link,
        isReminder: true,
      })
      await admin
        .from('orders')
        .update({ payment_reminder_sent_at: new Date().toISOString() })
        .eq('id', order.id)
      reminded++
    } catch (err) {
      console.error('[payment-reminder-cron] failed for order', order.id, err)
    }
  }

  return NextResponse.json({ reminded })
}
