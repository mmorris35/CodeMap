/**
 * Tests for authentication and API key management
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  generateApiKey,
  hashApiKey,
  getUserIdFromApiKey,
  validateApiKey,
} from "./auth";

describe("auth", () => {
  describe("generateApiKey", () => {
    it("generates a valid API key with cm_ prefix", () => {
      const key = generateApiKey();
      expect(key.startsWith("cm_")).toBe(true);
      expect(key.length).toBeGreaterThan(3); // cm_ + at least 1 char
    });

    it("generates unique keys on each call", () => {
      const key1 = generateApiKey();
      const key2 = generateApiKey();
      expect(key1).not.toBe(key2);
    });

    it("key has correct format", () => {
      const key = generateApiKey();
      // Should start with cm_ and be all valid base62 chars
      expect(key).toMatch(/^cm_[0-9A-Za-z]+$/);
      // Should be at least 35 characters (cm_ + 32 chars minimum)
      expect(key.length).toBeGreaterThanOrEqual(35);
    });

    it("key uses only valid base62 characters", () => {
      const key = generateApiKey();
      const keyWithoutPrefix = key.slice(3); // Remove cm_
      expect(keyWithoutPrefix).toMatch(/^[0-9A-Za-z]+$/);
    });
  });

  describe("hashApiKey", () => {
    it("returns a SHA-256 hash as hex string", async () => {
      const key = "cm_test123";
      const hash = await hashApiKey(key);

      // SHA-256 produces 64 hex characters
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });

    it("produces consistent hash for same input", async () => {
      const key = "cm_test123";
      const hash1 = await hashApiKey(key);
      const hash2 = await hashApiKey(key);

      expect(hash1).toBe(hash2);
    });

    it("produces different hash for different input", async () => {
      const hash1 = await hashApiKey("cm_key1");
      const hash2 = await hashApiKey("cm_key2");

      expect(hash1).not.toBe(hash2);
    });

    it("handles keys with special characters", async () => {
      const key = "cm_test!@#$%^&*()";
      const hash = await hashApiKey(key);

      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe("getUserIdFromApiKey", () => {
    it("returns 16-character user ID", async () => {
      const key = generateApiKey();
      const userId = await getUserIdFromApiKey(key);

      expect(userId).toMatch(/^[0-9a-f]{16}$/);
      expect(userId.length).toBe(16);
    });

    it("produces consistent user ID for same key", async () => {
      const key = "cm_test123";
      const userId1 = await getUserIdFromApiKey(key);
      const userId2 = await getUserIdFromApiKey(key);

      expect(userId1).toBe(userId2);
    });

    it("produces different user ID for different key", async () => {
      const userId1 = await getUserIdFromApiKey("cm_key1");
      const userId2 = await getUserIdFromApiKey("cm_key2");

      expect(userId1).not.toBe(userId2);
    });

    it("user ID is derived from hash (first 16 chars)", async () => {
      const key = "cm_test123";
      const hash = await hashApiKey(key);
      const userId = await getUserIdFromApiKey(key);

      expect(userId).toBe(hash.substring(0, 16));
    });
  });

  describe("validateApiKey", () => {
    let mockKV: Record<string, any>;

    beforeEach(() => {
      mockKV = {
        get: vi.fn(),
        put: vi.fn(),
        delete: vi.fn(),
        list: vi.fn(),
      };
    });

    it("returns invalid for undefined key", async () => {
      const result = await validateApiKey(mockKV as KVNamespace, undefined);

      expect(result.valid).toBe(false);
      expect(result.userId).toBeUndefined();
    });

    it("returns invalid for non-existent key", async () => {
      vi.mocked(mockKV.get as any).mockResolvedValue(null);

      const result = await validateApiKey(mockKV as KVNamespace, "cm_nonexistent");

      expect(result.valid).toBe(false);
      expect(result.userId).toBeUndefined();
    });

    it("returns valid with user ID for registered key", async () => {
      const testKey = "cm_test123";
      const hash = await hashApiKey(testKey);

      vi.mocked(mockKV.get as any).mockResolvedValue(
        JSON.stringify({ created: "2024-01-01" }),
      );

      const result = await validateApiKey(mockKV as KVNamespace, testKey);

      expect(result.valid).toBe(true);
      expect(result.userId).toBe(hash.substring(0, 16));
    });

    it("checks KV with correct key format", async () => {
      const testKey = "cm_test123";
      const hash = await hashApiKey(testKey);

      vi.mocked(mockKV.get as any).mockResolvedValue(
        JSON.stringify({ created: "2024-01-01" }),
      );

      await validateApiKey(mockKV as KVNamespace, testKey);

      expect(mockKV.get).toHaveBeenCalledWith(`apikey:${hash}`);
    });

    it("returns invalid on KV error", async () => {
      vi.mocked(mockKV.get as any).mockRejectedValue(new Error("KV error"));

      const result = await validateApiKey(mockKV as KVNamespace, "cm_test123");

      expect(result.valid).toBe(false);
    });

    it("handles empty string as invalid key", async () => {
      const result = await validateApiKey(mockKV as KVNamespace, "");

      expect(result.valid).toBe(false);
    });

    it("user ID is consistent across calls", async () => {
      const testKey = "cm_persistent";
      const hash = await hashApiKey(testKey);
      const expectedUserId = hash.substring(0, 16);

      vi.mocked(mockKV.get as any).mockResolvedValue(
        JSON.stringify({ created: "2024-01-01" }),
      );

      const result1 = await validateApiKey(mockKV as KVNamespace, testKey);
      const result2 = await validateApiKey(mockKV as KVNamespace, testKey);

      expect(result1.userId).toBe(expectedUserId);
      expect(result2.userId).toBe(expectedUserId);
      expect(result1.userId).toBe(result2.userId);
    });
  });

  describe("integration", () => {
    it("key generation -> hashing -> user ID derivation works end-to-end", async () => {
      // Generate new key
      const apiKey = generateApiKey();
      expect(apiKey).toMatch(/^cm_/);

      // Hash it
      const hash = await hashApiKey(apiKey);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);

      // Derive user ID
      const userId = await getUserIdFromApiKey(apiKey);
      expect(userId).toMatch(/^[0-9a-f]{16}$/);

      // User ID should match first 16 chars of hash
      expect(userId).toBe(hash.substring(0, 16));
    });

    it("multiple keys produce different user IDs", async () => {
      const keys = [generateApiKey(), generateApiKey(), generateApiKey()];

      const userIds = await Promise.all(
        keys.map((key) => getUserIdFromApiKey(key)),
      );

      // All user IDs should be unique
      const uniqueIds = new Set(userIds);
      expect(uniqueIds.size).toBe(3);
    });

    it("validation flow works correctly", async () => {
      const testMockKV: Record<string, any> = {
        get: vi.fn(),
      };

      const apiKey = generateApiKey();
      const hash = await hashApiKey(apiKey);
      const expectedUserId = hash.substring(0, 16);

      // Simulate key stored in KV
      vi.mocked(testMockKV.get as any).mockResolvedValue(
        JSON.stringify({ created: new Date().toISOString() }),
      );

      const { valid, userId } = await validateApiKey(
        testMockKV as KVNamespace,
        apiKey,
      );

      expect(valid).toBe(true);
      expect(userId).toBe(expectedUserId);
      expect(testMockKV.get).toHaveBeenCalledWith(`apikey:${hash}`);
    });
  });
});
