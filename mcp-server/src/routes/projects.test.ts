/**
 * Tests for project management REST API routes
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { app } from "../router";
import type { CodeMap } from "../storage";

// Mock CodeMap data for testing
const mockCodeMap: CodeMap = {
  version: "1.0",
  generated_at: "2024-01-01T00:00:00Z",
  source_root: "/app",
  symbols: [
    {
      qualified_name: "auth.validate",
      kind: "function",
      file: "src/auth.ts",
      line: 10,
      signature: "validate(token: string): boolean",
    },
  ],
  dependencies: [
    {
      from_sym: "api.handler",
      to_sym: "auth.validate",
      kind: "calls",
    },
  ],
};

describe("projects routes", () => {
  let mockKV: Record<string, any>;
  let mockEnv: Record<string, any>;

  beforeEach(() => {
    mockKV = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      list: vi.fn(),
    };

    mockEnv = {
      CODEMAP_KV: mockKV,
      API_KEY: "test-api-key",
      ENVIRONMENT: "test",
    };
  });

  describe("authentication middleware", () => {
    it("rejects request without Authorization header", async () => {
      const req = new Request("http://localhost/projects", { method: "GET" });
      const response = await app.fetch(req, mockEnv);

      expect(response.status).toBe(401);
      const json = (await response.json()) as any;
      expect(json.error).toBe("Unauthorized");
    });

    it("rejects request with invalid API key", async () => {
      vi.mocked(mockKV.get as any).mockResolvedValue(null);

      const req = new Request("http://localhost/projects", {
        method: "GET",
        headers: { Authorization: "Bearer cm_invalid" },
      });

      const response = await app.fetch(req, mockEnv);

      expect(response.status).toBe(401);
    });

    it("accepts request with valid API key", async () => {
      // Mock valid key storage
      vi.mocked(mockKV.get as any).mockResolvedValue(
        JSON.stringify({ created: "2024-01-01" }),
      );

      vi.mocked(mockKV.list as any).mockResolvedValue({
        keys: [],
        list_complete: true,
        cacheStatus: null,
      });

      const req = new Request("http://localhost/projects", {
        method: "GET",
        headers: { Authorization: "Bearer cm_testkey123" },
      });

      const response = await app.fetch(req, mockEnv);

      // Should not be 401
      expect(response.status).not.toBe(401);
    });
  });

  describe("GET /projects - list projects", () => {
    it("returns empty list when user has no projects", async () => {
      vi.mocked(mockKV.get as any).mockResolvedValue(
        JSON.stringify({ created: "2024-01-01" }),
      );

      vi.mocked(mockKV.list as any).mockResolvedValue({
        keys: [],
        list_complete: true,
        cacheStatus: null,
      });

      const req = new Request("http://localhost/projects", {
        method: "GET",
        headers: { Authorization: "Bearer cm_testkey123" },
      });

      const response = await app.fetch(req, mockEnv);

      expect(response.status).toBe(200);
      const json = (await response.json()) as any;
      expect(json.projects).toEqual([]);
      expect(json.count).toBe(0);
    });

    it("returns list of user's projects", async () => {
      // Get the user ID from the API key to match the prefix
      vi.mocked(mockKV.get as any).mockImplementation((key: string) => {
        if (key.startsWith("apikey:")) {
          // Auth validation
          return Promise.resolve(JSON.stringify({ created: "2024-01-01" }));
        }
        // This won't be called for list, so just return null
        return Promise.resolve(null);
      });

      // Mock list with proper prefix matching
      vi.mocked(mockKV.list as any).mockImplementation((opts: any) => {
        if (opts.prefix && opts.prefix.includes(":project:")) {
          // Return keys that start with the requested prefix
          const prefix = opts.prefix;
          return Promise.resolve({
            keys: [
              { name: `${prefix}my-app` },
              { name: `${prefix}another-app` },
            ],
            list_complete: true,
            cacheStatus: null,
          });
        }
        return Promise.resolve({
          keys: [],
          list_complete: true,
          cacheStatus: null,
        });
      });

      const req = new Request("http://localhost/projects", {
        method: "GET",
        headers: { Authorization: "Bearer cm_testkey123" },
      });

      const response = await app.fetch(req, mockEnv);

      expect(response.status).toBe(200);
      const json = (await response.json()) as any;
      expect(json.projects).toEqual(["my-app", "another-app"]);
      expect(json.count).toBe(2);
    });
  });

  describe("POST /projects/:id/code_map - upload CODE_MAP.json", () => {
    it("stores CODE_MAP.json and returns 201", async () => {
      vi.mocked(mockKV.get as any).mockResolvedValue(
        JSON.stringify({ created: "2024-01-01" }),
      );

      vi.mocked(mockKV.put as any).mockResolvedValue(undefined);

      const req = new Request(
        "http://localhost/projects/my-app/code_map",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer cm_testkey123",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(mockCodeMap),
        },
      );

      const response = await app.fetch(req, mockEnv);

      expect(response.status).toBe(201);
      const json = (await response.json()) as any;
      expect(json.message).toBe("Uploaded");
      expect(json.project_id).toBe("my-app");
    });

    it("rejects invalid JSON", async () => {
      vi.mocked(mockKV.get as any).mockResolvedValue(
        JSON.stringify({ created: "2024-01-01" }),
      );

      const req = new Request(
        "http://localhost/projects/my-app/code_map",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer cm_testkey123",
            "Content-Type": "application/json",
          },
          body: "invalid json",
        },
      );

      const response = await app.fetch(req, mockEnv);

      expect(response.status).toBe(400);
      const json = (await response.json()) as any;
      expect(json.error).toBe("Invalid JSON");
    });

    it("rejects CODE_MAP with missing required fields", async () => {
      vi.mocked(mockKV.get as any).mockResolvedValue(
        JSON.stringify({ created: "2024-01-01" }),
      );

      const incompleteCodeMap = {
        version: "1.0",
        // Missing required fields
      };

      const req = new Request(
        "http://localhost/projects/my-app/code_map",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer cm_testkey123",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(incompleteCodeMap),
        },
      );

      const response = await app.fetch(req, mockEnv);

      expect(response.status).toBe(400);
    });

    it("stores in user-scoped KV key", async () => {
      vi.mocked(mockKV.get as any).mockResolvedValue(
        JSON.stringify({ created: "2024-01-01" }),
      );

      vi.mocked(mockKV.put as any).mockResolvedValue(undefined);

      const req = new Request(
        "http://localhost/projects/test-proj/code_map",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer cm_testkey123",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(mockCodeMap),
        },
      );

      await app.fetch(req, mockEnv);

      // Verify put was called with user-scoped key
      const putCall = vi.mocked(mockKV.put as any).mock.calls.find(
        (call: any[]) => typeof call[0] === "string" && call[0].includes(":project:"),
      );

      expect(putCall).toBeDefined();
      if (putCall) {
        const keyUsed = putCall[0] as string;
        expect(keyUsed).toMatch(/^user:[0-9a-f]{16}:project:test-proj$/);
      }
    });

    it("allows uploading same project multiple times (overwrite)", async () => {
      vi.mocked(mockKV.get as any).mockResolvedValue(
        JSON.stringify({ created: "2024-01-01" }),
      );

      vi.mocked(mockKV.put as any).mockResolvedValue(undefined);

      const req1 = new Request(
        "http://localhost/projects/my-app/code_map",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer cm_testkey123",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(mockCodeMap),
        },
      );

      const response1 = await app.fetch(req1, mockEnv);
      expect(response1.status).toBe(201);

      // Reset mocks to count only new calls
      vi.clearAllMocks();
      vi.mocked(mockKV.get as any).mockResolvedValue(
        JSON.stringify({ created: "2024-01-01" }),
      );
      vi.mocked(mockKV.put as any).mockResolvedValue(undefined);

      // Upload again
      const req2 = new Request(
        "http://localhost/projects/my-app/code_map",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer cm_testkey123",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(mockCodeMap),
        },
      );

      const response2 = await app.fetch(req2, mockEnv);
      expect(response2.status).toBe(201);

      // Should have called put at least once on second request
      expect(mockKV.put).toHaveBeenCalled();
    });
  });

  describe("GET /projects/:id/code_map - retrieve CODE_MAP.json", () => {
    it("returns stored CODE_MAP.json", async () => {
      // Two calls: once for auth validation, once for getting the code map
      let callCount = 0;
      vi.mocked(mockKV.get as any).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call: auth validation
          return Promise.resolve(JSON.stringify({ created: "2024-01-01" }));
        }
        // Second call: getting the code map
        return Promise.resolve(JSON.stringify(mockCodeMap));
      });

      const req = new Request(
        "http://localhost/projects/my-app/code_map",
        {
          method: "GET",
          headers: { Authorization: "Bearer cm_testkey123" },
        },
      );

      const response = await app.fetch(req, mockEnv);

      expect(response.status).toBe(200);
      const json = (await response.json()) as any;
      expect(json.version).toBe("1.0");
      expect(json.symbols.length).toBeGreaterThan(0);
    });

    it("returns 404 for non-existent project", async () => {
      vi.mocked(mockKV.get as any)
        .mockResolvedValueOnce(JSON.stringify({ created: "2024-01-01" }))
        .mockResolvedValueOnce(null);

      const req = new Request(
        "http://localhost/projects/nonexistent/code_map",
        {
          method: "GET",
          headers: { Authorization: "Bearer cm_testkey123" },
        },
      );

      const response = await app.fetch(req, mockEnv);

      expect(response.status).toBe(404);
      const json = (await response.json()) as any;
      expect(json.error).toBe("Not Found");
    });
  });

  describe("DELETE /projects/:id - delete project", () => {
    it("deletes project and returns 204", async () => {
      vi.mocked(mockKV.get as any).mockResolvedValue(
        JSON.stringify({ created: "2024-01-01" }),
      );

      vi.mocked(mockKV.delete as any).mockResolvedValue(undefined);

      const req = new Request(
        "http://localhost/projects/my-app",
        {
          method: "DELETE",
          headers: { Authorization: "Bearer cm_testkey123" },
        },
      );

      const response = await app.fetch(req, mockEnv);

      expect(response.status).toBe(204);
    });

    it("returns 204 even if project doesn't exist", async () => {
      vi.mocked(mockKV.get as any).mockResolvedValue(
        JSON.stringify({ created: "2024-01-01" }),
      );

      vi.mocked(mockKV.delete as any).mockResolvedValue(undefined);

      const req = new Request(
        "http://localhost/projects/nonexistent",
        {
          method: "DELETE",
          headers: { Authorization: "Bearer cm_testkey123" },
        },
      );

      const response = await app.fetch(req, mockEnv);

      expect(response.status).toBe(204);
    });
  });

  describe("error handling", () => {
    it("handles large CODE_MAP uploads", async () => {
      vi.mocked(mockKV.get as any).mockResolvedValue(
        JSON.stringify({ created: "2024-01-01" }),
      );

      vi.mocked(mockKV.put as any).mockResolvedValue(undefined);

      // Create large CODE_MAP
      const largeCodeMap = {
        ...mockCodeMap,
        symbols: Array.from({ length: 1000 }, (_, i) => ({
          qualified_name: `sym${i}`,
          kind: "function" as const,
          file: `file${i}.ts`,
          line: i + 1,
        })),
      };

      const req = new Request(
        "http://localhost/projects/large-app/code_map",
        {
          method: "POST",
          headers: {
            Authorization: "Bearer cm_testkey123",
            "Content-Type": "application/json",
          },
          body: JSON.stringify(largeCodeMap),
        },
      );

      const response = await app.fetch(req, mockEnv);

      expect(response.status).toBe(201);
    });
  });
});
