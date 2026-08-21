// ============================================================
// /api/account/woocommerce
//
//   GET    — this account's config (secret never sent back).
//   POST   — create the connector. Generates the webhook secret
//            server-side (like inbound-webhooks) and returns it once —
//            the admin pastes it into WooCommerce's own webhook setup.
//            Calling POST again rotates the secret.
//   DELETE — remove the integration.
// ============================================================

import { randomBytes } from 'node:crypto'
import { NextResponse } from 'next/server'
import {
  ForbiddenError,
  UnauthorizedError,
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { encrypt } from '@/lib/whatsapp/encryption'

function resolvePublicOrigin(request: Request): string {
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto') ?? 'https'
  if (forwardedHost) return `${forwardedProto}://${forwardedHost}`
  return new URL(request.url).origin
}

export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await getCurrentAccount()
    const { data } = await supabase
      .from('woocommerce_config')
      .select('store_url, last_received_at, receive_count, created_at')
      .eq('account_id', accountId)
      .maybeSingle()
    if (!data) return NextResponse.json({ config: null })
    const origin = resolvePublicOrigin(request)
    return NextResponse.json({
      config: { ...data, webhook_url: `${origin}/api/webhooks/woocommerce/${accountId}` },
    })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    return NextResponse.json({ error: 'Failed to load WooCommerce settings' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')
    const body = (await request.json().catch(() => null)) as { store_url?: string } | null
    const storeUrl = body?.store_url?.trim()
    if (!storeUrl) {
      return NextResponse.json({ error: "'store_url' is required" }, { status: 400 })
    }

    const secret = randomBytes(24).toString('hex')
    const { error } = await supabase
      .from('woocommerce_config')
      .upsert(
        {
          account_id: accountId,
          created_by: userId,
          store_url: storeUrl,
          webhook_secret_encrypted: encrypt(secret),
        },
        { onConflict: 'account_id' }
      )
    if (error) throw error

    const origin = resolvePublicOrigin(request)
    return NextResponse.json({
      success: true,
      secret,
      webhook_url: `${origin}/api/webhooks/woocommerce/${accountId}`,
    })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error saving WooCommerce config:', error)
    return NextResponse.json({ error: 'Failed to save WooCommerce settings' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const { supabase, accountId } = await requireRole('admin')
    const { error } = await supabase.from('woocommerce_config').delete().eq('account_id', accountId)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    return NextResponse.json({ error: 'Failed to remove WooCommerce integration' }, { status: 500 })
  }
}
