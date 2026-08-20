import { NextResponse } from 'next/server'
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { decrypt } from '@/lib/whatsapp/encryption'
import { deleteFlow, deprecateFlow } from '@/lib/whatsapp/meta-api'

/**
 * DELETE only works on a DRAFT flow (Meta rejects deleting a
 * PUBLISHED one). For a PUBLISHED flow, pass ?action=deprecate to
 * retire it instead — Meta's one-way "can't send this anymore" state,
 * there's no un-deprecate.
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, accountId } = await requireRole('admin')
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('access_token')
      .eq('account_id', accountId)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        { error: 'WhatsApp not configured. Connect your account in Settings first.' },
        { status: 400 },
      )
    }

    const accessToken = decrypt(config.access_token)

    if (action === 'deprecate') {
      await deprecateFlow({ flowId: id, accessToken })
    } else {
      await deleteFlow({ flowId: id, accessToken })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error deleting/deprecating flow:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove flow.' },
      { status: 500 },
    )
  }
}
