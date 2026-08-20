import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { decrypt } from '@/lib/whatsapp/encryption'
import { listCatalogProducts, createCatalogProduct } from '@/lib/whatsapp/meta-api'

async function loadCatalogAndToken(supabase: SupabaseClient, accountId: string) {
  const [{ data: commerce }, { data: config }] = await Promise.all([
    supabase.from('commerce_config').select('catalog_id').eq('account_id', accountId).maybeSingle(),
    supabase.from('whatsapp_config').select('access_token').eq('account_id', accountId).single(),
  ])
  if (!commerce?.catalog_id) {
    throw new Error('No catalog connected yet. Add your Meta catalog_id in Settings → Commerce first.')
  }
  if (!config?.access_token) {
    throw new Error('WhatsApp not configured. Connect your account in Settings first.')
  }
  return { catalogId: commerce.catalog_id as string, accessToken: decrypt(config.access_token) }
}

/** Products in the account's connected Meta catalog. */
export async function GET() {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const { catalogId, accessToken } = await loadCatalogAndToken(supabase, accountId)
    const products = await listCatalogProducts({ catalogId, accessToken })
    return NextResponse.json({ products })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error listing catalog products:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list products.' },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const { catalogId, accessToken } = await loadCatalogAndToken(supabase, accountId)

    const body = await request.json()
    const { retailerId, name, description, priceMinorUnits, currency, imageUrl, productUrl } = body as {
      retailerId?: string
      name?: string
      description?: string
      priceMinorUnits?: number
      currency?: string
      imageUrl?: string
      productUrl?: string
    }
    if (!retailerId?.trim() || !name?.trim() || !currency?.trim() || !imageUrl?.trim() || !priceMinorUnits) {
      return NextResponse.json(
        { error: 'retailerId, name, priceMinorUnits, currency, and imageUrl are required.' },
        { status: 400 },
      )
    }

    const { productId } = await createCatalogProduct({
      catalogId,
      accessToken,
      retailerId: retailerId.trim(),
      name: name.trim(),
      description: description?.trim(),
      priceMinorUnits,
      currency: currency.trim(),
      imageUrl: imageUrl.trim(),
      productUrl: productUrl?.trim(),
    })

    return NextResponse.json({ success: true, productId })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error creating catalog product:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create product.' },
      { status: 500 },
    )
  }
}
