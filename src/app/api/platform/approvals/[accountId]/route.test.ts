import { describe, it, expect, vi, beforeEach } from "vitest";

const updateMock = vi.fn(() => ({ eq: async () => ({ error: null }) }));
vi.mock("@/lib/platform/admin-client", () => ({
  supabasePlatformAdmin: () => ({
    from: () => ({ update: updateMock }),
  }),
}));
vi.mock("@/lib/platform/notify", () => ({ notify: vi.fn() }));

import { POST } from "./route";
import { notify } from "@/lib/platform/notify";

function basicAuthHeader(user: string, pass: string): string {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

function authedRequest(body: unknown): Request {
  return new Request("https://x/api/platform/approvals/acct-1", {
    method: "POST",
    headers: {
      authorization: basicAuthHeader("admin", "secret123"),
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/platform/approvals/[accountId]", () => {
  beforeEach(() => {
    vi.stubEnv("PLATFORM_ADMIN_USER", "admin");
    vi.stubEnv("PLATFORM_ADMIN_PASSWORD", "secret123");
  });

  it("401s without valid Basic Auth credentials", async () => {
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
    const request = new Request("https://x/api/platform/approvals/acct-1", {
      method: "POST",
      headers: { authorization: basicAuthHeader("admin", "secret123") },
      body: "{not json",
    });
    const response = await POST(request, { params: Promise.resolve({ accountId: "acct-1" }) });
    expect(response.status).toBe(400);
  });
});
