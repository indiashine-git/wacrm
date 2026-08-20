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

    // Our own send log -- Meta gives no run-count for Flows. One query
    // for every flow's sends, tallied client-side per flow_id.
    const { data: sends } = await supabase
      .from('flow_sends')
      .select('flow_id, status, sent_at')
      .eq('account_id', accountId)

    const runCounts: Record<string, { total: number; submitted: number; lastSentAt: string | null }> = {}
    for (const send of sends ?? []) {
      const entry = runCounts[send.flow_id] ?? { total: 0, submitted: 0, lastSentAt: null }
      entry.total += 1
      if (send.status === 'submitted') entry.submitted += 1
      if (!entry.lastSentAt || send.sent_at > entry.lastSentAt) entry.lastSentAt = send.sent_at
      runCounts[send.flow_id] = entry
    }

    return NextResponse.json({ flows, runCounts })
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
