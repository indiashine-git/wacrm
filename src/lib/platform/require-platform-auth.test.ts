import { describe, it, expect, beforeEach, vi } from "vitest";
import { requirePlatformAuth } from "./require-platform-auth";
import { createSessionToken, SESSION_COOKIE_NAME } from "./admin-auth";

function requestWithCookie(cookieValue: string | null): Request {
  return new Request("https://x/api/platform/approvals", {
    headers: cookieValue ? { cookie: `${SESSION_COOKIE_NAME}=${cookieValue}` } : {},
  });
}

describe("requirePlatformAuth", () => {
  beforeEach(() => {
    vi.stubEnv("PLATFORM_SESSION_SECRET", "test-secret");
  });

  it("returns null (pass) for a valid session token", () => {
    const token = createSessionToken("admin-1");
    expect(requirePlatformAuth(requestWithCookie(token))).toBeNull();
  });

  it("401s with no cookie", () => {
    const res = requirePlatformAuth(requestWithCookie(null));
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("401s on a tampered token", () => {
    const token = createSessionToken("admin-1");
    const res = requirePlatformAuth(requestWithCookie(token + "tampered"));
    expect(res!.status).toBe(401);
  });

  it("401s on an expired/garbage token", () => {
    const res = requirePlatformAuth(requestWithCookie("garbage.value.here"));
    expect(res!.status).toBe(401);
  });
});
