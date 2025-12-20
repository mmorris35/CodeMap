/**
 * Tests for API key registration endpoint
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { handleRegister } from "./register";

describe("POST /register - API Key Registration", () => {
  let mockKV: Record<string, any>;
  let mockEnv: Record<string, any>;
  let mockContext: any;

  beforeEach(() => {
    // Reset mocks
    mockKV = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    };

    mockEnv = {
      CODEMAP_KV: mockKV,
      ENVIRONMENT: "test",
    };

    // Create mock Hono context
    // We need to return a Response-like object with parsed data
    const createMockResponse = (data: any, status: number) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    };

    mockContext = {
      env: mockEnv,
      req: {
        header: vi.fn((name: string) => {
          const headers: Record<string, string> = {
            "CF-Connecting-IP": "192.168.1.100",
          };
          return headers[name];
        }),
      },
      json: vi.fn((data: any, status?: number) => {
        return createMockResponse(data, status || 200);
      }),
    };
  });

  describe("successful registration", () => {
    it("generates and returns a new API key on success", async () => {
      // Mock KV operations
      mockKV.get.mockResolvedValue(null); // No existing rate limit
      mockKV.put.mockResolvedValue(undefined);

      const result = await handleRegister(mockContext);
      const data = await result.json() as any;

      // Verify response
      expect(result.status).toBe(201);
      expect(data.api_key).toBeDefined();
      expect(data.api_key).toMatch(/^cm_[a-zA-Z0-9]+$/);
      expect(data.message).toContain("cannot be retrieved again");
      expect(data.created_at).toBeDefined();
    });

    it("stores the hashed key in KV", async () => {
      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      await handleRegister(mockContext);

      // Verify put was called with apikey: prefix
      expect(mockKV.put).toHaveBeenCalled();
      const calls = (mockKV.put as any).mock.calls;
      const keyStoreCalls = calls.filter((call: any[]) =>
        call[0].startsWith("apikey:"),
      );
      expect(keyStoreCalls.length).toBeGreaterThan(0);
    });

    it("includes usage instructions in response", async () => {
      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      const result = await handleRegister(mockContext);
      const data = await result.json() as any;

      expect(data.instructions).toBeDefined();
      expect(data.instructions.upload).toContain("Authorization: Bearer");
      expect(data.instructions.query).toContain("Authorization: Bearer");
    });

    it("stores metadata with IP address", async () => {
      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      await handleRegister(mockContext);

      const calls = (mockKV.put as any).mock.calls;
      const keyStoreCalls = calls.filter((call: any[]) =>
        call[0].startsWith("apikey:"),
      );
      expect(keyStoreCalls.length).toBeGreaterThan(0);

      const storedData = JSON.parse(keyStoreCalls[0][1]);
      expect(storedData.ip_address).toBe("192.168.1.100");
      expect(storedData.created_at).toBeDefined();
    });
  });

  describe("rate limiting", () => {
    it("allows first 5 registrations from an IP", async () => {
      // Simulate 4 existing registrations
      mockKV.get.mockResolvedValue(
        JSON.stringify({
          count: 4,
          resetTime: Date.now() + 3600000,
        }),
      );
      mockKV.put.mockResolvedValue(undefined);

      const result = await handleRegister(mockContext);

      // Should succeed
      expect(result.status).toBe(201);
    });

    it("rejects 6th registration from same IP with 429 status", async () => {
      // Simulate 5 existing registrations
      mockKV.get.mockResolvedValue(
        JSON.stringify({
          count: 5,
          resetTime: Date.now() + 3600000,
        }),
      );
      mockKV.put.mockResolvedValue(undefined);

      const result = await handleRegister(mockContext);
      const data = await result.json() as any;

      // Should fail with 429
      expect(result.status).toBe(429);
      expect(data.error).toBe("Rate limit exceeded");
      expect(data.message).toContain("5 registrations");
    });

    it("includes retry_after in rate limit response", async () => {
      mockKV.get.mockResolvedValue(
        JSON.stringify({
          count: 5,
          resetTime: Date.now() + 1800000, // 30 minutes from now
        }),
      );

      const result = await handleRegister(mockContext);
      const data = await result.json() as any;

      expect(result.status).toBe(429);
      expect(data.retry_after).toBeDefined();
      expect(data.retry_after).toBeGreaterThan(0);
      expect(data.retry_after).toBeLessThanOrEqual(1800);
    });

    it("resets counter after 1 hour", async () => {
      const oneHourAgo = Date.now() - 3600000;
      mockKV.get.mockResolvedValue(
        JSON.stringify({
          count: 5,
          resetTime: oneHourAgo, // Already expired
        }),
      );
      mockKV.put.mockResolvedValue(undefined);

      const result = await handleRegister(mockContext);

      // Should succeed (counter reset)
      expect(result.status).toBe(201);
    });

    it("tracks rate limit per IP address", async () => {
      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      await handleRegister(mockContext);

      // Verify rate limit key includes IP
      const calls = (mockKV.put as any).mock.calls;
      const rateLimitCalls = calls.filter((call: any[]) =>
        call[0].includes("ratelimit:register"),
      );
      expect(rateLimitCalls[0][0]).toContain("192.168.1.100");
    });
  });

  describe("IP address detection", () => {
    it("prefers CF-Connecting-IP header", async () => {
      mockContext.req.header.mockImplementation((name: string) => {
        if (name === "CF-Connecting-IP") return "10.0.0.1";
        if (name === "X-Forwarded-For") return "10.0.0.2";
        return undefined;
      });

      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      await handleRegister(mockContext);

      const calls = (mockKV.put as any).mock.calls;
      const rateLimitCalls = calls.filter((call: any[]) =>
        call[0].includes("ratelimit:register"),
      );
      expect(rateLimitCalls[0][0]).toContain("10.0.0.1");
    });

    it("falls back to X-Forwarded-For header", async () => {
      mockContext.req.header.mockImplementation((name: string) => {
        if (name === "X-Forwarded-For") return "10.0.0.2, 10.0.0.3";
        return undefined;
      });

      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      await handleRegister(mockContext);

      const calls = (mockKV.put as any).mock.calls;
      const rateLimitCalls = calls.filter((call: any[]) =>
        call[0].includes("ratelimit:register"),
      );
      expect(rateLimitCalls[0][0]).toContain("10.0.0.2");
    });

    it("uses 'unknown' when no IP headers present", async () => {
      mockContext.req.header.mockReturnValue(undefined);

      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      await handleRegister(mockContext);

      const calls = (mockKV.put as any).mock.calls;
      const rateLimitCalls = calls.filter((call: any[]) =>
        call[0].includes("ratelimit:register"),
      );
      expect(rateLimitCalls[0][0]).toContain("unknown");
    });
  });

  describe("API key format", () => {
    it("generates keys with cm_ prefix", async () => {
      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      const result = await handleRegister(mockContext);
      const data = await result.json() as any;

      expect(data.api_key).toMatch(/^cm_/);
    });

    it("generates unique keys on each call", async () => {
      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      const result1 = await handleRegister(mockContext);
      const data1 = await result1.json() as any;

      const result2 = await handleRegister(mockContext);
      const data2 = await result2.json() as any;

      expect(data1.api_key).not.toBe(data2.api_key);
    });

    it("generates keys with sufficient entropy (base62 encoded)", async () => {
      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      const result = await handleRegister(mockContext);
      const data = await result.json() as any;
      const keyWithoutPrefix = data.api_key.replace(/^cm_/, "");

      // Base62 encoded keys will be 33 chars (one per byte of entropy)
      expect(keyWithoutPrefix.length).toBeGreaterThanOrEqual(33);
    });
  });

  describe("error handling", () => {
    it("returns 500 on KV put error", async () => {
      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockRejectedValue(new Error("KV write failed"));

      const result = await handleRegister(mockContext);
      const data = await result.json() as any;

      expect(result.status).toBe(500);
      expect(data.error).toBe("Registration failed");
    });

    it("allows registration on rate limit check failure (fail-open)", async () => {
      mockKV.get.mockRejectedValue(new Error("KV read failed"));
      mockKV.put.mockResolvedValue(undefined);

      const result = await handleRegister(mockContext);

      // Should succeed - fail open
      expect(result.status).toBe(201);
    });

    it("includes helpful error messages", async () => {
      mockKV.get.mockResolvedValue(
        JSON.stringify({
          count: 5,
          resetTime: Date.now() + 3600000,
        }),
      );

      const result = await handleRegister(mockContext);
      const data = await result.json() as any;

      expect(data.message).toBeDefined();
      expect(data.message.length).toBeGreaterThan(0);
    });
  });

  describe("response format", () => {
    it("returns 201 Created status on success", async () => {
      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      const result = await handleRegister(mockContext);

      expect(result.status).toBe(201);
    });

    it("includes created_at timestamp in ISO format", async () => {
      mockKV.get.mockResolvedValue(null);
      mockKV.put.mockResolvedValue(undefined);

      const result = await handleRegister(mockContext);
      const data = await result.json() as any;

      expect(data.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("never returns plaintext key in error responses", async () => {
      mockKV.get.mockResolvedValue(
        JSON.stringify({
          count: 5,
          resetTime: Date.now() + 3600000,
        }),
      );

      const result = await handleRegister(mockContext);
      const data = await result.json() as any;

      expect(result.status).toBe(429);
      expect(data.api_key).toBeUndefined();
    });
  });
});
