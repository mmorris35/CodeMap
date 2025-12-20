/**
 * Hono router for CodeMap MCP Server
 * Configures all middleware and routes for the Cloudflare Worker
 */

import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";

import type { Bindings, HealthResponse, APIInfoResponse } from "./types";
import { handleMcpRequest } from "./mcp/handler";
import { CodeMapStorage } from "./storage";
import projectsRouter from "./routes/projects";
import { handleRegister } from "./routes/register";
import { validateApiKey } from "./auth";

/**
 * Create and configure the Hono application
 * Sets up middleware for CORS, logging, and error handling
 */
export const app = new Hono<{ Bindings: Bindings }>();

/**
 * CORS middleware - allow all origins for MCP clients
 * MCP clients may come from various domains, so we enable CORS globally
 */
app.use("*", cors());

/**
 * Request logging middleware
 * Logs all incoming requests in dev console
 */
app.use("*", logger());

/**
 * Error handling middleware
 * Catches errors and returns structured JSON responses
 */
app.onError((err, c) => {
  const status = (err as { status?: number }).status || 500;
  const message = err.message || "Internal server error";

  return c.json(
    {
      error: {
        code: status,
        message: message,
      },
    },
    status as any,
  );
});

/**
 * GET / - API info endpoint
 * Returns information about the server and available endpoints
 *
 * @returns API info with version and available endpoints
 */
app.get("/", (c) => {
  const response: APIInfoResponse = {
    name: "CodeMap MCP Server",
    version: "1.0.0",
    endpoints: ["/health", "/health/ready", "/register", "/mcp", "/projects"],
    environment: c.env.ENVIRONMENT,
  };
  return c.json(response);
});

/**
 * GET /health - Basic health check endpoint
 * Returns immediately without checking dependencies
 *
 * @returns Health status and current timestamp
 */
app.get("/health", (c) => {
  const response: HealthResponse = {
    status: "healthy",
    timestamp: new Date().toISOString(),
    environment: c.env.ENVIRONMENT,
  };
  return c.json(response);
});

/**
 * GET /health/ready - Readiness check endpoint
 * Checks that all dependencies (KV) are accessible
 * Returns 503 Service Unavailable if KV is not connected
 *
 * @returns Ready status if all checks pass, or error if dependencies unavailable
 */
app.get("/health/ready", async (c) => {
  try {
    // Test KV connectivity by attempting a simple operation
    await c.env.CODEMAP_KV.get("__health_check__");

    const response: HealthResponse = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      kv: "connected",
      environment: c.env.ENVIRONMENT,
    };
    return c.json(response);
  } catch (error) {
    const response: HealthResponse = {
      status: "not_ready",
      timestamp: new Date().toISOString(),
      kv: "disconnected",
      environment: c.env.ENVIRONMENT,
    };
    return c.json(response, 503);
  }
});

/**
 * POST /register - API key self-service registration
 * Public endpoint (no authentication required)
 * Rate-limited to 5 registrations per IP per hour
 * Returns new API key that user must save (only time it's visible)
 */
app.post("/register", handleRegister);

/**
 * Mount projects router at /projects
 * Handles project management with API key authentication
 */
app.route("/projects", projectsRouter);

/**
 * POST /mcp - MCP Protocol endpoint
 * Handles JSON-RPC 2.0 requests for MCP protocol
 * Requires API key authentication via Bearer token in Authorization header
 *
 * @returns JSON-RPC 2.0 response
 */
app.post("/mcp", async (c) => {
  try {
    // Extract API key from Authorization header
    const authHeader = c.req.header("Authorization");
    const apiKey = authHeader?.replace("Bearer ", "");

    // Validate API key and get user ID
    const { valid, userId: validatedUserId } = await validateApiKey(
      c.env.CODEMAP_KV,
      apiKey,
    );

    // If API key is invalid, use anonymous user (for backward compatibility with unauthenticated requests)
    // In production, you might want to require authentication
    const userId = valid && validatedUserId ? validatedUserId : "anonymous";

    // Get request body
    const body = await c.req.text();

    // Create storage instance
    const storage = new CodeMapStorage(c.env.CODEMAP_KV);

    // Parse request and handle MCP protocol
    const request = JSON.parse(body);
    const response = await handleMcpRequest(request, storage, userId);

    return c.json(response);
  } catch (error) {
    // Return parse error if JSON is malformed
    if (error instanceof SyntaxError) {
      return c.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32700,
            message: "Parse error",
          },
        },
        400,
      );
    }

    // Return internal error for other exceptions
    return c.json(
      {
        jsonrpc: "2.0",
        id: null,
        error: {
          code: -32603,
          message: "Internal error",
        },
      },
      500,
    );
  }
});

export default app;
