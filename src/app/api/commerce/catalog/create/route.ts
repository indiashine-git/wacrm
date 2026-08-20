import { NextResponse } from 'next/server'
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { decrypt } from '@/lib/whatsapp/encryption'
import {
  getUserBusinesses,
  createProductCatalog,
  connectCatalogToWaba,
} from '@/lib/whatsapp/meta-api'

/**
 * Create a real Meta catalog and connect it to this account's WhatsApp
 * number -- no Commerce Manager trip. Prefers the business_id captured
 * during Embedded Signup (needs no extra permission); falls back to
 * GET /me/businesses (needs business_management, which has proven
 * unreliable to get granted) only when that's missing, e.g. for an
 * account connected before this was captured.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin')

    const { data: config } = await supabase
      .from('whatsapp_config')
      .select('waba_id, business_id, access_token')
      .eq('account_id', accountId)
      .single()
    if (!config?.access_token || !config.waba_id) {
      return NextResponse.json(
        { error: 'WhatsApp not connected yet. Connect it in Settings first.' },
        { status: 400 },
      )
    }
    const accessToken = decrypt(config.access_token)

    const body = await request.json().catch(() => ({}))
    const name = typeof body?.name === 'string' && body.name.trim() ? body.name.trim() : 'WATU Catalog'

    let businessId = config.business_id as string | null
    if (!businessId) {
      const businesses = await getUserBusinesses({ accessToken })
      businessId = businesses[0]?.id ?? null
      if (!businessId) {
        return NextResponse.json(
          {
            error:
              "Couldn't find your Meta Business Manager account automatically. Try Reconnect WhatsApp in Settings -- a fresh connection captures this. If it still fails, Meta hasn't granted this app the permission it needs; use the manual steps below for now.",
          },
          { status: 422 },
        )
      }
    }

    const { catalogId } = await createProductCatalog({ businessId, accessToken, name })
    await connectCatalogToWaba({ wabaId: config.waba_id, catalogId, accessToken })

    await supabase
      .from('commerce_config')
      .upsert({ account_id: accountId, catalog_id: catalogId }, { onConflict: 'account_id' })

    if (!config.business_id) {
      await supabase.from('whatsapp_config').update({ business_id: businessId }).eq('account_id', accountId)
    }

    return NextResponse.json({ success: true, catalogId })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error creating catalog:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create catalog.' },
      { status: 500 },
    )
  }
}
