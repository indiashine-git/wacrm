import { NextResponse } from 'next/server'
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { decrypt } from '@/lib/whatsapp/encryption'
import { SendMessageError } from '@/lib/whatsapp/send-message'
import { sendPaymentLinkMessage } from '@/lib/commerce/send-payment-link-message'

/**
 * Generate a payment link for an order (Razorpay or a UPI deep link,
 * per the account's commerce_config) and send it to the contact as a
 * WhatsApp text message. Razorpay needs real API keys configured in
 * Settings → Commerce; UPI only needs the merchant's own VPA.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const { id: orderId } = await params

    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('*, contact:contacts(phone, name)')
      .eq('id', orderId)
      .eq('account_id', accountId)
      .single()
    if (orderError || !order) {
      return NextResponse.json({ error: 'Order not found.' }, { status: 404 })
    }
    if (!order.conversation_id) {
      return NextResponse.json({ error: 'Order has no linked conversation to send into.' }, { status: 400 })
    }

    const { data: commerce } = await supabase
      .from('commerce_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle()
    if (!commerce || commerce.payment_provider === 'none') {
      return NextResponse.json(
        { error: 'No payment method configured yet. Set one up in Settings → Commerce.' },
        { status: 400 },
      )
    }

    const amount = Number(order.total_amount)
    const currency = order.currency || 'INR'
    let paymentLink: string
    let razorpayPaymentLinkId: string | null = null

    if (commerce.payment_provider === 'razorpay') {
      if (!commerce.razorpay_key_id || !commerce.razorpay_key_secret) {
        return NextResponse.json({ error: 'Razorpay keys not configured yet.' }, { status: 400 })
      }
      const keySecret = decrypt(commerce.razorpay_key_secret)
      const auth = Buffer.from(`${commerce.razorpay_key_id}:${keySecret}`).toString('base64')
      const res = await fetch('https://api.razorpay.com/v1/payment_links', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${auth}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: Math.round(amount * 100),
          currency,
          description: `Order ${orderId.slice(0, 8)}`,
          customer: order.contact ? { name: order.contact.name ?? undefined, contact: order.contact.phone } : undefined,
          notify: { sms: false, email: false },
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        return NextResponse.json(
          { error: data?.error?.description || 'Razorpay rejected the payment link request.' },
          { status: 502 },
        )
      }
      paymentLink = data.short_url
      razorpayPaymentLinkId = data.id
    } else {
      // UPI deep link -- opens any UPI app on tap, zero external
      // account beyond the merchant's own VPA. Works on mobile; a
      // desktop recipient would need to scan/forward it.
      if (!commerce.upi_vpa) {
        return NextResponse.json({ error: 'UPI VPA not configured yet.' }, { status: 400 })
      }
      const params2 = new URLSearchParams({
        pa: commerce.upi_vpa,
        pn: commerce.upi_payee_name || 'Payment',
        am: amount.toFixed(2),
        cu: 'INR',
        tn: `Order ${orderId.slice(0, 8)}`,
      })
      paymentLink = `upi://pay?${params2.toString()}`
    }

    await supabase
      .from('orders')
      .update({
        payment_link: paymentLink,
        payment_status: 'link_sent',
        payment_provider: commerce.payment_provider,
        razorpay_payment_link_id: razorpayPaymentLinkId,
        link_sent_at: new Date().toISOString(),
        // Resending (manually or via a reminder) restarts the reminder window.
        payment_reminder_sent_at: null,
      })
      .eq('id', orderId)

    try {
      await sendPaymentLinkMessage(supabase, accountId, {
        conversationId: order.conversation_id,
        orderId,
        amount,
        currency,
        paymentLink,
      })
    } catch (sendErr) {
      // The link was generated and saved -- surface the send failure
      // separately rather than losing the link entirely.
      const message = sendErr instanceof SendMessageError ? sendErr.message : 'Failed to send the link to the customer.'
      return NextResponse.json({ success: true, paymentLink, warning: message })
    }

    return NextResponse.json({ success: true, paymentLink })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error generating payment link:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate payment link.' },
      { status: 500 },
    )
  }
}
