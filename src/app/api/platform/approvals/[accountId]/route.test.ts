import { describe, it, expect, vi } from "vitest";

const updateMock = vi.fn(() => ({ eq: async () => ({ error: null }) }));
vi.mock("@/lib/platform/admin-client", () => ({
  supabasePlatformAdmin: () => ({
    from: () => ({ update: updateMock }),
  }),
}));
vi.mock("@/lib/platform/notify", () => ({ notify: vi.fn() }));

import { POST } from "./route";
import { notify } from "@/lib/platform/notify";

describe("POST /api/platform/approvals/[accountId]", () => {
  it("approves and notifies", async () => {
    const request = new Request("https://x/api/platform/approvals/acct-1", {
      method: "POST",
      body: JSON.stringify({ action: "approve" }),
    });
    const response = await POST(request, { params: Promise.resolve({ accountId: "acct-1" }) });
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "approved" })
    );
    expect(notify).toHaveBeenCalledWith("account_approved", { accountId: "acct-1" });
  });

  it("rejects with a reason and notifies", async () => {
    const request = new Request("https://x/api/platform/approvals/acct-1", {
      method: "POST",
      body: JSON.stringify({ action: "reject", reason: "duplicate signup" }),
    });
    const response = await POST(request, { params: Promise.resolve({ accountId: "acct-1" }) });
    expect(response.status).toBe(200);
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ status: "rejected", rejected_reason: "duplicate signup" })
    );
    expect(notify).toHaveBeenCalledWith("account_rejected", { accountId: "acct-1", reason: "duplicate signup" });
  });

  it("400s when reject has no reason", async () => {
    const request = new Request("https://x/api/platform/approvals/acct-1", {
      method: "POST",
      body: JSON.stringify({ action: "reject" }),
    });
    const response = await POST(request, { params: Promise.resolve({ accountId: "acct-1" }) });
    expect(response.status).toBe(400);
  });
});
