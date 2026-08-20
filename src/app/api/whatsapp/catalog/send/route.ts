import { NextResponse } from 'next/server'
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { decrypt } from '@/lib/whatsapp/encryption'
import { sendCatalogMessage } from '@/lib/whatsapp/meta-api'

/**
 * Send the account's Meta Commerce catalog to a contact. The customer's
 * picks come back as an inbound `order` message, handled entirely by
 * the webhook route (not this one) -- this only sends the invite.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent')

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .single()
    if (configError || !config) {
      return NextResponse.json(
        { error: 'WhatsApp not configured. Connect your account in Settings first.' },
        { status: 400 },
      )
    }

    const { data: commerce } = await supabase
      .from('commerce_config')
      .select('catalog_id')
      .eq('account_id', accountId)
      .maybeSingle()
    if (!commerce?.catalog_id) {
      return NextResponse.json(
        { error: 'No catalog connected yet. Add your Meta catalog_id in Settings → Commerce first.' },
        { status: 400 },
      )
    }

    let body: { to?: string; bodyText?: string; footerText?: string; thumbnailProductRetailerId?: string }
    try {
      body = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }
    if (!body.to?.trim() || !body.bodyText?.trim() || !body.thumbnailProductRetailerId?.trim()) {
      return NextResponse.json(
        { error: 'to, bodyText, and thumbnailProductRetailerId are required.' },
        { status: 400 },
      )
    }

    const accessToken = decrypt(config.access_token)
    const result = await sendCatalogMessage({
      phoneNumberId: config.phone_number_id,
      accessToken,
      to: body.to.trim(),
      bodyText: body.bodyText.trim(),
      footerText: body.footerText?.trim() || undefined,
      thumbnailProductRetailerId: body.thumbnailProductRetailerId.trim(),
    })

    return NextResponse.json({ success: true, messageId: result.messageId })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error sending catalog message:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send catalog.' },
      { status: 500 },
    )
  }
}
