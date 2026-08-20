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
  connectCatalogToWaba,
  getWhatsappCommerceSettings,
  setWhatsappCommerceCatalogVisible,
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
      .select('access_token, waba_id, phone_number_id')
      .eq('account_id', accountId)
      .single()
    if (!config?.access_token) {
      return NextResponse.json({ error: 'WhatsApp not configured.' }, { status: 400 })
    }
    const accessToken = decrypt(config.access_token)

    const result: Record<string, unknown> = {}

    if (config.phone_number_id) {
      try {
        result.commerceSettings = await getWhatsappCommerceSettings({
          phoneNumberId: config.phone_number_id,
          accessToken,
        })
      } catch (e) {
        result.commerceSettingsError = asError(e)
      }
    }

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

/** Diagnostic action: connect a catalog_id to the account's WABA directly. */
export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin')
    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('access_token, waba_id, phone_number_id')
      .eq('account_id', accountId)
      .single()
    if (!config?.access_token) {
      return NextResponse.json({ error: 'WhatsApp not configured.' }, { status: 400 })
    }
    const accessToken = decrypt(config.access_token)
    const { catalogId, action } = (await request.json()) as { catalogId?: string; action?: string }

    if (action === 'enableCatalogVisible') {
      if (!config.phone_number_id) {
        return NextResponse.json({ error: 'No phone_number_id on this account.' }, { status: 400 })
      }
      await setWhatsappCommerceCatalogVisible({ phoneNumberId: config.phone_number_id, accessToken })
      return NextResponse.json({ success: true })
    }

    if (!config.waba_id) {
      return NextResponse.json({ error: 'WhatsApp not configured.' }, { status: 400 })
    }
    if (!catalogId) {
      return NextResponse.json({ error: 'catalogId is required.' }, { status: 400 })
    }
    await connectCatalogToWaba({ wabaId: config.waba_id, catalogId, accessToken })
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error connecting catalog to WABA:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to connect catalog.' },
      { status: 500 },
    )
  }
}
