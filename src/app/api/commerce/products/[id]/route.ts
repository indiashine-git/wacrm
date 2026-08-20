import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { decrypt } from '@/lib/whatsapp/encryption'
import { updateCatalogProduct, deleteCatalogProduct } from '@/lib/whatsapp/meta-api'

async function loadToken(accountId: string, supabase: SupabaseClient) {
  const { data: config } = await supabase
    .from('whatsapp_config')
    .select('access_token')
    .eq('account_id', accountId)
    .single()
  if (!config?.access_token) {
    throw new Error('WhatsApp not configured. Connect your account in Settings first.')
  }
  return decrypt(config.access_token)
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const { id: productId } = await params
    const accessToken = await loadToken(accountId, supabase)

    const body = await request.json()
    const { name, description, priceMinorUnits, currency, imageUrl, availability } = body as {
      name?: string
      description?: string
      priceMinorUnits?: number
      currency?: string
      imageUrl?: string
      availability?: string
    }

    await updateCatalogProduct({
      productId,
      accessToken,
      name,
      description,
      priceMinorUnits,
      currency,
      imageUrl,
      availability,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error updating catalog product:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update product.' },
      { status: 500 },
    )
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const { id: productId } = await params
    const accessToken = await loadToken(accountId, supabase)

    await deleteCatalogProduct({ productId, accessToken })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error deleting catalog product:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete product.' },
      { status: 500 },
    )
  }
}
