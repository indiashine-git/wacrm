import { NextResponse } from 'next/server'
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { decrypt } from '@/lib/whatsapp/encryption'
import { sendFlowMessage } from '@/lib/whatsapp/meta-api'

interface SendFlowBody {
  to: string
  flowId: string
  flowName: string
  screen: string
  flowCta: string
  bodyText: string
  headerText?: string
  footerText?: string
}

/** Send a real Meta WhatsApp Flow (native in-chat form) to a contact. */
export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')

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

    let body: SendFlowBody
    try {
      body = (await request.json()) as SendFlowBody
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }

    if (!body.to?.trim() || !body.flowId?.trim() || !body.screen?.trim() || !body.flowCta?.trim() || !body.bodyText?.trim()) {
      return NextResponse.json(
        { error: 'to, flowId, screen, flowCta, and bodyText are required.' },
        { status: 400 },
      )
    }

    const accessToken = decrypt(config.access_token)
    const flowToken = `wacrm-${Date.now()}`
    const toPhone = body.to.trim()

    const result = await sendFlowMessage({
      phoneNumberId: config.phone_number_id,
      accessToken,
      to: toPhone,
      flowId: body.flowId.trim(),
      flowCta: body.flowCta.trim(),
      screen: body.screen.trim(),
      headerText: body.headerText?.trim() || undefined,
      bodyText: body.bodyText.trim(),
      footerText: body.footerText?.trim() || undefined,
      flowToken,
    })

    // Our own send log -- Meta gives no run-count/history API for Flows.
    const { data: contact } = await supabase
      .from('contacts')
      .select('id')
      .eq('account_id', accountId)
      .eq('phone', toPhone)
      .maybeSingle()

    await supabase.from('flow_sends').insert({
      account_id: accountId,
      user_id: userId,
      contact_id: contact?.id ?? null,
      flow_id: body.flowId.trim(),
      flow_name: body.flowName?.trim() || body.flowId.trim(),
      flow_token: flowToken,
      to_phone: toPhone,
      status: 'sent',
      whatsapp_message_id: result.messageId,
    })

    return NextResponse.json({ success: true, messageId: result.messageId })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error sending flow message:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to send flow.' },
      { status: 500 },
    )
  }
}
