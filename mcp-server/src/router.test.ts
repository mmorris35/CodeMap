/**
 * Tests for Hono router and middleware
 * Validates all routes, middleware, error handling, and CORS
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import app from "./router";

/**
 * Mock KV namespace for testing
 */
const mockKV = {
  get: vi.fn(),
  put: vi.fn(),
  delete: vi.fn(),
  list: vi.fn(),
  getWithMetadata: vi.fn(),
};

/**
 * Mock Bindings for testing
 */
const mockBindings = {
  CODEMAP_KV: mockKV as unknown as KVNamespace,
  API_KEY: "test-api-key",
  ENVIRONMENT: "development" as const,
};

describe("Router - API Info Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET / returns API info with correct structure", async () => {
    const request = new Request("http://localhost/");
    const response = await app.fetch(request, mockBindings);

    expect(response.status).toBe(200);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.name).toBe("CodeMap MCP Server");
    expect(data.version).toBe("1.0.0");
    expect(Array.isArray(data.endpoints)).toBe(true);
    expect(data.environment).toBe("development");
  });

  it("GET / includes all required endpoints", async () => {
    const request = new Request("http://localhost/");
    const response = await app.fetch(request, mockBindings);

    const data = (await response.json()) as Record<string, unknown>;
    const endpoints = data.endpoints as string[];
    expect(endpoints).toContain("/health");
    expect(endpoints).toContain("/health/ready");
    expect(endpoints).toContain("/mcp");
    expect(endpoints).toContain("/projects");
  });
});

describe("Router - Health Check Routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET /health returns 200 with status and timestamp", async () => {
    const request = new Request("http://localhost/health");
    const response = await app.fetch(request, mockBindings);

    expect(response.status).toBe(200);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.status).toBe("healthy");
    expect(typeof data.timestamp).toBe("string");
    expect(data.environment).toBe("development");
  });

  it("GET /health returns ISO 8601 timestamp", async () => {
    const request = new Request("http://localhost/health");
    const response = await app.fetch(request, mockBindings);

    const data = (await response.json()) as Record<string, unknown>;
    const timestamp = new Date(data.timestamp as string);
    expect(timestamp).toBeInstanceOf(Date);
    expect(timestamp.getTime()).toBeGreaterThan(0);
  });

  it("GET /health/ready returns 200 when KV is connected", async () => {
    mockKV.get.mockResolvedValue(null);

    const request = new Request("http://localhost/health/ready");
    const response = await app.fetch(request, mockBindings);

    expect(response.status).toBe(200);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.status).toBe("healthy");
    expect(data.kv).toBe("connected");
    expect(typeof data.timestamp).toBe("string");
  });

  it("GET /health/ready returns 503 when KV is disconnected", async () => {
    mockKV.get.mockRejectedValue(new Error("KV connection failed"));

    const request = new Request("http://localhost/health/ready");
    const response = await app.fetch(request, mockBindings);

    expect(response.status).toBe(503);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.status).toBe("not_ready");
    expect(data.kv).toBe("disconnected");
  });

  it("GET /health/ready checks KV connectivity", async () => {
    mockKV.get.mockResolvedValue(null);

    const request = new Request("http://localhost/health/ready");
    await app.fetch(request, mockBindings);

    expect(mockKV.get).toHaveBeenCalledWith("__health_check__");
  });
});

describe("Router - CORS Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Response includes CORS headers", async () => {
    const request = new Request("http://localhost/", {
      headers: {
        Origin: "http://localhost:3000",
      },
    });
    const response = await app.fetch(request, mockBindings);

    const corsHeader = response.headers.get("access-control-allow-origin");
    expect(corsHeader).toBeTruthy();
  });

  it("Supports OPTIONS preflight requests", async () => {
    const request = new Request("http://localhost/health", {
      method: "OPTIONS",
      headers: {
        Origin: "http://localhost:3000",
      },
    });
    const response = await app.fetch(request, mockBindings);

    expect([200, 204]).toContain(response.status);
  });
});

describe("Router - Error Handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Returns 404 for undefined routes", async () => {
    const request = new Request("http://localhost/nonexistent");
    const response = await app.fetch(request, mockBindings);

    expect(response.status).toBe(404);
  });

  it("Error responses return content", async () => {
    const request = new Request("http://localhost/nonexistent");
    const response = await app.fetch(request, mockBindings);

    const text = await response.text();
    expect(text.length).toBeGreaterThan(0);
  });
});

describe("Router - Logging Middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Processes requests with logger middleware", async () => {
    const request = new Request("http://localhost/health");
    const response = await app.fetch(request, mockBindings);

    expect(response.status).toBe(200);
  });

  it("Logger middleware does not affect response", async () => {
    const request = new Request("http://localhost/");
    const response = await app.fetch(request, mockBindings);

    expect(response.status).toBe(200);
    const contentType = response.headers.get("content-type");
    expect(contentType).toContain("application/json");
  });
});

