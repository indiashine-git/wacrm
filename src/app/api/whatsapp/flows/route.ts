import { NextResponse } from 'next/server'
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { decrypt } from '@/lib/whatsapp/encryption'
import { listFlows } from '@/lib/whatsapp/meta-api'

/**
 * Real Meta WhatsApp Flows (native in-chat forms) — distinct from the
 * wacrm "Chatbot" feature. Lists whatever Flows exist on this
 * account's WABA. Creating/publishing a new Flow is done via a
 * one-off script for now (no builder UI yet); this route surfaces
 * what's already live so the team can see and send them.
 */
export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('admin')

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
    if (!config.waba_id) {
      return NextResponse.json(
        { error: 'WABA ID missing. Re-connect your account in Settings.' },
        { status: 400 },
      )
    }

    const accessToken = decrypt(config.access_token)
    const flows = await listFlows({ wabaId: config.waba_id, accessToken })

    return NextResponse.json({ flows })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error listing flows:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list flows.' },
      { status: 500 },
    )
  }
}
