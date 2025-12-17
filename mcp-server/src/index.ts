/**
 * CodeMap MCP Server entry point
 * Runs as a Cloudflare Worker providing MCP tools for dependency analysis
 */

import { Hono } from 'hono';

/**
 * Bindings from Cloudflare Worker environment
 */
type Bindings = {
  CODEMAP_KV: KVNamespace;
  API_KEY: string;
  ENVIRONMENT: string;
};

/**
 * Create and export the Hono application
 */
const app = new Hono<{ Bindings: Bindings }>();

/**
 * Basic health check route
 */
app.get('/health', (c) => {
  return c.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

/**
 * API info route
 */
app.get('/', (c) => {
  return c.json({
    name: 'CodeMap MCP Server',
    version: '1.0.0',
    endpoints: ['/health', '/health/ready', '/mcp', '/projects'],
    environment: c.env.ENVIRONMENT,
  });
});

/**
 * Default export for Cloudflare Workers
 */
export default app;
