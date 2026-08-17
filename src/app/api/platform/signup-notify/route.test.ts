import { describe, it, expect, vi } from "vitest";

const notify = vi.fn();
vi.mock("@/lib/platform/notify", () => ({ notify: (...args: unknown[]) => notify(...args) }));

const maybeSingle = vi.fn();
vi.mock("@/lib/platform/admin-client", () => ({
  supabasePlatformAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle }),
      }),
    }),
  }),
}));

import { POST } from "./route";

const VALID_USER_ID = "12345678-1234-1234-1234-123456789012";

describe("POST /api/platform/signup-notify", () => {
  it("notifies when the user's account resolves", async () => {
    maybeSingle.mockResolvedValue({ data: { account_id: "acct-1" }, error: null });
    const request = new Request("https://x/api/platform/signup-notify", {
      method: "POST",
      body: JSON.stringify({ userId: VALID_USER_ID }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(notify).toHaveBeenCalledWith("signup_pending", { accountId: "acct-1" });
  });

  it("400s on a malformed userId", async () => {
    const request = new Request("https://x/api/platform/signup-notify", {
      method: "POST",
      body: JSON.stringify({ userId: "not-a-uuid" }),
    });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(notify).not.toHaveBeenCalled();
  });

  it("200s without notifying when no profile is found yet", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    const request = new Request("https://x/api/platform/signup-notify", {
      method: "POST",
      body: JSON.stringify({ userId: VALID_USER_ID }),
    });
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(notify).not.toHaveBeenCalled();
  });
});
