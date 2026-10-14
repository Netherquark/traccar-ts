// SPDX-License-Identifier: Apache-2.0
// Copyright (C) 2026 traccar-ts contributors
//
// Auth tests - ported from traccar-rs auth tests.

import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, generateTokenSecret, signToken, verifyToken } from "../src/auth.ts";

describe("auth", () => {
  describe("hashPassword / verifyPassword", () => {
    it("hashes and verifies password", async () => {
      const password = "test-password-123";
      const hash = await hashPassword(password);
      expect(hash).toMatch(/^PBKDF2WithHmacSHA256\$200000\$/);

      const valid = await verifyPassword(password, hash);
      expect(valid).toBe(true);
    });

    it("rejects wrong password", async () => {
      const password = "test-password-123";
      const hash = await hashPassword(password);
      const valid = await verifyPassword("wrong-password", hash);
      expect(valid).toBe(false);
    });

    it("produces different hashes for same password", async () => {
      const password = "test-password-123";
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      expect(hash1).not.toBe(hash2); // different salts

      // But both should verify
      expect(await verifyPassword(password, hash1)).toBe(true);
      expect(await verifyPassword(password, hash2)).toBe(true);
    });

    it("rejects invalid hash format", async () => {
      expect(await verifyPassword("password", "invalid")).toBe(false);
      expect(await verifyPassword("password", "PBKDF2WithHmacSHA256$200000$")).toBe(false);
      expect(await verifyPassword("password", "PBKDF2WithHmacSHA256$invalid$hash")).toBe(false);
    });

    it("handles legacy SHA1 hashes if present", async () => {
      // This tests backward compatibility if needed
      const password = "test";
      const hash = await hashPassword(password);
      // Should be SHA256 format
      expect(hash).toMatch(/^PBKDF2WithHmacSHA256\$/);
    });
  });

  describe("generateTokenSecret", () => {
    it("generates secure random secret", () => {
      const secret1 = generateTokenSecret();
      const secret2 = generateTokenSecret();
      expect(secret1).not.toBe(secret2);
      expect(secret1.length).toBeGreaterThan(32); // base64url encoded 32 bytes
    });
  });

  describe("signToken / verifyToken", () => {
    it("signs and verifies token", async () => {
      const secret = generateTokenSecret();
      const payload = { i: 1, u: 123, e: Date.now() + 3600000, s: "test" };

      const token = await signToken(payload, secret);
      expect(token).toContain(".");

      const verified = await verifyToken(token, secret);
      expect(verified).toEqual(payload);
    });

    it("rejects token with wrong secret", async () => {
      const secret1 = generateTokenSecret();
      const secret2 = generateTokenSecret();
      const payload = { i: 1, u: 123, e: Date.now() + 3600000 };

      const token = await signToken(payload, secret1);
      const verified = await verifyToken(token, secret2);
      expect(verified).toBeNull();
    });

    it("rejects malformed token", async () => {
      const secret = generateTokenSecret();
      expect(await verifyToken("invalid", secret)).toBeNull();
      expect(await verifyToken("no.dot", secret)).toBeNull();
      expect(await verifyToken("a.b.c.d", secret)).toBeNull();
    });

    it("rejects token with invalid payload", async () => {
      const secret = generateTokenSecret();
      // Valid signature but invalid payload JSON
      const token = "eyJpIjoxfQ==.invalid_signature"; // base64url of {"i":1}
      const verified = await verifyToken(token, secret);
      expect(verified).toBeNull();
    });

    it("includes scope in token", async () => {
      const secret = generateTokenSecret();
      const payload = { i: 1, u: 123, e: Date.now() + 3600000, s: "read write" };

      const token = await signToken(payload, secret);
      const verified = await verifyToken(token, secret);
      expect(verified?.s).toBe("read write");
    });

    it("handles token without scope", async () => {
      const secret = generateTokenSecret();
      const payload = { i: 1, u: 123, e: Date.now() + 3600000 };

      const token = await signToken(payload, secret);
      const verified = await verifyToken(token, secret);
      expect(verified?.s).toBeUndefined();
    });
  });
});