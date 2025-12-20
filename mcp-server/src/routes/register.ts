/**
 * API key self-service registration endpoint
 * Allows users to generate their own API keys without authentication
 * Rate-limited to prevent abuse
 */

import type { Bindings } from "../types";
import { Hono } from "hono";
import { generateApiKey, hashApiKey } from "../auth";

/**
 * Rate limit tracker stored in KV
 * Key format: `ratelimit:register:{ipAddress}` -> JSON with count and timestamp
 */
interface RateLimitData {
  count: number;
  resetTime: number;
}

/**
 * Extract client IP from request
 * Uses CF-Connecting-IP header (set by Cloudflare) or falls back to remote IP
 *
 * @param c - Hono context
 * @returns Client IP address
 */
function getClientIp(c: any): string {
  // Cloudflare sets this header when proxying
  const cfIp = c.req.header("CF-Connecting-IP");
  if (cfIp) return cfIp;

  // Fallback to X-Forwarded-For (if behind proxy)
  const xForwarded = c.req.header("X-Forwarded-For");
  if (xForwarded) return xForwarded.split(",")[0].trim();

  // Fallback to request remote IP
  return "unknown";
}

/**
 * Check rate limit for client IP
 * Allows 5 registrations per hour per IP
 *
 * @param kv - KV namespace
 * @param ipAddress - Client IP address
 * @returns Object with allowed (boolean), requestCount, and retryAfter (seconds)
 */
async function checkRateLimit(
  kv: KVNamespace,
  ipAddress: string,
): Promise<{
  allowed: boolean;
  requestCount: number;
  retryAfter: number;
}> {
  const rateLimitKey = `ratelimit:register:${ipAddress}`;
  const now = Date.now();
  const oneHourMs = 3600 * 1000;

  try {
    // Get current rate limit data
    const stored = await kv.get(rateLimitKey);
    let data: RateLimitData;

    if (stored) {
      data = JSON.parse(stored);

      // Check if the hour has passed
      if (now > data.resetTime) {
        // Reset counter
        data = { count: 1, resetTime: now + oneHourMs };
      } else {
        // Increment counter
        data.count++;
      }
    } else {
      // First request from this IP
      data = { count: 1, resetTime: now + oneHourMs };
    }

    // Store updated data (TTL 1 hour + 1 minute buffer)
    await kv.put(rateLimitKey, JSON.stringify(data), { expirationTtl: 3660 });

    // Check if allowed (max 5 per hour)
    const allowed = data.count <= 5;
    const retryAfter = Math.ceil((data.resetTime - now) / 1000);

    return {
      allowed,
      requestCount: data.count,
      retryAfter,
    };
  } catch (error) {
    // On KV error, allow the request (fail open)
    console.error("Rate limit check failed:", error);
    return {
      allowed: true,
      requestCount: 1,
      retryAfter: 3600,
    };
  }
}

/**
 * POST /register - Generate a new API key
 * Public endpoint (no authentication required)
 * Rate-limited to 5 registrations per IP per hour
 *
 * Request body (optional):
 * {
 *   "name": "friendly-name"  // Optional project/user name
 * }
 *
 * Response (201 Created):
 * {
 *   "api_key": "cm_...",
 *   "message": "Save this key - it cannot be retrieved again",
 *   "created_at": "2024-12-20T12:00:00Z"
 * }
 *
 * Response (429 Too Many Requests):
 * {
 *   "error": "Rate limit exceeded",
 *   "message": "Maximum 5 registrations per hour",
 *   "retry_after": 3600
 * }
 */
export async function handleRegister(c: any): Promise<Response> {
  const ipAddress = getClientIp(c);

  // Check rate limit
  const rateLimit = await checkRateLimit(c.env.CODEMAP_KV, ipAddress);

  if (!rateLimit.allowed) {
    return c.json(
      {
        error: "Rate limit exceeded",
        message: "Maximum 5 registrations per hour per IP address",
        retry_after: rateLimit.retryAfter,
      },
      429,
    );
  }

  try {
    // Generate new API key
    const apiKey = generateApiKey();

    // Hash the key for storage
    const keyHash = await hashApiKey(apiKey);

    // Store key metadata in KV with hash as key
    const createdAt = new Date().toISOString();
    const metadata = {
      created_at: createdAt,
      ip_address: ipAddress,
    };

    // Store with no TTL (keys don't expire unless manually deleted)
    await c.env.CODEMAP_KV.put(
      `apikey:${keyHash}`,
      JSON.stringify(metadata),
    );

    // Return plaintext key (only time it's visible)
    return c.json(
      {
        api_key: apiKey,
        message: "Save this key securely - it cannot be retrieved again",
        created_at: createdAt,
        instructions: {
          upload: `curl -X POST -H "Authorization: Bearer ${apiKey}" -H "Content-Type: application/json" -d @CODE_MAP.json https://codemap-mcp.workers.dev/projects/my-app/code_map`,
          query: `curl -H "Authorization: Bearer ${apiKey}" https://codemap-mcp.workers.dev/mcp`,
        },
      },
      201,
    );
  } catch (error) {
    console.error("Registration error:", error);
    return c.json(
      {
        error: "Registration failed",
        message: "Unable to generate API key at this time",
      },
      500,
    );
  }
}

/**
 * Create register route handler
 * Must be mounted at /register in main router
 */
export const createRegisterRouter = () => {
  const router = new Hono<{ Bindings: Bindings }>();

  router.post("/register", handleRegister);

  return router;
};
