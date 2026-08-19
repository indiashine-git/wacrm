import { NextResponse } from 'next/server'
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { decrypt } from '@/lib/whatsapp/encryption'
import {
  browseTemplateLibrary,
  createTemplateFromLibrary,
} from '@/lib/whatsapp/meta-api'
import { normalizeStatus } from '@/lib/whatsapp/template-status-normalize'
import type { TemplateButton } from '@/types'

/**
 * Meta's Template Library: pre-vetted, ready-to-use templates that
 * skip the normal review queue. GET browses/filters the library;
 * POST clones one into the account's own message_templates catalog,
 * pre-approved (Meta returns status APPROVED immediately).
 *
 * See https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-library
 */

async function getConfig(supabase: Awaited<ReturnType<typeof requireRole>>['supabase'], accountId: string) {
  const { data: config, error: configError } = await supabase
    .from('whatsapp_config')
    .select('*')
    .eq('account_id', accountId)
    .single()

  if (configError || !config) {
    throw new Response(
      JSON.stringify({
        error:
          'WhatsApp not configured. Connect your WhatsApp Business account in Settings first.',
      }),
      { status: 400 },
    )
  }
  if (!config.waba_id) {
    throw new Response(
      JSON.stringify({
        error:
          'WABA (WhatsApp Business Account) ID missing. Re-connect your account in Settings.',
      }),
      { status: 400 },
    )
  }
  return config
}

export async function GET(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin')
    const config = await getConfig(supabase, accountId)
    const accessToken = decrypt(config.access_token)

    const { searchParams } = new URL(request.url)
    const templates = await browseTemplateLibrary({
      wabaId: config.waba_id,
      accessToken,
      search: searchParams.get('search') || undefined,
      topic: searchParams.get('topic') || undefined,
      usecase: searchParams.get('usecase') || undefined,
      industry: searchParams.get('industry') || undefined,
      language: searchParams.get('language') || undefined,
    })

    return NextResponse.json({ templates })
  } catch (error) {
    if (error instanceof Response) return error
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error browsing template library:', error)
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : 'Failed to browse template library.',
      },
      { status: 500 },
    )
  }
}

interface CreateFromLibraryBody {
  name: string
  language: string
  libraryTemplateName: string
  buttonInputs?: unknown[]
  bodyInputs?: Record<string, unknown>
  /** Raw body/footer/buttons as Meta returned them, for the local row preview. */
  bodyText?: string
  footerText?: string
  buttons?: TemplateButton[]
}

export async function POST(request: Request) {
  try {
    const { supabase, accountId, userId } = await requireRole('admin')
    const config = await getConfig(supabase, accountId)
    const accessToken = decrypt(config.access_token)

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
        buttonInputs: body.buttonInputs,
        bodyInputs: body.bodyInputs,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Meta library-create failed.'
      return NextResponse.json({ error: message }, { status: 502 })
    }

    const { data: row, error: upsertErr } = await supabase
      .from('message_templates')
      .upsert(
        {
          account_id: accountId,
          user_id: userId,
          name: body.name.trim(),
          category: 'Utility',
          language: body.language.trim(),
          body_text: body.bodyText ?? '',
          footer_text: body.footerText ?? null,
          buttons: body.buttons?.length ? body.buttons : null,
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
    if (error instanceof Response) return error
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
