/**
 * Shared TypeScript types for CodeMap MCP Server
 * Defines all interfaces used across the Cloudflare Workers application
 */

/**
 * Bindings from Cloudflare Worker environment
 * These are injected by the Cloudflare Workers runtime
 */
export type Bindings = {
  /** KV namespace for storing CODE_MAP.json and cached queries */
  CODEMAP_KV: KVNamespace;
  /** API key for authentication (derived from environment) */
  API_KEY: string;
  /** Environment name: 'development' or 'production' */
  ENVIRONMENT: "development" | "production";
};

/**
 * MCP Request object following JSON-RPC 2.0 specification
 */
export type MCPRequest = {
  jsonrpc: "2.0";
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
};

/**
 * MCP Response object following JSON-RPC 2.0 specification
 */
export type MCPResponse = {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

/**
 * Health check response
 */
export type HealthResponse = {
  status: "healthy" | "not_ready";
  timestamp: string;
  kv?: "connected" | "disconnected";
  environment?: string;
};

/**
 * API info response
 */
export type APIInfoResponse = {
  name: string;
  version: string;
  endpoints: string[];
  environment: string;
};

/**
 * Error response
 */
export type ErrorResponse = {
  error: {
    code: number;
    message: string;
  };
};
