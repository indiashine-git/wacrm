import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/automations/admin-client'
import { runSpecificAutomation } from '@/lib/automations/engine'
import type { Automation, TimeBasedTriggerConfig } from '@/types'

/**
 * Fire `time_based` automations -- "N days before/after this contact's
 * date field, every year" (renewals, AMC, birthdays). Meant to be hit
 * once daily (Vercel Cron / external pinger); requires the same
 * shared secret as the other automation cron endpoints.
 *
 * Before this existed, the "Time-Based" trigger was selectable and
 * saveable in the builder but NEVER fired -- no code anywhere
 * evaluated it. This is the real implementation, not a fix to an
 * existing one.
 *
 * Dedup: `automation_logs` already gets one row per fired automation
 * with `trigger_event = trigger_type`, so "did this automation already
 * fire for this contact today" is answerable from data that already
 * exists -- no new table needed.
 */
export async function GET(request: Request) {
  const expected = process.env.AUTOMATION_CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'cron not configured' }, { status: 503 })
  }
  const supplied = request.headers.get('x-cron-secret') ?? ''
  const suppliedBuf = Buffer.from(supplied)
  const expectedBuf = Buffer.from(expected)
  if (
    suppliedBuf.length !== expectedBuf.length ||
    !timingSafeEqual(suppliedBuf, expectedBuf)
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = supabaseAdmin()
  const today = new Date()
  const todayKey = `${today.getUTCMonth()}-${today.getUTCDate()}`
  const dayStartIso = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  ).toISOString()

  const { data: automations, error } = await admin
    .from('automations')
    .select('*')
    .eq('trigger_type', 'time_based')
    .eq('is_active', true)

  if (error) {
    console.error('[automations-date-cron] fetch failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!automations?.length) return NextResponse.json({ fired: 0 })

  let fired = 0

  for (const automationRow of automations) {
    const automation = automationRow as Automation
    const cfg = automation.trigger_config as TimeBasedTriggerConfig | null
    if (!cfg?.date_field || typeof cfg.offset_days !== 'number') continue

    // Resolve each contact's raw date value for this automation's field.
    let rows: { contactId: string; rawDate: string | null }[] = []
    if (cfg.date_field === 'contact.created_at') {
      const { data } = await admin
        .from('contacts')
        .select('id, created_at')
        .eq('account_id', automation.account_id)
      rows = (data ?? []).map((c) => ({ contactId: c.id, rawDate: c.created_at }))
    } else if (cfg.date_field.startsWith('custom:')) {
      const fieldId = cfg.date_field.slice('custom:'.length)
      const { data } = await admin
        .from('contact_custom_values')
        .select('contact_id, value, contacts!inner(account_id)')
        .eq('custom_field_id', fieldId)
        .eq('contacts.account_id', automation.account_id)
      rows = (data ?? []).map((r) => ({
        contactId: r.contact_id as string,
        rawDate: r.value as string | null,
      }))
    } else {
      continue
    }

    for (const { contactId, rawDate } of rows) {
      if (!rawDate) continue
      const parsed = new Date(rawDate)
      if (Number.isNaN(parsed.getTime())) continue

      let isMatch: boolean
      if (cfg.recurring_yearly) {
        // Compare month/day only (offset applied to a same-year copy so
        // an offset that crosses a month/year boundary still lands on
        // the right calendar day).
        const anniversary = new Date(
          Date.UTC(today.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()),
        )
        anniversary.setUTCDate(anniversary.getUTCDate() + cfg.offset_days)
        isMatch = `${anniversary.getUTCMonth()}-${anniversary.getUTCDate()}` === todayKey
      } else {
        const target = new Date(parsed)
        target.setUTCDate(target.getUTCDate() + cfg.offset_days)
        isMatch =
          target.getUTCFullYear() === today.getUTCFullYear() &&
          `${target.getUTCMonth()}-${target.getUTCDate()}` === todayKey
      }
      if (!isMatch) continue

      const { data: already } = await admin
        .from('automation_logs')
        .select('id')
        .eq('automation_id', automation.id)
        .eq('contact_id', contactId)
        .eq('trigger_event', 'time_based')
        .gte('created_at', dayStartIso)
        .limit(1)
      if (already && already.length > 0) continue

      await runSpecificAutomation(automation, {
        accountId: automation.account_id,
        triggerType: 'time_based',
        contactId,
      })
      fired++
    }
  }

  return NextResponse.json({ fired })
}
