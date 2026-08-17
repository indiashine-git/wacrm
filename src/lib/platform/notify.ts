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
      return `New wacrm signup awaiting approval: "${accountName}". Review at /platform/approvals.`;
    case "account_approved":
      return `Your wacrm account "${accountName}" has been approved. You can now sign in.`;
    case "account_rejected":
      return `Your wacrm account "${accountName}" was not approved.${reason ? ` Reason: ${reason}` : ""}`;
    case "account_suspended":
      return `Your wacrm account "${accountName}" has been suspended. Contact support for details.`;
  }
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
  const operatorEvents: NotifyEvent[] = ["signup_pending"];
  const applicantEvents: NotifyEvent[] = ["account_approved", "account_rejected", "account_suspended"];

  const tasks: Promise<void>[] = [];

  if (operatorEvents.includes(event)) {
    if (process.env.NOTIFY_EMAIL_ENABLED === "true") {
      tasks.push(sendEmail({ to: process.env.NOTIFY_EMAIL_TO!, subject: "wacrm: action needed", text }));
    }
    if (process.env.NOTIFY_TELEGRAM_ENABLED === "true") {
      tasks.push(sendTelegram(text));
    }
    if (process.env.NOTIFY_WHATSAPP_ENABLED === "true") {
      tasks.push(sendWhatsapp(text));
    }
  }

  if (applicantEvents.includes(event) && account.ownerEmail) {
    tasks.push(sendEmail({ to: account.ownerEmail, subject: "Your wacrm account", text }));
  }

  const results = await Promise.allSettled(tasks);
  results.forEach((result) => {
    if (result.status === "rejected") {
      console.error(`[notify] channel failed for event ${event}:`, result.reason);
    }
  });
}
