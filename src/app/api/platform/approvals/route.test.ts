import { describe, it, expect, vi } from "vitest";

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
  it("returns pending accounts with owner email", async () => {
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.accounts).toEqual([
      { id: "acct-1", name: "Acme", ownerEmail: "owner@acme.test", createdAt: "2026-08-17T00:00:00Z" },
    ]);
  });
});
