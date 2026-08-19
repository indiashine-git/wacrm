import { sendEmail } from "./notify-email";
import { sendTelegram } from "./notify-telegram";
import { sendWhatsapp } from "./notify-whatsapp";
import { supabasePlatformAdmin } from "./admin-client";

export type NotifyEvent =
  | "signup_pending"
  | "account_approved"
  | "account_rejected"
  | "account_suspended";

export interface NotifyPayload {
  accountId: string;
  reason?: string;
}

async function loadAccount(accountId: string) {
  const admin = supabasePlatformAdmin();
  const { data: account } = await admin
    .from("accounts")
    .select("name, owner_user_id")
    .eq("id", accountId)
    .maybeSingle();
  if (!account) return null;
  const { data } = await admin.auth.admin.getUserById(account.owner_user_id);
  return { name: account.name, ownerEmail: data.user?.email ?? null };
}

function messageFor(event: NotifyEvent, accountName: string, reason?: string): string {
  switch (event) {
    case "signup_pending":
      return `New WATU signup awaiting approval: "${accountName}". Review at /platform/accounts.`;
    case "account_approved":
      return `Your WATU account "${accountName}" has been approved. You can now sign in.`;
    case "account_rejected":
      return `Your WATU account "${accountName}" was not approved.${reason ? ` Reason: ${reason}` : ""}`;
    case "account_suspended":
      return `Your WATU account "${accountName}" has been suspended. Contact support for details.`;
  }
}

function subjectFor(event: NotifyEvent): string {
  switch (event) {
    case "signup_pending":
      return "WATU: new signup awaiting approval";
    case "account_approved":
      return "Your WATU account has been approved";
    case "account_rejected":
      return "Your WATU account was not approved";
    case "account_suspended":
      return "Your WATU account has been suspended";
  }
}

/**
 * Brand-consistent HTML wrapper — same visual language as the
 * hosted GoTrue templates (wacrm-infra/email-templates/*.html):
 * dark header with the wordmark, white body card, violet CTA
 * button. Kept here as one function rather than separate files
 * since these are generated (not static) and simpler inline.
 */
function htmlFor(event: NotifyEvent, accountName: string, reason: string | undefined, siteUrl: string): string {
  const heading = subjectFor(event);
  const ctaHref = event === "signup_pending" ? `${siteUrl}/platform/accounts` : `${siteUrl}/login`;
  const ctaLabel = event === "signup_pending" ? "Review in platform panel" : "Sign in to WATU";

  let bodyHtml: string;
  switch (event) {
    case "signup_pending":
      bodyHtml = `New WATU signup awaiting approval: <strong>${escapeHtml(accountName)}</strong>.`;
      break;
    case "account_approved":
      bodyHtml = `Your WATU account <strong>${escapeHtml(accountName)}</strong> has been approved. You can now sign in.`;
      break;
    case "account_rejected":
      bodyHtml = `Your WATU account <strong>${escapeHtml(accountName)}</strong> was not approved.${reason ? ` Reason: ${escapeHtml(reason)}` : ""}`;
      break;
    case "account_suspended":
      bodyHtml = `Your WATU account <strong>${escapeHtml(accountName)}</strong> has been suspended. Contact support for details.`;
      break;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="480" cellpadding="0" cellspacing="0" style="max-width:480px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">
<tr>
  <td style="background-color:#0a0a0f;padding:28px 32px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="width:32px;height:32px;background-color:#7c3aed;border-radius:8px;text-align:center;vertical-align:middle;">
        <span style="color:#ffffff;font-size:18px;font-weight:700;line-height:32px;">W</span>
      </td>
      <td style="padding-left:10px;color:#ffffff;font-size:18px;font-weight:600;">WATU</td>
    </tr></table>
  </td>
</tr>
<tr>
  <td style="padding:36px 32px 8px;">
    <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#18181b;">${escapeHtml(heading)}</h1>
    <p style="margin:0 0 24px;font-size:14px;line-height:22px;color:#52525b;">${bodyHtml}</p>
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      <td style="border-radius:8px;background-color:#7c3aed;">
        <a href="${ctaHref}" target="_blank" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${escapeHtml(ctaLabel)}</a>
      </td>
    </tr></table>
  </td>
</tr>
<tr>
  <td style="padding:24px 32px;border-top:1px solid #f4f4f5;">
    <p style="margin:0;font-size:12px;color:#a1a1aa;">WATU — WhatsApp CRM by India-Shine</p>
  </td>
</tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Fires the notification for `event` on every enabled channel.
 * A channel with its flag off, or one that fails, is logged and
 * skipped — never throws, never blocks the caller's underlying
 * state change.
 */
export async function notify(event: NotifyEvent, payload: NotifyPayload): Promise<void> {
  const account = await loadAccount(payload.accountId);
  if (!account) {
    console.error(`[notify] account ${payload.accountId} not found for event ${event}`);
    return;
  }

  const text = messageFor(event, account.name, payload.reason);
  const subject = subjectFor(event);
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").replace(/\/$/, "");
  const html = htmlFor(event, account.name, payload.reason, siteUrl);
  const operatorEvents: NotifyEvent[] = ["signup_pending"];
  const applicantEvents: NotifyEvent[] = ["account_approved", "account_rejected", "account_suspended"];

  const tasks: Promise<void>[] = [];

  if (operatorEvents.includes(event)) {
    if (process.env.NOTIFY_EMAIL_ENABLED === "true") {
      tasks.push(sendEmail({ to: process.env.NOTIFY_EMAIL_TO!, subject, text, html }));
    }
    if (process.env.NOTIFY_TELEGRAM_ENABLED === "true") {
      tasks.push(sendTelegram(text));
    }
    if (process.env.NOTIFY_WHATSAPP_ENABLED === "true") {
      tasks.push(sendWhatsapp(text));
    }
  }

  if (applicantEvents.includes(event) && account.ownerEmail) {
    tasks.push(sendEmail({ to: account.ownerEmail, subject, text, html }));
  }

  const results = await Promise.allSettled(tasks);
  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error(`[notify] channel failed for event ${event}:`, result.reason);
    }
  });
}
