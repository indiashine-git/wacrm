// ============================================================
// /api/account/google-sheets
//
//   GET    — this account's config (service account JSON never sent back).
//   POST   — save/update config. service_account_json only overwrites
//            the stored (encrypted) value when a new one is pasted.
//   DELETE — remove the integration.
// ============================================================

import { NextResponse } from 'next/server'
import {
  ForbiddenError,
  UnauthorizedError,
  getCurrentAccount,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { encrypt } from '@/lib/whatsapp/encryption'

const SAFE_COLUMNS =
  'spreadsheet_id, sheet_name, poll_enabled, last_synced_row, last_tested_at, last_test_error, created_at'

export async function GET() {
  try {
    const { supabase, accountId } = await getCurrentAccount()
    const { data } = await supabase
      .from('google_sheets_config')
      .select(SAFE_COLUMNS)
      .eq('account_id', accountId)
      .maybeSingle()
    return NextResponse.json({ config: data ?? null })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    return NextResponse.json({ error: 'Failed to load Google Sheets settings' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')
    const body = (await request.json().catch(() => null)) as {
      service_account_json?: string
      spreadsheet_id?: string
      sheet_name?: string
      poll_enabled?: boolean
    } | null

    const spreadsheetId = body?.spreadsheet_id?.trim()
    if (!spreadsheetId) {
      return NextResponse.json({ error: "'spreadsheet_id' is required" }, { status: 400 })
    }

    const payload: Record<string, unknown> = {
      account_id: accountId,
      created_by: userId,
      spreadsheet_id: spreadsheetId,
      sheet_name: body?.sheet_name?.trim() || 'Sheet1',
      poll_enabled: !!body?.poll_enabled,
    }

    if (body?.service_account_json?.trim()) {
      // Validate it parses and has the shape we need before saving --
      // a malformed paste should fail loudly here, not silently later.
      try {
        const parsed = JSON.parse(body.service_account_json)
        if (!parsed.client_email || !parsed.private_key) {
          return NextResponse.json(
            { error: 'That JSON is missing client_email/private_key -- make sure you pasted the full service account key file.' },
            { status: 400 },
          )
        }
      } catch {
        return NextResponse.json({ error: 'Service account key must be valid JSON.' }, { status: 400 })
      }
      payload.service_account_json_encrypted = encrypt(body.service_account_json.trim())
    }

    const { data: existing } = await supabase
      .from('google_sheets_config')
      .select('account_id')
      .eq('account_id', accountId)
      .maybeSingle()

    if (!existing && !payload.service_account_json_encrypted) {
      return NextResponse.json({ error: 'A service account key is required to set this up the first time.' }, { status: 400 })
    }

    const { error } = await supabase
      .from('google_sheets_config')
      .upsert(payload, { onConflict: 'account_id' })
    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error saving Google Sheets config:', error)
    return NextResponse.json({ error: 'Failed to save Google Sheets settings' }, { status: 500 })
  }
}

export async function DELETE() {
  try {
    const { supabase, accountId } = await requireRole('admin')
    const { error } = await supabase.from('google_sheets_config').delete().eq('account_id', accountId)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    return NextResponse.json({ error: 'Failed to remove Google Sheets integration' }, { status: 500 })
  }
}
