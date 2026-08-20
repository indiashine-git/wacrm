import { NextResponse } from 'next/server'
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { decrypt } from '@/lib/whatsapp/encryption'
import { createTemplateFromLibrary } from '@/lib/whatsapp/meta-api'
import { normalizeStatus } from '@/lib/whatsapp/template-status-normalize'

/**
 * Clone a template from Meta's pre-vetted Template Library.
 *
 * Meta exposes no public Graph API to browse the library (confirmed
 * live: `GET /{waba_id}/message_template_library` returns
 * "(#100) Tried accessing nonexisting field" at every API version,
 * even though the same account can browse it fine in Meta's own
 * WhatsApp Manager UI — that UI calls a private, non-public endpoint).
 * Only cloning by exact known name works publicly. The user finds the
 * name in Meta's UI and pastes it in here.
 *
 * Also: despite Meta's docs implying instant approval, a live test
 * against a real WABA returned `status: "PENDING"`, not "APPROVED" —
 * cloning a library template still queues for normal review, it's
 * just built from Meta's own pre-vetted content.
 *
 * See https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-library
 */

interface CreateFromLibraryBody {
  name: string
  language: string
  libraryTemplateName: string
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        {
          error:
            'WhatsApp not configured. Connect your WhatsApp Business account in Settings first.',
        },
        { status: 400 },
      )
    }
    if (!config.waba_id) {
      return NextResponse.json(
        {
          error:
            'WABA (WhatsApp Business Account) ID missing. Re-connect your account in Settings.',
        },
        { status: 400 },
      )
    }

    let body: CreateFromLibraryBody
    try {
      body = (await request.json()) as CreateFromLibraryBody
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }

    if (!body.name?.trim() || !body.language?.trim() || !body.libraryTemplateName?.trim()) {
      return NextResponse.json(
        { error: 'name, language, and libraryTemplateName are required.' },
        { status: 400 },
      )
    }

    const accessToken = decrypt(config.access_token)

    let meta
    try {
      meta = await createTemplateFromLibrary({
        wabaId: config.waba_id,
        accessToken,
        name: body.name.trim(),
        language: body.language.trim(),
        // Library templates are UTILITY-only per Meta's spec.
        category: 'UTILITY',
        libraryTemplateName: body.libraryTemplateName.trim(),
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Meta library-create failed.'
      return NextResponse.json({ error: message }, { status: 502 })
    }

    // Meta doesn't echo the library template's body/footer/buttons back
    // on create — only id/status/category. The row starts with empty
    // content; "Sync from Meta" (already in this page) backfills the
    // full components once the sync route runs.
    const { data: row, error: upsertErr } = await supabase
      .from('message_templates')
      .upsert(
        {
          account_id: accountId,
          user_id: userId,
          name: body.name.trim(),
          category: 'Utility',
          language: body.language.trim(),
          body_text: '',
          status: normalizeStatus(meta.status),
          meta_template_id: meta.id,
          submission_error: null,
          rejection_reason: null,
          last_submitted_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,name,language' },
      )
      .select()
      .single()

    if (upsertErr) {
      return NextResponse.json(
        {
          error: `Created on Meta but failed to save locally: ${upsertErr.message}. Run "Sync from Meta" to recover.`,
          meta_template_id: meta.id,
        },
        { status: 500 },
      )
    }

    return NextResponse.json({ success: true, template: row })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error creating template from library:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to create template from library.',
      },
      { status: 500 },
    )
  }
}
