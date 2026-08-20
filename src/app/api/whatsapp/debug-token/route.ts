import { NextResponse } from 'next/server'
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { decrypt } from '@/lib/whatsapp/encryption'
import { debugAccessToken } from '@/lib/whatsapp/meta-api'

/**
 * Diagnostic: what scopes does the account's stored WhatsApp access
 * token ACTUALLY carry, per Meta itself -- not what the login config
 * requested. The token itself never leaves the server; only the
 * scope list Meta reports back does.
 */
export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('admin')
    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('access_token')
      .eq('account_id', accountId)
      .single()
    if (!config?.access_token) {
      return NextResponse.json({ error: 'WhatsApp not configured.' }, { status: 400 })
    }
    const accessToken = decrypt(config.access_token)
    const result = await debugAccessToken(accessToken)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error debugging access token:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to debug token.' },
      { status: 500 },
    )
  }
}
