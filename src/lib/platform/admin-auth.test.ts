import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "node:crypto";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  verifySessionToken,
} from "./admin-auth";

beforeEach(() => {
  vi.stubEnv("PLATFORM_SESSION_SECRET", "test-secret-do-not-use-in-prod");
});

describe("hashPassword / verifyPassword", () => {
  it("verifies a correct password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("correct horse battery staple", hash)).resolves.toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct horse battery staple");
    await expect(verifyPassword("wrong password", hash)).resolves.toBe(false);
  });

  it("produces a different hash each time (random salt)", async () => {
    const hash1 = await hashPassword("same password");
    const hash2 = await hashPassword("same password");
    expect(hash1).not.toBe(hash2);
  });

  it("rejects a malformed stored hash", async () => {
    await expect(verifyPassword("anything", "not-a-valid-hash")).resolves.toBe(false);
  });
});

describe("createSessionToken / verifySessionToken", () => {
  it("round-trips a valid session", () => {
    const token = createSessionToken("admin-1");
    expect(verifySessionToken(token)).toBe("admin-1");
  });

  it("rejects a tampered adminId", () => {
    const token = createSessionToken("admin-1");
    const [, expiresAt, sig] = token.split(".");
    const tampered = `admin-2.${expiresAt}.${sig}`;
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it("rejects a tampered expiry", () => {
    const token = createSessionToken("admin-1");
    const [adminId, , sig] = token.split(".");
    const farFuture = Date.now() + 1000 * 60 * 60 * 24 * 365;
    const tampered = `${adminId}.${farFuture}.${sig}`;
    expect(verifySessionToken(tampered)).toBeNull();
  });

  it("rejects an expired token", () => {
    const adminId = "admin-1";
    const expiredAt = Date.now() - 1000;
    const payload = `${adminId}.${expiredAt}`;
    // Reconstruct with a valid signature for an already-expired timestamp.
    const sig = createHmac("sha256", "test-secret-do-not-use-in-prod")
      .update(payload)
      .digest("hex");
    expect(verifySessionToken(`${payload}.${sig}`)).toBeNull();
  });

  it("rejects garbage input", () => {
    expect(verifySessionToken("not-a-token")).toBeNull();
    expect(verifySessionToken(null)).toBeNull();
    expect(verifySessionToken(undefined)).toBeNull();
  });

  it("throws when PLATFORM_SESSION_SECRET is unset", () => {
    vi.stubEnv("PLATFORM_SESSION_SECRET", "");
    expect(() => createSessionToken("admin-1")).toThrow();
  });
});
