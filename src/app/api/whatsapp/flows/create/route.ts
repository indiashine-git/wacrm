import { NextResponse } from 'next/server'
import {
  ForbiddenError,
  UnauthorizedError,
  requireRole,
  toErrorResponse,
} from '@/lib/auth/account'
import { decrypt } from '@/lib/whatsapp/encryption'
import { createFlow } from '@/lib/whatsapp/meta-api'

interface CreateFlowField {
  /** Stored under this key in the submission's response_json. */
  name: string
  label: string
  inputType: 'text' | 'number' | 'email' | 'phone'
}

interface CreateFlowBody {
  name: string
  categories: string[]
  screenId: string
  fields: CreateFlowField[]
  footerLabel: string
}

/**
 * Build + create + publish a single-screen static Flow from a simple
 * field list. No screen builder UI (that's real future scope) — this
 * covers the common case (a short lead/contact-capture form) without
 * hand-writing Flow JSON.
 */
export async function POST(request: Request) {
  try {
    const { supabase, accountId } = await requireRole('admin')

    const { data: config, error: configError } = await supabase
      .from('whatsapp_config')
      .select('*')
      .eq('account_id', accountId)
      .single()

    if (configError || !config) {
      return NextResponse.json(
        { error: 'WhatsApp not configured. Connect your account in Settings first.' },
        { status: 400 },
      )
    }
    if (!config.waba_id) {
      return NextResponse.json(
        { error: 'WABA ID missing. Re-connect your account in Settings.' },
        { status: 400 },
      )
    }

    let body: CreateFlowBody
    try {
      body = (await request.json()) as CreateFlowBody
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 })
    }

    if (!body.name?.trim() || !body.screenId?.trim() || !body.fields?.length) {
      return NextResponse.json(
        { error: 'name, screenId, and at least one field are required.' },
        { status: 400 },
      )
    }
    if (!/^[A-Z0-9_]+$/.test(body.screenId.trim())) {
      return NextResponse.json(
        { error: 'Screen id must be UPPER_SNAKE_CASE (letters, numbers, underscores).' },
        { status: 400 },
      )
    }

    const screenId = body.screenId.trim()
    const payload: Record<string, string> = {}
    for (const field of body.fields) {
      payload[field.name] = `\${form.${field.name}}`
    }

    const flowJson = {
      version: '7.2',
      screens: [
        {
          id: screenId,
          title: body.name.trim(),
          terminal: true,
          layout: {
            type: 'SingleColumnLayout',
            children: [
              {
                type: 'Form',
                name: 'submitted_form',
                children: [
                  ...body.fields.map((field) => ({
                    type: 'TextInput',
                    name: field.name,
                    label: field.label,
                    'input-type': field.inputType,
                    required: true,
                  })),
                  {
                    type: 'Footer',
                    label: body.footerLabel?.trim() || 'Submit',
                    'on-click-action': {
                      name: 'complete',
                      payload,
                    },
                  },
                ],
              },
            ],
          },
        },
      ],
    }

    const accessToken = decrypt(config.access_token)

    let result
    try {
      result = await createFlow({
        wabaId: config.waba_id,
        accessToken,
        name: body.name.trim(),
        categories: body.categories?.length ? body.categories : ['OTHER'],
        flowJson,
        publish: true,
      })
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Meta flow creation failed.'
      return NextResponse.json({ error: message }, { status: 502 })
    }

    return NextResponse.json({ success: true, flowId: result.id, screenId })
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      return toErrorResponse(error)
    }
    console.error('Error creating flow:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to create flow.' },
      { status: 500 },
    )
  }
}
