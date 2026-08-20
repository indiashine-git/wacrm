import { NextResponse } from 'next/server'
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { decrypt } from '@/lib/whatsapp/encryption'
import {
  debugAccessToken,
  getUserBusinesses,
  listOwnedCatalogs,
  listWabaCatalogs,
} from '@/lib/whatsapp/meta-api'

function asError(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

/**
 * Diagnostic: what scopes does the account's stored WhatsApp access
 * token ACTUALLY carry, per Meta itself, and what catalogs does it
 * actually have working access to -- checked several independent
 * ways so one failing call doesn't hide the others' results.
 */
export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('admin')
    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('access_token, waba_id')
      .eq('account_id', accountId)
      .single()
    if (!config?.access_token) {
      return NextResponse.json({ error: 'WhatsApp not configured.' }, { status: 400 })
    }
    const accessToken = decrypt(config.access_token)

    const result: Record<string, unknown> = {}

    try {
      result.tokenInfo = await debugAccessToken(accessToken)
    } catch (e) {
      result.tokenInfoError = asError(e)
    }

    try {
      const businesses = await getUserBusinesses({ accessToken })
      result.businesses = businesses
      result.catalogsByBusiness = await Promise.all(
        businesses.map(async (b) => ({
          business: b,
          catalogs: await listOwnedCatalogs({ businessId: b.id, accessToken }).catch((e) => [
            { id: 'error', name: asError(e) },
          ]),
        })),
      )
    } catch (e) {
      result.businessesError = asError(e)
    }

    if (config.waba_id) {
      try {
        result.wabaConnectedCatalogs = await listWabaCatalogs({
          wabaId: config.waba_id,
          accessToken,
        })
      } catch (e) {
        result.wabaConnectedCatalogsError = asError(e)
      }
    }

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
