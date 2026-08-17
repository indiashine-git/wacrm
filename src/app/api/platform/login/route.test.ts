import { describe, it, expect, vi, beforeEach } from "vitest";
import { __resetRateLimitForTests } from "@/lib/rate-limit";

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

vi.mock("@/lib/platform/admin-auth", async () => {
  const actual = await vi.importActual<typeof import("@/lib/platform/admin-auth")>(
    "@/lib/platform/admin-auth"
  );
  return {
    ...actual,
    verifyPassword: vi.fn(),
  };
});

import { POST } from "./route";
import { verifyPassword } from "@/lib/platform/admin-auth";

function req(body: unknown, ip = "203.0.113.1"): Request {
  return new Request("https://x/api/platform/login", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("POST /api/platform/login", () => {
  beforeEach(() => {
    __resetRateLimitForTests();
    maybeSingle.mockReset();
    vi.mocked(verifyPassword).mockReset();
    vi.stubEnv("PLATFORM_SESSION_SECRET", "test-secret");
  });

  it("sets a session cookie on correct credentials", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: "admin-1", password_hash: "hash" },
      error: null,
    });
    vi.mocked(verifyPassword).mockResolvedValue(true);

    const response = await POST(req({ email: "admin@example.com", password: "correct" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("wacrm_platform_session=");
  });

  it("401s on an unknown email, but still runs a verify (constant-time defense)", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    vi.mocked(verifyPassword).mockResolvedValue(false);
    const response = await POST(req({ email: "nobody@example.com", password: "x" }));
    expect(response.status).toBe(401);
    // Must still call verifyPassword (against the dummy hash) so an
    // unknown email doesn't return measurably faster than a known one.
    expect(verifyPassword).toHaveBeenCalled();
  });

  it("401s on a wrong password", async () => {
    maybeSingle.mockResolvedValue({
      data: { id: "admin-1", password_hash: "hash" },
      error: null,
    });
    vi.mocked(verifyPassword).mockResolvedValue(false);
    const response = await POST(req({ email: "admin@example.com", password: "wrong" }));
    expect(response.status).toBe(401);
  });

  it("400s when email or password is missing", async () => {
    const response = await POST(req({ email: "admin@example.com" }));
    expect(response.status).toBe(400);
  });

  it("429s once the per-IP login attempt budget is exhausted", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    for (let i = 0; i < 5; i++) {
      await POST(req({ email: "x@x.com", password: "x" }, "203.0.113.2"));
    }
    const response = await POST(req({ email: "x@x.com", password: "x" }, "203.0.113.2"));
    expect(response.status).toBe(429);
  });
});
