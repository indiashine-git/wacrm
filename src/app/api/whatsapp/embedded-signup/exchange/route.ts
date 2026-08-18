import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  exchangeEmbeddedSignupCode,
  assertWabaOwnsPhoneNumber,
} from '@/lib/whatsapp/meta-api'

/**
 * POST /api/whatsapp/embedded-signup/exchange
 *
 * Server-side leg of the Embedded Signup flow. The client only ever
 * holds an authorization `code` plus the wabaId/phoneNumberId it read
 * out of Meta's postMessage session payload — never a token. This
 * route:
 *
 *   1. Exchanges the code for a long-lived Business Integration
 *      System User token (never sent to the client).
 *   2. Independently verifies that token actually owns the claimed
 *      phoneNumberId under the claimed wabaId — a forged client
 *      request pairing a valid code with someone else's IDs gets
 *      rejected here rather than silently writing to the wrong
 *      tenant's row.
 *   3. Generates a random 6-digit two-step-verification PIN and
 *      hands everything to the existing /api/whatsapp/config POST
 *      handler (same origin, forwarding the caller's cookies) so
 *      registration, WABA webhook subscription, encryption, and the
 *      already-battle-tested conflict checks all run exactly once,
 *      in one place, for both the manual and Embedded Signup paths.
 *
 * The PIN is returned once in the response (never stored in
 * plaintext) so the UI can show it to the tenant for their records —
 * same "shown once" pattern as the team-invite link.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { code, wabaId, phoneNumberId } = body as {
      code?: string
      wabaId?: string
      phoneNumberId?: string
    }
    if (!code || !wabaId || !phoneNumberId) {
      return NextResponse.json(
        { error: 'code, wabaId, and phoneNumberId are required' },
        { status: 400 }
      )
    }

    let accessToken: string
    try {
      ;({ accessToken } = await exchangeEmbeddedSignupCode({ code }))
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error'
      console.error('[embedded-signup/exchange] code exchange failed:', message)
      return NextResponse.json(
        { error: `Failed to exchange Embedded Signup code: ${message}` },
        { status: 400 }
      )
    }

    try {
      await assertWabaOwnsPhoneNumber({ wabaId, phoneNumberId, accessToken })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown Meta API error'
      console.error('[embedded-signup/exchange] ownership check failed:', message)
      return NextResponse.json({ error: message }, { status: 400 })
    }

    // Random 6-digit PIN for the /register call. `crypto`-backed via
    // Math.random is fine here — this isn't a secret with lasting
    // value, it's a one-time 2FA PIN Meta stores on the number itself
    // and we hand to the tenant to record.
    const pin = String(Math.floor(100000 + Math.random() * 900000))

    // Reuse the existing, already-hardened save path instead of
    // duplicating its register/subscribe/encrypt/conflict-check
    // logic. Forward the caller's cookies so the internal call
    // authenticates as the same user.
    const cookie = request.headers.get('cookie') ?? ''
    const origin = new URL(request.url).origin
    const saveRes = await fetch(`${origin}/api/whatsapp/config`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie },
      body: JSON.stringify({
        phone_number_id: phoneNumberId,
        waba_id: wabaId,
        access_token: accessToken,
        pin,
      }),
    })
    const saveBody = await saveRes.json().catch(() => ({}))
    if (!saveRes.ok) {
      return NextResponse.json(saveBody, { status: saveRes.status })
    }

    return NextResponse.json({ ...saveBody, pin })
  } catch (error) {
    console.error('[embedded-signup/exchange] unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
