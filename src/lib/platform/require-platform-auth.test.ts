import { describe, it, expect, beforeEach, vi } from "vitest";

import { requirePlatformAuth } from "./require-platform-auth";

function basicAuthHeader(user: string, pass: string): string {
  return "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");
}

describe("requirePlatformAuth", () => {
  beforeEach(() => {
    vi.stubEnv("PLATFORM_ADMIN_USER", "admin");
    vi.stubEnv("PLATFORM_ADMIN_PASSWORD", "secret123");
  });

  it("returns null (pass) for correct credentials", () => {
    const request = new Request("https://x/api/platform/approvals", {
      headers: { authorization: basicAuthHeader("admin", "secret123") },
    });
    expect(requirePlatformAuth(request)).toBeNull();
  });

  it("401s with no Authorization header", () => {
    const request = new Request("https://x/api/platform/approvals");
    const res = requirePlatformAuth(request);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
  });

  it("401s on wrong password", () => {
    const request = new Request("https://x/api/platform/approvals", {
      headers: { authorization: basicAuthHeader("admin", "wrong") },
    });
    const res = requirePlatformAuth(request);
    expect(res!.status).toBe(401);
  });

  it("401s on wrong username", () => {
    const request = new Request("https://x/api/platform/approvals", {
      headers: { authorization: basicAuthHeader("someone-else", "secret123") },
    });
    const res = requirePlatformAuth(request);
    expect(res!.status).toBe(401);
  });

  it("500s when PLATFORM_ADMIN_USER/PASSWORD aren't configured", () => {
    vi.stubEnv("PLATFORM_ADMIN_USER", "");
    vi.stubEnv("PLATFORM_ADMIN_PASSWORD", "");
    const request = new Request("https://x/api/platform/approvals", {
      headers: { authorization: basicAuthHeader("admin", "secret123") },
    });
    const res = requirePlatformAuth(request);
    expect(res!.status).toBe(500);
  });
});
