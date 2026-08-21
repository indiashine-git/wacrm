// POST /api/account/google-sheets/test -- the real proof-of-life
// check. Nothing in this integration is verified until an admin with
// a real service account clicks this: authenticates, reads the
// header row, and reports exactly what came back (or what Google
// rejected).
import { NextResponse } from 'next/server'
import { ForbiddenError, UnauthorizedError, requireRole, toErrorResponse } from '@/lib/auth/account'
import { decrypt } from '@/lib/whatsapp/encryption'
import { getAccessToken, readSheetRows } from '@/lib/google-sheets/client'

export async function POST() {
  try {
    const { supabase, accountId } = await requireRole('admin')
    const { data: config } = await supabase
      .from('google_sheets_config')
      .select('service_account_json_encrypted, spreadsheet_id, sheet_name')
      .eq('account_id', accountId)
      .maybeSingle()
    if (!config) {
      return NextResponse.json({ error: 'Set up a service account + spreadsheet first.' }, { status: 400 })
    }

    let result: { headerRow: string[]; rowCount: number }
    try {
      const serviceAccount = JSON.parse(decrypt(config.service_account_json_encrypted))
      const token = await getAccessToken(serviceAccount)
      const rows = await readSheetRows(token, config.spreadsheet_id, config.sheet_name)
      result = { headerRow: rows[0] ?? [], rowCount: rows.length }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to connect to Google Sheets'
      await supabase
        .from('google_sheets_config')
        .update({ last_tested_at: new Date().toISOString(), last_test_error: message })
        .eq('account_id', accountId)
      return NextResponse.json({ error: message }, { status: 502 })
    }

    await supabase
      .from('google_sheets_config')
      .update({ last_tested_at: new Date().toISOString(), last_test_error: null })
      .eq('account_id', accountId)

    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error testing Google Sheets connection:', error)
    return NextResponse.json({ error: 'Failed to test connection' }, { status: 500 })
  }
}
