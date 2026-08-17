import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSessionToken, SESSION_COOKIE_NAME } from "@/lib/platform/admin-auth";

const order = vi.fn(async () => ({
  data: [
    {
      id: "acct-1",
      name: "Acme",
      status: "pending",
      created_at: "2026-08-17T00:00:00Z",
      owner_user_id: "user-1",
    },
    {
      id: "acct-2",
      name: "Globex",
      status: "approved",
      created_at: "2026-08-16T00:00:00Z",
      owner_user_id: "user-2",
    },
  ],
  error: null,
}));

vi.mock("@/lib/platform/admin-client", () => ({
  supabasePlatformAdmin: () => ({
    from: () => ({
      select: () => ({ order }),
    }),
    auth: {
      admin: {
        getUserById: async (id: string) => ({
          data: { user: { email: id === "user-1" ? "owner1@acme.test" : "owner2@globex.test" } },
          error: null,
        }),
      },
    },
  }),
}));

import { GET } from "./route";

function authedRequest(): Request {
  const token = createSessionToken("admin-1");
  return new Request("https://x/api/platform/accounts", {
    headers: { cookie: `${SESSION_COOKIE_NAME}=${token}` },
  });
}

describe("GET /api/platform/accounts", () => {
  beforeEach(() => {
    vi.stubEnv("PLATFORM_SESSION_SECRET", "test-secret");
  });

  it("401s without a valid session cookie", async () => {
    const response = await GET(new Request("https://x/api/platform/accounts"));
    expect(response.status).toBe(401);
  });

  it("returns every account regardless of status, not just pending", async () => {
    const response = await GET(authedRequest());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.accounts).toEqual([
      {
        id: "acct-1",
        name: "Acme",
        status: "pending",
        ownerEmail: "owner1@acme.test",
        createdAt: "2026-08-17T00:00:00Z",
      },
      {
        id: "acct-2",
        name: "Globex",
        status: "approved",
        ownerEmail: "owner2@globex.test",
        createdAt: "2026-08-16T00:00:00Z",
      },
    ]);
    // No .eq('status', ...) filter — the mock's select().order() chain
    // has no eq step, so this only compiles/passes if the route
    // doesn't filter by status.
  });
});
