import type { SupabaseClient } from '@supabase/supabase-js'
import { sendMessageToConversation } from '@/lib/whatsapp/send-message'

/**
 * Send (or resend, as a reminder) a payment-link message for an order.
 * Shared by the manual "Send/Resend payment link" action and the
 * automated payment-reminder cron so both use the exact same
 * cta_url-with-text-fallback behavior.
 */
export async function sendPaymentLinkMessage(
  supabase: SupabaseClient,
  accountId: string,
  args: {
    conversationId: string
    orderId: string
    amount: number
    currency: string
    paymentLink: string
    isReminder?: boolean
  },
): Promise<void> {
  const { conversationId, orderId, amount, currency, paymentLink, isReminder } = args
  const shortId = orderId.slice(0, 8)
  const bodyText = isReminder
    ? `Reminder: your order ${shortId} is still awaiting payment (${currency} ${amount.toFixed(2)}).`
    : `Your order ${shortId} is ready for payment: ${currency} ${amount.toFixed(2)}.`

  // Always try the clean "Pay now" button first -- nicer for the
  // customer than a raw link. Meta's cta_url button is only
  // documented for http(s) URLs, so a upi:// deep link (no gateway
  // account) is an unconfirmed edge case there; if Meta rejects it,
  // fall back to plain text rather than pre-guessing and leaving UPI
  // stuck with the ugly link forever.
  try {
    await sendMessageToConversation(supabase, accountId, {
      conversationId,
      messageType: 'interactive',
      interactivePayload: {
        kind: 'cta_url',
        body: bodyText,
        display_text: 'Pay now',
        url: paymentLink,
      },
    })
  } catch (ctaErr) {
    console.warn(
      '[send-payment-link-message] cta_url send rejected, falling back to text:',
      ctaErr instanceof Error ? ctaErr.message : ctaErr,
    )
    await sendMessageToConversation(supabase, accountId, {
      conversationId,
      messageType: 'text',
      contentText: `${bodyText}\n${paymentLink}`,
    })
  }
}
