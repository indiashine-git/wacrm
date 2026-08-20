import { NextResponse } from 'next/server'
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'

/** Manually mark an order paid/unpaid -- the only way to close the loop for a plain UPI ID, which has no payment webhook. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { supabase, accountId } = await requireRole('agent')
    const { id: orderId } = await params

    const body = await request.json()
    const { paymentStatus } = body as { paymentStatus?: 'unpaid' | 'link_sent' | 'paid' }
    if (!paymentStatus || !['unpaid', 'link_sent', 'paid'].includes(paymentStatus)) {
      return NextResponse.json({ error: 'paymentStatus must be unpaid, link_sent, or paid.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('orders')
      .update({ payment_status: paymentStatus })
      .eq('id', orderId)
      .eq('account_id', accountId)
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error updating order payment status:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to update order.' },
      { status: 500 },
    )
  }
}