describe("Router - Content Type Headers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("GET / returns JSON content-type", async () => {
    const request = new Request("http://localhost/");
    const response = await app.fetch(request, mockBindings);

    const contentType = response.headers.get("content-type");
    expect(contentType).toContain("application/json");
  });

  it("GET /health returns JSON content-type", async () => {
    const request = new Request("http://localhost/health");
    const response = await app.fetch(request, mockBindings);

    const contentType = response.headers.get("content-type");
    expect(contentType).toContain("application/json");
  });

  it("GET /health/ready returns JSON content-type", async () => {
    mockKV.get.mockResolvedValue(null);

    const request = new Request("http://localhost/health/ready");
    const response = await app.fetch(request, mockBindings);

    const contentType = response.headers.get("content-type");
    expect(contentType).toContain("application/json");
  });
});

describe("Router - Multiple Requests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Handles multiple sequential requests", async () => {
    mockKV.get.mockResolvedValue(null);

    const req1 = new Request("http://localhost/health");
    const res1 = await app.fetch(req1, mockBindings);
    expect(res1.status).toBe(200);

    const req2 = new Request("http://localhost/health/ready");
    const res2 = await app.fetch(req2, mockBindings);
    expect(res2.status).toBe(200);

    const req3 = new Request("http://localhost/");
    const res3 = await app.fetch(req3, mockBindings);
    expect(res3.status).toBe(200);
  });

  it("Handles rapid health checks", async () => {
    mockKV.get.mockResolvedValue(null);

    const requests = Array.from(
      { length: 5 },
      () => new Request("http://localhost/health/ready"),
    );

    const responses = await Promise.all(
      requests.map((req) => app.fetch(req, mockBindings)),
    );

    responses.forEach((res) => {
      expect(res.status).toBe(200);
    });
  });
});

describe("Router - MCP Protocol Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("POST /mcp accepts JSON-RPC requests", async () => {
    const request = new Request("http://localhost/mcp", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
      }),
    });

    const response = await app.fetch(request, mockBindings);

    expect(response.status).toBe(200);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.jsonrpc).toBe("2.0");
    expect(data.id).toBe(1);
    expect("result" in data).toBe(true);
  });

  it("POST /mcp initialize returns server capabilities", async () => {
    const request = new Request("http://localhost/mcp", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
      }),
    });

    const response = await app.fetch(request, mockBindings);
    const data = (await response.json()) as any;

    expect(data.result.serverInfo).toBeDefined();
    expect(data.result.serverInfo.name).toBe("codemap-mcp");
    expect(data.result.capabilities).toBeDefined();
  });

  it("POST /mcp tools/list returns available tools", async () => {
    const request = new Request("http://localhost/mcp", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "tools/list",
      }),
    });

    const response = await app.fetch(request, mockBindings);
    const data = (await response.json()) as any;

    expect(data.result.tools).toBeDefined();
    expect(Array.isArray(data.result.tools)).toBe(true);
    expect(data.result.tools.length).toBe(4);
  });

  it("POST /mcp resources/list returns available resources", async () => {
    const request = new Request("http://localhost/mcp", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "resources/list",
      }),
    });

    const response = await app.fetch(request, mockBindings);
    const data = (await response.json()) as any;

    expect(data.result.resources).toBeDefined();
    expect(Array.isArray(data.result.resources)).toBe(true);
  });

  it("POST /mcp returns parse error for invalid JSON", async () => {
    const request = new Request("http://localhost/mcp", {
      method: "POST",
      body: "{invalid json",
    });

    const response = await app.fetch(request, mockBindings);

    expect(response.status).toBe(400);
    const data = (await response.json()) as any;
    expect(data.error.code).toBe(-32700);
    expect(data.error.message).toContain("Parse error");
  });

  it("POST /mcp returns method not found error", async () => {
    const request = new Request("http://localhost/mcp", {
      method: "POST",
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "unknown_method",
      }),
    });

    const response = await app.fetch(request, mockBindings);
    const data = (await response.json()) as any;

    expect(data.error.code).toBe(-32601);
  });

  it("POST /mcp handles malformed requests gracefully", async () => {
    const request = new Request("http://localhost/mcp", {
      method: "POST",
      body: JSON.stringify({
        id: 1,
        method: "initialize",
        // missing jsonrpc
      }),
    });

    const response = await app.fetch(request, mockBindings);
    const data = (await response.json()) as any;

    expect(data.error).toBeDefined();
    expect(data.error.code).toBe(-32600);
  });
});
