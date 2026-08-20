import { NextResponse } from 'next/server'
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { decrypt } from '@/lib/whatsapp/encryption'
import { getFlowPreviewUrl } from '@/lib/whatsapp/meta-api'

/** Meta-hosted preview link for a Flow — renders outside WhatsApp's own client cache. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, accountId } = await requireRole('admin')
    const { id } = await params

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
    const previewUrl = await getFlowPreviewUrl({ flowId: id, accessToken })

    return NextResponse.json({ previewUrl })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error getting flow preview:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get preview.' },
      { status: 500 },
    )
  }
}
