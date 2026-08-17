import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/platform/admin-auth";

const updateMock = vi.fn(() => ({ eq: async () => ({ error: null }) }));
vi.mock("@/lib/platform/admin-client", () => ({
  supabasePlatformAdmin: () => ({
    from: () => ({ update: updateMock }),
  }),
}));
vi.mock("@/lib/platform/notify", () => ({ notify: vi.fn() }));

import { POST } from "./route";
import { notify } from "@/lib/platform/notify";

function authedRequest(body: unknown): Request {
  const token = createSessionToken("admin-1");
  return new Request("https://x/api/platform/approvals/acct-1", {
    method: "POST",
    headers: {
      cookie: `${SESSION_COOKIE_NAME}=${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/platform/approvals/[accountId]", () => {
  beforeEach(() => {
    vi.stubEnv("PLATFORM_SESSION_SECRET", "test-secret");
  });

  it("401s without a valid session cookie", async () => {
    const request = new Request("https://x/api/platform/approvals/acct-1", {
      method: "POST",
      body: JSON.stringify({ action: "approve" }),
    });
    const response = await POST(request, { params: Promise.resolve({ accountId: "acct-1" }) });
    expect(response.status).toBe(401);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("approves and notifies", async () => {
    const response = await POST(authedRequest({ action: "approve" }), {
      params: Promise.resolve({ accountId: "acct-1" }),
    });
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved", rejected_reason: null })
    );
    expect(notify).toHaveBeenCalledWith("account_approved", { accountId: "acct-1" });
  });

  it("rejects with a reason and notifies", async () => {
    const response = await POST(authedRequest({ action: "reject", reason: "duplicate signup" }), {
      params: Promise.resolve({ accountId: "acct-1" }),
    });
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "rejected", rejected_reason: "duplicate signup" })
    );
    expect(notify).toHaveBeenCalledWith("account_rejected", { accountId: "acct-1", reason: "duplicate signup" });
  });

  it("400s when reject has no reason", async () => {
    const response = await POST(authedRequest({ action: "reject" }), {
      params: Promise.resolve({ accountId: "acct-1" }),
    });
    expect(response.status).toBe(400);
  });

  it("400s on an unrecognized action instead of silently rejecting", async () => {
    const response = await POST(authedRequest({ action: "delete" }), {
      params: Promise.resolve({ accountId: "acct-1" }),
    });
    expect(response.status).toBe(400);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it("400s on malformed JSON body instead of 500ing", async () => {
    const token = createSessionToken("admin-1");
    const request = new Request("https://x/api/platform/approvals/acct-1", {
      method: "POST",
      headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
      body: "{not json",
    });
    const response = await POST(request, { params: Promise.resolve({ accountId: "acct-1" }) });
    expect(response.status).toBe(400);
  });

  it("suspends an approved account and notifies", async () => {
    const response = await POST(authedRequest({ action: "suspend" }), {
      params: Promise.resolve({ accountId: "acct-1" }),
    });
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "suspended" })
    );
    expect(notify).toHaveBeenCalledWith("account_suspended", { accountId: "acct-1" });
  });

  it("reactivates a suspended/rejected account and notifies", async () => {
    const response = await POST(authedRequest({ action: "reactivate" }), {
      params: Promise.resolve({ accountId: "acct-1" }),
    });
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved", rejected_reason: null })
    );
    expect(notify).toHaveBeenCalledWith("account_approved", { accountId: "acct-1" });
  });
});
