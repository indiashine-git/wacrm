import { NextResponse } from 'next/server'
import {
  ForbiddenError,
  UnauthorizedError,
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { encrypt } from '@/lib/whatsapp/encryption'

/** Commerce settings (catalog + payment provider) — one row per account. */
export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount()
    const { data } = await supabase
      .from('commerce_config')
      .select('*')
      .eq('account_id', accountId)
      .maybeSingle()

    // razorpay_key_secret / razorpay_webhook_secret are never sent to
    // the client -- only whether one is already saved, same masking
    // pattern as whatsapp_config's access_token.
    const hasRazorpaySecret = !!data?.razorpay_key_secret
    const hasRazorpayWebhookSecret = !!data?.razorpay_webhook_secret
    if (data) {
      delete (data as { razorpay_key_secret?: string }).razorpay_key_secret
      delete (data as { razorpay_webhook_secret?: string }).razorpay_webhook_secret
    }

    return NextResponse.json({ config: data ?? null, hasRazorpaySecret, hasRazorpayWebhookSecret })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error loading commerce config:', error)
    return NextResponse.json({ error: 'Failed to load commerce settings.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin')
    const body = await request.json()
    const {
      catalog_id,
      payment_provider,
      razorpay_key_id,
      razorpay_key_secret,
      razorpay_webhook_secret,
      upi_vpa,
      upi_payee_name,
    } = body as {
      catalog_id?: string
      payment_provider?: string
      razorpay_key_id?: string
      razorpay_key_secret?: string
      razorpay_webhook_secret?: string
      upi_vpa?: string
      upi_payee_name?: string
    }

    if (payment_provider && !['none', 'razorpay', 'upi'].includes(payment_provider)) {
      return NextResponse.json({ error: 'Invalid payment_provider.' }, { status: 400 })
    }

    const payload: Record<string, unknown> = {
      account_id: accountId,
      catalog_id: catalog_id?.trim() || null,
      payment_provider: payment_provider ?? 'none',
      razorpay_key_id: razorpay_key_id?.trim() || null,
      upi_vpa: upi_vpa?.trim() || null,
      upi_payee_name: upi_payee_name?.trim() || null,
      updated_at: new Date().toISOString(),
    }
    // Only overwrite the encrypted secret when a new one was actually
    // typed -- an empty string means "leave it as-is", matching how
    // WhatsAppConfig treats the access token field.
    if (razorpay_key_secret?.trim()) {
      payload.razorpay_key_secret = encrypt(razorpay_key_secret.trim())
    }
    if (razorpay_webhook_secret?.trim()) {
      payload.razorpay_webhook_secret = encrypt(razorpay_webhook_secret.trim())
    }

    const { error } = await supabase.from('commerce_config').upsert(payload, { onConflict: 'account_id' })
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error saving commerce config:', error)
    return NextResponse.json({ error: 'Failed to save commerce settings.' }, { status: 500 })
  }
}
