import { NextResponse } from 'next/server'
import {
  ForbiddenError,
  UnauthorizedError,
  getCurrentAccount,
  toErrorResponse,
} from '@/lib/auth/account'

/** wacrm's own send/submission log for a Flow -- Meta has no run-history API. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, accountId } = await getCurrentAccount()
    const { id: flowId } = await params

    const { data, error } = await supabase
      .from('flow_sends')
      .select('id, to_phone, status, submitted_fields, sent_at, submitted_at, contact_id, contacts(name)')
      .eq('account_id', accountId)
      .eq('flow_id', flowId)
      .order('sent_at', { ascending: false })
      .limit(200)

    if (error) throw error

    return NextResponse.json({ runs: data ?? [] })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error loading flow runs:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to load runs.' },
      { status: 500 },
    )
  }
}
