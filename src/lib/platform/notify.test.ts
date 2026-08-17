import { describe, it, expect, vi, beforeEach } from "vitest";

const sendEmail = vi.fn();
const sendTelegram = vi.fn();
const sendWhatsapp = vi.fn();

vi.mock("./notify-email", () => ({ sendEmail: (...args: unknown[]) => sendEmail(...args) }));
vi.mock("./notify-telegram", () => ({ sendTelegram: (...args: unknown[]) => sendTelegram(...args) }));
vi.mock("./notify-whatsapp", () => ({ sendWhatsapp: (...args: unknown[]) => sendWhatsapp(...args) }));

vi.mock("./admin-client", () => ({
  supabasePlatformAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { name: "Acme", owner_user_id: "user-1" }, error: null }),
        }),
      }),
    }),
    auth: { admin: { getUserById: async () => ({ data: { user: { email: "owner@acme.test" } }, error: null }) } },
  }),
}));

describe("notify", () => {
  beforeEach(() => {
    sendEmail.mockReset();
    sendTelegram.mockReset();
    sendWhatsapp.mockReset();
    vi.unstubAllEnvs();
  });

  it("fires all enabled channels on signup_pending", async () => {
    vi.stubEnv("NOTIFY_EMAIL_ENABLED", "true");
    vi.stubEnv("NOTIFY_EMAIL_TO", "operator@example.com");
    vi.stubEnv("NOTIFY_TELEGRAM_ENABLED", "true");
    vi.stubEnv("NOTIFY_WHATSAPP_ENABLED", "false");
    const { notify } = await import("./notify");

    await notify("signup_pending", { accountId: "acct-1" });

    expect(sendEmail).toHaveBeenCalled();
    expect(sendTelegram).toHaveBeenCalled();
    expect(sendWhatsapp).not.toHaveBeenCalled();
  });

  it("does not throw when a channel adapter rejects", async () => {
    vi.stubEnv("NOTIFY_EMAIL_ENABLED", "true");
    vi.stubEnv("NOTIFY_EMAIL_TO", "operator@example.com");
    sendEmail.mockRejectedValueOnce(new Error("SMTP down"));
    const { notify } = await import("./notify");

    await expect(notify("signup_pending", { accountId: "acct-1" })).resolves.toBeUndefined();
  });

  it("only sends email for account_approved, never operator channels", async () => {
    vi.stubEnv("NOTIFY_EMAIL_ENABLED", "true");
    vi.stubEnv("NOTIFY_EMAIL_TO", "operator@example.com");
    vi.stubEnv("NOTIFY_TELEGRAM_ENABLED", "true");
    const { notify } = await import("./notify");

    sendEmail.mockClear();
    await notify("account_approved", { accountId: "acct-1" });

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "owner@acme.test" })
    );
    expect(sendTelegram).not.toHaveBeenCalled();
  });

  it("includes the rejection reason in the applicant email for account_rejected", async () => {
    vi.stubEnv("NOTIFY_EMAIL_ENABLED", "true");
    const { notify } = await import("./notify");

    await notify("account_rejected", { accountId: "acct-1", reason: "duplicate signup" });

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@acme.test",
        text: expect.stringContaining("duplicate signup"),
        html: expect.stringContaining("duplicate signup"),
      })
    );
  });

  it("sends branded HTML alongside plain text, with subject set", async () => {
    vi.stubEnv("NOTIFY_EMAIL_ENABLED", "true");
    const { notify } = await import("./notify");

    await notify("account_approved", { accountId: "acct-1" });

    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@acme.test",
        subject: expect.any(String),
        html: expect.stringContaining("<!DOCTYPE html>"),
      })
    );
    const call = sendEmail.mock.calls[0][0];
    expect(call.html).toContain("Acme");
    expect(call.subject.length).toBeGreaterThan(0);
  });

  it("HTML-escapes account name and reason to prevent injection into the email body", async () => {
    vi.stubEnv("NOTIFY_EMAIL_ENABLED", "true");
    const { notify } = await import("./notify");

    await notify("account_rejected", {
      accountId: "acct-1",
      reason: "<script>alert(1)</script>",
    });

    const call = sendEmail.mock.calls[0][0];
    expect(call.html).not.toContain("<script>alert(1)</script>");
    expect(call.html).toContain("&lt;script&gt;");
  });

  it("does nothing (no throw) when every channel is disabled", async () => {
    const { notify } = await import("./notify");
    await expect(notify("signup_pending", { accountId: "acct-1" })).resolves.toBeUndefined();
    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendTelegram).not.toHaveBeenCalled();
    expect(sendWhatsapp).not.toHaveBeenCalled();
  });
});
