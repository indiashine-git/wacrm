import { describe, it, expect, vi, beforeEach } from "vitest";

function basicAuthHeader(user: string, pass: string): string {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

vi.mock("@/lib/platform/admin-client", () => ({
  supabasePlatformAdmin: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: async () => ({
            data: [
              {
                id: "acct-1",
                name: "Acme",
                created_at: "2026-08-17T00:00:00Z",
                owner_user_id: "user-1",
              },
            ],
            error: null,
          }),
        }),
      }),
    }),
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { email: "owner@acme.test" } }, error: null }),
      },
    },
  }),
}));

import { GET } from "./route";

describe("GET /api/platform/approvals", () => {
  beforeEach(() => {
    vi.stubEnv("PLATFORM_ADMIN_USER", "admin");
    vi.stubEnv("PLATFORM_ADMIN_PASSWORD", "secret123");
  });

  it("returns pending accounts with owner email when authenticated", async () => {
    const request = new Request("https://x/api/platform/approvals", {
      headers: { authorization: basicAuthHeader("admin", "secret123") },
    });
    const response = await GET(request);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.accounts).toEqual([
      { id: "acct-1", name: "Acme", ownerEmail: "owner@acme.test", createdAt: "2026-08-17T00:00:00Z" },
    ]);
  });

  it("401s without valid Basic Auth credentials", async () => {
    const request = new Request("https://x/api/platform/approvals");
    const response = await GET(request);
    expect(response.status).toBe(401);
  });
});
