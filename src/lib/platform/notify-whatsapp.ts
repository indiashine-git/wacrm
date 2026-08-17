// Uses dhan-research's WABA credentials (saas-ra-360) — credential
// reuse only, no shared code/DB with that system. Same Meta Cloud
// API shape as src/lib/whatsapp/meta-api.ts, kept separate because
// that module is tenant-config-scoped and this is a fixed platform
// number.
const META_API_VERSION = "v21.0";

export async function sendWhatsapp(text: string): Promise<void> {
  const token = process.env.WHATSAPP_PLATFORM_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PLATFORM_PHONE_ID;
  const to = process.env.NOTIFY_WHATSAPP_TO;

  const response = await fetch(
    `https://graph.facebook.com/${META_API_VERSION}/${phoneNumberId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    }
  );
  if (!response.ok) {
    throw new Error(`WhatsApp send failed: ${response.status}`);
  }
}
